import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "../../types";
import { MoodboardAssetDrawer, type MoodboardAssetGroup } from "./MoodboardAssetDrawer";

afterEach(cleanup);

const asset = (id: string, filename: string): Asset => ({ id, filename, sourceId: "source", path: `C:/assets/${filename}`, extension: "jpg", mediaKind: "image", byteSize: 1, modifiedAt: "2026-01-01T00:00:00Z", note: "", status: "ready", tags: [] });
const existing = asset("asset-1", "existing.jpg");
const libraryOnly = asset("asset-2", "library-only.jpg");
const group: MoodboardAssetGroup = { id: "group-1", name: "Palette", assets: [existing] };

describe("MoodboardAssetDrawer groups", () => {
  it("selects a board-local group and adds a library result without changing the canvas callback", () => {
    const onSelectGroup = vi.fn();
    const onAddAssetsToGroup = vi.fn();
    const onAddAsset = vi.fn();
    render(<MoodboardAssetDrawer collectionAssets={[existing]} allAssets={[existing, libraryOnly]} groups={[group]} selectedGroupId="group-1" onSelectGroup={onSelectGroup} onCreateGroup={vi.fn()} onRenameGroup={vi.fn()} onDeleteGroup={vi.fn()} onAddAssetsToGroup={onAddAssetsToGroup} onAddAsset={onAddAsset} onDragStart={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "从素材库添加" }));
    fireEvent.click(screen.getByRole("button", { name: "library-only.jpg" }));
    fireEvent.click(screen.getByRole("button", { name: "从素材库添加" }));
    fireEvent.click(screen.getByRole("button", { name: "existing.jpg" }));

    expect(onSelectGroup).not.toHaveBeenCalled();
    expect(onAddAssetsToGroup).toHaveBeenCalledWith(group, [existing, libraryOnly]);
    expect(onAddAsset).toHaveBeenCalledWith(existing);
  });

  it("creates a named group from the compact group control", () => {
    const onCreateGroup = vi.fn();
    render(<MoodboardAssetDrawer collectionAssets={[]} allAssets={[]} groups={[]} onSelectGroup={vi.fn()} onCreateGroup={onCreateGroup} onRenameGroup={vi.fn()} onDeleteGroup={vi.fn()} onAddAssetsToGroup={vi.fn()} onAddAsset={vi.fn()} onDragStart={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "  Material  " } });
    fireEvent.click(screen.getByRole("button", { name: "新建素材组" }));
    expect(onCreateGroup).toHaveBeenCalledWith("Material");
  });
});
