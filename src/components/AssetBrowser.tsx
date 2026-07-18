import { useVirtualizer } from "@tanstack/react-virtual";
import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { Check, Film, ImageOff, Play } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { mediaUrl } from "../api";
import { formatBytes, formatDate, formatDuration } from "../lib/format";
import type { Asset } from "../types";
import type { GridColumns } from "../store";
import { attachAssetInteraction } from "../lib/assetSelection";
import { attachModifierKeyTracking, createModifierKeyState, isRangePressed } from "../lib/modifierKeys";
import type { SelectionMode } from "../features/selection/selectionModel";
import { AssetContextMenu } from "./AssetContextMenu";

interface Props {
  assets: Asset[];
  total: number;
  view: "grid" | "list";
  gridColumns: GridColumns;
  selectionMode: SelectionMode;
  focusedAssetId?: string;
  checkedIds: string[];
  loading: boolean;
  error?: string;
  hasMore: boolean;
  noSources: boolean;
  contentMotionKey: string;
  wovenAssetId?: string;
  dropTargetAssetId?: string;
  onLoadMore: () => void;
  onFocus: (assetId?: string) => void;
  onToggleChecked: (assetId: string) => void;
  onCheckRange: (assetId: string) => void;
  onPreview: (asset: Asset) => void;
  onOpen: (asset: Asset) => void;
  onReveal: (asset: Asset) => void;
  onRename: (asset: Asset) => void;
  onMove: (asset: Asset) => void;
  onTrash: (assetIds: string[]) => void;
  onAddSource: () => void;
}

function ThumbnailImage({ src, draggable = true }: { src: string; draggable?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return <span className={`thumbnailLoader ${loaded ? "loaded" : ""}`}><img src={src} alt="" draggable={draggable} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} /></span>;
}

function useElementWidth(ref: React.RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function AssetBrowser(props: Props) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentControls = useAnimationControls();
  const previousContentMotionKey = useRef(props.contentMotionKey);
  const modifiersRef = useRef(createModifierKeyState());
  const onFocusRef = useRef(props.onFocus);
  const onToggleCheckedRef = useRef(props.onToggleChecked);
  const onCheckRangeRef = useRef(props.onCheckRange);
  const width = useElementWidth(scrollRef);
  const columns = props.view === "grid" ? props.gridColumns : 1;
  const cellWidth = Math.max(120, (width - 32 - (columns - 1) * 12) / columns);
  const rowHeight = props.view === "grid" ? Math.ceil(cellWidth * 0.75 + 72) : 67;
  const rowCount = Math.ceil(props.assets.length / columns) + (props.hasMore ? 1 : 0);
  const virtualizer = useVirtualizer({ count: rowCount, getScrollElement: () => scrollRef.current, estimateSize: () => rowHeight, overscan: 4 });
  const layoutRef = useRef({ columns, rowHeight });
  const virtualRows = virtualizer.getVirtualItems();
  const lastIndex = virtualRows.at(-1)?.index ?? 0;
  useEffect(() => { if (props.hasMore && lastIndex >= rowCount - 3 && !props.loading) props.onLoadMore(); }, [lastIndex, props.hasMore, props.loading, props.onLoadMore, rowCount]);
  useLayoutEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    const previous = layoutRef.current;
    const firstVisibleIndex = Math.floor(viewport.scrollTop / previous.rowHeight) * previous.columns;
    virtualizer.measure();
    if (previous.columns !== columns || previous.rowHeight !== rowHeight) {
      viewport.scrollTop = Math.floor(firstVisibleIndex / columns) * rowHeight;
      layoutRef.current = { columns, rowHeight };
    }
  }, [columns, rowHeight, virtualizer]);
  const checkedSet = useMemo(() => new Set(props.checkedIds), [props.checkedIds]);
  useLayoutEffect(() => {
    onFocusRef.current = props.onFocus;
    onToggleCheckedRef.current = props.onToggleChecked;
    onCheckRangeRef.current = props.onCheckRange;
  }, [props.onCheckRange, props.onFocus, props.onToggleChecked]);
  useEffect(() => attachModifierKeyTracking(window, document, modifiersRef.current), []);
  useEffect(() => {
    if (previousContentMotionKey.current === props.contentMotionKey) return;
    previousContentMotionKey.current = props.contentMotionKey;
    void contentControls.start({ opacity: [0.72, 1], y: [4, 0], transition: { duration: 0.14, ease: [0.22, 1, 0.36, 1] } });
  }, [contentControls, props.contentMotionKey]);
  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    return attachAssetInteraction(viewport, modifiersRef.current, props.selectionMode, ({ assetId, intent }) => {
      if (intent === "focus") onFocusRef.current(assetId);
      else if (intent === "rangeChecked") onCheckRangeRef.current(assetId);
      else onToggleCheckedRef.current(assetId);
    });
  }, [props.assets.length, props.selectionMode, props.view]);
  const handleAssetKeyDown = (event: React.KeyboardEvent<HTMLElement>, asset: Asset) => {
    if (props.selectionMode === "browse") {
      if (event.key === "Enter") props.onPreview(asset);
      return;
    }
    if (event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    if (event.shiftKey || isRangePressed(modifiersRef.current)) props.onCheckRange(asset.id);
    else props.onToggleChecked(asset.id);
  };
  const handleControlKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, assetId: string) => {
    event.stopPropagation();
    if (event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    if (event.shiftKey || isRangePressed(modifiersRef.current)) props.onCheckRange(assetId);
    else props.onToggleChecked(assetId);
  };
  if (props.noSources) return (
    <div className="emptyState">
      <div className="emptyWeave" aria-hidden="true"><i /><i /><i /><span /></div>
      <h2>{t("noSourcesTitle")}</h2><p>{t("noSourcesBody")}</p>
      <button className="primaryButton" onClick={props.onAddSource}>{t("addFirstFolder")}</button>
    </div>
  );
  if (props.error) return <div className="emptyState compact errorState"><ImageOff size={30} /><h2>{t("emptyTitle")}</h2><p>{props.error}</p></div>;
  if (props.loading && props.assets.length === 0) return <div className="initialLoading"><span className="loadingSpinner" /><p>{t("scanning", { completed: 0, total: "—" })}</p></div>;
  if (!props.loading && props.assets.length === 0) return <div className="emptyState compact"><ImageOff size={30} /><h2>{t("emptyTitle")}</h2><p>{t("emptyBody")}</p></div>;

  return (
    <div ref={scrollRef} className="assetViewport" data-view={props.view} data-selection-mode={props.selectionMode} onClick={(event) => { if (props.selectionMode === "browse" && !(event.target as Element).closest("[data-asset-id]")) props.onFocus(); }} onContextMenu={(event) => event.preventDefault()}>
      <motion.div className="virtualCanvas" animate={contentControls} style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((virtualRow) => {
          const rowAssets = props.assets.slice(virtualRow.index * columns, virtualRow.index * columns + columns);
          return <div key={virtualRow.key} className={props.view === "grid" ? "virtualGridRow" : "virtualListRow"} style={{ transform: `translateY(${virtualRow.start}px)`, height: rowHeight, gridTemplateColumns: props.view === "grid" ? `repeat(${columns}, minmax(0, 1fr))` : undefined }}>
            {rowAssets.map((asset) => props.view === "grid" ? (
              <AssetContextMenu key={asset.id} asset={asset} selectionMode={props.selectionMode} checkedIds={props.checkedIds} onFocus={props.onFocus} onPreview={props.onPreview} onOpen={props.onOpen} onReveal={props.onReveal} onRename={props.onRename} onMove={props.onMove} onTrash={props.onTrash}>
              <article data-asset-id={asset.id} className={`assetTile ${props.selectionMode === "browse" && props.focusedAssetId === asset.id ? "focused" : ""} ${props.selectionMode === "batch" && checkedSet.has(asset.id) ? "checked" : ""} ${props.dropTargetAssetId === asset.id ? "dragTarget" : ""}`}
                tabIndex={0} onDoubleClick={() => { if (props.selectionMode === "browse") props.onPreview(asset); }} onKeyDown={(event) => handleAssetKeyDown(event, asset)}>
                <div className="assetThumb" style={{ aspectRatio: "4 / 3" }}>
                  {asset.thumbnailPath ? <ThumbnailImage key={asset.thumbnailPath} src={mediaUrl(asset.thumbnailPath) || ""} draggable={false} /> : <div className="thumbFallback"><ImageOff size={22} /></div>}
                  <AnimatePresence initial={false}>{props.selectionMode === "batch" && <motion.button key="batch-check" className="selectControl tactile" style={{ zIndex: 3 }} type="button" role="checkbox" aria-checked={checkedSet.has(asset.id)} data-selection-control aria-label={t("toggleSelection", { name: asset.filename })} initial={{ opacity: 0, scale: 0.82 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.86 }} transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }} onKeyDown={(event) => handleControlKeyDown(event, asset.id)} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}><span><AnimatePresence initial={false}>{checkedSet.has(asset.id) && <motion.i key="checked" className="selectionCheckMark" initial={{ opacity: 0, scale: 0.55 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}><Check size={14} /></motion.i>}</AnimatePresence></span></motion.button>}</AnimatePresence>
                  {asset.mediaKind === "video" && <span className="durationBadge"><Play size={10} fill="currentColor" />{formatDuration(asset.durationMs)}</span>}
                  <AnimatePresence>{props.wovenAssetId === asset.id && <motion.span className="weaveTrace" initial={{ scaleX: 0, opacity: 1 }} animate={{ scaleX: 1, opacity: 1 }} exit={{ opacity: 0 }} />}</AnimatePresence>
                </div>
                <div className="assetCaption"><div><strong title={asset.filename}>{asset.filename}</strong><span>{formatDate(asset.capturedAt || asset.modifiedAt)}</span></div><div className="miniTags">{asset.tags.slice(0, 3).map((tag) => <i key={tag.id} style={{ background: tag.color }} title={tag.name} />)}</div></div>
              </article>
              </AssetContextMenu>
            ) : (
              <AssetContextMenu key={asset.id} asset={asset} selectionMode={props.selectionMode} checkedIds={props.checkedIds} onFocus={props.onFocus} onPreview={props.onPreview} onOpen={props.onOpen} onReveal={props.onReveal} onRename={props.onRename} onMove={props.onMove} onTrash={props.onTrash}>
              <div data-asset-id={asset.id} className={`assetListItem ${props.selectionMode === "browse" && props.focusedAssetId === asset.id ? "focused" : ""} ${props.selectionMode === "batch" && checkedSet.has(asset.id) ? "checked" : ""} ${props.dropTargetAssetId === asset.id ? "dragTarget" : ""}`} tabIndex={0} onDoubleClick={() => { if (props.selectionMode === "browse") props.onPreview(asset); }} onKeyDown={(event) => handleAssetKeyDown(event, asset)}>
                <div className="listSelectionSlot">{props.selectionMode === "batch" && <motion.button key="batch-check" className="listCheck tactile" type="button" role="checkbox" aria-checked={checkedSet.has(asset.id)} data-selection-control aria-label={t("toggleSelection", { name: asset.filename })} initial={{ opacity: 0, scale: 0.82 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }} onKeyDown={(event) => handleControlKeyDown(event, asset.id)} onClick={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}><AnimatePresence initial={false}>{checkedSet.has(asset.id) && <motion.i key="checked" className="selectionCheckMark" initial={{ opacity: 0, scale: 0.55 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}><Check size={13} /></motion.i>}</AnimatePresence></motion.button>}</div>
                <div className="listThumb">{asset.thumbnailPath ? <ThumbnailImage key={asset.thumbnailPath} src={mediaUrl(asset.thumbnailPath) || ""} /> : <ImageOff size={17} />}{asset.mediaKind === "video" && <Film size={12} />}</div>
                <strong title={asset.filename}>{asset.filename}</strong><span>{asset.mediaKind === "video" ? t("videos") : t("images")}</span><span>{formatBytes(asset.byteSize)}</span><span>{formatDate(asset.modifiedAt)}</span>
                <div className="miniTags">{asset.tags.slice(0, 4).map((tag) => <i key={tag.id} style={{ background: tag.color }} title={tag.name} />)}</div>
              </div>
              </AssetContextMenu>
            ))}
            {rowAssets.length === 0 && props.loading && <div className="loadingRow"><span /><span /><span /></div>}
          </div>;
        })}
      </motion.div>
    </div>
  );
}
