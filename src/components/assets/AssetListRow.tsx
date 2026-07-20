import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SelectionMode } from "../../features/selection/selectionModel";
import { formatBytes, formatDate } from "../../lib/format";
import type { Asset } from "../../types";
import { AssetContextMenu } from "../AssetContextMenu";
import type { AssetActions, CollectionContext } from "./AssetActions";
import { AssetSelectionControl } from "./AssetSelectionControl";
import { AssetThumbnail } from "./AssetThumbnail";

interface Props {
  asset: Asset;
  selectionMode: SelectionMode;
  focused: boolean;
  checked: boolean;
  checkedIds: string[];
  collectionContext?: CollectionContext;
  actions: AssetActions;
  onAssetKeyDown: (event: KeyboardEvent<HTMLElement>, asset: Asset) => void;
  onControlKeyDown: (event: KeyboardEvent<HTMLButtonElement>, assetId: string) => void;
}

export function AssetListRow(props: Props) {
  const { t } = useTranslation();
  const { asset, actions } = props;

  return (
    <AssetContextMenu
      asset={asset}
      selectionMode={props.selectionMode}
      checkedIds={props.checkedIds}
      collectionContext={props.collectionContext}
      onFocus={actions.focus}
      onPreview={actions.preview}
      onOpen={actions.open}
      onReveal={actions.reveal}
      onRename={actions.rename}
      onMove={actions.move}
      onTrash={actions.trash}
      onSetCollectionCover={actions.setCollectionCover}
      onClearCollectionCover={actions.clearCollectionCover}
    >
      <div
        data-asset-id={asset.id}
        className={`assetListItem ${props.selectionMode === "browse" && props.focused ? "focused" : ""} ${props.selectionMode === "batch" && props.checked ? "checked" : ""}`}
        tabIndex={0}
        onDoubleClick={() => { if (props.selectionMode === "browse") actions.preview(asset); }}
        onKeyDown={(event) => props.onAssetKeyDown(event, asset)}
      >
        <div className="listSelectionSlot">
          <AssetSelectionControl
            variant="list"
            visible={props.selectionMode === "batch"}
            checked={props.checked}
            label={t("toggleSelection", { name: asset.filename })}
            onKeyDown={(event) => props.onControlKeyDown(event, asset.id)}
          />
        </div>
        <AssetThumbnail asset={asset} variant="list" />
        <strong title={asset.filename}>{asset.filename}</strong>
        <span>{asset.mediaKind === "video" ? t("videos") : t("images")}</span>
        <span>{formatBytes(asset.byteSize)}</span>
        <span>{formatDate(asset.modifiedAt)}</span>
        <div className="miniTags">
          {asset.tags.slice(0, 4).map((tag) => <i key={tag.id} style={{ background: tag.color }} title={tag.name} />)}
        </div>
      </div>
    </AssetContextMenu>
  );
}
