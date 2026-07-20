import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { Asset, LanguageChoice, ThemeChoice } from "../types";
import type { ToastMessage } from "./ToastRegion";
import {
  ConfirmLibraryEntityDeleteDialog,
  ConfirmTrashDialog,
  CreateEntityDialog,
  PreviewDialog,
  RenameDialog,
  SettingsDialog,
} from "./Dialogs";
import { ToastRegion } from "./ToastRegion";

export type LibraryDeleteTarget = { kind: "source" | "collection" | "tag"; id: string; name: string };

interface AppOverlaysProps {
  createKind: "tag" | "collection" | null;
  onCreateKindChange: (kind: "tag" | "collection" | null) => void;
  onCreateEntity: (name: string, color?: string) => void;
  trashTargetIds: string[];
  onTrashTargetIdsChange: (ids: string[]) => void;
  onConfirmTrash: () => void;
  libraryDeleteTarget?: LibraryDeleteTarget;
  libraryDeletePending: boolean;
  onLibraryDeleteTargetChange: (target?: LibraryDeleteTarget) => void;
  onConfirmLibraryDelete: () => void;
  renameAsset?: Asset;
  onRenameAssetChange: (asset?: Asset) => void;
  onRename: (asset: Asset, name: string) => void;
  previewAssets: Asset[];
  previewIndex: number;
  previewOpen: boolean;
  onPreviewOpenChange: (open: boolean) => void;
  onPreviewIndexChange: Dispatch<SetStateAction<number>>;
  onOpenExternal: (asset: Asset) => void;
  onPrepareVideo: (asset: Asset) => Promise<string>;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  theme: ThemeChoice;
  language: LanguageChoice;
  onThemeChange: (theme: ThemeChoice) => void;
  onLanguageChange: (language: LanguageChoice) => void;
  onBackup: () => void;
  onRestore: () => void;
  toasts: ToastMessage[];
}

export function AppOverlays({
  createKind,
  onCreateKindChange,
  onCreateEntity,
  trashTargetIds,
  onTrashTargetIdsChange,
  onConfirmTrash,
  libraryDeleteTarget,
  libraryDeletePending,
  onLibraryDeleteTargetChange,
  onConfirmLibraryDelete,
  renameAsset,
  onRenameAssetChange,
  onRename,
  previewAssets,
  previewIndex,
  previewOpen,
  onPreviewOpenChange,
  onPreviewIndexChange,
  onOpenExternal,
  onPrepareVideo,
  settingsOpen,
  onSettingsOpenChange,
  theme,
  language,
  onThemeChange,
  onLanguageChange,
  onBackup,
  onRestore,
  toasts,
}: AppOverlaysProps) {
  const { t } = useTranslation();

  return <>
    <CreateEntityDialog
      open={createKind !== null}
      kind={createKind ?? "tag"}
      onOpenChange={(open) => { if (!open) onCreateKindChange(null); }}
      onCreate={onCreateEntity}
    />
    <ConfirmTrashDialog
      open={trashTargetIds.length > 0}
      count={trashTargetIds.length}
      onOpenChange={(open) => { if (!open) onTrashTargetIdsChange([]); }}
      onConfirm={onConfirmTrash}
    />
    <ConfirmLibraryEntityDeleteDialog
      open={Boolean(libraryDeleteTarget)}
      title={libraryDeleteTarget?.kind === "source" ? t("deleteSourceConfirmTitle") : libraryDeleteTarget?.kind === "collection" ? t("deleteCollectionConfirmTitle") : t("deleteTagConfirmTitle")}
      body={libraryDeleteTarget?.kind === "source" ? t("deleteSourceConfirmBody", { name: libraryDeleteTarget.name }) : libraryDeleteTarget?.kind === "collection" ? t("deleteCollectionConfirmBody", { name: libraryDeleteTarget.name }) : t("deleteTagConfirmBody", { name: libraryDeleteTarget?.name ?? "" })}
      confirmLabel={libraryDeleteTarget?.kind === "source" ? t("removeSource") : libraryDeleteTarget?.kind === "collection" ? t("deleteCollection") : t("deleteTag")}
      pending={libraryDeletePending}
      onOpenChange={(open) => { if (!open && !libraryDeletePending) onLibraryDeleteTargetChange(); }}
      onConfirm={onConfirmLibraryDelete}
    />
    <RenameDialog
      asset={renameAsset}
      open={Boolean(renameAsset)}
      onOpenChange={(open) => { if (!open) onRenameAssetChange(); }}
      onRename={(name) => { if (renameAsset) onRename(renameAsset, name); }}
    />
    <PreviewDialog
      assets={previewAssets}
      index={previewIndex}
      open={previewOpen}
      onOpenChange={onPreviewOpenChange}
      onIndex={onPreviewIndexChange}
      onOpenExternal={onOpenExternal}
      onPrepareVideo={onPrepareVideo}
    />
    <SettingsDialog
      open={settingsOpen}
      onOpenChange={onSettingsOpenChange}
      theme={theme}
      language={language}
      onTheme={onThemeChange}
      onLanguage={onLanguageChange}
      onBackup={onBackup}
      onRestore={onRestore}
    />
    <ToastRegion messages={toasts} />
  </>;
}
