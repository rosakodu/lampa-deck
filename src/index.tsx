import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
  Router,
  Navigation
} from "@decky/ui";
import { callable, definePlugin, toaster } from "@decky/api";
import { useState, useEffect } from "react";
import { FaFilm } from "react-icons/fa";

// Python backend callables
const getTorrserverStatus = callable<[], boolean>("get_torrserver_status");
const restartTorrserver   = callable<[], boolean>("restart_torrserver");
const getLastUrl          = callable<[], string>("get_last_url");
const clearCache          = callable<[], boolean>("clear_cache");
const getSteamLanguage    = callable<[], string>("get_steam_language");

// Translations
const T: Record<string, Record<string, string>> = {
  english: {
    title:            "Lampa Deck",
    openLampa:        "Open Lampa",
    continueViewing:  "Continue Viewing",
    restartTorrserver:"Restart TorrServer",
    clearCache:       "Clear Cache",
    torrserverStatus: "TorrServer:",
    playerMode:       "Player:",
    playerModeVal:    "Built-in (Transcoded)",
    statusActive:     "Running",
    statusStopped:    "Stopped",
    success:          "Success",
    error:            "Error",
    restarted:        "TorrServer restarted!",
    cacheCleared:     "Cache cleared!",
    restarting:       "Restarting…",
    support:          "Support",
  },
  russian: {
    title:            "Lampa Deck",
    openLampa:        "Открыть Lampa",
    continueViewing:  "Продолжить просмотр",
    restartTorrserver:"Перезапустить TorrServer",
    clearCache:       "Очистить кэш",
    torrserverStatus: "TorrServer:",
    playerMode:       "Плеер:",
    playerModeVal:    "Встроенный (Транскодер)",
    statusActive:     "Работает",
    statusStopped:    "Остановлен",
    success:          "Успех",
    error:            "Ошибка",
    restarted:        "TorrServer перезапущен!",
    cacheCleared:     "Кэш очищен!",
    restarting:       "Перезапуск…",
    support:          "Поддержка",
  },
};

const getT = (lang: string) => T[lang] || T.english;

function StatusDot({ active }: { active: boolean }) {
  return (
    <span style={{
      display:         "inline-block",
      width:           8,
      height:          8,
      borderRadius:    "50%",
      backgroundColor: active ? "#10b981" : "#ef4444",
      marginRight:     6,
      verticalAlign:   "middle",
    }} />
  );
}

function Content() {
  const [lang,         setLang]         = useState("english");
  const [tsRunning,    setTsRunning]    = useState(false);
  const [loading,      setLoading]      = useState(false);

  const t = getT(lang);

  const refreshStatus = async () => {
    try {
      const raw: any = await getTorrserverStatus();
      setTsRunning(!!(raw?.result ?? raw));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    getSteamLanguage()
      .then((l: any) => { const lang = (l?.result ?? l ?? "").toLowerCase(); if (T[lang]) setLang(lang); })
      .catch(() => {});

    refreshStatus();
    const iv = setInterval(refreshStatus, 5000);
    return () => clearInterval(iv);
  }, []);

  const openLampa = () => {
    try { Router.CloseSideMenus(); Navigation.NavigateToExternalWeb("http://127.0.0.1:8300"); }
    catch (e) { toaster.toast({ title: t.error, body: String(e) }); }
  };

  const continueViewing = async () => {
    try {
      Router.CloseSideMenus();
      const raw: any = await getLastUrl();
      const url = (raw?.result ?? raw) || "http://127.0.0.1:8300";
      Navigation.NavigateToExternalWeb(url);
    } catch (e) { toaster.toast({ title: t.error, body: String(e) }); }
  };

  const openSupport = () => {
    try {
      Router.CloseSideMenus();
      Navigation.NavigateToExternalWeb("https://vk.ru/valvesteamdeck");
    } catch (e) { toaster.toast({ title: t.error, body: String(e) }); }
  };

  const handleRestart = async () => {
    setLoading(true);
    try {
      await restartTorrserver();
      await refreshStatus();
      toaster.toast({ title: t.success, body: t.restarted });
    } catch (e) {
      toaster.toast({ title: t.error, body: String(e) });
    } finally { setLoading(false); }
  };

  const handleClearCache = async () => {
    setLoading(true);
    try {
      await clearCache();
      await refreshStatus();
      toaster.toast({ title: t.success, body: t.cacheCleared });
    } catch (e) {
      toaster.toast({ title: t.error, body: String(e) });
    } finally { setLoading(false); }
  };

  return (
    <PanelSection title={t.title}>

      {/* Open Lampa */}
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={openLampa}>
          {t.openLampa}
        </ButtonItem>
      </PanelSectionRow>

      {/* Continue Viewing */}
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={continueViewing}>
          {t.continueViewing}
        </ButtonItem>
      </PanelSectionRow>

      {/* Restart TorrServer */}
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={loading} onClick={handleRestart}>
          {loading ? t.restarting : t.restartTorrserver}
        </ButtonItem>
      </PanelSectionRow>

      {/* Clear Cache */}
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={loading} onClick={handleClearCache}>
          {t.clearCache}
        </ButtonItem>
      </PanelSectionRow>

      {/* Support */}
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={openSupport}>
          {t.support}
        </ButtonItem>
      </PanelSectionRow>

      {/* Status indicators */}
      <PanelSectionRow>
        <div style={{ fontSize: 12, opacity: 0.75, padding: "6px 0 2px" }}>
          <div style={{ marginBottom: 4 }}>
            <StatusDot active={tsRunning} />
            <span>{t.torrserverStatus} </span>
            <span style={{ color: tsRunning ? "#10b981" : "#ef4444" }}>
              {tsRunning ? t.statusActive : t.statusStopped}
            </span>
          </div>
          <div>
            <StatusDot active={true} />
            <span>{t.playerMode} </span>
            <span style={{ color: "#10b981" }}>
              {t.playerModeVal}
            </span>
          </div>
        </div>
      </PanelSectionRow>

    </PanelSection>
  );
}

export default definePlugin(() => ({
  name:      "Lampa Deck",
  titleView: <div className={staticClasses.Title}>Lampa Deck</div>,
  content:   <Content />,
  icon:      <FaFilm />,
  onDismount() {},
}));
