import type { Asset, HomeSnapshot, MoodboardDocument, MoodboardNode, MoodboardSummary, SaveMoodboardResult, Setting, VideoPreviewCacheStatus } from "../types";
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
const demoMoodboards = new Map<string, MoodboardDocument & { updatedAt: string }>();
let demoMoodboardCounter = 0;

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

function defaultMoodboardName(collectionId: string): string {
  const names = new Set([...demoMoodboards.values()].filter((item) => item.collectionId === collectionId).map((item) => item.name.toLocaleLowerCase()));
  let index = 1;
  while (names.has(`untitled moodboard ${index}`.toLocaleLowerCase())) index += 1;
  return `Untitled moodboard ${index}`;
}

function requireMoodboardName(collectionId: string, name: string, exceptId?: string): string {
  const normalized = name.trim();
  if (Array.from(normalized).length < 1 || Array.from(normalized).length > 80) throw new Error("Moodboard names must contain 1 to 80 characters");
  if ([...demoMoodboards.values()].some((item) => item.collectionId === collectionId && item.id !== exceptId && item.name.localeCompare(normalized, undefined, { sensitivity: "accent" }) === 0)) {
    throw new Error("A moodboard with this name already exists in this context");
  }
  return normalized;
}

function moodboardSummary(document: MoodboardDocument & { updatedAt: string }): MoodboardSummary {
  const previewAssets = document.nodes.flatMap((node) => node.type === "asset" && node.data.assetId ? [demoAssets.find((asset) => asset.id === node.data.assetId)] : []).filter((asset): asset is Asset => Boolean(asset)).slice(0, 3);
  return { id: document.id, collectionId: document.collectionId, name: document.name, nodeCount: document.nodes.length, previewAssets: clone(previewAssets), updatedAt: document.updatedAt };
}

function clearMoodboardAssets(ids: string[]): void {
  const deleted = new Set(ids);
  for (const [id, document] of demoMoodboards) {
    let changed = false;
    const nodes = document.nodes.map((node): MoodboardNode => {
      if (node.type !== "asset" || !node.data.assetId || !deleted.has(node.data.assetId)) return node;
      const asset = demoAssets.find((item) => item.id === node.data.assetId);
      changed = true;
      return { ...node, data: { ...node.data, assetId: undefined, assetSnapshot: node.data.assetSnapshot ?? (asset ? { filename: asset.filename, mediaKind: asset.mediaKind, thumbnailPath: asset.thumbnailPath } : undefined) } };
    });
    if (changed) demoMoodboards.set(id, { ...document, nodes, revision: document.revision + 1, updatedAt: new Date().toISOString() });
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
    const removedIds = demoAssets.filter((asset) => asset.sourceId === id).map((asset) => asset.id);
    clearMoodboardAssets(removedIds);
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
    for (const [moodboardId, document] of demoMoodboards) if (document.collectionId === id) demoMoodboards.delete(moodboardId);
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
  listMoodboards: async (collectionId) => [...demoMoodboards.values()]
    .filter((item) => item.collectionId === collectionId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(moodboardSummary),
  createMoodboard: async (collectionId, name) => {
    if (!demoBootstrap.collections.some((collection) => collection.id === collectionId)) throw new Error("Context not found");
    const now = new Date().toISOString();
    const id = `moodboard-${Date.now()}-${++demoMoodboardCounter}`;
    const document: MoodboardDocument & { updatedAt: string } = {
      id, collectionId, name: requireMoodboardName(collectionId, name || defaultMoodboardName(collectionId)),
      viewport: { x: 0, y: 0, zoom: 1 }, backgroundColor: "#f1f2ef", nodes: [], edges: [], revision: 0, updatedAt: now,
    };
    demoMoodboards.set(id, document);
    return clone(document);
  },
  getMoodboard: async (id) => {
    const document = demoMoodboards.get(id);
    if (!document) throw new Error("Moodboard not found");
    return clone(document);
  },
  saveMoodboard: async (document, expectedRevision): Promise<SaveMoodboardResult> => {
    const existing = demoMoodboards.get(document.id);
    if (!existing) throw new Error("Moodboard not found");
    if (existing.revision !== expectedRevision) throw new Error("Moodboard revision conflict");
    if (document.collectionId !== existing.collectionId) throw new Error("Moodboard context cannot change");
    requireMoodboardName(document.collectionId, document.name, document.id);
    if (document.nodes.length > 500 || document.edges.length > 1_000) throw new Error("Moodboard exceeds the supported element limit");
    const nodeIds = new Set(document.nodes.map((node) => node.id));
    if (nodeIds.size !== document.nodes.length || document.edges.some((edge) => !nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId))) throw new Error("Moodboard contains invalid connections");
    if (document.nodes.some((node) => node.type === "asset" && node.data.assetId && !demoAssets.some((asset) => asset.id === node.data.assetId))) throw new Error("Moodboard references an unavailable asset");
    const updatedAt = new Date().toISOString();
    const revision = existing.revision + 1;
    demoMoodboards.set(document.id, { ...clone(document), revision, updatedAt });
    return { revision, updatedAt };
  },
  renameMoodboard: async (id, name) => {
    const document = demoMoodboards.get(id);
    if (!document) throw new Error("Moodboard not found");
    demoMoodboards.set(id, { ...document, name: requireMoodboardName(document.collectionId, name, id), revision: document.revision + 1, updatedAt: new Date().toISOString() });
  },
  deleteMoodboard: async (id) => { demoMoodboards.delete(id); },
  pickMoodboardExportPath: async (name) => `demo-download://${name || "moodboard"}.png`,
  writeMoodboardExport: async (path, bytes) => {
    if (!path.startsWith("demo-download://")) throw new Error("Demo exports require a download target");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "image/png" }));
    anchor.download = path.slice("demo-download://".length);
    anchor.click();
    URL.revokeObjectURL(anchor.href);
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
    clearMoodboardAssets(ids);
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
