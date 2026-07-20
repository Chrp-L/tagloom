import { AlertCircle, FolderOpen, FolderPlus, Image as ImageIcon, Images, Pause, RefreshCw, Video } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { JobProgress, LibraryBootstrap, SourceRoot } from "../types";
import { isInteractiveWindowTarget, toggleCurrentWindowMaximize } from "../lib/windowControls";

interface Props {
  data?: LibraryBootstrap;
  jobs?: JobProgress[];
  onAddSource: () => void;
  onOpenSource: (id: string) => void;
}

export function LibraryOverview({ data, jobs = [], onAddSource, onOpenSource }: Props) {
  const { t } = useTranslation();
  const sources = data?.sources ?? [];
  const activeJob = jobs.find((job) => job.status === "running" || job.status === "paused" || job.status === "error");
  const indexReady = sources.every((source) => source.status === "ready") && !activeJob;

  const jobLabel = (job: JobProgress) => {
    if (job.status === "running") return t("scanning", { completed: job.completed, total: job.total || "—" });
    if (job.status === "paused") return t("loomPaused");
    if (job.status === "error") return job.message || t("loomError");
    return job.message || t("scanReady");
  };
  const sourceStatus = (source: SourceRoot) => {
    if (source.status === "offline") return t("offline");
    if (source.status === "scanning") return t("scanning", { completed: 0, total: "—" });
    return t("indexReady");
  };

  return <aside className="inspector homeOverview" aria-labelledby="workspace-status-title">
    <motion.div className="inspectorContent" initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.16 }}>
      <div className="inspectorHeader" data-tauri-drag-region onDoubleClick={(event) => { if (!isInteractiveWindowTarget(event.target)) void toggleCurrentWindowMaximize(); }}><h2 id="workspace-status-title" data-tauri-drag-region>{t("workspaceStatus")}</h2></div>

      <section className={`inspectorSection overviewIndex ${activeJob?.status ?? (indexReady ? "ready" : "working")}`}>
        <h3>{t("indexStatus")}</h3>
        <div className="overviewIndexState">
          <span className={`statusDot ${indexReady ? "ready" : activeJob?.status === "error" ? "error" : "working"}`} />
          <strong>{activeJob ? jobLabel(activeJob) : indexReady ? t("indexReady") : t("scanning", { completed: 0, total: "—" })}</strong>
          {activeJob?.status === "running" ? <RefreshCw className="overviewIndexIcon spinning" size={14} aria-hidden="true" /> : activeJob?.status === "paused" ? <Pause className="overviewIndexIcon" size={14} aria-hidden="true" /> : activeJob?.status === "error" ? <AlertCircle className="overviewIndexIcon" size={14} aria-hidden="true" /> : null}
        </div>
        {activeJob && activeJob.total > 0 && <progress aria-label={t("indexStatus")} max={activeJob.total} value={Math.min(activeJob.completed, activeJob.total)} />}
      </section>

      <section className="overviewMetrics" aria-label={t("workspaceStatus")}>
        <div><Images size={15} /><span>{t("allItems")}</span><strong>{data?.totalAssets ?? 0}</strong></div>
        <div><ImageIcon size={15} /><span>{t("images")}</span><strong>{data?.imageCount ?? 0}</strong></div>
        <div><Video size={15} /><span>{t("videos")}</span><strong>{data?.videoCount ?? 0}</strong></div>
        <div><FolderOpen size={15} /><span>{t("folders")}</span><strong>{sources.length}</strong></div>
      </section>

      <section className="inspectorSection overviewSources">
        <h3>{t("sources")}</h3>
        {sources.length > 0 ? <div className="overviewSourceList">{sources.slice(0, 4).map((source) => <button key={source.id} type="button" className="overviewSource tactile" onClick={() => onOpenSource(source.id)}>
          <FolderOpen size={15} aria-hidden="true" />
          <span><strong>{source.name}</strong><small>{sourceStatus(source)} · {t("items", { count: source.assetCount })}</small></span>
          <i className={`statusDot ${source.status}`} aria-hidden="true" />
        </button>)}</div> : <div className="overviewEmptySources">
          <p>{t("noSourcesBody")}</p>
          <button className="primaryButton tactile" type="button" onClick={onAddSource}><FolderPlus size={16} />{t("addFolder")}</button>
        </div>}
      </section>

      <section className="inspectorSection overviewActivity"><h3>{t("recentActivity")}</h3>{jobs.length > 0 ? <div>{jobs.slice(0, 3).map((job) => <span key={job.id}><RefreshCw size={13} /><strong>{jobLabel(job)}</strong></span>)}</div> : <p>{t("scanReady")}</p>}</section>
      {sources.length > 0 && <div className="overviewAddSource"><button className="secondaryButton tactile" type="button" onClick={onAddSource}><FolderPlus size={16} />{t("addFolder")}</button></div>}
    </motion.div>
  </aside>;
}
