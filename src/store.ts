import { create } from "zustand";
import type { MediaKind, ThemeChoice } from "./types";
import {
  checkRange as checkRangeState,
  clearChecked as clearCheckedState,
  clearFocus as clearFocusState,
  enterBatchSelection as enterBatchSelectionState,
  exitBatchSelection as exitBatchSelectionState,
  focusAsset as focusAssetState,
  resetAssetContext as resetAssetContextState,
  removeChecked as removeCheckedState,
  toggleChecked as toggleCheckedState,
} from "./features/selection/selectionModel";
import type { SelectionMode } from "./features/selection/selectionModel";

export type NavigationFilter =
  | { kind: "home" }
  | { kind: "moodboards" }
  | { kind: "all" }
  | { kind: "media"; mediaKind: MediaKind }
  | { kind: "source"; id: string }
  | { kind: "tag"; id: string }
  | { kind: "collection"; id: string };

export type GridColumns = 3 | 4 | 5;
export type SidebarSection = "sources" | "collections" | "tags";
export type CollapsedSections = Record<SidebarSection, boolean>;

const SIDEBAR_PREFERENCES_KEY = "tagloom-sidebar-preferences";
const DEFAULT_COLLAPSED_SECTIONS: CollapsedSections = { sources: false, collections: false, tags: false };

export function parseSidebarPreferences(value: string | null): { sidebarCollapsed: boolean; collapsedSections: CollapsedSections } {
  if (!value) return { sidebarCollapsed: false, collapsedSections: { ...DEFAULT_COLLAPSED_SECTIONS } };
  try {
    const parsed = JSON.parse(value) as { sidebarCollapsed?: unknown; collapsedSections?: Partial<Record<SidebarSection, unknown>> };
    return {
      sidebarCollapsed: parsed.sidebarCollapsed === true,
      collapsedSections: {
        sources: parsed.collapsedSections?.sources === true,
        collections: parsed.collapsedSections?.collections === true,
        tags: parsed.collapsedSections?.tags === true,
      },
    };
  } catch {
    return { sidebarCollapsed: false, collapsedSections: { ...DEFAULT_COLLAPSED_SECTIONS } };
  }
}

function persistSidebarPreferences(sidebarCollapsed: boolean, collapsedSections: CollapsedSections) {
  localStorage.setItem(SIDEBAR_PREFERENCES_KEY, JSON.stringify({ sidebarCollapsed, collapsedSections }));
}

interface UiState {
  navigation: NavigationFilter;
  selectionMode: SelectionMode;
  focusedAssetId?: string;
  checkedIds: string[];
  selectionAnchorId?: string;
  view: "grid" | "list";
  gridColumns: GridColumns;
  sidebarCollapsed: boolean;
  collapsedSections: CollapsedSections;
  inspectorOpen: boolean;
  theme: ThemeChoice;
  setNavigation: (value: NavigationFilter) => void;
  enterBatchSelection: () => void;
  exitBatchSelection: () => void;
  focusAsset: (id?: string) => void;
  toggleChecked: (id: string) => void;
  checkRange: (orderedIds: string[], targetId: string) => void;
  clearFocus: () => void;
  clearChecked: () => void;
  removeChecked: (ids: string[]) => void;
  resetAssetContext: () => void;
  setView: (view: "grid" | "list") => void;
  setGridColumns: (columns: GridColumns) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarSection: (section: SidebarSection) => void;
  revealSidebarSection: (section: SidebarSection) => void;
  setInspectorOpen: (open: boolean) => void;
  setTheme: (theme: ThemeChoice) => void;
}

localStorage.removeItem("tagloom-reduce-motion");
const sidebarPreferences = parseSidebarPreferences(localStorage.getItem(SIDEBAR_PREFERENCES_KEY));

export const useUiStore = create<UiState>((set) => ({
  navigation: { kind: "home" },
  ...resetAssetContextState(),
  view: "grid",
  gridColumns: 4,
  sidebarCollapsed: sidebarPreferences.sidebarCollapsed,
  collapsedSections: sidebarPreferences.collapsedSections,
  inspectorOpen: true,
  theme: (localStorage.getItem("tagloom-theme") as ThemeChoice) || "system",
  setNavigation: (navigation) => set({ navigation, ...resetAssetContextState() }),
  enterBatchSelection: () => set((state) => enterBatchSelectionState(state)),
  exitBatchSelection: () => set((state) => exitBatchSelectionState(state)),
  focusAsset: (id) => set((state) => focusAssetState(state, id)),
  toggleChecked: (id) => set((state) => toggleCheckedState(state, id)),
  checkRange: (orderedIds, targetId) => set((state) => checkRangeState(state, orderedIds, targetId)),
  clearFocus: () => set((state) => clearFocusState(state)),
  clearChecked: () => set((state) => clearCheckedState(state)),
  removeChecked: (ids) => set((state) => removeCheckedState(state, ids)),
  resetAssetContext: () => set(resetAssetContextState()),
  setView: (view) => set({ view }),
  setGridColumns: (gridColumns) => set({ gridColumns }),
  setSidebarCollapsed: (sidebarCollapsed) => set((state) => {
    persistSidebarPreferences(sidebarCollapsed, state.collapsedSections);
    return { sidebarCollapsed };
  }),
  toggleSidebarSection: (section) => set((state) => {
    const collapsedSections = { ...state.collapsedSections, [section]: !state.collapsedSections[section] };
    persistSidebarPreferences(state.sidebarCollapsed, collapsedSections);
    return { collapsedSections };
  }),
  revealSidebarSection: (section) => set((state) => {
    const collapsedSections = { ...state.collapsedSections, [section]: false };
    persistSidebarPreferences(false, collapsedSections);
    return { sidebarCollapsed: false, collapsedSections };
  }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setTheme: (theme) => { localStorage.setItem("tagloom-theme", theme); set({ theme }); },
}));
