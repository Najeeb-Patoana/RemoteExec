const { ipcRenderer } = require('electron');

const startBtn = document.getElementById('startButton');
const stopBtn = document.getElementById('stopButton');
const portInput = document.getElementById('portInput');
const clientsTable = document.getElementById('clientsTable').getElementsByTagName('tbody')[0];
const commandInput = document.getElementById('commandInput');
const sendBtn = document.getElementById('sendCommand');
const outputArea = document.getElementById('outputArea');

let selectedClient = null;

// Server controls
startBtn.addEventListener('click', () => {
    const port = parseInt(portInput.value);
    if (isNaN(port) || port < 1 || port > 65535) {
        alert('Enter valid port 1-65535');
        return;
    }
    ipcRenderer.send('start-server', port);
    startBtn.disabled = true;
    stopBtn.disabled = false;
});

stopBtn.addEventListener('click', () => {
    ipcRenderer.send('stop-server');
    startBtn.disabled = false;
    stopBtn.disabled = true;
    clearTable();
});

// Run command
sendBtn.addEventListener('click', () => {
    if (!selectedClient) {
        alert('Select a client first');
        return;
    }
    const cmd = commandInput.value;
    if (!cmd) return;
    ipcRenderer.send('run-command', { hostname: selectedClient, command: cmd });
    outputArea.value += `> ${cmd}\n`;
    commandInput.value = '';
});

// Client connected
ipcRenderer.on('client-connected', (event, clientInfo) => {
    const row = clientsTable.insertRow();
    row.insertCell(0).textContent = clientInfo.hostname;
    row.insertCell(1).textContent = clientInfo.username;
    row.insertCell(2).textContent = clientInfo.os;

    row.addEventListener('click', () => {
        selectedClient = clientInfo.hostname;
        outputArea.value += `Selected client: ${selectedClient}\n`;
    });
});

// Client disconnected
ipcRenderer.on('client-disconnected', (event, hostname) => {
    for (let i = 0; i < clientsTable.rows.length; i++) {
        if (clientsTable.rows[i].cells[0].textContent === hostname) {
            clientsTable.deleteRow(i);
            break;
        }
    }
    if (selectedClient === hostname) {
        outputArea.value += `Client disconnected: ${hostname}\n`;
        selectedClient = null;
    }
});

// Command output
ipcRenderer.on('command-output', (event, data) => {
    outputArea.value += data.output + '\n';
});

// Errors
ipcRenderer.on('server-error', (event, msg) => {
    alert('Server error: ' + msg);
    startBtn.disabled = false;
    stopBtn.disabled = true;
});

function clearTable() {
    while (clientsTable.firstChild) clientsTable.removeChild(clientsTable.firstChild);
}
