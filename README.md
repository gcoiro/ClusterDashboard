# OpenShift Deployment Dashboard

A modern web dashboard to monitor and control OpenShift/Kubernetes deployments. Built with Python (FastAPI) backend and nginx serving a static HTML/CSS/JavaScript frontend.

## Features

- 📊 View all deployments with their pod counts and readiness status
- 🏷️ Filter deployments by namespace
- 🔄 Restart deployments with a single click
- 📈 Scale deployments up or down (with custom replica counts)
- 🎨 Modern, responsive UI

## Architecture

- **Backend**: Python FastAPI application that interacts with OpenShift/Kubernetes API
- **Frontend**: Static HTML/CSS/JavaScript served by nginx
- **Proxy**: nginx proxies API requests to the Python backend

## Prerequisites

- Python 3.11+
- Docker and Docker Compose (optional, for containerized deployment)
- OpenShift/Kubernetes cluster access
- Service account token with appropriate permissions

## Setup

### Option 1: Deploy with Helm (Recommended for Production)

Deploy the dashboard using the Helm chart in `helm/`. See `helm/README.md` for detailed instructions.

**IMPORTANT PREREQUISITE**: You **MUST** create a ServiceAccount named `openshift-dashboard-sa` in your namespace before deploying (or set `serviceAccount.create: true` in Helm and let it create one).

**Quick Start:**
```bash
# 1. Build and push backend image to your registry
docker build -t <your-registry>/openshift-dashboard-backend:latest ./backend
docker push <your-registry>/openshift-dashboard-backend:latest

# 2. Build and push frontend image to your registry
docker build -t <your-registry>/openshift-dashboard-frontend:latest ./frontend
docker push <your-registry>/openshift-dashboard-frontend:latest

# 3. Install the Helm chart
helm install openshift-dashboard ./helm \
  --set backend.image.repository=<your-registry>/openshift-dashboard-backend \
  --set frontend.image.repository=<your-registry>/openshift-dashboard-frontend
```

**Configuration:**
- Backend runs on port **9150**
- Frontend runs on port **8080**
- ServiceAccount must exist in the namespace specified in ConfigMap (or be created by Helm)

### Option 2: Docker Compose (Local Development)

1. Clone the repository:
```bash
git clone <repository-url>
cd ClusterDashboard
```

2. Create a `.env` file in the root directory:
```env
KUBERNETES_API_SERVER=https://your-openshift-api-server
KUBERNETES_TOKEN=your-service-account-token
KUBERNETES_NAMESPACE=default
```

3. Build and run with Docker Compose:
```bash
docker-compose up -d
```

4. Access the dashboard at `http://localhost:8080`

### Option 3: Manual Setup

#### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file:
```env
KUBERNETES_API_SERVER=https://your-openshift-api-server
KUBERNETES_TOKEN=your-service-account-token
KUBERNETES_NAMESPACE=default
```

5. Run the backend:
```bash
python app.py
# Or with uvicorn directly:
uvicorn app:app --host 0.0.0.0 --port 5000
```

#### Frontend Setup (nginx)

1. Install nginx on your system

2. Copy the nginx configuration:
```bash
sudo cp nginx.conf /etc/nginx/sites-available/openshift-dashboard
sudo ln -s /etc/nginx/sites-available/openshift-dashboard /etc/nginx/sites-enabled/
```

3. Update the nginx.conf to point to your backend:
   - Change `proxy_pass http://backend:5000;` to `proxy_pass http://localhost:5000;` if running locally

4. Copy frontend files to nginx html directory:
```bash
sudo cp frontend/* /usr/share/nginx/html/
```

5. Restart nginx:
```bash
sudo systemctl restart nginx
```

6. Access the dashboard at `http://localhost`

## Getting OpenShift/Kubernetes Token

### For OpenShift:

1. Log in to OpenShift CLI:
```bash
oc login https://your-openshift-server
```

2. Create a service account (if needed):
```bash
oc create serviceaccount dashboard-sa
oc adm policy add-cluster-role-to-user cluster-reader system:serviceaccount:default:dashboard-sa
```

3. Get the token:
```bash
oc sa get-token dashboard-sa
```

### For Kubernetes:

1. Create a service account:
```bash
kubectl create serviceaccount dashboard-sa
kubectl create clusterrolebinding dashboard-sa-binding --clusterrole=cluster-admin --serviceaccount=default:dashboard-sa
```

2. Get the token:
```bash
kubectl get secret $(kubectl get serviceaccount dashboard-sa -o jsonpath='{.secrets[0].name}') -o jsonpath='{.data.token}' | base64 -d
```

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/deployments` - Get all deployments (optional `?namespace=<name>` query parameter)
- `GET /api/deployments/namespaces` - Get all namespaces
- `PATCH /api/deployments/{namespace}/{name}/scale` - Scale a deployment
- `POST /api/deployments/{namespace}/{name}/restart` - Restart a deployment

## Configuration

The backend reads configuration from environment variables:

- `KUBERNETES_API_SERVER`: OpenShift/Kubernetes API server URL (default: `https://kubernetes.default.svc`)
- `KUBERNETES_TOKEN`: Service account token for authentication
- `KUBERNETES_NAMESPACE`: Default namespace (default: `default`)
- `PORT`: Backend server port (default: `5000`)

## Security Notes

- The current configuration uses `verify=False` for SSL certificates. In production, configure proper SSL certificate verification.
- Update CORS settings in both backend (`app.py`) and nginx configuration for production use.
- Ensure the service account has only the minimum required permissions.

## Troubleshooting

### Backend can't connect to Kubernetes API

- Verify the `KUBERNETES_API_SERVER` URL is correct
- Check that the token is valid and has proper permissions
- Ensure network connectivity to the API server

### Frontend can't reach backend

- Check that the backend is running on port 5000
- Verify nginx proxy configuration points to the correct backend URL
- Check nginx error logs: `sudo tail -f /var/log/nginx/error.log`

### Deployments not showing

- Verify the service account has `list` permissions on deployments
- Check that you're querying the correct namespace
- Review backend logs for API errors

## License

MIT
