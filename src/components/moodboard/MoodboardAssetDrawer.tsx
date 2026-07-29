import { Film, ImageOff, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { mediaUrl } from "../../api";
import type { Asset } from "../../types";

export function MoodboardAssetDrawer({ collectionAssets, allAssets, onAddAsset, onDragStart }: { collectionAssets: Asset[]; allAssets: Asset[]; onAddAsset: (asset: Asset) => void; onDragStart: (event: React.DragEvent, asset: Asset) => void }) {
  const [open, setOpen] = useState(true);
  const [scope, setScope] = useState<"context" | "library">("context");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const assets = scope === "context" ? collectionAssets : allAssets;
  const visibleAssets = useMemo(() => {
    const needle = deferredSearch.trim().toLocaleLowerCase();
    return needle ? assets.filter((asset) => `${asset.filename} ${asset.path}`.toLocaleLowerCase().includes(needle)) : assets;
  }, [assets, deferredSearch]);
  if (!open) return <button className="moodboardDrawerPeek" type="button" title="Open asset drawer" aria-label="Open asset drawer" onClick={() => setOpen(true)}><PanelLeftOpen size={17} /></button>;
  return <aside className="moodboardAssetDrawer">
    <header><strong>素材</strong><button className="iconButton tiny" type="button" title="Close asset drawer" aria-label="Close asset drawer" onClick={() => setOpen(false)}><PanelLeftClose size={16} /></button></header>
    <div className="moodboardDrawerSegments" role="group" aria-label="Asset scope"><button aria-pressed={scope === "context"} type="button" onClick={() => setScope("context")}>当前上下文</button><button aria-pressed={scope === "library"} type="button" onClick={() => setScope("library")}>全库</button></div>
    <label className="moodboardDrawerSearch"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索素材" /></label>
    <div className="moodboardDrawerItems">
      {visibleAssets.map((asset) => <button key={asset.id} className="moodboardDrawerAsset" type="button" draggable onDragStart={(event) => onDragStart(event, asset)} onClick={() => onAddAsset(asset)} title={asset.filename}>
        <span>{asset.thumbnailPath ? <img draggable={false} src={mediaUrl(asset.thumbnailPath)} alt="" /> : <ImageOff size={15} />}{asset.mediaKind === "video" && <i><Film size={10} /></i>}</span><small>{asset.filename}</small>
      </button>)}
      {visibleAssets.length === 0 && <p className="moodboardDrawerEmpty">没有可用素材</p>}
    </div>
  </aside>;
}
