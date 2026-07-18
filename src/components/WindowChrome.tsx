import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function WindowChrome() {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);
  const applyMaximized = (value: boolean) => {
    setMaximized(value);
    document.documentElement.classList.toggle("windowMaximized", value);
  };
  useEffect(() => {
    if (!isTauri()) return;
    const current = getCurrentWindow();
    const sync = () => void current.isMaximized().then(applyMaximized);
    sync();
    window.addEventListener("resize", sync);
    return () => { window.removeEventListener("resize", sync); document.documentElement.classList.remove("windowMaximized"); };
  }, []);
  const action = async (kind: "minimize" | "maximize" | "close") => {
    if (!isTauri()) return;
    const current = getCurrentWindow();
    if (kind === "minimize") await current.minimize();
    if (kind === "maximize") { await current.toggleMaximize(); applyMaximized(await current.isMaximized()); }
    if (kind === "close") await current.close();
  };
  return <div className="windowChrome" aria-label={t("windowControls")}>
    <button aria-label={t("minimizeWindow")} title={t("minimizeWindow")} onClick={() => void action("minimize")}><Minus size={15} /></button>
    <button aria-label={maximized ? t("restoreWindow") : t("maximizeWindow")} title={maximized ? t("restoreWindow") : t("maximizeWindow")} onClick={() => void action("maximize")}>{maximized ? <Copy size={13} /> : <Square size={13} />}</button>
    <button className="windowClose" aria-label={t("closeWindow")} title={t("closeWindow")} onClick={() => void action("close")}><X size={16} /></button>
  </div>;
}
