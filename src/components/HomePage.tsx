import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronRight, FolderPlus, ImageOff, Images, Layers3, Play, Video } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { mediaUrl } from "../api";
import { formatDate, formatDuration } from "../lib/format";
import type { Asset, HomeSnapshot, JobProgress } from "../types";
import { HomeLoomWidget, resolveHomeLoomState } from "./HomeLoomWidget";

type RecentKind = "viewed" | "imported" | "modified";

interface Props {
  snapshot?: HomeSnapshot;
  loading: boolean;
  error?: string;
  summary?: { total: number; images: number; videos: number; collections: number };
  job?: JobProgress;
  focusedAssetId?: string;
  onOpenCollection: (id: string) => void;
  onViewCollections: () => void;
  onCreateCollection: () => void;
  onFocus: (asset?: Asset) => void;
  onPreview: (asset: Asset, context: Asset[]) => void;
}

const HOME_SECTION_STATE_KEY = "tagloom-home-section-state";

function readSectionState() {
  try {
    const stored = JSON.parse(localStorage.getItem(HOME_SECTION_STATE_KEY) || "null") as { collections?: unknown; recent?: unknown } | null;
    return { collections: stored?.collections !== false, recent: stored?.recent !== false };
  } catch {
    return { collections: true, recent: true };
  }
}

export function HomePage(props: Props) {
  const { t } = useTranslation();
  const [recentKind, setRecentKind] = useState<RecentKind>("viewed");
  const [sections, setSections] = useState(readSectionState);
  const recentAssets = useMemo(() => {
    if (!props.snapshot) return [];
    if (recentKind === "viewed") return props.snapshot.recentViewed;
    if (recentKind === "imported") return props.snapshot.recentImported;
    return props.snapshot.recentModified;
  }, [props.snapshot, recentKind]);
  const visibleRecent = recentAssets.slice(0, 5);
  const loomState = resolveHomeLoomState(props.job);
  const loomStatus = loomState === "scanning"
    ? t("scanning", { completed: props.job?.completed ?? 0, total: props.job?.total || "—", defaultValue: "正在整理 {{completed}} / {{total}}" })
    : t(loomState === "paused" ? "loomPaused" : loomState === "error" ? "loomError" : "indexReady", { defaultValue: loomState === "paused" ? "扫描已暂停" : loomState === "error" ? "扫描出现问题" : "已更新" });
  useEffect(() => { localStorage.setItem(HOME_SECTION_STATE_KEY, JSON.stringify(sections)); }, [sections]);
  const toggleSection = (section: "collections" | "recent") => setSections((state) => ({ ...state, [section]: !state[section] }));

  return (
    <div className="homePage" onClick={(event) => { if (!(event.target as Element).closest("[data-home-action]")) props.onFocus(); }}>
      <section className="homeDashboardPulse" aria-label={t("home")}>
        <div className="homePulseLead"><HomeLoomWidget job={props.job} /><div className="homePulseCopy"><strong>{t("homeLoom", { defaultValue: "素材织机" })}</strong><small>{loomStatus}</small></div></div>
        <div className="homePulseMetric"><Images size={15} aria-hidden="true" /><span>{t("allItems")}</span><strong>{props.summary?.total ?? 0}</strong></div>
        <div className="homePulseMetric"><Images size={15} aria-hidden="true" /><span>{t("images")}</span><strong>{props.summary?.images ?? 0}</strong></div>
        <div className="homePulseMetric"><Video size={15} aria-hidden="true" /><span>{t("videos")}</span><strong>{props.summary?.videos ?? 0}</strong></div>
        <div className="homePulseMetric"><Layers3 size={15} aria-hidden="true" /><span>{t("collections")}</span><strong>{props.summary?.collections ?? props.snapshot?.collections.length ?? 0}</strong></div>
      </section>
      <section className="homeSection collectionHomeSection">
        <div className="homeSectionHeading">
          <button className="homeSectionToggle tactile" type="button" data-home-action aria-expanded={sections.collections} aria-label={t("myCollections")} onClick={() => toggleSection("collections")}>
            <span className="homeCable" aria-hidden="true"><i /><b /></span><h2>{t("myCollections")}</h2>{sections.collections ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <div className="homeSectionActions">
            <button className="textButton tactile" data-home-action onClick={props.onViewCollections}>{t("viewAll")}</button>
            <button className="iconButton tactile" data-home-action title={t("newCollection")} aria-label={t("newCollection")} onClick={props.onCreateCollection}><FolderPlus size={17} /></button>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {sections.collections && <motion.div className="homeSectionBody" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }}>
            {props.loading ? <div className="homeCollectionGrid homeLoadingGrid">{Array.from({ length: 3 }, (_, index) => <span key={index} />)}</div> : props.error ? <div className="homeInlineState errorState"><ImageOff size={22} /><span>{props.error}</span></div> : props.snapshot?.collections.length ? (
              <div className="homeCollectionGrid">
                {props.snapshot.collections.slice(0, 6).map((collection) => <button key={collection.id} className="homeCollectionCard tactile" data-home-action onClick={() => props.onOpenCollection(collection.id)}>
                  <span className="homeCollectionCover">
                    {collection.coverAsset?.thumbnailPath ? <motion.img key={collection.coverAsset.thumbnailPath} src={mediaUrl(collection.coverAsset.thumbnailPath)} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} /> : <span className="homeCoverPlaceholder" aria-hidden="true"><i /><i /><b /></span>}
                    {collection.coverAsset?.mediaKind === "video" && <span className="homeCoverVideo"><Play size={11} fill="currentColor" /></span>}
                  </span>
                  <span className="homeCollectionMeta"><strong>{collection.name}</strong><small>{t("items", { count: collection.assetCount })}</small></span>
                  <span className="homeCardCable" aria-hidden="true"><i /><b /></span>
                </button>)}
              </div>
            ) : <button className="homeEmptyCollection tactile" data-home-action onClick={props.onCreateCollection}><Layers3 size={24} /><strong>{t("newCollection")}</strong></button>}
          </motion.div>}
        </AnimatePresence>
      </section>

      <section className="homeSection recentHomeSection">
        <div className="homeSectionHeading recentHeading">
          <button className="homeSectionToggle tactile" type="button" data-home-action aria-expanded={sections.recent} aria-label={t("recentAssets")} onClick={() => toggleSection("recent")}>
            <span className="homeCable recent" aria-hidden="true"><i /><b /></span><h2>{t("recentAssets")}</h2>{sections.recent ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
          <div className="homeRecentTabs" role="tablist" aria-label={t("recentAssets")}>
            {(["viewed", "imported", "modified"] as RecentKind[]).map((kind) => <button key={kind} type="button" role="tab" data-home-action aria-selected={recentKind === kind} onClick={() => setRecentKind(kind)}>{recentKind === kind && <motion.span layoutId="home-recent-tab" className="homeRecentTabPlate" />}<span>{t(kind === "viewed" ? "recentViewed" : kind === "imported" ? "recentImported" : "recentModified")}</span></button>)}
          </div>
        </div>
        <AnimatePresence initial={false}>
          {sections.recent && <motion.div className="homeSectionBody" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={recentKind} className="homeRecentGrid" initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -4 }} transition={{ duration: 0.16 }}>
                {visibleRecent.length ? visibleRecent.map((asset) => <button key={asset.id} className={`homeAssetCard tactile ${props.focusedAssetId === asset.id ? "focused" : ""}`} data-home-action onClick={() => props.onFocus(asset)} onDoubleClick={() => props.onPreview(asset, recentAssets)} onKeyDown={(event) => { if (event.key === "Enter") props.onPreview(asset, recentAssets); }}>
                  <span className="homeAssetThumb">{asset.thumbnailPath ? <img src={mediaUrl(asset.thumbnailPath)} alt="" loading="lazy" decoding="async" /> : <ImageOff size={20} />}{asset.mediaKind === "video" && <span className="durationBadge"><Play size={10} fill="currentColor" />{formatDuration(asset.durationMs)}</span>}</span>
                  <strong title={asset.filename}>{asset.filename}</strong>
                  <small>{formatDate(asset.capturedAt || asset.modifiedAt)}</small>
                </button>) : <div className="homeInlineState recentEmpty"><ImageOff size={22} /><span>{recentKind === "viewed" ? t("noRecentViewed") : t("emptyBody")}</span></div>}
              </motion.div>
            </AnimatePresence>
          </motion.div>}
        </AnimatePresence>
      </section>
    </div>
  );
}
