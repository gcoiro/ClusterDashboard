const API_BASE_URL = '/api';

// DOM elements
const namespaceSelect = document.getElementById('namespace-select');
const refreshBtn = document.getElementById('refresh-btn');
const deploymentsContainer = document.getElementById('deployments-container');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');

// State
let currentNamespace = 'all';
let deployments = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadNamespaces();
    loadDeployments();
    
    namespaceSelect.addEventListener('change', (e) => {
        currentNamespace = e.target.value;
        loadDeployments();
    });
    
    refreshBtn.addEventListener('click', () => {
        loadDeployments();
    });
});

// Load namespaces
async function loadNamespaces() {
    try {
        const response = await fetch(`${API_BASE_URL}/deployments/namespaces`);
        if (!response.ok) throw new Error('Failed to fetch namespaces');
        
        const namespaces = await response.json();
        
        // Clear existing options except "All Namespaces"
        namespaceSelect.innerHTML = '<option value="all">All Namespaces</option>';
        
        // Add namespace options
        namespaces.forEach(ns => {
            const option = document.createElement('option');
            option.value = ns.name;
            option.textContent = ns.name;
            namespaceSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading namespaces:', error);
    }
}

// Load deployments
async function loadDeployments() {
    showLoading();
    hideError();
    
    try {
        const url = currentNamespace === 'all' 
            ? `${API_BASE_URL}/deployments`
            : `${API_BASE_URL}/deployments?namespace=${currentNamespace}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        deployments = await response.json();
        renderDeployments();
        hideLoading();
    } catch (error) {
        console.error('Error loading deployments:', error);
        showError(`Failed to load deployments: ${error.message}`);
        hideLoading();
    }
}

// Render deployments
function renderDeployments() {
    if (deployments.length === 0) {
        deploymentsContainer.innerHTML = '<div class="loading">No deployments found</div>';
        return;
    }
    
    deploymentsContainer.innerHTML = deployments.map(deployment => `
        <div class="deployment-card">
            <div class="deployment-header">
                <div>
                    <div class="deployment-name">${escapeHtml(deployment.name)}</div>
                    <div class="deployment-namespace">${escapeHtml(deployment.namespace)}</div>
                </div>
                <span class="status-badge ${deployment.isReady ? 'status-ready' : 'status-not-ready'}">
                    ${deployment.isReady ? 'Ready' : 'Not Ready'}
                </span>
            </div>
            
            <div class="deployment-info">
                <div class="info-row">
                    <span class="info-label">Pods:</span>
                    <span class="info-value">${deployment.readyReplicas} / ${deployment.replicas}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Available:</span>
                    <span class="info-value">${deployment.availableReplicas}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Unavailable:</span>
                    <span class="info-value">${deployment.unavailableReplicas || 0}</span>
                </div>
            </div>
            
            <div class="deployment-actions">
                <button class="btn-action btn-restart" onclick="restartDeployment('${deployment.namespace}', '${deployment.name}')">
                    Restart
                </button>
                <button class="btn-action btn-scale-up" onclick="scaleDeployment('${deployment.namespace}', '${deployment.name}', ${deployment.replicas + 1})">
                    Scale +1
                </button>
                <button class="btn-action btn-scale-down" onclick="scaleDeployment('${deployment.namespace}', '${deployment.name}', ${Math.max(0, deployment.replicas - 1)})">
                    Scale -1
                </button>
            </div>
            
            <div class="scale-input-group">
                <input 
                    type="number" 
                    class="scale-input" 
                    id="scale-${deployment.namespace}-${deployment.name}" 
                    value="${deployment.replicas}" 
                    min="0"
                    placeholder="Replicas"
                >
                <button 
                    class="btn-action btn-scale-apply" 
                    onclick="scaleDeploymentCustom('${deployment.namespace}', '${deployment.name}')"
                >
                    Set Replicas
                </button>
            </div>
        </div>
    `).join('');
}

// Restart deployment
async function restartDeployment(namespace, name) {
    if (!confirm(`Are you sure you want to restart deployment "${name}" in namespace "${namespace}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/deployments/${namespace}/${name}/restart`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to restart deployment');
        }
        
        const result = await response.json();
        alert(result.message || 'Deployment restarted successfully');
        loadDeployments();
    } catch (error) {
        alert(`Error: ${error.message}`);
        console.error('Error restarting deployment:', error);
    }
}

// Scale deployment
async function scaleDeployment(namespace, name, replicas) {
    if (replicas < 0) {
        alert('Replicas cannot be negative');
        return;
    }
    
    if (!confirm(`Scale deployment "${name}" in namespace "${namespace}" to ${replicas} replicas?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/deployments/${namespace}/${name}/scale`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ replicas }),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to scale deployment');
        }
        
        const result = await response.json();
        alert(result.message || 'Deployment scaled successfully');
        loadDeployments();
    } catch (error) {
        alert(`Error: ${error.message}`);
        console.error('Error scaling deployment:', error);
    }
}

// Scale deployment with custom value
async function scaleDeploymentCustom(namespace, name) {
    const input = document.getElementById(`scale-${namespace}-${name}`);
    const replicas = parseInt(input.value, 10);
    
    if (isNaN(replicas) || replicas < 0) {
        alert('Please enter a valid number of replicas (>= 0)');
        return;
    }
    
    await scaleDeployment(namespace, name, replicas);
}

// Utility functions
function showLoading() {
    loadingDiv.style.display = 'block';
    deploymentsContainer.innerHTML = '';
}

function hideLoading() {
    loadingDiv.style.display = 'none';
}

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function hideError() {
    errorDiv.style.display = 'none';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

