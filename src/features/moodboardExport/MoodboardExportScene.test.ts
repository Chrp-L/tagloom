import { describe, expect, it } from "vitest";
import type { MoodboardDocument } from "../../types";
import { moodboardExportBounds } from "./MoodboardExportScene";

describe("moodboardExportBounds", () => {
  it("includes all nodes with the required 64px outer padding", () => {
    const document: MoodboardDocument = {
      id: "board", collectionId: "collection", name: "Board", viewport: { x: 0, y: 0, zoom: 1 }, backgroundColor: "#fff", edges: [], revision: 0,
      nodes: [
        { id: "left", type: "swatch", position: { x: -20, y: 10 }, size: { width: 100, height: 60 }, zIndex: 0, data: { color: "#fff" } },
        { id: "right", type: "text", position: { x: 300, y: 210 }, size: { width: 200, height: 80 }, zIndex: 1, data: { text: "Text", fontSize: "small", color: "#000", align: "left" } },
      ],
    };
    expect(moodboardExportBounds(document)).toEqual({ minX: -20, minY: 10, width: 648, height: 408 });
  });
});
