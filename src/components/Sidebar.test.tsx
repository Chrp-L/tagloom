import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import type { LibraryBootstrap } from "../types";
import { ConfirmLibraryEntityDeleteDialog } from "./Dialogs";
import { Sidebar } from "./Sidebar";

const data: LibraryBootstrap = {
  sources: [{ id: "source-a", path: "C:/media", name: "Source A", status: "ready", assetCount: 3 }],
  collections: [{ id: "collection-a", name: "Collection A", assetCount: 2 }],
  tags: [{ id: "tag-a", name: "Tag A", color: "#ee6859", assetCount: 1 }],
  totalAssets: 3,
  imageCount: 3,
  videoCount: 0,
};

function renderSidebar(navigation: Parameters<typeof Sidebar>[0]["navigation"] = { kind: "all" }, collapsed = false) {
  const onRemoveSource = vi.fn();
  const onDeleteCollection = vi.fn();
  const onDeleteTag = vi.fn();
  const props: Parameters<typeof Sidebar>[0] = {
    data,
    navigation,
    collapsed,
    collapsedSections: { sources: false, collections: false, tags: false },
    onCollapsedChange: vi.fn(),
    onToggleSection: vi.fn(),
    onRevealSection: vi.fn(),
    onNavigate: vi.fn(),
    onAddSource: vi.fn(),
    onCreateTag: vi.fn(),
    onCreateCollection: vi.fn(),
    onRescan: vi.fn(),
    onRemoveSource,
    onDeleteCollection,
    onDeleteTag,
    onTagPointerDown: vi.fn(),
    onTagActivate: vi.fn(),
  };
  const view = render(<Tooltip.Provider><Sidebar {...props} /></Tooltip.Provider>);
  return { onRemoveSource, onDeleteCollection, onDeleteTag, props, ...view };
}

function openActions(name: string) {
  const trigger = screen.getByRole("button", { name: `More actions: ${name}` });
  fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse", isPrimary: true });
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("sidebar entity deletion menus", () => {
  it("requests source removal from the source menu", async () => {
    const callbacks = renderSidebar();
    openActions("Source A");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove source" }));
    expect(callbacks.onRemoveSource).toHaveBeenCalledWith(data.sources[0]);
  });

  it("requests collection deletion from the collection menu", async () => {
    const callbacks = renderSidebar();
    openActions("Collection A");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete collection" }));
    expect(callbacks.onDeleteCollection).toHaveBeenCalledWith(data.collections[0]);
  });

  it("requests tag deletion from the tag menu", async () => {
    const callbacks = renderSidebar();
    openActions("Tag A");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete tag" }));
    expect(callbacks.onDeleteTag).toHaveBeenCalledWith(data.tags[0]);
  });
});

describe("sidebar active motion plate", () => {
  it("keeps one active plate while navigation changes", () => {
    const view = renderSidebar();
    expect(document.querySelectorAll(".navActivePlate")).toHaveLength(1);
    view.rerender(<Tooltip.Provider><Sidebar {...view.props} navigation={{ kind: "collection", id: "collection-a" }} /></Tooltip.Provider>);
    expect(document.querySelectorAll(".navActivePlate")).toHaveLength(1);
    expect(document.querySelector('.navItem[aria-current="page"]')).toHaveTextContent("Collection A");
  });

  it("uses one active plate in the collapsed rail", () => {
    renderSidebar({ kind: "media", mediaKind: "image" }, true);
    expect(document.querySelectorAll(".navActivePlate.compact")).toHaveLength(1);
  });
});

describe("sidebar cable marks", () => {
  it("renders one static cable mark for each expandable library section", () => {
    renderSidebar();
    expect(document.querySelectorAll(".sectionCableMark")).toHaveLength(3);
    expect(document.querySelector(".sectionCableMark.sources")).not.toBeNull();
    expect(document.querySelector(".sectionCableMark.collections")).not.toBeNull();
    expect(document.querySelector(".sectionCableMark.tags")).not.toBeNull();
  });
});

describe("sidebar window drag region", () => {
  it("keeps the brand draggable and the collapse control interactive", () => {
    renderSidebar();
    expect(document.querySelector(".sidebarBrand")).toHaveAttribute("data-tauri-drag-region");
    expect(document.querySelector(".sidebarBrand .brand")).toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).not.toHaveAttribute("data-tauri-drag-region");
  });
});

describe("library entity delete confirmation", () => {
  it("runs the confirmed destructive action", () => {
    const onConfirm = vi.fn();
    render(<ConfirmLibraryEntityDeleteDialog
      open
      title="Delete tag?"
      body="This only removes the tag."
      confirmLabel="Delete tag"
      pending={false}
      onOpenChange={vi.fn()}
      onConfirm={onConfirm}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Delete tag" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
import * as Tooltip from "@radix-ui/react-tooltip";
