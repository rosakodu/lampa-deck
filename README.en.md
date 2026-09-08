# lampa-deck

[🇷🇺 Русский](README.md) | [🇬🇧 English](README.en.md) | [🇺🇦 Українська](README.uk.md) | [🇨🇳 简体中文](README.zh-CN.md) | [🇹🇼 繁體中文](README.zh-TW.md) | [🇸🇦 العربية](README.ar.md) | [🇮🇷 فارسی](README.fa.md) | [🇹🇷 Türkçe](README.tr.md)

A Decky Loader plugin for Steam Deck that runs a fully local instance of the **Lampa** catalog and media player alongside **TorrServer-gst** and a custom **WebM VP8 + Opus Transcoder** for seamless torrent playback directly inside the built-in Lampa player in Steam Big Picture (Game Mode).

![Screenshot](assets/screenshot.png)

## 📋 Features

- **Built-in Lampa**: Serve static files of Lampa catalog locally on port 8300.
- **Embedded TorrServer**: Automatically downloads and starts TorrServer-gst to handle torrent streams locally on port 8090.
- **On-the-Fly WebM VP8 + Opus Transcoding**: Custom background transcode engine using bundled static FFmpeg to transcode incompatible audio/video formats (like H.265/HEVC, AV1, H.264, AC-3, DTS, AAC) to WebM VP8 + Opus on the fly. This enables native, hardware-accelerated playback directly inside the Lampa built-in HTML5 player without audio or video errors.
- **Resume Viewing**: One-click button to resume your last active Lampa session exactly where you left off.
- **Plugin Management Controls**: Easily restart TorrServer or clear cache (resets TorrServer database to free up disk space).
- **Steam Localization**: Automatically detects and adapts UI to English, Russian, Simplified Chinese, Traditional Chinese, Arabic, Persian, or Turkish.
- **Clean Installation (Compliance)**: The plugin ships as clean software with no pre-configured trackers, parsers, or third-party scraper scripts. All sources are configured by the user manually.

---

## ⚙️ Initial Lampa Setup (Required Settings)

Lampa is a modular platform and requires you to configure content sources. Follow these simple steps in Lampa:

### 1. Connect to Local TorrServer
TorrServer runs automatically in the background on your Steam Deck. To route torrent streams to it:
1. In Lampa, navigate to **Settings** (gear icon in the sidebar) ➔ **TorrServer**.
2. Set **Main Link** (Link #1) to:
   ```text
   http://127.0.0.1:8090
   ```
3. Make sure **Use link** is set to **One**.

### 2. Configure Torrent Parser (Searching Streams)
To search for releases across torrent trackers:
1. In Lampa **Settings**, navigate to **Parser**.
2. Enable **Use parser**: set to **Yes**.
3. Select **Parser type**: **Jackett**.
4. Set **Jackett link** to a public or private parser, e.g.:
   ```text
   https://jac.red
   ```
   *(Or your own local Jackett / Prowlarr / JacRed instance)*.

### 3. Adding Plug-ins (TMDB, Online Streaming, CUB)
Plug-ins provide metadata, cover art, and online streaming options:
1. In Lampa **Settings**, open the **Plugins** section.
2. Click **Add Plugin** and enter the plugin URL:
   * **TMDB Proxy** (fixes posters, ratings, and descriptions):
     ```text
     https://plugin.rootu.top/tmdb.js
     ```
   * **CUB / etor** (torrent sources and extended details):
     ```text
     http://cub.red/plugin/etor
     ```
   * **Online Streaming** (stream directly from online balancers without torrents):
     ```text
     https://nb557.github.io/plugins/online_mod.js
     ```
3. Restart Lampa after adding plugins to apply changes.

---

## 📥 Installation

1. Download `lampa-deck.zip` from the [Releases page](https://gitflic.ru/project/rosakodu/lampa-deck/release).
2. Or install directly via the [deckyloader.ru](https://deckyloader.ru/) catalog.

---

## ⚖️ License & Credits

- [Lampa App Source](https://github.com/lampa-app/lampa) (Lampa Creators)
- [TorrServer-gst](https://github.com/YouROK/TorrServer) (YouROK)
- BSD-3-Clause License.
