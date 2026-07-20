import { useVirtualizer } from "@tanstack/react-virtual";
import { motion, useAnimationControls } from "motion/react";
import { ImageOff } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Asset } from "../types";
import type { GridColumns } from "../store";
import { attachAssetInteraction } from "../lib/assetSelection";
import { attachModifierKeyTracking, createModifierKeyState, isRangePressed } from "../lib/modifierKeys";
import type { SelectionMode } from "../features/selection/selectionModel";
import type { AssetActions } from "./assets/AssetActions";
import { AssetGridItem } from "./assets/AssetGridItem";
import { AssetListRow } from "./assets/AssetListRow";

interface Props {
  assets: Asset[];
  total: number;
  view: "grid" | "list";
  gridColumns: GridColumns;
  selectionMode: SelectionMode;
  focusedAssetId?: string;
  checkedIds: string[];
  collectionContext?: { id: string; coverAssetId?: string };
  loading: boolean;
  error?: string;
  hasMore: boolean;
  noSources: boolean;
  contentMotionKey: string;
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
  onSetCollectionCover?: (collectionId: string, assetId: string) => void;
  onClearCollectionCover?: (collectionId: string) => void;
  onAddSource: () => void;
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
  const handleAssetKeyDown = useCallback((event: KeyboardEvent<HTMLElement>, asset: Asset) => {
    if (props.selectionMode === "browse") {
      if (event.key === "Enter") props.onPreview(asset);
      return;
    }
    if (event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    if (event.shiftKey || isRangePressed(modifiersRef.current)) props.onCheckRange(asset.id);
    else props.onToggleChecked(asset.id);
  }, [props.onCheckRange, props.onPreview, props.onToggleChecked, props.selectionMode]);
  const handleControlKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, assetId: string) => {
    event.stopPropagation();
    if (event.key !== " " && event.key !== "Spacebar") return;
    event.preventDefault();
    if (event.shiftKey || isRangePressed(modifiersRef.current)) props.onCheckRange(assetId);
    else props.onToggleChecked(assetId);
  }, [props.onCheckRange, props.onToggleChecked]);
  const actions = useMemo<AssetActions>(() => ({
    focus: props.onFocus,
    toggleChecked: props.onToggleChecked,
    checkRange: props.onCheckRange,
    preview: props.onPreview,
    open: props.onOpen,
    reveal: props.onReveal,
    rename: props.onRename,
    move: props.onMove,
    trash: props.onTrash,
    setCollectionCover: props.onSetCollectionCover,
    clearCollectionCover: props.onClearCollectionCover,
  }), [
    props.onCheckRange,
    props.onClearCollectionCover,
    props.onFocus,
    props.onMove,
    props.onOpen,
    props.onPreview,
    props.onRename,
    props.onReveal,
    props.onSetCollectionCover,
    props.onToggleChecked,
    props.onTrash,
  ]);
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
              <AssetGridItem
                key={asset.id}
                asset={asset}
                selectionMode={props.selectionMode}
                focused={props.focusedAssetId === asset.id}
                checked={checkedSet.has(asset.id)}
                checkedIds={props.checkedIds}
                collectionContext={props.collectionContext}
                actions={actions}
                onAssetKeyDown={handleAssetKeyDown}
                onControlKeyDown={handleControlKeyDown}
              />
            ) : (
              <AssetListRow
                key={asset.id}
                asset={asset}
                selectionMode={props.selectionMode}
                focused={props.focusedAssetId === asset.id}
                checked={checkedSet.has(asset.id)}
                checkedIds={props.checkedIds}
                collectionContext={props.collectionContext}
                actions={actions}
                onAssetKeyDown={handleAssetKeyDown}
                onControlKeyDown={handleControlKeyDown}
              />
            ))}
            {rowAssets.length === 0 && props.loading && <div className="loadingRow"><span /><span /><span /></div>}
          </div>;
        })}
      </motion.div>
    </div>
  );
}
