import { useCallback, useMemo, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Asset } from "../types";

interface Options {
  assets: Asset[];
  queryClient: QueryClient;
  videoPreviewFailed: string;
}

export function usePreviewController({ assets, queryClient, videoPreviewFailed }: Options) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [preparedPreviews, setPreparedPreviews] = useState<Record<string, string>>({});
  const [sourceAssets, setSourceAssets] = useState<Asset[]>();

  const preview = useCallback((asset: Asset, contextAssets = assets) => {
    setSourceAssets(contextAssets);
    setIndex(Math.max(0, contextAssets.findIndex((item) => item.id === asset.id)));
    setOpen(true);
    void api.recordAssetViewed(asset.id).then(() => queryClient.invalidateQueries({ queryKey: ["home"] }));
  }, [assets, queryClient]);

  const prepareVideo = useCallback(async (asset: Asset) => {
    const existing = preparedPreviews[asset.id] || asset.previewPath;
    if (existing) return existing;
    const path = await api.prepareVideoPreview(asset.id);
    if (!path) throw new Error(videoPreviewFailed);
    setPreparedPreviews((items) => ({ ...items, [asset.id]: path }));
    return path;
  }, [preparedPreviews, videoPreviewFailed]);

  const previewAssets = useMemo(
    () => (sourceAssets ?? assets).map((asset) => preparedPreviews[asset.id] ? { ...asset, previewPath: preparedPreviews[asset.id] } : asset),
    [assets, preparedPreviews, sourceAssets],
  );

  return {
    preview,
    prepareVideo,
    previewAssets,
    previewOpen: open,
    setPreviewOpen: setOpen,
    previewIndex: index,
    setPreviewIndex: setIndex,
  };
}
