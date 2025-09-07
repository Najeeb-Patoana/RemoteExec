const { app, BrowserWindow, ipcMain } = require('electron');
const net = require('net');

let server = null;
let clients = {};

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// Start TCP server
ipcMain.on('start-server', (event, port) => {
    if (server) {
        event.sender.send('server-error', 'Server already running');
        return;
    }

    server = net.createServer((socket) => {
        let clientHost = '';

        socket.on('data', (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'init') {
                    clientHost = message.data.hostname;
                    clients[clientHost] = socket;
                    event.sender.send('client-connected', message.data);
                } else if (message.type === 'command-output') {
                    event.sender.send('command-output', {
                        hostname: clientHost,
                        output: message.data
                    });
                }
            } catch (err) {
                console.error(err);
            }
        });

        socket.on('close', () => {
            if (clientHost) {
                delete clients[clientHost];
                event.sender.send('client-disconnected', clientHost);
            }
        });

        socket.on('error', () => {
            if (clientHost) {
                delete clients[clientHost];
                event.sender.send('client-disconnected', clientHost);
            }
        });
    });

    server.listen(port, () => {
        console.log(`Server started on port ${port}`);
    });

    server.on('error', (err) => {
        event.sender.send('server-error', err.message);
        server = null;
    });
});

// Stop server
ipcMain.on('stop-server', () => {
    if (server) {
        server.close();
        server = null;
        clients = {};
    }
});

// Run command on client
ipcMain.on('run-command', (event, data) => {
    const { hostname, command } = data;
    const socket = clients[hostname];
    if (socket) {
        socket.write(JSON.stringify({ type: 'run-command', command }) + '\n');
    }
});

// Exit client
ipcMain.on('exit-client', (event, hostname) => {
    const socket = clients[hostname];
    if (socket) {
        socket.write(JSON.stringify({ type: 'exit' }) + '\n');
        socket.destroy();
        delete clients[hostname];
        event.sender.send('client-disconnected', hostname);
    }
});

// Exit app
ipcMain.on('exit-app', () => {
    Object.values(clients).forEach(s => s.destroy());
    if (server) server.close();
    app.quit();
});
