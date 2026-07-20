import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { mediaUrl } from "../../api";
import type { Asset } from "../../types";
import { previewMediaVariants, VideoPreview } from "../VideoPreview";
import type { PreviewDirection } from "../VideoPreview";

export function previewDirectionForIndices(previous: number, next: number): PreviewDirection {
  return next < previous ? -1 : 1;
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
