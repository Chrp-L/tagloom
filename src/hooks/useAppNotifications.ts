import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastMessage } from "../components/ToastRegion";

export function useAppNotifications() {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const timersRef = useRef<number[]>([]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const notify = useCallback((message: string, tone: ToastMessage["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setMessages((items) => [...items, { id, message, tone }]);
    const timer = window.setTimeout(() => {
      setMessages((items) => items.filter((item) => item.id !== id));
      timersRef.current = timersRef.current.filter((value) => value !== timer);
    }, 3200);
    timersRef.current.push(timer);
  }, []);

  return { messages, notify };
}
