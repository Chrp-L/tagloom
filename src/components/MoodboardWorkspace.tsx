import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { MoodboardExportScene, exportMoodboardPng } from "../features/moodboardExport/MoodboardExportScene";
import { useMoodboardAutosave } from "../hooks/useMoodboardAutosave";
import type { Asset, MoodboardDocument, MoodboardSummary } from "../types";
import { MoodboardCanvas } from "./moodboard/MoodboardCanvas";
import { MoodboardCreateDialog, MoodboardDeleteDialog, MoodboardRenameDialog } from "./moodboard/MoodboardDialogs";
import { MoodboardList } from "./moodboard/MoodboardList";
import "../styles/moodboard-workspace.css";

type BoardMode = "assets" | "moodboards";

interface Props {
  collectionId: string;
  collectionName: string;
  onModeChange: (mode: BoardMode) => void;
  onPreview: (asset: Asset) => void;
  onNotify: (message: string, tone?: "success" | "error") => void;
  onFlushReady?: (flush?: () => Promise<void>) => void;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function MoodboardWorkspace({ collectionId, collectionName, onModeChange, onPreview, onNotify, onFlushReady }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const exportRef = useRef<HTMLDivElement>(null);
  const [document, setDocument] = useState<MoodboardDocument>();
  const [history, setHistory] = useState<MoodboardDocument[]>([]);
  const [future, setFuture] = useState<MoodboardDocument[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameBoard, setRenameBoard] = useState<MoodboardSummary>();
  const [deleteBoard, setDeleteBoard] = useState<MoodboardSummary>();
  const [pending, setPending] = useState(false);
  const boards = useQuery({ queryKey: ["moodboards", collectionId], queryFn: () => api.listMoodboards(collectionId) });
  const collectionAssets = useQuery({ queryKey: ["moodboard-assets", collectionId], queryFn: () => api.listAssets({ collectionId, limit: 120, sort: "newest" }) });
  const libraryAssets = useQuery({ queryKey: ["moodboard-library-assets"], queryFn: () => api.listAssets({ limit: 120, sort: "newest" }), enabled: Boolean(document) });

  const invalidateBoards = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["moodboards", collectionId] });
  }, [collectionId, queryClient]);
  const setRevision = useCallback((revision: number) => setDocument((current) => current ? { ...current, revision } : current), []);
  const onSaveError = useCallback((error: Error, conflict: boolean) => onNotify(conflict ? t("moodboardConflict") : `${t("moodboardSaveError")} ${error.message}`, "error"), [onNotify, t]);
  const { status, flush } = useMoodboardAutosave({ document, enabled: Boolean(document), onSaved: setRevision, onError: onSaveError });

  const changeDocument = useCallback((next: MoodboardDocument) => {
    setDocument((current) => {
      if (current && current.id === next.id) {
        setHistory((items) => [...items, current].slice(-100));
        setFuture([]);
      }
      return next;
    });
  }, []);
  const undo = useCallback(() => {
    setHistory((items) => {
      const previous = items.at(-1);
      if (!previous) return items;
      setDocument((current) => { if (current) setFuture((next) => [...next, current]); return previous; });
      return items.slice(0, -1);
    });
  }, []);
  const redo = useCallback(() => {
    setFuture((items) => {
      const next = items.at(-1);
      if (!next) return items;
      setDocument((current) => { if (current) setHistory((previous) => [...previous, current]); return next; });
      return items.slice(0, -1);
    });
  }, []);

  const openBoard = useCallback(async (id: string) => {
    try {
      const next = await api.getMoodboard(id);
      setHistory([]); setFuture([]); setDocument(next);
    } catch (error) { onNotify(message(error), "error"); }
  }, [onNotify]);
  const closeBoard = useCallback(async () => {
    try { await flush(); } catch { return false; }
    setDocument(undefined); setHistory([]); setFuture([]); await invalidateBoards();
    return true;
  }, [flush, invalidateBoards]);
  const reloadBoard = useCallback(async () => { if (document) await openBoard(document.id); }, [document, openBoard]);
  const createBoard = useCallback(async (name: string) => {
    setPending(true);
    try {
      const next = await api.createMoodboard(collectionId, name);
      setCreateOpen(false); setHistory([]); setFuture([]); setDocument(next); await invalidateBoards();
    } catch (error) { onNotify(message(error), "error"); } finally { setPending(false); }
  }, [collectionId, invalidateBoards, onNotify]);
  const rename = useCallback(async (board: MoodboardSummary, name: string) => {
    setPending(true);
    try {
      await api.renameMoodboard(board.id, name);
      if (document?.id === board.id) {
        const updated = await api.getMoodboard(board.id);
        setDocument(updated); setHistory([]); setFuture([]);
      }
      setRenameBoard(undefined); await invalidateBoards();
    } catch (error) { onNotify(message(error), "error"); } finally { setPending(false); }
  }, [document, invalidateBoards, onNotify]);
  const remove = useCallback(async (board: MoodboardSummary) => {
    setPending(true);
    try {
      await api.deleteMoodboard(board.id);
      if (document?.id === board.id) { setDocument(undefined); setHistory([]); setFuture([]); }
      setDeleteBoard(undefined); await invalidateBoards();
    } catch (error) { onNotify(message(error), "error"); } finally { setPending(false); }
  }, [document?.id, invalidateBoards, onNotify]);
  const ensureAsset = useCallback(async (asset: Asset) => {
    if (collectionAssets.data?.items.some((item) => item.id === asset.id)) return;
    await api.setCollectionAssets(collectionId, [asset.id], true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["moodboard-assets", collectionId] }),
      queryClient.invalidateQueries({ queryKey: ["assets"] }),
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
    ]);
  }, [collectionAssets.data?.items, collectionId, queryClient]);
  const exportBoard = useCallback(async () => {
    if (!document || !exportRef.current) return;
    try {
      const written = await exportMoodboardPng(exportRef.current, document.name);
      if (written) onNotify(t("exportMoodboard"));
    } catch (error) { onNotify(message(error), "error"); }
  }, [document, onNotify, t]);
  const saveCopy = useCallback(async () => {
    if (!document) return;
    try {
      const copy = await api.createMoodboard(collectionId, `${document.name} copy`);
      const result = await api.saveMoodboard({ ...document, id: copy.id, name: copy.name, revision: copy.revision }, copy.revision);
      setDocument({ ...document, id: copy.id, name: copy.name, revision: result.revision });
      setHistory([]); setFuture([]); await invalidateBoards();
    } catch (error) { onNotify(message(error), "error"); }
  }, [collectionId, document, invalidateBoards, onNotify]);

  useEffect(() => {
    onFlushReady?.(flush);
    return () => onFlushReady?.(undefined);
  }, [flush, onFlushReady]);
  const currentAssets = collectionAssets.data?.items ?? [];
  const allAssets = libraryAssets.data?.items ?? currentAssets;
  return <section className="moodboardWorkspace">
    <header className="moodboardContextHeader">
      <div className="segmented moodboardModeSwitch" aria-label={t("collections")}><button className="tactile" onClick={() => { if (document) void closeBoard().then((closed) => { if (closed) onModeChange("assets"); }); else onModeChange("assets"); }}>{t("assetsMode")}</button><button className="tactile" aria-pressed>{t("moodboardsMode")}</button></div>
      {document && <button className="moodboardBackButton" type="button" onClick={() => void closeBoard()}><ArrowLeft size={15} />{t("moodboards")}</button>}
    </header>
    {document ? <>
      {status === "conflict" || status === "error" ? <div className="moodboardRecovery" role="alert"><AlertTriangle size={15} /><span>{status === "conflict" ? t("moodboardConflict") : t("moodboardSaveError")}</span><button type="button" onClick={() => void reloadBoard()}><RefreshCw size={14} />{t("reloadMoodboard")}</button>{status === "conflict" && <button type="button" onClick={() => void saveCopy()}>{t("save")}</button>}</div> : null}
      <MoodboardCanvas document={document} collectionAssets={currentAssets} allAssets={allAssets} saveState={status === "conflict" ? "error" : status} onChange={changeDocument} onPreviewAsset={onPreview} onEnsureAssetInCollection={ensureAsset} onUndo={undo} onRedo={redo} canUndo={history.length > 0} canRedo={future.length > 0} onExport={() => void exportBoard()} onBoardMenu={() => void closeBoard()} />
      <MoodboardExportScene ref={exportRef} document={document} assets={allAssets} />
    </> : <MoodboardList collectionName={collectionName} boards={boards.data ?? []} loading={boards.isLoading} error={boards.error ? message(boards.error) : undefined} onOpen={(id) => void openBoard(id)} onCreate={() => setCreateOpen(true)} onRename={setRenameBoard} onDelete={setDeleteBoard} labels={{ heading: t("moodboards"), create: t("newMoodboard"), open: t("openMoodboard"), rename: t("renameMoodboard"), delete: t("deleteMoodboard"), nodesCount: (count) => t("moodboardNodes", { count }), updated: (date) => t("moodboardUpdated", { date }), emptyTitle: t("moodboardEmptyTitle"), emptyDescription: t("moodboardEmptyDescription") }} />}
    <MoodboardCreateDialog open={createOpen} pending={pending} onOpenChange={setCreateOpen} onCreate={(name) => void createBoard(name)} labels={{ createTitle: t("newMoodboard"), name: t("name"), create: t("create"), cancel: t("cancel"), close: t("close") }} />
    <MoodboardRenameDialog open={Boolean(renameBoard)} board={renameBoard} pending={pending} onOpenChange={(open) => { if (!open) setRenameBoard(undefined); }} onRename={(board, name) => void rename(board, name)} labels={{ renameTitle: t("renameMoodboard"), name: t("name"), save: t("save"), cancel: t("cancel"), close: t("close") }} />
    <MoodboardDeleteDialog open={Boolean(deleteBoard)} board={deleteBoard} pending={pending} onOpenChange={(open) => { if (!open) setDeleteBoard(undefined); }} onDelete={(board) => void remove(board)} labels={{ deleteTitle: t("moodboardDeleteTitle"), deleteDescription: (name) => t("moodboardDeleteDescription", { name }), delete: t("deleteMoodboard"), cancel: t("cancel"), close: t("close") }} />
  </section>;
}
