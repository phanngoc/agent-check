const API_BASE = '/api';

let services = [];
let containers = [];
let logEventSources = {};
let currentServiceId = null;
let logEventSource = null;
let metricsInterval = null;
let combinedLogEventSource = null;
let combinedLogs = [];
let isCombinedLogsCollapsed = false;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupRouting();
    setupTabs();
    loadServices();
    loadContainers();
    loadSystemMetrics();
    loadCombinedLogs();
    startCombinedLogStreaming();
    
    // Auto-refresh every 5 seconds
    setInterval(() => {
        if (!currentServiceId) {
            loadServices();
            loadContainers();
            loadSystemMetrics();
        }
    }, 5000);
    
    document.getElementById('refreshBtn').addEventListener('click', () => {
        if (currentServiceId) {
            loadServiceDetail(currentServiceId);
        } else {
            loadServices();
            loadContainers();
            loadSystemMetrics();
        }
    });
});

// Hash-based routing
function setupRouting() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}

function handleRoute() {
    const hash = window.location.hash;
    if (hash.startsWith('#/services/')) {
        const serviceId = hash.replace('#/services/', '');
        navigateToServiceDetail(serviceId);
    } else {
        navigateToHome();
    }
}

function navigateToServiceDetail(serviceId) {
    currentServiceId = serviceId;
    window.location.hash = `#/services/${serviceId}`;
    
    // Hide main content, show detail page
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab.id === 'serviceDetailPage') {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    loadServiceDetail(serviceId);
}

function navigateToHome() {
    currentServiceId = null;
    window.location.hash = '';
    
    // Stop metrics interval if running
    if (metricsInterval) {
        clearInterval(metricsInterval);
        metricsInterval = null;
    }
    
    // Close log stream if open
    if (logEventSource) {
        logEventSource.close();
        logEventSource = null;
    }
    
    // Show main content, hide detail page
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab.id === 'serviceDetailPage') {
            tab.classList.remove('active');
        } else {
            // Restore previous tab state
            if (tab.id === 'servicesTab') {
                tab.classList.add('active');
            }
        }
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === 'services') {
            btn.classList.add('active');
        }
    });
    
    loadServices();
    loadContainers();
    loadSystemMetrics();
    
    // Reload combined logs if not collapsed
    if (!isCombinedLogsCollapsed) {
        loadCombinedLogs();
    }
}

// Tab switching
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`${tab}Tab`).classList.add('active');
        });
    });
}

// Load Services
async function loadServices() {
    try {
        const response = await fetch(`${API_BASE}/services`);
        services = await response.json();
        renderServices();
    } catch (error) {
        console.error('Failed to load services:', error);
    }
}

function renderServices() {
    const grid = document.getElementById('servicesGrid');
    
    if (services.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <p>No services detected</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = services.map(service => `
        <div class="service-card">
            <div class="card-header">
                <div class="card-title">${service.name}</div>
                <span class="status-badge status-${service.status}">${service.status}</span>
            </div>
            <div class="card-info">
                <div class="info-row">
                    <span class="info-label">Type:</span>
                    <span class="info-value">${service.service_type}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Port:</span>
                    <span class="info-value">${service.port || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Restarts:</span>
                    <span class="info-value">${service.restart_count}</span>
                </div>
            </div>
            <div class="metrics-row" id="metrics-${service.id}">
                <div class="metric-box">
                    <div class="metric-box-label">CPU</div>
                    <div class="metric-box-value">-</div>
                </div>
                <div class="metric-box">
                    <div class="metric-box-label">Memory</div>
                    <div class="metric-box-value">-</div>
                </div>
                <div class="metric-box">
                    <div class="metric-box-label">Uptime</div>
                    <div class="metric-box-value">-</div>
                </div>
            </div>
            <div class="card-actions">
                ${service.status === 'running' 
                    ? `<button class="btn btn-danger" onclick="stopService('${service.id}')">Stop</button>
                       <button class="btn btn-warning" onclick="restartService('${service.id}')">Restart</button>`
                    : `<button class="btn btn-primary" onclick="startService('${service.id}')">Start</button>`
                }
                <button class="btn btn-secondary" onclick="viewLogs('${service.id}', '${service.name}')">Logs</button>
                <button class="btn btn-secondary" onclick="navigateToServiceDetail('${service.id}')">View Details</button>
            </div>
        </div>
    `).join('');
    
    // Load metrics for each service
    services.forEach(service => {
        if (service.status === 'running') {
            loadServiceMetrics(service.id);
        }
    });
}

// Service Actions
async function startService(id) {
    try {
        const response = await fetch(`${API_BASE}/services/${id}/start`, { method: 'POST' });
        if (response.ok) {
            setTimeout(loadServices, 1000);
        } else {
            alert('Failed to start service');
        }
    } catch (error) {
        console.error('Error starting service:', error);
        alert('Error starting service');
    }
}

async function stopService(id) {
    try {
        const response = await fetch(`${API_BASE}/services/${id}/stop`, { method: 'POST' });
        if (response.ok) {
            setTimeout(loadServices, 1000);
        } else {
            alert('Failed to stop service');
        }
    } catch (error) {
        console.error('Error stopping service:', error);
        alert('Error stopping service');
    }
}

async function restartService(id) {
    try {
        const response = await fetch(`${API_BASE}/services/${id}/restart`, { method: 'POST' });
        if (response.ok) {
            setTimeout(loadServices, 1000);
        } else {
            alert('Failed to restart service');
        }
    } catch (error) {
        console.error('Error restarting service:', error);
        alert('Error restarting service');
    }
}

async function loadServiceMetrics(id) {
    try {
        const response = await fetch(`${API_BASE}/services/${id}/metrics`);
        const metrics = await response.json();
        
        const metricsEl = document.getElementById(`metrics-${id}`);
        if (metricsEl) {
            metricsEl.innerHTML = `
                <div class="metric-box">
                    <div class="metric-box-label">CPU</div>
                    <div class="metric-box-value">${metrics.cpu_usage.toFixed(1)}%</div>
                </div>
                <div class="metric-box">
                    <div class="metric-box-label">Memory</div>
                    <div class="metric-box-value">${formatBytes(metrics.memory_usage)}</div>
                </div>
                <div class="metric-box">
                    <div class="metric-box-label">Uptime</div>
                    <div class="metric-box-value">${formatUptime(metrics.uptime)}</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load metrics:', error);
    }
}

// Load Containers
async function loadContainers() {
    try {
        const response = await fetch(`${API_BASE}/containers`);
        containers = await response.json();
        renderContainers();
    } catch (error) {
        console.error('Failed to load containers:', error);
    }
}

function renderContainers() {
    const grid = document.getElementById('containersGrid');
    
    if (containers.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🐳</div>
                <p>No containers found</p>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = containers.map(container => {
        const isRunning = container.status.toLowerCase().includes('up') || 
                         container.status.toLowerCase().includes('running');
        
        return `
            <div class="container-card">
                <div class="card-header">
                    <div class="card-title">${container.name}</div>
                    <span class="status-badge ${isRunning ? 'status-running' : 'status-stopped'}">
                        ${isRunning ? 'Running' : 'Stopped'}
                    </span>
                </div>
                <div class="card-info">
                    <div class="info-row">
                        <span class="info-label">Image:</span>
                        <span class="info-value">${container.image}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Ports:</span>
                        <span class="info-value">${container.ports.join(', ') || 'N/A'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">CPU:</span>
                        <span class="info-value">${container.cpu_usage.toFixed(1)}%</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Memory:</span>
                        <span class="info-value">${formatBytes(container.memory_usage)}</span>
                    </div>
                </div>
                <div class="card-actions">
                    ${isRunning 
                        ? `<button class="btn btn-danger" onclick="stopContainer('${container.id}')">Stop</button>
                           <button class="btn btn-warning" onclick="restartContainer('${container.id}')">Restart</button>`
                        : `<button class="btn btn-primary" onclick="startContainer('${container.id}')">Start</button>`
                    }
                    <button class="btn btn-secondary" onclick="viewContainerLogs('${container.id}', '${container.name}')">Logs</button>
                </div>
            </div>
        `;
    }).join('');
}

// Container Actions
async function startContainer(id) {
    try {
        const response = await fetch(`${API_BASE}/containers/${id}/start`, { method: 'POST' });
        if (response.ok) {
            setTimeout(loadContainers, 1000);
        } else {
            alert('Failed to start container');
        }
    } catch (error) {
        console.error('Error starting container:', error);
        alert('Error starting container');
    }
}

async function stopContainer(id) {
    try {
        const response = await fetch(`${API_BASE}/containers/${id}/stop`, { method: 'POST' });
        if (response.ok) {
            setTimeout(loadContainers, 1000);
        } else {
            alert('Failed to stop container');
        }
    } catch (error) {
        console.error('Error stopping container:', error);
        alert('Error stopping container');
    }
}

async function restartContainer(id) {
    try {
        const response = await fetch(`${API_BASE}/containers/${id}/restart`, { method: 'POST' });
        if (response.ok) {
            setTimeout(loadContainers, 1000);
        } else {
            alert('Failed to restart container');
        }
    } catch (error) {
        console.error('Error restarting container:', error);
        alert('Error restarting container');
    }
}

// Logs
async function viewLogs(serviceId, serviceName) {
    const modal = document.getElementById('logModal');
    const title = document.getElementById('logModalTitle');
    const content = document.getElementById('logContent');
    
    title.textContent = `Logs: ${serviceName}`;
    content.textContent = 'Loading logs...';
    modal.classList.add('active');
    
    // Load initial logs
    try {
        const response = await fetch(`${API_BASE}/services/${serviceId}/logs?lines=100`);
        const logs = await response.json();
        content.innerHTML = logs.map(log => `<div class="log-line">${escapeHtml(log)}</div>`).join('');
        content.scrollTop = content.scrollHeight;
    } catch (error) {
        content.textContent = `Error loading logs: ${error.message}`;
    }
    
    // Stream new logs
    if (logEventSources[serviceId]) {
        logEventSources[serviceId].close();
    }
    
    const eventSource = new EventSource(`${API_BASE}/services/${serviceId}/logs/stream`);
    eventSource.onmessage = (event) => {
        try {
            const logEntry = JSON.parse(event.data);
            const logLine = document.createElement('div');
            logLine.className = `log-line ${logEntry.level}`;
            logLine.textContent = `[${new Date(logEntry.timestamp).toLocaleTimeString()}] ${logEntry.message}`;
            content.appendChild(logLine);
            content.scrollTop = content.scrollHeight;
        } catch (e) {
            console.error('Error parsing log entry:', e);
        }
    };
    
    logEventSources[serviceId] = eventSource;
}

async function viewContainerLogs(containerId, containerName) {
    const modal = document.getElementById('logModal');
    const title = document.getElementById('logModalTitle');
    const content = document.getElementById('logContent');
    
    title.textContent = `Logs: ${containerName}`;
    content.textContent = 'Loading logs...';
    modal.classList.add('active');
    
    try {
        const response = await fetch(`${API_BASE}/containers/${containerId}/logs?tail=100`);
        const logs = await response.json();
        content.innerHTML = logs.map(log => `<div class="log-line">${escapeHtml(log)}</div>`).join('');
        content.scrollTop = content.scrollHeight;
    } catch (error) {
        content.textContent = `Error loading logs: ${error.message}`;
    }
}

function closeLogModal() {
    const modal = document.getElementById('logModal');
    modal.classList.remove('active');
    
    // Close all event sources
    Object.values(logEventSources).forEach(es => es.close());
    logEventSources = {};
}

// System Metrics
async function loadSystemMetrics() {
    try {
        const response = await fetch(`${API_BASE}/system/metrics`);
        const metrics = await response.json();
        
        const metricsEl = document.getElementById('systemMetrics');
        metricsEl.innerHTML = `
            <div class="metric-item">
                <div class="metric-label">CPU</div>
                <div class="metric-value">${metrics.cpu_usage.toFixed(1)}%</div>
            </div>
            <div class="metric-item">
                <div class="metric-label">Memory</div>
                <div class="metric-value">${metrics.memory_usage_percent.toFixed(1)}%</div>
            </div>
            <div class="metric-item">
                <div class="metric-label">Processes</div>
                <div class="metric-value">${Math.round(metrics.process_count)}</div>
            </div>
        `;
    } catch (error) {
        console.error('Failed to load system metrics:', error);
    }
}

// Utility Functions
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatUptime(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modal on outside click
window.onclick = function(event) {
    const modal = document.getElementById('logModal');
    if (event.target === modal) {
        closeLogModal();
    }
}

// Service Detail Page Functions
async function loadServiceDetail(serviceId) {
    try {
        // Load service info
        const serviceResponse = await fetch(`${API_BASE}/services/${serviceId}`);
        if (!serviceResponse.ok) {
            throw new Error('Service not found');
        }
        const service = await serviceResponse.json();
        
        // Update title
        document.getElementById('serviceDetailTitle').textContent = service.name;
        
        // Render service info
        renderServiceInfo(service);
        
        // Load metrics
        loadServiceDetailMetrics(serviceId);
        
        // Start metrics interval
        if (metricsInterval) {
            clearInterval(metricsInterval);
        }
        metricsInterval = setInterval(() => {
            loadServiceDetailMetrics(serviceId);
        }, 5000);
        
        // Load initial logs
        await applyLogFilter();
        
        // Start log streaming
        startLogStreaming(serviceId);
        
    } catch (error) {
        console.error('Failed to load service detail:', error);
        alert('Failed to load service details: ' + error.message);
    }
}

function renderServiceInfo(service) {
    const grid = document.getElementById('serviceInfoGrid');
    const envVars = Object.entries(service.environment || {})
        .map(([k, v]) => `${k}=${v}`)
        .join(', ') || 'None';
    
    grid.innerHTML = `
        <div class="info-item">
            <div class="info-label">ID:</div>
            <div class="info-value">${service.id}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Name:</div>
            <div class="info-value">${service.name}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Type:</div>
            <div class="info-value">${service.service_type}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Status:</div>
            <div class="info-value"><span class="status-badge status-${service.status}">${service.status}</span></div>
        </div>
        <div class="info-item">
            <div class="info-label">Command:</div>
            <div class="info-value"><code>${escapeHtml(service.command)}</code></div>
        </div>
        <div class="info-item">
            <div class="info-label">Working Directory:</div>
            <div class="info-value"><code>${escapeHtml(service.working_dir)}</code></div>
        </div>
        <div class="info-item">
            <div class="info-label">Port:</div>
            <div class="info-value">${service.port || 'N/A'}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Auto Restart:</div>
            <div class="info-value">${service.auto_restart ? 'Yes' : 'No'}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Restart Count:</div>
            <div class="info-value">${service.restart_count}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Created At:</div>
            <div class="info-value">${new Date(service.created_at).toLocaleString()}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Updated At:</div>
            <div class="info-value">${new Date(service.updated_at).toLocaleString()}</div>
        </div>
        <div class="info-item info-item-full">
            <div class="info-label">Environment Variables:</div>
            <div class="info-value"><code>${escapeHtml(envVars)}</code></div>
        </div>
    `;
}

async function loadServiceDetailMetrics(serviceId) {
    try {
        const response = await fetch(`${API_BASE}/services/${serviceId}/metrics`);
        const metrics = await response.json();
        
        const metricsEl = document.getElementById('serviceDetailMetrics');
        if (metricsEl) {
            metricsEl.innerHTML = `
                <div class="metric-box">
                    <div class="metric-box-label">CPU</div>
                    <div class="metric-box-value">${metrics.cpu_usage.toFixed(1)}%</div>
                </div>
                <div class="metric-box">
                    <div class="metric-box-label">Memory</div>
                    <div class="metric-box-value">${formatBytes(metrics.memory_usage)}</div>
                </div>
                <div class="metric-box">
                    <div class="metric-box-label">Uptime</div>
                    <div class="metric-box-value">${formatUptime(metrics.uptime)}</div>
                </div>
                <div class="metric-box">
                    <div class="metric-box-label">PID</div>
                    <div class="metric-box-value">${metrics.pid || 'N/A'}</div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load metrics:', error);
    }
}

async function applyLogFilter() {
    if (!currentServiceId) return;
    
    const level = document.getElementById('filterLevel').value;
    const from = document.getElementById('filterFrom').value;
    const to = document.getElementById('filterTo').value;
    const search = document.getElementById('filterSearch').value;
    const operator = document.querySelector('input[name="filterOperator"]:checked').value;
    const limit = parseInt(document.getElementById('filterLimit').value) || 1000;
    
    // Build query params
    const params = new URLSearchParams();
    if (level && level !== 'all') params.append('level', level);
    if (from) {
        // Convert datetime-local to ISO string
        const fromDate = new Date(from);
        params.append('from', fromDate.toISOString());
    }
    if (to) {
        const toDate = new Date(to);
        params.append('to', toDate.toISOString());
    }
    if (search) params.append('search', search);
    params.append('operator', operator);
    params.append('limit', limit.toString());
    
    try {
        const response = await fetch(`${API_BASE}/services/${currentServiceId}/logs?${params.toString()}`);
        if (!response.ok) {
            throw new Error('Failed to fetch logs');
        }
        const data = await response.json();
        
        renderFilteredLogs(data.logs);
        
        // Update logs info
        const infoEl = document.getElementById('logsInfo');
        if (infoEl) {
            infoEl.textContent = `Showing ${data.filtered} of ${data.total} logs`;
        }
    } catch (error) {
        console.error('Failed to apply filter:', error);
        alert('Failed to apply filter: ' + error.message);
    }
}

function clearLogFilter() {
    document.getElementById('filterLevel').value = 'all';
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    document.getElementById('filterSearch').value = '';
    document.querySelector('input[name="filterOperator"][value="and"]').checked = true;
    document.getElementById('filterLimit').value = '1000';
    applyLogFilter();
}

function renderFilteredLogs(logs) {
    const logsEl = document.getElementById('serviceLogs');
    if (!logsEl) return;
    
    if (logs.length === 0) {
        logsEl.innerHTML = '<div class="empty-state">No logs found</div>';
        return;
    }
    
    logsEl.innerHTML = logs.map(log => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        return `<div class="log-line log-line-${log.level}">
            <span class="log-timestamp">[${timestamp}]</span>
            <span class="log-level">[${log.level.toUpperCase()}]</span>
            <span class="log-message">${escapeHtml(log.message)}</span>
        </div>`;
    }).join('');
    
    logsEl.scrollTop = logsEl.scrollHeight;
}

function startLogStreaming(serviceId) {
    // Close existing stream
    if (logEventSource) {
        logEventSource.close();
    }
    
    // Start new stream
    logEventSource = new EventSource(`${API_BASE}/services/${serviceId}/logs/stream`);
    logEventSource.onmessage = (event) => {
        try {
            const logEntry = JSON.parse(event.data);
            
            // Apply current filter to streamed logs
            const level = document.getElementById('filterLevel').value;
            const search = document.getElementById('filterSearch').value;
            
            let shouldShow = true;
            
            if (level && level !== 'all' && logEntry.level.toLowerCase() !== level.toLowerCase()) {
                shouldShow = false;
            }
            
            if (search && !logEntry.message.toLowerCase().includes(search.toLowerCase())) {
                shouldShow = false;
            }
            
            if (shouldShow) {
                const logsEl = document.getElementById('serviceLogs');
                if (logsEl) {
                    const timestamp = new Date(logEntry.timestamp).toLocaleString();
                    const logLine = document.createElement('div');
                    logLine.className = `log-line log-line-${logEntry.level}`;
                    logLine.innerHTML = `
                        <span class="log-timestamp">[${timestamp}]</span>
                        <span class="log-level">[${logEntry.level.toUpperCase()}]</span>
                        <span class="log-message">${escapeHtml(logEntry.message)}</span>
                    `;
                    logsEl.appendChild(logLine);
                    logsEl.scrollTop = logsEl.scrollHeight;
                }
            }
        } catch (e) {
            console.error('Error parsing log entry:', e);
        }
    };
}

// Combined Logs Functions
function getServiceName(serviceId) {
    const service = services.find(s => s.id === serviceId);
    return service ? service.name : serviceId;
}

async function loadCombinedLogs() {
    try {
        const level = document.getElementById('combinedLogsLevel').value;
        const search = document.getElementById('combinedLogsSearch').value;
        const params = new URLSearchParams();
        if (level && level !== 'all') params.append('level', level);
        if (search) params.append('search', search);
        params.append('lines', '100');
        
        const response = await fetch(`${API_BASE}/logs/combined?${params.toString()}`);
        if (!response.ok) {
            throw new Error('Failed to load combined logs');
        }
        const data = await response.json();
        combinedLogs = data.logs;
        renderCombinedLogs();
    } catch (error) {
        console.error('Failed to load combined logs:', error);
        const display = document.getElementById('combinedLogsDisplay');
        if (display) {
            display.textContent = `Error loading logs: ${error.message}`;
        }
    }
}

function renderCombinedLogs() {
    const display = document.getElementById('combinedLogsDisplay');
    if (!display) return;
    
    if (combinedLogs.length === 0) {
        display.innerHTML = '<div class="empty-state">No logs available</div>';
        return;
    }
    
    display.innerHTML = combinedLogs.map(log => {
        const timestamp = new Date(log.timestamp).toLocaleString();
        const serviceName = getServiceName(log.service_id);
        return `<div class="combined-log-line combined-log-line-${log.level}">
            <span class="combined-log-timestamp">[${timestamp}]</span>
            <span class="combined-log-service">${escapeHtml(serviceName)}</span>
            <span class="combined-log-level">[${log.level.toUpperCase()}]</span>
            <span class="combined-log-message">${escapeHtml(log.message)}</span>
        </div>`;
    }).join('');
    
    // Auto-scroll to bottom
    display.scrollTop = display.scrollHeight;
}

function startCombinedLogStreaming() {
    // Close existing stream
    if (combinedLogEventSource) {
        combinedLogEventSource.close();
    }
    
    // Start new stream
    combinedLogEventSource = new EventSource(`${API_BASE}/logs/combined/stream`);
    combinedLogEventSource.onmessage = (event) => {
        try {
            const logEntry = JSON.parse(event.data);
            
            // Apply current filter to streamed logs
            const level = document.getElementById('combinedLogsLevel').value;
            const search = document.getElementById('combinedLogsSearch').value;
            
            let shouldShow = true;
            
            if (level && level !== 'all' && logEntry.level.toLowerCase() !== level.toLowerCase()) {
                shouldShow = false;
            }
            
            if (search && !logEntry.message.toLowerCase().includes(search.toLowerCase())) {
                shouldShow = false;
            }
            
            if (shouldShow) {
                combinedLogs.push(logEntry);
                
                // Keep only last 1000 logs
                if (combinedLogs.length > 1000) {
                    combinedLogs.shift();
                }
                
                const display = document.getElementById('combinedLogsDisplay');
                if (display) {
                    const timestamp = new Date(logEntry.timestamp).toLocaleString();
                    const serviceName = getServiceName(logEntry.service_id);
                    const isAtBottom = display.scrollHeight - display.scrollTop <= display.clientHeight + 10;
                    
                    const logLine = document.createElement('div');
                    logLine.className = `combined-log-line combined-log-line-${logEntry.level}`;
                    logLine.innerHTML = `
                        <span class="combined-log-timestamp">[${timestamp}]</span>
                        <span class="combined-log-service">${escapeHtml(serviceName)}</span>
                        <span class="combined-log-level">[${logEntry.level.toUpperCase()}]</span>
                        <span class="combined-log-message">${escapeHtml(logEntry.message)}</span>
                    `;
                    display.appendChild(logLine);
                    
                    // Auto-scroll only if already at bottom
                    if (isAtBottom) {
                        display.scrollTop = display.scrollHeight;
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing combined log entry:', e);
        }
    };
    
    combinedLogEventSource.onerror = (error) => {
        console.error('Combined logs stream error:', error);
        // Reconnect after 3 seconds
        setTimeout(() => {
            if (!isCombinedLogsCollapsed) {
                startCombinedLogStreaming();
            }
        }, 3000);
    };
}

function applyCombinedLogFilter() {
    loadCombinedLogs();
    // Restart streaming to apply new filter
    if (!isCombinedLogsCollapsed) {
        startCombinedLogStreaming();
    }
}

function clearCombinedLogFilter() {
    document.getElementById('combinedLogsLevel').value = 'all';
    document.getElementById('combinedLogsSearch').value = '';
    applyCombinedLogFilter();
}

function toggleCombinedLogsArea() {
    const area = document.getElementById('combinedLogsArea');
    const icon = document.getElementById('toggleCombinedLogsIcon');
    const btn = document.getElementById('toggleCombinedLogsBtn');
    
    if (!area || !icon || !btn) return;
    
    isCombinedLogsCollapsed = !isCombinedLogsCollapsed;
    
    if (isCombinedLogsCollapsed) {
        area.classList.add('collapsed');
        icon.textContent = '▶';
        btn.innerHTML = '<span id="toggleCombinedLogsIcon">▶</span> Expand';
        // Stop streaming when collapsed
        if (combinedLogEventSource) {
            combinedLogEventSource.close();
            combinedLogEventSource = null;
        }
    } else {
        area.classList.remove('collapsed');
        icon.textContent = '▼';
        btn.innerHTML = '<span id="toggleCombinedLogsIcon">▼</span> Collapse';
        // Restart streaming when expanded
        loadCombinedLogs();
        startCombinedLogStreaming();
    }
}

