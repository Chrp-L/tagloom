import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { AssetPage, AssetQuery, HomeSnapshot, JobProgress, LibraryBootstrap, Setting, VideoPreviewCacheStatus, VideoPreviewProgress } from "../types";

function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(name, args);
}

export const tauriApi = {
  getBootstrap: (): Promise<LibraryBootstrap> => command("get_bootstrap"),
  getHomeSnapshot: (): Promise<HomeSnapshot> => command("get_home_snapshot"),
  listAssets: (query: AssetQuery): Promise<AssetPage> => command("list_assets", { query }),
  pickFolder: async (): Promise<string | null> => {
    const selected = await open({ directory: true, multiple: false, title: "Choose a media folder" });
    return typeof selected === "string" ? selected : null;
  },
  addSource: (path: string): Promise<string> => command("add_source", { path }),
  removeSource: (id: string): Promise<void> => command("remove_source", { id }),
  rescanSource: (id: string): Promise<string> => command("rescan_source", { id }),
  controlJob: (id: string, action: "pause" | "resume" | "cancel"): Promise<void> => command("control_job", { id, action }),
  getRecentJobs: (): Promise<JobProgress[]> => command("get_recent_jobs"),
  reportFrontendError: (message: string): Promise<void> => command("report_frontend_error", { message }),
  createTag: (name: string, color: string): Promise<string> => command("create_tag", { name, color }),
  updateTag: (id: string, name: string, color: string): Promise<void> => command("update_tag", { id, name, color }),
  deleteTag: (id: string): Promise<void> => command("delete_tag", { id }),
  setAssetTags: (assetIds: string[], tagId: string, attached: boolean): Promise<void> => command("set_asset_tags", { assetIds, tagId, attached }),
  createCollection: (name: string): Promise<string> => command("create_collection", { name }),
  deleteCollection: (id: string): Promise<void> => command("delete_collection", { id }),
  setCollectionAssets: (collectionId: string, assetIds: string[], attached: boolean): Promise<void> => command("set_collection_assets", { collectionId, assetIds, attached }),
  setCollectionCover: (collectionId: string, assetId: string): Promise<void> => command("set_collection_cover", { collectionId, assetId }),
  clearCollectionCover: (collectionId: string): Promise<void> => command("clear_collection_cover", { collectionId }),
  recordAssetViewed: (id: string): Promise<void> => command("record_asset_viewed", { id }),
  updateAssetNote: (id: string, note: string): Promise<void> => command("update_asset_note", { id, note }),
  prepareVideoPreview: (id: string): Promise<string | undefined> => command("prepare_video_preview", { id }),
  cancelVideoPreview: (id: string): Promise<void> => command("cancel_video_preview", { id }),
  invalidateVideoPreview: (id: string): Promise<void> => command("invalidate_video_preview", { id }),
  setVideoPreviewActive: (id: string, active: boolean): Promise<void> => command("set_video_preview_active", { id, active }),
  getVideoPreviewCacheStatus: (): Promise<VideoPreviewCacheStatus> => command("get_video_preview_cache_status"),
  setVideoPreviewCacheLimit: (limitBytes: number): Promise<VideoPreviewCacheStatus> => command("set_video_preview_cache_limit", { limitBytes }),
  clearVideoPreviewCache: (): Promise<VideoPreviewCacheStatus> => command("clear_video_preview_cache"),
  moveAsset: (id: string, destination: string): Promise<void> => command("move_asset", { id, destination }),
  undoLastFileOperation: (): Promise<void> => command("undo_last_file_operation"),
  trashAssets: (ids: string[]): Promise<void> => command("trash_assets", { ids }),
  revealAsset: (id: string): Promise<void> => command("reveal_asset", { id }),
  openAsset: (id: string): Promise<void> => command("open_asset", { id }),
  createBackup: (): Promise<string> => command("create_backup"),
  restoreBackup: async (): Promise<void> => {
    const path = await open({ directory: false, multiple: false, filters: [{ name: "Tagloom database", extensions: ["db"] }] });
    if (typeof path === "string") await command("restore_backup", { path });
  },
  getSettings: (): Promise<Setting[]> => command("get_settings"),
  setSetting: (key: string, value: string): Promise<void> => command("set_setting", { key, value }),
  onJobProgress: (handler: (job: JobProgress) => void): Promise<UnlistenFn> => listen<JobProgress>("job-progress", (event) => handler(event.payload)),
  onVideoPreviewProgress: (handler: (progress: VideoPreviewProgress) => void): Promise<UnlistenFn> => listen<VideoPreviewProgress>("video-preview-progress", (event) => handler(event.payload)),
  onLibraryChanged: (handler: () => void): Promise<UnlistenFn> => listen("library-changed", handler),
  onSourceDirty: (handler: (sourceId: string) => void): Promise<UnlistenFn> => listen<string>("source-dirty", (event) => handler(event.payload)),
};

export type TagloomApi = typeof tauriApi;
