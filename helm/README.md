# OpenShift Dashboard Helm Chart

This Helm chart deploys the OpenShift Dashboard application on OpenShift/Kubernetes clusters.

## Features

- **Configurable Resources**: Adjust CPU and memory requests/limits for both frontend and backend deployments
- **Service Account Configuration**: Customize the service account name and namespace
- **Flexible Configuration**: All deployment parameters can be customized via values.yaml

## Prerequisites

- Helm 3.x
- OpenShift/Kubernetes cluster
- kubectl/oc configured to access your cluster

## Installation

### Basic Installation

```bash
cd helm
helm install openshift-dashboard . --namespace default
```

### Installation with Custom Values

```bash
helm install openshift-dashboard . -f my-values.yaml --namespace default
```

### Upgrade Existing Installation

```bash
helm upgrade openshift-dashboard . -f my-values.yaml --namespace default
```

## Configuration

The following table lists the configurable parameters and their default values:

### Global Settings

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.namespace` | Default namespace | `default` |
| `global.appName` | Application name | `openshift-dashboard` |

### Service Account

| Parameter | Description | Default |
|-----------|-------------|---------|
| `serviceAccount.create` | Create service account | `true` |
| `serviceAccount.name` | Service account name | `openshift-dashboard-sa` |
| `serviceAccount.namespace` | Service account namespace | `default` |

### Frontend Deployment

| Parameter | Description | Default |
|-----------|-------------|---------|
| `frontend.enabled` | Enable frontend deployment | `true` |
| `frontend.replicas` | Number of replicas | `1` |
| `frontend.image.repository` | Image repository | `openshift-dashboard-frontend` |
| `frontend.image.tag` | Image tag | `latest` |
| `frontend.image.pullPolicy` | Image pull policy | `Always` |
| `frontend.resources.requests.memory` | Memory request | `64Mi` |
| `frontend.resources.requests.cpu` | CPU request | `50m` |
| `frontend.resources.limits.memory` | Memory limit | `128Mi` |
| `frontend.resources.limits.cpu` | CPU limit | `200m` |
| `frontend.containerPort` | Container port | `8080` |

### Backend Deployment

| Parameter | Description | Default |
|-----------|-------------|---------|
| `backend.enabled` | Enable backend deployment | `true` |
| `backend.replicas` | Number of replicas | `1` |
| `backend.workers` | Uvicorn worker count | `15` |
| `backend.configReportConcurrency` | Concurrent workloads per config report | `6` |
| `backend.image.repository` | Image repository | `openshift-dashboard-backend` |
| `backend.image.tag` | Image tag | `latest` |
| `backend.image.pullPolicy` | Image pull policy | `Always` |
| `backend.resources.requests.memory` | Memory request | `128Mi` |
| `backend.resources.requests.cpu` | CPU request | `100m` |
| `backend.resources.limits.memory` | Memory limit | `512Mi` |
| `backend.resources.limits.cpu` | CPU limit | `500m` |
| `backend.containerPort` | Container port | `9150` |

### Services

| Parameter | Description | Default |
|-----------|-------------|---------|
| `services.frontend.port` | Frontend service port | `8080` |
| `services.frontend.targetPort` | Frontend target port | `8080` |
| `services.frontend.type` | Frontend service type | `ClusterIP` |
| `services.backend.port` | Backend service port | `9150` |
| `services.backend.targetPort` | Backend target port | `9150` |
| `services.backend.type` | Backend service type | `ClusterIP` |

### Route (OpenShift)

| Parameter | Description | Default |
|-----------|-------------|---------|
| `route.enabled` | Enable OpenShift route | `true` |
| `route.name` | Route name | `openshift-dashboard` |
| `route.tls.termination` | TLS termination | `edge` |
| `route.tls.insecureEdgeTerminationPolicy` | Insecure policy | `Redirect` |

### RBAC

| Parameter | Description | Default |
|-----------|-------------|---------|
| `rbac.create` | Create RBAC resources | `false` |
| `rbac.clusterRole.name` | ClusterRole name | `openshift-dashboard-role` |
| `rbac.clusterRoleBinding.name` | ClusterRoleBinding name | `openshift-dashboard-binding` |

**Note**: RBAC is disabled by default. The service account specified in `serviceAccount.name` must have admin privileges to access Kubernetes API resources (deployments, namespaces, etc.).

## Example: Custom Resource Limits

To customize resource limits for deployments, create a `custom-values.yaml`:

```yaml
frontend:
  resources:
    requests:
      memory: "128Mi"
      cpu: "100m"
    limits:
      memory: "256Mi"
      cpu: "500m"

backend:
  resources:
    requests:
      memory: "256Mi"
      cpu: "200m"
    limits:
      memory: "1Gi"
      cpu: "1000m"

serviceAccount:
  name: my-custom-sa
  namespace: my-namespace
```

Then install with:

```bash
helm install openshift-dashboard . -f custom-values.yaml --namespace my-namespace
```

## Example: Change Service Account

To use a different service account (must have admin privileges):

```yaml
serviceAccount:
  create: false  # Don't create, use existing
  name: existing-service-account
  namespace: my-namespace
```

**Important**: The service account must have admin privileges to access Kubernetes API resources. The backend needs permissions to:
- List and get deployments across namespaces
- List namespaces
- Scale deployments
- Restart deployments (patch)

## Frontend Image

The frontend assets are baked into the Docker image built from `frontend/Dockerfile`. Build and push it to your registry, then set `frontend.image.repository` and `frontend.image.tag` in your values file.

## Uninstallation

```bash
helm uninstall openshift-dashboard --namespace default
```

## Troubleshooting

### Check Deployment Status

```bash
kubectl get deployments -n default
kubectl describe deployment openshift-dashboard-frontend -n default
kubectl describe deployment openshift-dashboard-backend -n default
```

### Check Service Account

```bash
kubectl get serviceaccount openshift-dashboard-sa -n default
kubectl describe serviceaccount openshift-dashboard-sa -n default
```

### Check Service Account Permissions

Since RBAC is disabled by default, verify your service account has the necessary permissions:

```bash
# Check if service account exists
kubectl get serviceaccount <service-account-name> -n <namespace>

# Verify service account has admin privileges (if using cluster-admin binding)
kubectl get clusterrolebinding | grep <service-account-name>
```

### View Logs

```bash
kubectl logs -l app=openshift-dashboard,component=frontend -n default
kubectl logs -l app=openshift-dashboard,component=backend -n default
```

## Notes

- **Service Account**: The service account specified in `serviceAccount.name` must exist and have admin privileges to access Kubernetes API resources
- **RBAC**: RBAC is disabled by default (`rbac.create: false`). If you need to create RBAC resources, set `rbac.create: true` in your values file
- Make sure the backend image is available in your cluster's registry
- The frontend files ConfigMap needs to be populated with your frontend assets

