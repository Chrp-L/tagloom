import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import type { Asset, SourceRoot } from "../types";
import { Inspector } from "./Inspector";

const first: Asset = { id: "a", sourceId: "source", path: "C:/a.jpg", filename: "a.jpg", extension: "jpg", mediaKind: "image", byteSize: 10, modifiedAt: "2026-01-01T00:00:00Z", note: "first note", status: "ready", tags: [] };
const second: Asset = { ...first, id: "b", path: "C:/b.jpg", filename: "b.jpg", note: "second note" };
const sources: SourceRoot[] = [{ id: "source", path: "C:/", name: "Reference Library", status: "ready", assetCount: 2 }];
const actions = { onSetTag: vi.fn(), onAddCollection: vi.fn(), onSaveNote: vi.fn(), onRename: vi.fn(), onMove: vi.fn(), onTrash: vi.fn(), onReveal: vi.fn(), onOpen: vi.fn() };
const baseProps = { checkedAssets: [], tags: [], collections: [], sources, ...actions };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("inspector asset transition", () => {
  it("updates identity and resets the note when the focused asset changes", async () => {
    const view = render(<Inspector {...baseProps} selectionMode="browse" focusedAsset={first} />);
    expect(screen.getByDisplayValue("first note")).toBeInTheDocument();
    view.rerender(<Inspector {...baseProps} selectionMode="browse" focusedAsset={second} />);
    await waitFor(() => expect(screen.getByText("b.jpg")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByDisplayValue("second note")).toBeInTheDocument());
  });

  it("shows the asset source and keeps technical information collapsed by default", () => {
    render(<Inspector {...baseProps} selectionMode="browse" focusedAsset={first} />);
    expect(screen.getByText("Reference Library")).toBeInTheDocument();

    const details = document.querySelector("details.fileInformation");
    expect(details).toBeInstanceOf(HTMLDetailsElement);
    expect(details).not.toHaveAttribute("open");
    expect(screen.queryByText("C:/a.jpg")).toBeInTheDocument();
  });

  it("expands the file information to reveal technical metadata and the path", () => {
    render(<Inspector {...baseProps} selectionMode="browse" focusedAsset={{ ...first, width: 1920, height: 1080 }} />);
    const summary = screen.getByText(/fileInformation|File information|文件信息/i);
    const details = summary.closest("details");
    expect(details).not.toBeNull();

    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    expect(within(details as HTMLElement).getByText("1920 × 1080")).toBeInTheDocument();
    expect(within(details as HTMLElement).getByText("C:/a.jpg")).toBeInTheDocument();
  });

  it("uses batch mode even when exactly one asset is checked", async () => {
    const view = render(<Inspector {...baseProps} selectionMode="batch" focusedAsset={first} checkedAssets={[second]} tags={[{ id: "tag", name: "Reference", color: "#ee6859", assetCount: 1 }]} collections={[{ id: "collection", name: "Campaign", assetCount: 1 }]} />);
    expect(await screen.findByText(/1 selected|已选择 1 项/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue("first note")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("second note")).not.toBeInTheDocument();
    expect(document.querySelector("details.fileInformation")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reference" }));
    fireEvent.click(screen.getByRole("button", { name: "Campaign" }));
    expect(actions.onSetTag).toHaveBeenCalledWith("tag", true);
    expect(actions.onAddCollection).toHaveBeenCalledWith("collection");

    view.rerender(<Inspector {...baseProps} selectionMode="browse" focusedAsset={first} />);
    expect(await screen.findByDisplayValue("first note")).toBeInTheDocument();
  });

  it("shows a dedicated batch empty state before anything is checked", async () => {
    render(<Inspector {...baseProps} selectionMode="batch" focusedAsset={first} />);
    expect(await screen.findByText(/0 selected|已选择 0 项/)).toBeInTheDocument();
    expect(screen.getByText(/Click media|点击素材/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue("first note")).not.toBeInTheDocument();
  });

  it("marks inspector headers and empty content as draggable surfaces", () => {
    const view = render(<Inspector {...baseProps} selectionMode="browse" focusedAsset={first} />);
    expect(document.querySelector(".inspectorHeader")).toHaveAttribute("data-tauri-drag-region");
    expect(document.querySelector(".inspectorHeader h2")).toHaveAttribute("data-tauri-drag-region");

    view.rerender(<Inspector {...baseProps} selectionMode="browse" />);
    expect(document.querySelector(".emptyInspector")).toHaveAttribute("data-tauri-drag-region");
    expect(document.querySelector(".emptyInspectorContent")).toHaveAttribute("data-tauri-drag-region");
  });
});
