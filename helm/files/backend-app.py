from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import subprocess
import os
import urllib.request
import urllib.error
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
DEFAULT_SPRING_PORT = os.getenv("DEFAULT_SPRING_PORT", "9150")
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


def is_missing_resource_error(detail: str, resource: str) -> bool:
    if not detail:
        return False
    detail_lower = detail.lower()
    resource_lower = resource.lower()
    return f'resource type "{resource_lower}"' in detail_lower or (
        "resource type" in detail_lower and resource_lower in detail_lower
    )


def is_not_found_error(detail: str) -> bool:
    if not detail:
        return False
    detail_lower = detail.lower()
    return "notfound" in detail_lower or "not found" in detail_lower


def raise_structured_error(status_code: int, code: str, message: str, extra=None):
    payload = {"error": code, "message": message}
    if extra:
        payload["extra"] = extra
    raise HTTPException(status_code=status_code, detail=payload)


def build_label_selector(selector) -> str:
    if not selector:
        return ""

    if isinstance(selector, dict) and ("matchLabels" in selector or "matchExpressions" in selector):
        labels = selector.get("matchLabels", {})
        expressions = selector.get("matchExpressions", [])
    else:
        labels = selector if isinstance(selector, dict) else {}
        expressions = []

    parts = []
    for key, value in labels.items():
        if key and value is not None:
            parts.append(f"{key}={value}")

    for expr in expressions:
        if not isinstance(expr, dict):
            continue
        key = expr.get("key")
        operator = expr.get("operator")
        values = expr.get("values", [])
        if not key or not operator:
            continue
        if operator == "In" and values:
            parts.append(f"{key} in ({','.join(values)})")
        elif operator == "NotIn" and values:
            parts.append(f"{key} notin ({','.join(values)})")
        elif operator == "Exists":
            parts.append(key)
        elif operator == "DoesNotExist":
            parts.append(f"!{key}")

    return ",".join(parts)


def get_workload(namespace: str, name: str):
    try:
        deployment = run_oc(["get", "deployment", name, "-n", namespace, "-o", "json"], expect_json=True)
        return "deployment", deployment
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if isinstance(detail, str) and (
            is_not_found_error(detail)
            or is_missing_resource_error(detail, "deployment")
            or is_missing_resource_error(detail, "deployments")
        ):
            pass
        else:
            raise

    try:
        deploymentconfig = run_oc(
            ["get", "deploymentconfig", name, "-n", namespace, "-o", "json"], expect_json=True
        )
        return "deploymentconfig", deploymentconfig
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if isinstance(detail, str) and (
            is_not_found_error(detail)
            or is_missing_resource_error(detail, "deploymentconfigs")
            or is_missing_resource_error(detail, "deploymentconfig")
        ):
            return None, None
        raise


def get_workload_selector(workload: dict, fallback_labels: dict) -> str:
    selector = workload.get("spec", {}).get("selector")
    label_selector = build_label_selector(selector)
    if label_selector:
        return label_selector
    if fallback_labels:
        return build_label_selector(fallback_labels)
    return ""


def get_running_pod(namespace: str, label_selector: str):
    if not label_selector:
        return None
    try:
        data = run_oc(["get", "pods", "-n", namespace, "-l", label_selector, "-o", "json"], expect_json=True)
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if isinstance(detail, str) and is_missing_resource_error(detail, "pods"):
            data = run_oc(["get", "pod", "-n", namespace, "-l", label_selector, "-o", "json"], expect_json=True)
        else:
            raise
    for item in data.get("items", []):
        status = item.get("status", {})
        if status.get("phase") == "Running" and not item.get("metadata", {}).get("deletionTimestamp"):
            return item
    return None


def detect_pod_port(pod: dict):
    containers = pod.get("spec", {}).get("containers", [])
    for container in containers:
        for port_entry in container.get("ports", []) or []:
            container_port = port_entry.get("containerPort")
            if isinstance(container_port, int) and container_port > 0:
                return container_port

    for container in containers:
        for env in container.get("env", []) or []:
            if env.get("name") == "SERVER_PORT" and env.get("value"):
                try:
                    return int(env["value"])
                except ValueError:
                    continue
    return None


def fetch_actuator_env(url: str):
    try:
        request = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=10) as response:
            status_code = response.getcode()
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8") if exc.fp else ""
        raise_structured_error(
            502,
            "actuator_non_200",
            f"Actuator returned HTTP {exc.code}",
            {"status": exc.code, "body": detail},
        )
    except urllib.error.URLError as exc:
        raise_structured_error(502, "actuator_unreachable", f"Actuator endpoint not reachable: {exc.reason}")

    if status_code != 200:
        raise_structured_error(
            502,
            "actuator_non_200",
            f"Actuator returned HTTP {status_code}",
            {"status": status_code, "body": payload},
        )

    try:
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        raise_structured_error(502, "actuator_invalid_json", f"Actuator returned invalid JSON: {str(exc)}")


def normalize_workload(item, kind_label):
    return {
        "name": item.get("metadata", {}).get("name"),
        "namespace": item.get("metadata", {}).get("namespace"),
        "replicas": item.get("spec", {}).get("replicas", 0),
        "kind": kind_label,
    }


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


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
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if isinstance(detail, str) and (
            is_missing_resource_error(detail, "deployments") or is_missing_resource_error(detail, "deployment")
        ):
            return []
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to fetch deployments: {str(exc)}")


@app.get("/api/{namespace}/deploymentconfigs")
async def get_deploymentconfigs(namespace: str):
    try:
        data = run_oc(["get", "deploymentconfigs", "-n", namespace, "-o", "json"], expect_json=True)
        return [normalize_workload(item, "deploymentconfig") for item in data.get("items", [])]
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if isinstance(detail, str) and is_missing_resource_error(detail, "deploymentconfigs"):
            return []
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


@app.get("/api/config/{namespace}/{workloadName}")
async def get_spring_config(namespace: str, workloadName: str):
    try:
        workload_kind, workload = get_workload(namespace, workloadName)
        if not workload:
            raise_structured_error(
                404,
                "workload_not_found",
                f"Workload '{workloadName}' not found in namespace '{namespace}'",
            )

        fallback_labels = (
            workload.get("spec", {}).get("template", {}).get("metadata", {}).get("labels", {})
        )
        label_selector = get_workload_selector(workload, fallback_labels)
        if not label_selector:
            raise_structured_error(
                404,
                "no_label_selector",
                f"No label selector found for workload '{workloadName}'",
            )

        pod = get_running_pod(namespace, label_selector)
        if not pod:
            raise_structured_error(
                404,
                "no_running_pods",
                f"No running pods found for workload '{workloadName}'",
            )

        pod_ip = pod.get("status", {}).get("podIP")
        if not pod_ip:
            raise_structured_error(404, "pod_ip_missing", "Pod IP not available for selected pod")

        port = detect_pod_port(pod)
        if port is None:
            try:
                port = int(DEFAULT_SPRING_PORT)
            except ValueError:
                raise_structured_error(500, "port_not_detected", "Spring Boot port could not be detected")

        actuator_url = f"http://{pod_ip}:{port}/actuator/health/env"
        actuator_payload = fetch_actuator_env(actuator_url)

        return {
            "namespace": namespace,
            "workloadName": workloadName,
            "workloadKind": workload_kind,
            "labelSelector": label_selector,
            "podName": pod.get("metadata", {}).get("name"),
            "podIP": pod_ip,
            "port": port,
            "actuatorUrl": actuator_url,
            "payload": actuator_payload,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load Spring config: {str(exc)}")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "9150"))
    uvicorn.run(app, host="0.0.0.0", port=port)
