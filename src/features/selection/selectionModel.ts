export type SelectionMode = "browse" | "batch";

export interface AssetInteractionState {
  selectionMode: SelectionMode;
  focusedAssetId?: string;
  checkedIds: string[];
  selectionAnchorId?: string;
}

export const EMPTY_ASSET_INTERACTION: AssetInteractionState = {
  selectionMode: "browse",
  focusedAssetId: undefined,
  checkedIds: [],
  selectionAnchorId: undefined,
};

export function focusAsset(state: AssetInteractionState, id?: string): AssetInteractionState {
  if (state.selectionMode !== "browse") return state;
  return { ...state, focusedAssetId: id };
}

export function toggleChecked(state: AssetInteractionState, id: string): AssetInteractionState {
  if (state.selectionMode !== "batch") return state;
  return {
    ...state,
    checkedIds: state.checkedIds.includes(id)
      ? state.checkedIds.filter((value) => value !== id)
      : [...state.checkedIds, id],
    selectionAnchorId: id,
  };
}

export function checkRange(state: AssetInteractionState, orderedIds: string[], targetId: string): AssetInteractionState {
  if (state.selectionMode !== "batch") return state;
  const anchorIndex = state.selectionAnchorId ? orderedIds.indexOf(state.selectionAnchorId) : -1;
  const targetIndex = orderedIds.indexOf(targetId);
  if (anchorIndex < 0 || targetIndex < 0) return toggleChecked(state, targetId);
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return { ...state, checkedIds: orderedIds.slice(start, end + 1) };
}

export function enterBatchSelection(state: AssetInteractionState): AssetInteractionState {
  return { ...state, selectionMode: "batch", checkedIds: [], selectionAnchorId: undefined };
}

export function exitBatchSelection(state: AssetInteractionState): AssetInteractionState {
  return { ...state, selectionMode: "browse", checkedIds: [], selectionAnchorId: undefined };
}

export function clearFocus(state: AssetInteractionState): AssetInteractionState {
  return { ...state, focusedAssetId: undefined };
}

export function clearChecked(state: AssetInteractionState): AssetInteractionState {
  return { ...state, checkedIds: [], selectionAnchorId: undefined };
}

export function getAssetContextTargets(selectionMode: SelectionMode, checkedIds: string[], assetId: string): string[] {
  return selectionMode === "batch" && checkedIds.includes(assetId) ? [...checkedIds] : [assetId];
}

export function removeChecked(state: AssetInteractionState, ids: string[]): AssetInteractionState {
  if (ids.length === 0) return state;
  const removed = new Set(ids);
  const checkedIds = state.checkedIds.filter((id) => !removed.has(id));
  return {
    ...state,
    checkedIds,
    selectionAnchorId: checkedIds.length > 0 && state.selectionAnchorId && !removed.has(state.selectionAnchorId)
      ? state.selectionAnchorId
      : undefined,
  };
}

export function getAssetActionTargets(state: AssetInteractionState): string[] {
  if (state.selectionMode === "batch") return state.checkedIds;
  return state.focusedAssetId ? [state.focusedAssetId] : [];
}

export function resetAssetContext(): AssetInteractionState {
  return { ...EMPTY_ASSET_INTERACTION, checkedIds: [] };
}
