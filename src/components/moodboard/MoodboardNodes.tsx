import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { Film, ImageOff, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "../../api";
import { MOODBOARD_PORTS, type FlowMoodboardNode } from "../../features/moodboard/model";
import type { MoodboardHandlePosition } from "../../types";

const POSITION: Record<MoodboardHandlePosition, Position> = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left };

type NodeShell = Pick<FlowMoodboardNode, "id" | "type" | "data">;

function LoosePorts({ node, visible }: { node: NodeShell; visible: boolean }) {
  return <>{MOODBOARD_PORTS.map((port) => <span key={port} className={`moodboardCanvasPort moodboardCanvasPort-${port}${visible ? " active" : ""}`}>
    <Handle id={port} type="source" position={POSITION[port]} className="moodboardCanvasPortSource" onClick={(event) => { event.stopPropagation(); node.data.onPortClick(node.id, port); }} />
  </span>)}</>;
}

function NodeFrame({ node, selected, children }: { node: NodeShell; selected: boolean; children: React.ReactNode }) {
  const selectable = node.data.mode === "select";
  return <div className={`moodboardCanvasNode moodboardCanvasNode-${node.type} ${selected ? "selected" : ""} ${node.data.mode === "connect" ? "connectMode" : ""}`}>
    <NodeResizer isVisible={selectable && selected} minWidth={node.type === "asset" ? 120 : node.type === "text" ? 140 : 108} minHeight={node.type === "asset" ? 100 : node.type === "text" ? 54 : 84} keepAspectRatio={node.type === "asset"} color="var(--accent)" onResizeEnd={() => node.data.onResizeEnd(node.id)} />
    <LoosePorts node={node} visible={node.data.mode === "connect"} />
    {children}
  </div>;
}

export function AssetNode({ data, selected, id, type }: NodeProps<FlowMoodboardNode>) {
  const node: NodeShell = { id, type, data };
  const moodboardNode = data.moodboardNode;
  if (moodboardNode.type !== "asset") return null;
  const src = data.asset?.thumbnailPath ?? moodboardNode.data.assetSnapshot?.thumbnailPath;
  const filename = data.asset?.filename ?? moodboardNode.data.assetSnapshot?.filename ?? "Missing asset";
  const isVideo = data.asset?.mediaKind ?? moodboardNode.data.assetSnapshot?.mediaKind;
  return <NodeFrame node={node} selected={selected}><div className="moodboardCanvasAssetMedia">
    {src ? <img draggable={false} src={mediaUrl(src)} alt={filename} style={{ objectFit: moodboardNode.data.fit }} /> : <span className="moodboardCanvasMissingAsset"><ImageOff size={22} /><small>{filename}</small></span>}
    {isVideo === "video" && <span className="moodboardCanvasVideoMark"><Play size={11} fill="currentColor" /></span>}
    {isVideo === "video" && !src && <Film size={13} className="moodboardCanvasMissingVideo" />}
  </div></NodeFrame>;
}

export function TextNode({ data, selected, id, type }: NodeProps<FlowMoodboardNode>) {
  const node: NodeShell = { id, type, data };
  const moodboardNode = data.moodboardNode;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(moodboardNode.type === "text" ? moodboardNode.data.text : "");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (moodboardNode.type === "text" && !editing) setDraft(moodboardNode.data.text); }, [editing, moodboardNode]);
  if (moodboardNode.type !== "text") return null;
  const commit = () => { setEditing(false); if (draft !== moodboardNode.data.text) data.onTextCommit(node.id, draft); };
  const begin = () => { if (data.mode !== "select") return; setEditing(true); requestAnimationFrame(() => inputRef.current?.focus()); };
  return <NodeFrame node={node} selected={selected}><div className="moodboardCanvasTextMedia" style={{ color: moodboardNode.data.color, textAlign: moodboardNode.data.align }}>
    <textarea ref={inputRef} className={`nodrag nopan moodboardCanvasTextInput ${moodboardNode.data.fontSize}`} value={draft} readOnly={!editing} aria-label="Text node" onDoubleClick={begin} onBlur={commit} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setDraft(moodboardNode.data.text); setEditing(false); inputRef.current?.blur(); } else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commit(); inputRef.current?.blur(); } }} />
  </div></NodeFrame>;
}

export function SwatchNode({ data, selected, id, type }: NodeProps<FlowMoodboardNode>) {
  const node: NodeShell = { id, type, data };
  const moodboardNode = data.moodboardNode;
  if (moodboardNode.type !== "swatch") return null;
  return <NodeFrame node={node} selected={selected}><div className="moodboardCanvasSwatchMedia" style={{ background: moodboardNode.data.color }}><span>{moodboardNode.data.name || moodboardNode.data.color}</span></div></NodeFrame>;
}
