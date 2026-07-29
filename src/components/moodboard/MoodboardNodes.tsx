import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { Film, ImageOff, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "../../api";
import type { FlowMoodboardNode } from "../../features/moodboard/model";

function ConnectionHandles({ visible }: { visible: boolean }) {
  return <>
    <Handle className={visible ? "moodboardHandle visible" : "moodboardHandle"} type="target" position={Position.Top} />
    <Handle className={visible ? "moodboardHandle visible" : "moodboardHandle"} type="source" position={Position.Bottom} />
  </>;
}

export function AssetNode({ data, selected }: NodeProps<FlowMoodboardNode>) {
  const node = data.moodboardNode;
  if (node.type !== "asset") return null;
  const src = data.asset?.thumbnailPath ?? node.data.assetSnapshot?.thumbnailPath;
  const filename = data.asset?.filename ?? node.data.assetSnapshot?.filename ?? "Missing asset";
  const isVideo = data.asset?.mediaKind ?? node.data.assetSnapshot?.mediaKind;
  return <div className={`moodboardNode moodboardAssetNode ${selected ? "selected" : ""}`}>
    <NodeResizer isVisible={selected} minWidth={120} minHeight={100} keepAspectRatio color="var(--accent)" onResizeEnd={() => data.onResizeEnd(node.id)} />
    <ConnectionHandles visible={selected || data.connecting} />
    {src ? <img draggable={false} src={mediaUrl(src)} alt={filename} style={{ objectFit: node.data.fit }} /> : <span className="moodboardMissingAsset"><ImageOff size={22} /><small>{filename}</small></span>}
    {isVideo === "video" && <span className="moodboardVideoMark"><Play size={11} fill="currentColor" /></span>}
    {isVideo === "video" && !src && <Film size={13} className="moodboardMissingVideo" />}
  </div>;
}

export function TextNode({ data, selected }: NodeProps<FlowMoodboardNode>) {
  const node = data.moodboardNode;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.type === "text" ? node.data.text : "");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (node.type === "text" && !editing) setDraft(node.data.text); }, [editing, node]);
  if (node.type !== "text") return null;
  const commit = () => {
    setEditing(false);
    if (draft !== node.data.text) data.onTextCommit(node.id, draft);
  };
  const begin = () => { setEditing(true); requestAnimationFrame(() => inputRef.current?.focus()); };
  return <div className={`moodboardNode moodboardTextNode ${selected ? "selected" : ""}`} style={{ color: node.data.color, textAlign: node.data.align }}>
    <NodeResizer isVisible={selected} minWidth={140} minHeight={54} color="var(--accent)" onResizeEnd={() => data.onResizeEnd(node.id)} />
    <ConnectionHandles visible={selected || data.connecting} />
    <textarea ref={inputRef} className={`nodrag nopan moodboardTextInput ${node.data.fontSize}`} value={draft} readOnly={!editing} aria-label="Text node" onDoubleClick={begin} onBlur={commit} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setDraft(node.data.text); setEditing(false); inputRef.current?.blur(); } if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); commit(); inputRef.current?.blur(); } }} />
  </div>;
}

export function SwatchNode({ data, selected }: NodeProps<FlowMoodboardNode>) {
  const node = data.moodboardNode;
  if (node.type !== "swatch") return null;
  return <div className={`moodboardNode moodboardSwatchNode ${selected ? "selected" : ""}`} style={{ background: node.data.color }}>
    <NodeResizer isVisible={selected} minWidth={108} minHeight={84} color="var(--accent)" onResizeEnd={() => data.onResizeEnd(node.id)} />
    <ConnectionHandles visible={selected || data.connecting} />
    <span>{node.data.name || node.data.color}</span>
  </div>;
}
