import * as Tooltip from "@radix-ui/react-tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import { AssetBrowser } from "./components/AssetBrowser";
import { ConfirmLibraryEntityDeleteDialog, ConfirmTrashDialog, CreateEntityDialog, PreviewDialog, RenameDialog, SettingsDialog } from "./components/Dialogs";
import { HomePage } from "./components/HomePage";
import { Inspector } from "./components/Inspector";
import { LibraryOverview } from "./components/LibraryOverview";
import { Sidebar } from "./components/Sidebar";
import { ScanStatusBar } from "./components/ScanStatusBar";
import { TagDragOverlay } from "./components/TagDragOverlay";
import { ToastRegion } from "./components/ToastRegion";
import type { ToastMessage } from "./components/ToastRegion";
import { Toolbar } from "./components/Toolbar";
import { WindowChrome } from "./components/WindowChrome";
import { useHomeQuery, useLibraryQueries } from "./hooks/useLibraryQueries";
import { useLibraryActivity } from "./hooks/useLibraryActivity";
import { useTagDrag } from "./hooks/useTagDrag";
import { useTransientCue } from "./hooks/useTransientCue";
import i18n from "./i18n";
import { getAssetActionTargets } from "./features/selection/selectionModel";
import { useUiStore } from "./store";
import type { Asset, AssetQuery, LanguageChoice, Tag, ThemeChoice } from "./types";

type LibraryDeleteTarget = { kind: "source" | "collection" | "tag"; id: string; name: string };

export default function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ui = useUiStore();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = useState<AssetQuery["sort"]>("newest");
  const [createKind, setCreateKind] = useState<"tag" | "collection" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [trashTargetIds, setTrashTargetIds] = useState<string[]>([]);
  const [libraryDeleteTarget, setLibraryDeleteTarget] = useState<LibraryDeleteTarget>();
  const [libraryDeletePending, setLibraryDeletePending] = useState(false);
  const [renameAsset, setRenameAsset] = useState<Asset>();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [preparedPreviews, setPreparedPreviews] = useState<Record<string, string>>({});
  const [previewSourceAssets, setPreviewSourceAssets] = useState<Asset[]>();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [language, setLanguage] = useState<LanguageChoice>((localStorage.getItem("tagloom-language-choice") as LanguageChoice) || "system");
  const { cue: weaveCue, trigger: cueWeave } = useTransientCue();

  const { bootstrap, jobs: jobsQuery, assets: assetsQuery, items: assets, total } = useLibraryQueries(ui.navigation, deferredSearch, sort);
  const homeQuery = useHomeQuery(ui.navigation.kind === "home");
  const checkedIdSet = useMemo(() => new Set(ui.checkedIds), [ui.checkedIds]);
  const orderedAssetIds = useMemo(() => assets.map((asset) => asset.id), [assets]);
  const checkedAssets = useMemo(() => assets.filter((asset) => checkedIdSet.has(asset.id)), [assets, checkedIdSet]);
  const homeAssetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    const snapshot = homeQuery.data;
    if (!snapshot) return map;
    for (const asset of [...snapshot.recentViewed, ...snapshot.recentImported, ...snapshot.recentModified]) map.set(asset.id, asset);
    for (const collection of snapshot.collections) if (collection.coverAsset) map.set(collection.coverAsset.id, collection.coverAsset);
    return map;
  }, [homeQuery.data]);
  const focusedAsset = useMemo(() => assets.find((asset) => asset.id === ui.focusedAssetId) ?? (ui.focusedAssetId ? homeAssetMap.get(ui.focusedAssetId) : undefined), [assets, homeAssetMap, ui.focusedAssetId]);
  const collectionNavigationId = ui.navigation.kind === "collection" ? ui.navigation.id : undefined;
  const activeCollection = useMemo(() => collectionNavigationId ? bootstrap.data?.collections.find((collection) => collection.id === collectionNavigationId) : undefined, [bootstrap.data?.collections, collectionNavigationId]);
  const inspectorTargetIds = useMemo(() => getAssetActionTargets(ui), [ui.checkedIds, ui.focusedAssetId]);
  const previewAssets = useMemo(() => (previewSourceAssets ?? assets).map((asset) => preparedPreviews[asset.id] ? { ...asset, previewPath: preparedPreviews[asset.id] } : asset), [assets, preparedPreviews, previewSourceAssets]);
  const browserMotionKey = useMemo(() => JSON.stringify([ui.navigation, deferredSearch, sort, ui.view, ui.gridColumns]), [deferredSearch, sort, ui.gridColumns, ui.navigation, ui.view]);

  const notify = useCallback((message: string, tone: ToastMessage["tone"] = "success") => {
    const id = Date.now(); setToasts((items) => [...items, { id, message, tone }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3200);
  }, []);
  const refresh = useCallback(async () => {
    await Promise.all([queryClient.invalidateQueries({ queryKey: ["bootstrap"] }), queryClient.invalidateQueries({ queryKey: ["assets"] }), queryClient.invalidateQueries({ queryKey: ["home"] })]);
  }, [queryClient]);
  const action = useCallback(async (operation: () => Promise<unknown>, success?: string) => {
    try { await operation(); await refresh(); if (success) notify(success); }
    catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
  }, [notify, refresh]);
  const requestTrash = useCallback((ids: string[]) => {
    if (ids.length > 0) setTrashTargetIds([...ids]);
  }, []);

  const onScanComplete = useCallback(() => cueWeave("scan-complete"), [cueWeave]);
  const { job, setJob } = useLibraryActivity({ recentJobs: jobsQuery.data, refresh, run: action, onScanComplete });

  useEffect(() => {
    const applyTheme = () => {
      const dark = ui.theme === "dark" || (ui.theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    };
    applyTheme();
    const media = matchMedia("(prefers-color-scheme: dark)"); media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [ui.theme]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector<HTMLInputElement>(".searchField input")?.focus(); }
      if (event.key === "Escape" && !previewOpen) {
        const state = useUiStore.getState();
        if (state.selectionMode === "batch") state.exitBatchSelection();
        else state.clearFocus();
      }
      if (event.key === "Delete" && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLElement && event.target.isContentEditable)) {
        const state = useUiStore.getState();
        requestTrash(getAssetActionTargets(state));
      }
    };
    window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener);
  }, [previewOpen, requestTrash]);

  const title = useMemo(() => {
    const data = bootstrap.data;
    if (ui.navigation.kind === "home") return t("home");
    if (ui.navigation.kind === "media") return ui.navigation.mediaKind === "image" ? t("images") : t("videos");
    if (ui.navigation.kind === "source") { const id = ui.navigation.id; return data?.sources.find((item) => item.id === id)?.name ?? t("folders"); }
    if (ui.navigation.kind === "tag") { const id = ui.navigation.id; return data?.tags.find((item) => item.id === id)?.name ?? t("tags"); }
    if (ui.navigation.kind === "collection") { const id = ui.navigation.id; return data?.collections.find((item) => item.id === id)?.name ?? t("collections"); }
    return t("allItems");
  }, [bootstrap.data, t, ui.navigation]);

  const addFolder = async () => {
    const path = await api.pickFolder();
    if (!path) return;
    try {
      const id = await api.addSource(path);
      setJob({ id, kind: "scan", status: "running", total: 0, completed: 0 });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["bootstrap"] }), queryClient.invalidateQueries({ queryKey: ["jobs"] })]);
    } catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
  };
  const rescan = async (sourceId: string) => {
    try {
      const id = await api.rescanSource(sourceId);
      setJob({ id, kind: "scan", status: "running", total: 0, completed: 0 });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch (error) { notify(error instanceof Error ? error.message : String(error), "error"); }
  };
  const deleteLibraryEntity = async () => {
    const target = libraryDeleteTarget;
    if (!target || libraryDeletePending) return;
    setLibraryDeletePending(true);
    try {
      if (target.kind === "source") await api.removeSource(target.id);
      else if (target.kind === "collection") await api.deleteCollection(target.id);
      else await api.deleteTag(target.id);
      if (ui.navigation.kind === target.kind && "id" in ui.navigation && ui.navigation.id === target.id) ui.setNavigation({ kind: "all" });
      await refresh();
      notify(t("libraryItemRemoved"));
      setLibraryDeleteTarget(undefined);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setLibraryDeletePending(false);
    }
  };
  const createEntity = (name: string, color?: string) => action(
    () => createKind === "tag" ? api.createTag(name, color || "#ee6859") : api.createCollection(name),
  );
  const setTags = useCallback((tagId: string, attached: boolean, ids = inspectorTargetIds) => {
    if (attached) cueWeave("tag", { color: bootstrap.data?.tags.find((tag) => tag.id === tagId)?.color });
    return action(() => api.setAssetTags(ids, tagId, attached), t("tagApplied"));
  }, [action, bootstrap.data?.tags, cueWeave, inspectorTargetIds, t]);
  const dropTag = useCallback((assetId: string, tag: Tag) => {
    const targets = checkedIdSet.has(assetId) ? ui.checkedIds : [assetId];
    void setTags(tag.id, true, targets);
  }, [checkedIdSet, setTags, ui.checkedIds]);
  const { drag: tagDrag, wovenAssetId, begin: beginTagDrag, canActivate: canActivateTag } = useTagDrag(dropTag);
  const preview = (asset: Asset, contextAssets = assets) => {
    setPreviewSourceAssets(contextAssets);
    setPreviewIndex(Math.max(0, contextAssets.findIndex((item) => item.id === asset.id)));
    setPreviewOpen(true);
    void api.recordAssetViewed(asset.id).then(() => queryClient.invalidateQueries({ queryKey: ["home"] }));
  };
  const prepareVideo = async (asset: Asset) => {
    const existing = preparedPreviews[asset.id] || asset.previewPath;
    if (existing) return existing;
    const path = await api.prepareVideoPreview(asset.id);
    if (!path) throw new Error(t("videoPreviewFailed"));
    setPreparedPreviews((items) => ({ ...items, [asset.id]: path }));
    return path;
  };
  const rename = async (name: string) => {
    if (!renameAsset) return;
    const separator = renameAsset.path.includes("\\") ? "\\" : "/";
    const parent = renameAsset.path.slice(0, renameAsset.path.lastIndexOf(separator));
    await action(() => api.moveAsset(renameAsset.id, `${parent}${separator}${name}`), t("operationComplete"));
  };
  const move = async (asset: Asset) => {
    const folder = await api.pickFolder();
    if (!folder) return;
    const separator = folder.includes("\\") ? "\\" : "/";
    await action(() => api.moveAsset(asset.id, `${folder}${separator}${asset.filename}`), t("operationComplete"));
  };
  const setTheme = (value: ThemeChoice) => { ui.setTheme(value); void api.setSetting("theme", value); };
  const setAppLanguage = (value: LanguageChoice) => {
    setLanguage(value); localStorage.setItem("tagloom-language-choice", value);
    const resolved = value === "system" ? (navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en") : value;
    localStorage.setItem("tagloom-language", resolved); void i18n.changeLanguage(resolved); void api.setSetting("language", value);
  };
  const changeSearch = useCallback((value: string) => {
    if (useUiStore.getState().navigation.kind === "home" && value.trim()) useUiStore.getState().setNavigation({ kind: "all" });
    useUiStore.getState().resetAssetContext();
    setSearch(value);
  }, []);
  const changeSort = useCallback((value: string) => {
    cueWeave("filter");
    useUiStore.getState().resetAssetContext();
    setSort(value as AssetQuery["sort"]);
  }, [cueWeave]);

  return <MotionConfig reducedMotion="user">
    <Tooltip.Provider delayDuration={500}>
      <WindowChrome />
      <div className={`appShell ${ui.sidebarCollapsed ? "sidebarCollapsed" : ""}`}>
        <Sidebar data={bootstrap.data} navigation={ui.navigation} collapsed={ui.sidebarCollapsed} collapsedSections={ui.collapsedSections} eventCue={weaveCue?.kind === "sidebar" ? weaveCue.id : undefined}
          onCollapsedChange={(value) => { cueWeave("sidebar"); ui.setSidebarCollapsed(value); }} onToggleSection={ui.toggleSidebarSection} onRevealSection={ui.revealSidebarSection} onNavigate={(value) => { cueWeave("filter"); ui.setNavigation(value); }} onAddSource={addFolder}
          onCreateTag={() => setCreateKind("tag")} onCreateCollection={() => setCreateKind("collection")}
          onRescan={(id) => void rescan(id)} onRemoveSource={(source) => setLibraryDeleteTarget({ kind: "source", id: source.id, name: source.name })}
          onDeleteCollection={(collection) => setLibraryDeleteTarget({ kind: "collection", id: collection.id, name: collection.name })}
          onDeleteTag={(tag) => setLibraryDeleteTarget({ kind: "tag", id: tag.id, name: tag.name })}
          onTagPointerDown={beginTagDrag} onTagActivate={(id) => { if (canActivateTag()) { cueWeave("filter"); ui.setNavigation({ kind: "tag", id }); } }} />
        <main className="workspace">
          <Toolbar mode={ui.navigation.kind === "home" ? "home" : "assets"} title={title} count={total} search={search} sort={sort || "newest"} view={ui.view} gridColumns={ui.gridColumns} selectionMode={ui.selectionMode} checkedCount={ui.checkedIds.length} eventCue={weaveCue}
            onSearch={changeSearch} onSort={changeSort} onView={(value) => { cueWeave("layout"); ui.setView(value); }} onGridColumns={(value) => { cueWeave("layout"); ui.setGridColumns(value); }} onEnterBatch={ui.enterBatchSelection} onExitBatch={ui.exitBatchSelection} onSettings={() => setSettingsOpen(true)} />
          <ScanStatusBar job={job} onControl={(command) => { if (job) void api.controlJob(job.id, command); }} />
          {ui.navigation.kind === "home" ? <HomePage snapshot={homeQuery.data} loading={homeQuery.isLoading} error={homeQuery.error instanceof Error ? homeQuery.error.message : homeQuery.error ? String(homeQuery.error) : undefined} focusedAssetId={ui.focusedAssetId} job={job}
            summary={{ total: bootstrap.data?.totalAssets ?? total, images: bootstrap.data?.imageCount ?? 0, videos: bootstrap.data?.videoCount ?? 0, collections: bootstrap.data?.collections.length ?? 0 }}
            onOpenCollection={(id) => ui.setNavigation({ kind: "collection", id })} onViewCollections={() => ui.revealSidebarSection("collections")} onCreateCollection={() => setCreateKind("collection")}
            onFocus={(asset) => ui.focusAsset(asset?.id)} onPreview={(asset, context) => preview(asset, context)} /> : <AssetBrowser assets={assets} total={total} view={ui.view} gridColumns={ui.gridColumns} selectionMode={ui.selectionMode} focusedAssetId={ui.focusedAssetId} checkedIds={ui.checkedIds} loading={assetsQuery.isLoading || assetsQuery.isFetchingNextPage}
            hasMore={Boolean(assetsQuery.hasNextPage)} error={assetsQuery.error instanceof Error ? assetsQuery.error.message : assetsQuery.error ? String(assetsQuery.error) : undefined} noSources={!bootstrap.isLoading && (bootstrap.data?.sources.length ?? 0) === 0} contentMotionKey={browserMotionKey} wovenAssetId={wovenAssetId} dropTargetAssetId={tagDrag?.targetAssetId}
            onLoadMore={() => void assetsQuery.fetchNextPage()} onFocus={ui.focusAsset} onToggleChecked={ui.toggleChecked} onCheckRange={(assetId) => ui.checkRange(orderedAssetIds, assetId)} onPreview={preview}
            onRename={setRenameAsset} onMove={(asset) => void move(asset)} onOpen={(asset) => void action(() => api.openAsset(asset.id))} onReveal={(asset) => void action(() => api.revealAsset(asset.id))} onTrash={requestTrash}
            collectionContext={activeCollection ? { id: activeCollection.id, coverAssetId: activeCollection.coverAssetId } : undefined}
            onSetCollectionCover={(collectionId, assetId) => void action(() => api.setCollectionCover(collectionId, assetId), t("operationComplete"))}
            onClearCollectionCover={(collectionId) => void action(() => api.clearCollectionCover(collectionId), t("operationComplete"))} onAddSource={addFolder} />}
        </main>
        {ui.inspectorOpen && ui.navigation.kind === "home" && !focusedAsset && ui.selectionMode === "browse" ? <LibraryOverview data={bootstrap.data} jobs={jobsQuery.data} onAddSource={addFolder} /> : ui.inspectorOpen && <Inspector selectionMode={ui.selectionMode} focusedAsset={focusedAsset} checkedAssets={checkedAssets} tags={bootstrap.data?.tags ?? []} collections={bootstrap.data?.collections ?? []}
          onSetTag={(tagId, attached) => void setTags(tagId, attached)} onAddCollection={(collectionId) => void action(() => api.setCollectionAssets(collectionId, inspectorTargetIds, true), t("operationComplete"))}
          onSaveNote={(id, note) => void action(() => api.updateAssetNote(id, note), t("operationComplete"))} onRename={setRenameAsset} onMove={(asset) => void move(asset)}
          onTrash={() => requestTrash(inspectorTargetIds)} onReveal={(asset) => void action(() => api.revealAsset(asset.id))} onOpen={(asset) => void action(() => api.openAsset(asset.id))} />}
      </div>
      <TagDragOverlay drag={tagDrag} />

      <CreateEntityDialog open={createKind !== null} kind={createKind ?? "tag"} onOpenChange={(open) => { if (!open) setCreateKind(null); }} onCreate={(name, color) => void createEntity(name, color)} />
      <ConfirmTrashDialog open={trashTargetIds.length > 0} count={trashTargetIds.length} onOpenChange={(open) => { if (!open) setTrashTargetIds([]); }} onConfirm={() => void action(async () => {
        const deletedIds = [...trashTargetIds];
        await api.trashAssets(deletedIds);
        const state = useUiStore.getState();
        if (state.focusedAssetId && deletedIds.includes(state.focusedAssetId)) state.clearFocus();
        state.removeChecked(deletedIds);
        setTrashTargetIds([]);
      }, t("operationComplete"))} />
      <ConfirmLibraryEntityDeleteDialog
        open={Boolean(libraryDeleteTarget)}
        title={libraryDeleteTarget?.kind === "source" ? t("deleteSourceConfirmTitle") : libraryDeleteTarget?.kind === "collection" ? t("deleteCollectionConfirmTitle") : t("deleteTagConfirmTitle")}
        body={libraryDeleteTarget?.kind === "source" ? t("deleteSourceConfirmBody", { name: libraryDeleteTarget.name }) : libraryDeleteTarget?.kind === "collection" ? t("deleteCollectionConfirmBody", { name: libraryDeleteTarget.name }) : t("deleteTagConfirmBody", { name: libraryDeleteTarget?.name ?? "" })}
        confirmLabel={libraryDeleteTarget?.kind === "source" ? t("removeSource") : libraryDeleteTarget?.kind === "collection" ? t("deleteCollection") : t("deleteTag")}
        pending={libraryDeletePending}
        onOpenChange={(open) => { if (!open && !libraryDeletePending) setLibraryDeleteTarget(undefined); }}
        onConfirm={() => void deleteLibraryEntity()}
      />
      <RenameDialog asset={renameAsset} open={Boolean(renameAsset)} onOpenChange={(open) => { if (!open) setRenameAsset(undefined); }} onRename={(name) => void rename(name)} />
      <PreviewDialog assets={previewAssets} index={previewIndex} open={previewOpen} onOpenChange={setPreviewOpen} onIndex={setPreviewIndex} onOpenExternal={(asset) => void action(() => api.openAsset(asset.id))} onPrepareVideo={prepareVideo} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} theme={ui.theme} language={language}
        onTheme={setTheme} onLanguage={setAppLanguage}
        onBackup={() => void action(async () => { await api.createBackup(); }, t("backupCreated"))} onRestore={() => void action(api.restoreBackup)} />

      <ToastRegion messages={toasts} />
    </Tooltip.Provider>
  </MotionConfig>;
}
