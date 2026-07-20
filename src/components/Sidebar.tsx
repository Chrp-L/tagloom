import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ChevronDown, Folder, FolderOpen, House, Image, Layers3, Library, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Tags, Trash2, Video } from "lucide-react";
import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Collection, LibraryBootstrap, SourceRoot, Tag } from "../types";
import type { CollapsedSections, NavigationFilter, SidebarSection } from "../store";
import { Logo } from "./Logo";
import { isInteractiveWindowTarget, toggleCurrentWindowMaximize } from "../lib/windowControls";

interface SidebarProps {
  data?: LibraryBootstrap;
  navigation: NavigationFilter;
  collapsed: boolean;
  collapsedSections: CollapsedSections;
  eventCue?: number;
  onCollapsedChange: (collapsed: boolean) => void;
  onToggleSection: (section: SidebarSection) => void;
  onRevealSection: (section: SidebarSection) => void;
  onNavigate: (value: NavigationFilter) => void;
  onAddSource: () => void;
  onCreateTag: () => void;
  onCreateCollection: () => void;
  onRescan: (id: string) => void;
  onRemoveSource: (source: SourceRoot) => void;
  onDeleteCollection: (collection: Collection) => void;
  onDeleteTag: (tag: Tag) => void;
  onTagPointerDown: (tag: Tag, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onTagActivate: (tagId: string) => void;
}

function RailButton({ label, active = false, children, onClick }: { label: string; active?: boolean; children: ReactNode; onClick: () => void }) {
  return <Tooltip.Root><Tooltip.Trigger asChild><button className={`railButton ${active ? "active" : ""}`} aria-label={label} aria-current={active ? "page" : undefined} onClick={onClick}>{active && <ActivePlate compact />}<span className="railButtonContent">{children}</span></button></Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Content className="tooltipContent" side="right" sideOffset={9}>{label}<Tooltip.Arrow className="tooltipArrow" /></Tooltip.Content></Tooltip.Portal>
  </Tooltip.Root>;
}

function ActivePlate({ compact = false }: { compact?: boolean }) {
  return <motion.span className={`navActivePlate ${compact ? "compact" : ""}`} layoutId="sidebar-active-plate" transition={{ type: "spring", stiffness: 520, damping: 40 }} aria-hidden="true" />;
}

export function Sidebar(props: SidebarProps) {
  const { t } = useTranslation();
  const sectionRefs = {
    sources: useRef<HTMLElement>(null),
    collections: useRef<HTMLElement>(null),
    tags: useRef<HTMLElement>(null),
  };
  const active = (kind: NavigationFilter["kind"], id?: string) => props.navigation.kind === kind && (id === undefined || "id" in props.navigation && props.navigation.id === id);
  const revealSection = (section: SidebarSection) => {
    props.onRevealSection(section);
    window.setTimeout(() => sectionRefs[section].current?.scrollIntoView({ block: "nearest" }), 250);
  };
  const sectionBody = (section: SidebarSection, content: ReactNode) => <AnimatePresence initial={false}>{!props.collapsedSections[section] &&
    <motion.div className="navSectionContent" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>{content}</motion.div>}
  </AnimatePresence>;

  if (props.collapsed) return <LayoutGroup id="sidebar-navigation"><aside className="sidebar collapsed" aria-label={t("library")}>
    <div className="sidebarBrand compactBrand" data-tauri-drag-region onDoubleClick={(event) => { if (!isInteractiveWindowTarget(event.target)) void toggleCurrentWindowMaximize(); }}><Logo compact />{props.eventCue && <motion.span key={props.eventCue} className="sidebarBrandCue" initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: [0, 1, 0], scaleX: [0, 1, 0.45] }} transition={{ duration: 0.58 }} />}<button className="sidebarToggle tactile" aria-label={t("expandSidebar")} title={t("expandSidebar")} onClick={() => props.onCollapsedChange(false)}><PanelLeftOpen size={17} /></button></div>
    <nav className="railNav">
      <RailButton label={t("home")} active={active("home")} onClick={() => props.onNavigate({ kind: "home" })}><House size={18} /></RailButton>
      <RailButton label={t("allItems")} active={active("all")} onClick={() => props.onNavigate({ kind: "all" })}><Library size={18} /></RailButton>
      <RailButton label={t("images")} active={active("media") && props.navigation.kind === "media" && props.navigation.mediaKind === "image"} onClick={() => props.onNavigate({ kind: "media", mediaKind: "image" })}><Image size={18} /></RailButton>
      <RailButton label={t("videos")} active={active("media") && props.navigation.kind === "media" && props.navigation.mediaKind === "video"} onClick={() => props.onNavigate({ kind: "media", mediaKind: "video" })}><Video size={18} /></RailButton>
      <span className="railDivider" />
      <RailButton label={t("collections")} onClick={() => revealSection("collections")}><Layers3 size={18} /></RailButton>
      <RailButton label={t("tags")} onClick={() => revealSection("tags")}><Tags size={18} /></RailButton>
      <RailButton label={t("folders")} onClick={() => revealSection("sources")}><FolderOpen size={18} /></RailButton>
    </nav>
    <div className="sidebarFoot compactFoot"><span className="privacyPulse" /></div>
  </aside></LayoutGroup>;

  const heading = (section: SidebarSection, label: string, addLabel: string, onAdd: () => void) => <div className="sectionHeading">
    <button className="sectionToggle tactile" aria-expanded={!props.collapsedSections[section]} onClick={() => props.onToggleSection(section)}><ChevronDown className={props.collapsedSections[section] ? "collapsedChevron" : ""} size={14} /><span>{label}</span></button>
    <button className="iconButton tiny tactile" title={addLabel} aria-label={addLabel} onClick={onAdd}><Plus size={15} /></button>
  </div>;

  return <LayoutGroup id="sidebar-navigation"><aside className="sidebar">
    <div className="sidebarBrand" data-tauri-drag-region onDoubleClick={(event) => { if (!isInteractiveWindowTarget(event.target)) void toggleCurrentWindowMaximize(); }}><Logo />{props.eventCue && <motion.span key={props.eventCue} className="sidebarBrandCue" initial={{ opacity: 0, scaleX: 0 }} animate={{ opacity: [0, 1, 0], scaleX: [0, 1, 0.45] }} transition={{ duration: 0.58 }} />}<button className="sidebarToggle tactile" aria-label={t("collapseSidebar")} title={t("collapseSidebar")} onClick={() => props.onCollapsedChange(true)}><PanelLeftClose size={17} /></button></div>
    <nav className="sidebarScroll" aria-label={t("library")}>
      <section className="navSection">
        <h2>{t("workspace")}</h2>
        <button className={`navItem tactile ${active("home") ? "active" : ""}`} aria-current={active("home") ? "page" : undefined} onClick={() => props.onNavigate({ kind: "home" })}>{active("home") && <ActivePlate />}<House size={17} /><span>{t("home")}</span></button>
      </section>

      <section className="navSection">
        <h2>{t("library")}</h2>
        <button className={`navItem tactile ${active("all") ? "active" : ""}`} aria-current={active("all") ? "page" : undefined} onClick={() => props.onNavigate({ kind: "all" })}>{active("all") && <ActivePlate />}<Library size={17} /><span>{t("allItems")}</span><b>{props.data?.totalAssets ?? 0}</b></button>
        <button className={`navItem tactile ${active("media") && props.navigation.kind === "media" && props.navigation.mediaKind === "image" ? "active" : ""}`} aria-current={props.navigation.kind === "media" && props.navigation.mediaKind === "image" ? "page" : undefined} onClick={() => props.onNavigate({ kind: "media", mediaKind: "image" })}>{props.navigation.kind === "media" && props.navigation.mediaKind === "image" && <ActivePlate />}<Image size={17} /><span>{t("images")}</span><b>{props.data?.imageCount ?? 0}</b></button>
        <button className={`navItem tactile ${active("media") && props.navigation.kind === "media" && props.navigation.mediaKind === "video" ? "active" : ""}`} aria-current={props.navigation.kind === "media" && props.navigation.mediaKind === "video" ? "page" : undefined} onClick={() => props.onNavigate({ kind: "media", mediaKind: "video" })}>{props.navigation.kind === "media" && props.navigation.mediaKind === "video" && <ActivePlate />}<Video size={17} /><span>{t("videos")}</span><b>{props.data?.videoCount ?? 0}</b></button>
      </section>

      <section ref={sectionRefs.collections} className="navSection">
        {heading("collections", t("collections"), t("newCollection"), props.onCreateCollection)}
        {sectionBody("collections", props.data?.collections.map((collection) => <div key={collection.id} className="navItemWrap">
          <button className={`navItem tactile hasMenu ${active("collection", collection.id) ? "active" : ""}`} aria-current={active("collection", collection.id) ? "page" : undefined} onClick={() => props.onNavigate({ kind: "collection", id: collection.id })}>{active("collection", collection.id) && <ActivePlate />}<Folder size={16} /><span>{collection.name}</span><b>{collection.assetCount}</b></button>
          <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="navItemMenu tactile" aria-label={t("moreActions", { name: collection.name })}><MoreHorizontal size={15} /></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content className="menuContent" sideOffset={5}><DropdownMenu.Item className="menuItem danger" onSelect={() => props.onDeleteCollection(collection)}><Trash2 size={15} />{t("deleteCollection")}</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>))}
      </section>

      <section ref={sectionRefs.tags} className="navSection tagsSection">
        {heading("tags", t("tags"), t("newTag"), props.onCreateTag)}
        {sectionBody("tags", <>{props.data?.tags.map((tag) => <div key={tag.id} className="navItemWrap">
          <button className={`navItem tactile tagNav hasMenu ${active("tag", tag.id) ? "active" : ""}`} aria-current={active("tag", tag.id) ? "page" : undefined} onPointerDown={(event) => props.onTagPointerDown(tag, event)} onClick={() => props.onTagActivate(tag.id)}>{active("tag", tag.id) && <ActivePlate />}<span className="tagDot" style={{ background: tag.color }} /><span>{tag.name}</span><b>{tag.assetCount}</b></button>
          <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="navItemMenu tactile" aria-label={t("moreActions", { name: tag.name })}><MoreHorizontal size={15} /></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content className="menuContent" sideOffset={5}><DropdownMenu.Item className="menuItem danger" onSelect={() => props.onDeleteTag(tag)}><Trash2 size={15} />{t("deleteTag")}</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>)}{!props.data?.tags.length && <div className="navHint"><Tags size={15} />{t("newTag")}</div>}</>)}
      </section>

      <section ref={sectionRefs.sources} className="navSection">
        {heading("sources", t("folders"), t("addFolder"), props.onAddSource)}
        {sectionBody("sources", props.data?.sources.map((source) => <div key={source.id} className="navItemWrap">
          <button className={`navItem tactile hasMenu ${active("source", source.id) ? "active" : ""}`} aria-current={active("source", source.id) ? "page" : undefined} onClick={() => props.onNavigate({ kind: "source", id: source.id })}>{active("source", source.id) && <ActivePlate />}{source.status === "offline" ? <Folder size={17} /> : <FolderOpen size={17} />}<span title={source.path}>{source.name}</span><b>{source.assetCount}</b></button>
          <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="navItemMenu tactile" aria-label={t("moreActions", { name: source.name })}><MoreHorizontal size={15} /></button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content className="menuContent" sideOffset={5}><DropdownMenu.Item className="menuItem" onSelect={() => props.onRescan(source.id)}><RefreshCw size={15} />{t("rescan")}</DropdownMenu.Item><DropdownMenu.Separator className="menuSeparator" /><DropdownMenu.Item className="menuItem danger" onSelect={() => props.onRemoveSource(source)}><Trash2 size={15} />{t("removeSource")}</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>))}
      </section>
    </nav>
    <div className="sidebarFoot"><span className="privacyPulse" />Local only</div>
  </aside></LayoutGroup>;
}
