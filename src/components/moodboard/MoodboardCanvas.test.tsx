import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MoodboardDocument } from "../../types";

vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    applyEdgeChanges: <T,>(_: unknown, edges: T[]) => edges,
    applyNodeChanges: <T,>(_: unknown, nodes: T[]) => nodes,
    Background: () => null,
    BackgroundVariant: { Dots: "dots" },
    BaseEdge: () => null,
    ConnectionMode: { Loose: "loose" },
    getBezierPath: () => [""],
    Handle: () => null,
    MiniMap: () => null,
    NodeResizer: () => null,
    PanOnScrollMode: { Free: "free" },
    Panel: ({ children }: { children: React.ReactNode }) => <div onClick={(event) => event.stopPropagation()}>{children}</div>,
    Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
    ReactFlow: ({ children, onPaneClick }: { children: React.ReactNode; onPaneClick?: () => void }) => <div data-testid="flow" onClick={onPaneClick}>{children}</div>,
  };
});

vi.mock("./MoodboardAssetDrawer", () => ({ MoodboardAssetDrawer: () => <div /> }));
vi.mock("./MoodboardInspector", () => ({ MoodboardInspector: () => <aside data-testid="moodboard-inspector" /> }));

import { MoodboardCanvas } from "./MoodboardCanvas";

afterEach(cleanup);

const boardDocument: MoodboardDocument = {
  id: "board-1",
  collectionId: "collection-1",
  name: "Board",
  viewport: { x: 0, y: 0, zoom: 1 },
  backgroundColor: "#ffffff",
  nodes: [],
  edges: [],
  revision: 1,
};

function renderCanvas() {
  return render(<MoodboardCanvas document={boardDocument} allAssets={[]} onChange={vi.fn()} />);
}

describe("MoodboardCanvas", () => {
  it("opens settings as a floating panel and closes it before leaving connect mode", () => {
    renderCanvas();
    const root = globalThis.document.querySelector(".moodboardCanvasRoot")!;
    fireEvent.pointerDown(root, { button: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Toggle settings" }));
    expect(screen.getByTestId("moodboard-inspector")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("moodboard-inspector")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Connect mode" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Select mode" })).toHaveAttribute("aria-pressed", "true");
  });

  it("tracks modifier and middle-pan state on the canvas root", () => {
    const { container } = renderCanvas();
    const root = container.querySelector(".moodboardCanvasRoot")!;

    fireEvent.keyDown(window, { key: "Shift" });
    expect(root).toHaveClass("shiftHeld");
    fireEvent.keyUp(window, { key: "Shift" });
    expect(root).not.toHaveClass("shiftHeld");

    fireEvent.keyDown(window, { key: " " });
    expect(root).toHaveClass("spaceHeld");
    fireEvent.keyUp(window, { key: " " });
    expect(root).not.toHaveClass("spaceHeld");

    fireEvent.pointerDown(root, { button: 1 });
    expect(root).toHaveClass("middlePanning");
    fireEvent.pointerUp(root, { button: 1 });
    expect(root).not.toHaveClass("middlePanning");
  });

  it("does not offer a swatch insertion control", () => {
    renderCanvas();
    expect(screen.queryByRole("button", { name: "Add swatch" })).not.toBeInTheDocument();
  });
});
