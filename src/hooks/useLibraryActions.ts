import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "../api";
import type { Asset, JobProgress, Tag } from "../types";

export interface LibraryActions {
  addFolder(): Promise<void>;
  rescan(sourceId: string): Promise<void>;
  rename(asset: Asset, name: string): Promise<void>;
  move(asset: Asset): Promise<void>;
  trash(ids: string[]): void;
  open(asset: Asset): Promise<void>;
  reveal(asset: Asset): Promise<void>;
  setTags(tagId: string, attached: boolean, ids?: string[]): Promise<void>;
}

interface Options {
  queryClient: QueryClient;
  notify: (message: string, tone?: "success" | "error") => void;
  operationComplete: string;
  tagApplied: string;
  tags?: Tag[];
  targetIds: string[];
  onCueTag?: (color?: string) => void;
  onJobStarted: (job: JobProgress) => void;
  onRequestTrash: (ids: string[]) => void;
}

export function useLibraryActions({
  queryClient,
  notify,
  operationComplete,
  tagApplied,
  tags,
  targetIds,
  onCueTag,
  onJobStarted,
  onRequestTrash,
}: Options) {
  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
      queryClient.invalidateQueries({ queryKey: ["assets"] }),
      queryClient.invalidateQueries({ queryKey: ["home"] }),
    ]);
  }, [queryClient]);

  const action = useCallback(async (operation: () => Promise<unknown>, success?: string) => {
    try {
      await operation();
      await refresh();
      if (success) notify(success);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    }
  }, [notify, refresh]);

  const addFolder = useCallback(async () => {
    const path = await api.pickFolder();
    if (!path) return;
    try {
      const id = await api.addSource(path);
      onJobStarted({ id, kind: "scan", status: "running", total: 0, completed: 0 });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["bootstrap"] }),
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
      ]);
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    }
  }, [notify, onJobStarted, queryClient]);

  const rescan = useCallback(async (sourceId: string) => {
    try {
      const id = await api.rescanSource(sourceId);
      onJobStarted({ id, kind: "scan", status: "running", total: 0, completed: 0 });
      await queryClient.invalidateQueries({ queryKey: ["jobs"] });
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), "error");
    }
  }, [notify, onJobStarted, queryClient]);

  const open = useCallback((asset: Asset) => action(() => api.openAsset(asset.id), ""), [action]);
  const reveal = useCallback((asset: Asset) => action(() => api.revealAsset(asset.id), ""), [action]);

  const move = useCallback(async (asset: Asset) => {
    const folder = await api.pickFolder();
    if (!folder) return;
    const separator = folder.includes("\\") ? "\\" : "/";
    await action(() => api.moveAsset(asset.id, `${folder}${separator}${asset.filename}`), operationComplete);
  }, [action, operationComplete]);

  const rename = useCallback((asset: Asset, name: string) => {
    const separator = asset.path.includes("\\") ? "\\" : "/";
    const parent = asset.path.slice(0, asset.path.lastIndexOf(separator));
    return action(() => api.moveAsset(asset.id, `${parent}${separator}${name}`), operationComplete);
  }, [action, operationComplete]);

  const setTags = useCallback((tagId: string, attached: boolean, ids = targetIds) => {
    if (attached) onCueTag?.(tags?.find((tag) => tag.id === tagId)?.color);
    return action(() => api.setAssetTags(ids, tagId, attached), tagApplied);
  }, [action, onCueTag, tagApplied, tags, targetIds]);

  const trash = useCallback((ids: string[]) => onRequestTrash(ids), [onRequestTrash]);

  const actions = useMemo<LibraryActions>(
    () => ({ addFolder, rescan, rename, move, trash, open, reveal, setTags }),
    [addFolder, move, open, rename, rescan, reveal, setTags, trash],
  );
  return { actions, action, refresh };
}
