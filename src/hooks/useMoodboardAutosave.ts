import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { MoodboardDocument } from "../types";

export type MoodboardSaveStatus = "saved" | "saving" | "error" | "conflict";

interface Options {
  document?: MoodboardDocument;
  enabled: boolean;
  onSaved: (revision: number) => void;
  onError: (error: Error, conflict: boolean) => void;
}

const SAVE_DELAY_MS = 600;

function serialized(document: MoodboardDocument): string {
  const { revision: _revision, ...persisted } = document;
  return JSON.stringify(persisted);
}

function isConflict(error: unknown): boolean {
  return error instanceof Error && /revision conflict/i.test(error.message);
}

export function useMoodboardAutosave({ document, enabled, onSaved, onError }: Options) {
  const documentRef = useRef(document);
  const savedSignatureRef = useRef<string | undefined>(undefined);
  const revisionRef = useRef<number | undefined>(undefined);
  const documentIdRef = useRef<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const [status, setStatus] = useState<MoodboardSaveStatus>("saved");

  const enqueue = useCallback((candidate?: MoodboardDocument) => {
    if (!candidate || !enabled) return queueRef.current;
    const signature = serialized(candidate);
    if (signature === savedSignatureRef.current) return queueRef.current;
    setStatus("saving");
    queueRef.current = queueRef.current.catch(() => undefined).then(async () => {
      try {
        const expectedRevision = revisionRef.current ?? candidate.revision;
        const result = await api.saveMoodboard(candidate, expectedRevision);
        savedSignatureRef.current = signature;
        revisionRef.current = result.revision;
        setStatus("saved");
        onSaved(result.revision);
      } catch (reason) {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        const conflict = isConflict(error);
        setStatus(conflict ? "conflict" : "error");
        onError(error, conflict);
        throw error;
      }
    });
    return queueRef.current;
  }, [enabled, onError, onSaved]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    await enqueue(documentRef.current);
  }, [enqueue]);

  const acceptRemoteDocument = useCallback((next?: MoodboardDocument) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    documentRef.current = next;
    documentIdRef.current = next?.id;
    revisionRef.current = next?.revision;
    savedSignatureRef.current = next ? serialized(next) : undefined;
    setStatus("saved");
  }, []);

  useEffect(() => {
    documentRef.current = document;
    if (!document || !enabled) return;
    const signature = serialized(document);
    if (revisionRef.current === undefined || document.id !== documentIdRef.current) {
      documentIdRef.current = document.id;
      revisionRef.current = document.revision;
      savedSignatureRef.current = signature;
      setStatus("saved");
      return;
    }
    if (signature === savedSignatureRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void enqueue(document); }, SAVE_DELAY_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [document, enabled, enqueue]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { status, flush, acceptRemoteDocument };
}
