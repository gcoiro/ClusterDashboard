from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
import csv
import io
import subprocess
import os
import urllib.request
import urllib.error
import urllib.parse
import re
import asyncio
from dotenv import load_dotenv
import logging
import time
import redis
import yaml

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
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
SPRING_CONFIG_AGENT_ENABLED = os.getenv("SPRING_CONFIG_AGENT_ENABLED", "false").lower() in ("1", "true", "yes")
SPRING_CONFIG_AGENT_JAR_PATH = os.getenv(
    "SPRING_CONFIG_AGENT_JAR_PATH",
    "/opt/spring-config-agent/spring-config-agent.jar",
)
SPRING_CONFIG_AGENT_OUTPUT_DIR = os.getenv(
    "SPRING_CONFIG_AGENT_OUTPUT_DIR",
    "/tmp/spring-config-agent",
)
REDIS_HOST = os.getenv("REDIS_HOST")
try:
    REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
except ValueError:
    REDIS_PORT = 6379
try:
    REDIS_DB = int(os.getenv("REDIS_DB", "0"))
except ValueError:
    REDIS_DB = 0
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")
REDIS_SSL = os.getenv("REDIS_SSL", "false").lower() in ("1", "true", "yes")
try:
    CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "20"))
except ValueError:
    CACHE_TTL_SECONDS = 20
if CACHE_TTL_SECONDS < 0:
    CACHE_TTL_SECONDS = 0
try:
    CONFIG_REPORT_CONCURRENCY = int(os.getenv("CONFIG_REPORT_CONCURRENCY", "6"))
except ValueError:
    CONFIG_REPORT_CONCURRENCY = 6
if CONFIG_REPORT_CONCURRENCY < 1:
    CONFIG_REPORT_CONCURRENCY = 1
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s [thread=%(threadName)s:%(thread)d]: %(message)s",
)
logger = logging.getLogger("openshift-dashboard")
token_source = "env"
if not KUBERNETES_TOKEN:
    token_file = "/var/run/secrets/kubernetes.io/serviceaccount/token"
    if os.path.exists(token_file):
        with open(token_file, "r") as f:
            KUBERNETES_TOKEN = f.read().strip()
            token_source = "serviceaccount"
logger.info("API server: %s", KUBERNETES_API_SERVER)
logger.info("Token source: %s", token_source)
logger.info("Cache TTL: %ss", CACHE_TTL_SECONDS)
logger.info("Redis enabled: %s", "yes" if REDIS_HOST else "no")
logger.info("Spring config agent enabled: %s", "yes" if SPRING_CONFIG_AGENT_ENABLED else "no")

_actuator_cache = {}
_redis_client = None


def get_redis_client():
    global _redis_client
    if not REDIS_HOST:
        return None
    if _redis_client is None:
        _redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            db=REDIS_DB,
            password=REDIS_PASSWORD or None,
            ssl=REDIS_SSL,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    return _redis_client




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
    logger.debug("oc %s", " ".join(args))
    result = subprocess.run(
        oc_base_args() + args,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        logger.error("oc error (%s): %s", " ".join(args), detail)
        status = 403 if "forbidden" in detail.lower() else 500
        raise HTTPException(status_code=status, detail=f"oc error: {detail}")
    if expect_json:
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            logger.error("oc json parse error (%s): %s", " ".join(args), str(exc))
            raise HTTPException(status_code=500, detail=f"oc output parse error: {str(exc)}")
    return result.stdout


def run_oc_input(args, input_data, expect_json=False):
    logger.debug("oc %s", " ".join(args))
    result = subprocess.run(
        oc_base_args() + args,
        input=input_data,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        logger.error("oc error (%s): %s", " ".join(args), detail)
        status = 403 if "forbidden" in detail.lower() else 500
        raise HTTPException(status_code=status, detail=f"oc error: {detail}")
    if expect_json:
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            logger.error("oc json parse error (%s): %s", " ".join(args), str(exc))
            raise HTTPException(status_code=500, detail=f"oc output parse error: {str(exc)}")
    return result.stdout


def run_oc_with_timeout(args, timeout_seconds=30, expect_json=False):
    logger.debug("oc %s", " ".join(args))
    result = subprocess.run(
        oc_base_args() + args,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        logger.error("oc error (%s): %s", " ".join(args), detail)
        status = 403 if "forbidden" in detail.lower() else 500
        raise HTTPException(status_code=status, detail=f"oc error: {detail}")
    if expect_json:
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            logger.error("oc json parse error (%s): %s", " ".join(args), str(exc))
            raise HTTPException(status_code=500, detail=f"oc output parse error: {str(exc)}")
    return result.stdout


def run_oc_capture(args, timeout_seconds=30):
    logger.debug("oc %s", " ".join(args))
    return subprocess.run(
        oc_base_args() + args,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )


def run_oc_allow_timeout(args, timeout_seconds=15):
    logger.debug("oc %s", " ".join(args))
    try:
        result = subprocess.run(
            oc_base_args() + args,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        logger.warning("oc command timed out (continuing): %s", " ".join(args))
        return None
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        logger.error("oc error (%s): %s", " ".join(args), detail)
        status = 403 if "forbidden" in detail.lower() else 500
        raise HTTPException(status_code=status, detail=f"oc error: {detail}")
    return result.stdout


def truncate_log(text: str, limit: int = 8000) -> str:
    if not text:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + "\n...[truncated]"


def run_oc_raw(path: str, expect_json=False):
    logger.debug("oc get --raw %s", path)
    result = subprocess.run(
        oc_base_args() + ["get", "--raw", path],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        logger.error("oc raw error (%s): %s", path, detail)
        status = 403 if "forbidden" in detail.lower() else 500
        raise HTTPException(status_code=status, detail=f"oc error: {detail}")
    if expect_json:
        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            logger.error("oc raw json parse error (%s): %s", path, str(exc))
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


def build_resource_map(items):
    resource_map = {}
    for item in items or []:
        name = item.get("metadata", {}).get("name")
        if name:
            resource_map[name] = item
    return resource_map


def get_deployment_maps(namespace: str):
    deployments = {}
    deploymentconfigs = {}

    try:
        data = run_oc(["get", "deployments", "-n", namespace, "-o", "json"], expect_json=True)
        deployments = build_resource_map(data.get("items", []))
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if not (isinstance(detail, str) and (
            is_missing_resource_error(detail, "deployments") or is_missing_resource_error(detail, "deployment")
        )):
            raise

    try:
        data = run_oc(["get", "deploymentconfigs", "-n", namespace, "-o", "json"], expect_json=True)
        deploymentconfigs = build_resource_map(data.get("items", []))
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if not (isinstance(detail, str) and (
            is_missing_resource_error(detail, "deploymentconfigs")
            or is_missing_resource_error(detail, "deploymentconfig")
        )):
            raise

    return deployments, deploymentconfigs


def get_workload(namespace: str, name: str):
    logger.info("Resolving workload %s in namespace %s", name, namespace)
    deployments, deploymentconfigs = get_deployment_maps(namespace)
    if name in deployments:
        return "deployment", deployments[name]
    if name in deploymentconfigs:
        return "deploymentconfig", deploymentconfigs[name]
    return None, None


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
    logger.info("Finding running pod in %s with selector %s", namespace, label_selector)
    try:
        data = run_oc(["get", "pods", "-n", namespace, "-l", label_selector, "-o", "json"], expect_json=True)
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if isinstance(detail, str) and is_missing_resource_error(detail, "pods"):
            logger.warning("pods resource missing, falling back to pod")
            try:
                data = run_oc(["get", "pod", "-n", namespace, "-l", label_selector, "-o", "json"], expect_json=True)
            except HTTPException as inner_exc:
                inner_detail = getattr(inner_exc, "detail", "")
                if isinstance(inner_detail, str) and is_missing_resource_error(inner_detail, "pod"):
                    logger.warning("pod resource missing, falling back to raw API")
                    query = urllib.parse.urlencode({"labelSelector": label_selector})
                    data = run_oc_raw(f"/api/v1/namespaces/{namespace}/pods?{query}", expect_json=True)
                else:
                    raise
        else:
            raise
    for item in data.get("items", []):
        status = item.get("status", {})
        if status.get("phase") == "Running" and not item.get("metadata", {}).get("deletionTimestamp"):
            return item
    return None


def is_pod_ready(pod: dict) -> bool:
    status = pod.get("status", {}) or {}
    if status.get("phase") != "Running":
        return False
    if pod.get("metadata", {}).get("deletionTimestamp"):
        return False
    for condition in status.get("conditions", []) or []:
        if condition.get("type") == "Ready" and condition.get("status") == "True":
            return True
    return False


def count_ready_pods(namespace: str, label_selector: str) -> int:
    if not label_selector:
        return 0
    data = run_oc(["get", "pods", "-n", namespace, "-l", label_selector, "-o", "json"], expect_json=True)
    ready = 0
    for pod in data.get("items", []) or []:
        if is_pod_ready(pod):
            ready += 1
    return ready


def count_pod_restarts(namespace: str, label_selector: str) -> int:
    if not label_selector:
        return 0
    data = run_oc(["get", "pods", "-n", namespace, "-l", label_selector, "-o", "json"], expect_json=True)
    total = 0
    for pod in data.get("items", []) or []:
        statuses = pod.get("status", {}).get("containerStatuses", []) or []
        for status in statuses:
            try:
                total += int(status.get("restartCount", 0))
            except (TypeError, ValueError):
                continue
    return total


def select_target_pod(pods):
    if not pods:
        return None

    def is_ready(pod):
        return is_pod_ready(pod)

    def creation_ts(pod):
        return pod.get("metadata", {}).get("creationTimestamp", "")

    not_ready = [pod for pod in pods if not is_ready(pod)]
    candidates = not_ready if not_ready else pods
    candidates.sort(key=creation_ts, reverse=True)
    return candidates[0]


def wait_for_pod_running(namespace: str, pod_name: str, timeout_seconds=60):
    timeout_arg = f"{max(1, int(timeout_seconds))}s"
    try:
        run_oc([
            "wait",
            "--for=condition=Ready",
            f"pod/{pod_name}",
            "-n",
            namespace,
            f"--timeout={timeout_arg}",
        ])
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        message = detail if isinstance(detail, str) else "Timed out waiting for debug pod readiness"
        raise HTTPException(status_code=504, detail=message)
    return run_oc(["get", "pod", pod_name, "-n", namespace, "-o", "json"], expect_json=True)


def build_debug_pod_manifest(
    namespace: str,
    workload_kind: str,
    workload_name: str,
    debug_pod_name: str,
    image: str,
) -> dict:
    debug_spec = run_oc(
        [
            "debug",
            f"{workload_kind}/{workload_name}",
            "-n",
            namespace,
            "--image",
            image,
            "-o",
            "json",
            "--",
            "/bin/sh",
            "-c",
            "sleep 3600",
        ],
        expect_json=True,
    )
    metadata = debug_spec.get("metadata", {}) or {}
    metadata["name"] = debug_pod_name
    metadata["namespace"] = namespace
    for key in (
        "uid",
        "resourceVersion",
        "generation",
        "creationTimestamp",
        "managedFields",
    ):
        metadata.pop(key, None)
    metadata.pop("generateName", None)
    debug_spec["metadata"] = metadata
    return debug_spec


def apply_debug_pod(manifest: dict):
    payload = json.dumps(manifest)
    return run_oc_input(["apply", "-f", "-"], payload)


def get_services_map(namespace: str):
    try:
        data = run_oc(["get", "services", "-n", namespace, "-o", "json"], expect_json=True)
        return build_resource_map(data.get("items", []))
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if isinstance(detail, str) and (
            is_missing_resource_error(detail, "services") or is_missing_resource_error(detail, "service")
        ):
            return {}
        raise


def get_service_by_name(namespace: str, service_name: str, services_map=None):
    if not service_name:
        return None
    if services_map is None:
        services_map = get_services_map(namespace)
    return services_map.get(service_name)


def resolve_service_port(service: dict):
    ports = service.get("spec", {}).get("ports", []) or []
    for port_entry in ports:
        port = port_entry.get("port")
        if isinstance(port, int) and port > 0:
            return port
    return None


def detect_pod_port(pod: dict):
    containers = pod.get("spec", {}).get("containers", [])
    for container in containers:
        for port_entry in container.get("ports", []) or []:
            container_port = port_entry.get("containerPort")
            if isinstance(container_port, int) and container_port > 0:
                logger.info("Detected containerPort %s", container_port)
                return container_port

    for container in containers:
        for env in container.get("env", []) or []:
            if env.get("name") == "SERVER_PORT" and env.get("value"):
                try:
                    logger.info("Detected SERVER_PORT %s", env["value"])
                    return int(env["value"])
                except ValueError:
                    continue
    return None


def resolve_named_port(port_value, container: dict):
    if isinstance(port_value, int) and port_value > 0:
        return port_value
    if isinstance(port_value, str):
        if port_value.isdigit():
            return int(port_value)
        for port_entry in container.get("ports", []) or []:
            if port_entry.get("name") == port_value:
                container_port = port_entry.get("containerPort")
                if isinstance(container_port, int) and container_port > 0:
                    return container_port
    return None


def resolve_probe_port(workload: dict):
    if not workload or not isinstance(workload, dict):
        return None
    template = workload.get("spec", {}).get("template", {}) or {}
    containers = template.get("spec", {}).get("containers", []) or []

    def probe_port(container: dict, probe: dict):
        if not isinstance(probe, dict):
            return None
        for key in ("httpGet", "tcpSocket"):
            probe_spec = probe.get(key)
            if isinstance(probe_spec, dict):
                port_value = probe_spec.get("port")
                port = resolve_named_port(port_value, container)
                if port:
                    return port
        return None

    for container in containers:
        port = probe_port(container, container.get("readinessProbe"))
        if port:
            return port
    for container in containers:
        port = probe_port(container, container.get("livenessProbe"))
        if port:
            return port
    return None


def get_workload_resource(workload: dict):
    if not isinstance(workload, dict):
        return None
    resource = workload.get("resource")
    if isinstance(resource, dict):
        return resource
    if "spec" in workload:
        return workload
    return None


def extract_configmap_names_from_pod_spec(pod_spec: dict):
    names = set()
    if not isinstance(pod_spec, dict):
        return names

    def add_name(value):
        if isinstance(value, str) and value.strip():
            names.add(value.strip())

    for volume in pod_spec.get("volumes", []) or []:
        if not isinstance(volume, dict):
            continue
        config_map = volume.get("configMap")
        if isinstance(config_map, dict):
            add_name(config_map.get("name"))
        projected = volume.get("projected")
        if isinstance(projected, dict):
            for source in projected.get("sources", []) or []:
                if not isinstance(source, dict):
                    continue
                projected_map = source.get("configMap")
                if isinstance(projected_map, dict):
                    add_name(projected_map.get("name"))

    containers = (pod_spec.get("containers", []) or []) + (pod_spec.get("initContainers", []) or [])
    for container in containers:
        if not isinstance(container, dict):
            continue
        for env_from in container.get("envFrom", []) or []:
            if not isinstance(env_from, dict):
                continue
            config_map_ref = env_from.get("configMapRef")
            if isinstance(config_map_ref, dict):
                add_name(config_map_ref.get("name"))
        for env in container.get("env", []) or []:
            if not isinstance(env, dict):
                continue
            value_from = env.get("valueFrom") or {}
            if not isinstance(value_from, dict):
                continue
            config_map_key_ref = value_from.get("configMapKeyRef")
            if isinstance(config_map_key_ref, dict):
                add_name(config_map_key_ref.get("name"))

    return names


def extract_configmap_names_from_workload(workload_resource: dict):
    if not isinstance(workload_resource, dict):
        return []
    template = workload_resource.get("spec", {}).get("template", {}) or {}
    pod_spec = template.get("spec", {}) or {}
    names = extract_configmap_names_from_pod_spec(pod_spec)
    return sorted(names)


def fetch_configmap(namespace: str, name: str):
    result = run_oc_capture(["get", "configmap", name, "-n", namespace, "-o", "json"], timeout_seconds=20)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        if is_not_found_error(detail):
            return None
        status = 403 if "forbidden" in detail.lower() else 500
        raise HTTPException(status_code=status, detail=f"oc error: {detail}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        logger.error("oc json parse error (configmap %s): %s", name, str(exc))
        raise HTTPException(status_code=500, detail=f"oc output parse error: {str(exc)}")


def find_configmap_matches(configmap: dict, regex):
    matches = []
    unknown_files = []
    if not isinstance(configmap, dict):
        return matches, unknown_files
    name = configmap.get("metadata", {}).get("name") or ""
    data = configmap.get("data", {}) or {}
    if not isinstance(data, dict):
        return matches, unknown_files
    debug_enabled = logger.isEnabledFor(logging.DEBUG)

    def walk_json(node, path="$"):
        found = []
        if isinstance(node, dict):
            for key, value in node.items():
                key_path = f"{path}.{key}"
                found.append(("key", key, key_path))
                found.extend(walk_json(value, key_path))
        elif isinstance(node, list):
            for idx, item in enumerate(node):
                found.extend(walk_json(item, f"{path}[{idx}]"))
        else:
            found.append(("value", stringify_property_value(node), path))
        return found

    def try_parse_json(text: str):
        if not isinstance(text, str):
            return None
        stripped = text.strip()
        if not stripped:
            return None
        if stripped[0] not in ("{", "["):
            return None
        if len(stripped) > 200000:
            return None
        try:
            return json.loads(stripped)
        except Exception:
            return None

    def try_parse_yaml(text: str, key_name: str):
        if not isinstance(text, str):
            return None
        if key_name and not key_name.lower().endswith((".yml", ".yaml")):
            return None
        stripped = text.strip()
        if not stripped:
            return None
        if len(stripped) > 200000:
            return None
        try:
            return yaml.safe_load(stripped)
        except Exception:
            return None

    def try_parse_properties(text: str, key_name: str):
        if not isinstance(text, str):
            return None
        if key_name and not key_name.lower().endswith(".properties"):
            return None
        stripped = text.strip()
        if not stripped:
            return None
        if len(stripped) > 200000:
            return None
        parsed = {}
        for line in stripped.splitlines():
            raw = line.strip()
            if not raw or raw.startswith(("#", ";", "!")):
                continue
            if "=" in raw:
                key, value = raw.split("=", 1)
            elif ":" in raw:
                key, value = raw.split(":", 1)
            else:
                continue
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                parsed[key] = value
        return parsed if parsed else None

    def try_parse_ini(text: str, key_name: str):
        if not isinstance(text, str):
            return None
        if key_name and not key_name.lower().endswith(".ini"):
            return None
        stripped = text.strip()
        if not stripped:
            return None
        if len(stripped) > 200000:
            return None
        parsed = {}
        section = None
        for line in stripped.splitlines():
            raw = line.strip()
            if not raw or raw.startswith(("#", ";")):
                continue
            if raw.startswith("[") and raw.endswith("]") and len(raw) > 2:
                section = raw[1:-1].strip()
                if section and section not in parsed:
                    parsed[section] = {}
                continue
            if "=" in raw:
                key, value = raw.split("=", 1)
            elif ":" in raw:
                key, value = raw.split(":", 1)
            else:
                continue
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if not key:
                continue
            if section:
                if section not in parsed:
                    parsed[section] = {}
                parsed[section][key] = value
            else:
                parsed[key] = value
        return parsed if parsed else None

    def try_parse_conf(text: str, key_name: str):
        if not isinstance(text, str):
            return None
        if key_name and not key_name.lower().endswith(".conf"):
            return None
        stripped = text.strip()
        if not stripped:
            return None
        if len(stripped) > 200000:
            return None
        parsed = {}
        for line in stripped.splitlines():
            raw = line.strip()
            if not raw or raw.startswith(("#", ";")):
                continue
            if "=" in raw:
                key, value = raw.split("=", 1)
            elif ":" in raw:
                key, value = raw.split(":", 1)
            else:
                continue
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                parsed[key] = value
        return parsed if parsed else None

    def try_parse_js(text: str, key_name: str):
        if not isinstance(text, str):
            return None
        if key_name and not key_name.lower().endswith(".js"):
            return None
        stripped = text.strip()
        if not stripped:
            return None
        if len(stripped) > 200000:
            return None
        parsed = {}
        for line in stripped.splitlines():
            raw = line.strip()
            if not raw or raw.startswith(("//", "/*", "*", "#")):
                continue
            if "=" in raw and raw.count("=") >= 1:
                key, value = raw.split("=", 1)
            elif ":" in raw:
                key, value = raw.split(":", 1)
            else:
                continue
            key = key.strip().strip(";")
            value = value.strip().strip(";").strip('"').strip("'")
            if key and value:
                parsed[key] = value
        return parsed if parsed else None

    def try_parse_xml(text: str, key_name: str):
        if not isinstance(text, str):
            return None
        if key_name and not key_name.lower().endswith(".xml"):
            return None
        stripped = text.strip()
        if not stripped:
            return None
        if len(stripped) > 200000:
            return None
        try:
            import xml.etree.ElementTree as ET
            root = ET.fromstring(stripped)
        except Exception:
            return None

        def element_to_dict(element):
            node = {
                "tag": element.tag,
                "attributes": element.attrib or {},
            }
            text_value = (element.text or "").strip()
            if text_value:
                node["text"] = text_value
            children = [element_to_dict(child) for child in list(element)]
            if children:
                node["children"] = children
            return node

        return element_to_dict(root)

    def extract_candidates(text: str):
        candidates = set()
        if not text:
            return []
        for match in re.finditer(r'"([^"\\]*(?:\\.[^"\\]*)*)"', text):
            token = match.group(1)
            if token:
                candidates.add(token)
        for match in re.finditer(r"'([^'\\]*(?:\\.[^'\\]*)*)'", text):
            token = match.group(1)
            if token:
                candidates.add(token)
        for match in re.finditer(r"https?://[^\s\"'>)]+", text):
            token = match.group(0)
            if token:
                candidates.add(token)
        return list(candidates)

    def extract_hostnames(value: str):
        if not isinstance(value, str) or not value:
            return []
        value = value.strip().strip('"').strip("'")
        if not value:
            return []
        hostnames = []
        try:
            parsed = urllib.parse.urlparse(value)
        except Exception:
            parsed = None
        if parsed and parsed.hostname:
            hostnames.append(parsed.hostname.strip())
        for chunk in re.split(r"[,\s]+", value):
            if not chunk:
                continue
            chunk = chunk.strip().strip('"').strip("'")
            if not chunk:
                continue
            if "://" in chunk:
                try:
                    parsed_chunk = urllib.parse.urlparse(chunk)
                    if parsed_chunk.hostname:
                        hostnames.append(parsed_chunk.hostname.strip())
                        continue
                except Exception:
                    pass
            chunk = chunk.split("/", 1)[0]
            if ":" in chunk:
                host_part = chunk.split(":", 1)[0]
            else:
                host_part = chunk
            if "." in host_part:
                hostnames.append(host_part.strip())
        seen = set()
        ordered = []
        for host in hostnames:
            if host and host not in seen:
                seen.add(host)
                ordered.append(host)
        return ordered

    def process_entries(entries, kind_label, key_name):
        matched_any = False
        if debug_enabled:
            logger.debug("Configmap %s key=%s %s_entries=%s", name, key_name, kind_label, len(entries))
        for kind, token, path in entries:
            if not token:
                continue
            matched_token = token
            if regex.search(token) is None:
                hostnames = extract_hostnames(token)
                matched_host = ""
                for host in hostnames:
                    if regex.search(host) is not None:
                        matched_host = host
                        break
                if not matched_host:
                    if debug_enabled:
                        logger.debug(
                            "Configmap %s key=%s %s_no_match path=%s token=%s hostname=%s",
                            name,
                            key_name,
                            kind_label,
                            path,
                            token,
                            "",
                        )
                    continue
                matched_token = matched_host
            if debug_enabled:
                logger.debug(
                    "Configmap %s key=%s %s_match path=%s token=%s matched=%s",
                    name,
                    key_name,
                    kind_label,
                    path,
                    token,
                    matched_token,
                )
            matches.append({
                "configMap": name,
                "key": key_name,
                "value": matched_token,
                "matchOn": f"{kind_label}-{kind}",
                "path": path,
            })
            matched_any = True
        return matched_any

    for key, value in data.items():
        value_text = stringify_property_value(value)
        if debug_enabled:
            logger.debug(
                "Configmap %s key=%s value_len=%s",
                name,
                key,
                len(value_text) if isinstance(value_text, str) else 0,
            )

        matched_any = False
        parsed_yaml = try_parse_yaml(value_text, key)
        parsed_json = None
        if parsed_yaml is not None:
            if debug_enabled:
                logger.debug("Configmap %s key=%s parsed_as=yaml", name, key)
            matched_any = process_entries(walk_json(parsed_yaml), "yaml", key)
            if matched_any:
                continue

        parsed_xml = try_parse_xml(value_text, key)
        if parsed_xml is not None:
            if debug_enabled:
                logger.debug("Configmap %s key=%s parsed_as=xml", name, key)
            matched_any = process_entries(walk_json(parsed_xml), "xml", key)
            if matched_any:
                continue

        parsed_properties = try_parse_properties(value_text, key)
        if parsed_properties is not None:
            if debug_enabled:
                logger.debug("Configmap %s key=%s parsed_as=properties", name, key)
            matched_any = process_entries(walk_json(parsed_properties), "properties", key)
            if matched_any:
                continue

        parsed_ini = try_parse_ini(value_text, key)
        if parsed_ini is not None:
            if debug_enabled:
                logger.debug("Configmap %s key=%s parsed_as=ini", name, key)
            matched_any = process_entries(walk_json(parsed_ini), "ini", key)
            if matched_any:
                continue

        parsed_conf = try_parse_conf(value_text, key)
        if parsed_conf is not None:
            if debug_enabled:
                logger.debug("Configmap %s key=%s parsed_as=conf", name, key)
            matched_any = process_entries(walk_json(parsed_conf), "conf", key)
            if matched_any:
                continue

        parsed_js = try_parse_js(value_text, key)
        if parsed_js is not None:
            if debug_enabled:
                logger.debug("Configmap %s key=%s parsed_as=js", name, key)
            matched_any = process_entries(walk_json(parsed_js), "js", key)
            if matched_any:
                continue

        parsed_json = try_parse_json(value_text)
        if parsed_json is not None:
            if debug_enabled:
                logger.debug("Configmap %s key=%s parsed_as=json", name, key)
            matched_any = process_entries(walk_json(parsed_json), "json", key)
            if matched_any:
                continue

        if isinstance(key, str) and "." in key:
            ext = key.rsplit(".", 1)[-1].lower()
            if ext and ext not in ("json", "yaml", "yml", "xml", "conf", "js", "properties", "ini"):
                unknown_files.append({
                    "configMap": name,
                    "key": key,
                    "extension": ext,
                })

        if regex.search(value_text) is not None:
            if debug_enabled:
                logger.debug("Configmap %s key=%s value_match=full", name, key)
            matches.append({
                "configMap": name,
                "key": key,
                "value": value_text,
                "matchOn": "value",
            })
            continue

        for candidate in extract_candidates(value_text):
            matched_candidate = candidate
            if regex.search(candidate) is None:
                hostnames = extract_hostnames(candidate)
                matched_host = ""
                for host in hostnames:
                    if regex.search(host) is not None:
                        matched_host = host
                        break
                if not matched_host:
                    if debug_enabled:
                        logger.debug(
                            "Configmap %s key=%s fragment_no_match candidate=%s hostname=%s",
                            name,
                            key,
                            candidate,
                            "",
                        )
                    continue
                matched_candidate = matched_host
            if debug_enabled:
                logger.debug(
                    "Configmap %s key=%s fragment_match candidate=%s matched=%s",
                    name,
                    key,
                    candidate,
                    matched_candidate,
                )
            matches.append({
                "configMap": name,
                "key": key,
                "value": matched_candidate,
                "matchOn": "value-fragment",
            })
    return matches, unknown_files


def fetch_actuator_env(url: str):
    logger.info("Fetching actuator env %s", url)
    if CACHE_TTL_SECONDS > 0:
        cache_key = f"actuator-env:{url}"
        redis_client = get_redis_client()
        if redis_client is not None:
            try:
                cached_payload = redis_client.get(cache_key)
                if cached_payload:
                    logger.info("Actuator cache hit (redis) %s", url)
                    return json.loads(cached_payload.decode("utf-8"))
            except redis.RedisError as exc:
                logger.warning("Redis cache read failed: %s", str(exc))
            except json.JSONDecodeError:
                logger.warning("Redis cache payload invalid, ignoring")
        else:
            cached = _actuator_cache.get(cache_key)
            if cached:
                expires_at, payload = cached
                if time.time() < expires_at:
                    logger.info("Actuator cache hit (memory) %s", url)
                    return payload
                _actuator_cache.pop(cache_key, None)

    try:
        request = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=10) as response:
            status_code = response.getcode()
            payload = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8") if exc.fp else ""
        logger.error("Actuator HTTP error %s: %s", exc.code, detail)
        raise_structured_error(
            502,
            "actuator_non_200",
            f"Actuator returned HTTP {exc.code}",
            {"status": exc.code, "body": detail},
        )
    except urllib.error.URLError as exc:
        logger.error("Actuator unreachable: %s", exc.reason)
        raise_structured_error(502, "actuator_unreachable", f"Actuator endpoint not reachable: {exc.reason}")

    if status_code != 200:
        logger.error("Actuator non-200 %s", status_code)
        raise_structured_error(
            502,
            "actuator_non_200",
            f"Actuator returned HTTP {status_code}",
            {"status": status_code, "body": payload},
        )

    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError as exc:
        logger.error("Actuator JSON parse error: %s", str(exc))
        raise_structured_error(502, "actuator_invalid_json", f"Actuator returned invalid JSON: {str(exc)}")
    if CACHE_TTL_SECONDS > 0:
        cache_key = f"actuator-env:{url}"
        redis_client = get_redis_client()
        if redis_client is not None:
            try:
                redis_client.setex(cache_key, CACHE_TTL_SECONDS, payload.encode("utf-8"))
            except redis.RedisError as exc:
                logger.warning("Redis cache write failed: %s", str(exc))
        else:
            _actuator_cache[cache_key] = (time.time() + CACHE_TTL_SECONDS, parsed)
    return parsed


def normalize_workload(item, kind_label):
    return {
        "name": item.get("metadata", {}).get("name"),
        "namespace": item.get("metadata", {}).get("namespace"),
        "replicas": item.get("spec", {}).get("replicas", 0),
        "kind": kind_label,
    }


def normalize_workload_kind(kind: Optional[str]):
    if not kind:
        return None
    normalized = kind.lower()
    if normalized in ("deploymentconfig", "deploymentconfigs", "dc"):
        return "deploymentconfig"
    if normalized in ("deployment", "deployments", "deploy"):
        return "deployment"
    return None


def extract_env_details(payload):
    if not payload or not isinstance(payload, dict):
        return [], []

    if "propertySources" in payload:
        return payload.get("propertySources", []) or [], payload.get("activeProfiles", []) or []

    details = payload.get("details")
    if isinstance(details, dict) and "propertySources" in details:
        return details.get("propertySources", []) or [], details.get("activeProfiles", []) or []

    components = payload.get("components")
    if isinstance(components, dict):
        env = components.get("env")
        if isinstance(env, dict):
            env_details = env.get("details")
            if isinstance(env_details, dict) and "propertySources" in env_details:
                return env_details.get("propertySources", []) or [], env_details.get("activeProfiles", []) or []

    return [], []


def build_effective_key_map(property_sources):
    key_to_source = {}
    for source in property_sources:
        properties = source.get("properties", {}) or {}
        source_name = source.get("name") or "propertySource"
        for key in properties.keys():
            if key in key_to_source:
                continue
            key_to_source[key] = source_name
    return key_to_source


def normalize_property_value(value):
    if isinstance(value, dict) and "value" in value:
        return value.get("value")
    return value


def stringify_property_value(value):
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        try:
            return json.dumps(value)
        except TypeError:
            return str(value)
    return str(value)


def build_effective_entries(property_sources):
    entries = {}
    for source in property_sources:
        properties = source.get("properties", {}) or {}
        source_name = source.get("name") or "propertySource"
        for key, value in properties.items():
            if key in entries:
                continue
            entries[key] = {
                "source": source_name,
                "value": normalize_property_value(value),
            }
    return entries


def list_workloads(namespace: str):
    workloads = []
    try:
        data = run_oc(["get", "deployments", "-n", namespace, "-o", "json"], expect_json=True)
        for item in data.get("items", []) or []:
            entry = normalize_workload(item, "deployment")
            entry["resource"] = item
            workloads.append(entry)
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if not (isinstance(detail, str) and (
            is_missing_resource_error(detail, "deployments") or is_missing_resource_error(detail, "deployment")
        )):
            raise

    try:
        data = run_oc(["get", "deploymentconfigs", "-n", namespace, "-o", "json"], expect_json=True)
        for item in data.get("items", []) or []:
            entry = normalize_workload(item, "deploymentconfig")
            entry["resource"] = item
            workloads.append(entry)
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if not (isinstance(detail, str) and is_missing_resource_error(detail, "deploymentconfigs")):
            raise

    return workloads


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


class ExposeActuatorRequest(BaseModel):
    workloadKind: Optional[str] = None


class ApplySpringConfigAgentRequest(BaseModel):
    workloadKind: Optional[str] = None
    includeLogs: Optional[bool] = False


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


@app.get("/api/config/{namespace}/report")
async def get_spring_config_report(
    namespace: str,
    pattern: str,
    caseInsensitive: bool = False,
    searchIn: str = "value",
):
    return await build_config_report(namespace, pattern, caseInsensitive, searchIn)


def process_report_workload(namespace: str, workload: dict, regex, search_in: str, services_map: dict):
    workload_name = workload.get("name")
    workload_kind = workload.get("kind")
    if not workload_name:
        return None, None
    logger.info("Config report workload=%s kind=%s", workload_name, workload_kind)

    try:
        workload_resource = get_workload_resource(workload)
        service = get_service_by_name(namespace, workload_name, services_map)
        if not service:
            logger.warning("Config report skip=%s reason=service_not_found", workload_name)
            return None, {
                "workloadName": workload_name,
                "workloadKind": workload_kind,
                "message": "No matching service found",
            }

        port = resolve_probe_port(workload_resource)
        if port is None:
            port = resolve_service_port(service)
        if port is None:
            logger.warning("Config report skip=%s reason=service_port_missing", workload_name)
            return None, {
                "workloadName": workload_name,
                "workloadKind": workload_kind,
                "message": "Matching service has no port",
            }

        service_name = service.get("metadata", {}).get("name") or workload_name
        service_host = f"{service_name}.{namespace}.svc.cluster.local"
        actuator_url = f"http://{service_host}:{port}/actuator/env"
        logger.info("Config report actuator=%s", actuator_url)
        actuator_payload = fetch_actuator_env(actuator_url)

        property_sources, _ = extract_env_details(actuator_payload)
        effective_entries = build_effective_entries(property_sources)
        logger.info(
            "Config report workload=%s propertySources=%s effectiveKeys=%s",
            workload_name,
            len(property_sources),
            len(effective_entries),
        )

        matched_keys = []
        for key, entry in effective_entries.items():
            value_text = stringify_property_value(entry.get("value"))
            matches_value = regex.search(value_text) is not None

            if search_in == "value" and not matches_value:
                continue

            matched_keys.append({
                "key": key,
                "source": entry.get("source"),
                "matchOn": "value",
                "value": stringify_property_value(entry.get("value")),
            })

        logger.info(
            "Config report workload=%s matchedKeys=%s",
            workload_name,
            len(matched_keys),
        )

        if matched_keys:
            matched_keys.sort(key=lambda item: item["key"])
            return {
                "workloadName": workload_name,
                "workloadKind": workload_kind,
                "serviceName": service_name,
                "matches": matched_keys,
            }, None
        return None, None
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        logger.warning(
            "Config report workload=%s error=%s",
            workload_name,
            detail if isinstance(detail, str) else "HTTPException",
        )
        return None, {
            "workloadName": workload_name,
            "workloadKind": workload_kind,
            "message": detail if isinstance(detail, str) else "Failed to fetch actuator env",
        }
    except Exception as exc:
        logger.exception("Config report workload=%s unexpected_error", workload_name)
        return None, {
            "workloadName": workload_name,
            "workloadKind": workload_kind,
            "message": str(exc),
        }


async def build_config_report(namespace: str, pattern: str, case_insensitive: bool, search_in: str):
    try:
        logger.info(
            "Config report request namespace=%s pattern=%s caseInsensitive=%s searchIn=%s",
            namespace,
            pattern,
            case_insensitive,
            search_in,
        )
        if not pattern:
            raise HTTPException(status_code=400, detail="pattern query parameter is required")
        search_in = (search_in or "value").lower()
        if search_in != "value":
            raise HTTPException(status_code=400, detail="searchIn must be: value")
        try:
            flags = re.IGNORECASE if case_insensitive else 0
            regex = re.compile(pattern, flags=flags)
        except re.error as exc:
            raise HTTPException(status_code=400, detail=f"Invalid regex pattern: {str(exc)}")

        workloads = await asyncio.to_thread(list_workloads, namespace)
        services_map = await asyncio.to_thread(get_services_map, namespace)
        workloads.sort(key=lambda item: item.get("name") or "")
        logger.info("Config report workloads=%s", len(workloads))

        matched = []
        errors = []
        sem = asyncio.Semaphore(CONFIG_REPORT_CONCURRENCY)

        async def run_workload(workload: dict):
            async with sem:
                return await asyncio.to_thread(
                    process_report_workload,
                    namespace,
                    workload,
                    regex,
                    search_in,
                    services_map,
                )

        tasks = [run_workload(workload) for workload in workloads if workload.get("name")]
        results = await asyncio.gather(*tasks)

        for matched_item, error_item in results:
            if matched_item:
                matched.append(matched_item)
            if error_item:
                errors.append(error_item)

        logger.info("Config report done matched=%s errors=%s", len(matched), len(errors))
        return {
            "namespace": namespace,
            "pattern": pattern,
            "caseInsensitive": case_insensitive,
            "searchIn": search_in,
            "totalWorkloads": len(workloads),
            "matched": matched,
            "errors": errors,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to build config report: {str(exc)}")


@app.get("/api/config/{namespace}/{workloadName}/report")
async def get_spring_config_report_for_workload(
    namespace: str,
    workloadName: str,
    pattern: str,
    caseInsensitive: bool = False,
    searchIn: str = "value",
):
    try:
        if not pattern:
            raise HTTPException(status_code=400, detail="pattern query parameter is required")
        search_in = (searchIn or "value").lower()
        if search_in != "value":
            raise HTTPException(status_code=400, detail="searchIn must be: value")
        try:
            flags = re.IGNORECASE if caseInsensitive else 0
            regex = re.compile(pattern, flags=flags)
        except re.error as exc:
            raise HTTPException(status_code=400, detail=f"Invalid regex pattern: {str(exc)}")

        workload_kind, workload = get_workload(namespace, workloadName)
        if not workload:
            raise_structured_error(
                404,
                "workload_not_found",
                f"Workload '{workloadName}' not found in namespace '{namespace}'",
            )

        services_map = await asyncio.to_thread(get_services_map, namespace)
        matched_item, error_item = await asyncio.to_thread(
            process_report_workload,
            namespace,
            {"name": workloadName, "kind": workload_kind, "resource": workload},
            regex,
            search_in,
            services_map,
        )

        return {
            "namespace": namespace,
            "pattern": pattern,
            "caseInsensitive": caseInsensitive,
            "searchIn": search_in,
            "totalWorkloads": 1,
            "matched": [matched_item] if matched_item else [],
            "errors": [error_item] if error_item else [],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to build config report: {str(exc)}")


@app.get("/api/config/{namespace}/{workloadName}/configmaps/report")
async def get_configmap_report_for_workload(
    namespace: str,
    workloadName: str,
    pattern: str,
    caseInsensitive: bool = False,
    workloadKind: Optional[str] = None,
):
    try:
        if not pattern:
            raise HTTPException(status_code=400, detail="pattern query parameter is required")
        try:
            flags = re.IGNORECASE if caseInsensitive else 0
            regex = re.compile(pattern, flags=flags)
        except re.error as exc:
            raise HTTPException(status_code=400, detail=f"Invalid regex pattern: {str(exc)}")

        workload_kind = normalize_workload_kind(workloadKind)
        workload = None
        if workload_kind is None:
            workload_kind, workload = get_workload(namespace, workloadName)
            if not workload:
                raise_structured_error(
                    404,
                    "workload_not_found",
                    f"Workload '{workloadName}' not found in namespace '{namespace}'",
                )
        if workload is None:
            _, workload = get_workload(namespace, workloadName)
            if not workload:
                raise_structured_error(
                    404,
                    "workload_not_found",
                    f"Workload '{workloadName}' not found in namespace '{namespace}'",
                )

        workload_resource = get_workload_resource(workload)
        if not workload_resource:
            raise_structured_error(
                500,
                "workload_resource_missing",
                f"Failed to resolve workload resource for '{workloadName}'",
            )

        configmap_names = await asyncio.to_thread(
            extract_configmap_names_from_workload,
            workload_resource,
        )
        matches = []
        missing = []
        unknown_files = []

        for name in configmap_names:
            configmap = await asyncio.to_thread(fetch_configmap, namespace, name)
            if configmap is None:
                missing.append(name)
                continue
            configmap_matches, configmap_unknown = find_configmap_matches(configmap, regex)
            matches.extend(configmap_matches)
            if configmap_unknown:
                unknown_files.extend(configmap_unknown)

        return {
            "namespace": namespace,
            "workloadName": workloadName,
            "workloadKind": workload_kind,
            "pattern": pattern,
            "caseInsensitive": caseInsensitive,
            "configMaps": configmap_names,
            "missingConfigMaps": missing,
            "unknownFiles": unknown_files,
            "matches": matches,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to check configmaps: {str(exc)}")


@app.get("/api/config/{namespace}/{workloadName}/rollout-status")
async def get_workload_rollout_status(
    namespace: str,
    workloadName: str,
    workloadKind: Optional[str] = None,
):
    try:
        workload_kind = normalize_workload_kind(workloadKind)
        workload = None
        if workload_kind is None:
            workload_kind, workload = get_workload(namespace, workloadName)
            if not workload:
                raise_structured_error(
                    404,
                    "workload_not_found",
                    f"Workload '{workloadName}' not found in namespace '{namespace}'",
                )
        if workload is None:
            _, workload = get_workload(namespace, workloadName)
            if not workload:
                raise_structured_error(
                    404,
                    "workload_not_found",
                    f"Workload '{workloadName}' not found in namespace '{namespace}'",
                )

        fallback_labels = workload.get("spec", {}).get("template", {}).get("metadata", {}).get("labels", {})
        label_selector = get_workload_selector(workload, fallback_labels)
        if not label_selector:
            raise_structured_error(
                404,
                "no_label_selector",
                f"No label selector found for workload '{workloadName}'",
            )

        desired = workload.get("spec", {}).get("replicas", 0)
        if desired is None:
            desired = 0
        ready = await asyncio.to_thread(count_ready_pods, namespace, label_selector)
        restarts = await asyncio.to_thread(count_pod_restarts, namespace, label_selector)

        return {
            "namespace": namespace,
            "workloadName": workloadName,
            "workloadKind": workload_kind,
            "labelSelector": label_selector,
            "desiredReplicas": desired,
            "readyReplicas": ready,
            "totalRestarts": restarts,
            "ready": ready >= desired,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to check rollout status: {str(exc)}")


@app.get("/api/config/{namespace}/report.csv")
async def get_spring_config_report_csv(
    namespace: str,
    pattern: str,
    caseInsensitive: bool = False,
    searchIn: str = "value",
):
    report = await build_config_report(namespace, pattern, caseInsensitive, searchIn)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "workloadName",
        "workloadKind",
        "key",
        "value",
        "source",
        "matchOn",
        "justified",
        "migrationRequired",
        "comment",
    ])

    for workload in report.get("matched", []):
        for match in workload.get("matches", []):
            writer.writerow([
                workload.get("workloadName"),
                workload.get("workloadKind"),
                match.get("key"),
                match.get("value"),
                match.get("source"),
                match.get("matchOn"),
                "",
                "",
                "",
            ])

    filename = f"spring-config-report-{namespace}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/config/{namespace}/{workloadName}")
async def get_spring_config(namespace: str, workloadName: str):
    try:
        logger.info("GET /api/config/%s/%s", namespace, workloadName)
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
        logger.info("Using label selector %s", label_selector)

        service = get_service_by_name(namespace, workloadName)
        if not service:
            raise_structured_error(
                404,
                "service_not_found",
                f"No service named '{workloadName}' found in namespace '{namespace}'",
            )

        service_name = service.get("metadata", {}).get("name")
        if not service_name:
            raise_structured_error(500, "service_missing_name", "Matching service has no name")

        port = resolve_probe_port(workload)
        if port is None:
            port = resolve_service_port(service)
        if port is None:
            raise_structured_error(500, "service_port_missing", "Matching service has no port")
        logger.info("Using service %s on port %s", service_name, port)

        service_host = f"{service_name}.{namespace}.svc.cluster.local"
        actuator_url = f"http://{service_host}:{port}/actuator/env"
        actuator_payload = fetch_actuator_env(actuator_url)

        return {
            "namespace": namespace,
            "workloadName": workloadName,
            "workloadKind": workload_kind,
            "labelSelector": label_selector,
            "serviceName": service_name,
            "serviceHost": service_host,
            "port": port,
            "actuatorUrl": actuator_url,
            "payload": actuator_payload,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load Spring config: {str(exc)}")


@app.post("/api/config/{namespace}/{workloadName}/expose-actuator-env")
async def expose_actuator_env(namespace: str, workloadName: str, request: Optional[ExposeActuatorRequest] = None):
    try:
        workload_kind = normalize_workload_kind(request.workloadKind if request else None)
        if workload_kind is None:
            workload_kind, workload = get_workload(namespace, workloadName)
            if not workload:
                raise_structured_error(
                    404,
                    "workload_not_found",
                    f"Workload '{workloadName}' not found in namespace '{namespace}'",
                )

        env_vars = [
            "MANAGEMENT_ENDPOINT_ENV_ENABLED=true",
            "MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE=env,health",
        ]
        logger.info("Exposing actuator env for %s/%s in %s", workload_kind, workloadName, namespace)
        run_oc(["set", "env", f"{workload_kind}/{workloadName}", "-n", namespace] + env_vars)
        if workload_kind == "deploymentconfig":
            run_oc(["rollout", "latest", f"{workload_kind}/{workloadName}", "-n", namespace])

        return {
            "success": True,
            "message": f"Exposed /actuator/env for {workloadName} ({workload_kind})",
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to expose actuator env: {str(exc)}")


@app.post("/api/config/{namespace}/{workloadName}/apply-spring-config-agent")
async def apply_spring_config_agent(
    namespace: str,
    workloadName: str,
    request: Optional[ApplySpringConfigAgentRequest] = None,
):
    logger.debug(
        "Spring config agent env enabled=%s jarPath=%s outputDir=%s",
        SPRING_CONFIG_AGENT_ENABLED,
        SPRING_CONFIG_AGENT_JAR_PATH,
        SPRING_CONFIG_AGENT_OUTPUT_DIR,
    )
    logger.debug(
        "Spring config agent request payload workloadKind=%s",
        request.workloadKind if request else None,
    )
    cache_key = f"spring-config-agent:{namespace}:{workloadName}"
    if CACHE_TTL_SECONDS > 0:
        try:
            redis_client = get_redis_client()
            cached_payload = None
            cache_source = None
            if redis_client is not None:
                cached_payload = redis_client.get(cache_key)
                cache_source = "redis" if cached_payload else None
                if cached_payload:
                    cached_payload = cached_payload.decode("utf-8")
            else:
                cached = _actuator_cache.get(cache_key)
                if cached:
                    expires_at, payload = cached
                    if time.time() < expires_at:
                        cached_payload = payload
                        cache_source = "memory"
                    else:
                        _actuator_cache.pop(cache_key, None)
            if cached_payload:
                try:
                    parsed_payload = json.loads(cached_payload)
                except json.JSONDecodeError:
                    parsed_payload = cached_payload
                logger.info("Spring config agent cache hit (%s) %s", cache_source, cache_key)
                return {
                    "success": True,
                    "message": "Spring config agent cache hit.",
                    "namespace": namespace,
                    "workloadName": workloadName,
                    "workloadKind": normalize_workload_kind(request.workloadKind if request else None),
                    "cacheKey": cache_key,
                    "payload": parsed_payload,
                }
        except Exception as exc:
            logger.warning("Spring config agent cache read failed: %s", str(exc))
    if not SPRING_CONFIG_AGENT_ENABLED:
        logger.warning(
            "Spring config agent disabled; set SPRING_CONFIG_AGENT_ENABLED=true and mount jar at %s",
            SPRING_CONFIG_AGENT_JAR_PATH,
        )
        raise_structured_error(
            501,
            "agent_not_configured",
            (
                "Spring config agent workflow is not configured on this backend. "
                "Set SPRING_CONFIG_AGENT_ENABLED=true and mount the agent jar."
            ),
            {
                "agentJarPath": SPRING_CONFIG_AGENT_JAR_PATH,
                "outputDir": SPRING_CONFIG_AGENT_OUTPUT_DIR,
            },
        )
    logger.info(
        "Apply spring config agent requested namespace=%s workload=%s kind=%s",
        namespace,
        workloadName,
        request.workloadKind if request else None,
    )
    include_logs = bool(request.includeLogs) if request else False
    if not os.path.exists(SPRING_CONFIG_AGENT_JAR_PATH):
        logger.error("Spring config agent jar missing at %s", SPRING_CONFIG_AGENT_JAR_PATH)
        raise_structured_error(
            500,
            "agent_jar_missing",
            f"Spring config agent jar not found at {SPRING_CONFIG_AGENT_JAR_PATH}",
            {"agentJarPath": SPRING_CONFIG_AGENT_JAR_PATH},
        )
    else:
        try:
            size = os.path.getsize(SPRING_CONFIG_AGENT_JAR_PATH)
            logger.debug("Spring config agent jar sizeBytes=%s", size)
        except OSError as exc:
            logger.warning("Spring config agent jar stat failed: %s", str(exc))
    workload_kind = normalize_workload_kind(request.workloadKind if request else None)
    workload = None
    if workload_kind is None:
        workload_kind, workload = get_workload(namespace, workloadName)
        if not workload:
            raise_structured_error(
                404,
                "workload_not_found",
                f"Workload '{workloadName}' not found in namespace '{namespace}'",
            )
    if workload is None:
        _, workload = get_workload(namespace, workloadName)
        if not workload:
            raise_structured_error(
                404,
                "workload_not_found",
                f"Workload '{workloadName}' not found in namespace '{namespace}'",
            )

    template = workload.get("spec", {}).get("template", {}) or {}
    containers = template.get("spec", {}).get("containers", []) or []
    target_image = containers[0].get("image") if containers else ""
    if not target_image:
        raise_structured_error(
            500,
            "workload_image_missing",
            f"Failed to determine image for workload '{workloadName}'",
        )

    timestamp = int(time.time())
    base_name = f"{workloadName}-spring-config-debug"
    if len(base_name) > 50:
        base_name = base_name[:50].rstrip("-")
    debug_pod_name = f"{base_name}-{timestamp}"

    logger.info(
        "Creating debug pod %s from %s/%s using image %s",
        debug_pod_name,
        workload_kind,
        workloadName,
        target_image,
    )

    debug_pod_created = False
    try:
        debug_manifest = build_debug_pod_manifest(
            namespace,
            workload_kind,
            workloadName,
            debug_pod_name,
            target_image,
        )
        apply_debug_pod(debug_manifest)

        wait_for_pod_running(namespace, debug_pod_name, timeout_seconds=90)
        debug_pod_created = True

        debug_jar_path = "/tmp/spring-config-agent.jar"
        debug_output_path = "/tmp/spring-config.json"
        logger.debug("Copying agent jar to debug pod %s", debug_pod_name)
        run_oc(["cp", SPRING_CONFIG_AGENT_JAR_PATH, f"{namespace}/{debug_pod_name}:{debug_jar_path}"])

        logger.info("Executing spring config agent in debug pod %s", debug_pod_name)
        exec_args = [
            "exec",
            "-n",
            namespace,
            debug_pod_name,
            "--",
            "java",
            "-jar",
            debug_jar_path,
            f"output={debug_output_path}",
        ]
        if include_logs:
            exec_args.append("logLevel=DEBUG")
        agent_stdout = ""
        agent_stderr = ""
        if include_logs:
            exec_result = run_oc_capture(exec_args, timeout_seconds=60)
            agent_stdout = truncate_log((exec_result.stdout or "").strip())
            agent_stderr = truncate_log((exec_result.stderr or "").strip())
            if exec_result.returncode != 0:
                logger.error(
                    "Spring config agent exec failed (code=%s) stdout=%s stderr=%s",
                    exec_result.returncode,
                    agent_stdout,
                    agent_stderr,
                )
                raise_structured_error(
                    500,
                    "agent_exec_failed",
                    "Spring config agent failed to execute.",
                    {
                        "exitCode": exec_result.returncode,
                        "stdout": agent_stdout,
                        "stderr": agent_stderr,
                    },
                )
        else:
            run_oc(exec_args)

        os.makedirs(SPRING_CONFIG_AGENT_OUTPUT_DIR, exist_ok=True)
        safe_workload = re.sub(r"[^a-zA-Z0-9_.-]+", "_", workloadName)
        output_file = os.path.join(
            SPRING_CONFIG_AGENT_OUTPUT_DIR,
            f"{namespace}-{safe_workload}-spring-config.json",
        )
        logger.debug("Copying agent output to %s", output_file)
        run_oc(["cp", f"{namespace}/{debug_pod_name}:{debug_output_path}", output_file])
        try:
            with open(output_file, "r") as f:
                output_payload = json.load(f)
        except Exception as exc:
            logger.warning("Failed to parse agent output as JSON: %s", str(exc))
            with open(output_file, "r") as f:
                output_payload = f.read()
        if CACHE_TTL_SECONDS > 0:
            try:
                cache_payload = output_payload
                if not isinstance(cache_payload, str):
                    cache_payload = json.dumps(cache_payload)
                redis_client = get_redis_client()
                if redis_client is not None:
                    redis_client.setex(cache_key, CACHE_TTL_SECONDS, cache_payload.encode("utf-8"))
                    logger.debug("Spring config agent cache write (redis) %s", cache_key)
                else:
                    _actuator_cache[cache_key] = (time.time() + CACHE_TTL_SECONDS, cache_payload)
                    logger.debug("Spring config agent cache write (memory) %s", cache_key)
            except Exception as exc:
                logger.warning("Spring config agent cache write failed: %s", str(exc))
    finally:
        if debug_pod_created:
            run_oc_allow_timeout(
                ["delete", "pod", debug_pod_name, "-n", namespace, "--ignore-not-found=true"],
                timeout_seconds=10,
            )

    return {
        "success": True,
        "message": "Spring config agent executed.",
        "namespace": namespace,
        "workloadName": workloadName,
        "workloadKind": workload_kind,
        "debugPod": debug_pod_name,
        "outputFile": output_file,
        "cacheKey": cache_key,
        "payload": output_payload,
        "agentLogs": {"stdout": agent_stdout, "stderr": agent_stderr} if include_logs else None,
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "9150"))
    uvicorn.run(app, host="0.0.0.0", port=port)
