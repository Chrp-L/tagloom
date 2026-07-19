import { describe, expect, it } from "vitest";
import { demoApi } from "./demoApi";
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
});
