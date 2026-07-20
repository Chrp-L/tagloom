import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Grid2X2, List, ListChecks, Search, Settings2, SlidersHorizontal, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { GridColumns } from "../store";
import { isInteractiveWindowTarget, toggleCurrentWindowMaximize } from "../lib/windowControls";
import type { WeaveCue } from "../features/motion/weaveCue";
import type { SelectionMode } from "../features/selection/selectionModel";
import { SignalLoom } from "./SignalLoom";

interface ToolbarProps {
  mode?: "assets" | "home";
  title: string;
  count: number;
  search: string;
  sort: string;
  view: "grid" | "list";
  gridColumns: GridColumns;
  selectionMode: SelectionMode;
  checkedCount: number;
  eventCue?: WeaveCue;
  onSearch: (value: string) => void;
  onSort: (value: string) => void;
  onView: (value: "grid" | "list") => void;
  onGridColumns: (value: GridColumns) => void;
  onEnterBatch: () => void;
  onExitBatch: () => void;
  onSettings: () => void;
}

export function Toolbar(props: ToolbarProps) {
  const { t } = useTranslation();
  const homeMode = props.mode === "home";
  const sorts = [{ value: "newest", label: t("newest") }, { value: "oldest", label: t("oldest") }, { value: "name", label: t("filename") }, { value: "largest", label: t("largest") }];
  const currentSort = sorts.find((item) => item.value === props.sort) ?? sorts[0];
  return (
    <header className="workspaceHeader">
      <div className="titleLine" data-tauri-drag-region onDoubleClick={(event) => { if (!isInteractiveWindowTarget(event.target)) void toggleCurrentWindowMaximize(); }}>
        <div className="titleIdentity" data-tauri-drag-region><div className="titleCopy" data-tauri-drag-region><h1 data-tauri-drag-region>{props.title}</h1>{!homeMode && <span data-tauri-drag-region>{t("items", { count: props.count })}</span>}</div><SignalLoom cue={props.eventCue} /></div>
        <button className="iconButton tactile" title={t("settings")} onClick={props.onSettings}><Settings2 size={18} /></button>
      </div>
      <div className="toolbarLine">
        <div className="toolbarPrimary"><AnimatePresence initial={false}>{!homeMode && props.selectionMode === "batch" ? (
          <motion.div key="selection" className="selectionBanner" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}><span><Check size={16} />{t("selected", { count: props.checkedCount })}</span></motion.div>
        ) : (
          <motion.label key="search" className="searchField" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}><Search size={17} /><input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder={t("search")} /><kbd>Ctrl K</kbd></motion.label>
        )}</AnimatePresence></div>
        {!homeMode && <div className="toolbarActions">
          <button className="textButton tactile batchModeButton" aria-pressed={props.selectionMode === "batch"} onClick={props.selectionMode === "batch" ? props.onExitBatch : props.onEnterBatch}>
            {props.selectionMode === "batch" ? <X size={16} /> : <ListChecks size={16} />}
            <span>{props.selectionMode === "batch" ? t("exitBatchSelection") : t("batchSelect")}</span>
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild><button className="textButton tactile"><SlidersHorizontal size={16} /><span>{currentSort.label}</span><ChevronDown size={14} /></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content className="menuContent" align="end" sideOffset={5}>
              {sorts.map((item) => <DropdownMenu.Item key={item.value} className="menuItem checkable" onSelect={() => props.onSort(item.value)}>{props.sort === item.value ? <Check size={15} /> : <span className="menuIconSpace" />}{item.label}</DropdownMenu.Item>)}
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
          {props.view === "grid" && <div className="segmented columnSegment" aria-label={t("gridColumns")}>
            {([5, 4, 3] as GridColumns[]).map((columns) => <button key={columns} className="tactile" aria-pressed={props.gridColumns === columns} title={t("columnCount", { count: columns })} onClick={() => props.onGridColumns(columns)}>{props.gridColumns === columns && <motion.span className="segmentedPlate" layoutId="column-segment" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}<span className="segmentContent">{columns}</span></button>)}
          </div>}
          <div className="segmented iconSegment">
            <button className="tactile" aria-pressed={props.view === "grid"} title={t("gridView")} onClick={() => props.onView("grid")}>{props.view === "grid" && <motion.span className="segmentedPlate" layoutId="view-segment" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}<span className="segmentContent"><Grid2X2 size={16} /></span></button>
            <button className="tactile" aria-pressed={props.view === "list"} title={t("listView")} onClick={() => props.onView("list")}>{props.view === "list" && <motion.span className="segmentedPlate" layoutId="view-segment" transition={{ type: "spring", stiffness: 520, damping: 38 }} />}<span className="segmentContent"><List size={17} /></span></button>
          </div>
        </div>}
      </div>
    </header>
  );
}
