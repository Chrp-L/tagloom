import { describe, expect, it } from "vitest";
import { MOODBOARD_GRID, applyFlowNodeChanges, autoLayoutAssets, edgePortConfig, findMoodboardGuides, flowEdgesToDocument, isValidMoodboardConnection, nearestMoodboardPort, toFlowNodes } from "./model";
import type { Asset, MoodboardDocument } from "../../types";

const asset = (id: string, width: number, height: number): Asset => ({ id, sourceId: "source", path: `C:/assets/${id}.jpg`, filename: `${id}.jpg`, extension: "jpg", mediaKind: "image", byteSize: 1, modifiedAt: "2026-01-01", width, height, note: "", status: "ready", tags: [] });
const document: MoodboardDocument = { id: "board", collectionId: "collection", name: "Board", viewport: { x: 0, y: 0, zoom: 1 }, backgroundColor: "#ffffff", revision: 1, edges: [], nodes: [{ id: "text", type: "text", position: { x: 10, y: 12 }, size: { width: 200, height: 80 }, zIndex: 1, data: { text: "Hello", fontSize: "medium", color: "#000000", align: "left" } }] };

describe("moodboard canvas model", () => {
  it("lays out no more than twelve assets in compact columns", () => {
    const nodes = autoLayoutAssets(Array.from({ length: 14 }, (_, index) => asset(String(index), 4, 3)));
    expect(nodes).toHaveLength(12);
    expect(nodes.every((node) => node.type === "asset" && node.size.width === 240)).toBe(true);
    expect(new Set(nodes.map((node) => node.position.x))).toEqual(new Set([0, 264, 528]));
    expect(nodes.every((node) => node.position.x % MOODBOARD_GRID === 0 && node.position.y % MOODBOARD_GRID === 0 && node.size.height % MOODBOARD_GRID === 0)).toBe(true);
  });

  it("persists flow position changes without changing node content", () => {
    const nodes = toFlowNodes(document, [], "select", () => undefined, () => undefined, () => undefined);
    const next = applyFlowNodeChanges([{ id: "text", type: "position", position: { x: 99.8, y: 41.1 } }], document, nodes);
    expect(next.nodes[0]).toMatchObject({ position: { x: 96, y: 40 }, data: document.nodes[0].data });
    expect(next.edges).toEqual([]);
  });

  it("rejects self and duplicate connections", () => {
    expect(isValidMoodboardConnection({ source: "a", target: "a" }, [])).toBe(false);
    expect(isValidMoodboardConnection({ source: "a", target: "b" }, [{ id: "edge", sourceNodeId: "a", targetNodeId: "b", color: "neutral" }])).toBe(false);
    expect(isValidMoodboardConnection({ source: "a", target: "b" }, [])).toBe(true);
  });

  it("finds nearby center alignment guides", () => {
    const guides = findMoodboardGuides({ id: "a", position: { x: 99, y: 200 }, size: { width: 100, height: 80 } }, [{ id: "b", position: { x: 100, y: 350 }, size: { width: 100, height: 80 } }]);
    expect(guides).toEqual({ x: 100, y: undefined });
  });

  it("uses persisted handles and maps legacy edges to nearest sides", () => {
    const nodes = [
      { ...document.nodes[0], id: "a", position: { x: 0, y: 0 } },
      { ...document.nodes[0], id: "b", position: { x: 400, y: 40 } },
    ];
    const edge = { id: "edge", sourceNodeId: "a", targetNodeId: "b", color: "neutral" as const };
    expect(nearestMoodboardPort(nodes[0], nodes[1])).toBe("right");
    expect(edgePortConfig(edge, nodes)).toEqual({ sourceHandle: "right", targetHandle: "left" });
    expect(flowEdgesToDocument([{ id: "edge", source: "a", target: "b", sourceHandle: "bottom", targetHandle: "top", type: "moodboard", data: { moodboardEdge: edge } }], { ...document, nodes, edges: [edge] }).edges[0].config).toEqual({ sourceHandle: "bottom", targetHandle: "top" });
  });
});
