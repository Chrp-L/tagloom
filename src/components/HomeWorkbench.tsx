import { AlertCircle, CheckCircle2, FolderPlus, ImageOff, Images, Layers3, PauseCircle, Play, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { mediaUrl } from "../api";
import { formatDate, formatDuration } from "../lib/format";
import type { Asset, HomeSnapshot, JobProgress } from "../types";

export type HomeWorkbenchState = "idle" | "running" | "paused" | "error" | "complete";

export function resolveHomeWorkbenchState(job?: JobProgress): HomeWorkbenchState {
  if (job?.status === "running") return "running";
  if (job?.status === "paused") return "paused";
  if (job?.status === "error") return "error";
  if (job?.status === "complete") return "complete";
  return "idle";
}

export function resolveHomeWorkbenchProgress(job?: JobProgress): number {
  if (!job || job.total <= 0) return 0;
  return Math.min(1, Math.max(0, job.completed / job.total));
}

interface Props {
  snapshot?: HomeSnapshot;
  loading: boolean;
  error?: string;
  hasSources: boolean;
  job?: JobProgress;
  focusedAssetId?: string;
  onOpenCollection: (id: string) => void;
  onCreateCollection: () => void;
  onAddSource: () => void;
  onFocus: (asset?: Asset) => void;
  onPreview: (asset: Asset, context: Asset[]) => void;
}

const stateIcon = {
  idle: Images,
  running: RefreshCw,
  paused: PauseCircle,
  error: AlertCircle,
  complete: CheckCircle2,
};

export function HomeWorkbench(props: Props) {
  const { t } = useTranslation();
  const recentContext = props.snapshot?.collections[0];
  const recentImported = props.snapshot?.recentImported.slice(0, 3) ?? [];
  const scanState = resolveHomeWorkbenchState(props.job);
  const progress = resolveHomeWorkbenchProgress(props.job);
  const ScanIcon = stateIcon[scanState];
  const scanLabel = scanState === "running"
    ? t("scanning", { completed: props.job?.completed ?? 0, total: props.job?.total || "—" })
    : scanState === "paused"
      ? t("loomPaused", { defaultValue: "扫描已暂停" })
      : scanState === "error"
        ? props.job?.message || t("loomError", { defaultValue: "扫描出现问题" })
        : scanState === "complete"
          ? t("scanReady", { defaultValue: "索引已更新" })
          : t("indexReady", { defaultValue: "已更新" });

  return (
    <section className="homeWorkbench" aria-label={t("homeWorkbench", { defaultValue: "视觉工作台" })}>
      <div className="homeWorkbenchContext">
        <header className="homeWorkbenchHeader">
          <div>
            <span className="homeWorkbenchEyebrow">{t("recentContext", { defaultValue: "最近上下文" })}</span>
            <h2>{t("continueOrganizing", { defaultValue: "继续整理" })}</h2>
          </div>
        </header>

        {props.loading ? (
          <div className="homeWorkbenchContextLoading" aria-label={t("scanning", { completed: 0, total: "—" })}><span /></div>
        ) : props.error ? (
          <div className="homeWorkbenchEmpty errorState"><AlertCircle size={22} /><span>{props.error}</span></div>
        ) : recentContext ? (
          <button className="homeWorkbenchContextAction tactile" type="button" data-home-action onClick={() => props.onOpenCollection(recentContext.id)}>
            <span className="homeWorkbenchCover">
              {recentContext.coverAsset?.thumbnailPath ? (
                <motion.img key={recentContext.coverAsset.thumbnailPath} src={mediaUrl(recentContext.coverAsset.thumbnailPath)} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} />
              ) : (
                <span className="homeWorkbenchCoverPlaceholder" aria-hidden="true"><Layers3 size={30} /></span>
              )}
              {recentContext.coverAsset?.mediaKind === "video" ? <span className="homeCoverVideo"><Play size={11} fill="currentColor" /></span> : null}
            </span>
            <span className="homeWorkbenchContextCopy">
              <strong>{recentContext.name}</strong>
              <small>{t("items", { count: recentContext.assetCount })}</small>
              <span>{t("continueOrganizing", { defaultValue: "继续整理" })}</span>
            </span>
          </button>
        ) : (
          <button className="homeWorkbenchEmpty tactile" type="button" data-home-action onClick={props.onCreateCollection}>
            <Layers3 size={24} />
            <strong>{t("newCollection")}</strong>
          </button>
        )}
      </div>

      <div className="homeWorkbenchActivity">
        <section className="homeWorkbenchImports" aria-labelledby="home-workbench-imports-title">
          <header className="homeWorkbenchHeader">
            <div>
              <span className="homeWorkbenchEyebrow">{t("latestArrival", { defaultValue: "最新进入" })}</span>
              <h2 id="home-workbench-imports-title">{t("recentImported")}</h2>
            </div>
          </header>
          {recentImported.length ? (
            <div className="homeWorkbenchImportGrid">
              {recentImported.map((asset) => (
                <button key={asset.id} className={`homeWorkbenchAsset tactile ${props.focusedAssetId === asset.id ? "focused" : ""}`} type="button" data-home-action onClick={() => props.onFocus(asset)} onDoubleClick={() => props.onPreview(asset, props.snapshot?.recentImported ?? [])} onKeyDown={(event) => { if (event.key === "Enter") props.onPreview(asset, props.snapshot?.recentImported ?? []); }}>
                  <span className="homeWorkbenchAssetThumb">
                    {asset.thumbnailPath ? <img src={mediaUrl(asset.thumbnailPath)} alt="" loading="lazy" decoding="async" /> : <ImageOff size={18} />}
                    {asset.mediaKind === "video" ? <span className="durationBadge"><Play size={10} fill="currentColor" />{formatDuration(asset.durationMs)}</span> : null}
                  </span>
                  <span className="homeWorkbenchAssetCopy"><strong title={asset.filename}>{asset.filename}</strong><small>{formatDate(asset.capturedAt || asset.modifiedAt)}</small></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="homeWorkbenchEmpty homeWorkbenchImportsEmpty"><ImageOff size={20} /><span>{t("noRecentImported", { defaultValue: "新导入的素材会出现在这里。" })}</span></div>
          )}
        </section>

        <section className="homeWorkbenchIndex" data-state={scanState} aria-labelledby="home-workbench-index-title">
          <div className="homeWorkbenchIndexStatus">
            <span className="homeWorkbenchStatusIcon" aria-hidden="true"><ScanIcon size={16} /></span>
            <div><h2 id="home-workbench-index-title">{t("indexStatus")}</h2><p>{scanLabel}</p></div>
          </div>
          {scanState === "running" ? (
            <div className="homeWorkbenchProgress" role="progressbar" aria-label={scanLabel} aria-valuemin={0} aria-valuemax={props.job?.total || undefined} aria-valuenow={props.job?.total ? props.job.completed : undefined}>
              <span style={{ transform: `scaleX(${progress})` }} />
            </div>
          ) : null}
          {!props.hasSources ? (
            <button className="homeWorkbenchAddSource tactile" type="button" data-home-action onClick={props.onAddSource}><FolderPlus size={16} />{t("addFolder")}</button>
          ) : null}
        </section>
      </div>
    </section>
  );
}
