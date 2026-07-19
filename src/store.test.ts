import { beforeEach, describe, expect, it } from "vitest";
import { parseSidebarPreferences, useUiStore } from "./store";

beforeEach(() => {
  useUiStore.setState({
    navigation: { kind: "home" },
    selectionMode: "browse",
    focusedAssetId: undefined,
    checkedIds: [],
    selectionAnchorId: undefined,
    view: "grid",
    gridColumns: 4,
  });
});

describe("sidebar preferences", () => {
  it("restores valid persisted state", () => {
    expect(parseSidebarPreferences(JSON.stringify({ sidebarCollapsed: true, collapsedSections: { sources: true, tags: true } }))).toEqual({
      sidebarCollapsed: true,
      collapsedSections: { sources: true, collections: false, tags: true },
    });
  });

  it("falls back safely for invalid state", () => {
    expect(parseSidebarPreferences("not-json")).toEqual({
      sidebarCollapsed: false,
      collapsedSections: { sources: false, collections: false, tags: false },
    });
  });
});

describe("asset interaction store", () => {
  it("keeps focus, checks and the anchor across view and column changes", () => {
    const store = useUiStore.getState();
    store.focusAsset("a");
    store.enterBatchSelection();
    store.toggleChecked("b");
    useUiStore.getState().setView("list");
    useUiStore.getState().setGridColumns(3);
    expect(useUiStore.getState()).toMatchObject({ selectionMode: "batch", focusedAssetId: "a", checkedIds: ["b"], selectionAnchorId: "b" });
  });

  it("resets the complete interaction context when navigation changes", () => {
    const store = useUiStore.getState();
    store.focusAsset("a");
    store.enterBatchSelection();
    store.toggleChecked("b");
    useUiStore.getState().setNavigation({ kind: "media", mediaKind: "image" });
    expect(useUiStore.getState()).toMatchObject({ selectionMode: "browse", focusedAssetId: undefined, checkedIds: [], selectionAnchorId: undefined });
  });

  it("exits batch mode without discarding the retained focus", () => {
    const store = useUiStore.getState();
    store.focusAsset("a");
    store.enterBatchSelection();
    store.toggleChecked("b");
    useUiStore.getState().exitBatchSelection();
    expect(useUiStore.getState()).toMatchObject({ selectionMode: "browse", focusedAssetId: "a", checkedIds: [], selectionAnchorId: undefined });
  });

  it("computes Shift ranges from the supplied visible order", () => {
    const store = useUiStore.getState();
    store.enterBatchSelection();
    store.toggleChecked("b");
    useUiStore.getState().checkRange(["a", "b", "c", "d"], "d");
    expect(useUiStore.getState()).toMatchObject({ checkedIds: ["b", "c", "d"], selectionAnchorId: "b" });
  });
});
