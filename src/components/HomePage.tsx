import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronRight, FolderPlus, ImageOff, Layers3, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { mediaUrl } from "../api";
import { formatDate, formatDuration } from "../lib/format";
import type { Asset, HomeSnapshot, JobProgress } from "../types";
import { HomeWorkbench } from "./HomeWorkbench";

type RecentKind = "viewed" | "imported" | "modified";

interface Props {
  snapshot?: HomeSnapshot;
  loading: boolean;
  error?: string;
  hasSources: boolean;
  job?: JobProgress;
  focusedAssetId?: string;
  onOpenCollection: (id: string) => void;
  onViewCollections: () => void;
  onCreateCollection: () => void;
  onAddSource: () => void;
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
  useEffect(() => { localStorage.setItem(HOME_SECTION_STATE_KEY, JSON.stringify(sections)); }, [sections]);
  const toggleSection = (section: "collections" | "recent") => setSections((state) => ({ ...state, [section]: !state[section] }));

  return (
    <div className="homePage" onClick={(event) => { if (!(event.target as Element).closest("[data-home-action]")) props.onFocus(); }}>
      <HomeWorkbench snapshot={props.snapshot} loading={props.loading} error={props.error} hasSources={props.hasSources} job={props.job} focusedAssetId={props.focusedAssetId}
        onOpenCollection={props.onOpenCollection} onCreateCollection={props.onCreateCollection} onAddSource={props.onAddSource} onFocus={props.onFocus} onPreview={props.onPreview} />
      <section className="homeSection collectionHomeSection">
        <div className="homeSectionHeading">
          <button className="homeSectionToggle tactile" type="button" data-home-action aria-expanded={sections.collections} aria-label={t("myCollections")} onClick={() => toggleSection("collections")}>
            <h2>{t("myCollections")}</h2>{sections.collections ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
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
                    {collection.coverAsset?.thumbnailPath ? <motion.img key={collection.coverAsset.thumbnailPath} src={mediaUrl(collection.coverAsset.thumbnailPath)} alt="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }} /> : <span className="homeCoverPlaceholder" aria-hidden="true"><Layers3 size={24} /></span>}
                    {collection.coverAsset?.mediaKind === "video" && <span className="homeCoverVideo"><Play size={11} fill="currentColor" /></span>}
                  </span>
                  <span className="homeCollectionMeta"><strong>{collection.name}</strong><small>{t("items", { count: collection.assetCount })}</small></span>
                </button>)}
              </div>
            ) : <button className="homeEmptyCollection tactile" data-home-action onClick={props.onCreateCollection}><Layers3 size={24} /><strong>{t("newCollection")}</strong></button>}
          </motion.div>}
        </AnimatePresence>
      </section>

      <section className="homeSection recentHomeSection">
        <div className="homeSectionHeading recentHeading">
          <button className="homeSectionToggle tactile" type="button" data-home-action aria-expanded={sections.recent} aria-label={t("recentAssets")} onClick={() => toggleSection("recent")}>
            <h2>{t("recentAssets")}</h2>{sections.recent ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
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
