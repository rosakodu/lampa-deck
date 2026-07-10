import os
import sys
import subprocess
import urllib.request
import urllib.parse
import json
import shutil
import stat
import threading
import time
import socketserver
import http.server
import decky
import ssl

# Insert plugin folder to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def get_user_home() -> str:
    """Helper to detect user home directory robustly."""
    env_home = os.environ.get("DECKY_USER_HOME")
    if env_home and os.path.isdir(env_home):
        return env_home
    try:
        if hasattr(decky, "DECKY_USER_HOME") and decky.DECKY_USER_HOME:
            if os.path.isdir(decky.DECKY_USER_HOME):
                return decky.DECKY_USER_HOME
    except Exception:
        pass
    if os.path.isdir("/home/deck"):
        return "/home/deck"
    return os.path.expanduser("~")

class Plugin:
    def __init__(self):
        self.torrserver_process = None
        self.httpd = None
        self.port_torrserver = 8090
        self.port_lampa = 8000
        
        # Safe directory resolution using environment variables first
        self.plugin_dir = os.environ.get(
            "DECKY_PLUGIN_DIR",
            os.path.dirname(os.path.abspath(__file__))
        )
        self.settings_dir = os.environ.get(
            "DECKY_PLUGIN_SETTINGS_DIR",
            os.path.join(get_user_home(), ".config", "lampa-deck")
        )

    # Exposes TorrServer running status
    async def get_torrserver_status(self) -> bool:
        if self.torrserver_process is None:
            return False
        # Check if process is still running
        poll = self.torrserver_process.poll()
        if poll is not None:
            self.torrserver_process = None
            return False
        return True

    # Exposes function to restart TorrServer
    async def restart_torrserver(self) -> bool:
        decky.logger.info("Restarting TorrServer...")
        self.stop_torrserver()
        time.sleep(1)
        self.start_torrserver()
        return True

    # Exposes function to open Lampa in Steam native browser
    async def open_lampa(self) -> bool:
        decky.logger.info("Opening Lampa in Steam native browser...")
        try:
            # We use xdg-open to trigger steam://openurl/http://127.0.0.1:8000
            subprocess.Popen(["xdg-open", f"steam://openurl/http://127.0.0.1:{self.port_lampa}"], start_new_session=True)
            return True
        except Exception as e:
            decky.logger.error(f"Failed to open Lampa in Steam browser: {e}")
            return False

    # Spawns VLC or other external player
    def sync_play_video(self, url: str, player_path: str) -> bool:
        decky.logger.info(f"Sync play request: player='{player_path}', url='{url}'")
        
        video_url = url.replace('&preload', '&play')
        
        # Build environment for host execution
        env = os.environ.copy()
        for key in ["LD_LIBRARY_PATH", "LD_PRELOAD", "APPDIR", "APPIMAGE"]:
            env.pop(key, None)
        
        # Set environment variables required for graphical applications and audio
        env["DISPLAY"] = ":0"
        env["WAYLAND_DISPLAY"] = "wayland-0"
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        env["HOME"] = "/home/deck"
        env["USER"] = "deck"
        env["DBUS_SESSION_BUS_ADDRESS"] = "unix:path=/run/user/1000/bus"
        env["PULSE_SERVER"] = "unix:/run/user/1000/pulse/native"
        env["PULSE_COOKIE"] = "/home/deck/.config/pulse/cookie"
        env["PIPEWIRE_RUNTIME_DIR"] = "/run/user/1000"
        
        cmd_parts = player_path.split()
        cmd_parts.append(video_url)
        
        decky.logger.info(f"Launching player command: {' '.join(cmd_parts)}")
        
        try:
            proc = subprocess.Popen(
                cmd_parts,
                env=env,
                start_new_session=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            # Wait briefly to catch immediate failures
            try:
                stdout, stderr = proc.communicate(timeout=2)
                if proc.returncode is not None and proc.returncode != 0:
                    decky.logger.error(f"Player exited with code {proc.returncode}, stderr: {stderr.decode(errors='replace')}")
                    return False
            except subprocess.TimeoutExpired:
                # Process is still running (good — means the player started)
                decky.logger.info("Player process started successfully (still running)")
            return True
        except Exception as e:
            decky.logger.error(f"Failed to spawn player: {e}")
            return False

    # Download TorrServer helper
    def download_torrserver_binary(self, bin_path):
        url = "https://github.com/YouROK/TorrServer/releases/latest/download/TorrServer-gst-linux-amd64"
        decky.logger.info(f"Downloading TorrServer binary from {url} to {bin_path}...")
        os.makedirs(os.path.dirname(bin_path), exist_ok=True)
        
        # Add simple user agent header to prevent 403/block and handle timeouts
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
        )
        try:
            context = ssl._create_unverified_context()
            with urllib.request.urlopen(req, timeout=30, context=context) as response, open(bin_path, 'wb') as out_file:
                shutil.copyfileobj(response, out_file)
            # Make executable
            os.chmod(bin_path, os.stat(bin_path).st_mode | stat.S_IEXEC)
            decky.logger.info("TorrServer download complete.")
        except Exception as e:
            decky.logger.error(f"Failed to download TorrServer: {e}")

    # Starts local TorrServer (asynchronous helper)
    def start_torrserver_thread(self):
        bin_dir = os.path.join(self.settings_dir, "bin")
        bin_path = os.path.join(bin_dir, "TorrServer-gst")
        db_path = os.path.join(self.settings_dir, "torrserver")

        if not os.path.exists(bin_path):
            self.download_torrserver_binary(bin_path)

        if not os.path.exists(bin_path):
            decky.logger.error("Cannot start TorrServer: binary was not downloaded successfully.")
            return

        if not os.path.exists(db_path):
            os.makedirs(db_path, exist_ok=True)

        decky.logger.info(f"Starting TorrServer binary at {bin_path} on port {self.port_torrserver}...")
        try:
            self.torrserver_process = subprocess.Popen([
                bin_path,
                "-p", str(self.port_torrserver),
                "-d", db_path
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            
            # Start optimization task
            threading.Thread(target=self.wait_and_optimize_torrserver, daemon=True).start()
        except Exception as e:
            decky.logger.error(f"Failed to run TorrServer binary: {e}")

    def start_torrserver(self):
        # Run startup in background to prevent blocking loader main thread
        threading.Thread(target=self.start_torrserver_thread, daemon=True).start()

    # Wait and optimize settings
    def wait_and_optimize_torrserver(self):
        time.sleep(3) # Wait for startup
        url = f"http://127.0.0.1:{self.port_torrserver}/settings"
        
        payload = {
            "action": "set",
            "sets": {
                "CacheSize": 268435456,  # 256 MB buffer in RAM
                "ReaderReadAHead": 95,
                "PreloadCache": 25,
                "UseDisk": False,
                "ConnectionsLimit": 150
            }
        }
        
        try:
            data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=5) as response:
                res_data = response.read().decode('utf-8')
                decky.logger.info(f"TorrServer optimized settings updated successfully: {res_data}")
        except Exception as e:
            decky.logger.warning(f"TorrServer settings optimization failed: {e}")

    # Stops TorrServer
    def stop_torrserver(self):
        if self.torrserver_process:
            decky.logger.info("Terminating TorrServer process...")
            self.torrserver_process.terminate()
            try:
                self.torrserver_process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.torrserver_process.kill()
            self.torrserver_process = None

    # Serve static Lampa files on port 8000 and handle HTTP /play endpoint
    def start_lampa_http_server(self):
        lampa_dir = os.path.join(self.plugin_dir, "lampa")
        if not os.path.exists(lampa_dir):
            decky.logger.warning(f"Lampa directory not found at {lampa_dir}!")
            return

        plugin_self = self

        class LampaHandler(http.server.SimpleHTTPRequestHandler):
            def do_GET(self):
                parsed_url = urllib.parse.urlparse(self.path)
                if parsed_url.path == '/play':
                    query_params = urllib.parse.parse_qs(parsed_url.query)
                    url = query_params.get('url', [None])[0]
                    player = query_params.get('player', [None])[0]
                    
                    if url and player:
                        success = plugin_self.sync_play_video(url, player)
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        self.wfile.write(json.dumps({"success": success}).encode('utf-8'))
                        return
                    else:
                        self.send_response(400)
                        self.end_headers()
                        return
                        
                # Fallback to standard static file serving
                super().do_GET()

        class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
            allow_reuse_address = True
            
        try:
            # We use a lambda to avoid subclassing SimpleHTTPRequestHandler.__init__
            self.httpd = ThreadedTCPServer(("127.0.0.1", self.port_lampa), lambda *args, **kwargs: LampaHandler(*args, directory=lampa_dir, **kwargs))
            server_thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
            server_thread.start()
            decky.logger.info(f"Lampa HTTP server started on port {self.port_lampa}")
        except Exception as e:
            decky.logger.error(f"Failed to start Lampa HTTP server: {e}")

    # Asyncio-compatible main entry point
    async def _main(self):
        decky.logger.info(f"Initializing Lampa Decky Plugin (lampa-deck)... plugin_dir={self.plugin_dir}, settings_dir={self.settings_dir}")
        
        # Create settings dir
        if not os.path.exists(self.settings_dir):
            os.makedirs(self.settings_dir, exist_ok=True)

        # Start servers (TorrServer runs in background threads now)
        self.start_torrserver()
        self.start_lampa_http_server()

    # Asyncio-compatible unload
    async def _unload(self):
        decky.logger.info("Unloading Lampa Decky Plugin...")
        self.stop_torrserver()
        if self.httpd:
            try:
                self.httpd.server_close()
            except Exception as e:
                decky.logger.error(f"Failed to close HTTP server: {e}")
            try:
                threading.Thread(target=self.httpd.shutdown, daemon=True).start()
            except Exception as e:
                decky.logger.error(f"Failed to shutdown HTTP server: {e}")

    # Asyncio-compatible uninstall
    async def _uninstall(self):
        decky.logger.info("Uninstalling Lampa Decky Plugin...")
        pass

    async def _migration(self):
        pass
