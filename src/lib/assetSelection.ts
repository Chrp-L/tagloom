import type { SelectionMode } from "../features/selection/selectionModel";
import { isRangePressed } from "./modifierKeys";
import type { ModifierKeyState } from "./modifierKeys";

export type AssetInteractionIntent = "focus" | "toggleChecked" | "rangeChecked";

interface AssetPointerEvent {
  button: number;
  detail: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  getModifierState(key: string): boolean;
}

export interface AssetInteractionEvent {
  assetId: string;
  intent: AssetInteractionIntent;
}

export function assetInteractionIntentFromEvent(
  event: AssetPointerEvent,
  modifiers: ModifierKeyState,
  selectionMode: SelectionMode,
): AssetInteractionIntent | undefined {
  if (event.button !== 0) return undefined;
  if (selectionMode === "browse") return "focus";
  if (event.detail > 1) return undefined;
  if (event.shiftKey || event.getModifierState("Shift") || isRangePressed(modifiers)) return "rangeChecked";
  return "toggleChecked";
}

export function attachAssetInteraction(
  viewport: HTMLElement,
  modifiers: ModifierKeyState,
  selectionMode: SelectionMode,
  onInteract: (interaction: AssetInteractionEvent) => void,
): () => void {
  const handleClick = (event: MouseEvent) => {
    if (!(event.target instanceof Element)) return;
    const asset = event.target.closest<HTMLElement>("[data-asset-id]");
    if (!asset || !viewport.contains(asset) || !asset.dataset.assetId) return;
    const intent = assetInteractionIntentFromEvent(event, modifiers, selectionMode);
    if (!intent) return;
    onInteract({ assetId: asset.dataset.assetId, intent });
  };
  const preventTextSelection = (event: Event) => event.preventDefault();
  viewport.addEventListener("click", handleClick, true);
  viewport.addEventListener("selectstart", preventTextSelection);
  return () => {
    viewport.removeEventListener("click", handleClick, true);
    viewport.removeEventListener("selectstart", preventTextSelection);
  };
}
