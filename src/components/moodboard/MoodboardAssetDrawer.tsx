import { Film, FolderPlus, ImageOff, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { createContext, useContext, useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { mediaUrl } from "../../api";
import type { Asset } from "../../types";

export interface MoodboardAssetGroup { id: string; name: string; assets: Asset[]; }
export interface MoodboardAssetGroupControls {
  groups: MoodboardAssetGroup[]; selectedGroupId?: string; onSelectGroup: (id?: string) => void;
  onCreateGroup: (name: string) => void; onRenameGroup: (group: MoodboardAssetGroup, name: string) => void;
  onDeleteGroup: (group: MoodboardAssetGroup) => void; onAddAssetsToGroup: (group: MoodboardAssetGroup, assets: Asset[]) => void;
}

const AssetGroupContext = createContext<MoodboardAssetGroupControls | undefined>(undefined);
export function MoodboardAssetGroupsProvider({ controls, children }: { controls?: MoodboardAssetGroupControls; children: ReactNode }) { return <AssetGroupContext.Provider value={controls}>{children}</AssetGroupContext.Provider>; }

interface Props {
  collectionAssets: Asset[]; allAssets: Asset[]; onAddAsset: (asset: Asset) => void; onDragStart: (event: React.DragEvent, asset: Asset) => void;
  groups?: MoodboardAssetGroup[]; selectedGroupId?: string; onSelectGroup?: (id?: string) => void; onCreateGroup?: (name: string) => void;
  onRenameGroup?: (group: MoodboardAssetGroup, name: string) => void; onDeleteGroup?: (group: MoodboardAssetGroup) => void;
  onAddAssetsToGroup?: (group: MoodboardAssetGroup, assets: Asset[]) => void;
}

function GroupControls({ controls }: { controls: MoodboardAssetGroupControls }) {
  const [draft, setDraft] = useState(""); const active = controls.groups.find((group) => group.id === controls.selectedGroupId);
  const create = () => { const name = draft.trim(); if (name) { controls.onCreateGroup(name); setDraft(""); } };
  const rename = () => { const name = draft.trim(); if (active && name) { controls.onRenameGroup(active, name); setDraft(""); } };
  return <div className="moodboardDrawerGroups"><div className="moodboardDrawerGroupsHeader"><strong>画板素材组</strong></div><div className="moodboardDrawerGroupList">{controls.groups.map((group) => <button key={group.id} type="button" className={group.id === (controls.selectedGroupId ?? controls.groups[0]?.id) ? "active" : ""} aria-pressed={group.id === (controls.selectedGroupId ?? controls.groups[0]?.id)} onClick={() => controls.onSelectGroup(group.id)}>{group.name}<small>{group.assets.length}</small></button>)}</div><div className="moodboardDrawerGroupEditor"><input aria-label="Group name" value={draft} placeholder={active ? active.name : "新建素材组"} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") active ? rename() : create(); }} /><button className="iconButton tiny" type="button" aria-label={active ? "重命名素材组" : "新建素材组"} title={active ? "重命名素材组" : "新建素材组"} onClick={active ? rename : create}>{active ? <Pencil size={14} /> : <Plus size={15} />}</button>{active ? <button className="iconButton tiny moodboardGroupDelete" type="button" aria-label="删除素材组" title="删除素材组" onClick={() => controls.onDeleteGroup(active)}><Trash2 size={14} /></button> : null}</div></div>;
}

export function MoodboardAssetDrawer({ collectionAssets: _collectionAssets, allAssets, onAddAsset, onDragStart, groups, selectedGroupId, onSelectGroup, onCreateGroup, onRenameGroup, onDeleteGroup, onAddAssetsToGroup }: Props) {
  const contextualControls = useContext(AssetGroupContext);
  const groupControls = groups && onSelectGroup && onCreateGroup && onRenameGroup && onDeleteGroup && onAddAssetsToGroup ? { groups, selectedGroupId, onSelectGroup, onCreateGroup, onRenameGroup, onDeleteGroup, onAddAssetsToGroup } : contextualControls;
  const [open, setOpen] = useState(true); const [adding, setAdding] = useState(false); const [search, setSearch] = useState(""); const deferredSearch = useDeferredValue(search);
  const selectedGroup = groupControls?.groups.find((group) => group.id === groupControls.selectedGroupId) ?? groupControls?.groups[0]; const scopeAssets = adding ? allAssets : selectedGroup?.assets ?? [];
  const visibleAssets = useMemo(() => { const needle = deferredSearch.trim().toLocaleLowerCase(); return needle ? scopeAssets.filter((asset) => `${asset.filename} ${asset.path}`.toLocaleLowerCase().includes(needle)) : scopeAssets; }, [deferredSearch, scopeAssets]);
  const addToGroup = (asset: Asset) => { if (groupControls && selectedGroup && !selectedGroup.assets.some((item) => item.id === asset.id)) groupControls.onAddAssetsToGroup(selectedGroup, [...selectedGroup.assets, asset]); };
  if (!open) return <button className="moodboardDrawerPeek" type="button" title="Open asset drawer" aria-label="Open asset drawer" onClick={() => setOpen(true)}><PanelLeftOpen size={17} /></button>;
  return <aside className="moodboardAssetDrawer"><header><strong>素材组</strong><span><button className={adding ? "iconButton tiny active" : "iconButton tiny"} type="button" title="从素材库添加" aria-label="从素材库添加" disabled={!selectedGroup} onClick={() => { setAdding((value) => !value); setSearch(""); }}><FolderPlus size={15} /></button><button className="iconButton tiny" type="button" title="Close asset drawer" aria-label="Close asset drawer" onClick={() => setOpen(false)}><PanelLeftClose size={16} /></button></span></header>{groupControls ? <GroupControls controls={groupControls} /> : null}<label className="moodboardDrawerSearch"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={adding ? "搜索素材库并加入当前组" : "搜索当前素材组"} /></label><div className="moodboardDrawerItems">{visibleAssets.map((asset) => <div key={asset.id} className="moodboardDrawerAssetWrap"><button className="moodboardDrawerAsset" type="button" draggable={!adding} onDragStart={(event) => onDragStart(event, asset)} onClick={() => { if (adding) addToGroup(asset); else onAddAsset(asset); }} title={adding && selectedGroup ? `加入 ${selectedGroup.name}` : asset.filename}><span>{asset.thumbnailPath ? <img draggable={false} src={mediaUrl(asset.thumbnailPath)} alt="" /> : <ImageOff size={15} />}{asset.mediaKind === "video" && <i><Film size={10} /></i>}</span><small>{asset.filename}</small></button></div>)}{visibleAssets.length === 0 && <p className="moodboardDrawerEmpty">{selectedGroup ? adding ? "没有匹配的素材" : "这个素材组还没有素材" : "新建一个素材组后添加素材"}</p>}</div></aside>;
}
