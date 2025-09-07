# 📡 RemoteExec

**RemoteExec** is a simple cross-platform client–server tool for running shell commands remotely.  
It consists of:

- 🖥️ **Electron-based server app** (with a GUI to manage clients & run commands)  
- 🐍 **Python client** (connects back to the server, executes commands, returns output)  

⚠️ **Important**: RemoteExec is for **educational purposes, system administration, and your own devices only**.  
Do **not** use it on machines you don’t own or without explicit permission.

---

## ✨ Features

- 🌐 Cross-platform (Windows, Linux, macOS)  
- 🐍 Python client → simple, lightweight, no extra dependencies  
- 🖥️ Electron server UI:
  - Start/stop server on any port  
  - View connected clients (hostname, user, OS)  
  - Click client → open interactive terminal  
  - Send shell commands, see live output  
- 📡 JSON-based protocol over TCP (newline-delimited)  

---

## 📂 Project Structure

```plaintext
RemoteExec/
├── client.py          # Python client
├── main.js            # Electron main process (server + socket handling)
├── renderer.js        # Renderer process (UI logic)
├── index.html         # UI layout
├── package.json       # Node/Electron project config
├── .gitignore
└── README.md
```

---

## ⚙️ Installation

1. Clone the repo
   ```bash
   git clone https://github.com/Najeeb-Patoana/RemoteExec.git
   cd RemoteExec
   ```

2. Install server dependencies
   ```bash
   npm install
   ```

3. Run the server
   ```bash
   npm start
   ```

4. Start the client  
   On another machine (or same machine in another terminal):
   ```bash
   python client.py <SERVER_IP> <PORT>
   ```

   Example:
   ```bash
   python client.py 192.168.1.100 8765
   ```

---

## 🚀 Usage

1. Launch the Electron server app (`npm start`).  
2. Enter a port (e.g., `8765`) and click **Start Server**.  
3. Run the Python client on remote machine(s).  
4. Clients will appear in the server UI.  
5. Click a client → opens a terminal window.  
6. Type a command (e.g., `whoami`, `ls`, `ipconfig`) and hit Enter.  
7. Output will appear below the command.  

---

## 🖥️ Screenshots


- 📋 Server main UI (clients list)  
- ⌨️ Terminal overlay for a client  

---

## 🔒 Security Notes

RemoteExec does not implement encryption/authentication yet.  
Traffic is **plaintext TCP** → best used in secure LAN environments or with an SSH tunnel/VPN.

For stronger security, consider:

- Adding a shared secret / token authentication  
- Using TLS sockets instead of raw TCP  

---

## 🛠️ Development

Start server with auto-reload during development:
```bash
npx electronmon .
```

Rebuild dependencies:
```bash
npm install
```

---

## 📋 Requirements

- **Server:** Node.js (≥ 18), Electron  
- **Client:** Python 3.x (no extra packages required)  

---

## ⚠️ Disclaimer

This tool is intended for learning, administration, and personal research only.  
The author is not responsible for misuse of this software.  
Do not use it on systems you do not own or without explicit permission.  

---

## 📜 License

MIT License © 2025 Najeeb Patoana
