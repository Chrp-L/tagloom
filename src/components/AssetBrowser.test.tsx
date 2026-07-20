import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRange,
  enterBatchSelection,
  focusAsset,
  resetAssetContext,
  toggleChecked,
} from "../features/selection/selectionModel";
import type { AssetInteractionState, SelectionMode } from "../features/selection/selectionModel";
import { attachAssetInteraction, assetInteractionIntentFromEvent } from "../lib/assetSelection";
import { attachModifierKeyTracking, createModifierKeyState } from "../lib/modifierKeys";
import type { Asset } from "../types";
import { AssetBrowser } from "./AssetBrowser";

const assets: Asset[] = ["a", "b", "c", "d"].map((id) => ({
  id,
  filename: `${id}.jpg`,
  path: `C:/media/${id}.jpg`,
  sourceId: "source",
  extension: "jpg",
  mediaKind: "image",
  byteSize: 10,
  modifiedAt: "2026-01-01T00:00:00Z",
  note: "",
  status: "ready",
  tags: [],
}));
const orderedIds = assets.map((asset) => asset.id);

function InteractionHarness({ view, initialMode = "browse", onPreview = vi.fn(), onTrash = vi.fn() }: { view: "grid" | "list"; initialMode?: SelectionMode; onPreview?: (asset: Asset) => void; onTrash?: (ids: string[]) => void }) {
  const [interaction, setInteraction] = useState<AssetInteractionState>(() => initialMode === "batch" ? enterBatchSelection(resetAssetContext()) : resetAssetContext());
  return <AssetBrowser
    assets={assets}
    total={assets.length}
    view={view}
    gridColumns={4}
    selectionMode={interaction.selectionMode}
    focusedAssetId={interaction.focusedAssetId}
    checkedIds={interaction.checkedIds}
    loading={false}
    hasMore={false}
    noSources={false}
    contentMotionKey={view}
    onLoadMore={vi.fn()}
    onFocus={(assetId) => setInteraction((current) => focusAsset(current, assetId))}
    onToggleChecked={(assetId) => setInteraction((current) => toggleChecked(current, assetId))}
    onCheckRange={(assetId) => setInteraction((current) => checkRange(current, orderedIds, assetId))}
    onPreview={onPreview}
    onOpen={vi.fn()}
    onReveal={vi.fn()}
    onRename={vi.fn()}
    onMove={vi.fn()}
    onTrash={onTrash}
    onAddSource={vi.fn()}
  />;
}

function physicalClick(target: Element, modifiers: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; detail?: number } = {}) {
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true, ctrlKey: false, metaKey: false, shiftKey: false });
  fireEvent.mouseDown(target, { button: 0, ctrlKey: false, metaKey: false, shiftKey: false });
  fireEvent.click(target, { button: 0, detail: 1, ...modifiers });
}

function interactionFixture(selectionMode: SelectionMode = "browse") {
  const viewport = document.createElement("div");
  viewport.innerHTML = '<article data-asset-id="a"><strong>First</strong><button data-selection-control>check</button></article><article data-asset-id="b"><strong>Second</strong></article>';
  document.body.append(viewport);
  const modifiers = createModifierKeyState();
  const onInteract = vi.fn();
  const detachInteraction = attachAssetInteraction(viewport, modifiers, selectionMode, onInteract);
  return { viewport, modifiers, onInteract, detachInteraction };
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe.each(["grid", "list"] as const)("%s browse mode", (view) => {
  it("hides checkboxes and uses body clicks only for focus", async () => {
    render(<InteractionHarness view={view} />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    expect(document.querySelector("[data-selection-control]")).toBeNull();
    physicalClick(document.querySelectorAll("[data-asset-id]")[2]);
    await waitFor(() => expect(document.querySelector(".focused")?.getAttribute("data-asset-id")).toBe("c"));
    expect(document.querySelector(".checked")).toBeNull();
  });

  it("keeps Ctrl and Command clicks in browse focus semantics", async () => {
    render(<InteractionHarness view={view} />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    physicalClick(document.querySelectorAll("[data-asset-id]")[1], { ctrlKey: true });
    physicalClick(document.querySelectorAll("[data-asset-id]")[3], { metaKey: true });
    await waitFor(() => expect(document.querySelector(".focused")?.getAttribute("data-asset-id")).toBe("d"));
    expect(document.querySelector(".checked")).toBeNull();
  });

  it("previews on double click and clears focus from the viewport background", async () => {
    const onPreview = vi.fn();
    render(<InteractionHarness view={view} onPreview={onPreview} />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    const item = document.querySelectorAll<HTMLElement>("[data-asset-id]")[0];
    physicalClick(item);
    fireEvent.doubleClick(item);
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
    fireEvent.click(document.querySelector(".assetViewport")!);
    await waitFor(() => expect(document.querySelector(".focused")).toBeNull());
  });
});

describe.each(["grid", "list"] as const)("%s batch mode", (view) => {
  it("shows a checkbox for every rendered asset", async () => {
    render(<InteractionHarness view={view} initialMode="batch" />);
    await waitFor(() => expect(document.querySelectorAll('[role="checkbox"]')).toHaveLength(4));
    expect(document.querySelector(".focused")).toBeNull();
  });

  it("toggles checks from the whole asset or its checkbox without changing focus", async () => {
    render(<InteractionHarness view={view} initialMode="batch" />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    physicalClick(document.querySelectorAll("[data-asset-id]")[0]);
    physicalClick(document.querySelectorAll("[data-selection-control]")[2]);
    await waitFor(() => expect(Array.from(document.querySelectorAll(".checked")).map((item) => item.getAttribute("data-asset-id"))).toEqual(["a", "c"]));
    expect(document.querySelector(".focused")).toBeNull();
  });

  it("selects forward and reverse ranges from card and checkbox clicks", async () => {
    render(<InteractionHarness view={view} initialMode="batch" />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    physicalClick(document.querySelectorAll("[data-asset-id]")[0]);
    physicalClick(document.querySelectorAll("[data-selection-control]")[3], { shiftKey: true });
    await waitFor(() => expect(document.querySelectorAll(".checked")).toHaveLength(4));

    cleanup();
    render(<InteractionHarness view={view} initialMode="batch" />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    physicalClick(document.querySelectorAll("[data-asset-id]")[3]);
    physicalClick(document.querySelectorAll("[data-asset-id]")[1], { shiftKey: true });
    await waitFor(() => expect(Array.from(document.querySelectorAll(".checked")).map((item) => item.getAttribute("data-asset-id"))).toEqual(["b", "c", "d"]));
  });

  it("keeps the original anchor while Shift ranges expand and contract", async () => {
    render(<InteractionHarness view={view} initialMode="batch" />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    physicalClick(document.querySelectorAll("[data-asset-id]")[0]);
    physicalClick(document.querySelectorAll("[data-asset-id]")[3], { shiftKey: true });
    physicalClick(document.querySelectorAll("[data-asset-id]")[1], { shiftKey: true });
    await waitFor(() => expect(Array.from(document.querySelectorAll(".checked")).map((item) => item.getAttribute("data-asset-id"))).toEqual(["a", "b"]));
  });

  it("treats a double click as one toggle and does not preview", async () => {
    const onPreview = vi.fn();
    render(<InteractionHarness view={view} initialMode="batch" onPreview={onPreview} />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    const item = document.querySelectorAll<HTMLElement>("[data-asset-id]")[1];
    physicalClick(item, { detail: 1 });
    physicalClick(item, { detail: 2 });
    fireEvent.doubleClick(item);
    await waitFor(() => expect(document.querySelector(".checked")?.getAttribute("data-asset-id")).toBe("b"));
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("supports Space and Shift+Space without duplicate checkbox activation", async () => {
    render(<InteractionHarness view={view} initialMode="batch" />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    const items = document.querySelectorAll<HTMLElement>("[data-asset-id]");
    fireEvent.keyDown(items[1], { key: " " });
    fireEvent.keyDown(items[3], { key: " ", shiftKey: true });
    await waitFor(() => expect(Array.from(document.querySelectorAll(".checked")).map((item) => item.getAttribute("data-asset-id"))).toEqual(["b", "c", "d"]));

    const control = document.querySelectorAll<HTMLElement>("[data-selection-control]")[0];
    fireEvent.keyDown(control, { key: " " });
    await waitFor(() => expect(Array.from(document.querySelectorAll(".checked")).map((item) => item.getAttribute("data-asset-id"))).toEqual(["a", "b", "c", "d"]));
  });
});

describe.each(["grid", "list"] as const)("%s context menu", (view) => {
  it("opens the app menu, focuses the asset in browse mode, and blocks the native menu", async () => {
    const onPreview = vi.fn();
    render(<InteractionHarness view={view} onPreview={onPreview} />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    const item = document.querySelectorAll<HTMLElement>("[data-asset-id]")[1];
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 80, clientY: 80 });
    item.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument());
    expect(document.querySelector(".focused")?.getAttribute("data-asset-id")).toBe("b");
    expect(onPreview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: /预览|Preview|preview/i }));
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    fireEvent.keyDown(item, { key: "F10", shiftKey: true });
    await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument());
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("uses all checked assets only when the context target is already checked", async () => {
    const onTrash = vi.fn();
    render(<InteractionHarness view={view} initialMode="batch" onTrash={onTrash} />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    physicalClick(document.querySelectorAll("[data-asset-id]")[0]);
    physicalClick(document.querySelectorAll("[data-asset-id]")[2]);
    const checkedItem = document.querySelectorAll<HTMLElement>("[data-asset-id]")[0];
    fireEvent.contextMenu(checkedItem, { button: 2, clientX: 80, clientY: 80 });
    await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument());
    expect(screen.getAllByRole("menuitem", { name: /仅支持单项|Single item only|singleItemOnly/i })).toHaveLength(2);
    expect(screen.getAllByRole("menuitem", { name: /仅支持单项|Single item only|singleItemOnly/i }).every((item) => item.hasAttribute("data-disabled"))).toBe(true);
    fireEvent.click(screen.getByRole("menuitem", { name: /移到回收站|Recycle Bin|trashCount|trash/i }));
    expect(onTrash).toHaveBeenCalledWith(["a", "c"]);

    fireEvent.contextMenu(document.querySelectorAll<HTMLElement>("[data-asset-id]")[1], { button: 2, clientX: 80, clientY: 80 });
    await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("menuitem", { name: /移到回收站|Recycle Bin|trash/i }));
    expect(onTrash).toHaveBeenLastCalledWith(["b"]);
    expect(document.querySelectorAll(".checked")).toHaveLength(2);
  });
});

describe("native asset input", () => {
  it("uses the final click as the only event in a physical pointer sequence", () => {
    const fixture = interactionFixture("browse");
    physicalClick(fixture.viewport.querySelector('[data-asset-id="b"]')!);
    expect(fixture.onInteract).toHaveBeenCalledTimes(1);
    expect(fixture.onInteract).toHaveBeenCalledWith({ assetId: "b", intent: "focus" });
    fixture.detachInteraction();
  });

  it("reads Shift from the final click when earlier pointer events omit it", () => {
    const fixture = interactionFixture("batch");
    physicalClick(fixture.viewport.querySelector('[data-asset-id="b"]')!, { shiftKey: true });
    expect(fixture.onInteract).toHaveBeenCalledTimes(1);
    expect(fixture.onInteract).toHaveBeenCalledWith({ assetId: "b", intent: "rangeChecked" });
    fixture.detachInteraction();
  });

  it.each(["ShiftLeft", "ShiftRight"])("uses global %s tracking when click omits shiftKey", (code) => {
    const fixture = interactionFixture("batch");
    const detachKeys = attachModifierKeyTracking(window, document, fixture.modifiers);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", code, bubbles: true }));
    fixture.viewport.querySelector('[data-asset-id="b"]')?.dispatchEvent(new MouseEvent("click", { button: 0, detail: 1, bubbles: true }));
    expect(fixture.onInteract).toHaveBeenCalledWith({ assetId: "b", intent: "rangeChecked" });
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", code, bubbles: true }));
    detachKeys();
    fixture.detachInteraction();
  });

  it("ignores compatibility mousedown and the second click of a double click", () => {
    const fixture = interactionFixture("batch");
    const target = fixture.viewport.querySelector('[data-asset-id="b"]')!;
    target.dispatchEvent(new MouseEvent("mousedown", { button: 0, bubbles: true }));
    target.dispatchEvent(new MouseEvent("click", { button: 0, detail: 2, bubbles: true }));
    expect(fixture.onInteract).not.toHaveBeenCalled();
    fixture.detachInteraction();
  });

  it("prevents native text selection", () => {
    const fixture = interactionFixture();
    const event = new Event("selectstart", { bubbles: true, cancelable: true });
    fixture.viewport.querySelector("strong")?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    fixture.detachInteraction();
  });
});

describe("modifier tracking", () => {
  it("resets tracked Shift state when the window loses focus", () => {
    const modifiers = createModifierKeyState();
    const dispose = attachModifierKeyTracking(window, document, modifiers);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", code: "ShiftRight" }));
    window.dispatchEvent(new Event("blur"));
    expect(modifiers.shift).toBe(false);
    expect(modifiers.pressedKeys.size).toBe(0);
    dispose();
  });
});

describe("asset browser stable rendering", () => {
  const browserProps = {
    assets,
    total: assets.length,
    view: "grid" as const,
    gridColumns: 4 as const,
    selectionMode: "browse" as const,
    focusedAssetId: undefined,
    checkedIds: [] as string[],
    loading: false,
    hasMore: false,
    noSources: false,
    contentMotionKey: "all",
    onLoadMore: vi.fn(),
    onFocus: vi.fn(),
    onToggleChecked: vi.fn(),
    onCheckRange: vi.fn(),
    onPreview: vi.fn(),
    onOpen: vi.fn(),
    onReveal: vi.fn(),
    onRename: vi.fn(),
    onMove: vi.fn(),
    onTrash: vi.fn(),
    onSetCollectionCover: vi.fn(),
    onClearCollectionCover: vi.fn(),
    onAddSource: vi.fn(),
  };

  it("does not replace the scroll viewport when the content motion key changes", async () => {
    const view = render(<AssetBrowser {...browserProps} />);
    await waitFor(() => expect(document.querySelector(".assetViewport")).not.toBeNull());
    const viewport = document.querySelector(".assetViewport");
    view.rerender(<AssetBrowser {...browserProps} contentMotionKey="images" />);
    expect(document.querySelector(".assetViewport")).toBe(viewport);
  });

  it("keeps list layout nodes stable and removes batch controls immediately", async () => {
    const view = render(<AssetBrowser {...browserProps} view="list" />);
    await waitFor(() => expect(document.querySelectorAll(".assetListItem")).toHaveLength(4));
    const viewport = document.querySelector(".assetViewport");
    const canvas = document.querySelector(".virtualCanvas");
    const firstItem = document.querySelector(".assetListItem");
    const firstSlot = firstItem?.querySelector(".listSelectionSlot");
    const firstThumbnail = firstItem?.querySelector(".listThumb");
    const firstFilename = firstItem?.querySelector("strong");
    expect(document.querySelectorAll(".listSelectionSlot")).toHaveLength(4);
    expect(document.querySelector("[data-selection-control]")).toBeNull();

    view.rerender(<AssetBrowser {...browserProps} view="list" selectionMode="batch" />);
    await waitFor(() => expect(document.querySelectorAll("[data-selection-control]")).toHaveLength(4));
    expect(document.querySelector(".assetViewport")).toBe(viewport);
    expect(document.querySelector(".virtualCanvas")).toBe(canvas);
    expect(document.querySelector(".assetListItem")).toBe(firstItem);
    expect(document.querySelector(".listSelectionSlot")).toBe(firstSlot);
    expect(document.querySelector(".listThumb")).toBe(firstThumbnail);
    expect(document.querySelector(".assetListItem strong")).toBe(firstFilename);

    view.rerender(<AssetBrowser {...browserProps} view="list" />);
    expect(document.querySelector("[data-selection-control]")).toBeNull();
    expect(document.querySelector(".assetViewport")).toBe(viewport);
    expect(document.querySelector(".virtualCanvas")).toBe(canvas);
    expect(document.querySelector(".assetListItem")).toBe(firstItem);
    expect(document.querySelector(".listSelectionSlot")).toBe(firstSlot);
    expect(document.querySelector(".listThumb")).toBe(firstThumbnail);
    expect(document.querySelector(".assetListItem strong")).toBe(firstFilename);
  });

  it("marks a thumbnail loaded after its image load event", async () => {
    render(<AssetBrowser {...browserProps} assets={[{ ...assets[0], thumbnailPath: "C:/cache/a.webp" }]} total={1} />);
    await waitFor(() => expect(document.querySelector(".thumbnailLoader img")).not.toBeNull());
    const image = document.querySelector(".thumbnailLoader img")!;
    expect(image.parentElement).not.toHaveClass("loaded");
    fireEvent.load(image);
    expect(image.parentElement).toHaveClass("loaded");
  });

  it("keeps the batch checkbox in the thumbnail foreground", async () => {
    render(<AssetBrowser {...browserProps} selectionMode="batch" />);
    await waitFor(() => expect(document.querySelector("[data-selection-control]")).not.toBeNull());
    expect(document.querySelector("[data-selection-control]")).toHaveStyle({ zIndex: "3" });
  });

  it("offers the current collection cover action only in browse mode", async () => {
    const onSetCollectionCover = vi.fn();
    const view = render(<AssetBrowser {...browserProps} collectionContext={{ id: "collection-a" }} onSetCollectionCover={onSetCollectionCover} />);
    await waitFor(() => expect(document.querySelectorAll("[data-asset-id]")).toHaveLength(4));
    fireEvent.contextMenu(document.querySelector<HTMLElement>('[data-asset-id="a"]')!, { button: 2, clientX: 30, clientY: 30 });
    await waitFor(() => expect(screen.getByRole("menu")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("menuitem", { name: /setCollectionCover|Set as current context cover|设为当前上下文封面/ }));
    expect(onSetCollectionCover).toHaveBeenCalledWith("collection-a", "a");
    view.rerender(<AssetBrowser {...browserProps} collectionContext={{ id: "collection-a" }} selectionMode="batch" onSetCollectionCover={onSetCollectionCover} />);
    expect(document.querySelector(".assetContextMenu")).toBeNull();
  });

  it("keeps tag count and colors when tags are presented as cable strands", async () => {
    const tagged = { ...assets[0], tags: [{ id: "red", name: "Red", color: "#aa0000", assetCount: 1 }, { id: "green", name: "Green", color: "#00aa00", assetCount: 1 }] };
    render(<AssetBrowser {...browserProps} assets={[tagged]} total={1} />);
    await waitFor(() => expect(document.querySelectorAll(".miniTags i")).toHaveLength(2));
    const strands = document.querySelectorAll<HTMLElement>(".miniTags i");
    expect(strands[0].style.background).toBe("rgb(170, 0, 0)");
    expect(strands[1].style.background).toBe("rgb(0, 170, 0)");
  });
});

describe("asset interaction intent", () => {
  it("separates browse, batch, Shift, Ctrl and secondary button semantics", () => {
    const modifiers = createModifierKeyState();
    expect(assetInteractionIntentFromEvent(new MouseEvent("click", { button: 0, detail: 1 }), modifiers, "browse")).toBe("focus");
    expect(assetInteractionIntentFromEvent(new MouseEvent("click", { button: 0, detail: 1, ctrlKey: true }), modifiers, "browse")).toBe("focus");
    expect(assetInteractionIntentFromEvent(new MouseEvent("click", { button: 0, detail: 1, ctrlKey: true }), modifiers, "batch")).toBe("toggleChecked");
    expect(assetInteractionIntentFromEvent(new MouseEvent("click", { button: 0, detail: 1, shiftKey: true }), modifiers, "batch")).toBe("rangeChecked");
    expect(assetInteractionIntentFromEvent(new MouseEvent("click", { button: 0, detail: 2 }), modifiers, "batch")).toBeUndefined();
    expect(assetInteractionIntentFromEvent(new MouseEvent("click", { button: 2 }), modifiers, "batch")).toBeUndefined();
  });
});
