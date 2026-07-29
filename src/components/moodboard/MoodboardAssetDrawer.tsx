import { Check, ImageOff, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { mediaUrl } from "../../api";
import type { Asset } from "../../types";
import "../../styles/moodboard-drawer.css";

export interface MoodboardContextSection {
  id: string;
  name: string;
  assets: Asset[];
}

export interface MoodboardAssetDrawerProps {
  contextSections: MoodboardContextSection[];
  searchResults: Asset[];
  search: string;
  onSearchChange: (search: string) => void;
  onAddAssets: (assets: Asset[]) => void;
  onDragStart: (event: React.DragEvent, asset: Asset) => void;
}

function AssetTile({ asset, selected, onToggle, onDragStart }: { asset: Asset; selected: boolean; onToggle: () => void; onDragStart: (event: React.DragEvent, asset: Asset) => void }) {
  return <button type="button" className={`moodboardDrawerTile${selected ? " selected" : ""}`} aria-pressed={selected} aria-label={`${selected ? "Deselect" : "Select"} ${asset.filename}`} draggable onDragStart={(event) => onDragStart(event, asset)} onClick={onToggle}>
    <span className="moodboardDrawerThumb">{asset.thumbnailPath ? <img draggable={false} src={mediaUrl(asset.thumbnailPath)} alt="" /> : <ImageOff size={16} />}{selected ? <i className="moodboardDrawerCheck"><Check size={12} /></i> : null}</span>
    <small>{asset.filename}</small>
  </button>;
}

export function MoodboardAssetDrawer({ contextSections, searchResults, search, onSearchChange, onAddAssets, onDragStart }: MoodboardAssetDrawerProps) {
  const [open, setOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const selectedAssets = useMemo(() => {
    const byId = new Map<string, Asset>();
    for (const section of contextSections) for (const asset of section.assets) if (selectedIds.has(asset.id)) byId.set(asset.id, asset);
    for (const asset of searchResults) if (selectedIds.has(asset.id)) byId.set(asset.id, asset);
    return [...byId.values()];
  }, [contextSections, searchResults, selectedIds]);
  const toggle = (asset: Asset) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id);
    return next;
  });
  const addSelected = () => {
    if (selectedAssets.length === 0) return;
    onAddAssets(selectedAssets);
    setSelectedIds(new Set());
  };
  const searching = search.trim().length > 0;

  if (!open) return <button className="moodboardDrawerPeek" type="button" title="Open asset drawer" aria-label="Open asset drawer" onClick={() => setOpen(true)}><PanelLeftOpen size={17} /></button>;
  return <aside className="moodboardAssetDrawer" aria-label="Moodboard assets">
    <header className="moodboardDrawerHeader"><strong>素材</strong><button className="iconButton tiny" type="button" title="Close asset drawer" aria-label="Close asset drawer" onClick={() => setOpen(false)}><PanelLeftClose size={16} /></button></header>
    <label className="moodboardDrawerSearch"><Search size={14} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索全库素材" /></label>
    <div className="moodboardDrawerContent">
      {searching ? <section className="moodboardDrawerSection" aria-label="Search results"><h2>搜索结果 <small>{searchResults.length}</small></h2>{searchResults.length ? <div className="moodboardDrawerGrid">{searchResults.map((asset) => <AssetTile key={asset.id} asset={asset} selected={selectedIds.has(asset.id)} onToggle={() => toggle(asset)} onDragStart={onDragStart} />)}</div> : <p className="moodboardDrawerEmpty">没有匹配的素材</p>}</section> : contextSections.map((section) => <section key={section.id} className="moodboardDrawerSection" aria-label={section.name}><h2>{section.name} <small>{section.assets.length}</small></h2>{section.assets.length ? <div className="moodboardDrawerGrid">{section.assets.map((asset) => <AssetTile key={asset.id} asset={asset} selected={selectedIds.has(asset.id)} onToggle={() => toggle(asset)} onDragStart={onDragStart} />)}</div> : <p className="moodboardDrawerEmpty">暂无素材</p>}</section>)}
    </div>
    <footer className="moodboardDrawerFooter"><span>{selectedAssets.length} selected</span><button type="button" className="primaryButton" disabled={selectedAssets.length === 0} onClick={addSelected}>添加到画板</button></footer>
  </aside>;
}
