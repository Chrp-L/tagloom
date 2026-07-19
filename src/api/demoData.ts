import type { Asset, AssetPage, AssetQuery, LibraryBootstrap } from "../types";

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

export let demoBootstrap: LibraryBootstrap = {
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

export let demoAssets: Asset[] = Array.from({ length: 24 }, (_, index) => {
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

export const demoCollectionCovers: Record<string, string | undefined> = {};
export let demoRecentViewedIds: string[] = [];
export const demoCollectionMembers: Record<string, string[]> = {
  "collection-summer": demoAssets.slice(0, 9).map((asset) => asset.id),
  "collection-campaign": demoAssets.slice(5, 11).map((asset) => asset.id),
};

export function filteredDemo(query: AssetQuery): AssetPage {
  let result = [...demoAssets];
  if (query.sourceId) result = result.filter((item) => item.sourceId === query.sourceId);
  if (query.mediaKind) result = result.filter((item) => item.mediaKind === query.mediaKind);
  if (query.tagId) result = result.filter((item) => item.tags.some((tag) => tag.id === query.tagId));
  if (query.collectionId) {
    const memberIds = new Set(demoCollectionMembers[query.collectionId] ?? []);
    result = result.filter((item) => memberIds.has(item.id));
  }
  if (query.search) {
    const term = query.search.toLowerCase();
    result = result.filter((item) => `${item.filename} ${item.path} ${item.note} ${item.tags.map((tag) => tag.name).join(" ")}`.toLowerCase().includes(term));
  }
  result.sort((a, b) => query.sort === "name" ? a.filename.localeCompare(b.filename) : query.sort === "oldest" ? a.modifiedAt.localeCompare(b.modifiedAt) : query.sort === "largest" ? b.byteSize - a.byteSize : b.modifiedAt.localeCompare(a.modifiedAt));
  const offset = Number(query.cursor || 0);
  const limit = query.limit || 120;
  return { items: result.slice(offset, offset + limit), total: result.length, nextCursor: offset + limit < result.length ? String(offset + limit) : undefined };
}

export function setDemoRecentViewedIds(ids: string[]): void {
  demoRecentViewedIds = ids;
}

export function replaceDemoAssets(update: (assets: Asset[]) => Asset[]): void {
  demoAssets = update(demoAssets);
}
