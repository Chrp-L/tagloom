import * as ContextMenu from "@radix-ui/react-context-menu";
import { ExternalLink, Eye, FolderInput, FolderSearch, GalleryHorizontalEnd, Pencil, Trash2 } from "lucide-react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { getAssetContextTargets } from "../features/selection/selectionModel";
import type { SelectionMode } from "../features/selection/selectionModel";
import type { Asset } from "../types";

interface Props {
  asset: Asset;
  selectionMode: SelectionMode;
  checkedIds: string[];
  collectionContext?: { id: string; coverAssetId?: string };
  children: ReactElement;
  onFocus: (assetId: string) => void;
  onPreview: (asset: Asset) => void;
  onOpen: (asset: Asset) => void;
  onReveal: (asset: Asset) => void;
  onRename: (asset: Asset) => void;
  onMove: (asset: Asset) => void;
  onTrash: (assetIds: string[]) => void;
  onSetCollectionCover?: (collectionId: string, assetId: string) => void;
  onClearCollectionCover?: (collectionId: string) => void;
}

export function AssetContextMenu(props: Props) {
  const { t } = useTranslation();
  const targetIds = getAssetContextTargets(props.selectionMode, props.checkedIds, props.asset.id);
  const multiple = targetIds.length > 1;
  const showCoverAction = props.selectionMode === "browse" && Boolean(props.collectionContext);
  const isCustomCover = props.collectionContext?.coverAssetId === props.asset.id;

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        asChild
        onContextMenu={() => {
          if (props.selectionMode === "browse") props.onFocus(props.asset.id);
        }}
        onKeyDown={(event) => {
          if (!((event.key === "F10" && event.shiftKey) || ["ContextMenu", "Menu", "Apps"].includes(event.key))) return;
          event.preventDefault();
          const target = event.currentTarget;
          const rect = target.getBoundingClientRect();
          target.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            button: 2,
            clientX: rect.left + Math.min(18, rect.width / 2),
            clientY: rect.top + Math.min(18, rect.height / 2),
          }));
        }}
      >
        {props.children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menuContent assetContextMenu" collisionPadding={8} loop aria-label={t("moreActions", { name: props.asset.filename })}>
          <ContextMenu.Item className="menuItem" onSelect={() => props.onPreview(props.asset)}><Eye size={15} />{t("preview")}</ContextMenu.Item>
          <ContextMenu.Item className="menuItem" onSelect={() => props.onOpen(props.asset)}><ExternalLink size={15} />{t("openExternal")}</ContextMenu.Item>
          <ContextMenu.Item className="menuItem" onSelect={() => props.onReveal(props.asset)}><FolderSearch size={15} />{t("reveal")}</ContextMenu.Item>
          {showCoverAction && <ContextMenu.Item className="menuItem" onSelect={() => {
            if (!props.collectionContext) return;
            if (isCustomCover) props.onClearCollectionCover?.(props.collectionContext.id);
            else props.onSetCollectionCover?.(props.collectionContext.id, props.asset.id);
          }}><GalleryHorizontalEnd size={15} />{t(isCustomCover ? "clearCollectionCover" : "setCollectionCover")}</ContextMenu.Item>}
          <ContextMenu.Separator className="menuSeparator" />
          <ContextMenu.Item className="menuItem" disabled={multiple} onSelect={() => props.onRename(props.asset)}>
            <Pencil size={15} />{t("rename")}{multiple && <span className="menuHint">{t("singleItemOnly")}</span>}
          </ContextMenu.Item>
          <ContextMenu.Item className="menuItem" disabled={multiple} onSelect={() => props.onMove(props.asset)}>
            <FolderInput size={15} />{t("move")}{multiple && <span className="menuHint">{t("singleItemOnly")}</span>}
          </ContextMenu.Item>
          <ContextMenu.Separator className="menuSeparator" />
          <ContextMenu.Item className="menuItem danger" onSelect={() => props.onTrash(targetIds)}>
            <Trash2 size={15} />{multiple ? t("trashCount", { count: targetIds.length }) : t("trash")}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
