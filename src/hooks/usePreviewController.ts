import { useCallback, useMemo, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Asset, VideoPreviewProgress } from "../types";

interface Options {
  assets: Asset[];
  queryClient: QueryClient;
  videoPreviewFailed: string;
}

export function usePreviewController({ assets, queryClient, videoPreviewFailed }: Options) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [preparedPreviews, setPreparedPreviews] = useState<Record<string, string>>({});
  const [invalidatedPreviews, setInvalidatedPreviews] = useState<Set<string>>(() => new Set());
  const [sourceAssets, setSourceAssets] = useState<Asset[]>();

  const preview = useCallback((asset: Asset, contextAssets = assets) => {
    setSourceAssets(contextAssets);
    setIndex(Math.max(0, contextAssets.findIndex((item) => item.id === asset.id)));
    setOpen(true);
    void api.recordAssetViewed(asset.id).then(() => queryClient.invalidateQueries({ queryKey: ["home"] }));
  }, [assets, queryClient]);

  const prepareVideo = useCallback(async (asset: Asset) => {
    const existing = invalidatedPreviews.has(asset.id) ? undefined : preparedPreviews[asset.id] || asset.previewPath;
    if (existing) return existing;
    const path = await api.prepareVideoPreview(asset.id);
    if (!path) throw new Error(videoPreviewFailed);
    setPreparedPreviews((items) => ({ ...items, [asset.id]: path }));
    setInvalidatedPreviews((items) => {
      if (!items.has(asset.id)) return items;
      const next = new Set(items);
      next.delete(asset.id);
      return next;
    });
    return path;
  }, [invalidatedPreviews, preparedPreviews, videoPreviewFailed]);

  const cancelVideo = useCallback((asset: Asset) => api.cancelVideoPreview(asset.id), []);

  const invalidateVideo = useCallback(async (asset: Asset) => {
    setInvalidatedPreviews((items) => new Set(items).add(asset.id));
    setPreparedPreviews((items) => {
      if (!items[asset.id]) return items;
      const next = { ...items };
      delete next[asset.id];
      return next;
    });
    await api.invalidateVideoPreview(asset.id);
  }, []);

  const setVideoActive = useCallback((asset: Asset, active: boolean) => api.setVideoPreviewActive(asset.id, active), []);

  const onVideoProgress = useCallback(
    (handler: (progress: VideoPreviewProgress) => void) => api.onVideoPreviewProgress(handler),
    [],
  );

  const previewAssets = useMemo(
    () => (sourceAssets ?? assets).map((asset) => {
      const prepared = preparedPreviews[asset.id];
      if (prepared) return { ...asset, previewPath: prepared };
      return invalidatedPreviews.has(asset.id) ? { ...asset, previewPath: undefined } : asset;
    }),
    [assets, invalidatedPreviews, preparedPreviews, sourceAssets],
  );

  return {
    preview,
    prepareVideo,
    cancelVideo,
    invalidateVideo,
    setVideoActive,
    onVideoProgress,
    previewAssets,
    previewOpen: open,
    setPreviewOpen: setOpen,
    previewIndex: index,
    setPreviewIndex: setIndex,
  };
}
