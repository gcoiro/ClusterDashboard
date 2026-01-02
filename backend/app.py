from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
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


def get_k8s_headers():
    """Get headers for Kubernetes API requests"""
    return {
        "Authorization": f"Bearer {KUBERNETES_TOKEN}",
        "Content-Type": "application/json",
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


@app.get("/api/deployments")
async def get_deployments(namespace: str = Query(None, description="Namespace filter (use 'all' for all namespaces)")):
    """Get all deployments, optionally filtered by namespace"""
    try:
        headers = get_k8s_headers()
        
        if namespace and namespace != "all":
            # Get deployments from specific namespace
            url = f"{KUBERNETES_API_SERVER}/apis/apps/v1/namespaces/{namespace}/deployments"
        else:
            # Get deployments from all namespaces
            url = f"{KUBERNETES_API_SERVER}/apis/apps/v1/deployments"
        
        async with httpx.AsyncClient(verify=False) as client:  # verify=False for self-signed certs
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            data = response.json()
        
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
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Kubernetes API error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch deployments: {str(e)}")


@app.get("/api/deployments/namespaces")
async def get_namespaces():
    """Get all namespaces"""
    try:
        headers = get_k8s_headers()
        url = f"{KUBERNETES_API_SERVER}/api/v1/namespaces"
        
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.get(url, headers=headers, timeout=30.0)
            response.raise_for_status()
            data = response.json()
        
        namespaces = [{"name": item["metadata"]["name"]} for item in data.get("items", [])]
        return namespaces
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Kubernetes API error: {e.response.text}")
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
        
        headers = get_k8s_headers()
        url = f"{KUBERNETES_API_SERVER}/apis/apps/v1/namespaces/{namespace}/deployments/{name}"
        
        # Patch the deployment
        patch_data = {
            "spec": {
                "replicas": request.replicas
            }
        }
        
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.patch(
                url,
                json=patch_data,
                headers={**headers, "Content-Type": "application/merge-patch+json"},
                timeout=30.0
            )
            response.raise_for_status()
        
        return {"success": True, "message": f"Scaled {name} to {request.replicas} replicas"}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Kubernetes API error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scale deployment: {str(e)}")


@app.post("/api/deployments/{namespace}/{name}/restart")
async def restart_deployment(namespace: str, name: str):
    """Restart a deployment (rollout restart)"""
    try:
        headers = get_k8s_headers()
        url = f"{KUBERNETES_API_SERVER}/apis/apps/v1/namespaces/{namespace}/deployments/{name}"
        
        # Get current deployment
        async with httpx.AsyncClient(verify=False) as client:
            get_response = await client.get(url, headers=headers, timeout=30.0)
            get_response.raise_for_status()
            deployment = get_response.json()
        
        # Add restart annotation
        annotations = deployment.get("spec", {}).get("template", {}).get("metadata", {}).get("annotations", {})
        annotations["kubectl.kubernetes.io/restartedAt"] = __import__("datetime").datetime.now().isoformat()
        
        # Patch the deployment
        patch_data = {
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": annotations
                    }
                }
            }
        }
        
        async with httpx.AsyncClient(verify=False) as client:
            response = await client.patch(
                url,
                json=patch_data,
                headers={**headers, "Content-Type": "application/merge-patch+json"},
                timeout=30.0
            )
            response.raise_for_status()
        
        return {"success": True, "message": f"Restarted deployment {name}"}
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Kubernetes API error: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to restart deployment: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "9150"))
    uvicorn.run(app, host="0.0.0.0", port=port)

