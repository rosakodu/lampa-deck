import {
  ButtonItem,
  PanelSection,
  PanelSectionRow,
  staticClasses,
  Router,
  Navigation,
  Focusable,
  findModuleChild,
  findClassModule
} from "@decky/ui";
import {
  callable,
  definePlugin,
  toaster,
  routerHook
} from "@decky/api";
import { useState, useEffect } from "react";
import { FaFilm } from "react-icons/fa";

// Python backend callables
const getTorrserverStatus = callable<[], boolean>("get_torrserver_status");
const restartTorrserver = callable<[], boolean>("restart_torrserver");

// Find Steam's internal BrowserContainer component
const BrowserContainer = findModuleChild((mod) => {
  if (typeof mod !== 'object')
    return undefined;
  for (let prop in mod) {
    if (typeof mod[prop] === 'function') {
      const f = mod[prop].toString();
      if (f.includes('displayURLBar') && f.includes('BExternalTriggeredLoad()'))
        return mod[prop];
    }
  }
});

// Find Steam's internal browser classes for styling
const browserClasses = (findClassModule((m) => !!m['MainBrowserContainer']) || {}) as Record<string, string>;

function LampaBrowser() {
  const [browser, setBrowser] = useState<any>(null);

  useEffect(() => {
    const windowRouter = Router.WindowStore?.GamepadUIMainWindowInstance;
    if (!windowRouter) {
      console.error("LampaBrowser: GamepadUIMainWindowInstance not found!");
      return;
    }

    console.log("LampaBrowser: Creating BrowserView...");
    const newBrowser = (windowRouter as any).CreateBrowserView("LampaBrowserView");
    if (newBrowser) {
      newBrowser.LoadURL("http://127.0.0.1:8000");
      setBrowser(newBrowser);
    }

    return () => {
      if (newBrowser) {
        console.log("LampaBrowser: Destroying BrowserView...");
        try {
          newBrowser.m_browserView?.SetFocus(false);
        } catch (e) {
          console.error("LampaBrowser: Failed to unfocus browser view", e);
        }
        setTimeout(() => {
          try {
            newBrowser.Destroy();
          } catch (e) {
            console.error("LampaBrowser: Failed to destroy browser view", e);
          }
        }, 200);
      }
    };
  }, []);

  if (!BrowserContainer) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", width: "100%", color: "red", padding: "20px", textAlign: "center" }}>
        <span>Ошибка: Не удалось инициализировать встроенный браузер Steam.</span>
      </div>
    );
  }

  if (!browser) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", width: "100%", color: "white" }}>
        <span>Загрузка Lampa...</span>
      </div>
    );
  }

  const focusableActionProps = {
    onCancelButton: () => {
      Navigation.NavigateBack();
    },
    onCancelActionDescription: "Назад"
  };

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Focusable
        className="focus-container"
        noFocusRing={true}
        onGamepadFocus={async (evt: any) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          evt.detail.focusedNode?.BChildTakeFocus();
        }}
        {...focusableActionProps}
      >
        <BrowserContainer
          browser={browser}
          className={browserClasses.ExternalBrowserContainer || "ExternalBrowserContainer"}
          visible={true}
          hideForModals={true}
          external={true}
          displayURLBar={false}
          autoFocus={true}
        />
      </Focusable>
    </div>
  );
}

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

  const handleOpenLampa = () => {
    try {
      Router.CloseSideMenus();
      Navigation.Navigate("/lampa-browser");
      toaster.toast({
        title: "Lampa Deck",
        body: "Запуск Lampa во встроенном браузере..."
      });
    } catch (e) {
      console.error(e);
      toaster.toast({
        title: "Lampa Deck",
        body: "Ошибка запуска во встроенном браузере."
      });
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

  routerHook.addRoute("/lampa-browser", LampaBrowser);

  return {
    name: "Lampa Deck",
    titleView: <div className={staticClasses.Title}>Lampa Deck</div>,
    content: <Content />,
    icon: <FaFilm />,
    onDismount() {
      console.log("Lampa Decky Plugin unloading...");
      routerHook.removeRoute("/lampa-browser");
    },
  };
});

