import { ExternalLink, FileImage, FolderInput, FolderSearch, ListChecks, Pencil, Save, Tag as TagIcon, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { mediaUrl } from "../api";
import type { SelectionMode } from "../features/selection/selectionModel";
import { formatBytes, formatDate, formatDuration } from "../lib/format";
import { isInteractiveWindowTarget, toggleCurrentWindowMaximize } from "../lib/windowControls";
import type { Asset, Collection, SourceRoot, Tag } from "../types";

interface Props {
  selectionMode: SelectionMode;
  focusedAsset?: Asset;
  checkedAssets: Asset[];
  tags: Tag[];
  collections: Collection[];
  sources: SourceRoot[];
  onSetTag: (tagId: string, attached: boolean) => void;
  onAddCollection: (collectionId: string) => void;
  onSaveNote: (assetId: string, note: string) => void;
  onRename: (asset: Asset) => void;
  onMove: (asset: Asset) => void;
  onTrash: () => void;
  onReveal: (asset: Asset) => void;
  onOpen: (asset: Asset) => void;
}

export function Inspector({ selectionMode, focusedAsset, checkedAssets, tags, collections, sources, ...actions }: Props) {
  const { t } = useTranslation();
  const batchMode = selectionMode === "batch";
  const activeAssets = batchMode ? checkedAssets : focusedAsset ? [focusedAsset] : [];
  const asset = activeAssets[0];
  const detailAsset = batchMode ? undefined : focusedAsset;
  const [note, setNote] = useState("");
  useEffect(() => setNote(detailAsset?.note ?? ""), [detailAsset?.id, detailAsset?.note]);

  if (!asset) return <aside className="inspector emptyInspector" data-tauri-drag-region onDoubleClick={(event) => { if (!isInteractiveWindowTarget(event.target)) void toggleCurrentWindowMaximize(); }}><motion.div key={batchMode ? "empty-batch" : "empty-browse"} className="emptyInspectorContent" data-tauri-drag-region initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}><div className="inspectorThread" />{batchMode ? <ListChecks size={22} /> : <TagIcon size={22} />}<h2 data-tauri-drag-region>{batchMode ? t("selected", { count: 0 }) : t("details")}</h2><p data-tauri-drag-region>{batchMode ? t("batchSelectionHint") : t("emptyBody")}</p></motion.div></aside>;

  const commonTagIds = tags.filter((tag) => activeAssets.every((item) => item.tags.some((assetTag) => assetTag.id === tag.id))).map((tag) => tag.id);
  const contentKey = batchMode ? `batch:${checkedAssets.map((item) => item.id).join(",")}` : `focus:${asset.id}`;
  const source = sources.find((item) => item.id === asset.sourceId);
  const collectionPicker = collections.length > 0 && <section className="inspectorSection"><h3>{t("collections")}</h3><div className="collectionPicker">{collections.map((collection) => <button key={collection.id} onClick={() => actions.onAddCollection(collection.id)}><FolderInput size={14} />{collection.name}</button>)}</div></section>;

  return (
    <aside className="inspector">
      <AnimatePresence mode="wait" initial={false}><motion.div key={contentKey} className="inspectorContent" initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}>
        <div className="inspectorHeader" data-tauri-drag-region onDoubleClick={(event) => { if (!isInteractiveWindowTarget(event.target)) void toggleCurrentWindowMaximize(); }}><h2 data-tauri-drag-region>{batchMode ? t("selected", { count: checkedAssets.length }) : t("details")}</h2></div>
        {!batchMode && <>
          <div className="inspectorPreview">{asset.thumbnailPath ? <img src={mediaUrl(asset.thumbnailPath)} alt="" /> : <FileImage size={28} />}</div>
          <div className="assetIdentity"><strong>{asset.filename}</strong><span className="assetSource">{source?.name ?? "—"}</span></div>
          <section className="inspectorSection noteSection"><div className="sectionHeading"><h3>{t("savedReason")}</h3><button className="iconButton tiny" title={t("save")} disabled={note === asset.note} onClick={() => actions.onSaveNote(asset.id, note)}><Save size={14} /></button></div><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} /></section>
          {collectionPicker}
        </>}
        <section className="inspectorSection">
          <h3>{t("tags")}</h3>
          <div className="tagPicker">{tags.map((tag) => { const on = commonTagIds.includes(tag.id); return <button key={tag.id} className={on ? "active" : ""} onClick={() => actions.onSetTag(tag.id, !on)}><i style={{ background: tag.color }} />{tag.name}{on && <span>✓</span>}</button>; })}</div>
        </section>
        {batchMode && collectionPicker}
        {!batchMode && <details className="inspectorSection fileInformation">
          <summary>{t("fileInformation")}</summary>
          <div className="metadataGrid"><dl>
            <div><dt>{t("type")}</dt><dd>{asset.extension.toUpperCase()}</dd></div>
            <div><dt>{t("size")}</dt><dd>{formatBytes(asset.byteSize)}</dd></div>
            <div><dt>{t("dimensions")}</dt><dd>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : "—"}</dd></div>
            {asset.mediaKind === "video" && <div><dt>{t("duration")}</dt><dd>{formatDuration(asset.durationMs)}</dd></div>}
            <div className="wide"><dt>{t("modified")}</dt><dd>{formatDate(asset.modifiedAt)}</dd></div>
            <div className="wide filePath"><dt>{t("path")}</dt><dd title={asset.path}>{asset.path}</dd></div>
          </dl></div>
        </details>}
        <section className="inspectorActions">
          {!batchMode && <><button onClick={() => actions.onRename(asset)}><Pencil size={15} />{t("rename")}</button><button onClick={() => actions.onMove(asset)}><FolderInput size={15} />{t("move")}</button><button onClick={() => actions.onReveal(asset)}><FolderSearch size={15} />{t("reveal")}</button><button onClick={() => actions.onOpen(asset)}><ExternalLink size={15} />{t("openExternal")}</button></>}
          <button className="danger" onClick={actions.onTrash}><Trash2 size={15} />{t("trash")}</button>
        </section>
      </motion.div></AnimatePresence>
    </aside>
  );
}
