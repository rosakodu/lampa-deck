import os
import sys
import subprocess
import urllib.request
import urllib.parse
import json
import shutil
import stat
import struct
import threading
import time
import socketserver
import http.server
import decky
import ssl
import re
import glob

# Insert plugin folder to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def get_user_home() -> str:
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


def _build_gui_env() -> dict:
    """Build environment suitable for launching GUI apps from a system service."""
    env = os.environ.copy()
    # Strip sandbox variables that break external apps
    for key in ["LD_LIBRARY_PATH", "LD_PRELOAD", "APPDIR", "APPIMAGE",
                 "GST_PLUGIN_PATH", "GST_PLUGIN_SYSTEM_PATH"]:
        env.pop(key, None)
    uid = os.environ.get("DECKY_USER_UID", "1000")
    user = os.environ.get("DECKY_USER", "deck")
    home = get_user_home()
    env.update({
        "DISPLAY": ":0",
        "WAYLAND_DISPLAY": "wayland-0",
        "XDG_RUNTIME_DIR": f"/run/user/{uid}",
        "HOME": home,
        "USER": user,
        "DBUS_SESSION_BUS_ADDRESS": f"unix:path=/run/user/{uid}/bus",
        "PULSE_SERVER": f"unix:/run/user/{uid}/pulse/native",
        "PULSE_COOKIE": f"{home}/.config/pulse/cookie",
        "PIPEWIRE_RUNTIME_DIR": f"/run/user/{uid}",
    })
    return env


# VLC and shortcuts.vdf logic removed in favor of internal VP8/Opus transcoding
_VLC_URL_FILE = ""
_VLC_WRAPPER = ""
_vlc_steam_appid = None

def check_vlc_installation() -> dict:
    return {"found": True, "method": "transcoder", "cmd": [], "package": "internal"}

def launch_vlc(url: str) -> dict:
    return {"ok": True, "method": "internal"}


class Plugin:
    def __init__(self):
        self.torrserver_process = None
        self.httpd = None
        self.port_torrserver = 8090
        self.port_lampa = 8300

        self.plugin_dir = os.environ.get(
            "DECKY_PLUGIN_DIR",
            os.path.dirname(os.path.abspath(__file__))
        )
        self.settings_dir = os.environ.get(
            "DECKY_PLUGIN_SETTINGS_DIR",
            os.path.join(get_user_home(), ".config", "lampa-deck")
        )

    # ── TorrServer ────────────────────────────────────────────────────────────

    async def get_torrserver_status(self) -> bool:
        threading.Thread(target=self._save_last_url, daemon=True).start()
        if self.torrserver_process is None:
            return False
        poll = self.torrserver_process.poll()
        if poll is not None:
            self.torrserver_process = None
            return False
        return True

    async def restart_torrserver(self) -> bool:
        decky.logger.info("Restarting TorrServer...")
        self.stop_torrserver()
        time.sleep(1)
        self.start_torrserver()
        return True

    async def clear_cache(self) -> bool:
        """Clear TorrServer DB and HLS cache dir (if any leftover)."""
        decky.logger.info("Clearing Lampa cache...")
        self.stop_torrserver()

        # Remove legacy HLS cache if it exists
        hls_dir = os.path.join(get_user_home(), ".cache", "lampa_hls")
        if os.path.exists(hls_dir):
            try:
                shutil.rmtree(hls_dir, ignore_errors=True)
                decky.logger.info("Removed legacy HLS cache dir")
            except Exception as e:
                decky.logger.error(f"Failed to remove HLS cache: {e}")

        # Clear TorrServer DB
        db_path = os.path.join(self.settings_dir, "torrserver")
        if os.path.exists(db_path):
            try:
                shutil.rmtree(db_path, ignore_errors=True)
                os.makedirs(db_path, exist_ok=True)
                decky.logger.info("TorrServer DB cleared")
            except Exception as e:
                decky.logger.error(f"Failed to clear TorrServer DB: {e}")

        self.start_torrserver()
        return True

    # ── VLC ───────────────────────────────────────────────────────────────────

    async def check_vlc(self) -> dict:
        """Return VLC installation info for the UI."""
        return check_vlc_installation()

    async def open_vlc(self, url: str) -> dict:
        """Launch VLC with the provided stream URL."""
        return launch_vlc(url)

    # ── Misc callables ────────────────────────────────────────────────────────

    async def get_steam_language(self) -> str:
        paths = []
        if os.path.isdir("/home"):
            try:
                for user in os.listdir("/home"):
                    if user != "lost+found":
                        paths.append(f"/home/{user}/.steam/registry.vdf")
                        paths.append(f"/home/{user}/.steam/steam/registry.vdf")
            except Exception:
                pass
        paths.append(os.path.expanduser("~/.steam/registry.vdf"))
        paths.append(os.path.expanduser("~/.steam/steam/registry.vdf"))

        for path in paths:
            if os.path.isfile(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        content = f.read()
                    match = re.search(r'"language"\s+"([^"]+)"', content, re.IGNORECASE)
                    if match:
                        lang = match.group(1).lower().strip()
                        decky.logger.info(f"Steam language detected: {lang}")
                        return lang
                except Exception as e:
                    decky.logger.error(f"Error reading Steam language from {path}: {e}")

        return "english"

    async def get_last_url(self) -> str:
        url = f"http://127.0.0.1:{self.port_lampa}"
        last_url_path = os.path.join(self.settings_dir, "last_url.txt")
        if os.path.exists(last_url_path):
            try:
                with open(last_url_path, "r") as f:
                    saved = f.read().strip()
                    if saved.startswith("http://127.0.0.1:8300"):
                        url = saved
            except Exception:
                pass
        return url

    def _save_last_url(self):
        try:
            req = urllib.request.Request("http://127.0.0.1:8080/json")
            with urllib.request.urlopen(req, timeout=1.0) as response:
                targets = json.loads(response.read().decode())
                target = next((t for t in targets if "Lampa" in t.get("title", "")), None)
                if target and target.get("url"):
                    url = target["url"]
                    if "127.0.0.1:8300" in url:
                        last_url_path = os.path.join(self.settings_dir, "last_url.txt")
                        with open(last_url_path, "w") as f:
                            f.write(url)
        except Exception:
            pass

    # ── TorrServer lifecycle ──────────────────────────────────────────────────

    def _plugin_bin(self, name):
        plugin_dir = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(plugin_dir, "bin", name)

    def download_torrserver_binary(self, bin_path):
        url = "https://github.com/YouROK/TorrServer/releases/latest/download/TorrServer-gst-linux-amd64"
        decky.logger.info(f"Downloading TorrServer binary from {url}...")
        os.makedirs(os.path.dirname(bin_path), exist_ok=True)
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        try:
            context = ssl._create_unverified_context()
            with urllib.request.urlopen(req, timeout=30, context=context) as response, \
                 open(bin_path, "wb") as out_file:
                shutil.copyfileobj(response, out_file)
            os.chmod(bin_path, os.stat(bin_path).st_mode | stat.S_IEXEC)
            decky.logger.info("TorrServer download complete.")
        except Exception as e:
            decky.logger.error(f"Failed to download TorrServer: {e}")

    def start_torrserver_thread(self):
        bin_dir = os.path.join(self.settings_dir, "bin")
        bin_path = os.path.join(bin_dir, "TorrServer-gst")
        db_path = os.path.join(self.settings_dir, "torrserver")

        if not os.path.exists(bin_path):
            self.download_torrserver_binary(bin_path)

        if not os.path.exists(bin_path):
            decky.logger.error("Cannot start TorrServer: binary not found.")
            return

        os.makedirs(db_path, exist_ok=True)

        try:
            subprocess.run(["killall", "-9", "TorrServer", "TorrServer-gst"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(0.5)
        except Exception:
            pass

        env = os.environ.copy()
        for key in ("LD_LIBRARY_PATH", "LD_PRELOAD", "GST_PLUGIN_PATH", "GST_PLUGIN_SYSTEM_PATH"):
            env.pop(key, None)

        log_dir = os.path.join(self.settings_dir, "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_file_path = os.path.join(log_dir, "torrserver.log")

        try:
            self.torrserver_log_file = open(log_file_path, "a")
            stdout_val = self.torrserver_log_file
            stderr_val = self.torrserver_log_file
        except Exception as le:
            decky.logger.error(f"Failed to open TorrServer log: {le}")
            stdout_val = subprocess.DEVNULL
            stderr_val = subprocess.DEVNULL

        decky.logger.info(f"Starting TorrServer at {bin_path} on port {self.port_torrserver}")
        try:
            self.torrserver_process = subprocess.Popen(
                [bin_path, "-p", str(self.port_torrserver), "-d", db_path],
                stdout=stdout_val,
                stderr=stderr_val,
                start_new_session=True,
                env=env,
            )
            threading.Thread(target=self.wait_and_optimize_torrserver, daemon=True).start()
        except Exception as e:
            decky.logger.error(f"Failed to run TorrServer: {e}")

    def start_torrserver(self):
        threading.Thread(target=self.start_torrserver_thread, daemon=True).start()

    def stop_torrserver(self):
        if self.torrserver_process:
            decky.logger.info("Terminating TorrServer...")
            self.torrserver_process.terminate()
            try:
                self.torrserver_process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.torrserver_process.kill()
            self.torrserver_process = None

    def wait_and_optimize_torrserver(self):
        time.sleep(5)
        url = f"http://127.0.0.1:{self.port_torrserver}/settings"
        payload = {
            "action": "set",
            "sets": {
                "CacheSize": 268435456,
                "ReaderReadAHead": 95,
                "PreloadCache": 25,
                "UseDisk": False,
                "ConnectionsLimit": 150,
                "TorrentDisconnectTimeout": 90,
                "ForceEncrypt": False,
                "EnableIPv6": False,
            },
        }
        try:
            data = json.dumps(payload).encode("utf-8")
            req = urllib.request.Request(url, data=data,
                                         headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                decky.logger.info(f"TorrServer settings optimized: {resp.read().decode()}")
        except Exception as e:
            decky.logger.warning(f"TorrServer settings optimization failed: {e}")

    # ── HTTP server ───────────────────────────────────────────────────────────

    def start_lampa_http_server(self):
        lampa_dir = os.path.join(self.plugin_dir, "dist", "lampa")
        if not os.path.exists(lampa_dir):
            decky.logger.warning(f"Lampa directory not found at {lampa_dir}!")
            return

        plugin_self = self

        class LampaHandler(http.server.SimpleHTTPRequestHandler):
            def _send_cors_headers(self):
                origin = self.headers.get("Origin", "*")
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS, HEAD, POST")
                self.send_header("Access-Control-Allow-Headers",
                                 "Origin, X-Requested-With, Content-Type, Accept, Range")
                self.send_header("Access-Control-Allow-Private-Network", "true")

            def end_headers(self):
                self._send_cors_headers()
                super().end_headers()

            def do_OPTIONS(self):
                self.send_response(204)
                self.end_headers()

            def do_HEAD(self):
                self.send_response(200)
                self.end_headers()

            def log_message(self, fmt, *args):
                pass  # suppress per-request noise; keep decky logger clean

            def do_GET(self):
                parsed_url = urllib.parse.urlparse(self.path)

                # ── /stream.webm?url=...&start=... ───────────────────────────
                if parsed_url.path == "/stream.webm":
                    q = urllib.parse.parse_qs(parsed_url.query)
                    video_url = q.get("url", [""])[0]
                    start_time = q.get("start", ["0"])[0]
                    if not video_url:
                        self.send_error(400, "Missing url parameter")
                        return

                    # Normalize TorrServer stream URL
                    if "127.0.0.1:8090" in video_url or "localhost:8090" in video_url:
                        video_url = video_url.replace("&preload", "").replace("&play", "") + "&play"

                    decky.logger.info(f"[Transcoder] Starting VP8/Opus transcode for: {video_url[:80]} from {start_time}s")
                    
                    self.send_response(200)
                    self.send_header("Content-Type", "video/webm")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()

                    # Find ffmpeg
                    ffmpeg_bin = shutil.which("ffmpeg") or "/usr/bin/ffmpeg"

                    # Construct ffmpeg command
                    # Fast seek (-ss before -i) allows starting from timeline position instantly
                    cmd = [ffmpeg_bin]
                    if start_time and start_time != "0":
                        cmd += ["-ss", start_time]

                    cmd += [
                        "-i", video_url,
                        "-c:v", "libvpx",      # VP8 Video Codec (universally supported in CEF)
                        "-b:v", "4000k",       # 4 Mbps video bitrate for high-quality HD
                        "-deadline", "realtime",
                        "-cpu-used", "8",      # ultra-fast speed, low CPU usage
                        "-threads", "6",       # multi-threading
                        "-speed", "8",
                        "-c:a", "libopus",     # Opus Audio Codec (universally supported in CEF)
                        "-b:a", "128k",        # 128 kbps stereo audio
                        "-ac", "2",            # downmix to 2 channels
                        "-f", "webm",          # WebM container format
                        "-y",
                        "pipe:1"
                    ]

                    # Strip environment variables that might interfere with ffmpeg execution
                    env = os.environ.copy()
                    for key in ("LD_LIBRARY_PATH", "LD_PRELOAD", "GST_PLUGIN_PATH", "GST_PLUGIN_SYSTEM_PATH"):
                        env.pop(key, None)

                    proc = None
                    try:
                        proc = subprocess.Popen(
                            cmd,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL,
                            env=env,
                            bufsize=1024*64
                        )
                        
                        while True:
                            chunk = proc.stdout.read(4096)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
                    except (ConnectionResetError, BrokenPipeError):
                        decky.logger.info("[Transcoder] Playback stopped by client, terminating ffmpeg")
                    except Exception as e:
                        decky.logger.error(f"[Transcoder] Error during transcode streaming: {e}")
                    finally:
                        if proc:
                            try:
                                proc.terminate()
                                proc.wait(timeout=1)
                            except Exception:
                                try:
                                    proc.kill()
                                except Exception:
                                    pass
                    return

                # ── /check_vlc ────────────────────────────────────────────
                elif parsed_url.path == "/check_vlc":
                    result = check_vlc_installation()
                    body = json.dumps(result).encode("utf-8")
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    return

                # ── /save_url?url=... ─────────────────────────────────────
                elif parsed_url.path == "/save_url":
                    q = urllib.parse.parse_qs(parsed_url.query)
                    url = q.get("url", [""])[0]
                    if url and "127.0.0.1:8300" in url:
                        last_url_path = os.path.join(plugin_self.settings_dir, "last_url.txt")
                        try:
                            with open(last_url_path, "w") as f:
                                f.write(url)
                        except Exception as e:
                            decky.logger.error(f"Failed to write last_url: {e}")
                    self.send_response(200)
                    self.send_header("Content-Type", "text/plain")
                    self.end_headers()
                    self.wfile.write(b"ok")
                    return

                # ── /log_js?msg=... ───────────────────────────────────────
                elif parsed_url.path == "/log_js":
                    q = urllib.parse.parse_qs(parsed_url.query)
                    msg = q.get("msg", [""])[0]
                    if msg:
                        decky.logger.info(f"[JS] {msg}")
                    self.send_response(200)
                    self.send_header("Content-Type", "text/plain")
                    self.end_headers()
                    self.wfile.write(b"ok")
                    return

                # ── static files ──────────────────────────────────────────
                super().do_GET()

        class ThreadedTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
            allow_reuse_address = True

        try:
            self.httpd = ThreadedTCPServer(
                ("127.0.0.1", self.port_lampa),
                lambda *args, **kwargs: LampaHandler(*args, directory=lampa_dir, **kwargs),
            )
            server_thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
            server_thread.start()
            decky.logger.info(f"Lampa HTTP server started on port {self.port_lampa}")
        except Exception as e:
            decky.logger.error(f"Failed to start Lampa HTTP server: {e}")

    # ── Plugin lifecycle ──────────────────────────────────────────────────────

    async def _main(self):
        decky.logger.info(
            f"Lampa Deck starting — plugin_dir={self.plugin_dir}, settings_dir={self.settings_dir}"
        )
        os.makedirs(self.settings_dir, exist_ok=True)
        self.start_torrserver()
        self.start_lampa_http_server()

        # Log Transcoder status on startup
        decky.logger.info("Lampa Deck Transcoder initialized (VP8 + Opus mode)")

    async def _unload(self):
        decky.logger.info("Unloading Lampa Deck Plugin...")
        self.stop_torrserver()
        if self.httpd:
            try:
                self.httpd.server_close()
            except Exception:
                pass
            try:
                threading.Thread(target=self.httpd.shutdown, daemon=True).start()
            except Exception:
                pass

    async def _uninstall(self):
        pass

    async def _migration(self):
        pass
