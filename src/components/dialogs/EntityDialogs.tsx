import * as Dialog from "@radix-ui/react-dialog";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Asset } from "../../types";

export const TAG_COLORS = ["#ee6859", "#3f8f74", "#d4a43d", "#5589a6", "#9b6ca4", "#66736d"];

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
