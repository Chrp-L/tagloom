import { motion } from "motion/react";
import { FolderPlus, Images, Image as ImageIcon, RefreshCw, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { JobProgress, LibraryBootstrap } from "../types";
import { isInteractiveWindowTarget, toggleCurrentWindowMaximize } from "../lib/windowControls";

interface Props {
  data?: LibraryBootstrap;
  jobs?: JobProgress[];
  onAddSource: () => void;
}

export function LibraryOverview({ data, jobs = [], onAddSource }: Props) {
  const { t } = useTranslation();
  const indexReady = data?.sources.every((source) => source.status === "ready") ?? true;
  return <aside className="inspector homeOverview">
    <motion.div className="inspectorContent" initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.16 }}>
      <div className="inspectorHeader" data-tauri-drag-region onDoubleClick={(event) => { if (!isInteractiveWindowTarget(event.target)) void toggleCurrentWindowMaximize(); }}><h2 data-tauri-drag-region>{t("libraryOverview")}</h2></div>
      <section className="overviewPulse" aria-label={t("libraryOverview")}>
        <span className="overviewThread" aria-hidden="true"><i /><i /><b /></span>
        <div><Images size={16} /><span>{t("allItems")}</span><strong>{data?.totalAssets ?? 0}</strong></div>
        <div><ImageIcon size={16} /><span>{t("images")}</span><strong>{data?.imageCount ?? 0}</strong></div>
        <div><Video size={16} /><span>{t("videos")}</span><strong>{data?.videoCount ?? 0}</strong></div>
        <div><FolderPlus size={16} /><span>{t("folders")}</span><strong>{data?.sources.length ?? 0}</strong></div>
      </section>
      <section className="inspectorSection overviewStatus"><h3>{t("indexStatus")}</h3><div><span className={indexReady ? "statusDot ready" : "statusDot working"} /><strong>{indexReady ? t("indexReady") : t("scanning", { completed: 0, total: "—" })}</strong></div></section>
      <section className="inspectorSection overviewActivity"><h3>{t("recentActivity")}</h3>{jobs.slice(0, 5).length ? <div>{jobs.slice(0, 5).map((job) => <span key={job.id}><RefreshCw size={13} /><strong>{job.status === "complete" ? t("scanReady") : job.status === "running" ? t("scanning", { completed: job.completed, total: job.total || "—" }) : job.message || job.status}</strong></span>)}</div> : <p>{t("scanReady")}</p>}</section>
      <div className="overviewAddSource"><button className="primaryButton tactile" onClick={onAddSource}><FolderPlus size={16} />{t("addFolder")}</button></div>
    </motion.div>
  </aside>;
}
