import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import { MoodboardExportScene, exportMoodboardPng } from "../features/moodboardExport/MoodboardExportScene";
import { useMoodboardAutosave } from "../hooks/useMoodboardAutosave";
import type { Asset, Collection, MoodboardDocument, MoodboardSummary } from "../types";
import { MoodboardCanvas } from "./moodboard/MoodboardCanvas";
import { MoodboardCreateDialog, MoodboardDeleteDialog, MoodboardRenameDialog } from "./moodboard/MoodboardDialogs";
import { MoodboardList, type MoodboardListItem } from "./moodboard/MoodboardList";
import "../styles/moodboard-workspace.css";

interface Props {
  collectionId?: string;
  collectionName?: string;
  collections?: Collection[];
  onPreview: (asset: Asset) => void;
  onNotify: (message: string, tone?: "success" | "error") => void;
  onFlushReady?: (flush?: () => Promise<void>) => void;
}

type MoodboardService = {
  listMoodboards: (filter?: { collectionId?: string }) => Promise<MoodboardListItem[]>;
  createMoodboard: (input: { name?: string; collectionIds?: string[] }) => Promise<MoodboardDocument>;
  setMoodboardContexts: (id: string, collectionIds: string[]) => Promise<void>;
};

const moodboardService = api as unknown as MoodboardService;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function MoodboardWorkspace({ collectionId, collectionName = "Moodboards", collections = [], onPreview, onNotify, onFlushReady }: Props) {
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
  const [contextFilter, setContextFilter] = useState<string | undefined>(collectionId);
  const [createContextIds, setCreateContextIds] = useState<string[]>(collectionId ? [collectionId] : []);
  const [renameContextIds, setRenameContextIds] = useState<string[]>([]);
  const [assetSearch, setAssetSearch] = useState("");
  const deferredAssetSearch = useDeferredValue(assetSearch);
  const boards = useQuery({ queryKey: ["moodboards", contextFilter ?? "all"], queryFn: () => moodboardService.listMoodboards(contextFilter ? { collectionId: contextFilter } : undefined) });
  const libraryAssets = useQuery({ queryKey: ["moodboard-library-assets"], queryFn: () => api.listAssets({ limit: 500, sort: "newest" }), enabled: Boolean(document) });
  const contextRefs = useMemo(() => {
    if (!document) return [];
    if (document.contexts?.length) return document.contexts;
    const ids = document.collectionIds ?? (document.collectionId ? [document.collectionId] : []);
    return ids.map((id) => ({ id, name: collections.find((collection) => collection.id === id)?.name ?? "Unknown context" }));
  }, [collections, document]);
  const contextAssetQueries = useQueries({
    queries: contextRefs.map((context) => ({
      queryKey: ["moodboard-context-assets", context.id],
      queryFn: () => api.listAssets({ collectionId: context.id, limit: 500, sort: "newest" }),
    })),
  });
  const globalSearch = useQuery({
    queryKey: ["moodboard-asset-search", deferredAssetSearch.trim()],
    queryFn: () => api.listAssets({ search: deferredAssetSearch.trim(), limit: 120, sort: "newest" }),
    enabled: Boolean(document && deferredAssetSearch.trim()),
  });

  const invalidateBoards = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["moodboards"] });
  }, [queryClient]);
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
    setDocument(undefined); setHistory([]); setFuture([]); setAssetSearch(""); await invalidateBoards();
    return true;
  }, [flush, invalidateBoards]);
  const reloadBoard = useCallback(async () => { if (document) await openBoard(document.id); }, [document, openBoard]);
  const createBoard = useCallback(async (name: string, contextIds?: string[]) => {
    setPending(true);
    try {
      const next = await moodboardService.createMoodboard({ name, collectionIds: contextIds?.length ? contextIds : collectionId ? [collectionId] : undefined });
      if (contextIds) await moodboardService.setMoodboardContexts(next.id, contextIds);
      setCreateOpen(false); setHistory([]); setFuture([]); setDocument(next); await invalidateBoards();
    } catch (error) { onNotify(message(error), "error"); } finally { setPending(false); }
  }, [collectionId, invalidateBoards, onNotify]);
  const rename = useCallback(async (board: MoodboardSummary, name: string, contextIds?: string[]) => {
    setPending(true);
    try {
      await api.renameMoodboard(board.id, name);
      if (contextIds) await moodboardService.setMoodboardContexts(board.id, contextIds);
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
      const copy = await moodboardService.createMoodboard({ name: `${document.name} copy`, collectionIds: document.collectionIds ?? (document.collectionId ? [document.collectionId] : []) });
      const result = await api.saveMoodboard({ ...document, id: copy.id, name: copy.name, revision: copy.revision }, copy.revision);
      setDocument({ ...document, id: copy.id, name: copy.name, revision: result.revision });
      setHistory([]); setFuture([]); await invalidateBoards();
    } catch (error) { onNotify(message(error), "error"); }
  }, [document, invalidateBoards, onNotify]);

  useEffect(() => {
    onFlushReady?.(flush);
    return () => onFlushReady?.(undefined);
  }, [flush, onFlushReady]);
  const contextSections = useMemo(() => contextRefs.map((context, index) => ({ id: context.id, name: context.name, assets: contextAssetQueries[index]?.data?.items ?? [] })), [contextAssetQueries, contextRefs]);
  const allAssets = useMemo(() => {
    const assetsById = new Map<string, Asset>();
    for (const asset of libraryAssets.data?.items ?? []) assetsById.set(asset.id, asset);
    for (const section of contextSections) for (const asset of section.assets) assetsById.set(asset.id, asset);
    for (const asset of globalSearch.data?.items ?? []) assetsById.set(asset.id, asset);
    return [...assetsById.values()];
  }, [contextSections, globalSearch.data?.items, libraryAssets.data?.items]);
  return <section className="moodboardWorkspace">
    {document && <header className="moodboardContextHeader"><button className="moodboardBackButton" type="button" onClick={() => void closeBoard()}><ArrowLeft size={15} />{t("moodboards")}</button></header>}
    {document ? <>
      {status === "conflict" || status === "error" ? <div className="moodboardRecovery" role="alert"><AlertTriangle size={15} /><span>{status === "conflict" ? t("moodboardConflict") : t("moodboardSaveError")}</span><button type="button" onClick={() => void reloadBoard()}><RefreshCw size={14} />{t("reloadMoodboard")}</button>{status === "conflict" && <button type="button" onClick={() => void saveCopy()}>{t("save")}</button>}</div> : null}
      <MoodboardCanvas document={document} contextSections={contextSections} searchResults={globalSearch.data?.items ?? []} search={assetSearch} onSearchChange={setAssetSearch} allAssets={allAssets} saveState={status === "conflict" ? "error" : status} onChange={changeDocument} onPreviewAsset={onPreview} onUndo={undo} onRedo={redo} canUndo={history.length > 0} canRedo={future.length > 0} onExport={() => void exportBoard()} onBoardMenu={() => void closeBoard()} />
      <MoodboardExportScene ref={exportRef} document={document} assets={allAssets} />
    </> : <><div className="moodboardGlobalFilters"><label>Context<select value={contextFilter ?? ""} onChange={(event) => setContextFilter(event.target.value || undefined)}><option value="">All contexts</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></label></div><MoodboardList collectionName={collectionName} boards={boards.data ?? []} loading={boards.isLoading} error={boards.error ? message(boards.error) : undefined} onOpen={(id) => void openBoard(id)} onCreate={() => { setCreateContextIds(contextFilter ? [contextFilter] : []); setCreateOpen(true); }} onRename={(board) => { setRenameBoard(board); setRenameContextIds(board.contexts?.map((context) => context.id) ?? (collectionId ? [collectionId] : [])); }} onDelete={setDeleteBoard} labels={{ heading: t("moodboards"), create: t("newMoodboard"), open: t("openMoodboard"), rename: t("renameMoodboard"), delete: t("deleteMoodboard"), nodesCount: (count) => t("moodboardNodes", { count }), updated: (date) => t("moodboardUpdated", { date }), emptyTitle: t("moodboardEmptyTitle"), emptyDescription: t("moodboardEmptyDescription") }} /></>}
    <MoodboardCreateDialog open={createOpen} pending={pending} collections={collections} selectedCollectionIds={createContextIds} onSelectedCollectionIdsChange={setCreateContextIds} onOpenChange={setCreateOpen} onCreate={(name, contextIds) => void createBoard(name, contextIds)} labels={{ createTitle: t("newMoodboard"), name: t("name"), create: t("create"), cancel: t("cancel"), close: t("close") }} />
    <MoodboardRenameDialog open={Boolean(renameBoard)} board={renameBoard} pending={pending} collections={collections} selectedCollectionIds={renameContextIds} onSelectedCollectionIdsChange={setRenameContextIds} onOpenChange={(open) => { if (!open) setRenameBoard(undefined); }} onRename={(board, name, contextIds) => void rename(board, name, contextIds)} labels={{ renameTitle: t("renameMoodboard"), name: t("name"), save: t("save"), cancel: t("cancel"), close: t("close") }} />
    <MoodboardDeleteDialog open={Boolean(deleteBoard)} board={deleteBoard} pending={pending} onOpenChange={(open) => { if (!open) setDeleteBoard(undefined); }} onDelete={(board) => void remove(board)} labels={{ deleteTitle: t("moodboardDeleteTitle"), deleteDescription: (name) => t("moodboardDeleteDescription", { name }), delete: t("deleteMoodboard"), cancel: t("cancel"), close: t("close") }} />
  </section>;
}
