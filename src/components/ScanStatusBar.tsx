import { LoaderCircle, Pause, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { calculateProgress } from "../lib/progress";
import type { JobProgress } from "../types";

interface ScanStatusBarProps {
  job?: JobProgress;
  onControl: (action: "pause" | "resume" | "cancel") => void;
}

export function ScanStatusBar({ job, onControl }: ScanStatusBarProps) {
  const { t } = useTranslation();
  if (!job || (job.status !== "running" && job.status !== "paused")) return null;
  const knownTotal = Number.isFinite(job.total) && job.total > 0;
  return <div className="scanBar">
    <LoaderCircle className={job.status === "running" ? "spin" : ""} size={14} />
    <span className="scanStatus">{t("scanning", { completed: job.completed, total: job.total })}</span>
    <div className="scanProgressTrack"><i className={knownTotal ? "scanProgressFill" : "scanProgressUnknown"} style={knownTotal ? { transform: `scaleX(${calculateProgress(job.completed, job.total)})` } : undefined} /></div>
    <button onClick={() => onControl(job.status === "paused" ? "resume" : "pause")}>{job.status === "paused" ? <Play size={13} /> : <Pause size={13} />}</button>
    <button onClick={() => onControl("cancel")}><X size={13} /></button>
  </div>;
}
