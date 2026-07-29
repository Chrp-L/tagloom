import { describe, expect, it } from "vitest";
import { demoApi } from "./demoApi";
import {
  demoAssets,
  demoCollectionCovers,
  demoCollectionMembers,
  demoRecentViewedIds,
  replaceDemoAssets,
  setDemoRecentViewedIds,
} from "./demoData";
import { tauriApi } from "./tauriApi";

describe("API adapters", () => {
  it("keeps the demo and Tauri adapters structurally aligned", () => {
    expect(Object.keys(demoApi).sort()).toEqual(Object.keys(tauriApi).sort());
  });

  it("filters and paginates demo assets", async () => {
    const firstPage = await demoApi.listAssets({ mediaKind: "image", sort: "name", limit: 3 });

    expect(firstPage.items).toHaveLength(3);
    expect(firstPage.items.every((asset) => asset.mediaKind === "image")).toBe(true);
    expect(firstPage.nextCursor).toBe("3");
  });

  it("returns collection covers and records recent views", async () => {
    const before = await demoApi.getHomeSnapshot();
    const asset = before.recentImported[0];

    expect(before.collections).toHaveLength(2);
    expect(before.collections.every((collection) => collection.coverAsset)).toBe(true);

    await demoApi.recordAssetViewed(asset.id);
    const after = await demoApi.getHomeSnapshot();
    expect(after.recentViewed[0]?.id).toBe(asset.id);
  });

  it("removes trashed assets from tag counts", async () => {
    const originalAssets = structuredClone(demoAssets);
    const originalMembers = structuredClone(demoCollectionMembers);
    const originalCovers = structuredClone(demoCollectionCovers);
    const originalRecent = [...demoRecentViewedIds];
    const assetId = demoAssets[0].id;
    const tagId = await demoApi.createTag("Temporary", "#ee6859");

    try {
      await demoApi.setAssetTags([assetId], tagId, true);
      expect((await demoApi.getBootstrap()).tags.find((tag) => tag.id === tagId)?.assetCount).toBe(1);

      await demoApi.trashAssets([assetId]);
      expect((await demoApi.getBootstrap()).tags.find((tag) => tag.id === tagId)?.assetCount).toBe(0);
    } finally {
      replaceDemoAssets(() => originalAssets);
      for (const key of Object.keys(demoCollectionMembers)) delete demoCollectionMembers[key];
      Object.assign(demoCollectionMembers, originalMembers);
      for (const key of Object.keys(demoCollectionCovers)) delete demoCollectionCovers[key];
      Object.assign(demoCollectionCovers, originalCovers);
      setDemoRecentViewedIds(originalRecent);
      await demoApi.deleteTag(tagId);
      await demoApi.setAssetTags([], (await demoApi.getBootstrap()).tags[0].id, false);
    }
  });

  it("persists moodboard documents and rejects an outdated revision", async () => {
    const collectionId = (await demoApi.getBootstrap()).collections[0].id;
    const asset = demoAssets[0];
    const board = await demoApi.createMoodboard(collectionId, `Moodboard test ${Date.now()}`);
    try {
      const document = {
        ...board,
        nodes: [{
          id: "asset-node",
          type: "asset" as const,
          position: { x: 0, y: 0 },
          size: { width: 240, height: 180 },
          zIndex: 1,
          data: { assetId: asset.id, fit: "cover" as const },
        }],
      };
      const saved = await demoApi.saveMoodboard(document, board.revision);
      expect(saved.revision).toBe(board.revision + 1);
      expect((await demoApi.listMoodboards(collectionId)).find((item) => item.id === board.id)).toMatchObject({ nodeCount: 1, previewAssets: [{ id: asset.id }] });
      await expect(demoApi.saveMoodboard(document, board.revision)).rejects.toThrow("revision conflict");
    } finally {
      await demoApi.deleteMoodboard(board.id);
    }
  });
});
