const { ipcRenderer } = require('electron');

class TerminalManager {
    constructor() {
        this.clients = new Map();
        this.selectedClient = null;
        this.commandHistory = [];
        this.historyIndex = -1;
        this.isServerRunning = false;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupIpcListeners();
    }

    initializeElements() {
        // Server controls
        this.startBtn = document.getElementById('startButton');
        this.stopBtn = document.getElementById('stopButton');
        this.portInput = document.getElementById('portInput');
        this.serverStatus = document.getElementById('serverStatus');
        
        // Client management
        this.clientsTable = document.getElementById('clientsTable').getElementsByTagName('tbody')[0];
        this.clientsCount = document.getElementById('clientsCount');
        
        // Terminal
        this.terminal = document.getElementById('terminal');
        this.commandInput = document.getElementById('commandInput');
        this.sendBtn = document.getElementById('sendCommand');
        this.clearBtn = document.getElementById('clearButton');
        this.downloadBtn = document.getElementById('downloadLogs');
        
        // Status
        this.selectedClientInfo = document.getElementById('selectedClient');
        
        // Initialize
        this.updateServerStatus('Stopped', 'error');
        this.updateClientsCount(0);
        this.addLog('Welcome to RemoteExec Remote Terminal Server', 'info');
    }

    setupEventListeners() {
        // Server controls
        this.startBtn.addEventListener('click', () => this.startServer());
        this.stopBtn.addEventListener('click', () => this.stopServer());
        
        // Terminal controls
        this.sendBtn.addEventListener('click', () => this.sendCommand());
        this.clearBtn.addEventListener('click', () => this.clearTerminal());
        this.downloadBtn.addEventListener('click', () => this.downloadLogs());
        
        // Command input
        this.commandInput.addEventListener('keydown', (e) => this.handleCommandInput(e));
        
        // Port input validation
        this.portInput.addEventListener('input', (e) => {
            const port = parseInt(e.target.value);
            if (port < 1 || port > 65535) {
                e.target.classList.add('error');
            } else {
                e.target.classList.remove('error');
            }
        });
        
        // Auto-scroll terminal
        this.setupAutoScroll();
    }

    setupAutoScroll() {
        const observer = new MutationObserver(() => {
            this.terminal.scrollTop = this.terminal.scrollHeight;
        });
        
        observer.observe(this.terminal, {
            childList: true,
            subtree: true
        });
    }

    setupIpcListeners() {
        // Server events
        ipcRenderer.on('server-started', (event, data) => {
            this.updateServerStatus(`Running on port ${data.port}`, 'success');
            this.isServerRunning = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            this.addLog(`Server started on port ${data.port}`, 'success');
        });

        ipcRenderer.on('server-stopped', () => {
            this.updateServerStatus('Stopped', 'error');
            this.isServerRunning = false;
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.addLog('Server stopped', 'warning');
            
            // Clear clients
            this.clients.clear();
            this.selectedClient = null;
            this.updateClientsTable();
            this.updateClientsCount(0);
            this.updateSelectedClientInfo();
            this.updateCommandInputState();
        });

        ipcRenderer.on('server-error', (event, error) => {
            this.updateServerStatus(`Error: ${error}`, 'error');
            this.addLog(`Server error: ${error}`, 'error');
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            this.isServerRunning = false;
        });

        // Client events
        ipcRenderer.on('client-connected', (event, clientInfo) => {
            console.log('Client connected:', clientInfo);
            this.clients.set(clientInfo.id, clientInfo);
            this.updateClientsTable();
            this.updateClientsCount(this.clients.size);
            
            this.addLog(`Client connected: ${clientInfo.hostname} (${clientInfo.username}@${clientInfo.os})`, 'success');
            
            // Auto-select first client if none selected
            if (!this.selectedClient) {
                this.selectClient(clientInfo.id);
            }
        });

        ipcRenderer.on('client-disconnected', (event, clientInfo) => {
            console.log('Client disconnected:', clientInfo);
            this.clients.delete(clientInfo.id);
            this.updateClientsTable();
            this.updateClientsCount(this.clients.size);
            
            if (this.selectedClient === clientInfo.id) {
                // Select another client if available
                const remainingClients = Array.from(this.clients.keys());
                this.selectedClient = remainingClients.length > 0 ? remainingClients[0] : null;
                this.updateSelectedClientInfo();
                this.updateCommandInputState();
            }
            
            this.addLog(`Client disconnected: ${clientInfo.hostname}`, 'warning');
        });

        ipcRenderer.on('shell-output', (event, data) => {
            if (data.clientId === this.selectedClient) {
                this.addTerminalOutput(data.output);
            }
        });

        ipcRenderer.on('command-sent', (event, data) => {
            if (data.clientId === this.selectedClient) {
                this.addTerminalInput(data.command);
            }
        });

        ipcRenderer.on('client-error', (event, data) => {
            this.addLog(`Client error (${data.clientId}): ${data.error}`, 'error');
        });
    }

    startServer() {
        const port = parseInt(this.portInput.value);

        if (!port || port < 1 || port > 65535) {
            this.addLog('Invalid port number (1-65535)', 'error');
            return;
        }

        this.addLog(`Starting server on port ${port}...`, 'info');
        ipcRenderer.send('start-server', { port });
    }

    stopServer() {
        this.addLog('Stopping server...', 'info');
        ipcRenderer.send('stop-server');
    }

    sendCommand() {
        if (!this.selectedClient) {
            this.addLog('No client selected', 'warning');
            return;
        }

        const command = this.commandInput.value.trim();
        if (!command) return;

        // Add to history
        if (this.commandHistory[this.commandHistory.length - 1] !== command) {
            this.commandHistory.push(command);
            if (this.commandHistory.length > 100) {
                this.commandHistory.shift();
            }
        }
        this.historyIndex = -1;

        // Send command
        ipcRenderer.send('send-command', {
            clientId: this.selectedClient,
            command: command
        });

        this.commandInput.value = '';
    }

    handleCommandInput(e) {
        switch (e.key) {
            case 'Enter':
                this.sendCommand();
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                if (this.historyIndex < this.commandHistory.length - 1) {
                    this.historyIndex++;
                    this.commandInput.value = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
                }
                break;
                
            case 'ArrowDown':
                e.preventDefault();
                if (this.historyIndex > 0) {
                    this.historyIndex--;
                    this.commandInput.value = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
                } else if (this.historyIndex === 0) {
                    this.historyIndex = -1;
                    this.commandInput.value = '';
                }
                break;
        }
    }

    selectClient(clientId) {
        const client = this.clients.get(clientId);
        if (!client) return;

        this.selectedClient = clientId;
        this.updateSelectedClientInfo();
        this.updateClientsTable();
        this.updateCommandInputState();
        
        this.addLog(`Selected client: ${client.hostname} (${client.username}@${client.os})`, 'info');
        this.commandInput.focus();
    }

    updateSelectedClientInfo() {
        if (this.selectedClient) {
            const client = this.clients.get(this.selectedClient);
            if (client) {
                this.selectedClientInfo.innerHTML = `
                    <div class="client-info">
                        <h3>🖥️ ${client.hostname}</h3>
                        <div class="client-details">
                            <span class="detail-item">👤 ${client.username}</span>
                            <span class="detail-item">💻 ${client.os} ${client.os_version || ''}</span>
                            <span class="detail-item">🏗️ ${client.architecture}</span>
                            <span class="detail-item">🐍 Python ${client.python_version}</span>
                            <span class="detail-item">⏰ Connected: ${new Date(client.connected_at).toLocaleTimeString()}</span>
                        </div>
                        <button onclick="terminalManager.disconnectClient('${this.selectedClient}')" class="disconnect-btn">
                            Disconnect
                        </button>
                    </div>
                `;
                return;
            }
        }
        
        this.selectedClientInfo.innerHTML = '<div class="no-selection">No client selected</div>';
    }

    updateCommandInputState() {
        const hasClient = this.selectedClient !== null;
        this.commandInput.disabled = !hasClient;
        this.sendBtn.disabled = !hasClient;
        
        if (hasClient) {
            this.commandInput.placeholder = "Enter command (↑↓ for history)";
        } else {
            this.commandInput.placeholder = "Select a client to send commands";
        }
    }

    disconnectClient(clientId) {
        ipcRenderer.send('disconnect-client', clientId);
    }

    updateClientsTable() {
        // Clear existing rows
        this.clientsTable.innerHTML = '';

        // Add client rows
        this.clients.forEach((client, clientId) => {
            const row = this.clientsTable.insertRow();
            row.setAttribute('data-client-id', clientId);
            
            if (clientId === this.selectedClient) {
                row.classList.add('selected');
            }

            // Hostname
            const hostnameCell = row.insertCell(0);
            hostnameCell.textContent = client.hostname;
            
            // User & OS
            const userCell = row.insertCell(1);
            userCell.innerHTML = `${client.username}<br><small>${client.os}</small>`;
            
            // Architecture
            const archCell = row.insertCell(2);
            archCell.textContent = client.architecture;
            
            // Connection time
            const timeCell = row.insertCell(3);
            timeCell.textContent = new Date(client.connected_at).toLocaleTimeString();
            
            // Status
            const statusCell = row.insertCell(4);
            statusCell.innerHTML = '<span class="status-online">🟢 Online</span>';

            // Click handler
            row.addEventListener('click', () => this.selectClient(clientId));
        });
    }

    updateClientsCount(count) {
        this.clientsCount.textContent = count;
    }

    updateServerStatus(status, type) {
        this.serverStatus.textContent = status;
        this.serverStatus.className = `status-${type}`;
    }

    addLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        this.addTerminalContent(`[${timestamp}] ${message}`, `log-${type}`);
    }

    addTerminalInput(command) {
        const client = this.clients.get(this.selectedClient);
        const prompt = client ? `${client.username}@${client.hostname}:~$ ` : '$ ';
        this.addTerminalContent(`${prompt}${command}`, 'input');
    }

    addTerminalOutput(output) {
        this.addTerminalContent(output, 'output');
    }

    addTerminalContent(content, className = '') {
        const line = document.createElement('div');
        line.className = `terminal-line ${className}`;
        
        // Process ANSI color codes and escape HTML
        line.innerHTML = this.processAnsiColors(this.escapeHtml(content));
        
        this.terminal.appendChild(line);
        
        // Limit terminal history
        while (this.terminal.children.length > 1000) {
            this.terminal.removeChild(this.terminal.firstChild);
        }
    }

    processAnsiColors(text) {
        // Basic ANSI color codes
        const ansiColors = {
            '30': '#2e3436', '31': '#cc0000', '32': '#4e9a06', '33': '#c4a000',
            '34': '#3465a4', '35': '#75507b', '36': '#06989a', '37': '#d3d7cf',
            '90': '#555753', '91': '#ef2929', '92': '#8ae234', '93': '#fce94f',
            '94': '#729fcf', '95': '#ad7fa8', '96': '#34e2e2', '97': '#eeeeec'
        };

        return text
            .replace(/\x1b\[([0-9;]*)m/g, (match, codes) => {
                if (!codes) return '</span>';
                
                const codeList = codes.split(';');
                let styles = '';
                
                for (const code of codeList) {
                    if (code === '0') {
                        return '</span>';
                    } else if (code === '1') {
                        styles += 'font-weight: bold; ';
                    } else if (ansiColors[code]) {
                        styles += `color: ${ansiColors[code]}; `;
                    }
                }
                
                return styles ? `<span style="${styles}">` : '';
            })
            .replace(/\x1b\[[0-9]*[GHK]/g, ''); // Remove cursor positioning
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    clearTerminal() {
        this.terminal.innerHTML = '';
        this.addLog('Terminal cleared', 'info');
    }

    downloadLogs() {
        const logs = Array.from(this.terminal.children)
            .map(line => line.textContent)
            .join('\n');
        
        const blob = new Blob([logs], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `terminal-logs-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        URL.revokeObjectURL(url);
        this.addLog('Logs downloaded', 'success');
    }
}

// Initialize terminal manager when DOM is loaded
const terminalManager = new TerminalManager();

// Make available globally for HTML onclick handlers
window.terminalManager = terminalManager;

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey) {
        switch (e.key) {
            case 'l':
                e.preventDefault();
                terminalManager.clearTerminal();
                break;
            case 's':
                e.preventDefault();
                terminalManager.downloadLogs();
                break;
        }
    }
});