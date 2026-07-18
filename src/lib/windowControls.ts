import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export async function toggleCurrentWindowMaximize(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().toggleMaximize();
}

export function isInteractiveWindowTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("button, input, textarea, select, a, [role='button']"));
}
