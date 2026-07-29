import { describe, expect, it } from "vitest";
import { applyFlowNodeChanges, autoLayoutAssets, toFlowNodes } from "./model";
import type { Asset, MoodboardDocument } from "../../types";

const asset = (id: string, width: number, height: number): Asset => ({ id, sourceId: "source", path: `C:/assets/${id}.jpg`, filename: `${id}.jpg`, extension: "jpg", mediaKind: "image", byteSize: 1, modifiedAt: "2026-01-01", width, height, note: "", status: "ready", tags: [] });
const document: MoodboardDocument = { id: "board", collectionId: "collection", name: "Board", viewport: { x: 0, y: 0, zoom: 1 }, backgroundColor: "#ffffff", revision: 1, edges: [], nodes: [{ id: "text", type: "text", position: { x: 10, y: 12 }, size: { width: 200, height: 80 }, zIndex: 1, data: { text: "Hello", fontSize: "medium", color: "#000000", align: "left" } }] };

describe("moodboard canvas model", () => {
  it("lays out no more than twelve assets in compact columns", () => {
    const nodes = autoLayoutAssets(Array.from({ length: 14 }, (_, index) => asset(String(index), 4, 3)));
    expect(nodes).toHaveLength(12);
    expect(nodes.every((node) => node.type === "asset" && node.size.width === 240)).toBe(true);
    expect(new Set(nodes.map((node) => node.position.x))).toEqual(new Set([0, 268, 536]));
  });

  it("persists flow position changes without changing node content", () => {
    const nodes = toFlowNodes(document, [], false, () => undefined);
    const next = applyFlowNodeChanges([{ id: "text", type: "position", position: { x: 99.8, y: 41.1 } }], document, nodes);
    expect(next.nodes[0]).toMatchObject({ position: { x: 100, y: 41 }, data: document.nodes[0].data });
    expect(next.edges).toEqual([]);
  });
});
