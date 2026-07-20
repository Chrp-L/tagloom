import * as Dialog from "@radix-ui/react-dialog";
import { DatabaseBackup, Languages, Sun, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LanguageChoice, ThemeChoice } from "../../types";

export function SettingsDialog({ open, onOpenChange, theme, language, onTheme, onLanguage, onBackup, onRestore }: { open: boolean; onOpenChange: (open: boolean) => void; theme: ThemeChoice; language: LanguageChoice; onTheme: (value: ThemeChoice) => void; onLanguage: (value: LanguageChoice) => void; onBackup: () => void; onRestore: () => void }) {
  const { t } = useTranslation();
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialogOverlay" /><Dialog.Content className="dialogContent settingsDialog">
    <Dialog.Title>{t("settings")}</Dialog.Title><Dialog.Description className="srOnly">Tagloom settings</Dialog.Description>
    <section className="settingsSection"><h3>{t("appearance")}</h3><div className="settingRow"><span><Sun size={17} />{t("appearance")}</span><div className="segmented textSegment">{(["system", "light", "dark"] as ThemeChoice[]).map((value) => <button key={value} className={theme === value ? "active" : ""} onClick={() => onTheme(value)}>{value === "system" ? t("themeSystem") : value === "light" ? t("themeLight") : t("themeDark")}</button>)}</div></div></section>
    <section className="settingsSection"><h3>{t("language")}</h3><div className="settingRow"><span><Languages size={17} />{t("language")}</span><div className="segmented textSegment">{(["system", "zh-CN", "en"] as LanguageChoice[]).map((value) => <button key={value} className={language === value ? "active" : ""} onClick={() => onLanguage(value)}>{value === "system" ? t("languageSystem") : value === "zh-CN" ? t("chinese") : t("english")}</button>)}</div></div></section>
    <section className="settingsSection"><h3>{t("data")}</h3><div className="settingsButtons"><button onClick={onBackup}><DatabaseBackup size={16} />{t("createBackup")}</button><button onClick={onRestore}>{t("restoreBackup")}</button></div></section>
    <Dialog.Close asChild><button className="dialogClose"><X size={17} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
