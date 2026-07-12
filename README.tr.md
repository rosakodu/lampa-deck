# lampa-deck

[English](README.md) | [Русский](README.ru.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [العربية](README.ar.md) | [فارسی](README.fa.md) | [Türkçe](README.tr.md)

Steam Deck için Lampa kataloğunu ve medya oynatıcısını, TorrServer-gst'yi ve Steam Big Picture CEF tarayıcısında kesintisiz torrent oynatımı için özel bir **HLS fMP4 VP9 Dönüştürücüsünü** tamamen yerel olarak çalıştıran bir Decky Loader eklentisidir.

![Screenshot](assets/screenshot.png)

## 📋 Özellikler

- **Yerleşik Lampa**: Lampa katalog statik dosyalarını yerel olarak 8300 portunda sunar.
- **Entegre TorrServer**: Torrent akışlarını yerel olarak 8090 portunda işlemek için TorrServer-gst'yi otomatik olarak indirir ve başlatır.
- **Anında HLS VP9 Kodlama**: SteamOS tarayıcısıyla uyumlu olmayan ses/video formatlarını (H.265/HEVC, AV1, AC-3) yerel oynatma için anında fMP4 VP9 + AAC formatına dönüştüren yerleşik statik FFmpeg tabanlı arka plan kodlama motoru.
- **İzlemeye Devam Et**: Lampa'yı en son kaldığınız aktif sayfadan yeniden açmak için tek tıkla çalışan buton.
- **Eklenti Yönetim Kontrolleri**: TorrServer'ı kolayca yeniden başlatın, Lampa servislerini tamamen durdurun veya önbelleği temizleyin (kodlanmış video segmentlerini siler ve disk alanı açmak için TorrServer veritabanını sıfırlar).
- **Dil Algılama**: Steam dilini otomatik olarak algılar ve arayüzü İngilizce, Rusça, Basitleştirilmiş/Geleneksel Çince, Arapça, Farsça veya Türkçe dillerine uyarlar.
- **Temiz Kurulum**: Önceden yüklenmiş izleyiciler, ayrıştırıcılar veya üçüncü taraf eklentiler içermez. Her şeyi kendi isteğinize göre kurun.

## 📦 Yapılandırma ve Öneriler

Lampa, kendi çevrimiçi sağlayıcılarınızı, eklentilerinizi ve torrent arama motorlarınızı eklemenizi gerektirir. Başlamak için önerilen bağlantılar şunlardır:

- **TorrServer Adresi**: Lampa ayarlarınızda otomatik olarak `http://127.0.0.1:8090` şeklinde yapılandırılmıştır.
- **Arama Motorları (Parser)**: TorrServer arama motoru olarak popüler [JacRed](https://jacred.ru/) (`https://jacred.ru/`) servisini yapılandırmanızı öneririz.
- **Popüler Eklentiler**:
  - **TMDB / Çevrimiçi Medya**: Eklentileri [nb557 Lampa Plugins](https://github.com/nb557/lampa-plugins) sayfasında bulabilir veya doğrudan `https://plugin.rootu.top/tmdb.js` adresini kullanabilirsiniz.
  - **CUB Servisi**: Yer imlerini ve geçmişi eşitlemek için [CUB.red](http://cub.red/) adresini ziyaret edin.
  - **Jackett Arama Eklentisi**: [Bylampa Topluluğu](https://github.com/bylampa/bylampa.github.io) aracılığıyla eklenti kodlarına erişebilirsiniz.

## 📥 Kurulum

1. En son sürüm ZIP arşivini (`lampa-deck.zip`) Sürümler (Releases) sayfasından indirin.
2. ZIP dosyasını Steam Deck cihazınıza kopyalayın.
3. Steam Deck sistem ayarlarından **Geliştirici Modu**'nu açın.
4. Decky Loader ayarlarında geliştirici sekmesine gidin, **Developer mode** seçeneğini etkinleştirin ve ZIP dosyasını yüklemek için **Install plugin from file** seçeneğini seçin.

## 🚀 Kullanım

1. Decky Loader menüsünü açın ve uygulamayı başlatmak için **Lampa'yı Aç** seçeneğine tıklayın.
2. Lampa Ayarlarında TMDB anahtarlarınızı, eklentilerinizi ve JacRed arama adresi ayarlarını yapın.
3. Herhangi bir film veya dizi bulun, torrent akışını seçin ve **Oynat** butonuna basın.
4. Daha sonra izlemeye devam etmek için Decky menüsündeki **İzlemeye Devam Et** butonuna tıklayın.
5. Disk alanı açmak isterseniz **Devre Dışı Bırak** veya **Önbelleği Temizle** seçeneklerini kullanın.
6. Lampa ve TorrServer'ın ayrıntılı kurulum ve yapılandırma kılavuzu için [bu yararlı kurulum kılavuzuna göz atın](https://gist.github.com/darkmanlv/54132bddd49eef44a3e3afc2606a406b).

## ⚖️ Lisans ve Katkıda Bulunanlar

- [Lampa Uygulama Kaynak Kodu](https://github.com/lampa-app/lampa) (Lampa Geliştiricileri)
- [TorrServer-gst](https://github.com/YouROK/TorrServer) (YouROK)
- BSD-3-Clause Lisansı.
