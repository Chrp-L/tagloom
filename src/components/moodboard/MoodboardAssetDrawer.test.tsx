import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "../../types";
import { MoodboardAssetDrawer } from "./MoodboardAssetDrawer";

afterEach(cleanup);

const asset = (id: string, filename: string): Asset => ({ id, filename, sourceId: "source", path: `C:/assets/${filename}`, extension: "jpg", mediaKind: "image", byteSize: 1, modifiedAt: "2026-01-01T00:00:00Z", note: "", status: "ready", tags: [] });
const shared = asset("asset-1", "shared.jpg");
const second = asset("asset-2", "second.jpg");
const searched = asset("asset-3", "searched.jpg");

function renderDrawer(overrides: Partial<React.ComponentProps<typeof MoodboardAssetDrawer>> = {}) {
  const props: React.ComponentProps<typeof MoodboardAssetDrawer> = { contextSections: [{ id: "first", name: "First context", assets: [shared, second] }, { id: "second", name: "Second context", assets: [shared] }], searchResults: [shared, searched], search: "", onSearchChange: vi.fn(), onAddAssets: vi.fn(), onDragStart: vi.fn(), ...overrides };
  return { props, ...render(<MoodboardAssetDrawer {...props} />) };
}

describe("MoodboardAssetDrawer", () => {
  it("shows context sections by default and de-duplicates selected assets", () => {
    const { props } = renderDrawer();
    expect(screen.getByText("First context")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Select shared.jpg" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Select second.jpg" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "添加到画板" }));
    expect(props.onAddAssets).toHaveBeenCalledWith([shared, second]);
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });

  it("uses the controlled global search results and preserves direct dragging", () => {
    const { props } = renderDrawer({ search: "sea" });
    expect(screen.queryByText("First context")).not.toBeInTheDocument();
    expect(screen.getByText("searched.jpg")).toBeInTheDocument();
    fireEvent.dragStart(screen.getByRole("button", { name: "Select searched.jpg" }));
    expect(props.onDragStart).toHaveBeenCalledWith(expect.anything(), searched);
    fireEvent.change(screen.getByPlaceholderText("搜索全库素材"), { target: { value: "next" } });
    expect(props.onSearchChange).toHaveBeenCalledWith("next");
  });
});
