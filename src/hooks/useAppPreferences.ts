import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import i18n from "../i18n";
import { useUiStore } from "../store";
import type { LanguageChoice, ThemeChoice } from "../types";

const LANGUAGE_CHOICE_KEY = "tagloom-language-choice";

export function useAppPreferences() {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const [language, setLanguage] = useState<LanguageChoice>(() => (localStorage.getItem(LANGUAGE_CHOICE_KEY) as LanguageChoice) || "system");

  const changeTheme = useCallback((value: ThemeChoice) => {
    setTheme(value);
    void api.setSetting("theme", value);
  }, [setTheme]);

  const changeLanguage = useCallback((value: LanguageChoice) => {
    setLanguage(value);
    localStorage.setItem(LANGUAGE_CHOICE_KEY, value);
    const resolved = value === "system"
      ? (navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en")
      : value;
    localStorage.setItem("tagloom-language", resolved);
    void i18n.changeLanguage(resolved);
    void api.setSetting("language", value);
  }, []);

  useEffect(() => {
    const applyTheme = () => {
      const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    applyTheme();
    const media = matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  return { theme, language, changeTheme, changeLanguage };
}
