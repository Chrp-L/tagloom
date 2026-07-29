import { forwardRef, useMemo } from "react";
import { api, mediaUrl } from "../../api";
import { edgePortConfig } from "../moodboard/model";
import type { Asset, MoodboardDocument, MoodboardHandlePosition, MoodboardNode } from "../../types";

const EXPORT_PADDING = 64;
const MAX_EXPORT_SIDE = 8192;

interface ExportBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export function moodboardExportBounds(document: MoodboardDocument): ExportBounds {
  if (document.nodes.length === 0) return { minX: 0, minY: 0, width: 512, height: 320 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of document.nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + node.size.width);
    maxY = Math.max(maxY, node.position.y + node.size.height);
  }
  return { minX, minY, width: Math.max(1, maxX - minX) + EXPORT_PADDING * 2, height: Math.max(1, maxY - minY) + EXPORT_PADDING * 2 };
}

const portVectors: Record<MoodboardHandlePosition, { x: number; y: number }> = {
  top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 },
};

function portPoint(node: MoodboardNode, port: MoodboardHandlePosition, bounds: ExportBounds) {
  const left = node.position.x - bounds.minX + EXPORT_PADDING;
  const top = node.position.y - bounds.minY + EXPORT_PADDING;
  if (port === "top") return { x: left + node.size.width / 2, y: top };
  if (port === "right") return { x: left + node.size.width, y: top + node.size.height / 2 };
  if (port === "bottom") return { x: left + node.size.width / 2, y: top + node.size.height };
  return { x: left, y: top + node.size.height / 2 };
}

function edgePath(source: { x: number; y: number }, sourcePort: MoodboardHandlePosition, target: { x: number; y: number }, targetPort: MoodboardHandlePosition) {
  const bend = Math.min(48, Math.max(30, Math.hypot(target.x - source.x, target.y - source.y) * 0.26));
  const sourceVector = portVectors[sourcePort];
  const targetVector = portVectors[targetPort];
  return `M ${source.x} ${source.y} C ${source.x + sourceVector.x * bend} ${source.y + sourceVector.y * bend}, ${target.x + targetVector.x * bend} ${target.y + targetVector.y * bend}, ${target.x} ${target.y}`;
}

const edgeColors = { neutral: "#8b938e", coral: "#ed6758", green: "#3f8f74", gold: "#d4a43d" } as const;

export const MoodboardExportScene = forwardRef<HTMLDivElement, { document: MoodboardDocument; assets: Asset[] }>(({ document, assets }, ref) => {
  const bounds = useMemo(() => moodboardExportBounds(document), [document]);
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const nodeMap = useMemo(() => new Map(document.nodes.map((node) => [node.id, node])), [document.nodes]);
  return <div ref={ref} className="moodboardExportScene" style={{ width: bounds.width, height: bounds.height, background: document.backgroundColor }}>
    <svg className="moodboardExportEdges" width={bounds.width} height={bounds.height} aria-hidden="true">
      {document.edges.map((edge) => {
        const source = nodeMap.get(edge.sourceNodeId);
        const target = nodeMap.get(edge.targetNodeId);
        if (!source || !target) return null;
        const ports = edgePortConfig(edge, document.nodes);
        return <path key={edge.id} d={edgePath(portPoint(source, ports.sourceHandle, bounds), ports.sourceHandle, portPoint(target, ports.targetHandle, bounds), ports.targetHandle)} fill="none" stroke={edgeColors[edge.color]} strokeWidth="1.5" />;
      })}
    </svg>
    {document.nodes.map((node) => {
      const style = { left: node.position.x - bounds.minX + EXPORT_PADDING, top: node.position.y - bounds.minY + EXPORT_PADDING, width: node.size.width, height: node.size.height, zIndex: node.zIndex };
      if (node.type === "asset") {
        const asset = node.data.assetId ? assetMap.get(node.data.assetId) : undefined;
        const src = mediaUrl(asset?.thumbnailPath || node.data.assetSnapshot?.thumbnailPath);
        return <div key={node.id} className="moodboardExportNode moodboardExportAsset" style={style}>{src ? <img data-export-asset src={src} alt="" style={{ objectFit: node.data.fit }} /> : <span>{node.data.assetSnapshot?.filename || "Unavailable asset"}</span>}</div>;
      }
      if (node.type === "swatch") return <div key={node.id} className="moodboardExportNode moodboardExportSwatch" style={{ ...style, background: node.data.color }}><span>{node.data.name}</span></div>;
      return <div key={node.id} className={`moodboardExportNode moodboardExportText ${node.data.fontSize}`} style={{ ...style, color: node.data.color, textAlign: node.data.align }}>{node.data.text}</div>;
    })}
  </div>;
});

MoodboardExportScene.displayName = "MoodboardExportScene";

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = [...root.querySelectorAll<HTMLImageElement>("img[data-export-asset]")];
  const failures: string[] = [];
  await Promise.all(images.map((image) => new Promise<void>((resolve) => {
    if (image.complete) {
      if (image.naturalWidth === 0) failures.push(image.src);
      resolve();
      return;
    }
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => { failures.push(image.src); resolve(); }, { once: true });
  })));
  if (failures.length > 0) throw new Error(`Unable to load ${failures.length} moodboard asset${failures.length === 1 ? "" : "s"} for export`);
}

function pngBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function exportMoodboardPng(root: HTMLElement, name: string): Promise<boolean> {
  await waitForImages(root);
  const { toPng } = await import("html-to-image");
  const width = root.offsetWidth;
  const height = root.offsetHeight;
  const pixelRatio = Math.min(1, MAX_EXPORT_SIDE / Math.max(width, height));
  const dataUrl = await toPng(root, { cacheBust: true, width, height, pixelRatio });
  const target = await api.pickMoodboardExportPath(name);
  if (!target) return false;
  await api.writeMoodboardExport(target, pngBytes(dataUrl));
  return true;
}
