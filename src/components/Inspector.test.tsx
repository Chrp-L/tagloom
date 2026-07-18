import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import type { Asset } from "../types";
import { Inspector } from "./Inspector";

const first: Asset = { id: "a", sourceId: "source", path: "C:/a.jpg", filename: "a.jpg", extension: "jpg", mediaKind: "image", byteSize: 10, modifiedAt: "2026-01-01T00:00:00Z", note: "first note", status: "ready", tags: [] };
const second: Asset = { ...first, id: "b", path: "C:/b.jpg", filename: "b.jpg", note: "second note" };
const actions = { onSetTag: vi.fn(), onAddCollection: vi.fn(), onSaveNote: vi.fn(), onRename: vi.fn(), onMove: vi.fn(), onTrash: vi.fn(), onReveal: vi.fn(), onOpen: vi.fn() };

afterEach(cleanup);

describe("inspector asset transition", () => {
  it("updates identity and resets the note when the focused asset changes", async () => {
    const view = render(<Inspector selectionMode="browse" focusedAsset={first} checkedAssets={[]} tags={[]} collections={[]} {...actions} />);
    expect(screen.getByDisplayValue("first note")).toBeInTheDocument();
    view.rerender(<Inspector selectionMode="browse" focusedAsset={second} checkedAssets={[]} tags={[]} collections={[]} {...actions} />);
    await waitFor(() => expect(screen.getByText("b.jpg")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByDisplayValue("second note")).toBeInTheDocument());
  });

  it("uses batch mode even when exactly one asset is checked", async () => {
    const view = render(<Inspector selectionMode="batch" focusedAsset={first} checkedAssets={[second]} tags={[]} collections={[]} {...actions} />);
    expect(await screen.findByText(/1 selected|已选择 1 项/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue("first note")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("second note")).not.toBeInTheDocument();

    view.rerender(<Inspector selectionMode="browse" focusedAsset={first} checkedAssets={[]} tags={[]} collections={[]} {...actions} />);
    expect(await screen.findByDisplayValue("first note")).toBeInTheDocument();
  });

  it("shows a dedicated batch empty state before anything is checked", async () => {
    render(<Inspector selectionMode="batch" focusedAsset={first} checkedAssets={[]} tags={[]} collections={[]} {...actions} />);
    expect(await screen.findByText(/0 selected|已选择 0 项/)).toBeInTheDocument();
    expect(screen.getByText(/Click media|点击素材/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue("first note")).not.toBeInTheDocument();
  });

  it("marks inspector headers and empty content as draggable surfaces", () => {
    const view = render(<Inspector selectionMode="browse" focusedAsset={first} checkedAssets={[]} tags={[]} collections={[]} {...actions} />);
    expect(document.querySelector(".inspectorHeader")).toHaveAttribute("data-tauri-drag-region");
    expect(document.querySelector(".inspectorHeader h2")).toHaveAttribute("data-tauri-drag-region");

    view.rerender(<Inspector selectionMode="browse" checkedAssets={[]} tags={[]} collections={[]} {...actions} />);
    expect(document.querySelector(".emptyInspector")).toHaveAttribute("data-tauri-drag-region");
    expect(document.querySelector(".emptyInspectorContent")).toHaveAttribute("data-tauri-drag-region");
  });
});
