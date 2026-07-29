export type MediaKind = "image" | "video";
export type ThemeChoice = "system" | "light" | "dark";
export type LanguageChoice = "system" | "zh-CN" | "en";

export interface SourceRoot {
  id: string;
  path: string;
  name: string;
  status: "ready" | "scanning" | "offline";
  lastScannedAt?: string;
  assetCount: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  assetCount: number;
}

export interface Collection {
  id: string;
  name: string;
  assetCount: number;
  coverAssetId?: string;
}

export interface Asset {
  id: string;
  sourceId: string;
  path: string;
  filename: string;
  extension: string;
  mediaKind: MediaKind;
  byteSize: number;
  modifiedAt: string;
  capturedAt?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  thumbnailPath?: string;
  previewPath?: string;
  note: string;
  status: string;
  tags: Tag[];
}

export interface AssetPage {
  items: Asset[];
  nextCursor?: string;
  total: number;
}

export interface AssetQuery {
  cursor?: string;
  limit?: number;
  search?: string;
  sourceId?: string;
  tagId?: string;
  collectionId?: string;
  mediaKind?: MediaKind;
  sort?: "newest" | "oldest" | "name" | "largest";
}

export interface LibraryBootstrap {
  sources: SourceRoot[];
  tags: Tag[];
  collections: Collection[];
  totalAssets: number;
  imageCount: number;
  videoCount: number;
}

export interface CollectionHomeCard {
  id: string;
  name: string;
  assetCount: number;
  coverAsset?: Asset;
  hasCustomCover: boolean;
}

export interface HomeSnapshot {
  collections: CollectionHomeCard[];
  recentViewed: Asset[];
  recentImported: Asset[];
  recentModified: Asset[];
}

export interface JobProgress {
  id: string;
  kind: string;
  status: "running" | "paused" | "cancelled" | "complete" | "error";
  total: number;
  completed: number;
  message?: string;
}

export interface VideoPreviewProgress {
  assetId: string;
  phase: "transcoding" | "finalizing";
  percent: number;
}

export interface VideoPreviewCacheStatus {
  usedBytes: number;
  limitBytes: number;
  itemCount: number;
  pendingCleanupBytes: number;
}

export interface Setting {
  key: string;
  value: string;
}

export interface MoodboardViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface MoodboardAssetSnapshot {
  filename: string;
  mediaKind: MediaKind;
  thumbnailPath?: string;
}

export interface MoodboardAssetNode {
  id: string;
  type: "asset";
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  data: {
    assetId?: string;
    assetSnapshot?: MoodboardAssetSnapshot;
    fit: "cover" | "contain";
  };
}

export interface MoodboardTextNode {
  id: string;
  type: "text";
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  data: {
    text: string;
    fontSize: "small" | "medium" | "large";
    color: string;
    align: "left" | "center" | "right";
  };
}

export interface MoodboardSwatchNode {
  id: string;
  type: "swatch";
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  data: {
    color: string;
    name?: string;
  };
}

export type MoodboardNode = MoodboardAssetNode | MoodboardTextNode | MoodboardSwatchNode;

export type MoodboardHandlePosition = "top" | "right" | "bottom" | "left";

export interface MoodboardEdgeConfig {
  sourceHandle?: MoodboardHandlePosition;
  targetHandle?: MoodboardHandlePosition;
}

export interface MoodboardEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  color: "neutral" | "coral" | "green" | "gold";
  config?: MoodboardEdgeConfig;
}

export interface MoodboardSummary {
  id: string;
  /** The first linked context, retained for backwards-compatible clients. */
  collectionId?: string;
  collectionIds?: string[];
  contexts?: MoodboardContextRef[];
  name: string;
  nodeCount: number;
  previewAssets: Asset[];
  updatedAt: string;
}

export interface MoodboardContextRef {
  id: string;
  name: string;
}

export interface MoodboardDocument {
  id: string;
  /** The first linked context, retained for backwards-compatible documents. */
  collectionId?: string;
  collectionIds?: string[];
  contexts?: MoodboardContextRef[];
  name: string;
  viewport: MoodboardViewport;
  backgroundColor: string;
  nodes: MoodboardNode[];
  edges: MoodboardEdge[];
  revision: number;
}

export interface SaveMoodboardResult {
  revision: number;
  updatedAt: string;
}

export interface MoodboardListFilter {
  collectionId?: string;
}

export interface CreateMoodboardInput {
  name?: string;
  collectionIds?: string[];
}
