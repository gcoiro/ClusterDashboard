const API_BASE_URL = '/api';

// DOM elements
const namespaceSelect = document.getElementById('namespace-select');
const refreshBtn = document.getElementById('refresh-btn');
const deploymentsContainer = document.getElementById('deployments-container');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const configPanel = document.getElementById('config-panel');
const configTitle = document.getElementById('config-title');
const configMeta = document.getElementById('config-meta');
const configStatus = document.getElementById('config-status');
const configSearch = document.getElementById('config-search');
const configProfiles = document.getElementById('config-profiles');
const configContent = document.getElementById('config-content');
const configClose = document.getElementById('config-close');

// State
let currentNamespace = '';
let workloads = [];
let configState = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadNamespaces();
    
    namespaceSelect.addEventListener('change', (e) => {
        currentNamespace = e.target.value;
        loadWorkloads();
    });
    
    refreshBtn.addEventListener('click', () => {
        loadWorkloads();
    });

    configClose.addEventListener('click', () => {
        hideConfigPanel();
    });

    configSearch.addEventListener('input', () => {
        renderConfigSources();
    });
});

// Load namespaces
async function loadNamespaces() {
    try {
        const response = await fetch(`${API_BASE_URL}/namespaces`);
        if (!response.ok) throw new Error('Failed to fetch namespaces');
        
        const namespaces = await response.json();
        
        namespaceSelect.innerHTML = '';
        
        namespaces.forEach(ns => {
            const option = document.createElement('option');
            option.value = ns.name;
            option.textContent = ns.name;
            namespaceSelect.appendChild(option);
        });

        if (namespaces.length > 0) {
            currentNamespace = namespaces[0].name;
            namespaceSelect.value = currentNamespace;
            loadWorkloads();
        } else {
            deploymentsContainer.innerHTML = '<div class="loading">No namespaces found</div>';
        }
    } catch (error) {
        console.error('Error loading namespaces:', error);
    }
}

// Load workloads
async function loadWorkloads() {
    showLoading();
    hideError();
    
    try {
        if (!currentNamespace) {
            deploymentsContainer.innerHTML = '<div class="loading">Select a namespace</div>';
            hideLoading();
            return;
        }

        const [deploymentsResponse, dcsResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/${currentNamespace}/deployments`),
            fetch(`${API_BASE_URL}/${currentNamespace}/deploymentconfigs`),
        ]);

        if (!deploymentsResponse.ok) {
            const errorData = await deploymentsResponse.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP ${deploymentsResponse.status}: ${deploymentsResponse.statusText}`);
        }

        if (!dcsResponse.ok) {
            const errorData = await dcsResponse.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP ${dcsResponse.status}: ${dcsResponse.statusText}`);
        }

        const deployments = await deploymentsResponse.json();
        const deploymentConfigs = await dcsResponse.json();

        workloads = [
            ...deployments.map(item => ({ ...item, kindLabel: 'Deployment' })),
            ...deploymentConfigs.map(item => ({ ...item, kindLabel: 'DC' })),
        ];

        renderWorkloads();
        hideLoading();
    } catch (error) {
        console.error('Error loading workloads:', error);
        showError(`Failed to load workloads: ${error.message}`);
        hideLoading();
    }
}

// Render workloads
function renderWorkloads() {
    if (workloads.length === 0) {
        deploymentsContainer.innerHTML = '<div class="loading">No deployments or deploymentconfigs found</div>';
        return;
    }
    
    workloads.sort((a, b) => a.name.localeCompare(b.name));

    deploymentsContainer.innerHTML = workloads.map(workload => `
        <div class="deployment-card">
            <div class="deployment-header">
                <div>
                    <div class="deployment-name">${escapeHtml(workload.name)}</div>
                    <div class="deployment-namespace">${escapeHtml(workload.namespace)}</div>
                </div>
                <span class="type-badge ${workload.kind === 'deploymentconfig' ? 'type-dc' : 'type-deployment'}">
                    ${workload.kindLabel}
                </span>
            </div>
            
            <div class="deployment-info">
                <div class="info-row">
                    <span class="info-label">Replicas:</span>
                    <span class="info-value">${workload.replicas}</span>
                </div>
            </div>
            
            <div class="deployment-actions">
                <button class="btn-action btn-scale-up" onclick="scaleWorkload('${workload.kind}', '${workload.namespace}', '${workload.name}', ${workload.replicas + 1})">
                    Scale +1
                </button>
                <button class="btn-action btn-scale-down" onclick="scaleWorkload('${workload.kind}', '${workload.namespace}', '${workload.name}', ${Math.max(0, workload.replicas - 1)})">
                    Scale -1
                </button>
                <button class="btn-action btn-config" onclick="viewSpringConfig('${workload.namespace}', '${workload.name}', '${workload.kindLabel}')">
                    View Spring Config
                </button>
            </div>
            
            <div class="scale-input-group">
                <input 
                    type="number" 
                    class="scale-input"  
                    id="scale-${workload.namespace}-${workload.name}" 
                    value="${workload.replicas}" 
                    min="0"
                    placeholder="Replicas"
                >
                <button 
                    class="btn-action btn-scale-apply" 
                    onclick="scaleWorkloadCustom('${workload.kind}', '${workload.namespace}', '${workload.name}')"
                >
                    Set Replicas
                </button>
            </div>
        </div>
    `).join('');
}

function showConfigPanel() {
    configPanel.style.display = 'block';
}

function hideConfigPanel() {
    configPanel.style.display = 'none';
    configState = null;
    configContent.innerHTML = '';
    configProfiles.innerHTML = '';
    configSearch.value = '';
    configStatus.textContent = '';
}

function setConfigStatus(message, type = 'info') {
    configStatus.textContent = message;
    configStatus.className = `config-status ${type}`;
}

function extractEnvDetails(payload) {
    if (!payload || typeof payload !== 'object') {
        return { propertySources: [], activeProfiles: [] };
    }

    if (payload.details && payload.details.propertySources) {
        return {
            propertySources: payload.details.propertySources,
            activeProfiles: payload.details.activeProfiles || [],
        };
    }

    if (payload.components && payload.components.env && payload.components.env.details) {
        return {
            propertySources: payload.components.env.details.propertySources || [],
            activeProfiles: payload.components.env.details.activeProfiles || [],
        };
    }

    return { propertySources: [], activeProfiles: [] };
}

function formatValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value);
    } catch (error) {
        return String(value);
    }
}

function renderProfiles(activeProfiles) {
    if (!activeProfiles || activeProfiles.length === 0) {
        configProfiles.innerHTML = '<span class="profile-chip profile-empty">No active profiles</span>';
        return;
    }

    configProfiles.innerHTML = activeProfiles
        .map(profile => `<span class="profile-chip">${escapeHtml(profile)}</span>`)
        .join('');
}

function renderConfigSources() {
    if (!configState) {
        configContent.innerHTML = '';
        return;
    }

    const searchTerm = configSearch.value.trim().toLowerCase();
    const sources = configState.propertySources || [];

    if (sources.length === 0) {
        configContent.innerHTML = '<div class="config-empty">No property sources found.</div>';
        return;
    }

    const sourceHtml = sources.map(source => {
        const properties = source.properties || {};
        const entries = Object.entries(properties)
            .map(([key, value]) => {
                const propertyValue = value && typeof value === 'object' && 'value' in value ? value.value : value;
                return { key, value: formatValue(propertyValue) };
            })
            .filter(entry => {
                if (!searchTerm) return true;
                return entry.key.toLowerCase().includes(searchTerm)
                    || entry.value.toLowerCase().includes(searchTerm);
            });

        if (entries.length === 0) {
            return '';
        }

        const rows = entries.map(entry => `
            <div class="config-row">
                <div class="config-key">${escapeHtml(entry.key)}</div>
                <div class="config-value">${escapeHtml(entry.value)}</div>
            </div>
        `).join('');

        return `
            <details class="config-source" open>
                <summary>${escapeHtml(source.name || 'propertySource')} <span class="config-count">${entries.length}</span></summary>
                <div class="config-rows">${rows}</div>
            </details>
        `;
    }).join('');

    configContent.innerHTML = sourceHtml || '<div class="config-empty">No matching properties.</div>';
}

async function viewSpringConfig(namespace, workloadName, kindLabel) {
    showConfigPanel();
    configTitle.textContent = `Spring Config Explorer`;
    configMeta.textContent = `Loading ${workloadName} (${kindLabel}) in ${namespace}...`;
    setConfigStatus('Fetching config from running pod...', 'info');
    configContent.innerHTML = '';
    configProfiles.innerHTML = '';

    try {
        const response = await fetch(`${API_BASE_URL}/config/${namespace}/${workloadName}`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData.detail?.message || errorData.detail || 'Failed to fetch config';
            throw new Error(message);
        }

        const data = await response.json();
        const payload = data.payload || data;
        const { propertySources, activeProfiles } = extractEnvDetails(payload);

        configState = {
            propertySources,
            activeProfiles,
        };

        configTitle.textContent = `Spring Config Explorer`;
        const locationLabel = data.serviceName
            ? `Service ${data.serviceName}`
            : `Pod ${data.podName || 'unknown'}`;
        const hostLabel = data.serviceHost || data.podIP || 'n/a';
        configMeta.textContent = `${data.workloadName} (${data.workloadKind}) | ${data.namespace} | ${locationLabel} | ${hostLabel}:${data.port || 'n/a'}`;
        setConfigStatus(`Loaded from ${data.actuatorUrl || 'actuator'}`, 'success');

        renderProfiles(activeProfiles);
        renderConfigSources();
    } catch (error) {
        console.error('Error loading spring config:', error);
        setConfigStatus(`Error: ${error.message}`, 'error');
        configContent.innerHTML = '';
    }
}

// Scale workload
async function scaleWorkload(kind, namespace, name, replicas) {
    if (replicas < 0) {
        alert('Replicas cannot be negative');
        return;
    }
    
    if (!confirm(`Scale ${kind} "${name}" in namespace "${namespace}" to ${replicas} replicas?`)) {
        return;
    }
    
    try {
        const endpoint = kind === 'deploymentconfig'
            ? `${API_BASE_URL}/deploymentconfigs/${namespace}/${name}/scale`
            : `${API_BASE_URL}/deployments/${namespace}/${name}/scale`;

        const response = await fetch(endpoint, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ replicas }),
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to scale workload');
        }
        
        const result = await response.json();
        alert(result.message || 'Workload scaled successfully');
        loadWorkloads();
    } catch (error) {
        alert(`Error: ${error.message}`);
        console.error('Error scaling workload:', error);
    }
}

// Scale workload with custom value
async function scaleWorkloadCustom(kind, namespace, name) {
    const input = document.getElementById(`scale-${namespace}-${name}`);
    const replicas = parseInt(input.value, 10);
    
    if (isNaN(replicas) || replicas < 0) {
        alert('Please enter a valid number of replicas (>= 0)');
        return;
    }
    
    await scaleWorkload(kind, namespace, name, replicas);
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

