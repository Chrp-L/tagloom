import * as Dialog from "@radix-ui/react-dialog";
import { DatabaseBackup, HardDrive, Languages, Sun, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LanguageChoice, ThemeChoice, VideoPreviewCacheStatus } from "../../types";

const GIB = 1024 ** 3;
const VIDEO_CACHE_LIMITS = [2, 5, 10, 20] as const;

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < GIB) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / GIB).toFixed(1)} GB`;
}

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  theme: ThemeChoice;
  language: LanguageChoice;
  onTheme: (value: ThemeChoice) => void;
  onLanguage: (value: LanguageChoice) => void;
  onBackup: () => void;
  onRestore: () => void;
  videoCacheStatus?: VideoPreviewCacheStatus;
  videoCacheLoading?: boolean;
  videoCacheUpdating?: boolean;
  onVideoCacheLimit?: (limitBytes: number) => void;
  onClearVideoCache?: () => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  theme,
  language,
  onTheme,
  onLanguage,
  onBackup,
  onRestore,
  videoCacheStatus,
  videoCacheLoading = false,
  videoCacheUpdating = false,
  onVideoCacheLimit,
  onClearVideoCache,
}: SettingsDialogProps) {
  const { t } = useTranslation();
  const videoCacheDisabled = videoCacheLoading || videoCacheUpdating || !videoCacheStatus;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialogOverlay" />
        <Dialog.Content className="dialogContent settingsDialog">
          <Dialog.Title>{t("settings")}</Dialog.Title>
          <Dialog.Description className="srOnly">Tagloom settings</Dialog.Description>

          <section className="settingsSection">
            <h3>{t("appearance")}</h3>
            <div className="settingRow">
              <span><Sun size={17} />{t("appearance")}</span>
              <div className="segmented textSegment">
                {(["system", "light", "dark"] as ThemeChoice[]).map((value) => (
                  <button key={value} className={theme === value ? "active" : ""} onClick={() => onTheme(value)}>
                    {value === "system" ? t("themeSystem") : value === "light" ? t("themeLight") : t("themeDark")}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settingsSection">
            <h3>{t("language")}</h3>
            <div className="settingRow">
              <span><Languages size={17} />{t("language")}</span>
              <div className="segmented textSegment">
                {(["system", "zh-CN", "en"] as LanguageChoice[]).map((value) => (
                  <button key={value} className={language === value ? "active" : ""} onClick={() => onLanguage(value)}>
                    {value === "system" ? t("languageSystem") : value === "zh-CN" ? t("chinese") : t("english")}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="settingsSection" aria-labelledby="video-cache-heading">
            <h3 id="video-cache-heading">{t("videoPreviewCache", { defaultValue: "Video preview cache" })}</h3>
            <div className="settingRow">
              <span><HardDrive size={17} />{t("videoCacheUsageLabel", { defaultValue: "Storage used" })}</span>
              <span aria-live="polite">
                {videoCacheLoading
                  ? t("videoCacheLoading", { defaultValue: "Loading cache status..." })
                  : videoCacheStatus
                    ? t("videoCacheUsage", { defaultValue: "{{size}} · {{count}} files", size: formatBytes(videoCacheStatus.usedBytes), count: videoCacheStatus.itemCount })
                    : t("videoCacheUnavailable", { defaultValue: "Cache status unavailable" })}
              </span>
            </div>
            {videoCacheStatus && videoCacheStatus.pendingCleanupBytes > 0 ? (
              <p role="status">
                {t("videoCachePendingCleanup", { defaultValue: "{{size}} queued for cleanup", size: formatBytes(videoCacheStatus.pendingCleanupBytes) })}
              </p>
            ) : null}
            <div className="settingRow">
              <span>{t("videoCacheLimit", { defaultValue: "Cache limit" })}</span>
              <div className="segmented textSegment" aria-label={t("videoCacheLimit", { defaultValue: "Cache limit" })}>
                {VIDEO_CACHE_LIMITS.map((limit) => {
                  const limitBytes = limit * GIB;
                  return (
                    <button
                      key={limit}
                      className={videoCacheStatus?.limitBytes === limitBytes ? "active" : ""}
                      aria-pressed={videoCacheStatus?.limitBytes === limitBytes}
                      disabled={videoCacheDisabled || !onVideoCacheLimit}
                      onClick={() => onVideoCacheLimit?.(limitBytes)}
                    >
                      {limit} GB
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="settingsButtons">
              <button
                disabled={videoCacheDisabled || !onClearVideoCache || videoCacheStatus?.usedBytes === 0}
                onClick={onClearVideoCache}
              >
                <Trash2 size={16} />{t("clearVideoCache", { defaultValue: "Clear video cache" })}
              </button>
            </div>
          </section>

          <section className="settingsSection">
            <h3>{t("data")}</h3>
            <div className="settingsButtons">
              <button onClick={onBackup}><DatabaseBackup size={16} />{t("createBackup")}</button>
              <button onClick={onRestore}>{t("restoreBackup")}</button>
            </div>
          </section>

          <Dialog.Close asChild>
            <button className="dialogClose"><X size={17} /></button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
