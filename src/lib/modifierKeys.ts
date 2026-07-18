export interface ModifierKeyState {
  shift: boolean;
  pressedKeys: Set<string>;
}

export function attachModifierKeyTracking(target: Window, documentTarget: Document, state: ModifierKeyState): () => void {
  const update = (event: KeyboardEvent, pressed: boolean) => {
    const isShift = event.key === "Shift" || event.code === "ShiftLeft" || event.code === "ShiftRight";
    if (!isShift) return;
    const identifiers = [event.key, event.code].filter(Boolean);
    identifiers.forEach((identifier) => pressed ? state.pressedKeys.add(identifier) : state.pressedKeys.delete(identifier));
    state.shift = pressed;
  };
  const keydown = (event: KeyboardEvent) => update(event, true);
  const keyup = (event: KeyboardEvent) => update(event, false);
  const reset = () => { state.shift = false; state.pressedKeys.clear(); };
  const visibility = () => { if (documentTarget.hidden) reset(); };
  target.addEventListener("keydown", keydown, true);
  target.addEventListener("keyup", keyup, true);
  documentTarget.addEventListener("keydown", keydown, true);
  documentTarget.addEventListener("keyup", keyup, true);
  target.addEventListener("blur", reset);
  documentTarget.addEventListener("visibilitychange", visibility);
  return () => {
    target.removeEventListener("keydown", keydown, true);
    target.removeEventListener("keyup", keyup, true);
    documentTarget.removeEventListener("keydown", keydown, true);
    documentTarget.removeEventListener("keyup", keyup, true);
    target.removeEventListener("blur", reset);
    documentTarget.removeEventListener("visibilitychange", visibility);
  };
}

export function createModifierKeyState(): ModifierKeyState {
  return { shift: false, pressedKeys: new Set<string>() };
}

export function isRangePressed(state: ModifierKeyState): boolean {
  return state.shift || state.pressedKeys.has("Shift") || state.pressedKeys.has("ShiftLeft") || state.pressedKeys.has("ShiftRight");
}
