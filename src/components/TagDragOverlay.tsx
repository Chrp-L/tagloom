import { motion } from "motion/react";
import type { TagDragState } from "../hooks/useTagDrag";

export function TagDragOverlay({ drag }: { drag?: TagDragState }) {
  if (!drag?.active) return null;
  return <div className="tagDragLayer" aria-hidden="true">
    <motion.span className={`tagDragThread ${drag.dropping ? "dropping" : ""}`} style={{ left: drag.originX, top: drag.originY }} animate={{ width: Math.hypot(drag.x - drag.originX, drag.y - drag.originY), rotate: Math.atan2(drag.y - drag.originY, drag.x - drag.originX) * 180 / Math.PI, scaleX: drag.dropping ? 0 : 1, opacity: drag.dropping ? 0.35 : 1 }} transition={{ type: "spring", stiffness: 440, damping: 32, mass: 0.35 }} />
    <motion.span className="tagDragPill" initial={{ opacity: 0, scale: 0.92, x: drag.x + 12, y: drag.y + 12 }} animate={{ opacity: drag.dropping ? 0 : 1, scale: drag.dropping ? 0.72 : drag.targetAssetId ? 0.97 : 1, x: drag.x + 12, y: drag.y + 12 }} transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.42 }}><i style={{ background: drag.tag.color }} />{drag.tag.name}</motion.span>
  </div>;
}
