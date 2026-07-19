import { useReducedMotion } from "motion/react";
import { useEffect, useState, type CSSProperties } from "react";
import type { JobProgress } from "../types";

export type HomeLoomState = "idle" | "scanning" | "paused" | "error";

export function resolveHomeLoomState(job?: JobProgress): HomeLoomState {
  if (job?.status === "running") return "scanning";
  if (job?.status === "paused") return "paused";
  if (job?.status === "error") return "error";
  return "idle";
}

export function resolveHomeLoomProgress(job?: JobProgress): number {
  if (!job || job.total <= 0) return 0;
  return Math.min(1, Math.max(0, job.completed / job.total));
}

interface Props {
  job?: JobProgress;
  reducedMotion?: boolean;
}

export function HomeLoomWidget({ job, reducedMotion }: Props) {
  const userReducedMotion = useReducedMotion();
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== "hidden");
  const [windowFocused, setWindowFocused] = useState(true);
  const state = resolveHomeLoomState(job);
  const progress = resolveHomeLoomProgress(job);
  const reduced = reducedMotion ?? Boolean(userReducedMotion);
  const paused = reduced || !pageVisible || !windowFocused || state === "paused";
  const style = {
    "--loom-cycle": state === "scanning" ? "3.4s" : "5.2s",
    "--loom-progress": `${Math.round(progress * 100)}%`,
    "--loom-progress-opacity": String(0.28 + progress * 0.72),
  } as CSSProperties;

  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== "hidden");
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return (
    <span className="homeLoomWidget" data-state={state} data-paused={paused} data-reduced-motion={reduced} style={style} aria-hidden="true">
      <span className="loomInputStack loomMotion">
        <i className="loomInputCard loomInputBack"><b /></i>
        <i className="loomInputCard loomInputMiddle"><b /></i>
        <i className="loomInputCard loomInputActive"><b /><em /></i>
        <span className="loomInputSignal" />
      </span>
      <span className="loomField loomMotion">
        <i className="loomTrack loomTrackOne" />
        <i className="loomTrack loomTrackTwo" />
        <i className="loomTrack loomTrackThree" />
        <i className="loomTrack loomTrackFour" />
        <span className="loomWoven loomWovenOne" />
        <span className="loomWoven loomWovenTwo" />
        <span className="loomWoven loomWovenThree" />
        <b className="loomNode loomNodeCoral" />
        <b className="loomNode loomNodeGreen" />
        <b className="loomNode loomNodeGold" />
        <em className="loomShuttle"><i /></em>
      </span>
      <span className="loomOutputStack loomMotion">
        <i className="loomOutputBack" />
        <i className="loomOutputMiddle" />
        <i className="loomOutputFront"><b /><em /></i>
      </span>
      <span className="loomProgressRail"><i /></span>
    </span>
  );
}
