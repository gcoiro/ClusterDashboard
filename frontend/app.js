const API_BASE_URL = '/api';

// DOM elements
const namespaceSelect = document.getElementById('namespace-select');
const refreshBtn = document.getElementById('refresh-btn');
const deploymentsContainer = document.getElementById('deployments-container');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const homePanel = document.getElementById('home-panel');
const reportPage = document.getElementById('report-page');
const namespacePage = document.getElementById('namespace-page');
const gotoReportBtn = document.getElementById('goto-report');
const gotoNamespaceBtn = document.getElementById('goto-namespace');
const backHomeFromReport = document.getElementById('back-home-from-report');
const backHomeFromNamespace = document.getElementById('back-home-from-namespace');
const configPanel = document.getElementById('config-panel');
const configTitle = document.getElementById('config-title');
const configMeta = document.getElementById('config-meta');
const configStatus = document.getElementById('config-status');
const configSearch = document.getElementById('config-search');
const configViewMode = document.getElementById('config-view-mode');
const configProfiles = document.getElementById('config-profiles');
const configContent = document.getElementById('config-content');
const configClose = document.getElementById('config-close');
const reportRun = document.getElementById('report-run');
const reportDownload = document.getElementById('report-download');
const reportCollapseNs = document.getElementById('report-collapse-ns');
const reportCollapseApps = document.getElementById('report-collapse-apps');
const reportCollapseErrors = document.getElementById('report-collapse-errors');
const reportPattern = document.getElementById('report-pattern');
const reportScope = document.getElementById('report-scope');
const reportCase = document.getElementById('report-case');
const reportStatus = document.getElementById('report-status');
const reportResults = document.getElementById('report-results');
const reportNamespaceList = document.getElementById('report-namespace-list');
const reportSelectAll = document.getElementById('report-select-all');
const reportClear = document.getElementById('report-clear');
const namespaceScaleInput = document.getElementById('namespace-scale-input');
const namespaceScaleBtn = document.getElementById('namespace-scale-btn');
const namespaceScaleStatus = document.getElementById('namespace-scale-status');

const REPORT_RETRY_LIMIT = 3;
const REPORT_RETRY_DELAY_MS = 1000;

// State
let currentNamespace = '';
let workloads = [];
let configState = null;
let namespaces = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadNamespaces();

    showHomePage();

    gotoReportBtn.addEventListener('click', () => {
        showReportPage();
    });

    gotoNamespaceBtn.addEventListener('click', () => {
        showNamespacePage();
    });

    backHomeFromReport.addEventListener('click', () => {
        showHomePage();
    });

    backHomeFromNamespace.addEventListener('click', () => {
        showHomePage();
    });
    
    namespaceSelect.addEventListener('change', (e) => {
        currentNamespace = e.target.value;
        setNamespaceScaleStatus('', 'info');
        loadWorkloads();
    });
    
    refreshBtn.addEventListener('click', () => {
        setNamespaceScaleStatus('', 'info');
        loadWorkloads();
    });

    namespaceScaleBtn.addEventListener('click', () => {
        scaleNamespaceWorkloads();
    });

    namespaceScaleInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            scaleNamespaceWorkloads();
        }
    });

    configClose.addEventListener('click', () => {
        hideConfigPanel();
    });

    configSearch.addEventListener('input', () => {
        renderConfigSources();
    });

    configViewMode.addEventListener('change', () => {
        renderConfigSources();
    });

    reportRun.addEventListener('click', () => {
        runSpringConfigReport();
    });

    reportDownload.addEventListener('click', () => {
        downloadSpringConfigReport();
    });

    reportCollapseNs.addEventListener('click', () => {
        collapseAllNamespaces();
    });

    reportCollapseApps.addEventListener('click', () => {
        collapseAllApplications();
    });

    reportCollapseErrors.addEventListener('click', () => {
        collapseErrorApplications();
    });

    reportPattern.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            runSpringConfigReport();
        }
    });

    reportSelectAll.addEventListener('change', () => {
        const shouldSelect = reportSelectAll.checked;
        Array.from(reportNamespaceList.querySelectorAll('input[type=\"checkbox\"]'))
            .forEach(input => {
                input.checked = shouldSelect;
            });
        updateReportSelectionState();
    });

    reportClear.addEventListener('click', () => {
        Array.from(reportNamespaceList.querySelectorAll('input[type=\"checkbox\"]'))
            .forEach(input => {
                input.checked = false;
            });
        updateReportSelectionState();
    });

    reportNamespaceList.addEventListener('change', () => {
        updateReportSelectionState();
    });

    setReportStatus('Enter a regex pattern and run the report.', 'info');
});

// Load namespaces
async function loadNamespaces() {
    try {
        const response = await fetch(`${API_BASE_URL}/namespaces`);
        if (!response.ok) throw new Error('Failed to fetch namespaces');
        
        const fetchedNamespaces = await response.json();
        namespaces = fetchedNamespaces.map(ns => ns.name).filter(Boolean);
        
        namespaceSelect.innerHTML = '';
        
        namespaces.forEach(ns => {
            const option = document.createElement('option');
            option.value = ns;
            option.textContent = ns;
            namespaceSelect.appendChild(option);
        });

        if (namespaces.length > 0) {
            currentNamespace = namespaces[0];
            namespaceSelect.value = currentNamespace;
        }

        renderReportNamespaceList();

        if (namespaces.length > 0) {
            loadWorkloads();
        } else {
            deploymentsContainer.innerHTML = '<div class="loading">No namespaces found</div>';
        }
    } catch (error) {
        console.error('Error loading namespaces:', error);
    }
}

function renderReportNamespaceList() {
    reportNamespaceList.innerHTML = '';

    if (!namespaces.length) {
        reportNamespaceList.innerHTML = '<div class="report-empty">No namespaces available.</div>';
        reportSelectAll.checked = false;
        reportSelectAll.indeterminate = false;
        return;
    }

    const fragment = document.createDocumentFragment();
    namespaces.forEach(ns => {
        const label = document.createElement('label');
        label.className = 'report-namespace-item';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = ns;
        input.checked = ns === currentNamespace;
        const text = document.createElement('span');
        text.textContent = ns;
        label.append(input, text);
        fragment.appendChild(label);
    });

    reportNamespaceList.appendChild(fragment);
    updateReportSelectionState();
}

function getSelectedReportNamespaces() {
    return Array.from(reportNamespaceList.querySelectorAll('input[type="checkbox"]:checked'))
        .map(input => input.value);
}

function updateReportSelectionState() {
    const selected = getSelectedReportNamespaces();
    const total = namespaces.length;
    const allSelected = total > 0 && selected.length === total;
    const someSelected = selected.length > 0 && selected.length < total;

    reportSelectAll.checked = allSelected;
    reportSelectAll.indeterminate = someSelected;
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
    configViewMode.value = 'by-source';
    configStatus.textContent = '';
}

function setConfigStatus(message, type = 'info') {
    configStatus.textContent = message;
    configStatus.className = `config-status ${type}`;
}

function setReportStatus(message, type = 'info') {
    reportStatus.textContent = message;
    reportStatus.className = `report-status ${type}`;
}

function setNamespaceScaleStatus(message, type = 'info') {
    namespaceScaleStatus.textContent = message;
    namespaceScaleStatus.className = `namespace-scale-status ${type}`;
}

function showHomePage() {
    homePanel.style.display = 'block';
    reportPage.style.display = 'none';
    namespacePage.style.display = 'none';
    hideConfigPanel();
}

function showReportPage() {
    homePanel.style.display = 'none';
    reportPage.style.display = 'block';
    namespacePage.style.display = 'none';
    hideConfigPanel();
}

function showNamespacePage() {
    homePanel.style.display = 'none';
    reportPage.style.display = 'none';
    namespacePage.style.display = 'flex';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retryOptions = {}) {
    const {
        retries = REPORT_RETRY_LIMIT,
        delayMs = REPORT_RETRY_DELAY_MS,
        retryOnStatuses = [408, 429, 500, 502, 503, 504],
    } = retryOptions;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
            const response = await fetch(url, options);
            if (response.ok) {
                return response;
            }

            if (!retryOnStatuses.includes(response.status) || attempt === retries) {
                return response;
            }
        } catch (error) {
            if (attempt === retries) {
                throw error;
            }
        }

        await sleep(delayMs * attempt);
    }

    return fetch(url, options);
}

function buildReportCards(data) {
    const matches = data.matched || [];
    const errors = data.errors || [];
    const highlightPattern = reportPattern.value.trim();
    const highlightCaseInsensitive = reportCase.checked;
    let html = '';

    if (matches.length === 0) {
        html += '<div class="report-empty">No Spring applications matched this pattern.</div>';
    } else {
        html += matches.map(item => {
            const keys = item.matches || [];
            const kind = item.workloadKind || 'workload';
            const isDc = kind.toLowerCase() === 'deploymentconfig';
            const kindLabel = isDc ? 'DC' : 'Deployment';
            const kindClass = isDc ? 'type-dc' : 'type-deployment';
            const keyHtml = keys.map(keyEntry => {
                const valueText = keyEntry.value || '';
                const highlightedValue = highlightMatches(valueText, highlightPattern, highlightCaseInsensitive);
                return `
                    <div class="report-key">
                        <div class="report-key-name">${escapeHtml(keyEntry.key)}</div>
                        <div class="report-value">${highlightedValue}</div>
                        <span>${escapeHtml(keyEntry.source || 'effective')} | match: ${escapeHtml(keyEntry.matchOn || 'value')}</span>
                    </div>
                `;
            }).join('');

            return `
                <details class="report-card" data-kind="app" open>
                    <summary>
                        <span class="report-summary">
                            ${escapeHtml(item.workloadName)}
                            <span class="type-badge ${kindClass}">${escapeHtml(kindLabel)}</span>
                        </span>
                        <span class="config-count">${keys.length}</span>
                    </summary>
                    <div class="report-keys">${keyHtml}</div>
                </details>
            `;
        }).join('');
    }

    if (errors.length > 0) {
        const errorHtml = errors.map(err => `
            <div class="report-key">
                ${escapeHtml(err.workloadName)} (${escapeHtml(err.workloadKind || 'workload')})
                <span>${escapeHtml(err.message || 'Failed to fetch config')}</span>
            </div>
        `).join('');

        html += `
            <details class="report-card" data-kind="error" data-error="true">
                <summary>Skipped applications <span class="config-count">${errors.length}</span></summary>
                <div class="report-keys">${errorHtml}</div>
            </details>
        `;
    }

    return html;
}

function renderReportResults(data) {
    reportResults.innerHTML = buildReportCards(data);
}

function renderMultiNamespaceResults(reports) {
    if (!reports.length) {
        reportResults.innerHTML = '<div class="report-empty">No namespaces returned.</div>';
        return;
    }

    reportResults.innerHTML = reports.map(report => `
        <details class="report-namespace" data-namespace="${escapeHtml(report.namespace)}" open>
            <summary class="report-namespace-title">${escapeHtml(report.namespace)}</summary>
            <div class="report-namespace-body">${buildReportCards(report.data)}</div>
        </details>
    `).join('');
}

function highlightMatches(text, pattern, caseInsensitive) {
    if (!pattern) return escapeHtml(text);
    let regex;
    try {
        regex = new RegExp(pattern, caseInsensitive ? 'gi' : 'g');
    } catch (error) {
        return escapeHtml(text);
    }

    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        if (match[0] === '') {
            regex.lastIndex += 1;
            continue;
        }
        result += escapeHtml(text.slice(lastIndex, match.index));
        result += `<mark class="report-highlight">${escapeHtml(match[0])}</mark>`;
        lastIndex = match.index + match[0].length;
    }

    result += escapeHtml(text.slice(lastIndex));
    return result;
}

async function runSpringConfigReport() {
    const pattern = reportPattern.value.trim();
    const selectedNamespaces = getSelectedReportNamespaces();
    if (!pattern) {
        setReportStatus('Enter a regex pattern to search.', 'error');
        return;
    }
    if (!selectedNamespaces.length) {
        setReportStatus('Select at least one namespace to scan.', 'error');
        return;
    }

    const caseInsensitive = reportCase.checked;
    const searchIn = reportScope.value || 'value';
    const query = new URLSearchParams({
        pattern,
        caseInsensitive: caseInsensitive ? 'true' : 'false',
        searchIn,
    });

    reportResults.innerHTML = '';
    if (selectedNamespaces.length === 1) {
        await runSingleNamespaceReport(selectedNamespaces[0], query);
        return;
    }

    await runMultiNamespaceReport(selectedNamespaces, query);
}

async function runSingleNamespaceReport(namespace, query) {
    setReportStatus(`Running report for ${namespace}...`, 'info');

    try {
        const response = await fetchWithRetry(
            `${API_BASE_URL}/config/${namespace}/report?${query.toString()}`,
        );
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to fetch report');
        }
        const data = await response.json();
        const matchedCount = (data.matched || []).length;
        setReportStatus(`Found ${matchedCount} application(s) with matching entries in ${namespace}.`, 'success');
        renderReportResults(data);
    } catch (error) {
        console.error('Error running config report:', error);
        setReportStatus(`Error: ${error.message}`, 'error');
        reportResults.innerHTML = '';
    }
}

async function runMultiNamespaceReport(targetNamespaces, query) {
    if (!targetNamespaces.length) {
        setReportStatus('No namespaces available to search.', 'error');
        return;
    }

    reportResults.innerHTML = '';
    setReportStatus(`Running report across ${targetNamespaces.length} namespaces (10 at a time)...`, 'info');

    const reports = [];
    let processed = 0;
    const concurrency = 10;
    let index = 0;

    async function worker() {
        while (index < targetNamespaces.length) {
            const namespace = targetNamespaces[index];
            index += 1;
            try {
                const response = await fetchWithRetry(
                    `${API_BASE_URL}/config/${namespace}/report?${query.toString()}`,
                );
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || 'Failed to fetch report');
                }
                const data = await response.json();
                reports.push({ namespace, data });
            } catch (error) {
                reports.push({
                    namespace,
                    data: { matched: [], errors: [{ workloadName: namespace, workloadKind: 'namespace', message: error.message }] },
                });
            } finally {
                processed += 1;
                setReportStatus(`Processed ${processed}/${targetNamespaces.length} namespaces...`, 'info');
            }
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, targetNamespaces.length) }, () => worker());
    await Promise.all(workers);

    reports.sort((a, b) => a.namespace.localeCompare(b.namespace));
    setReportStatus(`Finished report for ${targetNamespaces.length} namespaces.`, 'success');
    renderMultiNamespaceResults(reports);
}

async function downloadSpringConfigReport() {
    const pattern = reportPattern.value.trim();
    const selectedNamespaces = getSelectedReportNamespaces();
    if (!pattern) {
        setReportStatus('Enter a regex pattern to search.', 'error');
        return;
    }
    if (selectedNamespaces.length !== 1) {
        setReportStatus('Select exactly one namespace to download a CSV.', 'error');
        return;
    }

    const targetNamespace = selectedNamespaces[0];

    const caseInsensitive = reportCase.checked;
    const searchIn = reportScope.value || 'value';
    const query = new URLSearchParams({
        pattern,
        caseInsensitive: caseInsensitive ? 'true' : 'false',
        searchIn,
    });

    setReportStatus('Preparing CSV download...', 'info');

    try {
        const response = await fetch(`${API_BASE_URL}/config/${targetNamespace}/report.csv?${query.toString()}`);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to download report');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `spring-config-report-${targetNamespace}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setReportStatus('CSV downloaded.', 'success');
    } catch (error) {
        console.error('Error downloading config report:', error);
        setReportStatus(`Error: ${error.message}`, 'error');
    }
}

function collapseAllNamespaces() {
    const namespaceDetails = reportResults.querySelectorAll('.report-namespace');
    namespaceDetails.forEach(detail => {
        detail.open = false;
    });
}

function collapseAllApplications() {
    const appDetails = reportResults.querySelectorAll('.report-card[data-kind="app"]');
    appDetails.forEach(detail => {
        detail.open = false;
    });
}

function collapseErrorApplications() {
    const errorDetails = reportResults.querySelectorAll('.report-card[data-error="true"]');
    errorDetails.forEach(detail => {
        detail.open = false;
    });
}

function extractEnvDetails(payload) {
    if (!payload || typeof payload !== 'object') {
        return { propertySources: [], activeProfiles: [] };
    }

    if (payload.propertySources) {
        return {
            propertySources: payload.propertySources,
            activeProfiles: payload.activeProfiles || [],
        };
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

function normalizePropertyValue(value) {
    return value && typeof value === 'object' && 'value' in value ? value.value : value;
}

function getSourceCategory(sourceName, workloadName) {
    if (!sourceName) return { key: 'other', label: 'Other source' };

    if (sourceName.includes('classpath:/bootstrap.yml')) {
        return { key: 'bootstrap', label: 'bootstrap.yml' };
    }

    if (sourceName.startsWith('bootstrapProperties-') && sourceName.includes('/application.yml')) {
        return { key: 'config-app', label: 'config application.yml' };
    }

    if (workloadName && sourceName.startsWith('bootstrapProperties-') && sourceName.includes(`/${workloadName}.yml`)) {
        return { key: 'config-workload', label: `config ${workloadName}.yml` };
    }

    return { key: 'other', label: 'Other source' };
}

function buildEffectiveIndex(propertySources) {
    const sourceIndexByKey = {};
    const sourceNameByKey = {};
    const valueByKey = {};

    propertySources.forEach((source, index) => {
        const properties = source.properties || {};
        Object.entries(properties).forEach(([key, value]) => {
            if (key in sourceIndexByKey) return;
            sourceIndexByKey[key] = index;
            sourceNameByKey[key] = source.name || 'propertySource';
            valueByKey[key] = normalizePropertyValue(value);
        });
    });

    return { sourceIndexByKey, sourceNameByKey, valueByKey };
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
    const viewMode = configViewMode.value;

    if (sources.length === 0) {
        configContent.innerHTML = '<div class="config-empty">No property sources found.</div>';
        return;
    }

    if (viewMode === 'effective') {
        renderEffectiveConfig(searchTerm);
        return;
    }

    if (viewMode === 'by-key') {
        renderConfigByKey(searchTerm);
        return;
    }

    if (viewMode === 'chain') {
        renderConfigChain(searchTerm);
        return;
    }

    const sourceHtml = sources.map((source, index) => {
        const properties = source.properties || {};
        const entries = Object.entries(properties)
            .map(([key, value]) => {
                const propertyValue = normalizePropertyValue(value);
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

        const rows = entries.map(entry => {
            const effectiveIndex = configState.effectiveIndex.sourceIndexByKey[entry.key];
            const effectiveSource = configState.effectiveIndex.sourceNameByKey[entry.key];
            const isEffective = effectiveIndex === index;
            const meta = isEffective
                ? `<div class="config-value-meta"><span class="config-badge badge-effective">effective</span><span class="config-source-label">${escapeHtml(effectiveSource)}</span></div>`
                : `<div class="config-value-meta"><span class="config-badge badge-overridden">overridden</span><span class="config-source-label">by ${escapeHtml(effectiveSource)}</span></div>`;

            return `
                <div class="config-row">
                    <div class="config-key">${escapeHtml(entry.key)}</div>
                    <div class="config-value">
                        ${escapeHtml(entry.value)}
                        ${meta}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <details class="config-source" open>
                <summary>${escapeHtml(source.name || 'propertySource')} <span class="config-count">${entries.length}</span></summary>
                <div class="config-rows">${rows}</div>
            </details>
        `;
    }).join('');

    configContent.innerHTML = sourceHtml || '<div class="config-empty">No matching properties.</div>';
}

function renderEffectiveConfig(searchTerm) {
    const effectiveKeys = Object.keys(configState.effectiveIndex.valueByKey);
    const entries = effectiveKeys
        .map(key => ({
            key,
            value: formatValue(configState.effectiveIndex.valueByKey[key]),
            source: configState.effectiveIndex.sourceNameByKey[key],
        }))
        .filter(entry => {
            if (!searchTerm) return true;
            return entry.key.toLowerCase().includes(searchTerm)
                || entry.value.toLowerCase().includes(searchTerm)
                || entry.source.toLowerCase().includes(searchTerm);
        })
        .sort((a, b) => a.key.localeCompare(b.key));

    if (entries.length === 0) {
        configContent.innerHTML = '<div class="config-empty">No matching properties.</div>';
        return;
    }

    const rows = entries.map(entry => `
        <div class="config-row">
            <div class="config-key">${escapeHtml(entry.key)}</div>
            <div class="config-value">
                ${escapeHtml(entry.value)}
                <div class="config-value-meta">
                    <span class="config-badge badge-effective">effective</span>
                    <span class="config-source-label">${escapeHtml(entry.source)}</span>
                </div>
            </div>
        </div>
    `).join('');

    configContent.innerHTML = `
        <details class="config-source" open>
            <summary>Effective configuration <span class="config-count">${entries.length}</span></summary>
            <div class="config-rows">${rows}</div>
        </details>
    `;
}

function renderConfigByKey(searchTerm) {
    const sources = configState.propertySources || [];
    const keyMap = {};

    sources.forEach((source, index) => {
        const properties = source.properties || {};
        const sourceName = source.name || 'propertySource';
        Object.entries(properties).forEach(([key, value]) => {
            if (!keyMap[key]) {
                keyMap[key] = [];
            }
            keyMap[key].push({
                sourceIndex: index,
                sourceName,
                value: formatValue(normalizePropertyValue(value)),
            });
        });
    });

    const keys = Object.keys(keyMap)
        .filter(key => {
            if (!searchTerm) return true;
            const matchesKey = key.toLowerCase().includes(searchTerm);
            const matchesValue = keyMap[key].some(entry =>
                entry.value.toLowerCase().includes(searchTerm) || entry.sourceName.toLowerCase().includes(searchTerm)
            );
            return matchesKey || matchesValue;
        })
        .sort((a, b) => a.localeCompare(b));

    if (keys.length === 0) {
        configContent.innerHTML = '<div class="config-empty">No matching properties.</div>';
        return;
    }

    const html = keys.map(key => {
        const stack = keyMap[key];
        const effectiveSource = configState.effectiveIndex.sourceNameByKey[key];
        const rows = stack.map(entry => {
            const isEffective = entry.sourceIndex === configState.effectiveIndex.sourceIndexByKey[key];
            const meta = isEffective
                ? `<div class="config-value-meta"><span class="config-badge badge-effective">effective</span><span class="config-source-label">${escapeHtml(entry.sourceName)}</span></div>`
                : `<div class="config-value-meta"><span class="config-badge badge-overridden">overridden</span><span class="config-source-label">by ${escapeHtml(effectiveSource)}</span></div>`;
            return `
                <div class="config-row">
                    <div class="config-key">${escapeHtml(entry.sourceName)}</div>
                    <div class="config-value">
                        ${escapeHtml(entry.value)}
                        ${meta}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <details class="config-source">
                <summary>${escapeHtml(key)} <span class="config-count">${stack.length}</span></summary>
                <div class="config-rows">${rows}</div>
            </details>
        `;
    }).join('');

    configContent.innerHTML = html;
}

function renderConfigChain(searchTerm) {
    const sources = configState.propertySources || [];
    const workloadName = configState.workloadName;
    const chainOrder = ['bootstrap', 'config-app', 'config-workload'];
    const sections = chainOrder.map(chainKey => {
        const matchingSources = sources
            .map((source, index) => ({ source, index }))
            .filter(item => getSourceCategory(item.source.name || '', workloadName).key === chainKey);

        if (matchingSources.length === 0) {
            return '';
        }

        const label = getSourceCategory(matchingSources[0].source.name || '', workloadName).label;
        const sourceBlocks = matchingSources.map(({ source, index }) => {
            const properties = source.properties || {};
            const entries = Object.entries(properties)
                .map(([key, value]) => {
                    const propertyValue = normalizePropertyValue(value);
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

            const rows = entries.map(entry => {
                const effectiveIndex = configState.effectiveIndex.sourceIndexByKey[entry.key];
                const effectiveSource = configState.effectiveIndex.sourceNameByKey[entry.key];
                const isEffective = effectiveIndex === index;
                const meta = isEffective
                    ? `<div class="config-value-meta"><span class="config-badge badge-effective">effective</span><span class="config-source-label">${escapeHtml(effectiveSource)}</span></div>`
                    : `<div class="config-value-meta"><span class="config-badge badge-overridden">overridden</span><span class="config-source-label">by ${escapeHtml(effectiveSource)}</span></div>`;

                return `
                    <div class="config-row">
                        <div class="config-key">${escapeHtml(entry.key)}</div>
                        <div class="config-value">
                            ${escapeHtml(entry.value)}
                            ${meta}
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <details class="config-source" open>
                    <summary>${escapeHtml(source.name || label)} <span class="config-count">${entries.length}</span></summary>
                    <div class="config-rows">${rows}</div>
                </details>
            `;
        }).join('');

        if (!sourceBlocks) {
            return '';
        }

        return `
            <details class="config-source" open>
                <summary>${escapeHtml(label)}</summary>
                <div class="config-rows">${sourceBlocks}</div>
            </details>
        `;
    }).join('');

    configContent.innerHTML = sections || '<div class="config-empty">No matching properties in the config chain.</div>';
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
            workloadName: data.workloadName,
            effectiveIndex: buildEffectiveIndex(propertySources),
        };

        configTitle.textContent = `Spring Config Explorer`;
        const locationLabel = data.serviceName
            ? `Service ${data.serviceName}`
            : `Pod ${data.podName || 'unknown'}`;
        const hostLabel = data.serviceHost || data.podIP || 'n/a';
        configMeta.textContent = `${data.workloadName} (${data.workloadKind}) | ${data.namespace} | ${locationLabel} | ${hostLabel}:${data.port || 'n/a'}`;
        setConfigStatus(`Loaded from ${data.actuatorUrl || 'actuator'} (higher precedence first)`, 'success');

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
        const result = await scaleWorkloadRequest(kind, namespace, name, replicas);
        alert(result.message || 'Workload scaled successfully');
        loadWorkloads();
    } catch (error) {
        alert(`Error: ${error.message}`);
        console.error('Error scaling workload:', error);
    }
}

async function scaleWorkloadRequest(kind, namespace, name, replicas) {
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

    return response.json();
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

async function scaleNamespaceWorkloads() {
    if (!currentNamespace) {
        setNamespaceScaleStatus('Select a namespace first.', 'error');
        return;
    }

    const replicas = parseInt(namespaceScaleInput.value, 10);
    if (isNaN(replicas) || replicas < 0) {
        setNamespaceScaleStatus('Enter a replica count of 0 or more.', 'error');
        return;
    }

    if (!workloads.length) {
        setNamespaceScaleStatus('No workloads to scale in this namespace.', 'error');
        return;
    }

    const targetWorkloads = workloads.filter(workload => workload.name && workload.namespace === currentNamespace);
    if (!targetWorkloads.length) {
        setNamespaceScaleStatus('No workloads to scale in this namespace.', 'error');
        return;
    }

    if (!confirm(`Scale ${targetWorkloads.length} workload(s) in "${currentNamespace}" to ${replicas} replicas?`)) {
        return;
    }

    namespaceScaleBtn.disabled = true;
    setNamespaceScaleStatus(`Scaling ${targetWorkloads.length} workload(s)...`, 'info');

    const errors = [];
    let completed = 0;
    let index = 0;
    const concurrency = Math.min(5, targetWorkloads.length);

    async function worker() {
        while (index < targetWorkloads.length) {
            const workload = targetWorkloads[index];
            index += 1;
            try {
                await scaleWorkloadRequest(workload.kind, workload.namespace, workload.name, replicas);
            } catch (error) {
                errors.push(`${workload.name}: ${error.message}`);
            } finally {
                completed += 1;
                setNamespaceScaleStatus(`Scaled ${completed}/${targetWorkloads.length} workload(s)...`, 'info');
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    namespaceScaleBtn.disabled = false;

    if (errors.length) {
        setNamespaceScaleStatus(`Scaled with ${errors.length} error(s).`, 'error');
        console.error('Namespace scale errors:', errors);
    } else {
        setNamespaceScaleStatus('All workloads scaled successfully.', 'success');
    }

    loadWorkloads();
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

