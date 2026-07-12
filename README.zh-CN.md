# lampa-deck

[English](README.md) | [Русский](README.ru.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [العربية](README.ar.md) | [فارسی](README.fa.md) | [Türkçe](README.tr.md)

一个用于 Steam Deck 的 Decky Loader 插件，可在 Steam Big Picture CEF 浏览器中本地运行 **Lampa** 目录和播放器、**TorrServer-gst** 以及自适应 **HLS fMP4 VP9 转码引擎**，实现流畅的 BT 种子直接播放。

![Screenshot](assets/screenshot.png)

## 📋 功能特点

- **内置 Lampa**：在本地 8300 端口托管 Lampa 静态网页服务。
- **集成 TorrServer**：首次运行自动下载并启动 TorrServer-gst，在本地 8090 端口运行。
- **即时 HLS VP9 转码**：利用内置的静态 FFmpeg 运行后台转码引擎，将 SteamOS 浏览器不支持的音视频格式（如 H.265/HEVC、AV1、AC-3 编码）实时转换为 fMP4 VP9 + AAC 进行无缝播放。
- **继续观看**：一键按钮，直接打开您上次最后访问的 Lampa 页面。
- **插件管理控制**：便捷重启 TorrServer、完全停用 Lampa 服务或清除缓存（删除转码缓存切片并重置 TorrServer 数据库以释放磁盘空间）。
- **Steam 语言检测**：自动检测并适配英语、俄语、简体中文、繁體中文、阿拉伯语、波斯语或土耳其语界面。
- **纯净版安装**：不预装任何第三方插件、解析器或 tracker，完全由用户自定义配置。

## 📦 配置与推荐资源

Lampa 启动后需要手动配置资源源、插件和种子解析器。以下是推荐的链接和配置说明：

- **TorrServer 地址**：已自动配置为 `http://127.0.0.1:8090`。
- **种子搜索解析器**：推荐配置 Jackett/TorrServer 种子解析器服务如 [JacRed](https://jacred.ru/) (`https://jacred.ru/`)。
- **常用插件**：
  - **TMDB / 在线媒体**：可在 [nb557 Lampa Plugins](https://github.com/nb557/lampa-plugins) 找到插件或直接使用 `https://plugin.rootu.top/tmdb.js`。
  - **CUB 服务**：访问 [CUB.red](http://cub.red/) 以同步收藏夹与历史记录。
  - **Jackett 搜索插件**：可在 [Bylampa 社区](https://github.com/bylampa/bylampa.github.io) 中获取相关脚本。

## 📥 安装方法

1. 从 Releases 页面下载最新版本的 ZIP 包 (`lampa-deck.zip`)。
2. 将 ZIP 包拷贝到您的 Steam Deck 中。
3. 在 Steam Deck 系统设置中开启 **开发者模式**。
4. 打开 Decky Loader 菜单，在开发者设置中激活 **Developer mode** 并选择 **Install plugin from file** 导入该 ZIP 包。

## 🚀 使用指南

1. 打开 Decky 侧边栏，点击 **打开 Lampa** 启动应用。
2. 进入 Lampa 的设置菜单，配置您的 TMDB 秘钥、插件和 JacRed 种子解析器地址。
3. 选择您想看的影片，找到合适的种子链接并点击 **播放**。
4. 若要恢复上次的观看状态，直接在 Decky 菜单中点击 **继续观看**。
5. 如需中止后台缓冲或释放磁盘，请点击 **禁用 Lampa** 或 **清除缓存**。
6. 关于 Lampa 与 TorrServer 详细的手动配置指南，请参考[此配置教程](https://gist.github.com/darkmanlv/54132bddd49eef44a3e3afc2606a406b)。

## ⚖️ 开源协议与鸣谢

- [Lampa App 源码](https://github.com/lampa-app/lampa) (Lampa 开发者团队)
- [TorrServer-gst](https://github.com/YouROK/TorrServer) (YouROK)
- BSD-3-Clause 开源协议。
