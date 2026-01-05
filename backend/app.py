from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import subprocess
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="OpenShift Deployment Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KUBERNETES_API_SERVER = os.getenv("KUBERNETES_API_SERVER", "https://kubernetes.default.svc")
KUBERNETES_TOKEN = os.getenv("KUBERNETES_TOKEN", "")
if not KUBERNETES_TOKEN:
    token_file = "/var/run/secrets/kubernetes.io/serviceaccount/token"
    if os.path.exists(token_file):
        with open(token_file, "r") as f:
            KUBERNETES_TOKEN = f.read().strip()


def oc_base_args():
    return [
        "oc",
        "--server",
        KUBERNETES_API_SERVER,
        "--token",
        KUBERNETES_TOKEN,
        "--insecure-skip-tls-verify=true",
    ]


def run_oc(args, expect_json=False):
    result = subprocess.run(
        oc_base_args() + args,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        status = 403 if "forbidden" in detail.lower() else 500
        raise HTTPException(status_code=status, detail=f"oc error: {detail}")
    if expect_json:
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=500, detail=f"oc output parse error: {str(exc)}")
    return result.stdout


def normalize_workload(item, kind_label):
    return {
        "name": item.get("metadata", {}).get("name"),
        "namespace": item.get("metadata", {}).get("namespace"),
        "replicas": item.get("spec", {}).get("replicas", 0),
        "kind": kind_label,
    }


@app.get("/api/namespaces")
async def get_namespaces():
    try:
        data = run_oc(["get", "projects", "-o", "json"], expect_json=True)
        namespaces = []
        for item in data.get("items", []):
            name = item.get("metadata", {}).get("name")
            if name:
                namespaces.append({"name": name})
        return namespaces
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch namespaces: {str(exc)}")


@app.get("/api/{namespace}/deployments")
async def get_deployments(namespace: str):
    try:
        data = run_oc(["get", "deployments", "-n", namespace, "-o", "json"], expect_json=True)
        return [normalize_workload(item, "deployment") for item in data.get("items", [])]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch deployments: {str(exc)}")


@app.get("/api/{namespace}/deploymentconfigs")
async def get_deploymentconfigs(namespace: str):
    try:
        data = run_oc(["get", "deploymentconfigs", "-n", namespace, "-o", "json"], expect_json=True)
        return [normalize_workload(item, "deploymentconfig") for item in data.get("items", [])]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch deploymentconfigs: {str(exc)}")


class ScaleRequest(BaseModel):
    replicas: int


@app.patch("/api/deployments/{namespace}/{name}/scale")
async def scale_deployment(namespace: str, name: str, request: ScaleRequest):
    try:
        if request.replicas < 0:
            raise HTTPException(status_code=400, detail="Replicas must be >= 0")
        run_oc(
            ["scale", f"deployment/{name}", "-n", namespace, f"--replicas={request.replicas}"],
            expect_json=False,
        )
        return {"success": True, "message": f"Scaled deployment {name} to {request.replicas} replicas"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to scale deployment: {str(exc)}")


@app.patch("/api/deploymentconfigs/{namespace}/{name}/scale")
async def scale_deploymentconfig(namespace: str, name: str, request: ScaleRequest):
    try:
        if request.replicas < 0:
            raise HTTPException(status_code=400, detail="Replicas must be >= 0")
        run_oc(
            ["scale", f"deploymentconfig/{name}", "-n", namespace, f"--replicas={request.replicas}"],
            expect_json=False,
        )
        return {"success": True, "message": f"Scaled deploymentconfig {name} to {request.replicas} replicas"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to scale deploymentconfig: {str(exc)}")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "9150"))
    uvicorn.run(app, host="0.0.0.0", port=port)
