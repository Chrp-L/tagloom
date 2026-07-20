import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../i18n";
import { Toolbar } from "./Toolbar";

afterEach(cleanup);

describe("toolbar primary state", () => {
  it("keeps the home title clean while preserving search and the event loom", () => {
    const props = {
      mode: "home" as const, title: "Home", count: 27, search: "", sort: "newest", view: "grid" as const, gridColumns: 4 as const, selectionMode: "browse" as const, checkedCount: 0,
      onSearch: vi.fn(), onSort: vi.fn(), onView: vi.fn(), onGridColumns: vi.fn(), onEnterBatch: vi.fn(), onExitBatch: vi.fn(), onSettings: vi.fn(),
    };
    render(<Toolbar {...props} />);
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.queryByText(/27 items|27 项/)).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(document.querySelector(".signalLoom")).not.toBeNull();
  });

  it("preserves the search value while selection mode is shown", async () => {
    const props = {
      title: "Library", count: 4, search: "needle", sort: "newest", view: "grid" as const, gridColumns: 4 as const, selectionMode: "browse" as const, checkedCount: 0,
      onSearch: vi.fn(), onSort: vi.fn(), onView: vi.fn(), onGridColumns: vi.fn(), onEnterBatch: vi.fn(), onExitBatch: vi.fn(), onSettings: vi.fn(),
    };
    const view = render(<Toolbar {...props} />);
    const loom = document.querySelector(".signalLoom");
    expect(loom).not.toBeNull();
    expect(screen.getByDisplayValue("needle")).toBeInTheDocument();
    view.rerender(<Toolbar {...props} selectionMode="batch" checkedCount={0} />);
    await waitFor(() => expect(screen.getByText(/0 selected|已选择 0/)).toBeInTheDocument());
    expect(document.querySelector(".signalLoom")).toBe(loom);
    view.rerender(<Toolbar {...props} />);
    await waitFor(() => expect(screen.getByDisplayValue("needle")).toBeInTheDocument());
    expect(document.querySelector(".signalLoom")).toBe(loom);
  });

  it("enters and exits batch mode from explicit toolbar controls", () => {
    const onEnterBatch = vi.fn();
    const onExitBatch = vi.fn();
    const props = {
      title: "Library", count: 4, search: "", sort: "newest", view: "grid" as const, gridColumns: 4 as const, selectionMode: "browse" as const, checkedCount: 0,
      onSearch: vi.fn(), onSort: vi.fn(), onView: vi.fn(), onGridColumns: vi.fn(), onEnterBatch, onExitBatch, onSettings: vi.fn(),
    };
    const view = render(<Toolbar {...props} />);
    const batchButton = screen.getByRole("button", { name: /Batch select|批量选择/ });
    const sortButton = screen.getByRole("button", { name: /Newest|最新优先/ });
    const gridButton = screen.getByRole("button", { name: /Grid view|网格视图/ });
    const columnButton = screen.getByRole("button", { name: "4" });
    const primarySlot = document.querySelector(".toolbarPrimary");
    fireEvent.click(batchButton);
    expect(onEnterBatch).toHaveBeenCalledTimes(1);

    view.rerender(<Toolbar {...props} selectionMode="batch" />);
    expect(screen.queryByRole("button", { name: /Batch select|批量选择/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Finish selection|完成批量选择/ })).not.toBeInTheDocument();
    const exitButton = screen.getByRole("button", { name: /Exit batch selection|退出批量选择/ });
    expect(exitButton).toBe(batchButton);
    expect(exitButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Newest|最新优先/ })).toBe(sortButton);
    expect(screen.getByRole("button", { name: /Grid view|网格视图/ })).toBe(gridButton);
    expect(screen.getByRole("button", { name: "4" })).toBe(columnButton);
    expect(document.querySelector(".toolbarPrimary")).toBe(primarySlot);
    expect(document.querySelector(".selectionBanner button")).toBeNull();
    fireEvent.click(exitButton);
    expect(onExitBatch).toHaveBeenCalledTimes(1);
  });

  it("marks title content as draggable without marking interactive controls", () => {
    const props = {
      title: "Library", count: 4, search: "", sort: "newest", view: "grid" as const, gridColumns: 4 as const, selectionMode: "browse" as const, checkedCount: 0,
      onSearch: vi.fn(), onSort: vi.fn(), onView: vi.fn(), onGridColumns: vi.fn(), onEnterBatch: vi.fn(), onExitBatch: vi.fn(), onSettings: vi.fn(),
    };
    render(<Toolbar {...props} />);
    expect(document.querySelector(".titleLine")).toHaveAttribute("data-tauri-drag-region");
    expect(document.querySelector(".titleIdentity")).toHaveAttribute("data-tauri-drag-region");
    expect(document.querySelector(".titleCopy")).toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByRole("heading", { name: "Library" })).toHaveAttribute("data-tauri-drag-region");
    expect(document.querySelector(".signalLoom")).toHaveAttribute("data-tauri-drag-region");
    expect(screen.getByRole("button", { name: /Settings|设置/ })).not.toHaveAttribute("data-tauri-drag-region");
  });
});
