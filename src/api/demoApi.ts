import type { Asset, HomeSnapshot, Setting, VideoPreviewCacheStatus } from "../types";
import type { TagloomApi } from "./tauriApi";
import {
  demoAssets,
  demoBootstrap,
  demoCollectionCovers,
  demoCollectionMembers,
  demoRecentViewedIds,
  filteredDemo,
  replaceDemoAssets,
  setDemoRecentViewedIds,
} from "./demoData";

const demoSettings = new Map<string, string>();
const DEFAULT_VIDEO_CACHE_LIMIT = 5 * 1024 ** 3;
let demoVideoCacheStatus: VideoPreviewCacheStatus = { usedBytes: 0, limitBytes: DEFAULT_VIDEO_CACHE_LIMIT, itemCount: 0, pendingCleanupBytes: 0 };

function clone<T>(value: T): T {
  return structuredClone(value);
}

function updateDemoCounts(): void {
  demoBootstrap.totalAssets = demoAssets.length;
  demoBootstrap.imageCount = demoAssets.filter((asset) => asset.mediaKind === "image").length;
  demoBootstrap.videoCount = demoAssets.filter((asset) => asset.mediaKind === "video").length;
  for (const source of demoBootstrap.sources) {
    source.assetCount = demoAssets.filter((asset) => asset.sourceId === source.id).length;
  }
  for (const tag of demoBootstrap.tags) {
    tag.assetCount = demoAssets.filter((asset) => asset.tags.some((item) => item.id === tag.id)).length;
  }
}

function homeSnapshot(): HomeSnapshot {
  const recent = (items: Asset[]) => items.slice(0, 8).map(clone);
  const collectionAssets = (id: string) => filteredDemo({ collectionId: id, sort: "newest", limit: 120 }).items;
  return {
    collections: demoBootstrap.collections.slice(0, 6).map((collection) => {
      const items = collectionAssets(collection.id);
      const coverId = demoCollectionCovers[collection.id];
      const coverAsset = items.find((asset) => asset.id === coverId) ?? items[0];
      return {
        ...clone(collection),
        coverAsset: coverAsset ? clone(coverAsset) : undefined,
        hasCustomCover: Boolean(coverId && items.some((asset) => asset.id === coverId)),
      };
    }),
    recentViewed: recent(demoRecentViewedIds.map((id) => demoAssets.find((asset) => asset.id === id)).filter((asset): asset is Asset => Boolean(asset))),
    recentImported: recent([...demoAssets].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))),
    recentModified: recent([...demoAssets].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))),
  };
}

export const demoApi = {
  getBootstrap: async () => clone(demoBootstrap),
  getHomeSnapshot: async () => homeSnapshot(),
  listAssets: async (query) => filteredDemo(query),
  pickFolder: async () => null,
  addSource: async (path) => {
    const id = `source-${Date.now()}`;
    const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
    demoBootstrap.sources.push({ id, path, name, status: "ready", lastScannedAt: new Date().toISOString(), assetCount: 0 });
    return id;
  },
  removeSource: async (id) => {
    demoBootstrap.sources = demoBootstrap.sources.filter((source) => source.id !== id);
    replaceDemoAssets((assets) => assets.filter((asset) => asset.sourceId !== id));
    updateDemoCounts();
  },
  rescanSource: async (id) => `demo-rescan-${id}`,
  controlJob: async () => undefined,
  getRecentJobs: async () => [],
  reportFrontendError: async () => undefined,
  createTag: async (name, color) => {
    const id = `tag-${Date.now()}`;
    demoBootstrap.tags.push({ id, name, color, assetCount: 0 });
    return id;
  },
  updateTag: async (id, name, color) => {
    const tag = demoBootstrap.tags.find((item) => item.id === id);
    if (tag) Object.assign(tag, { name, color });
  },
  deleteTag: async (id) => {
    demoBootstrap.tags = demoBootstrap.tags.filter((tag) => tag.id !== id);
    replaceDemoAssets((assets) => assets.map((asset) => ({ ...asset, tags: asset.tags.filter((tag) => tag.id !== id) })));
  },
  setAssetTags: async (assetIds, tagId, attached) => {
    const tag = demoBootstrap.tags.find((item) => item.id === tagId);
    if (!tag) return;
    replaceDemoAssets((assets) => assets.map((asset) => assetIds.includes(asset.id)
      ? { ...asset, tags: attached ? [...asset.tags.filter((item) => item.id !== tagId), tag] : asset.tags.filter((item) => item.id !== tagId) }
      : asset));
    updateDemoCounts();
  },
  createCollection: async (name) => {
    const id = `collection-${Date.now()}`;
    demoBootstrap.collections.push({ id, name, assetCount: 0 });
    demoCollectionMembers[id] = [];
    return id;
  },
  deleteCollection: async (id) => {
    demoBootstrap.collections = demoBootstrap.collections.filter((collection) => collection.id !== id);
    delete demoCollectionMembers[id];
    delete demoCollectionCovers[id];
  },
  setCollectionAssets: async (collectionId, assetIds, attached) => {
    const current = demoCollectionMembers[collectionId] ?? [];
    demoCollectionMembers[collectionId] = attached
      ? [...current, ...assetIds.filter((id) => !current.includes(id))]
      : current.filter((id) => !assetIds.includes(id));
    const collection = demoBootstrap.collections.find((item) => item.id === collectionId);
    if (collection) collection.assetCount = demoCollectionMembers[collectionId].length;
    if (!attached && demoCollectionCovers[collectionId] && assetIds.includes(demoCollectionCovers[collectionId]!)) {
      delete demoCollectionCovers[collectionId];
      if (collection) collection.coverAssetId = undefined;
    }
  },
  setCollectionCover: async (collectionId, assetId) => {
    demoCollectionCovers[collectionId] = assetId;
    const collection = demoBootstrap.collections.find((item) => item.id === collectionId);
    if (collection) collection.coverAssetId = assetId;
  },
  clearCollectionCover: async (collectionId) => {
    delete demoCollectionCovers[collectionId];
    const collection = demoBootstrap.collections.find((item) => item.id === collectionId);
    if (collection) collection.coverAssetId = undefined;
  },
  recordAssetViewed: async (id) => {
    setDemoRecentViewedIds([id, ...demoRecentViewedIds.filter((value) => value !== id)].slice(0, 24));
  },
  updateAssetNote: async (id, note) => {
    replaceDemoAssets((assets) => assets.map((asset) => asset.id === id ? { ...asset, note } : asset));
  },
  prepareVideoPreview: async (id) => demoAssets.find((asset) => asset.id === id)?.previewPath ?? demoAssets.find((asset) => asset.id === id)?.path,
  cancelVideoPreview: async () => undefined,
  invalidateVideoPreview: async (id) => {
    replaceDemoAssets((assets) => assets.map((asset) => asset.id === id ? { ...asset, previewPath: undefined } : asset));
  },
  setVideoPreviewActive: async () => undefined,
  getVideoPreviewCacheStatus: async () => clone(demoVideoCacheStatus),
  setVideoPreviewCacheLimit: async (limitBytes) => {
    demoVideoCacheStatus = { ...demoVideoCacheStatus, limitBytes };
    return clone(demoVideoCacheStatus);
  },
  clearVideoPreviewCache: async () => {
    demoVideoCacheStatus = { ...demoVideoCacheStatus, usedBytes: 0, itemCount: 0, pendingCleanupBytes: 0 };
    return clone(demoVideoCacheStatus);
  },
  moveAsset: async (id, destination) => {
    const filename = destination.split(/[\\/]/).filter(Boolean).at(-1) ?? destination;
    replaceDemoAssets((assets) => assets.map((asset) => asset.id === id ? { ...asset, path: destination, filename } : asset));
  },
  undoLastFileOperation: async () => undefined,
  trashAssets: async (ids) => {
    replaceDemoAssets((assets) => assets.filter((asset) => !ids.includes(asset.id)));
    for (const [collectionId, members] of Object.entries(demoCollectionMembers)) {
      demoCollectionMembers[collectionId] = members.filter((id) => !ids.includes(id));
      const collection = demoBootstrap.collections.find((item) => item.id === collectionId);
      if (collection) collection.assetCount = demoCollectionMembers[collectionId].length;
      if (demoCollectionCovers[collectionId] && ids.includes(demoCollectionCovers[collectionId]!)) {
        delete demoCollectionCovers[collectionId];
        if (collection) collection.coverAssetId = undefined;
      }
    }
    setDemoRecentViewedIds(demoRecentViewedIds.filter((id) => !ids.includes(id)));
    updateDemoCounts();
  },
  revealAsset: async () => undefined,
  openAsset: async () => undefined,
  createBackup: async () => "D:\\Backups\\tagloom-demo.db",
  restoreBackup: async () => undefined,
  getSettings: async (): Promise<Setting[]> => [...demoSettings].map(([key, value]) => ({ key, value })),
  setSetting: async (key, value) => {
    demoSettings.set(key, value);
  },
  onJobProgress: async () => () => undefined,
  onVideoPreviewProgress: async () => () => undefined,
  onLibraryChanged: async () => () => undefined,
  onSourceDirty: async () => () => undefined,
} satisfies TagloomApi;
