import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type { Asset, AssetPage, AssetQuery, JobProgress, LibraryBootstrap, Setting, Tag } from "./types";

export const isTauri = "__TAURI_INTERNALS__" in window;

const photoUrls = [
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1510798831971-661eb04b3739?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1523712999610-f77fbcfc3843?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=900&q=82",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=900&q=82",
];

let demoBootstrap: LibraryBootstrap = {
  sources: [{ id: "demo-source", path: "D:\\Creative\\Field Notes", name: "Field Notes", status: "ready", lastScannedAt: new Date().toISOString(), assetCount: 24 }],
  tags: [
    { id: "tag-forest", name: "Forest", color: "#3f8f74", assetCount: 8 },
    { id: "tag-editorial", name: "Editorial", color: "#ee6859", assetCount: 5 },
    { id: "tag-reference", name: "Reference", color: "#d4a43d", assetCount: 7 },
    { id: "tag-motion", name: "Motion", color: "#5589a6", assetCount: 4 },
  ],
  collections: [
    { id: "collection-summer", name: "Summer studies", assetCount: 9 },
    { id: "collection-campaign", name: "Campaign selects", assetCount: 6 },
  ],
  totalAssets: 24,
  imageCount: 20,
  videoCount: 4,
};

let demoAssets: Asset[] = Array.from({ length: 24 }, (_, index) => {
  const video = index % 7 === 5;
  const date = new Date(Date.now() - index * 86400000 * 2.4).toISOString();
  return {
    id: `demo-${index}`,
    sourceId: "demo-source",
    path: `D:\\Creative\\Field Notes\\${video ? "motion" : "stills"}\\${String(index + 1).padStart(2, "0")}-${video ? "forest-walk.mp4" : "field-study.jpg"}`,
    filename: `${String(index + 1).padStart(2, "0")}-${video ? "forest-walk.mp4" : "field-study.jpg"}`,
    extension: video ? "mp4" : "jpg",
    mediaKind: video ? "video" : "image",
    byteSize: video ? 68_400_000 + index * 1024 : 3_600_000 + index * 2048,
    modifiedAt: date,
    capturedAt: date,
    width: index % 3 === 0 ? 3024 : 4032,
    height: index % 3 === 0 ? 4032 : 3024,
    durationMs: video ? 43_000 + index * 1100 : undefined,
    thumbnailPath: photoUrls[index % photoUrls.length],
    note: index === 0 ? "Soft morning light. Keep for the opening sequence." : "",
    status: "ready",
    tags: index % 3 === 0 ? [demoBootstrap.tags[0]] : index % 4 === 0 ? [demoBootstrap.tags[1], demoBootstrap.tags[2]] : [],
  };
});

function filteredDemo(query: AssetQuery): AssetPage {
  let result = [...demoAssets];
  if (query.sourceId) result = result.filter((item) => item.sourceId === query.sourceId);
  if (query.mediaKind) result = result.filter((item) => item.mediaKind === query.mediaKind);
  if (query.tagId) result = result.filter((item) => item.tags.some((tag) => tag.id === query.tagId));
  if (query.collectionId === "collection-summer") result = result.slice(0, 9);
  if (query.collectionId === "collection-campaign") result = result.slice(5, 11);
  if (query.search) {
    const term = query.search.toLowerCase();
    result = result.filter((item) => `${item.filename} ${item.path} ${item.note} ${item.tags.map((tag) => tag.name).join(" ")}`.toLowerCase().includes(term));
  }
  result.sort((a, b) => query.sort === "name" ? a.filename.localeCompare(b.filename) : query.sort === "oldest" ? a.modifiedAt.localeCompare(b.modifiedAt) : query.sort === "largest" ? b.byteSize - a.byteSize : b.modifiedAt.localeCompare(a.modifiedAt));
  const offset = Number(query.cursor || 0);
  const limit = query.limit || 120;
  return { items: result.slice(offset, offset + limit), total: result.length, nextCursor: offset + limit < result.length ? String(offset + limit) : undefined };
}

async function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>(name, args);
}

export const api = {
  getBootstrap: async (): Promise<LibraryBootstrap> => isTauri ? command("get_bootstrap") : structuredClone(demoBootstrap),
  listAssets: async (query: AssetQuery): Promise<AssetPage> => isTauri ? command("list_assets", { query }) : filteredDemo(query),
  pickFolder: async (): Promise<string | null> => {
    if (!isTauri) return null;
    const selected = await open({ directory: true, multiple: false, title: "Choose a media folder" });
    return typeof selected === "string" ? selected : null;
  },
  addSource: async (path: string): Promise<string> => command("add_source", { path }),
  removeSource: async (id: string): Promise<void> => command("remove_source", { id }),
  rescanSource: async (id: string): Promise<string> => command("rescan_source", { id }),
  controlJob: async (id: string, action: "pause" | "resume" | "cancel"): Promise<void> => command("control_job", { id, action }),
  getRecentJobs: async (): Promise<JobProgress[]> => isTauri ? command("get_recent_jobs") : [],
  reportFrontendError: async (message: string): Promise<void> => isTauri ? command("report_frontend_error", { message }) : undefined,
  createTag: async (name: string, color: string): Promise<string> => {
    if (isTauri) return command("create_tag", { name, color });
    const id = `tag-${Date.now()}`;
    demoBootstrap.tags.push({ id, name, color, assetCount: 0 });
    return id;
  },
  updateTag: async (id: string, name: string, color: string): Promise<void> => command("update_tag", { id, name, color }),
  deleteTag: async (id: string): Promise<void> => command("delete_tag", { id }),
  setAssetTags: async (assetIds: string[], tagId: string, attached: boolean): Promise<void> => {
    if (isTauri) return command("set_asset_tags", { assetIds, tagId, attached });
    const tag = demoBootstrap.tags.find((item) => item.id === tagId);
    if (!tag) return;
    demoAssets = demoAssets.map((asset) => assetIds.includes(asset.id)
      ? { ...asset, tags: attached ? [...asset.tags.filter((item) => item.id !== tagId), tag] : asset.tags.filter((item) => item.id !== tagId) }
      : asset);
  },
  createCollection: async (name: string): Promise<string> => {
    if (isTauri) return command("create_collection", { name });
    const id = `collection-${Date.now()}`;
    demoBootstrap.collections.push({ id, name, assetCount: 0 });
    return id;
  },
  deleteCollection: async (id: string): Promise<void> => command("delete_collection", { id }),
  setCollectionAssets: async (collectionId: string, assetIds: string[], attached: boolean): Promise<void> => command("set_collection_assets", { collectionId, assetIds, attached }),
  updateAssetNote: async (id: string, note: string): Promise<void> => {
    if (isTauri) return command("update_asset_note", { id, note });
    demoAssets = demoAssets.map((asset) => asset.id === id ? { ...asset, note } : asset);
  },
  prepareVideoPreview: async (id: string): Promise<string | undefined> => {
    if (isTauri) return command("prepare_video_preview", { id });
    return demoAssets.find((asset) => asset.id === id)?.thumbnailPath;
  },
  moveAsset: async (id: string, destination: string): Promise<void> => command("move_asset", { id, destination }),
  undoLastFileOperation: async (): Promise<void> => command("undo_last_file_operation"),
  trashAssets: async (ids: string[]): Promise<void> => command("trash_assets", { ids }),
  revealAsset: async (id: string): Promise<void> => command("reveal_asset", { id }),
  openAsset: async (id: string): Promise<void> => command("open_asset", { id }),
  createBackup: async (): Promise<string> => isTauri ? command("create_backup") : "D:\\Backups\\tagloom-demo.db",
  restoreBackup: async (): Promise<void> => {
    if (!isTauri) return;
    const path = await open({ directory: false, multiple: false, filters: [{ name: "Tagloom database", extensions: ["db"] }] });
    if (typeof path === "string") await command("restore_backup", { path });
  },
  getSettings: async (): Promise<Setting[]> => isTauri ? command("get_settings") : [],
  setSetting: async (key: string, value: string): Promise<void> => isTauri ? command("set_setting", { key, value }) : undefined,
  onJobProgress: async (handler: (job: JobProgress) => void): Promise<UnlistenFn> => isTauri ? listen<JobProgress>("job-progress", (event) => handler(event.payload)) : () => undefined,
  onLibraryChanged: async (handler: () => void): Promise<UnlistenFn> => isTauri ? listen("library-changed", handler) : () => undefined,
  onSourceDirty: async (handler: (sourceId: string) => void): Promise<UnlistenFn> => isTauri ? listen<string>("source-dirty", (event) => handler(event.payload)) : () => undefined,
};

export function mediaUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:/.test(path)) return path;
  return isTauri ? convertFileSrc(path) : path;
}

export function findTag(tags: Tag[], id: string): Tag | undefined {
  return tags.find((tag) => tag.id === id);
}
