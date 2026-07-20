import { useEffect } from "react";
import { getAssetActionTargets } from "../features/selection/selectionModel";
import { useUiStore } from "../store";

interface Options {
  previewOpen: boolean;
  requestTrash: (ids: string[]) => void;
}

export function useGlobalShortcuts({ previewOpen, requestTrash }: Options) {
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".searchField input")?.focus();
      }
      if (event.key === "Escape" && !previewOpen) {
        const state = useUiStore.getState();
        if (state.selectionMode === "batch") state.exitBatchSelection();
        else state.clearFocus();
      }
      if (event.key === "Delete"
        && !(event.target instanceof HTMLInputElement)
        && !(event.target instanceof HTMLTextAreaElement)
        && !(event.target instanceof HTMLElement && event.target.isContentEditable)) {
        requestTrash(getAssetActionTargets(useUiStore.getState()));
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [previewOpen, requestTrash]);
}
