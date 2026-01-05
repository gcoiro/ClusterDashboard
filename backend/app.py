from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import subprocess
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="OpenShift Deployment Dashboard API")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your nginx domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
KUBERNETES_API_SERVER = os.getenv("KUBERNETES_API_SERVER", "https://kubernetes.default.svc")
# In OpenShift, if token is not provided, try to read from service account token file
KUBERNETES_TOKEN = os.getenv("KUBERNETES_TOKEN", "")
if not KUBERNETES_TOKEN:
    # Try to read from service account token (default in OpenShift/Kubernetes pods)
    token_file = "/var/run/secrets/kubernetes.io/serviceaccount/token"
    if os.path.exists(token_file):
        with open(token_file, "r") as f:
            KUBERNETES_TOKEN = f.read().strip()
KUBERNETES_NAMESPACE = os.getenv("KUBERNETES_NAMESPACE", "default")
KUBERNETES_NAMESPACES = os.getenv("KUBERNETES_NAMESPACES", "").strip()


def oc_base_args():
    """Base oc arguments for in-cluster auth."""
    return [
        "oc",
        "--server",
        KUBERNETES_API_SERVER,
        "--token",
        KUBERNETES_TOKEN,
        "--insecure-skip-tls-verify=true",
    ]


def run_oc(args, expect_json=False):
    """Run oc command and optionally parse JSON output."""
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
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=500, detail=f"oc output parse error: {str(e)}")
    return result.stdout


def get_allowed_namespaces():
    """Return an explicit namespace allowlist when configured."""
    if KUBERNETES_NAMESPACES:
        return [ns.strip() for ns in KUBERNETES_NAMESPACES.split(",") if ns.strip()]
    if KUBERNETES_NAMESPACE and KUBERNETES_NAMESPACE != "all":
        return [KUBERNETES_NAMESPACE]
    return []




@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


@app.get("/api/deployments")
async def get_deployments(namespace: str = Query(None, description="Namespace filter (use 'all' for all namespaces)")):
    """Get all deployments, optionally filtered by namespace"""
    try:
        if namespace and namespace != "all":
            data = run_oc(["get", "deployments", "-n", namespace, "-o", "json"], expect_json=True)
        else:
            projects = run_oc(["get", "projects", "-o", "json"], expect_json=True)
            items = []
            for project in projects.get("items", []):
                ns = project.get("metadata", {}).get("name")
                if not ns:
                    continue
                try:
                    ns_data = run_oc(["get", "deployments", "-n", ns, "-o", "json"], expect_json=True)
                except HTTPException as e:
                    if e.status_code == 403:
                        continue
                    raise
                items.extend(ns_data.get("items", []))
            data = {"items": items}

        deployments = []
        for item in data.get("items", []):
            spec_replicas = item.get("spec", {}).get("replicas", 0)
            ready_replicas = item.get("status", {}).get("readyReplicas", 0)
            available_replicas = item.get("status", {}).get("availableReplicas", 0)
            
            deployments.append({
                "name": item["metadata"]["name"],
                "namespace": item["metadata"]["namespace"],
                "replicas": spec_replicas,
                "readyReplicas": ready_replicas,
                "availableReplicas": available_replicas,
                "unavailableReplicas": item.get("status", {}).get("unavailableReplicas", 0),
                "isReady": ready_replicas == spec_replicas and spec_replicas > 0,
                "conditions": item.get("status", {}).get("conditions", []),
            })
        
        return deployments
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch deployments: {str(e)}")


@app.get("/api/deployments/namespaces")
async def get_namespaces():
    """Get all namespaces"""
    try:
        data = run_oc(["get", "projects", "-o", "json"], expect_json=True)
        namespaces = [{"name": item["metadata"]["name"]} for item in data.get("items", [])]
        return namespaces
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch namespaces: {str(e)}")


class ScaleRequest(BaseModel):
    replicas: int


@app.patch("/api/deployments/{namespace}/{name}/scale")
async def scale_deployment(namespace: str, name: str, request: ScaleRequest):
    """Scale a deployment to a specific number of replicas"""
    try:
        if request.replicas < 0:
            raise HTTPException(status_code=400, detail="Replicas must be >= 0")
        
        run_oc(
            ["scale", f"deployment/{name}", "-n", namespace, f"--replicas={request.replicas}"],
            expect_json=False,
        )
        
        return {"success": True, "message": f"Scaled {name} to {request.replicas} replicas"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scale deployment: {str(e)}")


@app.post("/api/deployments/{namespace}/{name}/restart")
async def restart_deployment(namespace: str, name: str):
    """Restart a deployment (rollout restart)"""
    try:
        run_oc(
            ["rollout", "restart", f"deployment/{name}", "-n", namespace],
            expect_json=False,
        )
        
        return {"success": True, "message": f"Restarted deployment {name}"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to restart deployment: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "9150"))
    uvicorn.run(app, host="0.0.0.0", port=port)

