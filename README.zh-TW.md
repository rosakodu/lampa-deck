# lampa-deck

[English](README.md) | [Русский](README.ru.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [العربية](README.ar.md) | [فارسی](README.fa.md) | [Türkçe](README.tr.md)

一個用於 Steam Deck 的 Decky Loader 插件，可在 Steam Big Picture CEF 瀏覽器中本地執行 **Lampa** 目錄與播放器、**TorrServer-gst** 以及自適應 **HLS fMP4 VP9 轉碼引擎**，實現流暢的 BT 種子直接播放。

![Screenshot](assets/screenshot.png)

## 📋 功能特點

- **內置 Lampa**：在本地 8300 端口託管 Lampa 靜態網頁服務。
- **整合 TorrServer**：首次執行自動下載並啟動 TorrServer-gst，在本地 8090 端口執行。
- **即時 HLS VP9 轉碼**：利用內置的靜態 FFmpeg 執行后台轉碼引擎，將 SteamOS 瀏覽器不支援的音視頻格式（如 H.265/HEVC、AV1、AC-3 編碼）實時轉換為 fMP4 VP9 + AAC 進行無縫播放。
- **繼續觀看**：一鍵按鈕，直接打開您上次最後訪問的 Lampa 頁面。
- **插件管理控制**：便捷重啟 TorrServer、完全停用 Lampa 服務或清除快取（刪除轉碼快取切片並重置 TorrServer 數據庫以釋放磁碟空間）。
- **Steam 語言檢測**：自動檢測並適配英語、俄語、簡體中文、繁體中文、阿拉伯語、波斯語或土耳其語界面。
- **純淨版安裝**：不預裝任何第三方插件、解析器或 tracker，完全由用戶自定義配置。

## 📦 配置與推薦資源

Lampa 啟動後需要手動配置資源源、插件和種子解析器。以下是推薦的鏈接和配置說明：

- **TorrServer 地址**：已自動配置為 `http://127.0.0.1:8090`。
- **種子搜尋解析器**：推薦配置 Jackett/TorrServer 種子解析器服務如 [JacRed](https://jacred.ru/) (`https://jacred.ru/`)。
- **常用插件**：
  - **TMDB / 在線媒體**：可在 [nb557 Lampa Plugins](https://github.com/nb557/lampa-plugins) 找到插件或直接使用 `https://plugin.rootu.top/tmdb.js`。
  - **CUB 服務**：訪問 [CUB.red](http://cub.red/) 以同步收藏夾與歷史記錄。
  - **Jackett 搜尋插件**：可在 [Bylampa 社區](https://github.com/bylampa/bylampa.github.io) 中獲取相關腳本。

## 📥 安裝方法

1. 從 Releases 頁面下載最新版本的 ZIP 包 (`lampa-deck.zip`)。
2. 將 ZIP 包拷貝到您的 Steam Deck 中。
3. 在 Steam Deck 系統設置中開啟 **開發者模式**。
4. 打開 Decky Loader 菜單，在開發者設置中激活 **Developer mode** 並選擇 **Install plugin from file** 導入該 ZIP 包。

## 🚀 使用指南

1. 打開 Decky 側邊欄，點擊 **打開 Lampa** 啟動應用。
2. 進入 Lampa 的設置菜單，配置您的 TMDB 秘鑰、插件和 JacRed 種子解析器地址。
3. 選擇您想看的影片，找到合適的種子鏈接並點擊 **播放**。
4. 若要恢復上次的觀看狀態，直接在 Decky 菜單中點擊 **繼續觀看**。
5. 如需中止后台緩衝或釋放磁碟，請點擊 **禁用 Lampa** 或 **清除快取**。
6. 關於 Lampa 與 TorrServer 詳細的手動配置指南，請參考[此配置教程](https://gist.github.com/darkmanlv/54132bddd49eef44a3e3afc2606a406b)。

## ⚖️ 開源協議與鳴謝

- [Lampa App 原始碼](https://github.com/lampa-app/lampa) (Lampa 開發者團隊)
- [TorrServer-gst](https://github.com/YouROK/TorrServer) (YouROK)
- BSD-3-Clause 開源協議。
