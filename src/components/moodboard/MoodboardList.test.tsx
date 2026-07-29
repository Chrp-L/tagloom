import * as Tooltip from "@radix-ui/react-tooltip";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset, MoodboardSummary } from "../../types";
import { MoodboardCreateDialog, MoodboardDeleteDialog, MoodboardRenameDialog } from "./MoodboardDialogs";
import { MoodboardList } from "./MoodboardList";

afterEach(cleanup);

const asset: Asset = {
  id: "asset-1", sourceId: "source-1", path: "C:/images/first.jpg", filename: "first.jpg", extension: "jpg", mediaKind: "image", byteSize: 100, modifiedAt: "2026-01-01T00:00:00Z", note: "", status: "ready", tags: [], thumbnailPath: "https://example.test/first.jpg",
};

const boards: MoodboardSummary[] = [{
  id: "board-1", collectionId: "collection-1", name: "Editorial reference", nodeCount: 4, previewAssets: [asset, { ...asset, id: "asset-2", mediaKind: "video" }], updatedAt: "2026-01-02T08:00:00Z",
}];

function renderList(overrides: Partial<React.ComponentProps<typeof MoodboardList>> = {}) {
  const props: React.ComponentProps<typeof MoodboardList> = {
    collectionName: "Summer issue", boards, loading: false, error: null, onOpen: vi.fn(), onCreate: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(), ...overrides,
  };
  return { ...render(<Tooltip.Provider><MoodboardList {...props} /></Tooltip.Provider>), props };
}

describe("MoodboardList", () => {
  it("opens a board and exposes its management actions", () => {
    const { props } = renderList();
    fireEvent.click(screen.getByRole("button", { name: /open moodboard: editorial reference/i }));
    fireEvent.click(screen.getByRole("button", { name: /rename moodboard: editorial reference/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete moodboard: editorial reference/i }));
    expect(props.onOpen).toHaveBeenCalledWith("board-1");
    expect(props.onRename).toHaveBeenCalledWith(boards[0]);
    expect(props.onDelete).toHaveBeenCalledWith(boards[0]);
    expect(document.querySelectorAll(".moodboardCollageTile")).toHaveLength(2);
  });

  it("offers creation from its empty state", () => {
    const { props } = renderList({ boards: [] });
    expect(screen.getByText("Start a moodboard")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /new moodboard/i })[1]);
    expect(props.onCreate).toHaveBeenCalledTimes(1);
  });

  it("renders loading and failure states without board rows", () => {
    const { rerender } = renderList({ loading: true });
    expect(screen.getByRole("status")).toHaveTextContent("Loading moodboards");
    rerender(<Tooltip.Provider><MoodboardList collectionName="Summer issue" boards={[]} loading={false} error="Connection failed" onOpen={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} /></Tooltip.Provider>);
    expect(screen.getByRole("alert")).toHaveTextContent("Connection failed");
    expect(document.querySelector(".moodboardRows")).not.toBeInTheDocument();
  });
});

describe("Moodboard dialogs", () => {
  it("creates a trimmed name within the 80 character constraint", () => {
    const onCreate = vi.fn();
    render(<MoodboardCreateDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("maxlength", "80");
    fireEvent.change(input, { target: { value: "  New direction  " } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate).toHaveBeenCalledWith("New direction");
  });

  it("renames and confirms deletion for the selected board", () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    const view = render(<MoodboardRenameDialog board={boards[0]} open onOpenChange={vi.fn()} onRename={onRename} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Reframed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onRename).toHaveBeenCalledWith(boards[0], "Reframed");
    view.unmount();

    render(<MoodboardDeleteDialog board={boards[0]} open onOpenChange={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(boards[0]);
  });
});
