import { useEffect, useState } from "react";
import { api } from "../api";
import type { JobProgress } from "../types";

interface LibraryActivityOptions {
  recentJobs?: JobProgress[];
  refresh: () => Promise<void>;
  run: (operation: () => Promise<unknown>) => Promise<void>;
  onScanComplete: () => void;
}

export function useLibraryActivity({ recentJobs, refresh, run, onScanComplete }: LibraryActivityOptions) {
  const [job, setJob] = useState<JobProgress>();

  useEffect(() => {
    let unlistenProgress = () => {};
    let unlistenLibrary = () => {};
    let unlistenDirty = () => {};
    const dirtyTimers = new Map<string, number>();
    void api.onJobProgress((progress) => {
      setJob(progress);
      if (progress.status === "complete") void refresh();
    }).then((dispose) => { unlistenProgress = dispose; });
    void api.onLibraryChanged(() => void refresh()).then((dispose) => { unlistenLibrary = dispose; });
    void api.onSourceDirty((sourceId) => {
      const current = dirtyTimers.get(sourceId);
      if (current) window.clearTimeout(current);
      dirtyTimers.set(sourceId, window.setTimeout(() => {
        dirtyTimers.delete(sourceId);
        void run(() => api.rescanSource(sourceId));
      }, 1200));
    }).then((dispose) => { unlistenDirty = dispose; });
    return () => {
      unlistenProgress();
      unlistenLibrary();
      unlistenDirty();
      dirtyTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [refresh, run]);

  useEffect(() => {
    const latest = recentJobs?.[0];
    if (!latest) return;
    setJob((current) => current?.id === latest.id && current.status === latest.status && current.completed === latest.completed ? current : latest);
    if (latest.status === "complete" && job?.status !== "complete") {
      onScanComplete();
      void refresh();
    }
  }, [job?.status, onScanComplete, recentJobs, refresh]);

  return { job, setJob };
}
