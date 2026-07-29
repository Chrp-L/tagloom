import { applyEdgeChanges, applyNodeChanges, type Edge, type Node } from "@xyflow/react";
import type { Asset, MoodboardDocument, MoodboardEdge, MoodboardHandlePosition, MoodboardNode } from "../../types";

export type FlowNodeData = {
  moodboardNode: MoodboardNode;
  asset?: Asset;
  mode: "select" | "connect";
  onTextCommit: (id: string, text: string) => void;
  onResizeEnd: (id: string) => void;
  onPortClick: (nodeId: string, port: MoodboardHandlePosition) => void;
};

export type FlowMoodboardNode = Node<FlowNodeData, "asset" | "text" | "swatch">;
export type FlowMoodboardEdge = Edge<{ moodboardEdge: MoodboardEdge }, "moodboard">;

export const MOODBOARD_GRID = 8;
export const MOODBOARD_ASSET_WIDTH = 240;
export const MOODBOARD_LAYOUT_GAP = 24;

const EDGE_COLORS: Record<MoodboardEdge["color"], string> = {
  neutral: "var(--line-strong)",
  coral: "var(--accent)",
  green: "var(--green)",
  gold: "var(--signal-gold)",
};

export function createMoodboardId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function snapMoodboardValue(value: number): number {
  return Math.round(value / MOODBOARD_GRID) * MOODBOARD_GRID;
}

export function moodboardAssetHeight(asset: Pick<Asset, "width" | "height">): number {
  const ratio = asset.width && asset.height ? asset.width / asset.height : 4 / 3;
  return snapMoodboardValue(Math.max(144, Math.min(360, MOODBOARD_ASSET_WIDTH / ratio)));
}

export function toFlowNodes(document: MoodboardDocument, assets: Asset[], mode: FlowNodeData["mode"], onTextCommit: FlowNodeData["onTextCommit"], onResizeEnd: FlowNodeData["onResizeEnd"], onPortClick: FlowNodeData["onPortClick"]): FlowMoodboardNode[] {
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
      mode,
      onTextCommit,
      onResizeEnd,
      onPortClick,
    },
  }));
}

export const MOODBOARD_PORTS: MoodboardHandlePosition[] = ["top", "right", "bottom", "left"];

function parseHandle(handle?: string | null): MoodboardHandlePosition | undefined {
  return MOODBOARD_PORTS.includes(handle as MoodboardHandlePosition) ? handle as MoodboardHandlePosition : undefined;
}

export function nearestMoodboardPort(source: Pick<MoodboardNode, "position" | "size">, target: Pick<MoodboardNode, "position" | "size">): MoodboardHandlePosition {
  const sourceX = source.position.x + source.size.width / 2;
  const sourceY = source.position.y + source.size.height / 2;
  const targetX = target.position.x + target.size.width / 2;
  const targetY = target.position.y + target.size.height / 2;
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
  return dy >= 0 ? "bottom" : "top";
}

function oppositePort(port: MoodboardHandlePosition): MoodboardHandlePosition {
  return port === "top" ? "bottom" : port === "bottom" ? "top" : port === "left" ? "right" : "left";
}

export function edgePortConfig(edge: MoodboardEdge, nodes: MoodboardNode[]): Required<NonNullable<MoodboardEdge["config"]>> {
  const source = nodes.find((node) => node.id === edge.sourceNodeId);
  const target = nodes.find((node) => node.id === edge.targetNodeId);
  const sourceHandle = edge.config?.sourceHandle ?? (source && target ? nearestMoodboardPort(source, target) : "right");
  const targetHandle = edge.config?.targetHandle ?? oppositePort(sourceHandle);
  return { sourceHandle, targetHandle };
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
    sourceHandle: edgePortConfig(edge, document.nodes).sourceHandle,
    targetHandle: edgePortConfig(edge, document.nodes).targetHandle,
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
        position: { x: snapMoodboardValue(node.position.x), y: snapMoodboardValue(node.position.y) },
        size: { width: snapMoodboardValue(node.measured?.width ?? node.width ?? original.size.width), height: snapMoodboardValue(node.measured?.height ?? node.height ?? original.size.height) },
        zIndex: node.zIndex ?? original.zIndex,
      }];
    }),
  };
}

export function flowEdgesToDocument(edges: FlowMoodboardEdge[], document: MoodboardDocument): MoodboardDocument {
  const current = new Map(document.edges.map((edge) => [edge.id, edge]));
  return {
    ...document,
    edges: edges.flatMap((edge): MoodboardEdge[] => {
      const original = current.get(edge.id);
      if (!original) return [];
      const fallback = edgePortConfig(original, document.nodes);
      return [{ ...original, config: { sourceHandle: parseHandle(edge.sourceHandle) ?? fallback.sourceHandle, targetHandle: parseHandle(edge.targetHandle) ?? fallback.targetHandle } }];
    }),
  };
}

export function applyFlowNodeChanges(changes: Parameters<typeof applyNodeChanges<FlowMoodboardNode>>[0], document: MoodboardDocument, nodes: FlowMoodboardNode[]): MoodboardDocument {
  return flowNodesToDocument(applyNodeChanges(changes, nodes), document);
}

export function applyFlowEdgeChanges(changes: Parameters<typeof applyEdgeChanges<FlowMoodboardEdge>>[0], document: MoodboardDocument, edges: FlowMoodboardEdge[]): MoodboardDocument {
  return flowEdgesToDocument(applyEdgeChanges(changes, edges), document);
}

export function autoLayoutAssets(assets: Asset[]): MoodboardNode[] {
  const columns = [0, 0, 0];
  return assets.slice(0, 12).map((asset) => {
    const index = columns.indexOf(Math.min(...columns));
    const height = moodboardAssetHeight(asset);
    const node: MoodboardNode = {
      id: createMoodboardId("asset"),
      type: "asset",
      position: { x: index * (MOODBOARD_ASSET_WIDTH + MOODBOARD_LAYOUT_GAP), y: columns[index] },
      size: { width: MOODBOARD_ASSET_WIDTH, height },
      zIndex: 1,
      data: { assetId: asset.id, assetSnapshot: { filename: asset.filename, mediaKind: asset.mediaKind, thumbnailPath: asset.thumbnailPath }, fit: "cover" },
    };
    columns[index] += height + MOODBOARD_LAYOUT_GAP;
    return node;
  });
}

export function updateNode(document: MoodboardDocument, id: string, update: (node: MoodboardNode) => MoodboardNode): MoodboardDocument {
  return { ...document, nodes: document.nodes.map((node) => node.id === id ? update(node) : node) };
}
