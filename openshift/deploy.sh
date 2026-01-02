#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}OpenShift Dashboard Deployment Script${NC}"
echo "=========================================="

# Check if oc is installed
if ! command -v oc &> /dev/null; then
    echo -e "${RED}Error: oc (OpenShift CLI) is not installed${NC}"
    exit 1
fi

# Check if logged in
if ! oc whoami &> /dev/null; then
    echo -e "${RED}Error: Not logged in to OpenShift. Please run 'oc login'${NC}"
    exit 1
fi

# Get current namespace
NAMESPACE=$(oc project -q)
echo -e "${YELLOW}Deploying to namespace: ${NAMESPACE}${NC}"

# Update namespace in serviceaccount if needed
if [ "$NAMESPACE" != "default" ]; then
    echo -e "${YELLOW}Updating namespace in serviceaccount.yaml...${NC}"
    sed -i.bak "s/namespace: default/namespace: ${NAMESPACE}/g" serviceaccount.yaml
fi

# Step 1: Create ServiceAccount and RBAC
echo -e "${GREEN}Step 1: Creating ServiceAccount and RBAC...${NC}"
oc apply -f serviceaccount.yaml

# Get the service account token
echo -e "${YELLOW}Getting service account token...${NC}"
TOKEN=$(oc sa get-token openshift-dashboard-sa)

# Step 2: Create Secret
echo -e "${GREEN}Step 2: Creating Secret...${NC}"
if [ -f secret.yaml ]; then
    oc apply -f secret.yaml
else
    # Create secret from template
    sed "s/YOUR_TOKEN_HERE/${TOKEN}/g" secret.yaml.template > secret.yaml
    oc apply -f secret.yaml
    echo -e "${YELLOW}Created secret.yaml from template. You can edit it manually if needed.${NC}"
fi

# Step 3: Create ConfigMap
echo -e "${GREEN}Step 3: Creating ConfigMap...${NC}"
oc apply -f configmap.yaml

# Step 4: Create Frontend ConfigMaps
echo -e "${GREEN}Step 4: Creating Frontend ConfigMaps...${NC}"
oc apply -f nginx-configmap.yaml
oc apply -f frontend-files-configmap.yaml

# Step 5: Verify ServiceAccount exists
echo -e "${GREEN}Step 5: Verifying ServiceAccount exists...${NC}"
SA_NAMESPACE=$(oc get configmap openshift-dashboard-config -o jsonpath='{.data.service-account-namespace}' 2>/dev/null || echo "default")
if ! oc get serviceaccount openshift-dashboard-sa -n "$SA_NAMESPACE" &> /dev/null; then
    echo -e "${RED}ERROR: ServiceAccount 'openshift-dashboard-sa' does not exist in namespace '$SA_NAMESPACE'${NC}"
    echo -e "${YELLOW}Please create the ServiceAccount first. See README.md for instructions.${NC}"
    exit 1
fi
echo -e "${GREEN}ServiceAccount 'openshift-dashboard-sa' found in namespace '$SA_NAMESPACE'${NC}"

# Step 6: Deploy Backend
echo -e "${GREEN}Step 5: Deploying Backend...${NC}"
oc apply -f backend-deployment.yaml
oc apply -f backend-service.yaml

# Step 7: Deploy Frontend
echo -e "${GREEN}Step 7: Deploying Frontend...${NC}"
oc apply -f frontend-deployment.yaml
oc apply -f frontend-service.yaml

# Step 8: Create Route
echo -e "${GREEN}Step 8: Creating Route...${NC}"
oc apply -f route.yaml

# Wait for deployments
echo -e "${YELLOW}Waiting for deployments to be ready...${NC}"
oc wait --for=condition=available deployment/openshift-dashboard-backend --timeout=5m || true
oc wait --for=condition=available deployment/openshift-dashboard-frontend --timeout=5m || true

# Get Route URL
ROUTE_URL=$(oc get route openshift-dashboard -o jsonpath='{.spec.host}' 2>/dev/null || echo "")

echo ""
echo -e "${GREEN}=========================================="
echo -e "Deployment Complete!${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo -e "Dashboard URL: ${GREEN}https://${ROUTE_URL}${NC}"
echo ""
echo -e "To check deployment status:"
echo -e "  oc get pods -l app=openshift-dashboard"
echo -e "  oc get route openshift-dashboard"
echo ""

