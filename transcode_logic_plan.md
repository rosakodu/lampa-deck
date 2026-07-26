1. **Revert Chrome UI**: Remove `launchChrome` from `index.tsx`.
2. **Add Transcode Quality to UI**: Add a dropdown or button group for `Transcode Quality: Light/Balanced/High` which updates python via `set_transcode_quality`.
3. **Backend `main.py`**:
   - `get_transcode_quality` / `set_transcode_quality`
   - `_start_ffmpeg`:
     - Use `ffprobe` to determine the video codec of `self.stream_url`.
     - If `h264` (and maybe `hevc`), use `-c:v copy`.
     - Otherwise, use `-c:v libx264` with `-preset` based on quality (`ultrafast`, `superfast`, `veryfast`).
   - Spawn a background task to log `psutil` CPU % and AMD GPU usage from `/sys/class/drm/card0/device/gpu_busy_percent`.
