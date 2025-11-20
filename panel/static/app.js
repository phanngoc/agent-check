const API_BASE = '/api';

let services = [];
let containers = [];
let logEventSources = {};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    loadServices();
    loadContainers();
    loadSystemMetrics();
    
    // Auto-refresh every 5 seconds
    setInterval(() => {
        loadServices();
        loadContainers();
        loadSystemMetrics();
    }, 5000);
    
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadServices();
        loadContainers();
        loadSystemMetrics();
    });
});

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

