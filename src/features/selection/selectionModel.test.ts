import { describe, expect, it } from "vitest";
import {
  checkRange,
  clearChecked,
  clearFocus,
  enterBatchSelection,
  exitBatchSelection,
  focusAsset,
  getAssetActionTargets,
  resetAssetContext,
  toggleChecked,
} from "./selectionModel";
import type { AssetInteractionState } from "./selectionModel";

const browseState = (overrides: Partial<AssetInteractionState> = {}): AssetInteractionState => ({
  ...resetAssetContext(),
  ...overrides,
});

const batchState = (overrides: Partial<AssetInteractionState> = {}): AssetInteractionState => ({
  ...enterBatchSelection(resetAssetContext()),
  ...overrides,
});

describe("asset interaction model", () => {
  it("enters batch mode without discarding the browse focus", () => {
    expect(enterBatchSelection(browseState({ focusedAssetId: "a" }))).toEqual({
      selectionMode: "batch",
      focusedAssetId: "a",
      checkedIds: [],
      selectionAnchorId: undefined,
    });
  });

  it("exits batch mode, clears checks and restores the retained focus", () => {
    expect(exitBatchSelection(batchState({ focusedAssetId: "a", checkedIds: ["b"], selectionAnchorId: "b" }))).toEqual({
      selectionMode: "browse",
      focusedAssetId: "a",
      checkedIds: [],
      selectionAnchorId: undefined,
    });
  });

  it("only changes focus in browse mode", () => {
    expect(focusAsset(browseState({ focusedAssetId: "a" }), "c").focusedAssetId).toBe("c");
    const batch = batchState({ focusedAssetId: "a" });
    expect(focusAsset(batch, "c")).toBe(batch);
  });

  it("only toggles checks in batch mode and records the anchor", () => {
    expect(toggleChecked(browseState(), "a")).toEqual(browseState());
    const added = toggleChecked(batchState({ focusedAssetId: "z" }), "b");
    expect(added).toEqual({ selectionMode: "batch", focusedAssetId: "z", checkedIds: ["b"], selectionAnchorId: "b" });
    expect(toggleChecked(added, "b")).toEqual({ selectionMode: "batch", focusedAssetId: "z", checkedIds: [], selectionAnchorId: "b" });
  });

  it("replaces checks with a forward or reverse range", () => {
    const ordered = ["a", "b", "c", "d", "e"];
    const anchored = batchState({ checkedIds: ["b", "e"], selectionAnchorId: "b" });
    expect(checkRange(anchored, ordered, "e").checkedIds).toEqual(["b", "c", "d", "e"]);
    expect(checkRange(batchState({ selectionAnchorId: "e" }), ordered, "b").checkedIds).toEqual(["b", "c", "d", "e"]);
  });

  it("keeps the initial anchor across repeated Shift ranges", () => {
    const ordered = ["a", "b", "c", "d", "e"];
    const anchored = toggleChecked(batchState(), "b");
    const expanded = checkRange(anchored, ordered, "e");
    const contracted = checkRange(expanded, ordered, "c");
    expect(expanded).toMatchObject({ checkedIds: ["b", "c", "d", "e"], selectionAnchorId: "b" });
    expect(contracted).toMatchObject({ checkedIds: ["b", "c"], selectionAnchorId: "b" });
  });

  it("falls back to a normal toggle when the anchor is missing from the current order", () => {
    expect(checkRange(batchState(), ["a", "b"], "b")).toMatchObject({ checkedIds: ["b"], selectionAnchorId: "b" });
    expect(checkRange(batchState({ selectionAnchorId: "missing" }), ["a", "b"], "a")).toMatchObject({ checkedIds: ["a"], selectionAnchorId: "a" });
  });

  it("clears focus and checked state independently", () => {
    const state = batchState({ focusedAssetId: "a", checkedIds: ["b"], selectionAnchorId: "b" });
    expect(clearFocus(state)).toMatchObject({ focusedAssetId: undefined, checkedIds: ["b"], selectionAnchorId: "b" });
    expect(clearChecked(state)).toMatchObject({ selectionMode: "batch", focusedAssetId: "a", checkedIds: [], selectionAnchorId: undefined });
  });

  it("uses mode-specific action targets", () => {
    expect(getAssetActionTargets(batchState({ focusedAssetId: "a", checkedIds: ["b", "c"] }))).toEqual(["b", "c"]);
    expect(getAssetActionTargets(browseState({ focusedAssetId: "a" }))).toEqual(["a"]);
    expect(getAssetActionTargets(batchState({ focusedAssetId: "a" }))).toEqual([]);
  });

  it("resets the complete interaction context to browse mode", () => {
    expect(resetAssetContext()).toEqual({ selectionMode: "browse", focusedAssetId: undefined, checkedIds: [], selectionAnchorId: undefined });
  });
});
