# lampa-deck

[🇬🇧 English](README.md) | [🇷🇺 Русский](README.ru.md) | [🇺🇦 Українська](README.uk.md) | [🇨🇳 简体中文](README.zh-CN.md) | [🇹🇼 繁體中文](README.zh-TW.md) | [🇸🇦 العربية](README.ar.md) | [🇮🇷 فارسی](README.fa.md) | [🇹🇷 Türkçe](README.tr.md)

A Decky Loader plugin for Steam Deck that runs a fully local instance of the **Lampa** catalog and media player alongside **TorrServer-gst** and a custom **WebM VP8 + Opus Transcoder** for seamless torrent playback directly inside the built-in Lampa player in Steam Big Picture (Game Mode).

![Screenshot](assets/screenshot.png)

## 📋 Features

- **Built-in Lampa**: Serve static files of Lampa catalog locally on port 8300.
- **Embedded TorrServer**: Automatically downloads and starts TorrServer-gst to handle torrent streams locally on port 8090.
- **On-the-Fly WebM VP8 + Opus Transcoding**: Custom background transcode engine using bundled static FFmpeg to transcode incompatible audio/video formats (like H.265/HEVC, AV1, H.264, AC-3, DTS, AAC) to WebM VP8 + Opus on the fly. This enables native, hardware-accelerated playback directly inside the Lampa built-in HTML5 player without audio or video errors.
- **Resume Viewing**: One-click button to resume your last active Lampa session exactly where you left off.
- **Plugin Management Controls**: Easily restart TorrServer or clear cache (resets TorrServer database to free up disk space).
- **Steam Localization**: Automatically detects and adapts UI to English, Russian, Simplified Chinese, Traditional Chinese, Arabic, Persian, or Turkish.
- **Clean Installation**: No pre-installed trackers, parsers, or third-party plug-ins. Setup everything your way.

## 📦 Setup & Recommendations

Lampa requires you to add your own online providers, plugins, and torrent parsers. Here are the recommended links to get started:

- **TorrServer URL**: Automatically pre-configured in your Lampa settings as `http://127.0.0.1:8090`.
- **Search Parsers**: We recommend configuring Jackett/TorrServer search parsers using [JacRed](https://jacred.ru/) (`https://jacred.ru/`).
- **Popular Plugins**:
  - **TMDB / Online Media**: Find plugins in [nb557 Lampa Plugins](https://github.com/nb557/lampa-plugins) or use `https://plugin.rootu.top/tmdb.js`.
  - **CUB Service**: Visit [CUB.red](http://cub.red/) for synced bookmarks and lists.
  - **Jackett Search Plugin**: Find it via [Bylampa Community](https://github.com/bylampa/bylampa.github.io).

## 📥 Installation

1. Download the latest release (`lampa-deck.zip`) from the Releases page.
2. Transfer the ZIP file to your Steam Deck.
3. Turn on **Developer Mode** in Steam Deck settings.
4. Enable **Developer settings** in Decky Loader, activate **Developer mode**, and select **Install plugin from file** to upload the ZIP.

## 🚀 Usage

1. Open the Decky Loader menu and click **Open Lampa** to launch Lampa.
2. In Lampa Settings, configure your TMDB tokens, plugins, and JacRed parser URL.
3. Find any movie or TV show, select a torrent stream, and hit **Play**.
4. To resume a closed session later, simply click **Continue Viewing** in the Decky menu.
5. If you need to stop buffering or free up space, click **Disable Lampa** or **Clear Cache**.
6. For a detailed configuration guide, check out this [helpful setup guide](https://gist.github.com/darkmanlv/54132bddd49eef44a3e3afc2606a406b).

## ⚖️ License & Credits

- [Lampa App Source](https://github.com/lampa-app/lampa) (Lampa Creators)
- [TorrServer-gst](https://github.com/YouROK/TorrServer) (YouROK)
- BSD-3-Clause License.
