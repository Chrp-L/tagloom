import * as Tooltip from "@radix-ui/react-tooltip";
import { useQueryClient } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useCallback, useDeferredValue, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { api } from "./api";
import { AppOverlays } from "./components/AppOverlays";
import type { LibraryDeleteTarget } from "./components/AppOverlays";
import { AssetBrowser } from "./components/AssetBrowser";
import { HomePage } from "./components/HomePage";
import { Inspector } from "./components/Inspector";
import { LibraryOverview } from "./components/LibraryOverview";
import { MoodboardWorkspace } from "./components/MoodboardWorkspace";
import { Sidebar } from "./components/Sidebar";
import { ScanStatusBar } from "./components/ScanStatusBar";
import { Toolbar } from "./components/Toolbar";
import { WindowChrome } from "./components/WindowChrome";
import { useHomeQuery, useLibraryQueries } from "./hooks/useLibraryQueries";
import { useLibraryActivity } from "./hooks/useLibraryActivity";
import { useAppNotifications } from "./hooks/useAppNotifications";
import { useAppPreferences } from "./hooks/useAppPreferences";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useLibraryActions } from "./hooks/useLibraryActions";
import { usePreviewController } from "./hooks/usePreviewController";
import { useTransientCue } from "./hooks/useTransientCue";
import { useVideoPreviewCache } from "./hooks/useVideoPreviewCache";
import { getAssetActionTargets } from "./features/selection/selectionModel";
import { useUiStore } from "./store";
import type { Asset, AssetQuery, JobProgress } from "./types";

export default function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const ui = useUiStore(useShallow((state) => ({
    navigation: state.navigation,
    selectionMode: state.selectionMode,
    focusedAssetId: state.focusedAssetId,
    checkedIds: state.checkedIds,
    view: state.view,
    gridColumns: state.gridColumns,
    sidebarCollapsed: state.sidebarCollapsed,
    collapsedSections: state.collapsedSections,
    inspectorOpen: state.inspectorOpen,
    setNavigation: state.setNavigation,
    enterBatchSelection: state.enterBatchSelection,
    exitBatchSelection: state.exitBatchSelection,
    focusAsset: state.focusAsset,
    toggleChecked: state.toggleChecked,
    checkRange: state.checkRange,
    clearFocus: state.clearFocus,
    removeChecked: state.removeChecked,
    setView: state.setView,
    setGridColumns: state.setGridColumns,
    setSidebarCollapsed: state.setSidebarCollapsed,
    toggleSidebarSection: state.toggleSidebarSection,
    revealSidebarSection: state.revealSidebarSection,
  })));
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sort, setSort] = useState<AssetQuery["sort"]>("newest");
  const [createKind, setCreateKind] = useState<"tag" | "collection" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [videoCacheClearRequested, setVideoCacheClearRequested] = useState(false);
  const [trashTargetIds, setTrashTargetIds] = useState<string[]>([]);
  const [libraryDeleteTarget, setLibraryDeleteTarget] = useState<LibraryDeleteTarget>();
  const [libraryDeletePending, setLibraryDeletePending] = useState(false);
  const [renameAsset, setRenameAsset] = useState<Asset>();
  const [job, setJob] = useState<JobProgress>();
  const [collectionMode, setCollectionMode] = useState<"assets" | "moodboards">("assets");
  const moodboardFlushRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const { cue: weaveCue, trigger: cueWeave } = useTransientCue();
  const { messages: toasts, notify } = useAppNotifications();
  const notifyError = useCallback((message: string) => notify(message, "error"), [notify]);
  const videoCache = useVideoPreviewCache({ enabled: settingsOpen, onError: notifyError });
  const { theme, language, changeTheme: setTheme, changeLanguage: setAppLanguage } = useAppPreferences();

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
  const inspectorTargetIds = useMemo(() => getAssetActionTargets(ui), [ui.checkedIds, ui.focusedAssetId, ui.selectionMode]);
  const browserMotionKey = useMemo(() => JSON.stringify([ui.navigation, deferredSearch, sort, ui.view, ui.gridColumns]), [deferredSearch, sort, ui.gridColumns, ui.navigation, ui.view]);
  const requestTrash = useCallback((ids: string[]) => {
    if (ids.length > 0) setTrashTargetIds([...ids]);
  }, []);
  const cueTag = useCallback((color?: string) => cueWeave("tag", { color }), [cueWeave]);
  const { actions: libraryActions, action, refresh } = useLibraryActions({
    queryClient,
    notify,
    operationComplete: t("operationComplete"),
    tagApplied: t("tagApplied"),
    tags: bootstrap.data?.tags,
    targetIds: inspectorTargetIds,
    onCueTag: cueTag,
    onJobStarted: setJob,
    onRequestTrash: requestTrash,
  });

  const onScanComplete = useCallback(() => cueWeave("scan-complete"), [cueWeave]);
  useLibraryActivity({ job, setJob, recentJobs: jobsQuery.data, refresh, run: action, onScanComplete });

  const title = useMemo(() => {
    const data = bootstrap.data;
    if (ui.navigation.kind === "home") return t("home");
    if (ui.navigation.kind === "media") return ui.navigation.mediaKind === "image" ? t("images") : t("videos");
    if (ui.navigation.kind === "source") { const id = ui.navigation.id; return data?.sources.find((item) => item.id === id)?.name ?? t("folders"); }
    if (ui.navigation.kind === "tag") { const id = ui.navigation.id; return data?.tags.find((item) => item.id === id)?.name ?? t("tags"); }
    if (ui.navigation.kind === "collection") { const id = ui.navigation.id; return data?.collections.find((item) => item.id === id)?.name ?? t("collections"); }
    return t("allItems");
  }, [bootstrap.data, t, ui.navigation]);

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
  const { preview, prepareVideo, cancelVideo, invalidateVideo, setVideoActive, onVideoProgress, previewAssets, previewOpen, setPreviewOpen, previewIndex, setPreviewIndex } = usePreviewController({
    assets,
    queryClient,
    videoPreviewFailed: t("videoPreviewFailed"),
  });
  useGlobalShortcuts({ previewOpen, requestTrash });
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
  const moodboardMode = ui.navigation.kind === "collection" && collectionMode === "moodboards";
  const navigate = useCallback((value: Parameters<typeof ui.setNavigation>[0]) => {
    const complete = () => { setCollectionMode("assets"); ui.setNavigation(value); };
    if (!moodboardMode || !moodboardFlushRef.current) { complete(); return; }
    void moodboardFlushRef.current().then(complete).catch((error) => notify(error instanceof Error ? error.message : String(error), "error"));
  }, [moodboardMode, notify, ui]);

  return <MotionConfig reducedMotion="user">
    <Tooltip.Provider delayDuration={500}>
      <WindowChrome />
      <div className={`appShell ${ui.sidebarCollapsed ? "sidebarCollapsed" : ""} ${moodboardMode ? "moodboardActive" : ""}`}>
        <Sidebar data={bootstrap.data} navigation={ui.navigation} collapsed={ui.sidebarCollapsed} collapsedSections={ui.collapsedSections} eventCue={weaveCue?.kind === "sidebar" ? weaveCue.id : undefined}
          onCollapsedChange={(value) => { cueWeave("sidebar"); ui.setSidebarCollapsed(value); }} onToggleSection={ui.toggleSidebarSection} onRevealSection={ui.revealSidebarSection} onNavigate={(value) => { cueWeave("filter"); navigate(value); }} onAddSource={libraryActions.addFolder}
          onCreateTag={() => setCreateKind("tag")} onCreateCollection={() => setCreateKind("collection")}
          onRescan={(id) => void libraryActions.rescan(id)} onRemoveSource={(source) => setLibraryDeleteTarget({ kind: "source", id: source.id, name: source.name })}
          onDeleteCollection={(collection) => setLibraryDeleteTarget({ kind: "collection", id: collection.id, name: collection.name })}
          onDeleteTag={(tag) => setLibraryDeleteTarget({ kind: "tag", id: tag.id, name: tag.name })}
          />
        <main className="workspace">
          {moodboardMode && activeCollection ? <MoodboardWorkspace collectionId={activeCollection.id} collectionName={activeCollection.name} onModeChange={setCollectionMode} onPreview={(asset) => preview(asset, assets)} onNotify={notify} onFlushReady={(flush) => { moodboardFlushRef.current = flush; }} /> : <>
          <Toolbar mode={ui.navigation.kind === "home" ? "home" : "assets"} title={title} count={total} search={search} sort={sort || "newest"} view={ui.view} gridColumns={ui.gridColumns} selectionMode={ui.selectionMode} checkedCount={ui.checkedIds.length} eventCue={weaveCue}
            onSearch={changeSearch} onSort={changeSort} onView={(value) => { cueWeave("layout"); ui.setView(value); }} onGridColumns={(value) => { cueWeave("layout"); ui.setGridColumns(value); }} onEnterBatch={ui.enterBatchSelection} onExitBatch={ui.exitBatchSelection} onSettings={() => setSettingsOpen(true)} />
          <ScanStatusBar job={job} onControl={(command) => { if (job) void api.controlJob(job.id, command); }} />
          {ui.navigation.kind === "collection" && <div className="collectionModeBar"><div className="segmented" aria-label={t("collections")}><button className="tactile" aria-pressed={collectionMode === "assets"} onClick={() => setCollectionMode("assets")}>{t("assetsMode")}</button><button className="tactile" aria-pressed={collectionMode === "moodboards"} onClick={() => setCollectionMode("moodboards")}>{t("moodboardsMode")}</button></div></div>}
          {ui.navigation.kind === "home" ? <HomePage snapshot={homeQuery.data} loading={homeQuery.isLoading} error={homeQuery.error instanceof Error ? homeQuery.error.message : homeQuery.error ? String(homeQuery.error) : undefined} focusedAssetId={ui.focusedAssetId} job={job}
            hasSources={(bootstrap.data?.sources.length ?? 0) > 0} onAddSource={libraryActions.addFolder}
            onOpenCollection={(id) => ui.setNavigation({ kind: "collection", id })} onViewCollections={() => ui.revealSidebarSection("collections")} onCreateCollection={() => setCreateKind("collection")}
            onFocus={(asset) => ui.focusAsset(asset?.id)} onPreview={(asset, context) => preview(asset, context)} /> : <AssetBrowser assets={assets} total={total} view={ui.view} gridColumns={ui.gridColumns} selectionMode={ui.selectionMode} focusedAssetId={ui.focusedAssetId} checkedIds={ui.checkedIds} loading={assetsQuery.isLoading || assetsQuery.isFetchingNextPage}
            hasMore={Boolean(assetsQuery.hasNextPage)} error={assetsQuery.error instanceof Error ? assetsQuery.error.message : assetsQuery.error ? String(assetsQuery.error) : undefined} noSources={!bootstrap.isLoading && (bootstrap.data?.sources.length ?? 0) === 0} contentMotionKey={browserMotionKey}
            onLoadMore={() => void assetsQuery.fetchNextPage()} onFocus={ui.focusAsset} onToggleChecked={ui.toggleChecked} onCheckRange={(assetId) => ui.checkRange(orderedAssetIds, assetId)} onPreview={preview}
            onRename={setRenameAsset} onMove={(asset) => void libraryActions.move(asset)} onOpen={(asset) => void libraryActions.open(asset)} onReveal={(asset) => void libraryActions.reveal(asset)} onTrash={libraryActions.trash}
            collectionContext={activeCollection ? { id: activeCollection.id, coverAssetId: activeCollection.coverAssetId } : undefined}
            onSetCollectionCover={(collectionId, assetId) => void action(() => api.setCollectionCover(collectionId, assetId), t("operationComplete"))}
            onClearCollectionCover={(collectionId) => void action(() => api.clearCollectionCover(collectionId), t("operationComplete"))} onAddSource={libraryActions.addFolder} />}
          </>}
        </main>
        {!moodboardMode && (ui.inspectorOpen && ui.navigation.kind === "home" && !focusedAsset && ui.selectionMode === "browse" ? <LibraryOverview data={bootstrap.data} jobs={jobsQuery.data} onAddSource={libraryActions.addFolder} onOpenSource={(id: string) => ui.setNavigation({ kind: "source", id })} /> : ui.inspectorOpen && <Inspector selectionMode={ui.selectionMode} focusedAsset={focusedAsset} checkedAssets={checkedAssets} tags={bootstrap.data?.tags ?? []} collections={bootstrap.data?.collections ?? []} sources={bootstrap.data?.sources ?? []}
          onSetTag={(tagId, attached) => void libraryActions.setTags(tagId, attached)} onAddCollection={(collectionId) => void action(() => api.setCollectionAssets(collectionId, inspectorTargetIds, true), t("operationComplete"))}
          onSaveNote={(id, note) => void action(() => api.updateAssetNote(id, note), t("operationComplete"))} onRename={setRenameAsset} onMove={(asset) => void libraryActions.move(asset)}
          onTrash={() => libraryActions.trash(inspectorTargetIds)} onReveal={(asset) => void libraryActions.reveal(asset)} onOpen={(asset) => void libraryActions.open(asset)} />)}
      </div>
      <AppOverlays
        createKind={createKind}
        onCreateKindChange={setCreateKind}
        onCreateEntity={(name, color) => void createEntity(name, color)}
        trashTargetIds={trashTargetIds}
        onTrashTargetIdsChange={setTrashTargetIds}
        onConfirmTrash={() => void action(async () => {
          const deletedIds = [...trashTargetIds];
          await api.trashAssets(deletedIds);
          const state = useUiStore.getState();
          if (state.focusedAssetId && deletedIds.includes(state.focusedAssetId)) state.clearFocus();
          state.removeChecked(deletedIds);
          setTrashTargetIds([]);
        }, t("operationComplete"))}
        libraryDeleteTarget={libraryDeleteTarget}
        libraryDeletePending={libraryDeletePending}
        onLibraryDeleteTargetChange={setLibraryDeleteTarget}
        onConfirmLibraryDelete={() => void deleteLibraryEntity()}
        renameAsset={renameAsset}
        onRenameAssetChange={setRenameAsset}
        onRename={(asset, name) => void libraryActions.rename(asset, name)}
        previewAssets={previewAssets}
        previewIndex={previewIndex}
        previewOpen={previewOpen}
        onPreviewOpenChange={setPreviewOpen}
        onPreviewIndexChange={setPreviewIndex}
        onOpenExternal={(asset) => void libraryActions.open(asset)}
        onPrepareVideo={prepareVideo}
        onCancelVideo={cancelVideo}
        onInvalidateVideo={invalidateVideo}
        onSetVideoActive={setVideoActive}
        onVideoProgress={onVideoProgress}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
        theme={theme}
        language={language}
        onThemeChange={setTheme}
        onLanguageChange={setAppLanguage}
        onBackup={() => void action(async () => { await api.createBackup(); }, t("backupCreated"))}
        onRestore={() => void action(api.restoreBackup)}
        videoCacheStatus={videoCache.status}
        videoCacheLoading={videoCache.loading}
        videoCacheUpdating={videoCache.updating}
        videoCacheClearRequested={videoCacheClearRequested}
        onVideoCacheClearRequestedChange={setVideoCacheClearRequested}
        onVideoCacheLimit={(limitBytes) => void videoCache.setLimit(limitBytes)}
        onClearVideoCache={() => void videoCache.clear().then((cleared) => { if (cleared) setVideoCacheClearRequested(false); })}
        toasts={toasts}
      />
    </Tooltip.Provider>
  </MotionConfig>;
}
