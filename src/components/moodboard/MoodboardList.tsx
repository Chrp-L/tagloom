import * as Tooltip from "@radix-ui/react-tooltip";
import { AlertCircle, ImageOff, Layers3, Pencil, Plus, Trash2, Video } from "lucide-react";
import type { ReactNode } from "react";
import { mediaUrl } from "../../api";
import { formatDate } from "../../lib/format";
import type { Asset, MoodboardSummary } from "../../types";
import "../../styles/moodboard-list.css";

export interface MoodboardLabels {
  heading: string;
  create: string;
  open: string;
  rename: string;
  delete: string;
  boardsCount: (count: number) => string;
  nodesCount: (count: number) => string;
  updated: (date: string) => string;
  loading: string;
  error: string;
  emptyTitle: string;
  emptyDescription: string;
}

export const defaultMoodboardLabels: MoodboardLabels = {
  heading: "Moodboards",
  create: "New moodboard",
  open: "Open moodboard",
  rename: "Rename moodboard",
  delete: "Delete moodboard",
  boardsCount: (count) => `${count} moodboard${count === 1 ? "" : "s"}`,
  nodesCount: (count) => `${count} element${count === 1 ? "" : "s"}`,
  updated: (date) => `Updated ${date}`,
  loading: "Loading moodboards",
  error: "Moodboards could not be loaded.",
  emptyTitle: "Start a moodboard",
  emptyDescription: "Collect references, colour, and notes for this context.",
};

interface MoodboardListProps {
  collectionName: string;
  boards: MoodboardSummary[];
  loading: boolean;
  error?: string | null;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onRename: (board: MoodboardSummary) => void;
  onDelete: (board: MoodboardSummary) => void;
  labels?: Partial<MoodboardLabels>;
}

function mergeLabels(labels?: Partial<MoodboardLabels>): MoodboardLabels {
  return { ...defaultMoodboardLabels, ...labels };
}

function MoodboardCollage({ assets }: { assets: Asset[] }) {
  const previewAssets = assets.slice(0, 3);
  if (previewAssets.length === 0) {
    return <span className="moodboardCollage empty" aria-hidden="true"><Layers3 size={22} /></span>;
  }

  return <span className={`moodboardCollage count-${previewAssets.length}`} aria-hidden="true">
    {previewAssets.map((asset) => {
      const source = mediaUrl(asset.thumbnailPath);
      return <span key={asset.id} className="moodboardCollageTile">
        {source ? <img src={source} alt="" loading="lazy" decoding="async" /> : <ImageOff size={16} />}
        {asset.mediaKind === "video" ? <Video className="moodboardCollageVideo" size={11} fill="currentColor" /> : null}
      </span>;
    })}
  </span>;
}

function IconAction({ label, children, onClick, danger = false }: { label: string; children: ReactNode; onClick: () => void; danger?: boolean }) {
  return <Tooltip.Root><Tooltip.Trigger asChild>
    <button type="button" className={`moodboardIconAction tactile${danger ? " danger" : ""}`} aria-label={label} onClick={onClick}>{children}</button>
  </Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltipContent" side="top" sideOffset={7}>{label}<Tooltip.Arrow className="tooltipArrow" /></Tooltip.Content></Tooltip.Portal></Tooltip.Root>;
}

function BoardRow({ board, labels, onOpen, onRename, onDelete }: { board: MoodboardSummary; labels: MoodboardLabels; onOpen: () => void; onRename: () => void; onDelete: () => void }) {
  const updatedAt = formatDate(board.updatedAt);
  return <article className="moodboardRow">
    <button type="button" className="moodboardRowOpen tactile" onClick={onOpen} aria-label={`${labels.open}: ${board.name}`}>
      <MoodboardCollage assets={board.previewAssets} />
      <span className="moodboardRowCopy">
        <strong>{board.name}</strong>
        <small>{labels.nodesCount(board.nodeCount)} <i aria-hidden="true" /> {labels.updated(updatedAt)}</small>
      </span>
    </button>
    <div className="moodboardRowActions" aria-label={`${board.name} actions`}>
      <IconAction label={`${labels.rename}: ${board.name}`} onClick={onRename}><Pencil size={15} /></IconAction>
      <IconAction label={`${labels.delete}: ${board.name}`} onClick={onDelete} danger><Trash2 size={15} /></IconAction>
    </div>
  </article>;
}

export function MoodboardList({ collectionName, boards, loading, error, onOpen, onCreate, onRename, onDelete, labels: labelsOverride }: MoodboardListProps) {
  const labels = mergeLabels(labelsOverride);

  return <section className="moodboardList" aria-labelledby="moodboard-list-heading">
    <header className="moodboardListHeader">
      <div>
        <p>{collectionName}</p>
        <h1 id="moodboard-list-heading">{labels.heading}</h1>
        {!loading && !error ? <span>{labels.boardsCount(boards.length)}</span> : null}
      </div>
      <IconAction label={labels.create} onClick={onCreate}><Plus size={18} /></IconAction>
    </header>

    {loading ? <div className="moodboardListState" role="status"><span className="moodboardLoadingMark" aria-hidden="true" />{labels.loading}</div> : null}
    {!loading && error ? <div className="moodboardListState error" role="alert"><AlertCircle size={17} aria-hidden="true" />{error || labels.error}</div> : null}
    {!loading && !error && boards.length === 0 ? <div className="moodboardEmptyState">
      <span className="moodboardEmptyMark" aria-hidden="true"><Layers3 size={25} /></span>
      <div><h2>{labels.emptyTitle}</h2><p>{labels.emptyDescription}</p></div>
      <button type="button" className="primaryButton tactile" onClick={onCreate}><Plus size={16} />{labels.create}</button>
    </div> : null}
    {!loading && !error && boards.length > 0 ? <div className="moodboardRows" aria-label={labels.heading}>
      {boards.map((board) => <BoardRow key={board.id} board={board} labels={labels} onOpen={() => onOpen(board.id)} onRename={() => onRename(board)} onDelete={() => onDelete(board)} />)}
    </div> : null}
  </section>;
}
