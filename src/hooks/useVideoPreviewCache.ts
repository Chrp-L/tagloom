import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import type { VideoPreviewCacheStatus } from "../types";

interface Options {
  enabled: boolean;
  onError: (message: string) => void;
}

export function useVideoPreviewCache({ enabled, onError }: Options) {
  const [status, setStatus] = useState<VideoPreviewCacheStatus>();
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await api.getVideoPreviewCacheStatus());
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const setLimit = useCallback(async (limitBytes: number) => {
    setUpdating(true);
    try {
      setStatus(await api.setVideoPreviewCacheLimit(limitBytes));
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdating(false);
    }
  }, [onError]);

  const clear = useCallback(async () => {
    setUpdating(true);
    try {
      setStatus(await api.clearVideoPreviewCache());
      return true;
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setUpdating(false);
    }
  }, [onError]);

  return { status, loading, updating, refresh, setLimit, clear };
}
