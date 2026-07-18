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

export interface JobProgress {
  id: string;
  kind: string;
  status: "running" | "paused" | "cancelled" | "complete" | "error";
  total: number;
  completed: number;
  message?: string;
}

export interface Setting {
  key: string;
  value: string;
}
