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
import glob
import signal
import re

# Insert plugin folder to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


class HlsTranscoder:
    """Standalone FFmpeg HLS transcoder (no Flatpak).

    Key design: one continuous FFmpeg process per stream. Concurrent browser
    requests for segments N+1/N+2 MUST NOT restart FFmpeg — that was the bug
    causing segment_0 404 and endless player loading.
    """

    SEG_DURATION = 4
    # How far ahead of the latest ready segment we still wait (instead of restart)
    AHEAD_WAIT = 12
    # How far ahead triggers a seek-restart
    AHEAD_SEEK = 20
    MAX_WAIT_FIRST = 90.0
    MAX_WAIT = 60.0

    def __init__(self):
        home = get_user_home() if "get_user_home" in globals() else os.path.expanduser("~")
        self.output_dir = os.path.join(home, ".cache", "lampa_hls")
        self.current_hash = None
        self.current_index = None
        self.stream_url = None
        self.duration = 7200.0
        self.start_segment = 0
        self.process = None
        self.lock = threading.Lock()
        os.makedirs(self.output_dir, exist_ok=True)
        self._clear_dir()

    def _plugin_bin(self, name):
        plugin_dir = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(plugin_dir, "bin", name)

    def _process_alive(self):
        return self.process is not None and self.process.poll() is None

    def get_duration(self, url):
        ffprobe_bin = self._plugin_bin("ffprobe")
        if not os.path.exists(ffprobe_bin):
            decky.logger.error(f"ffprobe not found at {ffprobe_bin}, using fallback duration")
            return 7200.0
        clean_url = url.replace('&play', '')
        if '&preload' not in clean_url:
            clean_url += '&preload'
        cmd = [
            ffprobe_bin,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            "-analyzeduration", "1000000",
            "-probesize", "1000000",
            clean_url,
        ]
        try:
            decky.logger.info(f"Probing duration for {url}")
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            duration = float(res.stdout.strip())
            if duration > 0:
                decky.logger.info(f"Duration found: {duration}")
                return duration
        except Exception as e:
            decky.logger.error(f"Failed to probe duration: {e}")
        return 7200.0

    def prepare(self, url, h_hash, index, duration):
        """Prepare stream session and start FFmpeg from segment 0 if needed."""
        try:
            with self.lock:
                self.duration = duration or 7200.0
                new_stream = (
                    self.current_hash != h_hash
                    or str(self.current_index) != str(index)
                )
                if new_stream:
                    decky.logger.info(f"HLS session start hash={h_hash[:12]}... index={index}")
                    self._kill_process_locked()
                    self._clear_dir()
                    self.current_hash = h_hash
                    self.current_index = str(index)
                    self.stream_url = url
                    self.start_segment = 0
                    self._start_ffmpeg_locked(0)
                elif not self._process_alive():
                    latest = self._get_latest_segment_idx()
                    restart_at = 0 if latest is None else latest
                    decky.logger.info(f"HLS FFmpeg dead, restarting at segment {restart_at}")
                    self._start_ffmpeg_locked(restart_at)
        except Exception as e:
            decky.logger.error(f"Error in prepare: {e}", exc_info=True)

    def generate_master_playlist(self, url, h_hash, duration, index, host="http://127.0.0.1:8000"):
        self.prepare(url, h_hash, index, duration)
        
        # HLS Master Playlist: explicitly defines VP9 and AAC codecs with absolute media playlist URL
        m3u8 = [
            "#EXTM3U",
            "#EXT-X-VERSION:7",
            '#EXT-X-STREAM-INF:BANDWIDTH=4500000,CODECS="vp09.00.10.08,mp4a.40.2"',
            f'{host}/hls/media.m3u8?link={urllib.parse.quote(h_hash)}&index={index}'
        ]
        return "\n".join(m3u8)

    def generate_media_playlist(self, url, h_hash, duration, index, host="http://127.0.0.1:8000"):
        seg_duration = self.SEG_DURATION
        total_segments = max(1, int(duration / seg_duration) + 1)

        # HLS fMP4 Media Playlist containing absolute segments list
        m3u8 = [
            "#EXTM3U",
            "#EXT-X-VERSION:7",
            f"#EXT-X-TARGETDURATION:{seg_duration}",
            "#EXT-X-MEDIA-SEQUENCE:0",
            "#EXT-X-PLAYLIST-TYPE:VOD",
            f'#EXT-X-MAP:URI="{host}/hls/init.mp4?link={urllib.parse.quote(h_hash)}&index={index}"',
        ]
        for i in range(total_segments):
            dur = seg_duration
            if i == total_segments - 1:
                dur = max(0.1, duration - (i * seg_duration))
            m3u8.append(f"#EXTINF:{dur:.3f},")
            m3u8.append(f"{host}/hls/segment_{i}.m4s?link={urllib.parse.quote(h_hash)}&index={index}")
        m3u8.append("#EXT-X-ENDLIST")
        return "\n".join(m3u8)

    def _segment_ready(self, segment_idx):
        seg_path = os.path.join(self.output_dir, f"segment_{segment_idx}.m4s")
        tmp_path = seg_path + ".tmp"
        if not os.path.exists(seg_path):
            return False
        if os.path.exists(tmp_path):
            return False
        try:
            return os.path.getsize(seg_path) > 100
        except OSError:
            return False

    def serve_segment(self, url, h_hash, segment_idx, index="0"):
        seg_path = os.path.join(self.output_dir, f"segment_{segment_idx}.m4s")

        with self.lock:
            # Switch stream if client jumped to a different torrent/file
            if self.current_hash != h_hash or str(self.current_index) != str(index):
                decky.logger.info(f"HLS hash/index change on segment {segment_idx}")
                self._kill_process_locked()
                self._clear_dir()
                self.current_hash = h_hash
                self.current_index = str(index)
                self.stream_url = url
                self.start_segment = segment_idx
                self._start_ffmpeg_locked(segment_idx)
            elif not self._segment_ready(segment_idx):
                self._ensure_covers_segment_locked(url, segment_idx)

        # Wait outside the lock so concurrent requests can also wait
        max_wait = self.MAX_WAIT_FIRST if segment_idx <= 2 else self.MAX_WAIT
        deadline = time.time() + max_wait
        while time.time() < deadline:
            if self._segment_ready(segment_idx):
                # Brief settle so FFmpeg finishes rename/flush
                time.sleep(0.05)
                try:
                    with open(seg_path, "rb") as f:
                        data = f.read()
                    if data and len(data) > 188:
                        return data
                except OSError:
                    pass

            # If FFmpeg died before producing this segment, restart once
            with self.lock:
                if (
                    not self._segment_ready(segment_idx)
                    and not self._process_alive()
                    and self.current_hash == h_hash
                ):
                    decky.logger.warning(
                        f"HLS FFmpeg exited early, restarting for segment {segment_idx}"
                    )
                    self._start_ffmpeg_locked(segment_idx)

            time.sleep(0.15)

        decky.logger.error(f"HLS segment {segment_idx} not ready after {max_wait}s")
        return None

    def _ensure_covers_segment_locked(self, url, segment_idx):
        """Must hold self.lock. Start or seek FFmpeg only when necessary."""
        self.stream_url = url
        latest = self._get_latest_segment_idx()
        alive = self._process_alive()

        if alive:
            # Process is running — NEVER restart for nearby future segments
            if segment_idx < self.start_segment:
                # Seek backwards
                decky.logger.info(f"HLS seek backward to segment {segment_idx}")
                self._start_ffmpeg_locked(segment_idx)
                return
            if latest is not None and segment_idx > latest + self.AHEAD_SEEK:
                decky.logger.info(
                    f"HLS seek forward to segment {segment_idx} (latest={latest})"
                )
                self._start_ffmpeg_locked(segment_idx)
                return
            # Within tolerance or still warming up (latest is None): just wait
            return

        # Process not alive — start at requested segment (or 0 if early)
        start_at = segment_idx if segment_idx > 0 else 0
        if latest is not None and segment_idx <= latest + 1:
            # Prefer continuing from next missing piece
            start_at = segment_idx
        decky.logger.info(f"HLS starting FFmpeg for segment {start_at}")
        self._start_ffmpeg_locked(start_at)

    def _get_latest_segment_idx(self):
        files = glob.glob(os.path.join(self.output_dir, "segment_*.m4s"))
        if not files:
            return None
        max_idx = -1
        for f in files:
            try:
                base = os.path.basename(f)
                if base.endswith(".tmp"):
                    continue
                idx_str = base.replace("segment_", "").replace(".m4s", "")
                max_idx = max(max_idx, int(idx_str))
            except Exception:
                pass
        return max_idx if max_idx >= 0 else None

    def _start_ffmpeg_locked(self, segment_idx):
        """Must hold self.lock. Kill previous process and start a new one."""
        self._kill_process_locked()

        # Remove incomplete segments from start point onward
        for f in glob.glob(os.path.join(self.output_dir, "segment_*.m4s*")):
            try:
                base = os.path.basename(f)
                idx_str = base.replace("segment_", "").split(".")[0]
                if int(idx_str) >= segment_idx:
                    os.remove(f)
            except Exception:
                pass
        
        if segment_idx == 0:
            try:
                init_path = os.path.join(self.output_dir, "init.mp4")
                if os.path.exists(init_path):
                    os.remove(init_path)
            except Exception:
                pass

        ffmpeg_bin = self._plugin_bin("ffmpeg")
        if not os.path.exists(ffmpeg_bin):
            decky.logger.error(f"ffmpeg not found at {ffmpeg_bin}")
            return

        start_time = segment_idx * self.SEG_DURATION
        # Prefer input seeking only when not starting from 0; for HTTP torrents
        # output seeking after -i is more reliable but slower. Hybrid: -ss before -i.
        cmd = [ffmpeg_bin, "-hide_banner", "-nostdin", "-y"]
        if start_time > 0:
            cmd += ["-ss", str(start_time)]
        cmd += [
            "-i", self.stream_url or "",
            "-fflags", "+genpts",
            "-async", "1",
            "-map", "0:v:0",
            "-map", "0:a:0?",
            "-c:v", "libvpx-vp9",
            "-deadline", "realtime",
            "-cpu-used", "8",
            "-crf", "32",
            "-b:v", "4M",
            "-pix_fmt", "yuv420p",
            "-g", "48",
            "-keyint_min", "48",
            "-sc_threshold", "0",
            "-c:a", "aac",
            "-ac", "2",
            "-b:a", "128k",
            "-f", "hls",
            "-hls_segment_type", "fmp4",
            "-hls_time", str(self.SEG_DURATION),
            "-hls_list_size", "0",
            "-hls_flags", "independent_segments+temp_file",
            "-start_number", str(segment_idx),
            "-hls_segment_filename", os.path.join(self.output_dir, "segment_%d.m4s"),
            "-hls_fmp4_init_filename", "init.mp4",
            os.path.join(self.output_dir, "dummy.m3u8"),
        ]

        log_dir = "/home/deck/homebrew/logs/lampa-deck"
        os.makedirs(log_dir, exist_ok=True)
        ffmpeg_log_path = os.path.join(log_dir, "ffmpeg.log")
        try:
            if self.ffmpeg_log:
                try:
                    self.ffmpeg_log.close()
                except Exception:
                    pass
            self.ffmpeg_log = open(ffmpeg_log_path, "a")
            self.ffmpeg_log.write(f"\n=== start segment={segment_idx} ss={start_time} ===\n")
            self.ffmpeg_log.flush()
            stderr_val = self.ffmpeg_log
        except Exception:
            stderr_val = subprocess.DEVNULL

        decky.logger.info(f"Starting FFmpeg at segment {segment_idx} (t={start_time}s)")
        self.start_segment = segment_idx
        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=stderr_val,
            start_new_session=True,
        )

    def _kill_process_locked(self):
        if self.process:
            try:
                os.killpg(self.process.pid, signal.SIGTERM)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            try:
                self.process.wait(timeout=2)
            except Exception:
                try:
                    self.process.kill()
                except Exception:
                    pass
            self.process = None

    def _kill_process(self):
        with self.lock:
            self._kill_process_locked()

    def _clear_dir(self):
        for f in glob.glob(os.path.join(self.output_dir, "*")):
            try:
                os.remove(f)
            except Exception:
                pass


# Forward-declare helper used by HlsTranscoder.__init__; redefined below for Plugin
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


transcoder = HlsTranscoder()


class Plugin:
    def __init__(self):
        self.torrserver_process = None
        self.httpd = None
        self.port_torrserver = 8090
        self.port_lampa = 8300
        
        # Safe directory resolution using environment variables first
        self.plugin_dir = os.environ.get(
            "DECKY_PLUGIN_DIR",
            os.path.dirname(os.path.abspath(__file__))
        )
        self.settings_dir = os.environ.get(
            "DECKY_PLUGIN_SETTINGS_DIR",
            os.path.join(get_user_home(), ".config", "lampa-deck")
        )

    def _save_last_url(self):
        try:
            req = urllib.request.Request("http://127.0.0.1:8080/json")
            with urllib.request.urlopen(req, timeout=1.0) as response:
                targets = json.loads(response.read().decode())
                target = next((t for t in targets if 'Lampa' in t.get('title', '')), None)
                if target and target.get('url'):
                    url = target['url']
                    if "127.0.0.1:8300" in url:
                        last_url_path = os.path.join(self.settings_dir, "last_url.txt")
                        with open(last_url_path, "w") as f:
                            f.write(url)
        except Exception:
            pass

    # Exposes TorrServer running status
    async def get_torrserver_status(self) -> bool:
        # Trigger background last URL saving
        threading.Thread(target=self._save_last_url, daemon=True).start()
        
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

    # Exposes function to stop plugin completely and stop video loading
    async def stop_all(self) -> bool:
        decky.logger.info("Stopping Lampa services completely (Stop all)...")
        self.stop_torrserver()
        try:
            # Kill transcoder FFmpeg if running
            transcoder._kill_process()
        except Exception as e:
            decky.logger.error(f"Failed to kill transcoder in stop_all: {e}")
        return True

    # Exposes function to clear transcode cache and TorrServer DB cache
    async def clear_cache(self) -> bool:
        decky.logger.info("Clearing Lampa cache completely...")
        self.stop_torrserver()
        try:
            # Kill transcoder FFmpeg if running
            transcoder._kill_process()
            # Clear transcoder directory
            transcoder._clear_dir()
        except Exception as e:
            decky.logger.error(f"Failed to clear transcode cache: {e}")

        # Clear TorrServer DB directory
        db_path = os.path.join(self.settings_dir, "torrserver")
        if os.path.exists(db_path):
            try:
                shutil.rmtree(db_path, ignore_errors=True)
                os.makedirs(db_path, exist_ok=True)
            except Exception as e:
                decky.logger.error(f"Failed to clear TorrServer DB cache: {e}")
        
        # Restart TorrServer
        self.start_torrserver()
        return True

    # Exposes function to get user language from Steam
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
                    
        decky.logger.info("Steam language not found, defaulting to english")
        return "english"

    # Exposes function to get last visited Lampa page URL
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

        # Clean up any stale TorrServer processes to prevent port/DB lock conflicts
        try:
            subprocess.run(["killall", "-9", "TorrServer", "TorrServer-gst"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            time.sleep(0.5)
        except Exception as ke:
            decky.logger.warning(f"Failed to kill stale TorrServer processes: {ke}")

        decky.logger.info(f"Starting TorrServer binary at {bin_path} on port {self.port_torrserver}...")
        try:
            env = os.environ.copy()
            # Do NOT prepend plugin bin/ — old flatpak gst-* wrappers there break
            # TorrServer-gst built-in GStreamer discovery. Transcoding is done by
            # our bundled static ffmpeg, not by TorrServer GST.
            for key in ("LD_LIBRARY_PATH", "LD_PRELOAD", "GST_PLUGIN_PATH", "GST_PLUGIN_SYSTEM_PATH"):
                env.pop(key, None)

            log_dir = "/home/deck/homebrew/logs/lampa-deck"
            os.makedirs(log_dir, exist_ok=True)
            log_file_path = os.path.join(log_dir, "torrserver.log")

            try:
                self.torrserver_log_file = open(log_file_path, "a")
                stdout_val = self.torrserver_log_file
                stderr_val = self.torrserver_log_file
            except Exception as le:
                decky.logger.error(f"Failed to open TorrServer log file: {le}")
                stdout_val = subprocess.DEVNULL
                stderr_val = subprocess.DEVNULL

            # Fully standalone host process — no Flatpak
            cmd = [
                bin_path,
                "-p", str(self.port_torrserver),
                "-d", db_path,
            ]

            self.torrserver_process = subprocess.Popen(
                cmd,
                stdout=stdout_val,
                stderr=stderr_val,
                start_new_session=True,
                env=env,
            )
            
            # Start optimization task
            threading.Thread(target=self.wait_and_optimize_torrserver, daemon=True).start()
        except Exception as e:
            decky.logger.error(f"Failed to run TorrServer binary: {e}")

    def start_torrserver(self):
        # Run startup in background to prevent blocking loader main thread
        threading.Thread(target=self.start_torrserver_thread, daemon=True).start()

    # Wait and optimize settings
    def wait_and_optimize_torrserver(self):
        time.sleep(5) # Wait longer for TorrServer-gst to fully initialize
        url = f"http://127.0.0.1:{self.port_torrserver}/settings"
        
        payload = {
            "action": "set",
            "sets": {
                "CacheSize": 268435456,  # 256 MB buffer in RAM
                "ReaderReadAHead": 95,
                "PreloadCache": 25,
                "UseDisk": False,
                "ConnectionsLimit": 150,
                "TorrentDisconnectTimeout": 90,
                "ForceEncrypt": False,
                "EnableIPv6": False
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

        # Configure GStreamer settings (only available in -gst build)
        gst_url = f"http://127.0.0.1:{self.port_torrserver}/gst/settings"
        gst_payload = {
            "action": "set",
            "config": {
                "GSTVersion": 1.22,
                "Source": "stream",
                "TranscodeH265": True,   # Transcode HEVC for browser compatibility
                "TranscodeAV1": True,    # Transcode AV1 for browser compatibility
                "TranscodeH264": False,  # H264 plays natively in browser
                "AACBitrateKbps": 256,
                "SegmentSeconds": 4,     # Shorter segments = faster start
                "InactiveMinutes": 10
            }
        }
        try:
            gst_data = json.dumps(gst_payload).encode('utf-8')
            gst_req = urllib.request.Request(gst_url, data=gst_data, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(gst_req, timeout=5) as gst_response:
                gst_res = gst_response.read().decode('utf-8')
                decky.logger.info(f"TorrServer GST settings updated: {gst_res}")
        except Exception as e:
            decky.logger.info(f"TorrServer GST settings not available (standard build or not yet ready): {e}")


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
        lampa_dir = os.path.join(self.plugin_dir, "dist", "lampa")
        if not os.path.exists(lampa_dir):
            decky.logger.warning(f"Lampa directory not found at {lampa_dir}!")
            return

        plugin_self = self

        class LampaHandler(http.server.SimpleHTTPRequestHandler):
            def _send_cors_headers(self):
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD')
                self.send_header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Private-Token')
                self.send_header('Access-Control-Allow-Private-Network', 'true')
                self.send_header('Access-Control-Allow-Credentials', 'true')

            def end_headers(self):
                self._send_cors_headers()
                super().end_headers()

            def do_OPTIONS(self):
                self.send_response(204)
                self.end_headers()
                
            def do_HEAD(self):
                self.send_response(200)
                self.end_headers()

            def do_GET(self):
                parsed_url = urllib.parse.urlparse(self.path)
                decky.logger.info(f"HTTP GET: {parsed_url.path} (query: {parsed_url.query})")
                
                # Custom HLS transcoder routes (bundled static ffmpeg, no Flatpak)
                if parsed_url.path == '/hls/master.m3u8':
                    query_params = urllib.parse.parse_qs(parsed_url.query)
                    link = query_params.get('link', [''])[0]
                    index = query_params.get('index', ['0'])[0]
                    if link:
                        torr_url = (
                            f"http://127.0.0.1:{plugin_self.port_torrserver}"
                            f"/stream?link={link}&index={index}&play"
                        )
                        host = f"http://127.0.0.1:{plugin_self.port_lampa}"
                        duration = transcoder.get_duration(torr_url)
                        playlist = transcoder.generate_master_playlist(
                            torr_url, link, duration, index, host=host
                        )

                        body = playlist.encode('utf-8')
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/x-mpegURL')
                        self.send_header('Cache-Control', 'no-cache, no-store')
                        self.send_header('Content-Length', str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)
                        return

                elif parsed_url.path == '/hls/media.m3u8':
                    query_params = urllib.parse.parse_qs(parsed_url.query)
                    link = query_params.get('link', [''])[0]
                    index = query_params.get('index', ['0'])[0]
                    if link:
                        torr_url = (
                            f"http://127.0.0.1:{plugin_self.port_torrserver}"
                            f"/stream?link={link}&index={index}&play"
                        )
                        host = f"http://127.0.0.1:{plugin_self.port_lampa}"
                        duration = transcoder.get_duration(torr_url)
                        playlist = transcoder.generate_media_playlist(
                            torr_url, link, duration, index, host=host
                        )

                        body = playlist.encode('utf-8')
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/x-mpegURL')
                        self.send_header('Cache-Control', 'no-cache, no-store')
                        self.send_header('Content-Length', str(len(body)))
                        self.end_headers()
                        self.wfile.write(body)
                        return

                elif parsed_url.path == '/hls/init.mp4':
                    query_params = urllib.parse.parse_qs(parsed_url.query)
                    link = query_params.get('link', [''])[0]
                    index = query_params.get('index', ['0'])[0]
                    if link:
                        init_path = os.path.join(transcoder.output_dir, "init.mp4")
                        deadline = time.time() + 5.0
                        while time.time() < deadline:
                            if os.path.exists(init_path) and os.path.getsize(init_path) > 0:
                                break
                            time.sleep(0.15)

                        if os.path.exists(init_path):
                            with open(init_path, "rb") as f:
                                init_data = f.read()
                            self.send_response(200)
                            self.send_header('Content-Type', 'video/mp4')
                            self.send_header('Cache-Control', 'public, max-age=3600')
                            self.send_header('Content-Length', str(len(init_data)))
                            self.end_headers()
                            self.wfile.write(init_data)
                            return

                    self.send_error(404, "Init file not ready or not found")
                    return

                elif (
                    parsed_url.path.startswith('/hls/segment_')
                    or (
                        parsed_url.path.startswith('/hls/')
                        and parsed_url.path.endswith('.m4s')
                    )
                ):
                    query_params = urllib.parse.parse_qs(parsed_url.query)
                    link = query_params.get('link', [''])[0]
                    index = query_params.get('index', ['0'])[0]
                    if link:
                        try:
                            filename = os.path.basename(parsed_url.path)
                            name = filename.replace('segment_', '').split('.')[0]
                            seg_idx = int(name)

                            torr_url = (
                                f"http://127.0.0.1:{plugin_self.port_torrserver}"
                                f"/stream?link={link}&index={index}&play"
                            )
                            segment_data = transcoder.serve_segment(
                                torr_url, link, seg_idx, index=index
                            )

                            if segment_data:
                                self.send_response(200)
                                self.send_header('Content-Type', 'video/mp4')
                                self.send_header('Cache-Control', 'public, max-age=3600')
                                self.send_header('Content-Length', str(len(segment_data)))
                                self.end_headers()
                                self.wfile.write(segment_data)
                                return
                        except Exception as e:
                            decky.logger.error(f"Error serving segment: {e}")

                    self.send_error(404, "Segment not ready or not found")
                    return

                elif parsed_url.path == '/probe_stream':
                    query_params = urllib.parse.parse_qs(parsed_url.query)
                    link = query_params.get('link', [''])[0]
                    index = query_params.get('index', ['0'])[0]
                    if link:
                        stream_url = f"http://127.0.0.1:{plugin_self.port_torrserver}/stream?link={link}&index={index}&preload"
                        plugin_dir = os.path.dirname(os.path.abspath(__file__))
                        ffprobe_bin = os.path.join(plugin_dir, "bin", "ffprobe")
                        
                        response_data = {"transcode": False}
                        try:
                            cmd = [
                                ffprobe_bin,
                                "-v", "quiet",
                                "-print_format", "json",
                                "-show_streams",
                                "-show_format",
                                "-analyzeduration", "1000000",
                                "-probesize", "1000000",
                                stream_url
                            ]
                            res = subprocess.run(cmd, capture_output=True, text=True, timeout=5.0)
                            if res.returncode == 0:
                                data = json.loads(res.stdout)
                                streams = data.get("streams", [])
                                format_data = data.get("format", {})
                                format_name = format_data.get("format_name", "").lower()
                                
                                need_transcode = False
                                
                                # 1. Check container compatibility
                                container_ok = False
                                for s_cont in ["mp4", "matroska", "webm", "ogg"]:
                                    if s_cont in format_name:
                                        container_ok = True
                                        break
                                if not container_ok:
                                    need_transcode = True
                                    
                                # 2. Check streams compatibility
                                video_ok = False
                                for s in streams:
                                    codec_type = s.get("codec_type")
                                    codec_name = s.get("codec_name", "").lower()
                                    
                                    if codec_type == "video":
                                        if codec_name in ["h264", "vp8", "vp9", "av1"]:
                                            video_ok = True
                                        else:
                                            need_transcode = True
                                    elif codec_type == "audio":
                                        if codec_name not in ["aac", "mp3", "opus", "vorbis", "flac"]:
                                            need_transcode = True
                                            
                                if not video_ok:
                                    need_transcode = True
                                    
                                response_data = {"transcode": need_transcode}
                            else:
                                response_data = {"transcode": False, "error": f"ffprobe code {res.returncode}"}
                        except Exception as e:
                            response_data = {"transcode": False, "error": str(e)}
                            
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.end_headers()
                        self.wfile.write(json.dumps(response_data).encode('utf-8'))
                        return
                    else:
                        self.send_response(400)
                        self.end_headers()
                        return

                if parsed_url.path == '/play':
                    query_params = urllib.parse.parse_qs(parsed_url.query)
                    url = query_params.get('url', [None])[0]
                    player = query_params.get('player', [None])[0]
                    
                    if url and player:
                        success = plugin_self.sync_play_video(url, player)
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
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
