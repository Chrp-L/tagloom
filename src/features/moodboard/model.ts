import { applyEdgeChanges, applyNodeChanges, type Edge, type Node } from "@xyflow/react";
import type { Asset, MoodboardDocument, MoodboardEdge, MoodboardNode } from "../../types";

export type FlowNodeData = {
  moodboardNode: MoodboardNode;
  asset?: Asset;
  connecting: boolean;
  onTextCommit: (id: string, text: string) => void;
  onResizeEnd: (id: string) => void;
};

export type FlowMoodboardNode = Node<FlowNodeData, "asset" | "text" | "swatch">;
export type FlowMoodboardEdge = Edge<{ moodboardEdge: MoodboardEdge }, "moodboard">;

const EDGE_COLORS: Record<MoodboardEdge["color"], string> = {
  neutral: "var(--line-strong)",
  coral: "var(--accent)",
  green: "var(--green)",
  gold: "var(--signal-gold)",
};

export function createMoodboardId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function toFlowNodes(document: MoodboardDocument, assets: Asset[], connecting: boolean, onTextCommit: FlowNodeData["onTextCommit"], onResizeEnd: FlowNodeData["onResizeEnd"]): FlowMoodboardNode[] {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  return document.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    width: node.size.width,
    height: node.size.height,
    zIndex: node.zIndex,
    data: {
      moodboardNode: node,
      asset: node.type === "asset" && node.data.assetId ? assetsById.get(node.data.assetId) : undefined,
      connecting,
      onTextCommit,
      onResizeEnd,
    },
  }));
}

export function isValidMoodboardConnection(connection: { source?: string | null; target?: string | null }, edges: MoodboardEdge[]): boolean {
  if (!connection.source || !connection.target || connection.source === connection.target) return false;
  return !edges.some((edge) => edge.sourceNodeId === connection.source && edge.targetNodeId === connection.target);
}

export interface MoodboardGuides { x?: number; y?: number; }

export function findMoodboardGuides(dragged: Pick<MoodboardNode, "id" | "position" | "size">, nodes: Pick<MoodboardNode, "id" | "position" | "size">[], tolerance = 6): MoodboardGuides {
  const xCandidates = [dragged.position.x, dragged.position.x + dragged.size.width / 2, dragged.position.x + dragged.size.width];
  const yCandidates = [dragged.position.y, dragged.position.y + dragged.size.height / 2, dragged.position.y + dragged.size.height];
  let bestX: number | undefined;
  let bestY: number | undefined;
  let xDistance = tolerance + 1;
  let yDistance = tolerance + 1;
  for (const node of nodes) {
    if (node.id === dragged.id) continue;
    const otherX = [node.position.x, node.position.x + node.size.width / 2, node.position.x + node.size.width];
    const otherY = [node.position.y, node.position.y + node.size.height / 2, node.position.y + node.size.height];
    for (const value of xCandidates) for (const candidate of otherX) if (Math.abs(value - candidate) < xDistance) { xDistance = Math.abs(value - candidate); bestX = candidate; }
    for (const value of yCandidates) for (const candidate of otherY) if (Math.abs(value - candidate) < yDistance) { yDistance = Math.abs(value - candidate); bestY = candidate; }
  }
  return { x: bestX, y: bestY };
}

export function toFlowEdges(document: MoodboardDocument): FlowMoodboardEdge[] {
  return document.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: "moodboard",
    data: { moodboardEdge: edge },
    style: { stroke: EDGE_COLORS[edge.color], strokeWidth: 1.25 },
  }));
}

export function flowNodesToDocument(nodes: FlowMoodboardNode[], document: MoodboardDocument): MoodboardDocument {
  const current = new Map(document.nodes.map((node) => [node.id, node]));
  return {
    ...document,
    nodes: nodes.flatMap((node): MoodboardNode[] => {
      const original = current.get(node.id);
      if (!original) return [];
      return [{
        ...original,
        position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
        size: { width: Math.round(node.measured?.width ?? node.width ?? original.size.width), height: Math.round(node.measured?.height ?? node.height ?? original.size.height) },
        zIndex: node.zIndex ?? original.zIndex,
      }];
    }),
  };
}

export function flowEdgesToDocument(edges: FlowMoodboardEdge[], document: MoodboardDocument): MoodboardDocument {
  const current = new Map(document.edges.map((edge) => [edge.id, edge]));
  return { ...document, edges: edges.flatMap((edge): MoodboardEdge[] => current.has(edge.id) ? [current.get(edge.id)!] : []) };
}

export function applyFlowNodeChanges(changes: Parameters<typeof applyNodeChanges<FlowMoodboardNode>>[0], document: MoodboardDocument, nodes: FlowMoodboardNode[]): MoodboardDocument {
  return flowNodesToDocument(applyNodeChanges(changes, nodes), document);
}

export function applyFlowEdgeChanges(changes: Parameters<typeof applyEdgeChanges<FlowMoodboardEdge>>[0], document: MoodboardDocument, edges: FlowMoodboardEdge[]): MoodboardDocument {
  return flowEdgesToDocument(applyEdgeChanges(changes, edges), document);
}

export function autoLayoutAssets(assets: Asset[]): MoodboardNode[] {
  const columns = [0, 0, 0];
  const width = 240;
  const gap = 28;
  return assets.slice(0, 12).map((asset) => {
    const index = columns.indexOf(Math.min(...columns));
    const ratio = asset.width && asset.height ? asset.width / asset.height : 4 / 3;
    const height = Math.round(Math.max(140, Math.min(360, width / ratio)));
    const node: MoodboardNode = {
      id: createMoodboardId("asset"),
      type: "asset",
      position: { x: index * (width + gap), y: columns[index] },
      size: { width, height },
      zIndex: 1,
      data: { assetId: asset.id, assetSnapshot: { filename: asset.filename, mediaKind: asset.mediaKind, thumbnailPath: asset.thumbnailPath }, fit: "cover" },
    };
    columns[index] += height + gap;
    return node;
  });
}

export function updateNode(document: MoodboardDocument, id: string, update: (node: MoodboardNode) => MoodboardNode): MoodboardDocument {
  return { ...document, nodes: document.nodes.map((node) => node.id === id ? update(node) : node) };
}
