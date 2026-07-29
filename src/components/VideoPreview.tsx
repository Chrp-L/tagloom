import { ExternalLink, LoaderCircle, Maximize2, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { mediaUrl } from "../api";
import type { Asset, VideoPreviewProgress } from "../types";

const VIDEO_LOAD_TIMEOUT_MS = 15_000;

export type VideoPlaybackState = "poster" | "loading" | "preparing-proxy" | "ready" | "playing" | "paused" | "error";
type VideoSourceKind = "original" | "proxy";

export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const value = Math.floor(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value % 3600 / 60);
  const remaining = value % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}` : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

export interface VideoPreviewProps {
  asset: Asset;
  index: number;
  count: number;
  direction: PreviewDirection;
  volume: number;
  muted: boolean;
  onVolume: (volume: number) => void;
  onMuted: (muted: boolean) => void;
  onPrepareVideo: (asset: Asset) => Promise<string>;
  onCancelVideo: (asset: Asset) => Promise<void>;
  onInvalidateVideo: (asset: Asset) => Promise<void>;
  onSetVideoActive: (asset: Asset, active: boolean) => Promise<void>;
  onVideoProgress: (handler: (progress: VideoPreviewProgress) => void) => Promise<() => void>;
  onOpenExternal: (asset: Asset) => void;
}

export type PreviewDirection = -1 | 1;

export const previewMediaVariants = {
  enter: (direction: PreviewDirection) => ({ opacity: 0, x: direction * 14 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: PreviewDirection) => ({ opacity: 0, x: direction * -14 }),
};

function errorName(reason: unknown): string {
  if (reason instanceof DOMException || reason instanceof Error) return reason.name;
  return "";
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message;
  return typeof reason === "string" && reason ? reason : "Video playback failed";
}

function isCompatibilityPlaybackError(reason: unknown): boolean {
  return errorName(reason) === "NotSupportedError";
}

function isAutoplayRejection(reason: unknown): boolean {
  return errorName(reason) === "NotAllowedError";
}

function isCompatibilityMediaError(video: HTMLVideoElement): boolean {
  return video.error?.code === 3 || video.error?.code === 4;
}

export function VideoPreview(props: VideoPreviewProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);
  const sourceKindRef = useRef<VideoSourceKind | undefined>(undefined);
  const sourcePathRef = useRef<string | undefined>(undefined);
  const failedSourcesRef = useRef(new Set<VideoSourceKind>());
  const wantsToPlayRef = useRef(false);
  const playAttemptRef = useRef<Promise<void> | undefined>(undefined);
  const preparePromiseRef = useRef<Promise<void> | undefined>(undefined);
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const [source, setSource] = useState<string>();
  const [playbackState, setPlaybackState] = useState<VideoPlaybackState>("poster");
  const playbackStateRef = useRef<VideoPlaybackState>("poster");
  const [error, setError] = useState<string>();
  const [prepareProgress, setPrepareProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(Math.max(0, (props.asset.durationMs ?? 0) / 1000));

  const transitionTo = useCallback((state: VideoPlaybackState) => {
    playbackStateRef.current = state;
    setPlaybackState(state);
  }, []);

  const setActive = useCallback((active: boolean) => {
    if (activeRef.current === active) return;
    activeRef.current = active;
    void props.onSetVideoActive(props.asset, active).catch(() => undefined);
  }, [props.asset, props.onSetVideoActive]);

  const fail = useCallback((reason: unknown) => {
    if (!mountedRef.current) return;
    wantsToPlayRef.current = false;
    setActive(false);
    transitionTo("error");
    setError(errorMessage(reason));
  }, [setActive, transitionTo]);

  const loadSource = useCallback((kind: VideoSourceKind, path: string) => {
    const nextSource = mediaUrl(path);
    if (!nextSource) {
      fail("Video source is unavailable");
      return false;
    }
    sourceKindRef.current = kind;
    sourcePathRef.current = path;
    setActive(kind === "proxy");
    setError(undefined);
    transitionTo("loading");
    setSource(nextSource);
    const video = videoRef.current;
    if (video) video.src = nextSource;
    return true;
  }, [fail, setActive, transitionTo]);

  const prepareProxy = useCallback(() => {
    if (preparePromiseRef.current) return preparePromiseRef.current;
    const generation = generationRef.current;
    wantsToPlayRef.current = true;
    setPrepareProgress(0);
    setError(undefined);
    transitionTo("preparing-proxy");
    setActive(false);
    const request = props.onPrepareVideo(props.asset)
      .then((path) => {
        if (!mountedRef.current || generation !== generationRef.current) return;
        loadSource("proxy", path);
      })
      .catch((reason) => {
        if (mountedRef.current && generation === generationRef.current) fail(reason);
      })
      .finally(() => {
        if (generation === generationRef.current) preparePromiseRef.current = undefined;
      });
    preparePromiseRef.current = request;
    return request;
  }, [fail, loadSource, props.asset, props.onPrepareVideo, setActive, transitionTo]);

  const invalidateProxyAndFallback = useCallback(async () => {
    failedSourcesRef.current.add("proxy");
    sourcePathRef.current = undefined;
    setActive(false);
    try {
      await props.onInvalidateVideo(props.asset);
    } catch {
      // Cache invalidation is best-effort; the original remains usable.
    }
    if (!mountedRef.current) return;
    if (failedSourcesRef.current.has("original")) {
      fail("Neither the original video nor its compatible preview can be played");
      return;
    }
    loadSource("original", props.asset.path);
  }, [fail, loadSource, props.asset, props.onInvalidateVideo, setActive]);

  const handleCompatibilityFailure = useCallback(() => {
    const kind = sourceKindRef.current;
    if (!kind) {
      fail("Video source is unavailable");
      return;
    }
    failedSourcesRef.current.add(kind);
    if (kind === "proxy") {
      void invalidateProxyAndFallback();
      return;
    }
    if (failedSourcesRef.current.has("proxy")) {
      fail("Neither the original video nor its compatible preview can be played");
      return;
    }
    void prepareProxy();
  }, [fail, invalidateProxyAndFallback, prepareProxy]);

  const attemptPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !sourceKindRef.current) return Promise.resolve();
    if (playAttemptRef.current) return playAttemptRef.current;
    const sourceKind = sourceKindRef.current;
    const request = video.play()
      .catch((reason) => {
        if (!mountedRef.current || sourceKind !== sourceKindRef.current) return;
        if (isAutoplayRejection(reason)) {
          wantsToPlayRef.current = false;
          transitionTo("ready");
          setError(undefined);
          return;
        }
        if (isCompatibilityPlaybackError(reason)) {
          handleCompatibilityFailure();
          return;
        }
        fail(reason);
      })
      .finally(() => {
        if (playAttemptRef.current === request) playAttemptRef.current = undefined;
      });
    playAttemptRef.current = request;
    return request;
  }, [fail, handleCompatibilityFailure, transitionTo]);

  const requestPlayback = useCallback(() => {
    setError(undefined);
    if (playbackState === "playing") {
      wantsToPlayRef.current = false;
      videoRef.current?.pause();
      return;
    }
    wantsToPlayRef.current = true;
    if (playbackState === "preparing-proxy" || playAttemptRef.current) return;
    if (sourceKindRef.current && sourcePathRef.current) {
      void attemptPlay();
      return;
    }
    const existingProxy = props.asset.previewPath;
    const kind: VideoSourceKind = existingProxy && !failedSourcesRef.current.has("proxy") ? "proxy" : "original";
    const path = kind === "proxy" ? existingProxy : props.asset.path;
    if (path && loadSource(kind, path)) void attemptPlay();
  }, [attemptPlay, loadSource, playbackState, props.asset.path, props.asset.previewPath]);

  const cancelPreparation = useCallback(async () => {
    if (!preparePromiseRef.current) return;
    generationRef.current += 1;
    preparePromiseRef.current = undefined;
    wantsToPlayRef.current = false;
    setPrepareProgress(0);
    transitionTo("poster");
    setSource(undefined);
    sourceKindRef.current = undefined;
    sourcePathRef.current = undefined;
    await props.onCancelVideo(props.asset).catch(() => undefined);
  }, [props.asset, props.onCancelVideo, transitionTo]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      wantsToPlayRef.current = false;
      videoRef.current?.pause();
      if (preparePromiseRef.current) void props.onCancelVideo(props.asset).catch(() => undefined);
      activeRef.current = false;
      void props.onSetVideoActive(props.asset, false).catch(() => undefined);
    };
  }, [props.asset.id, props.onCancelVideo, props.onSetVideoActive]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void props.onVideoProgress((progress) => {
      if (!disposed && progress.assetId === props.asset.id) setPrepareProgress(Math.max(0, Math.min(100, progress.percent)));
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [props.asset.id, props.onVideoProgress]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = props.volume;
      video.muted = props.muted;
    }
  }, [props.volume, props.muted, source]);

  useEffect(() => {
    if (playbackState !== "loading" || !source) return;
    const expectedSource = source;
    const timer = window.setTimeout(() => {
      if (mountedRef.current && expectedSource === mediaUrl(sourcePathRef.current)) {
        fail("Video loading timed out");
      }
    }, VIDEO_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [fail, playbackState, source]);

  const handleSourceError = useCallback(() => {
    const video = videoRef.current;
    if (!video || !sourceKindRef.current) return;
    if (sourceKindRef.current === "proxy") {
      void invalidateProxyAndFallback();
      return;
    }
    if (isCompatibilityMediaError(video)) {
      handleCompatibilityFailure();
      return;
    }
    fail(video.error?.message || "Video source could not be loaded");
  }, [fail, handleCompatibilityFailure, invalidateProxyAndFallback]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector<HTMLElement>(".previewContent")?.requestFullscreen();
  };

  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setCurrentTime(value);
  };

  const progress = duration > 0 ? Math.min(100, currentTime / duration * 100) : 0;
  const volumePercent = props.muted ? 0 : props.volume * 100;
  const preparing = playbackState === "preparing-proxy";
  const playing = playbackState === "playing";
  const showPlayButton = !playing && playbackState !== "error" && !preparing;

  return <motion.div className="previewMediaLayout videoMediaLayout" data-playback-state={playbackState} custom={props.direction} variants={previewMediaVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
    <div className="previewStage videoStage" onClick={requestPlayback}>
      <video ref={videoRef} src={source} poster={mediaUrl(props.asset.thumbnailPath)} preload="metadata" playsInline
        onCanPlay={(event) => { transitionTo(event.currentTarget.paused ? "ready" : "playing"); if (wantsToPlayRef.current) void attemptPlay(); }}
        onPlay={() => { wantsToPlayRef.current = false; transitionTo("playing"); setError(undefined); }}
        onPause={() => { if (sourceKindRef.current && playbackStateRef.current !== "loading") transitionTo("paused"); }}
        onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onEnded={() => { wantsToPlayRef.current = false; transitionTo("paused"); }}
        onError={handleSourceError} />
      {preparing ? <div className="videoCenterState"><LoaderCircle className="spin" size={30} /><span>{t("preparingVideo")} {Math.round(prepareProgress)}%</span><button aria-label={t("cancel")} onClick={(event) => { event.stopPropagation(); void cancelPreparation(); }}><X size={15} />{t("cancel")}</button></div>
        : showPlayButton && <button className="videoCenterPlay tactile" aria-label={t("playVideo")} onClick={(event) => { event.stopPropagation(); requestPlayback(); }}><Play size={30} fill="currentColor" /></button>}
      {playbackState === "error" && <div className="videoError"><span>{t("videoPreviewFailed")}</span><button onClick={(event) => { event.stopPropagation(); requestPlayback(); }}>{t("playVideo")}</button><button onClick={(event) => { event.stopPropagation(); props.onOpenExternal(props.asset); }}>{t("openExternal")}</button></div>}
    </div>
    <div className="videoControlBar" onClick={(event) => event.stopPropagation()}>
      <input className="mediaRange progressRange" aria-label={t("videoProgress")} type="range" min={0} max={Math.max(duration, 0.01)} step={0.05} value={Math.min(currentTime, Math.max(duration, 0.01))} disabled={!source || preparing}
        style={{ "--range-progress": `${progress}%` } as React.CSSProperties} onChange={(event) => seek(Number(event.target.value))} />
      <div className="videoControlRow">
        <div className="videoControlGroup">
          <button className="previewIconControl tactile" aria-label={playing ? t("pauseVideo") : t("playVideo")} onClick={requestPlayback}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
          <span className="videoTime">{formatMediaTime(currentTime)} / {formatMediaTime(duration)}</span>
          <button className="previewIconControl tactile" aria-label={props.muted ? t("unmute") : t("mute")} onClick={() => props.onMuted(!props.muted)}>{props.muted || props.volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
          <input className="mediaRange volumeRange" aria-label={t("volume")} type="range" min={0} max={1} step={0.01} value={props.muted ? 0 : props.volume}
            style={{ "--range-progress": `${volumePercent}%` } as React.CSSProperties} onChange={(event) => { props.onMuted(false); props.onVolume(Number(event.target.value)); }} />
        </div>
        <span className="previewCount">{props.index + 1} / {props.count}</span>
        <div className="videoControlGroup endControls">
          <button className="previewIconControl tactile" aria-label={t("fullscreen")} title={t("fullscreen")} onClick={() => void toggleFullscreen()}><Maximize2 size={17} /></button>
          <button className="previewExternal tactile" onClick={() => props.onOpenExternal(props.asset)}><ExternalLink size={16} />{t("openExternal")}</button>
        </div>
      </div>
    </div>
  </motion.div>;
}
