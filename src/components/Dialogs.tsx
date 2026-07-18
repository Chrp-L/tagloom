import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronLeft, ChevronRight, DatabaseBackup, ExternalLink, ImageOff, Languages, Sun, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { mediaUrl } from "../api";
import type { Asset, LanguageChoice, ThemeChoice } from "../types";
import { previewMediaVariants, VideoPreview } from "./VideoPreview";
import type { PreviewDirection } from "./VideoPreview";

export const TAG_COLORS = ["#ee6859", "#3f8f74", "#d4a43d", "#5589a6", "#9b6ca4", "#66736d"];

export function previewDirectionForIndices(previous: number, next: number): PreviewDirection {
  return next < previous ? -1 : 1;
}

export function CreateEntityDialog({ open, kind, onOpenChange, onCreate }: { open: boolean; kind: "tag" | "collection"; onOpenChange: (open: boolean) => void; onCreate: (name: string, color?: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [color, setColor] = useState(TAG_COLORS[0]);
  useEffect(() => { if (open) { setName(""); setColor(TAG_COLORS[0]); } }, [open]);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialogOverlay" /><Dialog.Content className="dialogContent smallDialog">
    <Dialog.Title>{kind === "tag" ? t("newTag") : t("newCollection")}</Dialog.Title><Dialog.Description className="srOnly">{t("name")}</Dialog.Description>
    <label className="formField"><span>{t("name")}</span><input autoFocus value={name} maxLength={kind === "tag" ? 40 : 80} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && name.trim()) { onCreate(name.trim(), color); onOpenChange(false); } }} /></label>
    {kind === "tag" && <fieldset className="colorField"><legend>{t("color")}</legend>{TAG_COLORS.map((value) => <button key={value} className={color === value ? "active" : ""} style={{ background: value }} onClick={() => setColor(value)} aria-label={value}>{color === value && <Check size={14} />}</button>)}</fieldset>}
    <div className="dialogActions"><Dialog.Close asChild><button className="secondaryButton">{t("cancel")}</button></Dialog.Close><button className="primaryButton" disabled={!name.trim()} onClick={() => { onCreate(name.trim(), color); onOpenChange(false); }}>{t("create")}</button></div>
    <Dialog.Close asChild><button className="dialogClose" aria-label={t("close")}><X size={17} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function ConfirmTrashDialog({ open, count, onOpenChange, onConfirm }: { open: boolean; count: number; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialogOverlay" /><Dialog.Content className="dialogContent smallDialog">
    <Dialog.Title>{t("deleteConfirmTitle")}</Dialog.Title><Dialog.Description>{t("deleteConfirmBody")} {count > 1 ? t("items", { count }) : ""}</Dialog.Description>
    <div className="dialogActions"><Dialog.Close asChild><button className="secondaryButton">{t("cancel")}</button></Dialog.Close><button className="dangerButton" onClick={() => { onConfirm(); onOpenChange(false); }}>{t("confirmTrash")}</button></div>
    <Dialog.Close asChild><button className="dialogClose"><X size={17} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function ConfirmLibraryEntityDeleteDialog({ open, title, body, confirmLabel, pending, onOpenChange, onConfirm }: { open: boolean; title: string; body: string; confirmLabel: string; pending: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  const { t } = useTranslation();
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialogOverlay" /><Dialog.Content className="dialogContent smallDialog">
    <Dialog.Title>{title}</Dialog.Title><Dialog.Description>{body}</Dialog.Description>
    <div className="dialogActions"><Dialog.Close asChild><button className="secondaryButton" disabled={pending}>{t("cancel")}</button></Dialog.Close><button className="dangerButton" disabled={pending} onClick={onConfirm}>{pending ? t("deleting") : confirmLabel}</button></div>
    <Dialog.Close asChild><button className="dialogClose" disabled={pending} aria-label={t("close")}><X size={17} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function RenameDialog({ asset, open, onOpenChange, onRename }: { asset?: Asset; open: boolean; onOpenChange: (open: boolean) => void; onRename: (name: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  useEffect(() => setName(asset?.filename ?? ""), [asset]);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialogOverlay" /><Dialog.Content className="dialogContent smallDialog">
    <Dialog.Title>{t("renameTitle")}</Dialog.Title><Dialog.Description className="srOnly">{t("filenameLabel")}</Dialog.Description>
    <label className="formField"><span>{t("filenameLabel")}</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
    <div className="dialogActions"><Dialog.Close asChild><button className="secondaryButton">{t("cancel")}</button></Dialog.Close><button className="primaryButton" disabled={!name.trim() || name === asset?.filename} onClick={() => { onRename(name.trim()); onOpenChange(false); }}>{t("save")}</button></div>
    <Dialog.Close asChild><button className="dialogClose"><X size={17} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function PreviewDialog({ assets, index, open, onOpenChange, onIndex, onOpenExternal, onPrepareVideo }: { assets: Asset[]; index: number; open: boolean; onOpenChange: (open: boolean) => void; onIndex: (index: number) => void; onOpenExternal: (asset: Asset) => void; onPrepareVideo: (asset: Asset) => Promise<string> }) {
  const { t } = useTranslation();
  const asset = assets[index];
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [direction, setDirection] = useState<PreviewDirection>(1);
  const changeIndex = useCallback((next: number) => {
    const bounded = Math.max(0, Math.min(assets.length - 1, next));
    if (bounded === index) return;
    setDirection(previewDirectionForIndices(index, bounded));
    onIndex(bounded);
  }, [assets.length, index, onIndex]);
  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => { if (event.target instanceof HTMLInputElement) return; if (event.key === "ArrowLeft") changeIndex(index - 1); if (event.key === "ArrowRight") changeIndex(index + 1); };
    window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener);
  }, [changeIndex, index, open]);
  if (!asset) return null;
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="previewOverlay" /><Dialog.Content className="previewContent" aria-describedby={undefined}>
    <Dialog.Title className="previewTitle">{asset.filename}</Dialog.Title>
    <button className="previewNav previous" disabled={index <= 0} aria-label={t("previousItem")} title={t("previousItem")} onClick={() => changeIndex(index - 1)}><ChevronLeft size={28} /></button>
    <button className="previewNav next" disabled={index >= assets.length - 1} aria-label={t("nextItem")} title={t("nextItem")} onClick={() => changeIndex(index + 1)}><ChevronRight size={28} /></button>
    <AnimatePresence mode="wait" custom={direction}>{asset.mediaKind === "video"
      ? <VideoPreview key={asset.id} asset={asset} index={index} count={assets.length} direction={direction} volume={volume} muted={muted} onVolume={setVolume} onMuted={setMuted} onPrepareVideo={onPrepareVideo} onOpenExternal={onOpenExternal} />
      : <motion.div key={asset.id} className="previewMediaLayout" custom={direction} variants={previewMediaVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}><div className="previewStage">{asset.thumbnailPath ? <img src={mediaUrl(asset.path) || mediaUrl(asset.thumbnailPath)} onError={(event) => { event.currentTarget.src = mediaUrl(asset.thumbnailPath) || ""; }} alt={asset.filename} /> : <ImageOff size={34} />}</div><div className="previewControls"><span>{index + 1} / {assets.length}</span><button className="previewExternal tactile" onClick={() => onOpenExternal(asset)}><ExternalLink size={16} />{t("openExternal")}</button></div></motion.div>}
    </AnimatePresence>
    <Dialog.Close asChild><button className="previewClose" aria-label={t("close")}><X size={20} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

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
