import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { MoodboardSummary } from "../../types";
import "../../styles/moodboard-list.css";

export interface MoodboardDialogLabels {
  createTitle: string;
  renameTitle: string;
  deleteTitle: string;
  deleteDescription: (name: string) => string;
  name: string;
  cancel: string;
  create: string;
  save: string;
  delete: string;
  close: string;
}

export const defaultMoodboardDialogLabels: MoodboardDialogLabels = {
  createTitle: "New moodboard",
  renameTitle: "Rename moodboard",
  deleteTitle: "Delete moodboard?",
  deleteDescription: (name) => `“${name}” and its canvas layout will be removed. Original assets will remain unchanged.`,
  name: "Name",
  cancel: "Cancel",
  create: "Create",
  save: "Save",
  delete: "Delete",
  close: "Close",
};

interface DialogBaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  labels?: Partial<MoodboardDialogLabels>;
}

interface MoodboardCreateDialogProps extends DialogBaseProps {
  onCreate: (name: string) => void;
}

interface MoodboardRenameDialogProps extends DialogBaseProps {
  board?: MoodboardSummary;
  onRename: (board: MoodboardSummary, name: string) => void;
}

interface MoodboardDeleteDialogProps extends DialogBaseProps {
  board?: MoodboardSummary;
  onDelete: (board: MoodboardSummary) => void;
}

function labelsFor(labels?: Partial<MoodboardDialogLabels>): MoodboardDialogLabels {
  return { ...defaultMoodboardDialogLabels, ...labels };
}

function MoodboardNameDialog({ open, onOpenChange, pending = false, initialName, title, submitLabel, onSubmit, labels }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending?: boolean;
  initialName: string;
  title: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  labels: MoodboardDialogLabels;
}) {
  const [name, setName] = useState(initialName);
  useEffect(() => { if (open) setName(initialName); }, [initialName, open]);
  const cleanName = name.trim();
  const unchanged = cleanName === initialName.trim();
  const submit = () => {
    if (!cleanName || pending || unchanged) return;
    onSubmit(cleanName);
  };

  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialogOverlay" /><Dialog.Content className="dialogContent smallDialog moodboardDialog">
    <Dialog.Title>{title}</Dialog.Title><Dialog.Description className="srOnly">{labels.name}</Dialog.Description>
    <label className="formField"><span>{labels.name}</span><input autoFocus value={name} maxLength={80} disabled={pending} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") submit(); }} /></label>
    <div className="dialogActions"><Dialog.Close asChild><button type="button" className="secondaryButton" disabled={pending}>{labels.cancel}</button></Dialog.Close><button type="button" className="primaryButton" disabled={!cleanName || pending || unchanged} onClick={submit}>{submitLabel}</button></div>
    <Dialog.Close asChild><button type="button" className="dialogClose" aria-label={labels.close} disabled={pending}><X size={17} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function MoodboardCreateDialog({ open, onOpenChange, onCreate, pending, labels: labelsOverride }: MoodboardCreateDialogProps) {
  const labels = labelsFor(labelsOverride);
  return <MoodboardNameDialog open={open} onOpenChange={onOpenChange} pending={pending} initialName="" title={labels.createTitle} submitLabel={labels.create} labels={labels} onSubmit={onCreate} />;
}

export function MoodboardRenameDialog({ board, open, onOpenChange, onRename, pending, labels: labelsOverride }: MoodboardRenameDialogProps) {
  const labels = labelsFor(labelsOverride);
  return <MoodboardNameDialog open={open} onOpenChange={onOpenChange} pending={pending} initialName={board?.name ?? ""} title={labels.renameTitle} submitLabel={labels.save} labels={labels} onSubmit={(name) => { if (board) onRename(board, name); }} />;
}

export function MoodboardDeleteDialog({ board, open, onOpenChange, onDelete, pending = false, labels: labelsOverride }: MoodboardDeleteDialogProps) {
  const labels = labelsFor(labelsOverride);
  const confirm = () => { if (board && !pending) onDelete(board); };
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialogOverlay" /><Dialog.Content className="dialogContent smallDialog moodboardDialog">
    <Dialog.Title>{labels.deleteTitle}</Dialog.Title><Dialog.Description>{board ? labels.deleteDescription(board.name) : ""}</Dialog.Description>
    <div className="dialogActions"><Dialog.Close asChild><button type="button" className="secondaryButton" disabled={pending}>{labels.cancel}</button></Dialog.Close><button type="button" className="dangerButton" disabled={!board || pending} onClick={confirm}>{labels.delete}</button></div>
    <Dialog.Close asChild><button type="button" className="dialogClose" aria-label={labels.close} disabled={pending}><X size={17} /></button></Dialog.Close>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
