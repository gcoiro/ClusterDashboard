const API_BASE_URL = '/api';

// DOM elements
const namespaceSelect = document.getElementById('namespace-select');
const refreshBtn = document.getElementById('refresh-btn');
const deploymentsContainer = document.getElementById('deployments-container');
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const homePanel = document.getElementById('home-panel');
const reportPage = document.getElementById('report-page');
const reportPanel = document.getElementById('report-panel');
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
const configAgentRun = document.getElementById('config-agent-run');
const reportRun = document.getElementById('report-run');
const reportSave = document.getElementById('report-save');
const reportLoad = document.getElementById('report-load');
const reportLoadInput = document.getElementById('report-load-input');

const reportActions = document.querySelector('.report-actions');
const reportDownload = document.getElementById('report-download');
const reportCollapseNs = document.getElementById('report-collapse-ns');
const reportCollapseApps = document.getElementById('report-collapse-apps');
const reportCollapseErrors = document.getElementById('report-collapse-errors');
const reportApplyAgentAll = document.getElementById('report-apply-agent-all');
const reportSelectKeys = document.getElementById('report-select-keys');
const reportClearSelection = document.getElementById('report-clear-selection');
const reportPattern = document.getElementById('report-pattern');
const reportScope = document.getElementById('report-scope');
const reportCase = document.getElementById('report-case');
const reportStatus = document.getElementById('report-status');
const reportResults = document.getElementById('report-results');
const reportNamespaceList = document.getElementById('report-namespace-list');
const reportSelectAll = document.getElementById('report-select-all');
const reportClear = document.getElementById('report-clear');
const reportHistorySelect = document.getElementById('report-history-select');
const reportHistoryApply = document.getElementById('report-history-apply');
const reportHistoryClear = document.getElementById('report-history-clear');
const reportHistoryList = document.getElementById('report-history-list');
const reportSearchTerm = document.getElementById('report-search-term');
const reportSearchScope = document.getElementById('report-search-scope');
const reportSearchCase = document.getElementById('report-search-case');
const reportSearchSelect = document.getElementById('report-search-select');
const reportSearchAdd = document.getElementById('report-search-add');
const reportSearchClear = document.getElementById('report-search-clear');
const reportSearchStatus = document.getElementById('report-search-status');
const reportSearchJustified = document.getElementById('report-search-justified');
const reportSearchMigration = document.getElementById('report-search-migration');
const reportSearchUnset = document.getElementById('report-search-unset');
const reportVisuals = document.getElementById('report-visuals');
const reportNamespaceChart = document.getElementById('report-namespace-chart');
const reportNamespaceLegend = document.getElementById('report-namespace-legend');
const reportAppChart = document.getElementById('report-app-chart');
const reportAppLegend = document.getElementById('report-app-legend');
const reportAppChartTitle = document.getElementById('report-app-chart-title');
const reportDrilldown = document.getElementById('report-drilldown');
const reportResetView = document.getElementById('report-reset-view');
const reportSummaryBtn = document.getElementById('report-summary');
const namespaceScaleInput = document.getElementById('namespace-scale-input');
const namespaceScaleBtn = document.getElementById('namespace-scale-btn');
const namespaceScaleStatus = document.getElementById('namespace-scale-status');
const agentFailureModal = document.getElementById('agent-failure-modal');
const agentFailureTitle = document.getElementById('agent-failure-title');
const agentFailureSummary = document.getElementById('agent-failure-summary');
const agentFailureList = document.getElementById('agent-failure-list');
const agentApplySummaryModal = document.getElementById('agent-apply-summary-modal');
const agentApplySummaryTitle = document.getElementById('agent-apply-summary-title');
const agentApplySummaryMeta = document.getElementById('agent-apply-summary-meta');
const agentApplySummarySuccess = document.getElementById('agent-apply-summary-success');
const agentApplySummaryFailures = document.getElementById('agent-apply-summary-failures');

const REPORT_RETRY_LIMIT = 3;
const REPORT_RETRY_DELAY_MS = 1000;
const REPORT_HISTORY_KEY = 'springConfigReportHistory';
const REPORT_HISTORY_LIMIT = 12;
const REPORT_SNAPSHOT_VERSION = 1;
const REPORT_ANNOTATION_SAVE_DELAY_MS = 300;
const ROLLOUT_POLL_INTERVAL_MS = 10000;
const ROLLOUT_POLL_LIMIT = 60;
const REPORT_STATUS_STYLES = {
    justified: { label: 'Justified', color: '#22c55e' },
    migration: { label: 'Migration Required', color: '#ef4444' },
    'not-worked': { label: 'Not worked', color: '#f59e0b' },
    skipped: { label: 'Skipped Application', color: '#94a3b8' },
};
const REPORT_STATUS_ORDER = ['justified', 'migration', 'not-worked', 'skipped'];

// State
let currentNamespace = '';
let workloads = [];
let configState = null;
let namespaces = [];
let reportResultsState = null;
let lastReportHistorySignature = null;
const reportAnnotations = new Map();
const reportAnnotationSeeds = new Map();
let reportViewState = { namespace: null, app: null };
let reportAnnotationSaveTimer = null;
let reportNamespaceChartMode = 'detail';
let reportNamespaceCount = 0;
const REPORT_NAMESPACE_PIE_LIMIT = 120;

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

    if (configAgentRun) {
        configAgentRun.addEventListener('click', () => {
            runSpringConfigAgent();
        });
    }

    configSearch.addEventListener('input', () => {
        renderConfigSources();
    });

    configViewMode.addEventListener('change', () => {
        renderConfigSources();
    });

    reportRun.addEventListener('click', () => {
        runSpringConfigReport();
    });

    if (reportSave) {
        reportSave.addEventListener('click', () => {
            downloadReportSnapshot();
        });
    }

    if (reportLoad && reportLoadInput) {
        reportLoad.addEventListener('click', () => {
            reportLoadInput.click();
        });
        reportLoadInput.addEventListener('change', (event) => {
            handleReportLoad(event);
        });
    }

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

    if (reportApplyAgentAll) {
        reportApplyAgentAll.addEventListener('click', (event) => {
            const buttonEl = event.currentTarget;
            applySpringConfigAgentToAllApps(buttonEl);
        });
    }

    if (reportSelectKeys) {
        reportSelectKeys.addEventListener('click', () => {
            setReportKeySelection(true);
        });
    }

    if (reportClearSelection) {
        reportClearSelection.addEventListener('click', () => {
            setReportKeySelection(false);
        });
    }

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

    if (reportHistoryApply) {
        reportHistoryApply.addEventListener('click', () => {
            applyReportHistorySelection();
        });
    }

    if (reportHistorySelect) {
        reportHistorySelect.addEventListener('change', () => {
            applyReportHistorySelection();
        });
    }

    if (reportHistoryClear) {
        reportHistoryClear.addEventListener('click', () => {
            clearReportHistory();
        });
    }

    if (reportSearchSelect) {
        reportSearchSelect.addEventListener('click', () => {
            runReportSearchSelection('replace');
        });
    }

    if (reportSearchAdd) {
        reportSearchAdd.addEventListener('click', () => {
            runReportSearchSelection('add');
        });
    }

    if (reportSearchClear) {
        reportSearchClear.addEventListener('click', () => {
            setReportKeySelection(false);
            updateReportSearchStatus('Selection cleared.', 'info');
        });
    }

    if (reportSearchTerm) {
        reportSearchTerm.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                runReportSearchSelection('replace');
            }
        });
    }

    if (reportSearchJustified) {
        reportSearchJustified.addEventListener('click', () => {
            applyReportSelectionFlag('justified');
        });
    }

    if (reportSearchMigration) {
        reportSearchMigration.addEventListener('click', () => {
            applyReportSelectionFlag('migrationRequired');
        });
    }

    if (reportSearchUnset) {
        reportSearchUnset.addEventListener('click', () => {
            applyReportSelectionFlag('clear');
        });
    }

    if (reportHistoryList) {
        reportHistoryList.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-history-index]');
            if (!button) {
                return;
            }
            const index = Number(button.dataset.historyIndex);
            applyReportHistoryEntryByIndex(index);
        });
    }

    if (reportResetView) {
        reportResetView.addEventListener('click', () => {
            resetReportDrilldown();
        });
    }

    if (reportSummaryBtn) {
        reportSummaryBtn.addEventListener('click', () => {
            openReportSummaryTab();
        });
    }

    if (agentFailureModal) {
        agentFailureModal.addEventListener('click', (event) => {
            const target = event.target.closest('[data-modal-close]');
            if (target) {
                closeAgentFailureModal();
            }
        });
    }

    if (agentApplySummaryModal) {
        agentApplySummaryModal.addEventListener('click', (event) => {
            const target = event.target.closest('[data-modal-close]');
            if (target) {
                closeAgentApplySummaryModal();
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (agentFailureModal && agentFailureModal.classList.contains('is-visible')) {
                closeAgentFailureModal();
            }
            if (agentApplySummaryModal && agentApplySummaryModal.classList.contains('is-visible')) {
                closeAgentApplySummaryModal();
            }
        }
    });

    reportResults.addEventListener('click', (event) => {
        const target = getEventTargetElement(event);
        if (!target) {
            return;
        }
        const namespaceButton = target.closest('button[data-namespace-action]');
        if (namespaceButton) {
            event.preventDefault();
            event.stopPropagation();
            const action = namespaceButton.dataset.namespaceAction;
            const namespace = namespaceButton.dataset.namespace;
            if (namespace && (action === 'select' || action === 'clear')) {
                setNamespaceReportKeySelection(namespace, action === 'select');
            }
            return;
        }
        const keyCard = target.closest('.report-key');
        if (!keyCard || !reportResults.contains(keyCard)) {
            return;
        }
        if (target.closest('.report-annotation, input, textarea, label, button, a, select')) {
            return;
        }
        toggleReportKey(keyCard);
    });

    reportResults.addEventListener('dblclick', (event) => {
        const target = getEventTargetElement(event);
        if (!target) {
            return;
        }
        const keyCard = target.closest('.report-key');
        if (!keyCard || !reportResults.contains(keyCard)) {
            return;
        }
        if (target.closest('.report-annotation, input, textarea, label, button, a, select')) {
            return;
        }
        toggleReportKeySelection(keyCard);
    });

    reportResults.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        const target = getEventTargetElement(event);
        if (!target) {
            return;
        }
        const keyCard = target.closest('.report-key');
        if (!keyCard || !reportResults.contains(keyCard)) {
            return;
        }
        if (target.closest('.report-annotation, input, textarea, label, button, a, select')) {
            return;
        }
        event.preventDefault();
        toggleReportKey(keyCard);
    });

    reportResults.addEventListener('change', (event) => {
        const target = getEventTargetElement(event);
        if (!target) {
            return;
        }
        const annotation = target.closest('.report-annotation');
        if (!annotation) {
            return;
        }
        const matchId = annotation.dataset.matchId;
        if (!matchId) {
            return;
        }
        const entry = getReportAnnotation(matchId);
        if (target.type === 'checkbox') {
            const field = target.dataset.field;
            const keyCard = annotation.closest('.report-key');
            const isSelected = keyCard && keyCard.classList.contains('is-selected');
            const selectedCards = isSelected ? getSelectedReportKeyCards() : [];
                if (selectedCards.length > 1) {
                    const shouldCheck = target.checked;
                    selectedCards.forEach(card => {
                    const cardMatchId = card.dataset.matchId;
                    if (!cardMatchId) {
                        return;
                    }
                    const cardEntry = getReportAnnotation(cardMatchId);
                    cardEntry[field] = shouldCheck;
                    if (shouldCheck) {
                        if (field === 'justified') {
                            cardEntry.migrationRequired = false;
                        }
                        if (field === 'migrationRequired') {
                            cardEntry.justified = false;
                        }
                    }
                    const cardAnnotation = card.querySelector('.report-annotation');
                    if (cardAnnotation) {
                        const justifiedInput = cardAnnotation.querySelector('input[type="checkbox"][data-field="justified"]');
                        const migrationInput = cardAnnotation.querySelector('input[type="checkbox"][data-field="migrationRequired"]');
                        if (justifiedInput) {
                            justifiedInput.checked = Boolean(cardEntry.justified);
                        }
                        if (migrationInput) {
                            migrationInput.checked = Boolean(cardEntry.migrationRequired);
                        }
                    }
                    updateReportKeyState(card, cardEntry);
                    });
                    refreshReportCharts();
                    scheduleReportAnnotationSave();
                    return;
                }

            entry[field] = target.checked;
            if (target.checked) {
                if (field === 'justified') {
                    entry.migrationRequired = false;
                    const other = annotation.querySelector('input[type="checkbox"][data-field="migrationRequired"]');
                    if (other) {
                        other.checked = false;
                    }
                }
                if (field === 'migrationRequired') {
                    entry.justified = false;
                    const other = annotation.querySelector('input[type="checkbox"][data-field="justified"]');
                    if (other) {
                        other.checked = false;
                    }
                }
            }
            if (keyCard) {
                updateReportKeyState(keyCard, entry);
            }
            refreshReportCharts();
            scheduleReportAnnotationSave();
        }
    });

    reportResults.addEventListener('input', (event) => {
        const target = getEventTargetElement(event);
        if (!target) {
            return;
        }
        if (!target.dataset || target.dataset.field !== 'comment') {
            return;
        }
        const annotation = target.closest('.report-annotation');
        if (!annotation) {
            return;
        }
        const matchId = annotation.dataset.matchId;
        if (!matchId) {
            return;
        }
        const keyCard = annotation.closest('.report-key');
        const isSelected = keyCard && keyCard.classList.contains('is-selected');
        const selectedCards = isSelected ? getSelectedReportKeyCards() : [];
        if (selectedCards.length > 1) {
            selectedCards.forEach(card => {
                const cardMatchId = card.dataset.matchId;
                if (!cardMatchId) {
                    return;
                }
                const entry = getReportAnnotation(cardMatchId);
                entry.comment = target.value;
                const input = card.querySelector('.report-annotation-input[data-field="comment"]');
                if (input && input !== target) {
                    input.value = target.value;
                }
            });
            scheduleReportAnnotationSave();
            return;
        }
        const entry = getReportAnnotation(matchId);
        entry.comment = target.value;
        scheduleReportAnnotationSave();
    });

    setReportStatus('Enter a regex pattern and run the report.', 'info');
    setReportPostRunVisible(false);
    updateReportDrilldown();
    renderReportHistory();
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

function loadReportHistory() {
    try {
        const raw = localStorage.getItem(REPORT_HISTORY_KEY);
        if (!raw) {
            return [];
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn('Failed to read report history:', error);
        return [];
    }
}

function writeReportHistory(history) {
    try {
        localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
        console.warn('Failed to store report history:', error);
    }
}

function buildHistorySignature(entry) {
    const namespacesList = Array.isArray(entry.namespaces) ? entry.namespaces.slice().sort() : [];
    return [
        entry.pattern || '',
        entry.caseInsensitive ? '1' : '0',
        entry.searchIn || 'value',
        namespacesList.join(','),
    ].join('|');
}

function saveReportHistoryEntry(entry) {
    if (!entry || !entry.pattern) {
        return null;
    }

    const normalized = {
        pattern: entry.pattern,
        caseInsensitive: Boolean(entry.caseInsensitive),
        searchIn: entry.searchIn || 'value',
        namespaces: Array.isArray(entry.namespaces) ? entry.namespaces.slice() : [],
    };
    const signature = buildHistorySignature(normalized);
    const history = loadReportHistory();
    const existing = history.find(item => buildHistorySignature(item) === signature);
    const merged = {
        ...(existing || {}),
        ...normalized,
        savedAt: new Date().toISOString(),
    };
    const nextHistory = history.filter(item => buildHistorySignature(item) !== signature);
    nextHistory.unshift(merged);
    writeReportHistory(nextHistory.slice(0, REPORT_HISTORY_LIMIT));
    return signature;
}

function formatHistoryLabel(entry) {
    const namespacesList = Array.isArray(entry.namespaces) ? entry.namespaces : [];
    const namespacesCount = namespacesList.length;
    const caseLabel = entry.caseInsensitive ? 'ci' : 'cs';
    const scopeLabel = entry.searchIn || 'value';
    let namespaceLabel = '';

    if (namespacesCount === 1) {
        namespaceLabel = ` - ${namespacesList[0]}`;
    } else if (namespacesCount === 2) {
        namespaceLabel = ` - ${namespacesList[0]}, ${namespacesList[1]}`;
    } else if (namespacesCount > 2) {
        namespaceLabel = ` · ${namespacesCount} ns`;
    }

    return `${entry.pattern}${namespaceLabel} · ${caseLabel} · ${scopeLabel}`;
}

function buildHistoryEntryFromSelection(selectedNamespaces) {
    return {
        pattern: reportPattern.value.trim(),
        caseInsensitive: reportCase.checked,
        searchIn: reportScope.value || 'value',
        namespaces: Array.isArray(selectedNamespaces) ? selectedNamespaces.slice() : [],
    };
}

function updateReportHistoryResults(signature, reportData) {
    if (!signature || !reportData) {
        return;
    }
    const history = loadReportHistory();
    const target = history.find(item => buildHistorySignature(item) === signature);
    if (!target) {
        return;
    }
    target.reportData = reportData;
    target.reportSavedAt = new Date().toISOString();
    writeReportHistory(history);
}

function buildReportAnnotationsForHistory() {
    if (!reportResultsState) {
        return [];
    }
    const reportPayload = buildReportPayloadFromState(getSelectedReportNamespaces());
    if (!reportPayload) {
        return [];
    }
    return collectReportAnnotations(reportPayload);
}

function resolveReportHistorySignature() {
    if (lastReportHistorySignature) {
        return lastReportHistorySignature;
    }
    const signature = buildHistorySignature(buildHistoryEntryFromSelection(getSelectedReportNamespaces()));
    lastReportHistorySignature = signature;
    return signature;
}

function saveReportAnnotationsForSignature(signature) {
    if (!signature) {
        return;
    }
    const history = loadReportHistory();
    const target = history.find(item => buildHistorySignature(item) === signature);
    if (!target) {
        return;
    }
    target.annotations = buildReportAnnotationsForHistory();
    target.annotationsSavedAt = new Date().toISOString();
    writeReportHistory(history);
}

function scheduleReportAnnotationSave() {
    const signature = resolveReportHistorySignature();
    if (!signature) {
        return;
    }
    if (reportAnnotationSaveTimer) {
        clearTimeout(reportAnnotationSaveTimer);
    }
    reportAnnotationSaveTimer = setTimeout(() => {
        saveReportAnnotationsForSignature(signature);
    }, REPORT_ANNOTATION_SAVE_DELAY_MS);
}

function setReportStatusFromHistory(reportData) {
    if (!reportData) {
        return;
    }
    if (reportData.mode === 'single') {
        const matchedCount = (reportData.data?.matched || []).length;
        const namespace = reportData.data?.namespace || 'namespace';
        setReportStatus(`Loaded saved report: ${matchedCount} application(s) in ${namespace}.`, 'success');
        return;
    }
    if (reportData.mode === 'multi') {
        const namespaceCount = reportData.reports?.length || 0;
        setReportStatus(`Loaded saved report for ${namespaceCount} namespace(s).`, 'success');
    }
}

function applyReportHistoryEntry(entry) {
    if (!entry || !entry.pattern) {
        return;
    }
    reportPattern.value = entry.pattern;
    reportCase.checked = Boolean(entry.caseInsensitive);

    const scopeValue = entry.searchIn || 'value';
    if (reportScope.querySelector(`option[value="${scopeValue}"]`)) {
        reportScope.value = scopeValue;
    } else {
        reportScope.value = 'value';
    }

    const namespaceInputs = Array.from(reportNamespaceList.querySelectorAll('input[type="checkbox"]'));
    namespaceInputs.forEach(input => {
        input.checked = false;
    });

    if (Array.isArray(entry.namespaces) && entry.namespaces.length > 0) {
        const namespaceSet = new Set(entry.namespaces);
        namespaceInputs.forEach(input => {
            if (namespaceSet.has(input.value)) {
                input.checked = true;
            }
        });
    }

    updateReportSelectionState();

    if (entry.reportData) {
        clearReportAnnotations();
        applyReportAnnotations(entry.annotations);
        if (entry.reportData.mode === 'single') {
            renderReportResults(entry.reportData.data);
        } else if (entry.reportData.mode === 'multi') {
            renderMultiNamespaceResults(entry.reportData.reports || []);
        }
        setReportPostRunVisible(true);
        resetReportViewState();
        setReportStatusFromHistory(entry.reportData);
    }
}

function applyReportHistoryEntryByIndex(index) {
    const history = loadReportHistory();
    if (!Number.isFinite(index) || index < 0 || index >= history.length) {
        return;
    }
    applyReportHistoryEntry(history[index]);
}

function applyReportHistorySelection() {
    if (!reportHistorySelect) {
        return;
    }
    const index = Number(reportHistorySelect.value);
    applyReportHistoryEntryByIndex(index);
}

function clearReportHistory() {
    writeReportHistory([]);
    renderReportHistory();
}

function renderReportHistory() {
    if (!reportHistorySelect || !reportHistoryList || !reportHistoryApply || !reportHistoryClear) {
        return;
    }

    const history = loadReportHistory();
    reportHistorySelect.innerHTML = '';

    if (history.length === 0) {
        reportHistorySelect.innerHTML = '<option value="">No saved searches yet</option>';
        reportHistorySelect.disabled = true;
        reportHistoryApply.disabled = true;
        reportHistoryClear.disabled = true;
        reportHistoryList.innerHTML = '<div class="report-empty">No saved searches yet.</div>';
        return;
    }

    reportHistorySelect.disabled = false;
    reportHistoryApply.disabled = false;
    reportHistoryClear.disabled = false;

    const optionsHtml = history
        .map((entry, index) => `<option value="${index}">${escapeHtml(formatHistoryLabel(entry))}</option>`)
        .join('');
    reportHistorySelect.innerHTML = optionsHtml;

    const chipsHtml = history
        .map((entry, index) => `
            <button class="report-history-chip" type="button" data-history-index="${index}">
                ${escapeHtml(formatHistoryLabel(entry))}
            </button>
        `)
        .join('');
    reportHistoryList.innerHTML = chipsHtml;
}

function updateReportSearchStatus(message, type = 'info') {
    if (!reportSearchStatus) {
        return;
    }
    reportSearchStatus.textContent = message;
    reportSearchStatus.className = `report-search-status ${type}`;
}

function getReportSearchableKeyCards() {
    if (!reportResults) {
        return [];
    }
    return Array.from(reportResults.querySelectorAll('.report-key[data-key]'));
}

function updateReportSearchSummary() {
    if (!reportSearchStatus) {
        return;
    }
    if (!reportResultsState) {
        updateReportSearchStatus('Run a report to search matching keys.', 'info');
        return;
    }
    const total = getReportSearchableKeyCards().length;
    updateReportSearchStatus(`Ready to search ${total} key(s).`, 'info');
}

function normalizeSearchText(text, caseSensitive) {
    if (!text) {
        return '';
    }
    return caseSensitive ? text : text.toLowerCase();
}

function cardMatchesReportSearch(card, term, scope, caseSensitive) {
    if (!card || !term) {
        return false;
    }
    const keyText = normalizeSearchText(card.dataset.key || '', caseSensitive);
    const valueText = normalizeSearchText(card.dataset.value || '', caseSensitive);
    const searchTerm = normalizeSearchText(term, caseSensitive);

    if (!searchTerm) {
        return false;
    }

    if (scope === 'key') {
        return keyText.includes(searchTerm);
    }
    if (scope === 'value') {
        return valueText.includes(searchTerm);
    }
    return keyText.includes(searchTerm) || valueText.includes(searchTerm);
}

function runReportSearchSelection(mode = 'replace') {
    if (!reportResultsState) {
        updateReportSearchStatus('Run a report before searching.', 'error');
        return;
    }
    const term = reportSearchTerm ? reportSearchTerm.value.trim() : '';
    if (!term) {
        updateReportSearchStatus('Enter a search value for keys or values.', 'error');
        return;
    }
    const scope = reportSearchScope ? reportSearchScope.value : 'value';
    const caseSensitive = reportSearchCase ? reportSearchCase.checked : false;

    const cards = getReportSearchableKeyCards();
    const matches = cards.filter(card => cardMatchesReportSearch(card, term, scope, caseSensitive));

    if (mode !== 'add') {
        setReportKeySelection(false);
    }

    matches.forEach(card => setReportKeySelected(card, true));

    if (!matches.length) {
        updateReportSearchStatus(`No matches for "${term}".`, 'error');
        return;
    }

    const totalSelected = getSelectedReportKeyCards().length;
    const actionLabel = mode === 'add' ? 'Added' : 'Selected';
    updateReportSearchStatus(`${actionLabel} ${matches.length} key(s). ${totalSelected} selected.`, 'success');
}

function applyReportSelectionFlag(mode) {
    if (!reportResultsState) {
        updateReportSearchStatus('Run a report before applying flags.', 'error');
        return;
    }
    const selectedCards = getSelectedReportKeyCards();
    if (!selectedCards.length) {
        updateReportSearchStatus('Select at least one key to apply flags.', 'error');
        return;
    }
    selectedCards.forEach(card => {
        const matchId = card.dataset.matchId;
        if (!matchId) {
            return;
        }
        const entry = getReportAnnotation(matchId);
        if (mode === 'clear') {
            entry.justified = false;
            entry.migrationRequired = false;
        } else {
            entry[mode] = true;
            if (mode === 'justified') {
                entry.migrationRequired = false;
            }
            if (mode === 'migrationRequired') {
                entry.justified = false;
            }
        }
        const annotation = card.querySelector('.report-annotation');
        if (annotation) {
            const justifiedInput = annotation.querySelector('input[type="checkbox"][data-field="justified"]');
            const migrationInput = annotation.querySelector('input[type="checkbox"][data-field="migrationRequired"]');
            if (justifiedInput) {
                justifiedInput.checked = Boolean(entry.justified);
            }
            if (migrationInput) {
                migrationInput.checked = Boolean(entry.migrationRequired);
            }
        }
        updateReportKeyState(card, entry);
    });
    refreshReportCharts();
    scheduleReportAnnotationSave();

    const label = mode === 'clear' ? 'Cleared flags' : `Marked ${mode === 'justified' ? 'justified' : 'migration'}`;
    updateReportSearchStatus(`${label} for ${selectedCards.length} key(s).`, 'success');
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
                <button class="btn-action btn-config" onclick="viewSpringConfig('${workload.namespace}', '${workload.name}', '${workload.kindLabel}', '${workload.kind}')">
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
    if (configAgentRun) {
        configAgentRun.disabled = false;
        configAgentRun.textContent = 'Run Config Agent';
    }
}

function setConfigStatus(message, type = 'info') {
    configStatus.textContent = message;
    configStatus.className = `config-status ${type}`;
}

function setReportStatus(message, type = 'info') {
    reportStatus.textContent = message;
    reportStatus.className = `report-status ${type}`;
}

function setReportPostRunVisible(isVisible) {
    if (!reportActions) {
        return;
    }
    reportActions.classList.toggle('is-ready', isVisible);
    if (reportPanel) {
        reportPanel.classList.toggle('is-ready', isVisible);
    }
    if (reportVisuals) {
        reportVisuals.classList.toggle('is-visible', isVisible);
    }
    if (!isVisible) {
        clearReportVisuals();
    }
    updateReportSearchSummary();
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
    setReportPostRunVisible(false);
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

function buildReportCards(data, openApps) {
    const matches = data.matched || [];
    const errors = data.errors || [];
    const highlightPattern = reportPattern.value.trim();
    const highlightCaseInsensitive = reportCase.checked;
    const namespace = data.namespace || currentNamespace;
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
                const matchId = getReportMatchId(
                    namespace,
                    item.workloadName,
                    keyEntry,
                );
                const stableId = getReportStableId(
                    namespace,
                    item.workloadName,
                    keyEntry,
                );
                const annotation = getReportAnnotation(matchId, stableId);
                const justifiedChecked = annotation.justified ? 'checked' : '';
                const migrationChecked = annotation.migrationRequired ? 'checked' : '';
                const commentValue = annotation.comment ? `value="${escapeHtml(annotation.comment)}"` : '';
                const keyStateClass = [
                    annotation.justified ? 'is-justified' : '',
                    annotation.migrationRequired ? 'is-migration' : '',
                ].filter(Boolean).join(' ');
                return `
                    <div class="report-key ${keyStateClass}" data-match-id="${matchId}" data-key="${escapeHtml(keyEntry.key || '')}" data-value="${escapeHtml(valueText)}" role="button" tabindex="0" aria-expanded="false">
                        <div class="report-key-name">${escapeHtml(keyEntry.key)}</div>
                        <div class="report-value">${highlightedValue}</div>
                        <span>${escapeHtml(keyEntry.source || 'effective')} | match: ${escapeHtml(keyEntry.matchOn || 'value')}</span>
                        <div class="report-annotation" data-match-id="${matchId}">
                            <div class="report-annotation-controls">
                                <label class="report-annotation-option">
                                    <input type="checkbox" data-field="justified" ${justifiedChecked}>
                                    Justified
                                </label>
                                <label class="report-annotation-option">
                                    <input type="checkbox" data-field="migrationRequired" ${migrationChecked}>
                                    Migration required
                                </label>
                            </div>
                            <input class="report-annotation-input" type="text" placeholder="Optional comment" data-field="comment" ${commentValue}>
                        </div>
                    </div>
                `;
            }).join('');

            const shouldOpen = !openApps || openApps.has(item.workloadName);
            const openAttr = shouldOpen ? 'open' : '';
            return `
                <details class="report-card" data-kind="app" data-app="${escapeHtml(item.workloadName)}" ${openAttr}>
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
        const errorHtml = errors.map(err => {
            const kindLabel = err.workloadKind || 'workload';
            const canRetry = err.workloadKind !== 'namespace' && err.workloadName;
            const canAnnotate = Boolean(err.workloadName);
            const matchId = canAnnotate
                ? getSkippedMatchId(namespace, err.workloadName, err.workloadKind || '')
                : '';
            const stableId = canAnnotate
                ? getSkippedStableId(namespace, err.workloadName, err.workloadKind || '')
                : '';
            const annotation = canAnnotate ? getReportAnnotation(matchId, stableId) : null;
            const justifiedChecked = annotation?.justified ? 'checked' : '';
            const migrationChecked = annotation?.migrationRequired ? 'checked' : '';
            const commentValue = annotation?.comment ? `value="${escapeHtml(annotation.comment)}"` : '';
            const keyStateClass = [
                annotation?.justified ? 'is-justified' : '',
                annotation?.migrationRequired ? 'is-migration' : '',
            ].filter(Boolean).join(' ');
            const matchIdAttr = canAnnotate ? `data-match-id="${matchId}"` : '';
            const retryButton = canRetry
                ? `
                    <button type="button" class="btn-action btn-retry" onclick="retrySkippedApplication('${namespace}', '${err.workloadName}', '${err.workloadKind || ''}', this)">
                        Retry
                    </button>
                `
                : '';
            const agentButton = canRetry
                ? `
                    <button type="button" class="btn-action btn-agent" data-agent-button="true" data-namespace="${escapeHtml(namespace)}" data-workload-name="${escapeHtml(err.workloadName)}" data-workload-kind="${escapeHtml(err.workloadKind || '')}" onclick="applySpringConfigAgent('${namespace}', '${err.workloadName}', '${err.workloadKind || ''}', this)">
                        Apply Spring Config Agent
                    </button>
                `
                : '';
            const annotationControls = canAnnotate
                ? `
                    <div class="report-annotation" data-match-id="${matchId}">
                        <div class="report-annotation-controls">
                            <label class="report-annotation-option">
                                <input type="checkbox" data-field="justified" ${justifiedChecked}>
                                Justified
                            </label>
                            <label class="report-annotation-option">
                                <input type="checkbox" data-field="migrationRequired" ${migrationChecked}>
                                Migration required
                            </label>
                        </div>
                        <input class="report-annotation-input" type="text" placeholder="Optional comment" data-field="comment" ${commentValue}>
                    </div>
                `
                : '';
            return `
                <div class="report-key ${keyStateClass}" ${matchIdAttr}>
                    <div class="report-key-header">
                        <div class="report-key-name">${escapeHtml(err.workloadName)} (${escapeHtml(kindLabel)})</div>
                        ${retryButton}
                        <button type="button" class="btn-action btn-expose" onclick="exposeActuatorEnv('${namespace}', '${err.workloadName}', '${err.workloadKind || ''}', this)">
                            Expose Actuator
                        </button>
                        ${agentButton}
                    </div>
                    <div class="report-inline-status" data-inline-status="true"></div>
                    <span>${escapeHtml(err.message || 'Failed to fetch config')}</span>
                    ${annotationControls}
                </div>
            `;
        }).join('');

        const skippedAgentButton = `
            <button type="button" class="btn btn-secondary" onclick="event.stopPropagation(); applySpringConfigAgentToSkippedNamespace('${namespace}', this)">
                Apply agent to skipped
            </button>
        `;

        html += `
            <details class="report-card" data-kind="error" data-error="true">
                <summary>
                    <span>Skipped applications</span>
                    <span class="report-card-summary-actions">
                        <span class="config-count">${errors.length}</span>
                        ${skippedAgentButton}
                    </span>
                </summary>
                <div class="report-keys">${errorHtml}</div>
            </details>
        `;
    }

    return html;
}

function renderReportResultsView(data) {
    const openApps = getOpenAppCards();
    const hasExisting = Boolean(reportResults.querySelector('.report-card[data-kind="app"]'));
    preserveReportScroll(() => {
        reportResults.innerHTML = buildReportCards(data, hasExisting ? openApps : null);
    });
}

function getOpenAppCards() {
    if (!reportResults) {
        return new Set();
    }
    return new Set(Array.from(reportResults.querySelectorAll('.report-card[data-kind="app"]'))
        .filter(detail => detail.open)
        .map(detail => detail.dataset.app)
        .filter(Boolean));
}

function getOpenReportNamespaces() {
    if (!reportResults) {
        return new Set();
    }
    return new Set(Array.from(reportResults.querySelectorAll('.report-namespace'))
        .filter(detail => detail.open)
        .map(detail => detail.dataset.namespace)
        .filter(Boolean));
}

function renderMultiNamespaceResultsView(reports) {
    if (!reports.length) {
        reportResults.innerHTML = '<div class="report-empty">No namespaces returned.</div>';
        return;
    }

    const openNamespaces = getOpenReportNamespaces();
    const hasExisting = Boolean(reportResults.querySelector('.report-namespace'));
    const openAppsByNamespace = getOpenAppCardsByNamespace();

      preserveReportScroll(() => {
          reportResults.innerHTML = reports.map(report => `
              <details class="report-namespace" data-namespace="${escapeHtml(report.namespace)}" ${!hasExisting || openNamespaces.has(report.namespace) ? 'open' : ''}>
                  <summary class="report-namespace-summary">
                      <span class="report-namespace-name">${escapeHtml(report.namespace)}</span>
                      <span class="report-namespace-summary-actions">
                          <button type="button" class="btn btn-secondary" data-namespace-action="select" data-namespace="${escapeHtml(report.namespace)}">Select all</button>
                          <button type="button" class="btn btn-secondary" data-namespace-action="clear" data-namespace="${escapeHtml(report.namespace)}">Clear selection</button>
                      </span>
                  </summary>
                  <div class="report-namespace-body">${buildReportCards(report.data, openAppsByNamespace.has(report.namespace) ? openAppsByNamespace.get(report.namespace) : null)}</div>
              </details>
          `).join('');
      });
  }

function getOpenAppCardsByNamespace() {
    const results = new Map();
    if (!reportResults) {
        return results;
    }
    const namespaceDetails = reportResults.querySelectorAll('.report-namespace');
    namespaceDetails.forEach(detail => {
        const namespace = detail.dataset.namespace || '';
        const openApps = new Set(Array.from(detail.querySelectorAll('.report-card[data-kind="app"]'))
            .filter(card => card.open)
            .map(card => card.dataset.app)
            .filter(Boolean));
        if (namespace) {
            results.set(namespace, openApps);
        }
    });
    return results;
}

function renderReportResults(data) {
    reportResultsState = { mode: 'single', data };
    renderReportResultsView(data);
    refreshReportCharts();
    updateReportSearchSummary();
}

function renderMultiNamespaceResults(reports) {
    reportResultsState = { mode: 'multi', reports };
    renderMultiNamespaceResultsView(reports);
    refreshReportCharts();
    updateReportSearchSummary();
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

function resetReportViewState() {
    reportViewState = { namespace: null, app: null };
    refreshReportCharts();
}

function resetReportDrilldown() {
    reportViewState = { namespace: null, app: null };
    restoreReportResultsView();
    refreshReportCharts();
}

function updateReportDrilldown() {
    if (!reportDrilldown) {
        return;
    }
    const parts = [];
    if (reportViewState.namespace) {
        parts.push(`Namespace: ${reportViewState.namespace}`);
    }
    if (reportViewState.app) {
        parts.push(`Application: ${reportViewState.app}`);
    }
    if (parts.length === 0) {
        if (reportNamespaceChartMode === 'summary' && reportNamespaceCount) {
            reportDrilldown.textContent = `Showing status distribution across ${reportNamespaceCount} namespaces. Use the results list to drill into a namespace.`;
        } else {
            reportDrilldown.textContent = 'Click a namespace slice to drill into apps.';
        }
        if (reportResetView) {
            reportResetView.disabled = true;
        }
        return;
    }
    reportDrilldown.textContent = parts.join(' / ');
    if (reportResetView) {
        reportResetView.disabled = false;
    }
}

function restoreReportResultsView() {
    if (!reportResultsState) {
        return;
    }
    if (reportResultsState.mode === 'single') {
        renderReportResultsView(reportResultsState.data);
    } else if (reportResultsState.mode === 'multi') {
        const reports = reportResultsState.reports || [];
        const filtered = reportViewState.namespace
            ? reports.filter(report => report.namespace === reportViewState.namespace)
            : reports;
        renderMultiNamespaceResultsView(filtered);
    }
}

function refreshReportCharts() {
    if (!reportVisuals) {
        return;
    }
    if (!reportResultsState) {
        clearReportVisuals();
        return;
    }
    const summaries = buildReportNamespaceSummaries();
    renderNamespaceChart(summaries);
    renderAppChart(summaries);
    updateReportDrilldown();
}

function clearReportVisuals() {
    if (reportNamespaceChart) {
        reportNamespaceChart.innerHTML = '';
    }
    if (reportNamespaceLegend) {
        reportNamespaceLegend.innerHTML = '';
    }
    if (reportAppChart) {
        reportAppChart.innerHTML = '';
    }
    if (reportAppLegend) {
        reportAppLegend.innerHTML = '';
    }
    if (reportAppChartTitle) {
        reportAppChartTitle.textContent = 'Applications';
    }
    reportViewState = { namespace: null, app: null };
    reportNamespaceChartMode = 'detail';
    reportNamespaceCount = 0;
    updateReportDrilldown();
}

function buildReportNamespaceSummaries() {
    if (!reportResultsState) {
        return [];
    }
    const reports = reportResultsState.mode === 'single'
        ? [{ namespace: reportResultsState.data?.namespace || currentNamespace, data: reportResultsState.data || {} }]
        : (reportResultsState.reports || []);

    return reports.map(report => {
        const namespace = report.namespace || '';
        const data = report.data || {};
        const matched = data.matched || [];
        const errors = data.errors || [];
        const hasMatches = matched.length > 0;
        const hasErrors = errors.length > 0;
        if (!hasMatches && !hasErrors) {
            return null;
        }
        const apps = buildReportAppEntries(namespace, data);
        const namespaceError = errors.some(err => err.workloadKind === 'namespace');
        const status = determineNamespaceStatus(apps, namespaceError);
        if (!status) {
            return null;
        }
        return { namespace, status, apps };
    }).filter(Boolean);
}

function buildReportAppEntries(namespace, reportData) {
    const apps = new Map();
    const matched = reportData.matched || [];
    matched.forEach(workload => {
        const workloadName = workload.workloadName || '';
        if (!workloadName) {
            return;
        }
        const matches = workload.matches || [];
        const status = determineAppStatus(namespace, workloadName, matches);
        apps.set(workloadName, {
            name: workloadName,
            workloadKind: workload.workloadKind || '',
            status,
        });
    });

    const errors = reportData.errors || [];
    errors.forEach(error => {
        const workloadName = error.workloadName || '';
        if (!workloadName || apps.has(workloadName)) {
            return;
        }
        if (error.workloadKind === 'namespace') {
            return;
        }
        const status = determineSkippedStatus(namespace, workloadName, error.workloadKind || '');
        apps.set(workloadName, {
            name: workloadName,
            workloadKind: error.workloadKind || '',
            status,
        });
    });

    return Array.from(apps.values());
}

function determineAppStatus(namespace, workloadName, matches) {
    if (!matches.length) {
        return 'not-worked';
    }
    let anyMigration = false;
    let allJustified = true;
    matches.forEach(match => {
        const matchId = getReportMatchId(namespace, workloadName, match);
        const annotation = getReportAnnotation(matchId);
        if (annotation.migrationRequired) {
            anyMigration = true;
        }
        if (!annotation.justified) {
            allJustified = false;
        }
    });
    if (anyMigration) {
        return 'migration';
    }
    if (allJustified) {
        return 'justified';
    }
    return 'not-worked';
}

function determineSkippedStatus(namespace, workloadName, workloadKind) {
    const matchId = getSkippedMatchId(namespace, workloadName, workloadKind);
    const stableId = getSkippedStableId(namespace, workloadName, workloadKind);
    const annotation = getReportAnnotation(matchId, stableId);
    if (annotation.migrationRequired) {
        return 'migration';
    }
    if (annotation.justified) {
        return 'justified';
    }
    return 'skipped';
}

function determineNamespaceStatus(apps, namespaceError) {
    if (!apps.length) {
        return namespaceError ? 'skipped' : null;
    }
    const statuses = apps.map(app => app.status);
    if (statuses.includes('migration')) {
        return 'migration';
    }
    if (statuses.includes('not-worked')) {
        return 'not-worked';
    }
    if (statuses.includes('skipped')) {
        return 'skipped';
    }
    return 'justified';
}

function renderNamespaceChart(summaries) {
    reportNamespaceCount = summaries.length;
    const items = summaries.map(summary => ({
        id: summary.namespace,
        label: summary.namespace,
        status: summary.status,
        value: 1,
    }));
    const counts = countStatusItems(items);

    if (items.length > REPORT_NAMESPACE_PIE_LIMIT) {
        reportNamespaceChartMode = 'summary';
        const summaryItems = REPORT_STATUS_ORDER
            .map(key => ({
                id: `status:${key}`,
                label: REPORT_STATUS_STYLES[key].label,
                status: key,
                value: counts[key] || 0,
            }))
            .filter(item => item.value > 0);
        renderPieChart(reportNamespaceChart, summaryItems, {
            emptyMessage: 'No namespaces matched this pattern.',
        });
    } else {
        reportNamespaceChartMode = 'detail';
        renderPieChart(reportNamespaceChart, items, {
            selectedId: reportViewState.namespace,
            emptyMessage: 'No namespaces matched this pattern.',
            onClick: (namespace) => selectNamespace(namespace),
        });
    }

    renderLegend(reportNamespaceLegend, counts);
}

function renderAppChart(summaries) {
    const selectedNamespace = reportViewState.namespace;
    if (!selectedNamespace) {
        if (reportAppChartTitle) {
            reportAppChartTitle.textContent = 'Applications';
        }
        renderPieChart(reportAppChart, [], { emptyMessage: 'Select a namespace to see applications.' });
        renderLegend(reportAppLegend, {});
        return;
    }

    const summary = summaries.find(item => item.namespace === selectedNamespace);
    const apps = summary ? summary.apps : [];
    const items = apps.map(app => ({
        id: app.name,
        label: app.name,
        status: app.status,
        value: 1,
    }));

    if (reportAppChartTitle) {
        reportAppChartTitle.textContent = `Applications in ${selectedNamespace}`;
    }
    renderPieChart(reportAppChart, items, {
        selectedId: reportViewState.app,
        emptyMessage: 'No applications matched this pattern.',
        onClick: (appName) => selectApplication(selectedNamespace, appName),
    });
    renderLegend(reportAppLegend, countStatusItems(items));
}

function selectNamespace(namespace) {
    if (!namespace || namespace === reportViewState.namespace) {
        return;
    }
    reportViewState = { namespace, app: null };
    restoreReportResultsView();
    refreshReportCharts();
}

function selectApplication(namespace, appName) {
    if (!namespace || !appName) {
        return;
    }
    reportViewState = { namespace, app: appName };
    const data = buildReportDataForApp(namespace, appName);
    if (data) {
        renderReportResultsView(data);
    }
    refreshReportCharts();
}

function buildReportDataForApp(namespace, appName) {
    const reportData = getReportDataForNamespace(namespace);
    if (!reportData) {
        return null;
    }
    const matched = (reportData.matched || []).filter(workload => workload.workloadName === appName);
    const errors = (reportData.errors || []).filter(error => error.workloadName === appName);
    if (!matched.length && !errors.length) {
        return null;
    }
    return {
        namespace,
        matched,
        errors,
    };
}

function getReportDataForNamespace(namespace) {
    if (!reportResultsState) {
        return null;
    }
    if (reportResultsState.mode === 'single') {
        const data = reportResultsState.data || {};
        const dataNamespace = data.namespace || currentNamespace;
        return dataNamespace === namespace ? data : null;
    }
    if (reportResultsState.mode === 'multi') {
        const report = (reportResultsState.reports || []).find(item => item.namespace === namespace);
        return report ? report.data : null;
    }
    return null;
}

function renderPieChart(container, items, options = {}) {
    if (!container) {
        return;
    }
    const emptyMessage = options.emptyMessage || 'No data to display.';
    container.innerHTML = '';

    if (!items.length) {
        container.innerHTML = `<div class="report-empty">${escapeHtml(emptyMessage)}</div>`;
        return;
    }

    const total = items.reduce((sum, item) => sum + (item.value || 0), 0);
    if (!total) {
        container.innerHTML = `<div class="report-empty">${escapeHtml(emptyMessage)}</div>`;
        return;
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('class', 'report-pie');

    if (items.length === 1) {
        const item = items[0];
        const statusStyle = REPORT_STATUS_STYLES[item.status] || REPORT_STATUS_STYLES['not-worked'];
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '50');
        circle.setAttribute('cy', '50');
        circle.setAttribute('r', '48');
        circle.setAttribute('fill', statusStyle.color);
        circle.setAttribute('class', 'report-pie-slice');
        circle.setAttribute('data-id', item.id);
        if (item.id === options.selectedId) {
            circle.classList.add('is-selected');
        }
        if (typeof options.onClick === 'function') {
            circle.addEventListener('click', () => options.onClick(item.id));
        }
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${item.label} (${statusStyle.label})`;
        circle.appendChild(title);
        svg.appendChild(circle);
        container.appendChild(svg);
        return;
    }

    let startAngle = 0;
    items.forEach(item => {
        const value = item.value || 0;
        if (!value) {
            return;
        }
        const angle = (value / total) * 360;
        const endAngle = startAngle + angle;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const statusStyle = REPORT_STATUS_STYLES[item.status] || REPORT_STATUS_STYLES['not-worked'];
        path.setAttribute('d', describeArc(50, 50, 48, startAngle, endAngle));
        path.setAttribute('fill', statusStyle.color);
        path.setAttribute('class', 'report-pie-slice');
        path.setAttribute('data-id', item.id);
        if (item.id === options.selectedId) {
            path.classList.add('is-selected');
        }
        if (typeof options.onClick === 'function') {
            path.addEventListener('click', () => options.onClick(item.id));
        }
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = `${item.label} (${statusStyle.label})`;
        path.appendChild(title);
        svg.appendChild(path);
        startAngle = endAngle;
    });

    container.appendChild(svg);
}

function describeArc(x, y, radius, startAngle, endAngle) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return [
        'M', x, y,
        'L', start.x, start.y,
        'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
        'Z',
    ].join(' ');
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: centerX + (radius * Math.cos(angleInRadians)),
        y: centerY + (radius * Math.sin(angleInRadians)),
    };
}

function countStatusItems(items) {
    return items.reduce((counts, item) => {
        if (!item.status) {
            return counts;
        }
        counts[item.status] = (counts[item.status] || 0) + (item.value || 0);
        return counts;
    }, {});
}

function renderLegend(container, counts) {
    if (!container) {
        return;
    }
    container.innerHTML = REPORT_STATUS_ORDER.map(key => {
        const style = REPORT_STATUS_STYLES[key];
        const count = counts[key] || 0;
        return `
            <div class="report-legend-item">
                <span class="report-legend-swatch" style="background:${style.color}"></span>
                <span>${escapeHtml(style.label)}</span>
                <span>${count}</span>
            </div>
        `;
    }).join('');
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

    clearReportAnnotations();

    const caseInsensitive = reportCase.checked;
    const searchIn = reportScope.value || 'value';

    lastReportHistorySignature = saveReportHistoryEntry({
        pattern,
        caseInsensitive,
        searchIn,
        namespaces: selectedNamespaces,
    });
    const cachedHistory = loadReportHistory();
    const cachedEntry = cachedHistory.find(item => buildHistorySignature(item) === lastReportHistorySignature);
    if (cachedEntry && Array.isArray(cachedEntry.annotations)) {
        applyReportAnnotations(cachedEntry.annotations);
    }
    renderReportHistory();

    setReportPostRunVisible(false);

    const query = new URLSearchParams({
        pattern,
        caseInsensitive: caseInsensitive ? 'true' : 'false',
        searchIn,
    });

    reportResults.innerHTML = '';
    if (selectedNamespaces.length === 1) {
        await runSingleNamespaceReport(selectedNamespaces[0], query);
        setReportPostRunVisible(true);
        return;
    }

    await runMultiNamespaceReport(selectedNamespaces, query);
    setReportPostRunVisible(true);
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
        if (!data.namespace) {
            data.namespace = namespace;
        }
        const matchedCount = (data.matched || []).length;
        setReportStatus(`Found ${matchedCount} application(s) with matching entries in ${namespace}.`, 'success');
        renderReportResults(data);
        const signature = lastReportHistorySignature
            || buildHistorySignature(buildHistoryEntryFromSelection(getSelectedReportNamespaces()));
        updateReportHistoryResults(signature, { mode: 'single', data });
        resetReportViewState();
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
    const signature = lastReportHistorySignature
        || buildHistorySignature(buildHistoryEntryFromSelection(getSelectedReportNamespaces()));
    updateReportHistoryResults(signature, { mode: 'multi', reports });
    resetReportViewState();
}

function buildReportSnapshot() {
    if (!reportResultsState) {
        return null;
    }

    const pattern = reportPattern.value.trim();
    const caseInsensitive = reportCase.checked;
    const searchIn = reportScope.value || 'value';
    const selectedNamespaces = getSelectedReportNamespaces();
    const report = buildReportPayloadFromState(selectedNamespaces);
    if (!report) {
        return null;
    }

    const namespaces = selectedNamespaces.length
        ? selectedNamespaces
        : extractNamespacesFromReportPayload(report);
    const annotations = collectReportAnnotations(report);

    return {
        version: REPORT_SNAPSHOT_VERSION,
        exportedAt: new Date().toISOString(),
        pattern,
        caseInsensitive,
        searchIn,
        namespaces,
        report,
        annotations,
    };
}

function buildReportPayloadFromState(selectedNamespaces) {
    if (!reportResultsState) {
        return null;
    }
    if (reportResultsState.mode === 'single') {
        const data = cloneReportData(reportResultsState.data || {});
        if (!data.namespace && selectedNamespaces && selectedNamespaces.length === 1) {
            data.namespace = selectedNamespaces[0];
        }
        return { mode: 'single', data };
    }
    if (reportResultsState.mode === 'multi') {
        const reports = cloneReportData(reportResultsState.reports || []);
        return { mode: 'multi', reports };
    }
    return null;
}

function cloneReportData(value) {
    if (!value) {
        return value;
    }
    return JSON.parse(JSON.stringify(value));
}

function extractNamespacesFromReportPayload(reportPayload) {
    if (!reportPayload) {
        return [];
    }
    if (reportPayload.mode === 'single') {
        const namespace = reportPayload.data?.namespace;
        return namespace ? [namespace] : [];
    }
    if (reportPayload.mode === 'multi') {
        return (reportPayload.reports || [])
            .map(report => report.namespace)
            .filter(Boolean);
    }
    return [];
}

function collectReportAnnotations(reportPayload) {
    const annotations = [];
    const reportList = reportPayload.mode === 'single'
        ? [{ namespace: reportPayload.data?.namespace || '', data: reportPayload.data || {} }]
        : (reportPayload.reports || []);

    reportList.forEach(report => {
        const namespace = report.namespace || '';
        const matched = report.data?.matched || [];
        matched.forEach(workload => {
            const workloadName = workload.workloadName || '';
            (workload.matches || []).forEach(match => {
                const matchId = getReportMatchId(namespace, workloadName, match);
                const stableId = getReportStableId(namespace, workloadName, match);
                const annotation = getReportAnnotation(matchId, stableId);
                const hasComment = Boolean(annotation.comment && annotation.comment.trim());
                if (annotation.justified || annotation.migrationRequired || hasComment) {
                    annotations.push({
                        matchId,
                        stableId,
                        justified: Boolean(annotation.justified),
                        migrationRequired: Boolean(annotation.migrationRequired),
                        comment: annotation.comment || '',
                    });
                }
            });
        });

        const errors = report.data?.errors || [];
        errors.forEach(error => {
            const workloadName = error.workloadName || '';
            if (!workloadName || error.workloadKind === 'namespace') {
                return;
            }
            const matchId = getSkippedMatchId(namespace, workloadName, error.workloadKind || '');
            const stableId = getSkippedStableId(namespace, workloadName, error.workloadKind || '');
            const annotation = getReportAnnotation(matchId, stableId);
            const hasComment = Boolean(annotation.comment && annotation.comment.trim());
            if (annotation.justified || annotation.migrationRequired || hasComment) {
                annotations.push({
                    matchId,
                    stableId,
                    justified: Boolean(annotation.justified),
                    migrationRequired: Boolean(annotation.migrationRequired),
                    comment: annotation.comment || '',
                });
            }
        });
    });

    return annotations;
}

function buildReportSnapshotFileName(snapshot) {
    const label = snapshot.namespaces && snapshot.namespaces.length === 1
        ? snapshot.namespaces[0]
        : 'multi';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `spring-config-report-${label}-${timestamp}.json`;
}

function triggerJsonDownload(payload, filename) {
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function downloadReportSnapshot() {
    const snapshot = buildReportSnapshot();
    if (!snapshot) {
        setReportStatus('Run a report before saving a snapshot.', 'error');
        return;
    }

    const filename = buildReportSnapshotFileName(snapshot);
    triggerJsonDownload(JSON.stringify(snapshot, null, 2), filename);
    setReportStatus('Saved report snapshot.', 'success');
}

function applyReportSnapshot(snapshot) {
    if (!snapshot || !snapshot.report) {
        setReportStatus('Invalid report file.', 'error');
        return;
    }

    reportPattern.value = snapshot.pattern || '';
    reportCase.checked = Boolean(snapshot.caseInsensitive);

    const scopeValue = snapshot.searchIn || 'value';
    if (reportScope.querySelector(`option[value="${scopeValue}"]`)) {
        reportScope.value = scopeValue;
    } else {
        reportScope.value = 'value';
    }

    const namespaceInputs = Array.from(reportNamespaceList.querySelectorAll('input[type="checkbox"]'));
    const availableNamespaces = namespaceInputs.map(input => input.value);
    const snapshotNamespaces = Array.isArray(snapshot.namespaces) ? snapshot.namespaces : [];
    const namespaceSet = new Set(snapshotNamespaces);
    namespaceInputs.forEach(input => {
        input.checked = namespaceSet.has(input.value);
    });
    updateReportSelectionState();

    const missingNamespaces = snapshotNamespaces.filter(ns => !availableNamespaces.includes(ns));

    clearReportAnnotations();
    applyReportAnnotations(snapshot.annotations);

    const reportPayload = snapshot.report;
    lastReportHistorySignature = saveReportHistoryEntry({
        pattern: snapshot.pattern || '',
        caseInsensitive: Boolean(snapshot.caseInsensitive),
        searchIn: snapshot.searchIn || 'value',
        namespaces: snapshotNamespaces,
    });
    if (lastReportHistorySignature) {
        updateReportHistoryResults(lastReportHistorySignature, reportPayload);
        const history = loadReportHistory();
        const target = history.find(item => buildHistorySignature(item) === lastReportHistorySignature);
        if (target) {
            target.annotations = Array.isArray(snapshot.annotations) ? snapshot.annotations : [];
            target.annotationsSavedAt = new Date().toISOString();
            writeReportHistory(history);
        }
    }
    seedReportAnnotationSeeds(reportPayload);
    if (reportPayload.mode === 'single' && reportPayload.data) {
        if (!reportPayload.data.namespace && snapshotNamespaces.length === 1) {
            reportPayload.data.namespace = snapshotNamespaces[0];
        }
        renderReportResults(reportPayload.data);
    } else if (reportPayload.mode === 'multi') {
        renderMultiNamespaceResults(reportPayload.reports || []);
    } else {
        setReportStatus('Report file missing data.', 'error');
        reportResults.innerHTML = '';
        return;
    }

    setReportPostRunVisible(true);
    resetReportViewState();

    if (missingNamespaces.length) {
        setReportStatus(`Loaded report. Missing namespaces: ${missingNamespaces.join(', ')}.`, 'info');
    } else {
        setReportStatus('Loaded saved report.', 'success');
    }
    renderReportHistory();
}

function handleReportLoad(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const snapshot = JSON.parse(reader.result);
            applyReportSnapshot(snapshot);
        } catch (error) {
            setReportStatus(`Error: ${error.message}`, 'error');
        }
    };
    reader.onerror = () => {
        setReportStatus('Failed to read report file.', 'error');
    };
    reader.readAsText(file);

    input.value = '';
}

async function downloadSpringConfigReport() {
    const pattern = reportPattern.value.trim();
    const selectedNamespaces = getSelectedReportNamespaces();
    if (!pattern) {
        setReportStatus('Enter a regex pattern to search.', 'error');
        return;
    }
    if (selectedNamespaces.length === 0) {
        setReportStatus('Select at least one namespace to download a CSV.', 'error');
        return;
    }

    const caseInsensitive = reportCase.checked;
    const searchIn = reportScope.value || 'value';
    const query = new URLSearchParams({
        pattern,
        caseInsensitive: caseInsensitive ? 'true' : 'false',
        searchIn,
    });

    setReportStatus('Preparing CSV download...', 'info');

    try {
        if (selectedNamespaces.length === 1) {
            const targetNamespace = selectedNamespaces[0];
            if (reportResultsState && reportResultsState.mode === 'single') {
                const reportData = reportResultsState.data;
                if (reportData && reportData.namespace === targetNamespace) {
                    const csvContent = buildReportCsv(reportData);
                    triggerCsvDownload(csvContent, `spring-config-report-${targetNamespace}.csv`);
                    setReportStatus('CSV downloaded.', 'success');
                    return;
                }
            }

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
            return;
        }

        const reports = [];
        for (const namespace of selectedNamespaces) {
            const fromState = getReportDataForNamespace(namespace);
            if (fromState) {
                reports.push({ namespace, data: fromState });
                continue;
            }

            const response = await fetch(`${API_BASE_URL}/config/${namespace}/report?${query.toString()}`);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `Failed to fetch report for ${namespace}`);
            }
            const data = await response.json();
            reports.push({ namespace, data });
        }

        const csvContent = buildReportCsvForReports(reports);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        triggerCsvDownload(csvContent, `spring-config-report-multi-${timestamp}.csv`);
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

function toggleReportKey(keyCard) {
    const isOpen = keyCard.classList.toggle('is-open');
    keyCard.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function updateReportKeyState(keyCard, annotation) {
    keyCard.classList.toggle('is-justified', Boolean(annotation.justified));
    keyCard.classList.toggle('is-migration', Boolean(annotation.migrationRequired));
}

function toggleReportKeySelection(keyCard) {
    const isSelected = keyCard.classList.contains('is-selected');
    setReportKeySelected(keyCard, !isSelected);
}

function setReportKeySelected(keyCard, isSelected) {
    if (!keyCard) {
        return;
    }
    keyCard.classList.toggle('is-selected', isSelected);
    keyCard.setAttribute('aria-selected', isSelected ? 'true' : 'false');
}

function setReportKeySelection(shouldSelect) {
    if (!reportResults) {
        return;
    }
    const keys = reportResults.querySelectorAll('.report-key');
    keys.forEach(keyCard => {
        setReportKeySelected(keyCard, shouldSelect);
    });
}

function setNamespaceReportKeySelection(namespace, shouldSelect) {
    if (!reportResults) {
        return;
    }
    const namespaceDetails = reportResults.querySelectorAll('.report-namespace');
    namespaceDetails.forEach(detail => {
        if (detail.dataset.namespace !== namespace) {
            return;
        }
        const keys = detail.querySelectorAll('.report-key');
        keys.forEach(keyCard => {
            setReportKeySelected(keyCard, shouldSelect);
        });
    });
}

function getSelectedReportKeyCards() {
    if (!reportResults) {
        return [];
    }
    return Array.from(reportResults.querySelectorAll('.report-key.is-selected'));
}

function getEventTargetElement(event) {
    if (event.target instanceof Element) {
        return event.target;
    }
    if (event.target && event.target.parentElement) {
        return event.target.parentElement;
    }
    return null;
}

function clearReportAnnotations() {
    reportAnnotations.clear();
    reportAnnotationSeeds.clear();
}

function applyReportAnnotations(annotations) {
    if (!Array.isArray(annotations)) {
        return;
    }
    annotations.forEach(item => {
        if (!item || !item.matchId) {
            return;
        }
        const entry = {
            justified: Boolean(item.justified),
            migrationRequired: Boolean(item.migrationRequired),
            comment: item.comment ? String(item.comment) : '',
        };
        reportAnnotations.set(item.matchId, entry);
        if (item.stableId) {
            reportAnnotationSeeds.set(item.stableId, entry);
        }
    });
}

function getReportAnnotation(matchId, stableId) {
    if (!reportAnnotations.has(matchId)) {
        if (stableId && reportAnnotationSeeds.has(stableId)) {
            const seed = reportAnnotationSeeds.get(stableId);
            reportAnnotations.set(matchId, seed);
            return seed;
        }
        reportAnnotations.set(matchId, {
            justified: false,
            migrationRequired: false,
            comment: '',
        });
    }
    const entry = reportAnnotations.get(matchId);
    if (stableId && entry && !reportAnnotationSeeds.has(stableId)) {
        reportAnnotationSeeds.set(stableId, entry);
    }
    return entry;
}

function getReportMatchId(namespace, workloadName, keyEntry) {
    const source = keyEntry.source || 'effective';
    const matchOn = keyEntry.matchOn || 'value';
    const value = keyEntry.value || '';
    const rawId = `${namespace}||${workloadName}||${keyEntry.key}||${source}||${matchOn}||${value}`;
    return toBase64(rawId);
}

function getReportStableId(namespace, workloadName, keyEntry) {
    const source = keyEntry.source || 'effective';
    const matchOn = keyEntry.matchOn || 'value';
    const rawId = `${namespace}||${workloadName}||${keyEntry.key}||${source}||${matchOn}`;
    return toBase64(rawId);
}

function getSkippedMatchId(namespace, workloadName, workloadKind) {
    const rawId = `${namespace}||${workloadName}||__skipped__||${workloadKind || ''}`;
    return toBase64(rawId);
}

function getSkippedStableId(namespace, workloadName, workloadKind) {
    const rawId = `${namespace}||${workloadName}||__skipped__||${workloadKind || ''}`;
    return toBase64(rawId);
}

function seedReportAnnotationSeeds(reportPayload) {
    if (!reportPayload) {
        return;
    }
    const reportList = reportPayload.mode === 'single'
        ? [{ namespace: reportPayload.data?.namespace || '', data: reportPayload.data || {} }]
        : (reportPayload.reports || []);

    reportList.forEach(report => {
        const namespace = report.namespace || '';
        const matched = report.data?.matched || [];
        matched.forEach(workload => {
            const workloadName = workload.workloadName || '';
            (workload.matches || []).forEach(match => {
                const matchId = getReportMatchId(namespace, workloadName, match);
                if (!reportAnnotations.has(matchId)) {
                    return;
                }
                const stableId = getReportStableId(namespace, workloadName, match);
                if (!reportAnnotationSeeds.has(stableId)) {
                    reportAnnotationSeeds.set(stableId, reportAnnotations.get(matchId));
                }
            });
        });
    });
}

function toBase64(value) {
    return btoa(unescape(encodeURIComponent(value)));
}

function buildReportCsv(reportData, options = {}) {
    const includeNamespace = Boolean(options.includeNamespace);
    const rows = [];
    rows.push([
        ...(includeNamespace ? ['namespace'] : []),
        'workloadName',
        'workloadKind',
        'key',
        'value',
        'source',
        'matchOn',
        'justified',
        'migrationRequired',
        'comment',
    ]);

    appendReportCsvRows(rows, reportData, includeNamespace);
    return rows.map(row => row.map(escapeCsvValue).join(',')).join('\n');
}

function buildReportCsvForReports(reports) {
    const rows = [];
    rows.push([
        'namespace',
        'workloadName',
        'workloadKind',
        'key',
        'value',
        'source',
        'matchOn',
        'justified',
        'migrationRequired',
        'comment',
    ]);

    (reports || []).forEach(report => {
        appendReportCsvRows(rows, report?.data || {}, true, report?.namespace);
    });

    return rows.map(row => row.map(escapeCsvValue).join(',')).join('\n');
}

function appendReportCsvRows(rows, reportData, includeNamespace, namespaceOverride) {
    const namespace = namespaceOverride || reportData.namespace || '';
    const matched = reportData.matched || [];
    matched.forEach(workload => {
        const workloadName = workload.workloadName || '';
        const workloadKind = workload.workloadKind || '';
        (workload.matches || []).forEach(match => {
            const matchId = getReportMatchId(namespace, workloadName, match);
            const annotation = getReportAnnotation(matchId);
            rows.push([
                ...(includeNamespace ? [namespace] : []),
                workloadName,
                workloadKind,
                match.key || '',
                match.value || '',
                match.source || '',
                match.matchOn || '',
                annotation.justified ? 'true' : 'false',
                annotation.migrationRequired ? 'true' : 'false',
                annotation.comment || '',
            ]);
        });
    });
}

function escapeCsvValue(value) {
    const text = value == null ? '' : String(value);
    if (text.includes('"') || text.includes(',') || text.includes('\n')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function triggerCsvDownload(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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

function parsePropertiesContent(content) {
    if (!content) return {};
    const values = {};
    const lines = content.split(/\r?\n/);
    lines.forEach(rawLine => {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.startsWith('!')) {
            return;
        }
        let idx = line.indexOf('=');
        if (idx < 0) {
            idx = line.indexOf(':');
        }
        if (idx < 0) {
            return;
        }
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key && value) {
            values[key] = stripQuotes(value);
        }
    });
    return values;
}

function parseYamlContent(content) {
    if (!content) return {};
    const values = {};
    const path = [];
    let indents = [];
    const lines = content.split(/\r?\n/);

    lines.forEach(rawLine => {
        let line = rawLine;
        const hashIndex = line.indexOf('#');
        if (hashIndex >= 0) {
            line = line.slice(0, hashIndex);
        }
        if (!line.trim()) {
            return;
        }
        const indent = countLeadingSpaces(line);
        const trimmed = line.trim();
        if (trimmed.startsWith('-')) {
            return;
        }
        const parts = trimmed.split(':', 2);
        if (!parts.length) {
            return;
        }
        const key = parts[0].trim();
        const value = parts.length > 1 ? parts[1].trim() : '';

        while (path.length && indents[path.length - 1] >= indent) {
            path.pop();
        }
        if (!value) {
            path.push(key);
            if (indents.length < path.length) {
                indents = indents.concat(Array(path.length - indents.length).fill(0));
            }
            indents[path.length - 1] = indent;
            return;
        }
        const full = path.concat([key]).join('.');
        values[full] = stripQuotes(value);
    });

    return values;
}

function countLeadingSpaces(value) {
    let count = 0;
    while (count < value.length && value.charAt(count) === ' ') {
        count += 1;
    }
    return count;
}

function stripQuotes(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function isBootstrapName(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return /(^|\/)bootstrap[^\/]*\.(yml|yaml|properties)$/.test(lower);
}

function isApplicationName(name) {
    if (!name) return false;
    const lower = name.toLowerCase();
    return /(^|\/)application[^\/]*\.(yml|yaml|properties)$/.test(lower);
}

function parseConfigContent(name, content) {
    if (!content) return {};
    const lower = (name || '').toLowerCase();
    const isYaml = lower.endsWith('.yml') || lower.endsWith('.yaml');
    return isYaml ? parseYamlContent(content) : parsePropertiesContent(content);
}

function collectAgentConfigEntries(payload) {
    const entries = [];
    const classpath = payload?.classpathResources || {};
    Object.entries(classpath).forEach(([name, items]) => {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
            const content = item?.content;
            if (!content) return;
            const type = isBootstrapName(name) ? 'bootstrap' : (isApplicationName(name) ? 'application' : null);
            if (!type) return;
            const values = parseConfigContent(name, content);
            if (Object.keys(values).length === 0) return;
            entries.push({ type, origin: 'classpath', values });
        });
    });

    const files = payload?.files?.matches || [];
    if (Array.isArray(files)) {
        files.forEach(item => {
            const path = item?.path || '';
            const content = item?.content;
            const type = isBootstrapName(path) ? 'bootstrap' : (isApplicationName(path) ? 'application' : null);
            if (!type || !content) return;
            const values = parseConfigContent(path, content);
            if (Object.keys(values).length === 0) return;
            entries.push({ type, origin: 'file', values });
        });
    }

    const jarMatches = payload?.jarResources?.matches || [];
    if (Array.isArray(jarMatches)) {
        jarMatches.forEach(jar => {
            const jarEntries = jar?.entries || [];
            if (!Array.isArray(jarEntries)) return;
            jarEntries.forEach(entry => {
                const name = entry?.name || '';
                const content = entry?.content;
                const type = isBootstrapName(name) ? 'bootstrap' : (isApplicationName(name) ? 'application' : null);
                if (!type || !content) return;
                const values = parseConfigContent(name, content);
                if (Object.keys(values).length === 0) return;
                entries.push({ type, origin: 'jar', values });
            });
        });
    }

    return entries;
}

function classifyConfigServerSource(sourceName, appName) {
    const lower = (sourceName || '').toLowerCase();
    const appToken = (appName || '').toLowerCase();
    if (appToken) {
        if (lower.includes(`/${appToken}.`)
            || lower.includes(`/${appToken}-`)
            || lower.endsWith(`/${appToken}`)
            || lower.endsWith(`${appToken}.yml`)
            || lower.endsWith(`${appToken}.yaml`)
            || lower.endsWith(`${appToken}.properties`)) {
            return 'config-workload';
        }
    }
    if (lower.includes('/application.')
        || lower.includes('/application-')
        || lower.endsWith('application.yml')
        || lower.endsWith('application.yaml')
        || lower.endsWith('application.properties')) {
        return 'config-app';
    }
    return null;
}

function parseConfigServerPayload(payload) {
    const configServer = payload?.configServer;
    if (!configServer || !configServer.content) {
        return { data: null, error: null };
    }
    if (typeof configServer.content === 'object') {
        return { data: configServer.content, error: null };
    }
    if (typeof configServer.content !== 'string') {
        return { data: null, error: 'Config server content is not JSON.' };
    }
    try {
        const parsed = JSON.parse(configServer.content);
        return { data: parsed, error: null };
    } catch (error) {
        return { data: null, error: 'Config server response is not valid JSON.' };
    }
}

function orderConfigSourcesByPrecedence(sources) {
    const weights = {
        'config-workload': 3,
        'config-app': 2,
        'application': 1,
        'bootstrap': 0,
    };
    return sources
        .map((source, index) => ({ ...source, _order: index }))
        .sort((a, b) => {
            const weightA = weights[a.categoryKey] ?? -1;
            const weightB = weights[b.categoryKey] ?? -1;
            if (weightA !== weightB) {
                return weightB - weightA;
            }
            return a._order - b._order;
        })
        .map(({ _order, ...rest }) => rest);
}

function buildAgentConfigSources(payload, workloadName) {
    const warnings = [];
    const entries = collectAgentConfigEntries(payload);
    const precedence = { classpath: 0, jar: 1, file: 2 };
    const bootstrapEntries = entries.filter(item => item.type === 'bootstrap')
        .sort((a, b) => (precedence[a.origin] || 0) - (precedence[b.origin] || 0));
    const applicationEntries = entries.filter(item => item.type === 'application')
        .sort((a, b) => (precedence[a.origin] || 0) - (precedence[b.origin] || 0));

    const mergeEntries = (items) => {
        const merged = {};
        items.forEach(item => {
            Object.assign(merged, item.values || {});
        });
        return merged;
    };

    const bootstrapValues = mergeEntries(bootstrapEntries);
    const applicationValues = mergeEntries(applicationEntries);

    const configServer = parseConfigServerPayload(payload);
    const configWorkloadSources = [];
    const configAppSources = [];
    let activeProfiles = [];
    let appName = workloadName;

    if (configServer.data) {
        appName = configServer.data.name || appName;
        if (Array.isArray(configServer.data.profiles)) {
            activeProfiles = configServer.data.profiles;
        }
        const propertySources = Array.isArray(configServer.data.propertySources)
            ? configServer.data.propertySources
            : [];
        propertySources.forEach(source => {
            if (!source || typeof source !== 'object') return;
            const name = String(source.name || '');
            const props = source.source && typeof source.source === 'object' ? source.source : {};
            if (!Object.keys(props).length) return;
            const category = classifyConfigServerSource(name, appName);
            if (category === 'config-workload') {
                configWorkloadSources.push({
                    name,
                    properties: props,
                    categoryKey: 'config-workload',
                    categoryLabel: `config ${appName || 'application'}.yml`,
                });
            } else if (category === 'config-app') {
                configAppSources.push({
                    name,
                    properties: props,
                    categoryKey: 'config-app',
                    categoryLabel: 'config application.yml',
                });
            }
        });
    } else if (configServer.error) {
        warnings.push(configServer.error);
    }

    const propertySources = [];
    propertySources.push(...configWorkloadSources);
    propertySources.push(...configAppSources);
    if (Object.keys(applicationValues).length) {
        propertySources.push({
            name: 'image application.yml',
            properties: applicationValues,
            categoryKey: 'application',
            categoryLabel: 'image application.yml',
        });
    }
    if (Object.keys(bootstrapValues).length) {
        propertySources.push({
            name: 'bootstrap.yml',
            properties: bootstrapValues,
            categoryKey: 'bootstrap',
            categoryLabel: 'bootstrap.yml',
        });
    }

    const orderedSources = orderConfigSourcesByPrecedence(propertySources);
    return { propertySources: orderedSources, activeProfiles, warnings };
}

function buildAgentReportMatches(payload, workloadName, workloadKind, pattern, caseInsensitive) {
    if (!pattern) {
        return { matchedItem: null, error: 'Enter a regex pattern to search.' };
    }
    let regex;
    try {
        regex = new RegExp(pattern, caseInsensitive ? 'i' : '');
    } catch (error) {
        return { matchedItem: null, error: `Invalid regex pattern: ${error.message}` };
    }

    const { propertySources } = buildAgentConfigSources(payload, workloadName);
    if (!propertySources.length) {
        return { matchedItem: null, error: 'Spring Config Agent returned no config sources.' };
    }

    const effectiveIndex = buildEffectiveIndex(propertySources);
    const matches = Object.keys(effectiveIndex.valueByKey).map(key => {
        const valueText = formatValue(effectiveIndex.valueByKey[key]);
        if (!regex.test(valueText)) {
            return null;
        }
        return {
            key,
            value: valueText,
            source: effectiveIndex.sourceNameByKey[key],
            matchOn: 'value',
        };
    }).filter(Boolean);

    if (!matches.length) {
        return { matchedItem: null, error: null };
    }

    matches.sort((a, b) => a.key.localeCompare(b.key));
    return {
        matchedItem: {
            workloadName,
            workloadKind: workloadKind || 'workload',
            matches,
        },
        error: null,
    };
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

function getSourceCategory(sourceName, workloadName, source) {
    if (source && source.categoryKey) {
        return {
            key: source.categoryKey,
            label: source.categoryLabel || sourceName || 'Config source',
        };
    }
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

    if (sourceName.includes('applicationConfig: [classpath:/application')) {
        return { key: 'application', label: 'image application.yml' };
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
    const chainOrder = ['bootstrap', 'application', 'config-app', 'config-workload'];
    const sections = chainOrder.map(chainKey => {
        const matchingSources = sources
            .map((source, index) => ({ source, index }))
            .filter(item => getSourceCategory(item.source.name || '', workloadName, item.source).key === chainKey);

        if (matchingSources.length === 0) {
            return '';
        }

        const label = getSourceCategory(
            matchingSources[0].source.name || '',
            workloadName,
            matchingSources[0].source,
        ).label;
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

async function viewSpringConfig(namespace, workloadName, kindLabel, workloadKind) {
    showConfigPanel();
    configTitle.textContent = `Spring Config Explorer`;
    configMeta.textContent = `Loading ${workloadName} (${kindLabel}) in ${namespace}...`;
    setConfigStatus('Fetching config from running pod...', 'info');
    configContent.innerHTML = '';
    configProfiles.innerHTML = '';
    if (configAgentRun) {
        configAgentRun.disabled = true;
        configAgentRun.textContent = 'Run Config Agent';
    }

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
            namespace: data.namespace || namespace,
            workloadKind: workloadKind || data.workloadKind,
            effectiveIndex: buildEffectiveIndex(propertySources),
            sourceType: 'actuator',
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
        if (configAgentRun) {
            configAgentRun.disabled = false;
        }
    } catch (error) {
        console.error('Error loading spring config:', error);
        setConfigStatus(`Error: ${error.message}`, 'error');
        configContent.innerHTML = '';
        if (configAgentRun) {
            configAgentRun.disabled = false;
        }
    }
}

async function runSpringConfigAgent() {
    if (!configState || !configState.namespace || !configState.workloadName) {
        setConfigStatus('Open a workload before running the config agent.', 'error');
        return;
    }
    const namespace = configState.namespace;
    const workloadName = configState.workloadName;
    const workloadKind = configState.workloadKind;

    if (configAgentRun) {
        configAgentRun.disabled = true;
        configAgentRun.textContent = 'Running...';
    }

    setConfigStatus('Running Spring Config Agent (highest-precedence wins)...', 'info');
    configContent.innerHTML = '';
    configProfiles.innerHTML = '';

    try {
        const response = await fetch(`${API_BASE_URL}/config/${namespace}/${workloadName}/apply-spring-config-agent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ workloadKind }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData.detail?.message || errorData.detail || 'Failed to run Spring Config Agent';
            throw new Error(message);
        }

        const data = await response.json();
        const payload = data.payload || data;
        const { propertySources, activeProfiles, warnings } = buildAgentConfigSources(payload, workloadName);

        configState = {
            ...configState,
            propertySources,
            activeProfiles,
            effectiveIndex: buildEffectiveIndex(propertySources),
            sourceType: 'agent',
        };

        configViewMode.value = 'effective';
        renderProfiles(activeProfiles);
        renderConfigSources();

        if (!propertySources.length) {
            setConfigStatus('Spring Config Agent returned no config sources.', 'error');
        } else if (warnings.length) {
            setConfigStatus(`Loaded agent config with warnings: ${warnings.join(' ')}`, 'error');
        } else {
            setConfigStatus('Loaded Spring Config Agent config chain (effective values first).', 'success');
        }
    } catch (error) {
        console.error('Error running spring config agent:', error);
        setConfigStatus(`Error: ${error.message}`, 'error');
    } finally {
        if (configAgentRun) {
            configAgentRun.disabled = false;
            configAgentRun.textContent = 'Run Config Agent';
        }
    }
}

function updateReportDataForWorkload(targetData, workloadName, workloadResult) {
    if (!targetData) {
        return;
    }
    const matchedItem = (workloadResult.matched || [])[0] || null;
    const errorItem = (workloadResult.errors || [])[0] || null;

    targetData.matched = (targetData.matched || []).filter(item => item.workloadName !== workloadName);
    targetData.errors = (targetData.errors || []).filter(item => item.workloadName !== workloadName);

    if (matchedItem) {
        targetData.matched.push(matchedItem);
        targetData.matched.sort((a, b) => (a.workloadName || '').localeCompare(b.workloadName || ''));
    } else if (errorItem) {
        targetData.errors.push(errorItem);
    }
}

function markReportWorkloadApplied(namespace, workloadName, workloadKind) {
    if (!reportResultsState || !namespace || !workloadName) {
        return;
    }

    const markAppliedOnData = (data) => {
        if (!data) {
            return;
        }
        const matched = data.matched || [];
        matched.forEach(item => {
            if (item.workloadName === workloadName) {
                item.agentApplied = true;
            }
        });

        const errors = data.errors || [];
        errors.forEach(err => {
            if (err.workloadName === workloadName && (!workloadKind || err.workloadKind === workloadKind)) {
                err.agentApplied = true;
            }
        });
    };

    if (reportResultsState.mode === 'single') {
        if (reportResultsState.data?.namespace !== namespace) {
            return;
        }
        markAppliedOnData(reportResultsState.data);
        return;
    }

    if (reportResultsState.mode === 'multi') {
        const targetReport = reportResultsState.reports.find(report => report.namespace === namespace);
        if (!targetReport) {
            return;
        }
        markAppliedOnData(targetReport.data);
    }
}

function applyWorkloadReportUpdate(namespace, workloadName, workloadResult) {
    if (!reportResultsState) {
        return;
    }

    if (reportResultsState.mode === 'single') {
        if (reportResultsState.data?.namespace !== namespace) {
            return;
        }
        updateReportDataForWorkload(reportResultsState.data, workloadName, workloadResult);
        renderReportResults(reportResultsState.data);
        return;
    }

    if (reportResultsState.mode === 'multi') {
        const targetReport = reportResultsState.reports.find(report => report.namespace === namespace);
        if (!targetReport) {
            return;
        }
        updateReportDataForWorkload(targetReport.data, workloadName, workloadResult);
        renderMultiNamespaceResults(reportResultsState.reports);
    }
}

async function exposeActuatorEnv(namespace, workloadName, workloadKind, buttonEl) {
    if (!namespace || !workloadName) {
        alert('Missing namespace or workload name.');
        return;
    }

    const kindLabel = workloadKind || 'workload';
    if (!confirm(`Expose /actuator/env for ${workloadName} (${kindLabel}) in ${namespace}?`)) {
        return;
    }

    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.classList.remove('is-success', 'is-error');
        buttonEl.textContent = 'Standby...';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/config/${namespace}/${workloadName}/expose-actuator-env`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ workloadKind }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData.detail?.message || errorData.detail || 'Failed to expose actuator env';
            throw new Error(message);
        }

        const result = await response.json();
        setReportStatus(result.message || 'Actuator env exposed. Waiting for pods...', 'info');
        await waitForWorkloadReady(namespace, workloadName, workloadKind, buttonEl);
        if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.textContent = 'Run Report';
            buttonEl.classList.add('is-success');
            buttonEl.onclick = () => runSingleWorkloadReport(namespace, workloadName, buttonEl);
        }
        setReportStatus('Pods are ready. Run the report for this app.', 'success');
    } catch (error) {
        console.error('Error exposing actuator env:', error);
        if (buttonEl && !buttonEl.classList.contains('is-error')) {
            buttonEl.disabled = false;
            buttonEl.textContent = 'Expose Actuator';
        }
        setReportStatus(`Error: ${error.message}`, 'error');
    }
}

async function applySpringConfigAgent(namespace, workloadName, workloadKind, buttonEl) {
    if (!namespace || !workloadName) {
        setReportStatus('Missing namespace or workload name.', 'error');
        return {
            ok: false,
            namespace,
            workloadName,
            workloadKind,
            errorMessage: 'Missing namespace or workload name.',
        };
    }

    const kindLabel = workloadKind || 'workload';
    let success = false;
    let errorMessage = '';
    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.classList.remove('is-success', 'is-error');
        buttonEl.textContent = 'Applying...';
    }

    const statusEl = buttonEl
        ? buttonEl.closest('.report-key')?.querySelector('[data-inline-status="true"]')
        : null;
    setInlineStatus(statusEl, 'Applying Spring Config Agent...', 'info');

    try {
        const response = await fetch(`${API_BASE_URL}/config/${namespace}/${workloadName}/apply-spring-config-agent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ workloadKind }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData.detail?.message || errorData.detail || 'Failed to apply Spring Config Agent';
            throw new Error(message);
        }

        const result = await response.json();
        const message = result.message || 'Spring Config Agent applied.';
        setReportStatus(message, 'success');
        setInlineStatus(statusEl, message, 'success');

        const payload = result.payload || result;
        const pattern = reportPattern.value.trim();
        const caseInsensitive = reportCase.checked;
        const { matchedItem, error } = buildAgentReportMatches(
            payload,
            workloadName,
            workloadKind,
            pattern,
            caseInsensitive,
        );
        if (error) {
            setInlineStatus(statusEl, error, 'error');
            setReportStatus(error, 'error');
            markReportWorkloadApplied(namespace, workloadName, workloadKind);
        } else if (matchedItem && reportResultsState) {
            applyWorkloadReportUpdate(namespace, workloadName, {
                matched: [matchedItem],
                errors: [],
            });
            setInlineStatus(statusEl, `Report matched ${matchedItem.matches.length} key(s).`, 'success');
            setReportStatus(`Report matched ${matchedItem.matches.length} key(s) for ${workloadName}.`, 'success');
            markReportWorkloadApplied(namespace, workloadName, workloadKind);
        } else if (!matchedItem) {
            applyWorkloadReportUpdate(namespace, workloadName, { matched: [], errors: [] });
            setInlineStatus(statusEl, 'No matching keys for the current pattern.', 'info');
            setReportStatus(`No matching keys for ${workloadName}.`, 'info');
            markReportWorkloadApplied(namespace, workloadName, workloadKind);
        }

        if (buttonEl) {
            buttonEl.textContent = 'Applied';
            buttonEl.classList.add('is-success');
        }
        success = true;
    } catch (error) {
        console.error('Error applying Spring Config Agent:', error);
        errorMessage = `Error: ${error.message}`;
        setReportStatus(errorMessage, 'error');
        setInlineStatus(statusEl, errorMessage, 'error');
        if (buttonEl) {
            buttonEl.textContent = 'Apply Spring Config Agent';
            buttonEl.classList.add('is-error');
        }
        success = false;
    } finally {
        if (buttonEl) {
            buttonEl.disabled = false;
        }
    }
    return {
        ok: success,
        namespace,
        workloadName,
        workloadKind,
        errorMessage,
    };
}

function getReportDataList(namespaceFilter) {
    if (!reportResultsState) {
        return [];
    }

    if (reportResultsState.mode === 'single') {
        const data = reportResultsState.data || {};
        const namespace = data.namespace || currentNamespace;
        if (namespaceFilter && namespaceFilter !== namespace) {
            return [];
        }
        return [{ namespace, data }];
    }

    if (reportResultsState.mode === 'multi') {
        return (reportResultsState.reports || [])
            .map(report => ({
                namespace: report.namespace || '',
                data: report.data || {},
            }))
            .filter(entry => entry.namespace && (!namespaceFilter || entry.namespace === namespaceFilter));
    }

    return [];
}

function collectReportTargets({ namespaceFilter, includeMatched, includeErrors }) {
    const targets = [];
    const seen = new Set();
    const entries = getReportDataList(namespaceFilter);

    entries.forEach(entry => {
        const namespace = entry.namespace || '';
        if (!namespace) {
            return;
        }

        if (includeMatched) {
            (entry.data.matched || []).forEach(item => {
                const workloadName = item.workloadName || '';
                if (!workloadName) {
                    return;
                }
                if (item.agentApplied) {
                    return;
                }
                const workloadKind = item.workloadKind || '';
                const key = `${namespace}||${workloadName}||${workloadKind}`;
                if (seen.has(key)) {
                    return;
                }
                seen.add(key);
                targets.push({ namespace, workloadName, workloadKind });
            });
        }

        if (includeErrors) {
            (entry.data.errors || []).forEach(err => {
                if (!err || !err.workloadName || err.workloadKind === 'namespace') {
                    return;
                }
                if (err.agentApplied) {
                    return;
                }
                const workloadName = err.workloadName || '';
                const workloadKind = err.workloadKind || '';
                const key = `${namespace}||${workloadName}||${workloadKind}`;
                if (seen.has(key)) {
                    return;
                }
                seen.add(key);
                targets.push({ namespace, workloadName, workloadKind });
            });
        }
    });

    return targets;
}

function isWorkloadFlaggedByMatches(namespace, workloadName, matches) {
    if (!matches || !matches.length) {
        return false;
    }
    let anyMigration = false;
    let allJustified = true;
    matches.forEach(match => {
        const matchId = getReportMatchId(namespace, workloadName, match);
        const stableId = getReportStableId(namespace, workloadName, match);
        const annotation = getReportAnnotation(matchId, stableId);
        if (annotation.migrationRequired) {
            anyMigration = true;
        }
        if (!annotation.justified) {
            allJustified = false;
        }
    });
    if (anyMigration || allJustified) {
        return true;
    }
    if (!reportResults) {
        return false;
    }
    return matches.some(match => {
        const matchId = getReportMatchId(namespace, workloadName, match);
        const keyCard = reportResults.querySelector(`.report-key[data-match-id="${matchId}"]`);
        return Boolean(keyCard?.classList.contains('is-justified') || keyCard?.classList.contains('is-migration'));
    });
}

function collectAllTargetsWithFlags() {
    const targets = [];
    const flaggedTargets = [];
    const entries = getReportDataList();

    entries.forEach(entry => {
        const namespace = entry.namespace || '';
        if (!namespace) {
            return;
        }
        (entry.data.matched || []).forEach(item => {
            const workloadName = item.workloadName || '';
            if (!workloadName) {
                return;
            }
            if (item.agentApplied) {
                return;
            }
            const workloadKind = item.workloadKind || '';
            const isFlagged = isWorkloadFlaggedByMatches(namespace, workloadName, item.matches || []);
            const target = { namespace, workloadName, workloadKind, isFlagged };
            targets.push(target);
            if (isFlagged) {
                flaggedTargets.push(target);
            }
        });

        (entry.data.errors || []).forEach(err => {
            if (!err || !err.workloadName || err.workloadKind === 'namespace') {
                return;
            }
            if (err.agentApplied) {
                return;
            }
            const workloadName = err.workloadName;
            const workloadKind = err.workloadKind || '';
            const matchId = getSkippedMatchId(namespace, workloadName, workloadKind);
            const stableId = getSkippedStableId(namespace, workloadName, workloadKind);
            const annotation = getReportAnnotation(matchId, stableId);
            const keyCard = reportResults
                ? reportResults.querySelector(`.report-key[data-match-id="${matchId}"]`)
                : null;
            const isFlagged = Boolean(
                annotation.justified ||
                annotation.migrationRequired ||
                keyCard?.classList.contains('is-justified') ||
                keyCard?.classList.contains('is-migration'),
            );
            const target = { namespace, workloadName, workloadKind, isFlagged };
            targets.push(target);
            if (isFlagged) {
                flaggedTargets.push(target);
            }
        });
    });

    return { targets, flaggedTargets };
}

function resolveSkippedAgentButton(target) {
    if (!reportResults || !target) {
        return null;
    }
    const matchId = getSkippedMatchId(target.namespace, target.workloadName, target.workloadKind || '');
    const keyCard = reportResults.querySelector(`.report-key[data-match-id="${matchId}"]`);
    if (!keyCard) {
        return null;
    }
    return keyCard.querySelector('.btn-agent');
}

function collectSkippedTargetsForNamespace(namespace) {
    const targets = [];
    const flaggedTargets = [];
    if (!reportResultsState || !namespace) {
        return { targets, flaggedTargets };
    }

    const entries = getReportDataList(namespace);
    entries.forEach(entry => {
        if (entry.namespace !== namespace) {
            return;
        }
        const errors = entry.data.errors || [];
        errors.forEach(err => {
            if (!err || !err.workloadName || err.workloadKind === 'namespace') {
                return;
            }
            if (err.agentApplied) {
                return;
            }
            const workloadKind = err.workloadKind || '';
            const matchId = getSkippedMatchId(namespace, err.workloadName, workloadKind);
            const stableId = getSkippedStableId(namespace, err.workloadName, workloadKind);
            const annotation = getReportAnnotation(matchId, stableId);
            const keyCard = reportResults
                ? reportResults.querySelector(`.report-key[data-match-id="${matchId}"]`)
                : null;
            const isFlagged = Boolean(
                annotation.justified ||
                annotation.migrationRequired ||
                keyCard?.classList.contains('is-justified') ||
                keyCard?.classList.contains('is-migration'),
            );
            const target = {
                namespace,
                workloadName: err.workloadName,
                workloadKind,
                isFlagged,
            };
            targets.push(target);
            if (isFlagged) {
                flaggedTargets.push(target);
            }
        });
    });

    return { targets, flaggedTargets };
}

async function applySpringConfigAgentBulk(targets, options = {}) {
    const {
        scopeLabel = 'applications',
        confirmMessage,
        buttonResolver,
        triggerButton,
        showFailureModal = false,
        failureTitle,
        showSummaryModal = false,
    } = options;

    if (!targets.length) {
        setReportStatus(`No ${scopeLabel} found to apply Spring Config Agent.`, 'info');
        return;
    }

    if (confirmMessage && !confirm(confirmMessage)) {
        return;
    }

    const originalLabel = triggerButton ? triggerButton.textContent : '';
    if (triggerButton) {
        triggerButton.disabled = true;
    }
    if (showFailureModal) {
        closeAgentFailureModal();
    }
    if (showSummaryModal) {
        closeAgentApplySummaryModal();
    }

    const batchSize = 10;
    let successCount = 0;
    let failureCount = 0;
    const successes = [];
    const failures = [];

    for (let start = 0; start < targets.length; start += batchSize) {
        const batch = targets.slice(start, start + batchSize);
        const end = Math.min(start + batch.length, targets.length);
        if (triggerButton) {
            triggerButton.textContent = `Applying... ${end}/${targets.length}`;
        }
        setReportStatus(
            `Applying Spring Config Agent (${start + 1}-${end}/${targets.length})...`,
            'info',
        );

        const results = await Promise.all(batch.map(async target => {
            const buttonEl = buttonResolver ? buttonResolver(target) : null;
            const result = await applySpringConfigAgent(
                target.namespace,
                target.workloadName,
                target.workloadKind,
                buttonEl,
            );
            return { target, result };
        }));

        results.forEach(({ target, result }) => {
            if (result && result.ok) {
                successCount += 1;
                successes.push({
                    namespace: target.namespace,
                    workloadName: target.workloadName,
                    workloadKind: target.workloadKind,
                });
            } else {
                failureCount += 1;
                failures.push({
                    namespace: target.namespace,
                    workloadName: target.workloadName,
                    workloadKind: target.workloadKind,
                    errorMessage: result?.errorMessage || 'Failed to apply Spring Config Agent.',
                });
            }
        });
    }

    if (showSummaryModal) {
        showAgentApplySummaryModal({
            successes,
            failures,
            scopeLabel,
            title: 'Agent apply summary',
        });
    }

    if (failureCount) {
        setReportStatus(
            `Applied Spring Config Agent to ${successCount}/${targets.length} ${scopeLabel}. ${failureCount} failed.`,
            'error',
        );
        if (showFailureModal) {
            showAgentFailureModal(failures, {
                title: failureTitle,
                scopeLabel,
            });
        }
    } else {
        setReportStatus(`Applied Spring Config Agent to ${successCount} ${scopeLabel}.`, 'success');
    }

    if (triggerButton) {
        triggerButton.disabled = false;
        triggerButton.textContent = originalLabel;
    }
}

async function applySpringConfigAgentToSkippedNamespace(namespace, buttonEl) {
    if (!reportResultsState) {
        setReportStatus('Run a report before applying the Spring Config Agent.', 'error');
        return;
    }

    const { targets: rawTargets, flaggedTargets } = collectSkippedTargetsForNamespace(namespace);
    let targets = rawTargets;
    let confirmMessage = `Apply Spring Config Agent to ${targets.length} skipped application(s) in "${namespace}"?`;
    if (flaggedTargets.length) {
        const includeFlagged = confirm(
            `There are ${flaggedTargets.length} skipped application(s) already marked Justified or Migration required in "${namespace}".\n\n` +
            `OK = include them (apply to ${targets.length} total)\n` +
            `Cancel = skip them (apply to ${targets.length - flaggedTargets.length} total)`,
        );
        if (!includeFlagged) {
            targets = rawTargets.filter(target => !target.isFlagged);
        }
        confirmMessage = null;
    }
    if (!targets.length) {
        setReportStatus(`No skipped applications left to apply in ${namespace}.`, 'info');
        return;
    }

    await applySpringConfigAgentBulk(targets, {
        scopeLabel: `skipped applications in ${namespace}`,
        confirmMessage,
        buttonResolver: resolveSkippedAgentButton,
        triggerButton: buttonEl,
    });
}

async function applySpringConfigAgentToAllApps(buttonEl) {
    if (!reportResultsState) {
        setReportStatus('Run a report before applying the Spring Config Agent.', 'error');
        return;
    }

    const { targets: rawTargets, flaggedTargets } = collectAllTargetsWithFlags();
    let targets = rawTargets;
    let confirmMessage = `Apply Spring Config Agent to ${targets.length} spring application(s) across all namespaces?`;
    if (flaggedTargets.length) {
        const includeFlagged = confirm(
            `There are ${flaggedTargets.length} application(s) already marked Justified or Migration required.\n\n` +
            `Apply to those flagged apps too?\n` +
            `OK = yes (apply to ${targets.length} total)\n` +
            `Cancel = no (apply to ${targets.length - flaggedTargets.length} total)`,
        );
        if (!includeFlagged) {
            targets = rawTargets.filter(target => !target.isFlagged);
        }
        confirmMessage = null;
    }

    if (!targets.length) {
        setReportStatus('No spring applications left to apply Spring Config Agent.', 'info');
        return;
    }

    await applySpringConfigAgentBulk(targets, {
        scopeLabel: 'spring applications',
        confirmMessage,
        triggerButton: buttonEl,
        showFailureModal: false,
        failureTitle: 'Agent apply failures',
        showSummaryModal: true,
    });
}

async function retrySkippedApplication(namespace, workloadName, workloadKind, buttonEl) {
    if (!namespace || !workloadName) {
        setReportStatus('Missing namespace or workload name.', 'error');
        return;
    }

    if (buttonEl) {
        buttonEl.classList.remove('is-error', 'is-success');
    }

    const statusEl = buttonEl
        ? buttonEl.closest('.report-key')?.querySelector('[data-inline-status="true"]')
        : null;

    await runSingleWorkloadReport(namespace, workloadName, buttonEl, {
        defaultLabel: 'Retry',
        runningLabel: 'Retrying...',
        errorLabel: 'Retry',
        suppressGlobalStatus: true,
        inlineStatusEl: statusEl,
    });
}

async function waitForWorkloadReady(namespace, workloadName, workloadKind, buttonEl) {
    const queryKind = workloadKind ? `workloadKind=${encodeURIComponent(workloadKind)}` : '';
    let attempts = 0;
    let baselineRestarts = null;

    return new Promise((resolve, reject) => {
        const poll = async () => {
            attempts += 1;
            try {
                const response = await fetch(`${API_BASE_URL}/config/${namespace}/${workloadName}/rollout-status?${queryKind}`);
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail?.message || errorData.detail || 'Failed to check rollout status');
                }
                const data = await response.json();
                if (baselineRestarts === null && Number.isFinite(data.totalRestarts)) {
                    baselineRestarts = data.totalRestarts;
                }
                if (baselineRestarts !== null && Number.isFinite(data.totalRestarts) && data.totalRestarts > baselineRestarts) {
                    clearInterval(timer);
                    if (buttonEl) {
                        buttonEl.disabled = false;
                        buttonEl.textContent = 'Error: Pod Restarted';
                        buttonEl.classList.add('is-error');
                    }
                    setReportStatus('Error: pod restarted during rollout.', 'error');
                    reject(new Error('Pod restarted during rollout.'));
                    return;
                }
                if (buttonEl) {
                    const desired = Number.isFinite(data.desiredReplicas) ? data.desiredReplicas : 0;
                    const ready = Number.isFinite(data.readyReplicas) ? data.readyReplicas : 0;
                    buttonEl.textContent = `Standby... ${ready}/${desired}`;
                }
                if (data.ready) {
                    clearInterval(timer);
                    resolve(data);
                    return;
                }
                if (attempts >= ROLLOUT_POLL_LIMIT) {
                    clearInterval(timer);
                    reject(new Error('Timed out waiting for pods to become ready.'));
                }
            } catch (error) {
                clearInterval(timer);
                reject(error);
            }
        };

        const timer = setInterval(poll, ROLLOUT_POLL_INTERVAL_MS);
        poll();
    });
}

async function runSingleWorkloadReport(namespace, workloadName, buttonEl, options = {}) {
    const pattern = reportPattern.value.trim();
    if (!pattern) {
        reportSingleStatus(options, 'Enter a regex pattern to search.', 'error');
        return;
    }
    if (!namespace || !workloadName) {
        reportSingleStatus(options, 'Missing namespace or workload name.', 'error');
        return;
    }

    const caseInsensitive = reportCase.checked;
    const searchIn = reportScope.value || 'value';
    const query = new URLSearchParams({
        pattern,
        caseInsensitive: caseInsensitive ? 'true' : 'false',
        searchIn,
    });

    const defaultLabel = options.defaultLabel || 'Run Report';
    const runningLabel = options.runningLabel || 'Running...';
    const errorLabel = options.errorLabel || defaultLabel;

    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.textContent = runningLabel;
    }
    reportSingleStatus(options, runningLabel, 'info');

    try {
        const response = await fetchWithRetry(
            `${API_BASE_URL}/config/${namespace}/${workloadName}/report?${query.toString()}`,
        );
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Failed to fetch report');
        }
        const data = await response.json();
        applyWorkloadReportUpdate(namespace, workloadName, data);
        const matchedCount = (data.matched || []).length;
        if (matchedCount > 0) {
            reportSingleStatus(options, `Report loaded for ${workloadName}.`, 'success');
        } else if ((data.errors || []).length > 0) {
            const message = data.errors[0]?.message || 'Failed to fetch config';
            reportSingleStatus(options, `Error: ${message}`, 'error');
        } else {
            reportSingleStatus(options, `No matching entries for ${workloadName}.`, 'info');
        }
        if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.textContent = defaultLabel;
        }
    } catch (error) {
        console.error('Error running single workload report:', error);
        reportSingleStatus(options, `Error: ${error.message}`, 'error');
        if (buttonEl) {
            buttonEl.disabled = false;
            buttonEl.textContent = errorLabel;
        }
        return;
    }
}

function preserveReportScroll(renderFn) {
    const windowScroll = window.scrollY;
    const containerScroll = reportResults ? reportResults.scrollTop : 0;
    renderFn();
    if (reportResults) {
        reportResults.scrollTop = containerScroll;
    }
    window.scrollTo(0, windowScroll);
}

function reportSingleStatus(options, message, statusType) {
    if (!options || !options.suppressGlobalStatus) {
        setReportStatus(message, statusType);
    }
    if (options && options.inlineStatusEl) {
        setInlineStatus(options.inlineStatusEl, message, statusType);
    }
}

function setInlineStatus(statusEl, message, statusType) {
    if (!statusEl) {
        return;
    }
    statusEl.textContent = message || '';
    statusEl.classList.remove('is-info', 'is-success', 'is-error');
    if (statusType) {
        statusEl.classList.add(`is-${statusType}`);
    }
}

function updateModalBodyState() {
    const anyOpen = [agentFailureModal, agentApplySummaryModal]
        .filter(Boolean)
        .some(modal => modal.classList.contains('is-visible'));
    document.body.classList.toggle('is-modal-open', anyOpen);
}

function closeAgentFailureModal() {
    if (!agentFailureModal) {
        return;
    }
    agentFailureModal.classList.remove('is-visible');
    agentFailureModal.setAttribute('aria-hidden', 'true');
    updateModalBodyState();
}

function showAgentFailureModal(failures, options = {}) {
    if (!agentFailureModal) {
        return;
    }

    const failureCount = failures.length;
    const title = options.title || 'Agent apply failures';
    const scopeLabel = options.scopeLabel || 'applications';
    const summary = `Failed to apply Spring Config Agent to ${failureCount} ${scopeLabel}.`;

    if (agentFailureTitle) {
        agentFailureTitle.textContent = title;
    }
    if (agentFailureSummary) {
        agentFailureSummary.textContent = summary;
    }
    if (agentFailureList) {
        agentFailureList.innerHTML = failures.map(failure => {
            const namespace = escapeHtml(failure.namespace || 'unknown-namespace');
            const workloadName = escapeHtml(failure.workloadName || 'unknown-app');
            const workloadKind = escapeHtml(failure.workloadKind || 'workload');
            const reason = escapeHtml(failure.errorMessage || 'Failed to apply Spring Config Agent.');
            return `
                <div class="modal-list-item">
                    <div class="modal-list-title">${namespace}/${workloadName}</div>
                    <div class="modal-list-meta">${workloadKind}</div>
                    <div class="modal-list-reason">${reason}</div>
                </div>
            `;
        }).join('');
    }

    agentFailureModal.classList.add('is-visible');
    agentFailureModal.setAttribute('aria-hidden', 'false');
    updateModalBodyState();
}

function closeAgentApplySummaryModal() {
    if (!agentApplySummaryModal) {
        return;
    }
    agentApplySummaryModal.classList.remove('is-visible');
    agentApplySummaryModal.setAttribute('aria-hidden', 'true');
    updateModalBodyState();
}

function showAgentApplySummaryModal(data) {
    if (!agentApplySummaryModal) {
        return;
    }

    closeAgentFailureModal();

    const successes = Array.isArray(data?.successes) ? data.successes : [];
    const failures = Array.isArray(data?.failures) ? data.failures : [];
    const scopeLabel = data?.scopeLabel || 'applications';
    const totalCount = successes.length + failures.length;

    if (agentApplySummaryTitle) {
        agentApplySummaryTitle.textContent = data?.title || 'Agent apply summary';
    }

    if (agentApplySummaryMeta) {
        agentApplySummaryMeta.innerHTML = `
            <div class="modal-summary-grid">
                <div class="modal-stat">
                    <div class="modal-stat-label">Total ${escapeHtml(scopeLabel)}</div>
                    <div class="modal-stat-value">${totalCount}</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-label">Applied</div>
                    <div class="modal-stat-value">${successes.length}</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-label">Failed</div>
                    <div class="modal-stat-value">${failures.length}</div>
                </div>
            </div>
        `;
    }

    if (agentApplySummarySuccess) {
        if (successes.length) {
            agentApplySummarySuccess.innerHTML = successes.map(entry => {
                const namespace = escapeHtml(entry.namespace || 'unknown-namespace');
                const workloadName = escapeHtml(entry.workloadName || 'unknown-app');
                const workloadKind = escapeHtml(entry.workloadKind || 'workload');
                return `
                    <div class="modal-list-item">
                        <div class="modal-list-title">${namespace}/${workloadName}</div>
                        <div class="modal-list-meta">${workloadKind}</div>
                    </div>
                `;
            }).join('');
        } else {
            agentApplySummarySuccess.innerHTML = '<div class="modal-muted">No applications were updated.</div>';
        }
    }

    if (agentApplySummaryFailures) {
        if (failures.length) {
            agentApplySummaryFailures.innerHTML = failures.map(entry => {
                const namespace = escapeHtml(entry.namespace || 'unknown-namespace');
                const workloadName = escapeHtml(entry.workloadName || 'unknown-app');
                const workloadKind = escapeHtml(entry.workloadKind || 'workload');
                const reason = escapeHtml(entry.errorMessage || 'Failed to apply Spring Config Agent.');
                return `
                    <div class="modal-list-item">
                        <div class="modal-list-title">${namespace}/${workloadName}</div>
                        <div class="modal-list-meta">${workloadKind}</div>
                        <div class="modal-list-reason">${reason}</div>
                    </div>
                `;
            }).join('');
        } else {
            agentApplySummaryFailures.innerHTML = '<div class="modal-muted">No failures.</div>';
        }
    }

    agentApplySummaryModal.classList.add('is-visible');
    agentApplySummaryModal.setAttribute('aria-hidden', 'false');
    updateModalBodyState();
}

function extractWorkloadTotal(reportData) {
    if (!reportData) {
        return null;
    }
    const candidates = [
        'totalWorkloads',
        'workloadCount',
        'total',
        'scannedWorkloads',
        'workloadsScanned',
        'workloadTotal',
    ];
    for (const key of candidates) {
        const value = Number(reportData[key]);
        if (Number.isFinite(value)) {
            return value;
        }
    }
    if (Array.isArray(reportData.workloads)) {
        return reportData.workloads.length;
    }
    if (Array.isArray(reportData.apps)) {
        return reportData.apps.length;
    }
    return null;
}

function buildReportSummaryData() {
    if (!reportResultsState) {
        return null;
    }
    const reports = reportResultsState.mode === 'single'
        ? [{ namespace: reportResultsState.data?.namespace || currentNamespace, data: reportResultsState.data || {} }]
        : (reportResultsState.reports || []);

    if (!reports.length) {
        return null;
    }

    const matchedWorkloads = new Set();
    const errorWorkloads = new Set();
    const valueCounts = new Map();
    let totalWorkloads = 0;
    let totalKnown = true;

    reports.forEach(report => {
        const namespace = report.namespace || '';
        const data = report.data || {};
        (data.matched || []).forEach(workload => {
            const workloadName = workload.workloadName || '';
            const workloadKind = workload.workloadKind || '';
            if (workloadName) {
                matchedWorkloads.add(`${namespace}||${workloadName}||${workloadKind}`);
            }
            (workload.matches || []).forEach(match => {
                const value = match.value || '';
                if (!value) {
                    return;
                }
                valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
            });
        });

        (data.errors || []).forEach(error => {
            if (!error || !error.workloadName || error.workloadKind === 'namespace') {
                return;
            }
            const workloadKind = error.workloadKind || '';
            errorWorkloads.add(`${namespace}||${error.workloadName}||${workloadKind}`);
        });

        const reportTotal = extractWorkloadTotal(data);
        if (Number.isFinite(reportTotal)) {
            totalWorkloads += reportTotal;
        } else {
            totalKnown = false;
        }
    });

    const topValues = Array.from(valueCounts.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
        .slice(0, 10);

    const matchedCount = matchedWorkloads.size;
    const errorCount = errorWorkloads.size;
    const notMatchedCount = totalKnown
        ? Math.max(0, totalWorkloads - matchedCount - errorCount)
        : null;

    return {
        namespaceCount: reports.length,
        matchedCount,
        errorCount,
        notMatchedCount,
        totalWorkloads: totalKnown ? totalWorkloads : null,
        totalKnown,
        topValues,
    };
}

function openReportSummaryTab() {
    if (!reportResultsState) {
        setReportStatus('Run a report before opening the summary.', 'error');
        return;
    }

    const summary = buildReportSummaryData();
    if (!summary) {
        setReportStatus('No report data available.', 'error');
        return;
    }

    const pattern = reportPattern.value.trim() || 'n/a';
    const scopeLabel = reportScope.value || 'value';
    const caseLabel = reportCase.checked ? 'insensitive' : 'sensitive';
    const metaText = `Pattern: ${pattern} | Scope: ${scopeLabel} | Case: ${caseLabel} | Namespaces: ${summary.namespaceCount}`;

    const matchedText = String(summary.matchedCount);
    const errorText = String(summary.errorCount);
    const totalText = summary.totalKnown ? String(summary.totalWorkloads) : 'n/a';
    const notMatchedText = summary.totalKnown ? String(summary.notMatchedCount) : 'n/a';

    const topValuesHtml = summary.topValues.length
        ? summary.topValues.map(item => `
            <div class="list-item">
                <div class="list-title">${escapeHtml(item.value)}</div>
                <div class="list-meta">${item.count} match${item.count === 1 ? '' : 'es'}</div>
            </div>
        `).join('')
        : '<div class="muted">No values matched in this report.</div>';

    const note = summary.totalKnown
        ? ''
        : '<div class="muted">Total workload count is not available from the API, so "Not matched" is shown as n/a.</div>';

    const docHtml = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Report Summary</title>
            <style>
                :root {
                    color-scheme: light;
                    --bg: #f8fafc;
                    --panel: #ffffff;
                    --ink: #0f172a;
                    --muted: #64748b;
                    --border: #e2e8f0;
                    --shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
                }
                * { box-sizing: border-box; }
                body {
                    margin: 0;
                    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
                    background: var(--bg);
                    color: var(--ink);
                }
                main {
                    max-width: 980px;
                    margin: 32px auto;
                    padding: 0 20px 40px;
                }
                header {
                    background: var(--panel);
                    border: 1px solid var(--border);
                    border-radius: 18px;
                    padding: 22px 26px;
                    box-shadow: var(--shadow);
                }
                h1 { margin: 0 0 8px; font-size: 1.6rem; }
                .meta { color: var(--muted); font-size: 0.95rem; }
                .grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 16px;
                    margin-top: 18px;
                }
                .stat {
                    background: var(--panel);
                    border: 1px solid var(--border);
                    border-radius: 16px;
                    padding: 16px;
                    box-shadow: var(--shadow);
                }
                .stat-label {
                    font-size: 0.72rem;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: var(--muted);
                }
                .stat-value {
                    margin-top: 8px;
                    font-size: 1.6rem;
                    font-weight: 600;
                }
                section {
                    margin-top: 24px;
                    background: var(--panel);
                    border: 1px solid var(--border);
                    border-radius: 18px;
                    padding: 20px 22px;
                    box-shadow: var(--shadow);
                }
                h2 { margin: 0 0 12px; font-size: 1.1rem; }
                .muted { color: var(--muted); font-size: 0.95rem; }
                .list-item {
                    border: 1px solid var(--border);
                    border-radius: 12px;
                    padding: 10px 12px;
                    margin-bottom: 10px;
                    background: #f8fafc;
                }
                .list-title { font-weight: 600; }
                .list-meta { font-size: 0.85rem; color: var(--muted); }
            </style>
        </head>
        <body>
            <main>
                <header>
                    <h1>Report Summary</h1>
                    <div class="meta">${escapeHtml(metaText)}</div>
                </header>
                <div class="grid">
                    <div class="stat">
                        <div class="stat-label">Matched workloads</div>
                        <div class="stat-value">${matchedText}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Not matched workloads</div>
                        <div class="stat-value">${notMatchedText}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Skipped workloads</div>
                        <div class="stat-value">${errorText}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Total workloads</div>
                        <div class="stat-value">${totalText}</div>
                    </div>
                </div>
                <section>
                    ${note}
                    <h2>Top 10 values (by match count)</h2>
                    ${topValuesHtml}
                </section>
            </main>
        </body>
        </html>
    `;

    const blob = new Blob([docHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const newTab = window.open(url, '_blank');
    if (!newTab) {
        setReportStatus('Popup blocked. Allow popups to open the summary tab.', 'error');
        URL.revokeObjectURL(url);
        return;
    }
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 60000);
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

