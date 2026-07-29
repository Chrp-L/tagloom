import "@xyflow/react/dist/style.css";

import { addEdge, BaseEdge, getBezierPath, MiniMap, PanOnScrollMode, Panel, ReactFlow, type Connection, type EdgeProps, type NodeChange, type OnSelectionChangeParams, type ReactFlowInstance } from "@xyflow/react";
import { AlignCenterHorizontal, AlignCenterVertical, BetweenHorizontalStart, BetweenVerticalStart, BringToFront, Download, Expand, Link2, Map as MapIcon, MoreHorizontal, Palette, Redo2, SendToBack, Trash2, Type, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import type { Asset, MoodboardDocument, MoodboardEdge, MoodboardNode } from "../../types";
import { applyFlowEdgeChanges, applyFlowNodeChanges, autoLayoutAssets, createMoodboardId, toFlowEdges, toFlowNodes, type FlowMoodboardEdge, type FlowMoodboardNode } from "../../features/moodboard/model";
import { MoodboardAssetDrawer } from "./MoodboardAssetDrawer";
import { MoodboardInspector } from "./MoodboardInspector";
import { AssetNode, SwatchNode, TextNode } from "./MoodboardNodes";

const nodeTypes = { asset: AssetNode, text: TextNode, swatch: SwatchNode };
const edgeTypes = { moodboard: MoodboardEdgeComponent };
const EMPTY_SELECTION = { nodeIds: [] as string[], edgeIds: [] as string[] };

function MoodboardEdgeComponent(props: EdgeProps<FlowMoodboardEdge>) {
  const [path] = getBezierPath(props);
  return <BaseEdge path={path} style={props.style} />;
}

function moveSelected(document: MoodboardDocument, selection: typeof EMPTY_SELECTION, action: "left" | "top" | "distributeX" | "distributeY"): MoodboardDocument {
  const ids = new Set(selection.nodeIds);
  const nodes = document.nodes.filter((node) => ids.has(node.id));
  if (nodes.length < 2) return document;
  const positions = new Map<string, { x: number; y: number }>();
  if (action === "left") {
    const x = Math.min(...nodes.map((node) => node.position.x));
    nodes.forEach((node) => positions.set(node.id, { x, y: node.position.y }));
  } else if (action === "top") {
    const y = Math.min(...nodes.map((node) => node.position.y));
    nodes.forEach((node) => positions.set(node.id, { x: node.position.x, y }));
  } else {
    const horizontal = action === "distributeX";
    const ordered = [...nodes].sort((a, b) => (horizontal ? a.position.x : a.position.y) - (horizontal ? b.position.x : b.position.y));
    const start = horizontal ? ordered[0].position.x : ordered[0].position.y;
    const end = horizontal ? ordered.at(-1)!.position.x : ordered.at(-1)!.position.y;
    const step = (end - start) / (ordered.length - 1);
    ordered.forEach((node, index) => positions.set(node.id, horizontal ? { x: start + step * index, y: node.position.y } : { x: node.position.x, y: start + step * index }));
  }
  return { ...document, nodes: document.nodes.map((node) => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node) };
}

export interface MoodboardCanvasProps {
  document: MoodboardDocument;
  collectionAssets: Asset[];
  allAssets: Asset[];
  saveState?: "saving" | "saved" | "error";
  onChange: (document: MoodboardDocument) => void;
  onPreviewAsset?: (asset: Asset) => void;
  onEnsureAssetInCollection?: (asset: Asset) => Promise<void> | void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onExport?: () => void;
  onBoardMenu?: () => void;
}

export function MoodboardCanvas({ document, collectionAssets, allAssets, saveState, onChange, onPreviewAsset, onEnsureAssetInCollection, onUndo, onRedo, canUndo, canRedo, onExport, onBoardMenu }: MoodboardCanvasProps) {
  const [connecting, setConnecting] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const flowRef = useRef<ReactFlowInstance<FlowMoodboardNode, FlowMoodboardEdge> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const assetsById = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets]);
  const textChange = useCallback((id: string, text: string) => onChange({ ...document, nodes: document.nodes.map((node) => node.id === id && node.type === "text" ? { ...node, data: { ...node.data, text } } : node) }), [document, onChange]);
  const flowNodes = useMemo(() => toFlowNodes(document, allAssets, connecting, textChange), [allAssets, connecting, document, textChange]);
  const flowEdges = useMemo(() => toFlowEdges(document), [document]);
  const addAsset = useCallback(async (asset: Asset, position?: { x: number; y: number }) => {
    await onEnsureAssetInCollection?.(asset);
    const ratio = asset.width && asset.height ? asset.width / asset.height : 4 / 3;
    const node: MoodboardNode = { id: createMoodboardId("asset"), type: "asset", position: position ?? { x: 120, y: 100 }, size: { width: 240, height: Math.round(240 / ratio) }, zIndex: Math.max(0, ...document.nodes.map((item) => item.zIndex)) + 1, data: { assetId: asset.id, assetSnapshot: { filename: asset.filename, mediaKind: asset.mediaKind, thumbnailPath: asset.thumbnailPath }, fit: "cover" } };
    onChange({ ...document, nodes: [...document.nodes, node] });
  }, [document, onChange, onEnsureAssetInCollection]);
  const addText = useCallback(() => onChange({ ...document, nodes: [...document.nodes, { id: createMoodboardId("text"), type: "text", position: { x: 120, y: 120 }, size: { width: 280, height: 86 }, zIndex: Math.max(0, ...document.nodes.map((item) => item.zIndex)) + 1, data: { text: "双击编辑文字", fontSize: "medium", color: "#202422", align: "left" } }] }), [document, onChange]);
  const addSwatch = useCallback(() => onChange({ ...document, nodes: [...document.nodes, { id: createMoodboardId("swatch"), type: "swatch", position: { x: 150, y: 150 }, size: { width: 156, height: 112 }, zIndex: Math.max(0, ...document.nodes.map((item) => item.zIndex)) + 1, data: { color: "#ed6758", name: "Coral" } }] }), [document, onChange]);
  const onNodesChange = useCallback((changes: NodeChange<FlowMoodboardNode>[]) => onChange(applyFlowNodeChanges(changes, document, flowNodes)), [document, flowNodes, onChange]);
  const onEdgesChange = useCallback((changes: Parameters<typeof applyFlowEdgeChanges>[0]) => onChange(applyFlowEdgeChanges(changes, document, flowEdges)), [document, flowEdges, onChange]);
  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const moodboardEdge: MoodboardEdge = { id: createMoodboardId("edge"), sourceNodeId: connection.source, targetNodeId: connection.target, color: "neutral" };
    const edges = addEdge({ id: moodboardEdge.id, source: moodboardEdge.sourceNodeId, target: moodboardEdge.targetNodeId, type: "moodboard", data: { moodboardEdge } }, flowEdges);
    onChange({ ...document, edges: edges.flatMap((edge) => edge.data?.moodboardEdge ? [edge.data.moodboardEdge] : []) });
  }, [document, flowEdges, onChange]);
  const deleteSelected = useCallback(() => {
    if (!selection.nodeIds.length && !selection.edgeIds.length) return;
    const nodes = new Set(selection.nodeIds); const edges = new Set(selection.edgeIds);
    onChange({ ...document, nodes: document.nodes.filter((node) => !nodes.has(node.id)), edges: document.edges.filter((edge) => !edges.has(edge.id) && !nodes.has(edge.sourceNodeId) && !nodes.has(edge.targetNodeId)) });
    setSelection(EMPTY_SELECTION);
  }, [document, onChange, selection]);
  const bring = useCallback((direction: "front" | "back") => {
    const ids = new Set(selection.nodeIds); if (!ids.size) return;
    const extreme = direction === "front" ? Math.max(0, ...document.nodes.map((node) => node.zIndex)) : Math.min(0, ...document.nodes.map((node) => node.zIndex));
    onChange({ ...document, nodes: document.nodes.map((node) => ids.has(node.id) ? { ...node, zIndex: direction === "front" ? extreme + 1 : extreme - 1 } : node) });
  }, [document, onChange, selection]);
  const onSelectionChange = useCallback(({ nodes, edges }: OnSelectionChangeParams<FlowMoodboardNode, FlowMoodboardEdge>) => setSelection({ nodeIds: nodes.map((node) => node.id), edgeIds: edges.map((edge) => edge.id) }), []);
  const onDrop = useCallback((event: React.DragEvent) => { event.preventDefault(); const asset = assetsById.get(event.dataTransfer.getData("application/x-moodboard-asset")); if (asset && flowRef.current) void addAsset(asset, flowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY })); }, [addAsset, assetsById]);
  const onWheelCapture = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault(); event.stopPropagation();
    const flow = flowRef.current;
    if (!flow) return;
    const viewport = flow.getViewport();
    flow.zoomTo(Math.min(3, Math.max(0.1, viewport.zoom * (event.deltaY < 0 ? 1.12 : 0.89))), { duration: 0 });
  }, []);
  const startDrag = useCallback((event: React.DragEvent, asset: Asset) => { event.dataTransfer.setData("application/x-moodboard-asset", asset.id); event.dataTransfer.effectAllowed = "copy"; }, []);
  const autoLayout = useCallback(() => { if (!document.nodes.length) onChange({ ...document, nodes: autoLayoutAssets(collectionAssets) }); }, [collectionAssets, document, onChange]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => { const root = rootRef.current; const active = window.document.activeElement; if (!root || !root.contains(active) || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return; if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); } if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "z") { event.preventDefault(); event.shiftKey ? onRedo?.() : onUndo?.(); } };
    window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener);
  }, [deleteSelected, onRedo, onUndo]);
  return <div className="moodboardEditor" ref={rootRef} tabIndex={-1}><div className="moodboardCanvasArea" onDrop={onDrop} onDragOver={(event) => event.preventDefault()} onWheelCapture={onWheelCapture}>
    <ReactFlow<FlowMoodboardNode, FlowMoodboardEdge> key={document.id} nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultViewport={document.viewport} onInit={(instance) => { flowRef.current = instance; }} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onSelectionChange={onSelectionChange} onNodeDoubleClick={(_, node) => { const assetId = node.data.moodboardNode.type === "asset" ? node.data.moodboardNode.data.assetId : undefined; const asset = assetId ? assetsById.get(assetId) : undefined; if (asset) onPreviewAsset?.(asset); }} onMoveEnd={(_, viewport) => onChange({ ...document, viewport })} nodesConnectable={connecting} panOnScroll panOnScrollMode={PanOnScrollMode.Free} zoomOnScroll={false} zoomOnPinch zoomOnDoubleClick={false} selectionOnDrag selectionKeyCode="Shift" multiSelectionKeyCode="Shift" deleteKeyCode={null} minZoom={0.1} maxZoom={3} defaultEdgeOptions={{ type: "moodboard" }} style={{ background: document.backgroundColor }}>
      <Panel position="top-center" className="moodboardToolbar"><button type="button" title="Undo" aria-label="Undo" disabled={!canUndo} onClick={onUndo}><Undo2 size={16} /></button><button type="button" title="Redo" aria-label="Redo" disabled={!canRedo} onClick={onRedo}><Redo2 size={16} /></button><i /><button type="button" title="Add text" aria-label="Add text" onClick={addText}><Type size={16} /></button><button type="button" title="Add swatch" aria-label="Add swatch" onClick={addSwatch}><Palette size={16} /></button><button className={connecting ? "active" : ""} type="button" title="Connection mode" aria-label="Connection mode" aria-pressed={connecting} onClick={() => setConnecting((value) => !value)}><Link2 size={16} /></button><i /><button type="button" title="Fit content" aria-label="Fit content" onClick={() => flowRef.current?.fitView({ padding: 0.18, duration: 180 })}><Expand size={16} /></button><button className={showMap ? "active" : ""} type="button" title="Toggle overview" aria-label="Toggle overview" aria-pressed={showMap} onClick={() => setShowMap((value) => !value)}><MapIcon size={16} /></button><button type="button" title="Export PNG" aria-label="Export PNG" onClick={onExport}><Download size={16} /></button><button type="button" title="Moodboard menu" aria-label="Moodboard menu" onClick={onBoardMenu}><MoreHorizontal size={16} /></button>{saveState && <small className={`moodboardSaveState ${saveState}`}>{saveState === "saving" ? "保存中" : saveState === "saved" ? "已保存" : "保存失败"}</small>}</Panel>
      {selection.nodeIds.length > 1 && <Panel position="bottom-center" className="moodboardMultiToolbar"><button type="button" title="Align left" aria-label="Align left" onClick={() => onChange(moveSelected(document, selection, "left"))}><AlignCenterHorizontal size={16} /></button><button type="button" title="Align top" aria-label="Align top" onClick={() => onChange(moveSelected(document, selection, "top"))}><AlignCenterVertical size={16} /></button><button type="button" title="Distribute horizontally" aria-label="Distribute horizontally" onClick={() => onChange(moveSelected(document, selection, "distributeX"))}><BetweenHorizontalStart size={16} /></button><button type="button" title="Distribute vertically" aria-label="Distribute vertically" onClick={() => onChange(moveSelected(document, selection, "distributeY"))}><BetweenVerticalStart size={16} /></button><button type="button" title="Bring forward" aria-label="Bring forward" onClick={() => bring("front")}><BringToFront size={16} /></button><button type="button" title="Send backward" aria-label="Send backward" onClick={() => bring("back")}><SendToBack size={16} /></button><button type="button" title="Delete selected elements" aria-label="Delete selected elements" onClick={deleteSelected}><Trash2 size={16} /></button></Panel>}
      {showMap && <MiniMap pannable zoomable nodeStrokeWidth={1} maskColor="color-mix(in srgb, var(--surface) 75%, transparent)" bgColor="var(--surface-strong)" />}
    </ReactFlow>
    <MoodboardAssetDrawer collectionAssets={collectionAssets} allAssets={allAssets} onAddAsset={(asset) => { void addAsset(asset); }} onDragStart={startDrag} />
    {document.nodes.length === 0 && <div className="moodboardCanvasEmptyState"><strong>从这里开始构思</strong><span>添加素材、文字或色彩，建立你的视觉方向。</span>{collectionAssets.length > 0 && <button type="button" onClick={autoLayout}>自动铺入当前上下文素材</button>}</div>}
  </div><MoodboardInspector document={document} selectedNodeIds={selection.nodeIds} selectedEdgeIds={selection.edgeIds} onChange={onChange} onDelete={deleteSelected} onBringToFront={() => bring("front")} onSendToBack={() => bring("back")} /></div>;
}
