import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
  Router,
  Navigation
} from "@decky/ui";
import {
  callable,
  definePlugin,
  toaster
} from "@decky/api";
import { useState, useEffect, useMemo } from "react";
import { FaFilm } from "react-icons/fa";

// Python backend callables
const getTorrserverStatus = callable<[], boolean>("get_torrserver_status");
const restartTorrserver = callable<[], boolean>("restart_torrserver");
const getLastUrl = callable<[], string>("get_last_url");
const stopAll = callable<[], boolean>("stop_all");
const clearCache = callable<[], boolean>("clear_cache");
const getSteamLanguage = callable<[], string>("get_steam_language");

type TranslationKeys =
  | "title"
  | "openLampa"
  | "continueViewing"
  | "torrserverStatus"
  | "statusActive"
  | "statusStopped"
  | "restartTorrserver"
  | "disableLampa"
  | "clearCache"
  | "toastSuccess"
  | "toastError"
  | "toastRestarted"
  | "toastStopped"
  | "toastCacheCleared"
  | "loadingText"
  | "restartingText";

const translations: Record<string, Record<TranslationKeys, string>> = {
  english: {
    title: "Lampa Management",
    openLampa: "Open Lampa",
    continueViewing: "Continue Viewing",
    torrserverStatus: "TorrServer Status:",
    statusActive: "Running",
    statusStopped: "Stopped",
    restartTorrserver: "Restart TorrServer",
    disableLampa: "Disable Lampa",
    clearCache: "Clear Cache",
    toastSuccess: "Success",
    toastError: "Error",
    toastRestarted: "TorrServer restarted successfully!",
    toastStopped: "Lampa and TorrServer stopped successfully!",
    toastCacheCleared: "Cache cleared successfully!",
    loadingText: "Loading...",
    restartingText: "Restarting..."
  },
  russian: {
    title: "Управление Lampa",
    openLampa: "Открыть Lampa",
    continueViewing: "Продолжить просмотр",
    torrserverStatus: "Статус TorrServer:",
    statusActive: "Работает",
    statusStopped: "Остановлен",
    restartTorrserver: "Перезапустить TorrServer",
    disableLampa: "Отключить",
    clearCache: "Удалить кэш",
    toastSuccess: "Успех",
    toastError: "Ошибка",
    toastRestarted: "TorrServer успешно перезапущен!",
    toastStopped: "Lampa и TorrServer успешно остановлены!",
    toastCacheCleared: "Кэш успешно очищен!",
    loadingText: "Загрузка...",
    restartingText: "Перезапуск..."
  },
  schinese: {
    title: "Lampa 管理",
    openLampa: "打开 Lampa",
    continueViewing: "继续观看",
    torrserverStatus: "TorrServer 状态:",
    statusActive: "正在运行",
    statusStopped: "已停止",
    restartTorrserver: "重启 TorrServer",
    disableLampa: "禁用 Lampa",
    clearCache: "清除缓存",
    toastSuccess: "成功",
    toastError: "错误",
    toastRestarted: "TorrServer 重启成功！",
    toastStopped: "Lampa 和 TorrServer 已成功停止！",
    toastCacheCleared: "缓存清除成功！",
    loadingText: "正在加载...",
    restartingText: "正在重启..."
  },
  tchinese: {
    title: "Lampa 管理",
    openLampa: "打開 Lampa",
    continueViewing: "繼續觀看",
    torrserverStatus: "TorrServer 狀態:",
    statusActive: "正在執行",
    statusStopped: "已停止",
    restartTorrserver: "重啟 TorrServer",
    disableLampa: "停用 Lampa",
    clearCache: "清除快取",
    toastSuccess: "成功",
    toastError: "錯誤",
    toastRestarted: "TorrServer 重啟成功！",
    toastStopped: "Lampa 和 TorrServer 已成功停止！",
    toastCacheCleared: "快取清除成功！",
    loadingText: "正在載入...",
    restartingText: "正在重啟..."
  },
  arabic: {
    title: "إدارة Lampa",
    openLampa: "فتح Lampa",
    continueViewing: "مواصلة المشاهدة",
    torrserverStatus: "حالة TorrServer:",
    statusActive: "يعمل",
    statusStopped: "متوقف",
    restartTorrserver: "إعادة تشغيل TorrServer",
    disableLampa: "تعطيل Lampa",
    clearCache: "مسح الذاكرة المؤقتة",
    toastSuccess: "نجاح",
    toastError: "خطأ",
    toastRestarted: "تم إعادة تشغيل TorrServer بنجاح!",
    toastStopped: "تم إيقاف Lampa و TorrServer بنجاح!",
    toastCacheCleared: "تم مسح الذاكرة المؤقتة بنجاح!",
    loadingText: "جاري التحميل...",
    restartingText: "جاري إعادة التشغيل..."
  },
  persian: {
    title: "مدیریت Lampa",
    openLampa: "باز کردن Lampa",
    continueViewing: "ادامه تماشا",
    torrserverStatus: "وضعیت TorrServer:",
    statusActive: "در حال اجرا",
    statusStopped: "متوقف شده",
    restartTorrserver: "راه‌اندازی مجدد TorrServer",
    disableLampa: "غیرفعال کردن Lampa",
    clearCache: "پاک کردن حافظه پنهان",
    toastSuccess: "موفقیت",
    toastError: "خطا",
    toastRestarted: "TorrServer با موفقیت راه‌اندازی مجدد شد!",
    toastStopped: "Lampa و TorrServer با موفقیت متوقف شدند!",
    toastCacheCleared: "حافظه پنهان با موفقیت پاک شد!",
    loadingText: "در حال بارگذاری...",
    restartingText: "در حال راه‌اندازی مجدد..."
  },
  turkish: {
    title: "Lampa Yönetimi",
    openLampa: "Lampa'yı Aç",
    continueViewing: "İzlemeye Devam Et",
    torrserverStatus: "TorrServer Durumu:",
    statusActive: "Çalışıyor",
    statusStopped: "Durduruldu",
    restartTorrserver: "TorrServer'ı Yeniden Başlat",
    disableLampa: "Devre Dışı Bırak",
    clearCache: "Önbelleği Temizle",
    toastSuccess: "Başarılı",
    toastError: "Hata",
    toastRestarted: "TorrServer başarıyla yeniden başlatıldı!",
    toastStopped: "Lampa ve TorrServer başarıyla durduruldu!",
    toastCacheCleared: "Önbellek başarıyla temizlendi!",
    loadingText: "Yükleniyor...",
    restartingText: "Yeniden başlatılıyor..."
  }
};

translations.farsi = translations.persian;

function Content() {
  const [lang, setLang] = useState<string>("english");
  const [status, setStatus] = useState(false);
  const [loading, setLoading] = useState(false);

  // Localization helper
  const t = useMemo(() => {
    return (key: TranslationKeys) => {
      const dict = translations[lang] || translations.english;
      return dict[key] || translations.english[key] || String(key);
    };
  }, [lang]);

  const checkStatus = async () => {
    try {
      const active = await getTorrserverStatus();
      const rawActive: any = active;
      setStatus(!!(rawActive?.result ?? rawActive));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // Detect Steam Language
    getSteamLanguage()
      .then((detectedLang) => {
        const normalized = detectedLang?.toLowerCase();
        if (translations[normalized]) {
          setLang(normalized);
        }
      })
      .catch(console.error);

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRestart = async () => {
    setLoading(true);
    try {
      await restartTorrserver();
      await checkStatus();
      toaster.toast({
        title: t("toastSuccess"),
        body: t("toastRestarted")
      });
    } catch (e) {
      console.error(e);
      toaster.toast({
        title: t("toastError"),
        body: String(e)
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLampa = async () => {
    try {
      Router.CloseSideMenus();
      Navigation.NavigateToExternalWeb("http://127.0.0.1:8000");
    } catch (e) {
      console.error(e);
      toaster.toast({
        title: t("toastError"),
        body: String(e)
      });
    }
  };

  const handleOpenLastLampa = async () => {
    try {
      Router.CloseSideMenus();
      const rawUrl = await getLastUrl();
      const url = (rawUrl as any)?.result ?? rawUrl ?? "http://127.0.0.1:8000";
      Navigation.NavigateToExternalWeb(url);
    } catch (e) {
      console.error(e);
      toaster.toast({
        title: t("toastError"),
        body: String(e)
      });
    }
  };

  const handleStopAll = async () => {
    setLoading(true);
    try {
      await stopAll();
      await checkStatus();
      toaster.toast({
        title: t("toastSuccess"),
        body: t("toastStopped")
      });
    } catch (e) {
      console.error(e);
      toaster.toast({
        title: t("toastError"),
        body: String(e)
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    setLoading(true);
    try {
      await clearCache();
      await checkStatus();
      toaster.toast({
        title: t("toastSuccess"),
        body: t("toastCacheCleared")
      });
    } catch (e) {
      console.error(e);
      toaster.toast({
        title: t("toastError"),
        body: String(e)
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <PanelSection title={t("title")}>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleOpenLampa}
        >
          {t("openLampa")}
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleOpenLastLampa}
        >
          {t("continueViewing")}
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
          <span>{t("torrserverStatus")}</span>
          <span style={{ 
            color: status ? "#10b981" : "#ef4444", 
            fontWeight: "bold",
            display: "flex",
            alignItems: "center"
          }}>
            <span style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              backgroundColor: status ? "#10b981" : "#ef4444",
              marginRight: "6px",
              display: "inline-block"
            }} />
            {status ? t("statusActive") : t("statusStopped")}
          </span>
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={loading}
          onClick={handleRestart}
        >
          {loading ? t("restartingText") : t("restartTorrserver")}
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={loading}
          onClick={handleStopAll}
        >
          {t("disableLampa")}
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={loading}
          onClick={handleClearCache}
        >
          {t("clearCache")}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}

export default definePlugin(() => {
  return {
    name: "Lampa Deck",
    titleView: <div className={staticClasses.Title}>Lampa Deck</div>,
    content: <Content />,
    icon: <FaFilm />,
    onDismount() {},
  };
});

