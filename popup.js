const toggleBtn = document.getElementById('toggle-btn');
const statusBadge = document.getElementById('status-badge');
const intervalSelect = document.getElementById('interval-select');
const customUrlContainer = document.getElementById('custom-url-container');
const customUrlInput = document.getElementById('custom-url-input');
const saveUrlBtn = document.getElementById('save-url-btn');
const logConsole = document.getElementById('log-console');
const statSent = document.getElementById('stat-sent');
const statDrops = document.getElementById('stat-drops');
const lastPingTime = document.getElementById('last-ping-time');
const resetStatsBtn = document.getElementById('reset-stats-btn');
const canvas = document.getElementById('ping-chart');
const ctx = canvas ? canvas.getContext('2d') : null;

const networkDropdownHeader = document.querySelector('.custom-select-header');
const networkList = document.getElementById('network-list');
const selectedNetworkLogo = document.getElementById('selected-network-logo');
const selectedNetworkName = document.getElementById('selected-network-name');

let isRunning = false;
let customUrl = '';
let networkData = {};
let currentNetworkValue = 'https://www.google.com';
let currentLogs = [];
let idleIntervalId = null;
let isAnimating = false;

// Load logo data first, then state
async function init() {
    try {
        const response = await fetch(chrome.runtime.getURL('Icons/logo.json'));
        networkData = await response.json();
    } catch (e) {
        console.error("Failed to load logo.json", e);
    }

    renderDropdown();

    chrome.storage.local.get(['isRunning', 'pingInterval', 'targetUrl', 'logs', 'customUrl', 'sentCount', 'dropCount'], (result) => {
        isRunning = result.isRunning || false;
        updateUI();

        if (result.sentCount !== undefined) statSent.textContent = result.sentCount;
        if (result.dropCount !== undefined) statDrops.textContent = result.dropCount;

        if (result.pingInterval) intervalSelect.value = result.pingInterval;
        
        if (result.targetUrl) {
            if (networkData[result.targetUrl]) {
                currentNetworkValue = result.targetUrl;
            } else if (result.targetUrl !== 'custom') {
                currentNetworkValue = 'custom';
                customUrlInput.value = result.targetUrl;
                customUrlContainer.classList.remove('hidden');
            } else {
                currentNetworkValue = 'custom';
                customUrlContainer.classList.remove('hidden');
            }
        }

        if (result.customUrl) {
            customUrl = result.customUrl;
            if (currentNetworkValue === 'custom') {
                customUrlInput.value = customUrl;
            }
        }

        setNetworkSelection(currentNetworkValue);

        if (result.logs) {
            currentLogs = result.logs;
        }

        if (currentLogs && currentLogs.length > 0) {
            const realLogs = currentLogs.filter(l => !l.isIdle);
            if (realLogs.length > 0) lastPingTime.textContent = `Last Ping: ${realLogs[0].time}`;
            renderLogs(currentLogs);
        }
        
        manageIdlePing();
    });
}

function manageIdlePing() {
    if (!isRunning) {
        if (!idleIntervalId) {
            doIdlePing();
            idleIntervalId = setInterval(doIdlePing, 3000);
        }
    } else {
        if (idleIntervalId) {
            clearInterval(idleIntervalId);
            idleIntervalId = null;
        }
    }
}

async function doIdlePing() {
    if (isRunning) return;
    
    const startTime = Date.now();
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });
    let latency = 0;
    let mbps = 0;
    let success = false;
    
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        let target = currentNetworkValue;
        if (target === 'custom') target = customUrlInput.value || 'https://www.google.com';

        const response = await fetch(target, { method: 'GET', signal: controller.signal });
        const blob = await response.blob();
        clearTimeout(timeoutId);
        
        latency = Date.now() - startTime;
        if (latency > 0) {
            mbps = ((blob.size * 8) / 1000000) / (latency / 1000);
        }
        success = true;
    } catch(e) {
        success = false;
        latency = 0;
        mbps = 0;
    }
    
    const logEntry = {
        time: timeStr,
        success: success,
        latency: latency,
        mbps: parseFloat(mbps.toFixed(2)),
        isIdle: true,
        timestamp: Date.now()
    };
    
    currentLogs.unshift(logEntry);
    if (currentLogs.length > 50) currentLogs.pop();
    
    drawChart(currentLogs);
}

function renderDropdown() {
    networkList.innerHTML = '';
    for (const [value, data] of Object.entries(networkData)) {
        const item = document.createElement('div');
        item.className = 'custom-select-item';
        item.dataset.value = value;
        
        let logoHtml = '';
        if (data.logo) {
            logoHtml = `<img src="${data.logo}" class="network-logo-small">`;
        } else {
            logoHtml = `<div class="network-logo-placeholder"></div>`;
        }
        
        item.innerHTML = `${logoHtml}<span>${data.name}</span>`;
        
        item.addEventListener('click', () => {
            setNetworkSelection(value);
            networkList.classList.add('hidden');
            
            if (value === 'custom') {
                customUrlContainer.classList.remove('hidden');
            } else {
                customUrlContainer.classList.add('hidden');
                updateSettings();
            }
        });
        
        networkList.appendChild(item);
    }
}

function setNetworkSelection(value) {
    currentNetworkValue = value;
    const data = networkData[value];
    if (data) {
        selectedNetworkName.textContent = data.name;
        if (data.logo) {
            selectedNetworkLogo.src = data.logo;
            selectedNetworkLogo.classList.remove('hidden');
        } else {
            selectedNetworkLogo.classList.add('hidden');
            selectedNetworkLogo.src = '';
        }
    } else {
        selectedNetworkName.textContent = 'Custom URL';
        selectedNetworkLogo.classList.add('hidden');
    }
}

networkDropdownHeader.addEventListener('click', () => {
    networkList.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
    if (!document.getElementById('network-dropdown').contains(e.target)) {
        networkList.classList.add('hidden');
    }
});

toggleBtn.addEventListener('click', () => {
    if (isAnimating) return;

    if (!isRunning) {
        isAnimating = true;
        const gif = document.getElementById('power-gif');
        
        // Force GIF to reload from frame 0
        gif.src = 'Icons/henagahana.gif?' + new Date().getTime();
        gif.classList.remove('hidden');

        setTimeout(() => {
            gif.classList.add('hidden');
            isAnimating = false;
            
            isRunning = true;
            updateUI();
            chrome.runtime.sendMessage({ type: 'TOGGLE_PINGER', value: isRunning });
            manageIdlePing();
            drawChart(currentLogs);
        }, 1600); // Wait 1.6s for lightning animation
    } else {
        isRunning = false;
        updateUI();
        chrome.runtime.sendMessage({ type: 'TOGGLE_PINGER', value: isRunning });
        manageIdlePing();
        drawChart(currentLogs);
    }
});

saveUrlBtn.addEventListener('click', () => {
    customUrl = customUrlInput.value;
    chrome.storage.local.set({ customUrl });
    updateSettings();
});

intervalSelect.addEventListener('change', () => {
    updateSettings();
});

resetStatsBtn.addEventListener('click', () => {
    if (confirm('Reset all stats and logs?')) {
        chrome.runtime.sendMessage({ type: 'RESET_ALL' });
        statSent.textContent = '0';
        statDrops.textContent = '0';
        lastPingTime.textContent = 'Last Ping: --:--:--';
        currentLogs = currentLogs.filter(l => l.isIdle);
        renderLogs(currentLogs);
    }
});

function updateUI() {
    if (isRunning) {
        toggleBtn.classList.add('active');
        statusBadge.textContent = 'STATUS: PINGING';
        statusBadge.className = 'status-pinging';
    } else {
        toggleBtn.classList.remove('active');
        statusBadge.textContent = 'STATUS: DISCONNECTED';
        statusBadge.className = 'status-disconnected';
    }
}

function updateSettings() {
    let target = currentNetworkValue;
    if (target === 'custom') {
        target = customUrlInput.value || 'https://www.google.com';
    }

    chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        targetUrl: target,
        pingInterval: parseInt(intervalSelect.value)
    });
}

function renderLogs(logs) {
    currentLogs = logs || [];
    drawChart(logs);
    
    logConsole.innerHTML = '';
    let hasRealLogs = false;

    logs.forEach(log => {
        if (log.isIdle) return;
        hasRealLogs = true;
        
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        
        const time = document.createElement('span');
        time.className = 'log-time';
        time.textContent = `[${log.time}] `;
        
        const msg = document.createElement('span');
        msg.className = log.success ? 'log-msg-success' : 'log-msg-error';
        
        let displayMessage = log.message;
        if (log.message && log.message.includes('Success: ')) {
            const url = log.message.split('Success: ')[1].split(' (')[0];
            displayMessage = 'Ping Success: ' + getFriendlyName(url);
        } else if (log.message && log.message.includes('Failed: ')) {
             displayMessage = 'Ping Failed';
        }

        msg.textContent = displayMessage;

        entry.appendChild(time);
        entry.appendChild(msg);
        logConsole.appendChild(entry);
    });
    
    if (!hasRealLogs) {
        logConsole.innerHTML = '<div class="empty-logs">No logs yet...</div>';
    }
}

function getFriendlyName(url) {
    for (const [key, val] of Object.entries(networkData)) {
        if (url.includes(key.replace('https://', '').replace('http://', ''))) {
            return val.name;
        }
    }
    return url.length > 20 ? url.substring(0, 17) + '...' : url;
}

function drawChart(logs) {
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!logs || logs.length === 0) return;
    
    const plotLogs = [...logs].reverse();
    
    let maxMbps = 0.001; 
    plotLogs.forEach(log => {
        if (log.success && log.mbps !== undefined && log.mbps > maxMbps) {
            maxMbps = log.mbps;
        }
    });
    maxMbps = maxMbps * 1.1; // Add 10% headroom

    const width = canvas.width;
    const height = canvas.height;
    const padding = 15;
    const plotHeight = height - (padding * 2);
    const stepX = width / Math.max(plotLogs.length - 1, 1);

    ctx.beginPath();
    ctx.lineWidth = 2;
    
    const lineColor = isRunning ? '#00ff66' : '#00E5FF';
    const fillTop = isRunning ? 'rgba(0, 255, 102, 0.4)' : 'rgba(0, 229, 255, 0.4)';
    const fillBottom = isRunning ? 'rgba(0, 255, 102, 0.0)' : 'rgba(0, 229, 255, 0.0)';

    ctx.strokeStyle = lineColor; 
    
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, fillTop);
    gradient.addColorStop(1, fillBottom);
    
    let firstPoint = true;
    
    for (let i = 0; i < plotLogs.length; i++) {
        const log = plotLogs[i];
        const x = i * stepX;
        let val = (log.success && log.mbps !== undefined) ? log.mbps : 0;
        const y = padding + plotHeight - (val / maxMbps) * plotHeight;
        
        if (firstPoint) {
            ctx.moveTo(x, y);
            firstPoint = false;
        } else {
            ctx.lineTo(x, y);
        }
    }
    
    ctx.stroke();
    
    if (plotLogs.length > 1) {
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.fillStyle = gradient;
        ctx.fill();
    }
    
    ctx.fillStyle = '#ffffff';
    ctx.font = "8px 'Fira Code', monospace";
    ctx.textAlign = "center";
    
    for (let i = 0; i < plotLogs.length; i++) {
        const log = plotLogs[i];
        if (log.success && log.mbps !== undefined) {
            const x = i * stepX;
            let val = log.mbps;
            const y = padding + plotHeight - (val / maxMbps) * plotHeight;
            
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Draw text slightly above the point
            if (plotLogs.length < 20 || i % 3 === 0 || i === plotLogs.length - 1) {
                 ctx.fillText(val.toFixed(2), x, y - 5);
            }
        }
    }
}

// Listen for live updates
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'LOG_UPDATE') {
        if (message.sentCount !== undefined) statSent.textContent = message.sentCount;
        if (message.dropCount !== undefined) statDrops.textContent = message.dropCount;
        if (message.log && message.log.time) lastPingTime.textContent = `Last Ping: ${message.log.time}`;
        
        chrome.storage.local.get(['logs'], (result) => {
            // Keep idle logs intact, append real logs
            const idleLogs = currentLogs.filter(l => l.isIdle);
            currentLogs = [...(result.logs || []), ...idleLogs];
            currentLogs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            if (currentLogs.length > 50) currentLogs.length = 50;
            
            renderLogs(currentLogs);
        });
    }
});

init();
