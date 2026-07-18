import { ExternalLink, LoaderCircle, Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { mediaUrl } from "../api";
import type { Asset } from "../types";

export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const value = Math.floor(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value % 3600 / 60);
  const remaining = value % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}` : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

interface VideoPreviewProps {
  asset: Asset;
  index: number;
  count: number;
  direction: PreviewDirection;
  volume: number;
  muted: boolean;
  onVolume: (volume: number) => void;
  onMuted: (muted: boolean) => void;
  onPrepareVideo: (asset: Asset) => Promise<string>;
  onOpenExternal: (asset: Asset) => void;
}

export type PreviewDirection = -1 | 1;

export const previewMediaVariants = {
  enter: (direction: PreviewDirection) => ({ opacity: 0, x: direction * 14 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: PreviewDirection) => ({ opacity: 0, x: direction * -14 }),
};

export function VideoPreview(props: VideoPreviewProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingPlayRef = useRef(false);
  const preparingRef = useRef(false);
  const initialSource = mediaUrl(props.asset.previewPath);
  const sourceRef = useRef<string | undefined>(initialSource);
  const [source, setSource] = useState<string | undefined>(initialSource);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string>();
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(Math.max(0, (props.asset.durationMs ?? 0) / 1000));

  useEffect(() => () => { videoRef.current?.pause(); }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (video) { video.volume = props.volume; video.muted = props.muted; }
  }, [props.volume, props.muted, source]);

  const prepareProxy = async () => {
    if (preparingRef.current || sourceRef.current) return;
    preparingRef.current = true;
    pendingPlayRef.current = true;
    setPreparing(true);
    setError(undefined);
    setPlaying(false);
    try {
      const path = await props.onPrepareVideo(props.asset);
      const nextSource = mediaUrl(path);
      sourceRef.current = nextSource;
      setSource(nextSource);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      pendingPlayRef.current = false;
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  };

  const attemptPlay = async () => {
    const video = videoRef.current;
    if (!video || !sourceRef.current) return;
    pendingPlayRef.current = false;
    try {
      await video.play();
    } catch {
      setPlaying(false);
    }
  };

  const requestPlay = () => {
    setError(undefined);
    setStarted(true);
    if (preparingRef.current) return;
    if (!sourceRef.current) { void prepareProxy(); return; }
    void attemptPlay();
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!started || !sourceRef.current || !video) { requestPlay(); return; }
    if (video.paused) void attemptPlay(); else video.pause();
  };

  const handleSourceError = () => {
    pendingPlayRef.current = false;
    setPreparing(false);
    setPlaying(false);
    setError(t("videoPreviewFailed"));
  };

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

  return <motion.div className="previewMediaLayout videoMediaLayout" custom={props.direction} variants={previewMediaVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
    <div className="previewStage videoStage" onClick={() => { if (started && !preparing && !error) togglePlayback(); }}>
      <video ref={videoRef} src={source} poster={mediaUrl(props.asset.thumbnailPath)} preload="metadata" playsInline
        onCanPlay={() => { if (pendingPlayRef.current) void attemptPlay(); }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => { if (Number.isFinite(event.currentTarget.duration)) setDuration(event.currentTarget.duration); }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} onError={handleSourceError} />
      {preparing ? <div className="videoCenterState"><LoaderCircle className="spin" size={30} /><span>{t("preparingVideo")}</span></div>
        : !playing && !error && <button className="videoCenterPlay tactile" aria-label={t("playVideo")} onClick={(event) => { event.stopPropagation(); togglePlayback(); }}><Play size={30} fill="currentColor" /></button>}
      {error && <div className="videoError"><span>{t("videoPreviewFailed")}</span><button onClick={(event) => { event.stopPropagation(); props.onOpenExternal(props.asset); }}>{t("openExternal")}</button></div>}
    </div>
    <div className="videoControlBar" onClick={(event) => event.stopPropagation()}>
      <input className="mediaRange progressRange" aria-label={t("videoProgress")} type="range" min={0} max={Math.max(duration, 0.01)} step={0.05} value={Math.min(currentTime, Math.max(duration, 0.01))} disabled={!source || preparing}
        style={{ "--range-progress": `${progress}%` } as React.CSSProperties} onChange={(event) => seek(Number(event.target.value))} />
      <div className="videoControlRow">
        <div className="videoControlGroup">
          <button className="previewIconControl tactile" aria-label={playing ? t("pauseVideo") : t("playVideo")} onClick={togglePlayback}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
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
