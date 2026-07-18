import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Tag } from "../types";

export interface TagDragState {
  tag: Tag;
  originX: number;
  originY: number;
  x: number;
  y: number;
  targetAssetId?: string;
  active: boolean;
  dropping?: boolean;
}

export function useTagDrag(onDrop: (assetId: string, tag: Tag) => void) {
  const [drag, setDrag] = useState<TagDragState | undefined>(undefined);
  const [wovenAssetId, setWovenAssetId] = useState<string | undefined>(undefined);
  const dragRef = useRef<TagDragState | undefined>(undefined);
  const suppressClickRef = useRef(false);
  const cleanupRef = useRef<() => void>(() => {});
  const timersRef = useRef<number[]>([]);

  const later = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
  }, []);

  const begin = useCallback((tag: Tag, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    cleanupRef.current();
    const pointerId = event.pointerId;
    event.currentTarget.setPointerCapture(pointerId);
    dragRef.current = { tag, originX: event.clientX, originY: event.clientY, x: event.clientX, y: event.clientY, active: false };
    const cleanup = () => {
      document.body.classList.remove("tagDragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
    const move = (pointerEvent: PointerEvent) => {
      const current = dragRef.current;
      if (!current || pointerEvent.pointerId !== pointerId) return;
      const active = current.active || Math.hypot(pointerEvent.clientX - current.originX, pointerEvent.clientY - current.originY) > 5;
      if (!active) return;
      pointerEvent.preventDefault();
      const target = document.elementFromPoint(pointerEvent.clientX, pointerEvent.clientY)?.closest<HTMLElement>("[data-asset-id]");
      const next = { ...current, x: pointerEvent.clientX, y: pointerEvent.clientY, targetAssetId: target?.dataset.assetId, active: true };
      dragRef.current = next;
      setDrag(next);
      document.body.classList.add("tagDragging");
    };
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      const current = dragRef.current;
      if (current?.active) {
        suppressClickRef.current = true;
        later(() => { suppressClickRef.current = false; }, 0);
        if (current.targetAssetId) {
          onDrop(current.targetAssetId, current.tag);
          setWovenAssetId(current.targetAssetId);
          later(() => setWovenAssetId(undefined), 650);
          const target = document.querySelector<HTMLElement>(`[data-asset-id="${CSS.escape(current.targetAssetId)}"]`);
          const rect = target?.getBoundingClientRect();
          setDrag({ ...current, x: rect ? rect.left + rect.width / 2 : current.x, y: rect ? rect.top + rect.height / 2 : current.y, dropping: true });
          later(() => setDrag(undefined), 220);
        } else setDrag(undefined);
      }
      dragRef.current = undefined;
      if (!current?.active) setDrag(undefined);
      cleanup();
    };
    cleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }, [later, onDrop]);

  useEffect(() => () => {
    cleanupRef.current();
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const canActivate = useCallback(() => !suppressClickRef.current, []);
  return { drag, wovenAssetId, begin, canActivate };
}
