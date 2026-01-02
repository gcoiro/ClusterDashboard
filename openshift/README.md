# OpenShift Deployment Guide

This directory contains all the necessary Kubernetes/OpenShift manifests to deploy the dashboard in your OpenShift cluster.

## ⚠️ PREREQUISITE: ServiceAccount Required

**IMPORTANT**: Before deploying, you **MUST** create a ServiceAccount named `openshift-dashboard-sa` in the namespace specified in the ConfigMap (default: `default` namespace).

The ServiceAccount must have the following RBAC permissions:
- `get`, `list`, `watch`, `patch` on `deployments` in `apps` API group
- `get`, `list`, `watch` on `namespaces`
- `get`, `patch` on `deployments/scale`

### Creating the ServiceAccount

1. **Create the ServiceAccount and RBAC**:
```bash
oc apply -f serviceaccount.yaml
```

This will create:
- ServiceAccount: `openshift-dashboard-sa`
- ClusterRole: `openshift-dashboard-role` (with required permissions)
- ClusterRoleBinding: `openshift-dashboard-binding` (binds the role to the service account)

2. **Verify the ServiceAccount exists**:
```bash
oc get serviceaccount openshift-dashboard-sa -n <your-namespace>
```

**The deployment will fail if the ServiceAccount does not exist!**

## Quick Start

### Option 1: Using the Deployment Script (Recommended)

1. **Build and push images to your internal registry**:
```bash
# Build backend image
docker build -t <your-registry>/openshift-dashboard-backend:latest ./backend
docker push <your-registry>/openshift-dashboard-backend:latest

# Build frontend image (if needed, or use nginx:1.29.3-trixie-perl directly)
# The frontend uses nginx:1.29.3-trixie-perl image from Docker Hub
```

2. **Make sure you're logged in to OpenShift**:
```bash
oc login https://your-openshift-server
oc project your-namespace
```

3. **Update image references** in `backend-deployment.yaml`:
```yaml
image: <your-registry>/openshift-dashboard-backend:latest
```

4. **Make the script executable and run it**:
```bash
chmod +x deploy.sh
./deploy.sh
```

### Option 2: Manual Deployment

1. **Create ServiceAccount and RBAC** (if not already created):
```bash
oc apply -f serviceaccount.yaml
```

2. **Create ConfigMap**:
```bash
oc apply -f configmap.yaml
```

3. **Create Frontend ConfigMaps**:
```bash
oc apply -f nginx-configmap.yaml
oc apply -f frontend-files-configmap.yaml
```

4. **Deploy Backend**:
```bash
oc apply -f backend-deployment.yaml
oc apply -f backend-service.yaml
```

5. **Deploy Frontend**:
```bash
oc apply -f frontend-deployment.yaml
oc apply -f frontend-service.yaml
```

6. **Create Route**:
```bash
oc apply -f route.yaml
```

7. **Get the Route URL**:
```bash
oc get route openshift-dashboard
```

## Configuration

### Ports

- **Backend**: Exposed on port `9150` (container port)
- **Frontend**: Exposed on port `8080` (container port, using nginx:1.29.3-trixie-perl image)

### ConfigMap

The `configmap.yaml` contains:
- `kubernetes-api-server`: Kubernetes API server URL (default: `https://kubernetes.default.svc`)
- `namespace`: Default namespace
- `service-account-namespace`: Namespace where the ServiceAccount `openshift-dashboard-sa` exists (default: `default`)

### Service Account Token

The backend automatically uses the service account token mounted at `/var/run/secrets/kubernetes.io/serviceaccount/token` when running in a pod. This is the recommended approach and requires the ServiceAccount to exist in the specified namespace.

### Images

- **Backend**: Uses image specified in `backend-deployment.yaml` (default: `openshift-dashboard-backend:latest`)
  - Build with: `docker build -t <your-registry>/openshift-dashboard-backend:latest ./backend`
- **Frontend**: Uses `nginx:1.29.3-trixie-perl` image from Docker Hub
  - Frontend files (HTML, CSS, JS) are provided via ConfigMaps

### RBAC Permissions

The service account needs the following permissions (configured in `serviceaccount.yaml`):
- `get`, `list`, `watch`, `patch` on `deployments` in `apps` API group
- `get`, `list`, `watch` on `namespaces`
- `get`, `patch` on `deployments/scale`

## Customization

### Change Namespace

Update the `namespace` and `service-account-namespace` fields in:
- `configmap.yaml`
- `serviceaccount.yaml` (ClusterRoleBinding)
- All deployment files

**Important**: Make sure the ServiceAccount `openshift-dashboard-sa` exists in the namespace specified in the ConfigMap!

Or use `kubectl`/`oc` to apply to a different namespace:
```bash
oc apply -f . -n your-namespace
```

### Update Image References

1. **Backend Image**: Update the `image` field in `backend-deployment.yaml`:
```yaml
image: <your-registry>/openshift-dashboard-backend:latest
```

2. **Frontend Image**: The frontend uses `nginx:1.29.3-trixie-perl` by default. To change it, update `frontend-deployment.yaml`:
```yaml
image: nginx:1.29.3-trixie-perl
```

3. **Image Pull Secrets**: If using a private registry, add image pull secrets to the deployment:
```yaml
spec:
  imagePullSecrets:
  - name: your-registry-secret
```

### Custom Route

Edit `route.yaml` to:
- Change the hostname
- Configure TLS settings
- Add annotations

## Troubleshooting

### Check Pod Status
```bash
oc get pods -l app=openshift-dashboard
oc describe pod <pod-name>
oc logs <pod-name>
```

### Check Services
```bash
oc get svc -l app=openshift-dashboard
```

### Check Route
```bash
oc get route openshift-dashboard
oc describe route openshift-dashboard
```

### Backend Can't Connect to API

1. **Verify ServiceAccount exists**:
```bash
oc get serviceaccount openshift-dashboard-sa -n <namespace>
```

2. **Verify service account has correct permissions**:
```bash
oc get clusterrolebinding openshift-dashboard-binding
oc describe clusterrole openshift-dashboard-role
```

3. **Check if token is available**:
```bash
oc exec <backend-pod> -- cat /var/run/secrets/kubernetes.io/serviceaccount/token
```

4. **Test API connectivity from pod**:
```bash
oc exec <backend-pod> -- curl -k https://kubernetes.default.svc/api/v1/namespaces
```

### Frontend Can't Reach Backend

1. **Check service endpoints**:
```bash
oc get endpoints openshift-dashboard-backend
```

2. **Verify backend service port** (should be 9150):
```bash
oc get svc openshift-dashboard-backend
```

3. **Test connectivity from frontend pod**:
```bash
oc exec <frontend-pod> -- wget -O- http://openshift-dashboard-backend:9150/api/health
```

### ServiceAccount Not Found Error

If you see errors about ServiceAccount not found:
1. Ensure the ServiceAccount exists in the namespace specified in ConfigMap
2. Create it using: `oc apply -f serviceaccount.yaml`
3. Verify the namespace in ConfigMap matches where the ServiceAccount was created

## Using Kustomize

If you prefer using Kustomize:

```bash
kubectl apply -k .
```

Or with a specific namespace:
```bash
kubectl apply -k . -n your-namespace
```

**Note**: Remember to create the ServiceAccount first!

## Building Images

Since BuildConfigs are not used, build images externally:

### Backend Image
```bash
cd backend
docker build -t <your-registry>/openshift-dashboard-backend:latest .
docker push <your-registry>/openshift-dashboard-backend:latest
```

### Frontend
The frontend uses the official `nginx:1.29.3-trixie-perl` image. Frontend files are provided via ConfigMaps, so no custom image build is needed.

## Continuous Deployment

### Using OpenShift Pipelines (Tekton)

You can create a Tekton pipeline to:
1. Build backend image on code changes
2. Push to internal registry
3. Deploy to different environments
4. Run tests

### Using GitOps (ArgoCD/Flux)

1. Store these manifests in a Git repository
2. Configure ArgoCD/Flux to sync from the repo
3. Changes will be automatically deployed
4. Ensure ServiceAccount exists in target namespaces

## Security Considerations

1. **Service Account**: Uses a dedicated service account with minimal required permissions
2. **TLS**: Route uses edge termination with redirect
3. **Token**: Uses service account token (automatically rotated)
4. **Network**: Services use ClusterIP (internal only)

For production:
- Review and restrict RBAC permissions further
- Use proper TLS certificates
- Configure network policies
- Add authentication/authorization to the dashboard

