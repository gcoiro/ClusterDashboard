from fastapi import FastAPI, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import base64
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

_response_cache = {}
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


def serialize_cache_entry(status_code: int, headers: dict, media_type: str, body: bytes) -> bytes:
    payload = {
        "status_code": status_code,
        "headers": headers,
        "media_type": media_type,
        "body": base64.b64encode(body).decode("ascii"),
    }
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def deserialize_cache_entry(payload: bytes):
    data = json.loads(payload.decode("utf-8"))
    return (
        data.get("status_code", 200),
        data.get("headers", {}),
        data.get("media_type"),
        base64.b64decode(data.get("body", "")),
    )


@app.middleware("http")
async def response_cache_middleware(request: Request, call_next):
    if CACHE_TTL_SECONDS <= 0 or request.method != "GET" or not request.url.path.startswith("/api/"):
        return await call_next(request)

    cache_key = f"api-cache:{request.url.path}?{request.url.query}"
    redis_client = get_redis_client()
    if redis_client is not None:
        try:
            cached_payload = redis_client.get(cache_key)
            if cached_payload:
                status_code, headers, media_type, body = deserialize_cache_entry(cached_payload)
                return Response(content=body, status_code=status_code, headers=headers, media_type=media_type)
        except redis.RedisError as exc:
            logger.warning("Redis cache read failed: %s", str(exc))
    else:
        cached = _response_cache.get(cache_key)
        if cached:
            expires_at, status_code, headers, body, media_type = cached
            if time.time() < expires_at:
                return Response(content=body, status_code=status_code, headers=headers, media_type=media_type)
            _response_cache.pop(cache_key, None)

    response = await call_next(request)
    if response.status_code != 200:
        return response

    body = b""
    async for chunk in response.body_iterator:
        body += chunk

    headers = dict(response.headers)
    headers.pop("content-length", None)
    headers.pop("transfer-encoding", None)
    headers["Cache-Control"] = f"public, max-age={CACHE_TTL_SECONDS}"
    if redis_client is not None:
        try:
            payload = serialize_cache_entry(response.status_code, headers, response.media_type, body)
            redis_client.setex(cache_key, CACHE_TTL_SECONDS, payload)
        except redis.RedisError as exc:
            logger.warning("Redis cache write failed: %s", str(exc))
    else:
        _response_cache[cache_key] = (
            time.time() + CACHE_TTL_SECONDS,
            response.status_code,
            headers,
            body,
            response.media_type,
        )
    return Response(content=body, status_code=response.status_code, headers=headers, media_type=response.media_type)


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


def get_workload(namespace: str, name: str):
    logger.info("Resolving workload %s in namespace %s", name, namespace)
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


def get_service_by_name(namespace: str, service_name: str):
    if not service_name:
        return None
    try:
        return run_oc(["get", "service", service_name, "-n", namespace, "-o", "json"], expect_json=True)
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if isinstance(detail, str) and (
            is_not_found_error(detail)
            or is_missing_resource_error(detail, "services")
            or is_missing_resource_error(detail, "service")
        ):
            return None
        raise


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


def fetch_actuator_env(url: str):
    logger.info("Fetching actuator env %s", url)
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
        return json.loads(payload)
    except json.JSONDecodeError as exc:
        logger.error("Actuator JSON parse error: %s", str(exc))
        raise_structured_error(502, "actuator_invalid_json", f"Actuator returned invalid JSON: {str(exc)}")


def normalize_workload(item, kind_label):
    return {
        "name": item.get("metadata", {}).get("name"),
        "namespace": item.get("metadata", {}).get("namespace"),
        "replicas": item.get("spec", {}).get("replicas", 0),
        "kind": kind_label,
    }


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
        workloads.extend([normalize_workload(item, "deployment") for item in data.get("items", [])])
    except HTTPException as exc:
        detail = getattr(exc, "detail", "")
        if not (isinstance(detail, str) and (
            is_missing_resource_error(detail, "deployments") or is_missing_resource_error(detail, "deployment")
        )):
            raise

    try:
        data = run_oc(["get", "deploymentconfigs", "-n", namespace, "-o", "json"], expect_json=True)
        workloads.extend([normalize_workload(item, "deploymentconfig") for item in data.get("items", [])])
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


def process_report_workload(namespace: str, workload: dict, regex, search_in: str):
    workload_name = workload.get("name")
    workload_kind = workload.get("kind")
    if not workload_name:
        return None, None
    logger.info("Config report workload=%s kind=%s", workload_name, workload_kind)

    try:
        service = get_service_by_name(namespace, workload_name)
        if not service:
            logger.warning("Config report skip=%s reason=service_not_found", workload_name)
            return None, {
                "workloadName": workload_name,
                "workloadKind": workload_kind,
                "message": "No matching service found",
            }

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
        workloads.sort(key=lambda item: item.get("name") or "")
        logger.info("Config report workloads=%s", len(workloads))

        matched = []
        errors = []
        sem = asyncio.Semaphore(CONFIG_REPORT_CONCURRENCY)

        async def run_workload(workload: dict):
            async with sem:
                return await asyncio.to_thread(process_report_workload, namespace, workload, regex, search_in)

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
    writer.writerow(["workloadName", "workloadKind", "key", "value", "source", "matchOn"])

    for workload in report.get("matched", []):
        for match in workload.get("matches", []):
            writer.writerow([
                workload.get("workloadName"),
                workload.get("workloadKind"),
                match.get("key"),
                match.get("value"),
                match.get("source"),
                match.get("matchOn"),
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


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "9150"))
    uvicorn.run(app, host="0.0.0.0", port=port)
