import { convertFileSrc } from "@tauri-apps/api/core";
import type { Tag } from "./types";
import { demoApi } from "./api/demoApi";
import { tauriApi, type TagloomApi } from "./api/tauriApi";

/** True when the application is running inside the Tauri WebView. */
export const isTauri = "__TAURI_INTERNALS__" in window;

/** Stable application API facade; adapters are selected once at module load. */
export const api: TagloomApi = isTauri ? tauriApi : demoApi;

export function mediaUrl(path?: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:/.test(path)) return path;
  return isTauri ? convertFileSrc(path) : path;
}

export function findTag(tags: Tag[], id: string): Tag | undefined {
  return tags.find((tag) => tag.id === id);
}
