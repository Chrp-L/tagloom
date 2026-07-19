import { AnimatePresence, motion } from "motion/react";
import { Film, ImageOff, Play } from "lucide-react";
import { useState, type ReactNode } from "react";
import { mediaUrl } from "../../api";
import { formatDuration } from "../../lib/format";
import type { Asset } from "../../types";

function ThumbnailImage({ src, draggable = true }: { src: string; draggable?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={`thumbnailLoader ${loaded ? "loaded" : ""}`}>
      <img
        src={src}
        alt=""
        draggable={draggable}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
      />
    </span>
  );
}

interface Props {
  asset: Asset;
  variant: "grid" | "list";
  woven?: boolean;
  children?: ReactNode;
}

export function AssetThumbnail({ asset, variant, woven = false, children }: Props) {
  const thumbnail = asset.thumbnailPath ? mediaUrl(asset.thumbnailPath) || "" : undefined;

  if (variant === "list") {
    return (
      <div className="listThumb">
        {thumbnail ? <ThumbnailImage key={asset.thumbnailPath} src={thumbnail} /> : <ImageOff size={17} />}
        {asset.mediaKind === "video" && <Film size={12} />}
      </div>
    );
  }

  return (
    <div className="assetThumb" style={{ aspectRatio: "4 / 3" }}>
      {thumbnail ? (
        <ThumbnailImage key={asset.thumbnailPath} src={thumbnail} draggable={false} />
      ) : (
        <div className="thumbFallback"><ImageOff size={22} /></div>
      )}
      {children}
      {asset.mediaKind === "video" && (
        <span className="durationBadge"><Play size={10} fill="currentColor" />{formatDuration(asset.durationMs)}</span>
      )}
      <AnimatePresence>
        {woven && (
          <motion.span
            className="weaveTrace"
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
