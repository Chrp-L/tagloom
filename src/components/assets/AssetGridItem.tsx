import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../lib/format";
import type { SelectionMode } from "../../features/selection/selectionModel";
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
  dropTarget: boolean;
  woven: boolean;
  collectionContext?: CollectionContext;
  actions: AssetActions;
  onAssetKeyDown: (event: KeyboardEvent<HTMLElement>, asset: Asset) => void;
  onControlKeyDown: (event: KeyboardEvent<HTMLButtonElement>, assetId: string) => void;
}

export function AssetGridItem(props: Props) {
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
      <article
        data-asset-id={asset.id}
        className={`assetTile ${props.selectionMode === "browse" && props.focused ? "focused" : ""} ${props.selectionMode === "batch" && props.checked ? "checked" : ""} ${props.dropTarget ? "dragTarget" : ""}`}
        tabIndex={0}
        onDoubleClick={() => { if (props.selectionMode === "browse") actions.preview(asset); }}
        onKeyDown={(event) => props.onAssetKeyDown(event, asset)}
      >
        <AssetThumbnail asset={asset} variant="grid" woven={props.woven}>
          <AssetSelectionControl
            variant="grid"
            visible={props.selectionMode === "batch"}
            checked={props.checked}
            label={t("toggleSelection", { name: asset.filename })}
            onKeyDown={(event) => props.onControlKeyDown(event, asset.id)}
          />
        </AssetThumbnail>
        <div className="assetCaption">
          <div>
            <strong title={asset.filename}>{asset.filename}</strong>
            <span>{formatDate(asset.capturedAt || asset.modifiedAt)}</span>
          </div>
          <div className="miniTags">
            {asset.tags.slice(0, 3).map((tag) => <i key={tag.id} style={{ background: tag.color }} title={tag.name} />)}
          </div>
        </div>
      </article>
    </AssetContextMenu>
  );
}
