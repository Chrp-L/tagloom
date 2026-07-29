import "@xyflow/react/dist/style.css";
import "../../styles/moodboard-canvas.css";

import { applyEdgeChanges, applyNodeChanges, Background, BackgroundVariant, BaseEdge, ConnectionMode, getBezierPath, MiniMap, PanOnScrollMode, Panel, ReactFlow, type Connection, type EdgeProps, type NodeChange, type OnSelectionChangeParams, type ReactFlowInstance } from "@xyflow/react";
import { AlignCenterHorizontal, AlignCenterVertical, BetweenHorizontalStart, BetweenVerticalStart, BringToFront, Download, Expand, Grid3X3, Link2, Magnet, Map as MapIcon, MoreHorizontal, MousePointer2, Palette, Redo2, SendToBack, Trash2, Type, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent } from "react";
import type { Asset, MoodboardDocument, MoodboardEdge, MoodboardHandlePosition, MoodboardNode } from "../../types";
import { MOODBOARD_PORTS, autoLayoutAssets, createMoodboardId, edgePortConfig, findMoodboardGuides, flowEdgesToDocument, flowNodesToDocument, isValidMoodboardConnection, toFlowEdges, toFlowNodes, type FlowMoodboardEdge, type FlowMoodboardNode } from "../../features/moodboard/model";
import { MoodboardAssetDrawer } from "./MoodboardAssetDrawer";
import type { MoodboardContextSection } from "./MoodboardAssetDrawer";
import { MoodboardInspector } from "./MoodboardInspector";
import { AssetNode, SwatchNode, TextNode } from "./MoodboardNodes";

const nodeTypes = { asset: AssetNode, text: TextNode, swatch: SwatchNode };
const edgeTypes = { moodboard: MoodboardEdgeComponent };
const EMPTY_SELECTION = { nodeIds: [] as string[], edgeIds: [] as string[] };
const SNAP_GRID: [number, number] = [8, 8];
type CanvasMode = "select" | "connect";
type PendingPort = { nodeId: string; port: MoodboardHandlePosition };

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

function validPort(value?: string | null): MoodboardHandlePosition | undefined {
  return MOODBOARD_PORTS.includes(value as MoodboardHandlePosition) ? value as MoodboardHandlePosition : undefined;
}

function createAssetNode(asset: Asset, position: { x: number; y: number }, zIndex: number): MoodboardNode {
  const ratio = asset.width && asset.height ? asset.width / asset.height : 4 / 3;
  return {
    id: createMoodboardId("asset"), type: "asset", position, size: { width: 240, height: Math.round(240 / ratio) }, zIndex,
    data: { assetId: asset.id, assetSnapshot: { filename: asset.filename, mediaKind: asset.mediaKind, thumbnailPath: asset.thumbnailPath }, fit: "cover" },
  };
}

function layoutAssetsAt(assets: Asset[], center: { x: number; y: number }, startZIndex: number): MoodboardNode[] {
  const width = 240;
  const gap = 28;
  const columns = [0, 0, 0];
  const nodes = assets.map((asset, index) => {
    const column = columns.indexOf(Math.min(...columns));
    const ratio = asset.width && asset.height ? asset.width / asset.height : 4 / 3;
    const height = Math.round(240 / ratio);
    const node = createAssetNode(asset, { x: column * (width + gap), y: columns[column] }, startZIndex + index);
    columns[column] += height + gap;
    return node;
  });
  const layoutHeight = Math.max(0, ...columns) - gap;
  const offset = { x: center.x - (width * 3 + gap * 2) / 2, y: center.y - layoutHeight / 2 };
  return nodes.map((node) => ({ ...node, position: { x: Math.round(node.position.x + offset.x), y: Math.round(node.position.y + offset.y) } }));
}

export interface MoodboardCanvasProps {
  document: MoodboardDocument;
  collectionAssets?: Asset[];
  contextSections?: MoodboardContextSection[];
  searchResults?: Asset[];
  search?: string;
  onSearchChange?: (search: string) => void;
  allAssets: Asset[];
  saveState?: "saving" | "saved" | "error";
  onChange: (document: MoodboardDocument) => void;
  onPreviewAsset?: (asset: Asset) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onExport?: () => void;
  onBoardMenu?: () => void;
}

export function MoodboardCanvas({ document, collectionAssets = [], contextSections, searchResults = [], search = "", onSearchChange, allAssets, saveState, onChange, onPreviewAsset, onUndo, onRedo, canUndo, canRedo, onExport, onBoardMenu }: MoodboardCanvasProps) {
  const [mode, setMode] = useState<CanvasMode>("select");
  const [pendingPort, setPendingPort] = useState<PendingPort>();
  const [showMap, setShowMap] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [selection, setSelection] = useState(EMPTY_SELECTION);
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const documentRef = useRef(document);
  const canvasActiveRef = useRef(false);
  const flowRef = useRef<ReactFlowInstance<FlowMoodboardNode, FlowMoodboardEdge> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const assetsById = useMemo(() => new Map(allAssets.map((asset) => [asset.id, asset])), [allAssets]);
  const setSelectMode = useCallback(() => { setMode("select"); setPendingPort(undefined); }, []);
  const commitText = useCallback((id: string, text: string) => {
    const base = documentRef.current;
    onChange({ ...base, nodes: base.nodes.map((node) => node.id === id && node.type === "text" ? { ...node, data: { ...node.data, text } } : node) });
  }, [onChange]);
  const commitResize = useCallback(() => requestAnimationFrame(() => {
    const nodes = flowRef.current?.getNodes();
    if (nodes) onChange(flowNodesToDocument(nodes, documentRef.current));
  }), [onChange]);
  const createPortConnection = useCallback((sourceNodeId: string, sourceHandle: MoodboardHandlePosition, targetNodeId: string, targetHandle: MoodboardHandlePosition) => {
    const base = documentRef.current;
    if (!isValidMoodboardConnection({ source: sourceNodeId, target: targetNodeId }, base.edges)) return false;
    const edge: MoodboardEdge = { id: createMoodboardId("edge"), sourceNodeId, targetNodeId, color: "neutral", config: { sourceHandle, targetHandle } };
    documentRef.current = { ...base, edges: [...base.edges, edge] };
    onChange(documentRef.current);
    return true;
  }, [onChange]);
  const onPortClick = useCallback((nodeId: string, port: MoodboardHandlePosition) => {
    if (mode !== "connect") return;
    if (!pendingPort) { setPendingPort({ nodeId, port }); return; }
    if (createPortConnection(pendingPort.nodeId, pendingPort.port, nodeId, port)) setPendingPort(undefined);
  }, [createPortConnection, mode, pendingPort]);
  const [flowNodes, setFlowNodes] = useState<FlowMoodboardNode[]>(() => toFlowNodes(document, allAssets, "select", commitText, commitResize, onPortClick));
  const [flowEdges, setFlowEdges] = useState<FlowMoodboardEdge[]>(() => toFlowEdges(document));
  useEffect(() => {
    documentRef.current = document;
    setFlowNodes(toFlowNodes(document, allAssets, mode, commitText, commitResize, onPortClick));
    setFlowEdges(toFlowEdges(document));
  }, [allAssets, commitResize, commitText, document, mode, onPortClick]);

  const publish = useCallback((next: MoodboardDocument) => { documentRef.current = next; setFlowNodes(toFlowNodes(next, allAssets, mode, commitText, commitResize, onPortClick)); setFlowEdges(toFlowEdges(next)); onChange(next); }, [allAssets, commitResize, commitText, mode, onChange, onPortClick]);
  const commitNodes = useCallback(() => onChange(flowNodesToDocument(flowRef.current?.getNodes() ?? flowNodes, documentRef.current)), [flowNodes, onChange]);
  const commitEdges = useCallback(() => onChange(flowEdgesToDocument(flowRef.current?.getEdges() ?? flowEdges, documentRef.current)), [flowEdges, onChange]);
  const addAsset = useCallback((asset: Asset, position?: { x: number; y: number }) => {
    const base = documentRef.current;
    publish({ ...base, nodes: [...base.nodes, createAssetNode(asset, position ?? { x: 120, y: 100 }, Math.max(0, ...base.nodes.map((item) => item.zIndex)) + 1)] });
  }, [publish]);
  const addText = useCallback(() => { const base = documentRef.current; publish({ ...base, nodes: [...base.nodes, { id: createMoodboardId("text"), type: "text", position: { x: 120, y: 120 }, size: { width: 280, height: 86 }, zIndex: Math.max(0, ...base.nodes.map((item) => item.zIndex)) + 1, data: { text: "双击编辑文字", fontSize: "medium", color: "#202422", align: "left" } }] }); }, [publish]);
  const addSwatch = useCallback(() => { const base = documentRef.current; publish({ ...base, nodes: [...base.nodes, { id: createMoodboardId("swatch"), type: "swatch", position: { x: 150, y: 150 }, size: { width: 156, height: 112 }, zIndex: Math.max(0, ...base.nodes.map((item) => item.zIndex)) + 1, data: { color: "#ed6758", name: "Coral" } }] }); }, [publish]);
  const onNodesChange = useCallback((changes: NodeChange<FlowMoodboardNode>[]) => { setFlowNodes((nodes) => applyNodeChanges(changes, nodes)); if (changes.some((change) => change.type === "remove")) requestAnimationFrame(commitNodes); }, [commitNodes]);
  const onEdgesChange = useCallback((changes: Parameters<typeof applyEdgeChanges<FlowMoodboardEdge>>[0]) => { setFlowEdges((edges) => applyEdgeChanges(changes, edges)); if (changes.some((change) => change.type === "remove")) requestAnimationFrame(commitEdges); }, [commitEdges]);
  const onConnect = useCallback((connection: Connection) => {
    const sourceHandle = validPort(connection.sourceHandle); const targetHandle = validPort(connection.targetHandle);
    if (!connection.source || !connection.target || !sourceHandle || !targetHandle) return;
    if (createPortConnection(connection.source, sourceHandle, connection.target, targetHandle)) setPendingPort(undefined);
  }, [createPortConnection]);
  const deleteSelected = useCallback(() => {
    const base = documentRef.current; if (!selection.nodeIds.length && !selection.edgeIds.length) return;
    const nodes = new Set(selection.nodeIds); const edges = new Set(selection.edgeIds);
    publish({ ...base, nodes: base.nodes.filter((node) => !nodes.has(node.id)), edges: base.edges.filter((edge) => !edges.has(edge.id) && !nodes.has(edge.sourceNodeId) && !nodes.has(edge.targetNodeId)) }); setSelection(EMPTY_SELECTION);
  }, [publish, selection]);
  const bring = useCallback((direction: "front" | "back") => { const base = documentRef.current; const ids = new Set(selection.nodeIds); if (!ids.size) return; const extreme = direction === "front" ? Math.max(0, ...base.nodes.map((node) => node.zIndex)) : Math.min(0, ...base.nodes.map((node) => node.zIndex)); publish({ ...base, nodes: base.nodes.map((node) => ids.has(node.id) ? { ...node, zIndex: direction === "front" ? extreme + 1 : extreme - 1 } : node) }); }, [publish, selection]);
  const onSelectionChange = useCallback(({ nodes, edges }: OnSelectionChangeParams<FlowMoodboardNode, FlowMoodboardEdge>) => setSelection({ nodeIds: nodes.map((node) => node.id), edgeIds: edges.map((edge) => edge.id) }), []);
  const onNodeDrag = useCallback((_: MouseEvent | TouchEvent, node: FlowMoodboardNode) => {
    const source = { id: node.id, position: node.position, size: { width: node.measured?.width ?? node.width ?? 0, height: node.measured?.height ?? node.height ?? 0 } };
    const others = (flowRef.current?.getNodes() ?? []).map((item) => ({ id: item.id, position: item.position, size: { width: item.measured?.width ?? item.width ?? 0, height: item.measured?.height ?? item.height ?? 0 } }));
    const match = findMoodboardGuides(source, others); const rect = rootRef.current?.querySelector<HTMLElement>(".moodboardCanvasStage")?.getBoundingClientRect();
    if (!rect || !flowRef.current) return;
    setGuides({ x: match.x === undefined ? undefined : flowRef.current.flowToScreenPosition({ x: match.x, y: 0 }).x - rect.left, y: match.y === undefined ? undefined : flowRef.current.flowToScreenPosition({ x: 0, y: match.y }).y - rect.top });
  }, []);
  const onDrop = useCallback((event: React.DragEvent) => { event.preventDefault(); const asset = assetsById.get(event.dataTransfer.getData("application/x-moodboard-asset")); if (asset && flowRef.current) void addAsset(asset, flowRef.current.screenToFlowPosition({ x: event.clientX, y: event.clientY }, { snapToGrid, snapGrid: SNAP_GRID })); }, [addAsset, assetsById, snapToGrid]);
  const onWheelCapture = useCallback((event: WheelEvent<HTMLDivElement>) => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); event.stopPropagation(); const flow = flowRef.current; if (!flow) return; flow.zoomTo(Math.min(3, Math.max(0.1, flow.getViewport().zoom * (event.deltaY < 0 ? 1.12 : 0.89))), { duration: 0 }); }, []);
  const drawerSections = contextSections ?? [{ id: document.collectionId ?? "context", name: "当前上下文", assets: collectionAssets }];
  const drawerAssets = useMemo(() => [...new Map(drawerSections.flatMap((section) => section.assets).map((asset) => [asset.id, asset])).values()], [drawerSections]);
  const addAssets = useCallback((assets: Asset[]) => {
    if (!assets.length) return;
    const stage = rootRef.current?.querySelector<HTMLElement>(".moodboardCanvasStage")?.getBoundingClientRect();
    const center = stage && flowRef.current ? flowRef.current.screenToFlowPosition({ x: stage.left + stage.width / 2, y: stage.top + stage.height / 2 }) : { x: 240, y: 180 };
    const base = documentRef.current;
    publish({ ...base, nodes: [...base.nodes, ...layoutAssetsAt(assets, center, Math.max(0, ...base.nodes.map((node) => node.zIndex)) + 1)] });
  }, [publish]);
  const autoLayout = useCallback(() => { const base = documentRef.current; if (!base.nodes.length) publish({ ...base, nodes: autoLayoutAssets(drawerAssets) }); }, [drawerAssets, publish]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const active = window.document.activeElement; const target = event.target instanceof Element ? event.target : undefined;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || target?.closest("[role=dialog]")) return;
      if (!canvasActiveRef.current) return;
      if (event.key.toLowerCase() === "c") { event.preventDefault(); setMode("connect"); return; }
      if (event.key.toLowerCase() === "v") { event.preventDefault(); setSelectMode(); return; }
      if (event.key === "Escape" && mode === "connect") { event.preventDefault(); setSelectMode(); return; }
      if (mode !== "select") return;
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); deleteSelected(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? onRedo?.() : onUndo?.(); }
    };
    window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener);
  }, [deleteSelected, mode, onRedo, onUndo, setSelectMode]);
  return <div className="moodboardCanvasRoot" ref={rootRef} onPointerDown={() => { canvasActiveRef.current = true; }}><div className="moodboardCanvasStage" onDrop={onDrop} onDragOver={(event) => event.preventDefault()} onWheelCapture={onWheelCapture}>
    {guides.x !== undefined && <i className="moodboardCanvasGuide vertical" style={{ left: guides.x }} />}{guides.y !== undefined && <i className="moodboardCanvasGuide horizontal" style={{ top: guides.y }} />}
    <ReactFlow<FlowMoodboardNode, FlowMoodboardEdge> key={document.id} nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultViewport={document.viewport} onInit={(instance) => { flowRef.current = instance; }} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onSelectionChange={onSelectionChange} onNodeDrag={mode === "select" ? onNodeDrag : undefined} onNodeDragStop={mode === "select" ? () => { setGuides({}); commitNodes(); } : undefined} onNodeDoubleClick={mode === "select" ? (_, node) => { const assetId = node.data.moodboardNode.type === "asset" ? node.data.moodboardNode.data.assetId : undefined; const asset = assetId ? assetsById.get(assetId) : undefined; if (asset) onPreviewAsset?.(asset); } : undefined} onMoveEnd={(_, viewport) => onChange({ ...documentRef.current, viewport })} nodesDraggable={mode === "select"} nodesConnectable={mode === "connect"} elementsSelectable={mode === "select"} connectOnClick={false} connectionMode={ConnectionMode.Loose} isValidConnection={(connection) => isValidMoodboardConnection(connection, documentRef.current.edges)} panOnScroll panOnScrollMode={PanOnScrollMode.Free} panOnDrag={[1]} panActivationKeyCode="Space" zoomOnScroll={false} zoomOnPinch zoomOnDoubleClick={false} selectionOnDrag={false} selectionKeyCode={mode === "select" ? "Shift" : null} multiSelectionKeyCode="Shift" deleteKeyCode={null} snapToGrid={snapToGrid} snapGrid={SNAP_GRID} minZoom={0.1} maxZoom={3} defaultEdgeOptions={{ type: "moodboard" }} style={{ background: document.backgroundColor }}>
      {showGrid && <Background variant={BackgroundVariant.Dots} gap={SNAP_GRID[0]} size={1} color="var(--line)" />}
      <Panel position="top-center" className="moodboardCanvasToolbar"><button className={mode === "select" ? "active" : ""} type="button" title="Select mode (V)" aria-label="Select mode" aria-pressed={mode === "select"} onClick={setSelectMode}><MousePointer2 size={16} /></button><button className={mode === "connect" ? "active" : ""} type="button" title="Connect mode (C)" aria-label="Connect mode" aria-pressed={mode === "connect"} onClick={() => { setMode("connect"); setPendingPort(undefined); }}><Link2 size={16} /></button><i /><button type="button" title="Undo" aria-label="Undo" disabled={!canUndo} onClick={onUndo}><Undo2 size={16} /></button><button type="button" title="Redo" aria-label="Redo" disabled={!canRedo} onClick={onRedo}><Redo2 size={16} /></button><i /><button type="button" title="Add text" aria-label="Add text" onClick={addText}><Type size={16} /></button><button type="button" title="Add swatch" aria-label="Add swatch" onClick={addSwatch}><Palette size={16} /></button><i /><button className={showGrid ? "active" : ""} type="button" title="Toggle dot grid" aria-label="Toggle dot grid" aria-pressed={showGrid} onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={16} /></button><button className={snapToGrid ? "active" : ""} type="button" title="Toggle 8px snap" aria-label="Toggle 8px snap" aria-pressed={snapToGrid} onClick={() => setSnapToGrid((value) => !value)}><Magnet size={16} /></button><button type="button" title="Fit content" aria-label="Fit content" onClick={() => flowRef.current?.fitView({ padding: 0.18, duration: 180 })}><Expand size={16} /></button><button className={showMap ? "active" : ""} type="button" title="Toggle overview" aria-label="Toggle overview" aria-pressed={showMap} onClick={() => setShowMap((value) => !value)}><MapIcon size={16} /></button><button type="button" title="Export PNG" aria-label="Export PNG" onClick={onExport}><Download size={16} /></button><button type="button" title="Delete selected elements" aria-label="Delete selected elements" disabled={mode !== "select" || (!selection.nodeIds.length && !selection.edgeIds.length)} onClick={deleteSelected}><Trash2 size={16} /></button><button type="button" title="Moodboard menu" aria-label="Moodboard menu" onClick={onBoardMenu}><MoreHorizontal size={16} /></button>{pendingPort && <small className="moodboardCanvasConnectHint">选择目标端口</small>}{saveState && <small className={`moodboardCanvasSaveState ${saveState}`}>{saveState === "saving" ? "保存中" : saveState === "saved" ? "已保存" : "保存失败"}</small>}</Panel>
      {mode === "select" && selection.nodeIds.length > 1 && <Panel position="bottom-center" className="moodboardCanvasMultiToolbar"><button type="button" title="Align left" aria-label="Align left" onClick={() => publish(moveSelected(documentRef.current, selection, "left"))}><AlignCenterHorizontal size={16} /></button><button type="button" title="Align top" aria-label="Align top" onClick={() => publish(moveSelected(documentRef.current, selection, "top"))}><AlignCenterVertical size={16} /></button><button type="button" title="Distribute horizontally" aria-label="Distribute horizontally" onClick={() => publish(moveSelected(documentRef.current, selection, "distributeX"))}><BetweenHorizontalStart size={16} /></button><button type="button" title="Distribute vertically" aria-label="Distribute vertically" onClick={() => publish(moveSelected(documentRef.current, selection, "distributeY"))}><BetweenVerticalStart size={16} /></button><button type="button" title="Bring forward" aria-label="Bring forward" onClick={() => bring("front")}><BringToFront size={16} /></button><button type="button" title="Send backward" aria-label="Send backward" onClick={() => bring("back")}><SendToBack size={16} /></button><button type="button" title="Delete selected elements" aria-label="Delete selected elements" onClick={deleteSelected}><Trash2 size={16} /></button></Panel>}
      {showMap && <MiniMap pannable zoomable nodeStrokeWidth={1} maskColor="color-mix(in srgb, var(--surface) 75%, transparent)" bgColor="var(--surface-strong)" />}
    </ReactFlow>
    <MoodboardAssetDrawer contextSections={drawerSections} searchResults={searchResults} search={search} onSearchChange={onSearchChange ?? (() => undefined)} onAddAssets={addAssets} onDragStart={(event, asset) => { event.dataTransfer.setData("application/x-moodboard-asset", asset.id); event.dataTransfer.effectAllowed = "copy"; }} />
    {document.nodes.length === 0 && <div className="moodboardCanvasEmpty"><strong>从这里开始构思</strong><span>添加素材、文字或色彩，建立你的视觉方向。</span>{drawerAssets.length > 0 && <button type="button" onClick={autoLayout}>自动铺入关联上下文素材</button>}</div>}
  </div><MoodboardInspector document={document} selectedNodeIds={mode === "select" ? selection.nodeIds : []} selectedEdgeIds={mode === "select" ? selection.edgeIds : []} onChange={publish} onDelete={deleteSelected} onBringToFront={() => bring("front")} onSendToBack={() => bring("back")} /></div>;
}
