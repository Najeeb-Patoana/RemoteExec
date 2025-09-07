#!/usr/bin/env python3
import socket
import sys
import os
import subprocess
import json
import platform
import threading
import time
import queue
import signal
import base64

# Platform-specific imports
if platform.system() == 'Windows':
    import msvcrt
else:
    import select
    try:
        import pty
        PTY_AVAILABLE = True
    except ImportError:
        PTY_AVAILABLE = False

class SimpleTerminalClient:
    def __init__(self, server_ip, server_port):
        self.server_ip = server_ip
        self.server_port = server_port
        self.socket = None
        self.running = False
        self.shell_process = None
        self.is_windows = platform.system() == 'Windows'
        self.output_queue = queue.Queue()
        self.input_queue = queue.Queue()
        
        # Signal handlers
        signal.signal(signal.SIGINT, self.signal_handler)
        if not self.is_windows:
            signal.signal(signal.SIGTERM, self.signal_handler)
    
    def signal_handler(self, signum, frame):
        print("\n🛑 Received shutdown signal...")
        self.cleanup()
        sys.exit(0)
    
    def send_message(self, message):
        """Send JSON message to server"""
        try:
            if isinstance(message, dict):
                message = json.dumps(message)
            message_data = (message + '\n').encode('utf-8')
            self.socket.send(message_data)
            return True
        except Exception as e:
            print(f"Send error: {e}")
            return False
    
    def get_client_info(self):
        """Get client system information"""
        try:
            username = os.getlogin()
        except:
            username = os.environ.get('USER', os.environ.get('USERNAME', 'unknown'))
        
        # Get CPU count
        try:
            cpu_count = os.cpu_count()
        except:
            cpu_count = 1
            
        return {
            "type": "client_info",
            "hostname": platform.node(),
            "username": username,
            "os": platform.system(),
            "os_version": platform.release(),
            "architecture": platform.machine(),
            "python_version": platform.python_version(),
            "cpu_count": cpu_count,
            "platform_details": platform.platform()
        }
    
    def create_shell_process(self):
        """Create shell process based on platform"""
        try:
            if self.is_windows:
                # Windows CMD
                shell_cmd = os.environ.get('COMSPEC', 'cmd.exe')
                
                self.shell_process = subprocess.Popen(
                    shell_cmd,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    shell=False,
                    bufsize=0,
                    universal_newlines=False,
                    creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0
                )
            else:
                # Unix-like systems
                shell = os.environ.get('SHELL', '/bin/bash')
                
                # Try to use PTY if available
                if PTY_AVAILABLE:
                    import pty
                    master_fd, slave_fd = pty.openpty()
                    
                    self.shell_process = subprocess.Popen(
                        shell,
                        stdin=slave_fd,
                        stdout=slave_fd,
                        stderr=slave_fd,
                        shell=False,
                        bufsize=0,
                        universal_newlines=False,
                        preexec_fn=os.setsid
                    )
                    
                    os.close(slave_fd)
                    self.master_fd = master_fd
                else:
                    # Fallback without PTY
                    self.shell_process = subprocess.Popen(
                        shell,
                        stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        shell=False,
                        bufsize=0,
                        universal_newlines=False
                    )
            
            return True
            
        except Exception as e:
            print(f"❌ Shell creation failed: {e}")
            return False
    
    def read_shell_output(self):
        """Read output from shell process"""
        while self.running:
            try:
                if self.is_windows:
                    if self.shell_process and self.shell_process.poll() is None:
                        try:
                            # Windows non-blocking read
                            import msvcrt
                            if msvcrt.kbhit() or True:  # Simplified for now
                                data = self.shell_process.stdout.read(1024)
                                if data:
                                    self.output_queue.put(data)
                                else:
                                    time.sleep(0.01)
                        except:
                            time.sleep(0.1)
                else:
                    # Unix-like systems
                    if hasattr(self, 'master_fd') and self.master_fd:
                        # PTY mode
                        ready, _, _ = select.select([self.master_fd], [], [], 0.1)
                        if ready:
                            try:
                                data = os.read(self.master_fd, 1024)
                                if data:
                                    self.output_queue.put(data)
                            except OSError:
                                break
                    elif self.shell_process and self.shell_process.poll() is None:
                        # Subprocess mode
                        try:
                            ready, _, _ = select.select([self.shell_process.stdout], [], [], 0.1)
                            if ready:
                                data = self.shell_process.stdout.read(1024)
                                if data:
                                    self.output_queue.put(data)
                        except:
                            time.sleep(0.1)
                
            except Exception as e:
                print(f"Shell output read error: {e}")
                time.sleep(0.1)
    
    def write_shell_input(self):
        """Write input to shell process"""
        while self.running:
            try:
                command = self.input_queue.get(timeout=1.0)
                if command is None:
                    break
                
                if self.is_windows:
                    if self.shell_process and self.shell_process.poll() is None:
                        try:
                            self.shell_process.stdin.write(command.encode('utf-8', errors='replace') + b'\r\n')
                            self.shell_process.stdin.flush()
                        except Exception as e:
                            print(f"Write error (Windows): {e}")
                else:
                    if hasattr(self, 'master_fd') and self.master_fd:
                        try:
                            os.write(self.master_fd, command.encode('utf-8', errors='replace') + b'\n')
                        except OSError:
                            break
                    elif self.shell_process and self.shell_process.poll() is None:
                        try:
                            self.shell_process.stdin.write(command.encode('utf-8', errors='replace') + b'\n')
                            self.shell_process.stdin.flush()
                        except Exception as e:
                            print(f"Write error: {e}")
                
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Shell input write error: {e}")
    
    def handle_shell_output(self):
        """Handle shell output and send to server"""
        while self.running:
            try:
                data = self.output_queue.get(timeout=1.0)
                if data is None:
                    break
                
                # Send to server
                message = {
                    "type": "shell_output",
                    "data": base64.b64encode(data).decode()
                }
                self.send_message(message)
                
            except queue.Empty:
                continue
            except Exception as e:
                print(f"Shell output handle error: {e}")
                if not self.running:
                    break
    
    def handle_server_messages(self):
        """Handle messages from server"""
        buffer = ""
        self.socket.settimeout(1.0)
        
        while self.running:
            try:
                data = self.socket.recv(4096)
                if not data:
                    print("📡 Server disconnected")
                    break
                    
                buffer += data.decode('utf-8', errors='ignore')
                
                while '\n' in buffer:
                    line, buffer = buffer.split('\n', 1)
                    if line.strip():
                        try:
                            message = json.loads(line)
                            self.handle_server_command(message)
                        except json.JSONDecodeError:
                            continue
                
            except socket.timeout:
                continue
            except Exception as e:
                if self.running:
                    print(f"Server message error: {e}")
                break
    
    def handle_server_command(self, message):
        """Handle specific server commands"""
        try:
            if message.get("type") == "command":
                command = message.get("data", "")
                self.input_queue.put(command)
            elif message.get("type") == "ping":
                response = {"type": "pong", "timestamp": time.time()}
                self.send_message(response)
        except Exception as e:
            print(f"Command handling error: {e}")
    
    def connect(self):
        """Connect to server"""
        try:
            print(f"🔗 Connecting to {self.server_ip}:{self.server_port}...")
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.settimeout(10)
            self.socket.connect((self.server_ip, self.server_port))
            print(f"✅ Connected to server {self.server_ip}:{self.server_port}")
            
            # Send client info immediately
            client_info = self.get_client_info()
            self.send_message(client_info)
            
            return True
                
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False
    
    def run(self):
        """Main client loop"""
        print("🚀 RemoteExec Client Starting...")
        print(f"🖥️  Platform: {platform.system()} {platform.release()}")
        print(f"🐍 Python: {platform.python_version()}")
        
        if not self.connect():
            return
        
        if not self.create_shell_process():
            print("❌ Failed to create shell process")
            return
        
        print("✅ Shell process created")
        self.running = True
        
        # Start threads
        threads = [
            threading.Thread(target=self.read_shell_output, daemon=True),
            threading.Thread(target=self.write_shell_input, daemon=True),
            threading.Thread(target=self.handle_shell_output, daemon=True),
            threading.Thread(target=self.handle_server_messages, daemon=True)
        ]
        
        for thread in threads:
            thread.start()
        
        print("✅ Terminal session started")
        print("💡 Press Ctrl+C to disconnect")
        
        try:
            while self.running:
                time.sleep(1)
                if self.shell_process and self.shell_process.poll() is not None:
                    print("⚠️  Shell process terminated")
                    break
        except KeyboardInterrupt:
            print("\n⚠️  Interrupted by user")
        finally:
            self.cleanup()
    
    def cleanup(self):
        """Clean up resources"""
        print("🧹 Cleaning up...")
        self.running = False
        
        # Signal queues
        try:
            self.output_queue.put(None)
            self.input_queue.put(None)
        except:
            pass
        
        # Terminate shell
        if self.shell_process:
            try:
                self.shell_process.terminate()
                try:
                    self.shell_process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self.shell_process.kill()
            except:
                pass
        
        # Close PTY
        if hasattr(self, 'master_fd') and self.master_fd:
            try:
                os.close(self.master_fd)
            except:
                pass
        
        # Close socket
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
        
        print("✅ Cleanup completed")

def main():
    if len(sys.argv) < 3:
        print("🚀 RemoteExec Remote Terminal Client")
        print("Usage: python client.py <SERVER_IP> <SERVER_PORT>")
        print("\nExamples:")
        print("  python client.py 192.168.1.100 8765")
        print("  python client.py 127.0.0.1 8765")
        sys.exit(1)
    
    server_ip = sys.argv[1]
    
    try:
        server_port = int(sys.argv[2])
        if server_port < 1 or server_port > 65535:
            raise ValueError("Port out of range")
    except ValueError:
        print("❌ Invalid port number (must be 1-65535)")
        sys.exit(1)
    
    client = SimpleTerminalClient(server_ip, server_port)
    client.run()

if __name__ == "__main__":
    main()