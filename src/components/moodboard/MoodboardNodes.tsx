import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import { Film, ImageOff, Play } from "lucide-react";
import { useState } from "react";
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
    <NodeResizer isVisible={selected} minWidth={120} minHeight={100} color="var(--accent)" />
    <ConnectionHandles visible={selected || data.connecting} />
    {src ? <img draggable={false} src={mediaUrl(src)} alt={filename} style={{ objectFit: node.data.fit }} /> : <span className="moodboardMissingAsset"><ImageOff size={22} /><small>{filename}</small></span>}
    {isVideo === "video" && <span className="moodboardVideoMark"><Play size={11} fill="currentColor" /></span>}
    {isVideo === "video" && !src && <Film size={13} className="moodboardMissingVideo" />}
  </div>;
}

export function TextNode({ data, selected }: NodeProps<FlowMoodboardNode>) {
  const node = data.moodboardNode;
  const [editing, setEditing] = useState(false);
  if (node.type !== "text") return null;
  return <div className={`moodboardNode moodboardTextNode ${selected ? "selected" : ""}`} style={{ color: node.data.color, textAlign: node.data.align }}>
    <NodeResizer isVisible={selected} minWidth={140} minHeight={54} color="var(--accent)" />
    <ConnectionHandles visible={selected || data.connecting} />
    <textarea className={`nodrag nopan moodboardTextInput ${node.data.fontSize}`} value={node.data.text} readOnly={!editing} aria-label="Text node" onDoubleClick={() => setEditing(true)} onBlur={() => setEditing(false)} onChange={(event) => data.onTextChange(node.id, event.target.value)} />
  </div>;
}

export function SwatchNode({ data, selected }: NodeProps<FlowMoodboardNode>) {
  const node = data.moodboardNode;
  if (node.type !== "swatch") return null;
  return <div className={`moodboardNode moodboardSwatchNode ${selected ? "selected" : ""}`} style={{ background: node.data.color }}>
    <NodeResizer isVisible={selected} minWidth={108} minHeight={84} color="var(--accent)" />
    <ConnectionHandles visible={selected || data.connecting} />
    <span>{node.data.name || node.data.color}</span>
  </div>;
}
