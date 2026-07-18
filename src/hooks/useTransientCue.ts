import { useCallback, useEffect, useRef, useState } from "react";
import type { WeaveCue, WeaveCueKind, WeaveCueOptions } from "../features/motion/weaveCue";

export function useTransientCue(defaultDuration = 700) {
  const [cue, setCue] = useState<WeaveCue>();
  const timerRef = useRef<number | undefined>(undefined);
  const nextIdRef = useRef(0);

  const trigger = useCallback((kind: WeaveCueKind, options: WeaveCueOptions = {}) => {
    window.clearTimeout(timerRef.current);
    const nextCue: WeaveCue = { id: ++nextIdRef.current, kind, color: options.color };
    setCue(nextCue);
    timerRef.current = window.setTimeout(() => {
      setCue((current) => current?.id === nextCue.id ? undefined : current);
    }, options.duration ?? defaultDuration);
  }, [defaultDuration]);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);
  return { cue, trigger };
}
