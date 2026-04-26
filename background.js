let isRunning = false;
let pingInterval = 5;
let targetUrl = 'https://www.google.com';
let logs = [];
let sentCount = 0;
let dropCount = 0;


chrome.storage.local.get(['isRunning', 'pingInterval', 'targetUrl', 'logs', 'sentCount', 'dropCount'], (result) => {
    if (result.isRunning !== undefined) isRunning = result.isRunning;
    if (result.pingInterval) pingInterval = result.pingInterval;
    if (result.targetUrl) targetUrl = result.targetUrl;
    if (result.logs) logs = result.logs;
    if (result.sentCount) sentCount = result.sentCount;
    if (result.dropCount) dropCount = result.dropCount;

    if (isRunning) {
        startPinger();
    }
});

function startPinger() {
    chrome.alarms.create('pingerAlarm', { periodInMinutes: pingInterval / 60 });
}

function stopPinger() {
    chrome.alarms.clear('pingerAlarm');
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'pingerAlarm') {
        performPing();
    }
});

async function performPing() {
    const startTime = Date.now();
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false });
    let success = false;
    let message = '';

    let latency = 0;
    let mbps = 0;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

        const response = await fetch(targetUrl, {
            method: 'GET',
            signal: controller.signal
        });

        const blob = await response.blob();
        clearTimeout(timeoutId);
        latency = Date.now() - startTime;

        if (latency > 0) {
            mbps = ((blob.size * 8) / 1000000) / (latency / 1000);
        }

        success = true;
        sentCount++;
        message = `Ping Success: ${targetUrl} (${latency}ms, ${mbps.toFixed(2)} Mbps)`;
    } catch (error) {
        success = false;
        dropCount++;
        message = `Ping Failed: ${error.message || 'Unknown Error'}`;
        latency = 0;
        mbps = 0;
    }

    const logEntry = {
        time: timeStr,
        message: message,
        success: success,
        latency: latency,
        mbps: parseFloat(mbps.toFixed(2)),
        timestamp: Date.now()
    };

    logs.unshift(logEntry);
    if (logs.length > 50) logs.pop();

    chrome.storage.local.set({ logs, sentCount, dropCount });


    chrome.runtime.sendMessage({ type: 'LOG_UPDATE', log: logEntry, sentCount, dropCount }).catch(() => { });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_PINGER') {
        isRunning = message.value;
        chrome.storage.local.set({ isRunning });
        if (isRunning) {
            startPinger();
            performPing();

            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'Icons/icon128.png',
                title: 'CYBER PINGER ⚡',
                message: 'Connect Successful 🚀✅ !'
            });
        } else {
            stopPinger();

            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'Icons/icon128.png',
                title: 'CYBER PINGER ⚡',
                message: 'Disconnected 🤚🛑!'
            });
        }
        sendResponse({ status: 'ok' });
    } else if (message.type === 'UPDATE_SETTINGS') {
        targetUrl = message.targetUrl || targetUrl;
        pingInterval = message.pingInterval || pingInterval;

        chrome.storage.local.set({ targetUrl, pingInterval });

        if (isRunning) {
            stopPinger();
            startPinger();
        }
        sendResponse({ status: 'ok' });
    } else if (message.type === 'RESET_ALL') {
        logs = [];
        sentCount = 0;
        dropCount = 0;
        chrome.storage.local.set({ logs, sentCount, dropCount });
        sendResponse({ status: 'ok' });
    }
});
