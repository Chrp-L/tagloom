import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import type { WeaveCue } from "../features/motion/weaveCue";

type SignalKind = Exclude<WeaveCue["kind"], "sidebar">;
type SignalDirection = "forward" | "reverse";

export interface SignalPresentation {
  kind: SignalKind;
  direction: SignalDirection;
  channel: 0 | 1 | 2;
  color: string;
}

const CHANNEL_PATHS = [
  ["1px", "7px", "3px", "11px", "3px"],
  ["6px", "2px", "10px", "4px", "6px"],
  ["11px", "5px", "9px", "1px", "11px"],
] as const;

export function signalPresentationForCue(cue?: WeaveCue): SignalPresentation | undefined {
  if (!cue || cue.kind === "sidebar") return undefined;
  if (cue.kind === "layout") return { kind: cue.kind, direction: "reverse", channel: 2, color: "var(--green)" };
  if (cue.kind === "tag") return { kind: cue.kind, direction: "forward", channel: 1, color: cue.color || "var(--accent)" };
  if (cue.kind === "scan-complete") return { kind: cue.kind, direction: "forward", channel: 1, color: "var(--signal-gold)" };
  return { kind: cue.kind, direction: "forward", channel: 0, color: "var(--accent)" };
}

export function signalMotionForCue(presentation: SignalPresentation, reducedMotion: boolean) {
  if (reducedMotion) return { mode: "pulse" as const, left: undefined, top: undefined };
  const left = presentation.direction === "forward" ? ["3%", "25%", "50%", "75%", "97%"] : ["97%", "75%", "50%", "25%", "3%"];
  const path = CHANNEL_PATHS[presentation.channel];
  const top = presentation.direction === "forward" ? [...path] : [...path].reverse();
  return { mode: "travel" as const, left, top };
}

export function SignalLoom({ cue }: { cue?: WeaveCue }) {
  const reducedMotion = Boolean(useReducedMotion());
  const presentation = signalPresentationForCue(cue);
  const motionSpec = presentation ? signalMotionForCue(presentation, reducedMotion) : undefined;
  const style = presentation ? ({ "--signal-color": presentation.color } as CSSProperties) : undefined;

  return <div className="signalLoom" data-tauri-drag-region data-active-kind={presentation?.kind} aria-hidden="true">
    <span className="signalThread threadA" />
    <span className="signalThread threadB" />
    <span className="signalThread threadC" />
    <span className="signalJunction junctionA" />
    <span className="signalJunction junctionB" />
    <span className="signalJunction junctionC" />
    <AnimatePresence>{cue && presentation && motionSpec && <motion.span key={cue.id} className={`signalEvent ${motionSpec.mode}`} data-kind={presentation.kind} data-direction={presentation.direction} style={style}>
      {motionSpec.mode === "travel" ? <motion.i className="signalShuttle" initial={{ opacity: 0, left: motionSpec.left[0], top: motionSpec.top[0], scale: 0.7 }} animate={{ opacity: [0, 1, 1, 1, 0], left: motionSpec.left, top: motionSpec.top, scale: [0.7, 1, 1, 0.92, 0.72] }} transition={{ duration: 0.52, times: [0, 0.16, 0.48, 0.82, 1], ease: [0.22, 1, 0.36, 1] }} />
        : <motion.i className="signalReducedPulse" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: [0, 1, 0], scale: [0.8, 1, 0.9] }} transition={{ duration: 0.32 }} />}
      {motionSpec.mode === "travel" && <span className="signalNodePulse"><motion.i initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: [0, 1, 0], scale: [0.7, 1.35, 1] }} transition={{ duration: 0.38, delay: 0.08 }} /><motion.i initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: [0, 1, 0], scale: [0.7, 1.35, 1] }} transition={{ duration: 0.38, delay: 0.2 }} /><motion.i initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: [0, 1, 0], scale: [0.7, 1.35, 1] }} transition={{ duration: 0.38, delay: 0.32 }} /></span>}
    </motion.span>}</AnimatePresence>
  </div>;
}
