import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses
} from "@decky/ui";
import {
  callable,
  definePlugin,
  toaster
} from "@decky/api";
import { useState, useEffect } from "react";
import { FaFilm } from "react-icons/fa";

// Python backend callables
const getTorrserverStatus = callable<[], boolean>("get_torrserver_status");
const restartTorrserver = callable<[], boolean>("restart_torrserver");
const openLampa = callable<[], boolean>("open_lampa");

function Content() {
  const [status, setStatus] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkStatus = async () => {
    try {
      const active = await getTorrserverStatus();
      setStatus(active);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
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
        title: "Lampa Deck",
        body: "TorrServer успешно перезапущен!"
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenLampa = async () => {
    try {
      await openLampa();
      toaster.toast({
        title: "Lampa Deck",
        body: "Запуск Lampa во встроенном браузере..."
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <PanelSection title="Управление Lampa">
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          onClick={handleOpenLampa}
        >
          Открыть Lampa
        </ButtonItem>
      </PanelSectionRow>

      <PanelSectionRow>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
          <span>Статус TorrServer:</span>
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
            {status ? "Работает" : "Остановлен"}
          </span>
        </div>
      </PanelSectionRow>

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={loading}
          onClick={handleRestart}
        >
          {loading ? "Перезапуск..." : "Перезапустить TorrServer"}
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}

export default definePlugin(() => {
  console.log("Lampa Decky Plugin initializing...");

  return {
    name: "Lampa Deck",
    titleView: <div className={staticClasses.Title}>Lampa Deck</div>,
    content: <Content />,
    icon: <FaFilm />,
    onDismount() {
      console.log("Lampa Decky Plugin unloading...");
    },
  };
});
