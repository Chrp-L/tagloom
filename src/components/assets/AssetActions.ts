import type { Asset } from "../../types";

export interface AssetActions {
  focus(assetId?: string): void;
  toggleChecked(assetId: string): void;
  checkRange(assetId: string): void;
  preview(asset: Asset): void;
  open(asset: Asset): void;
  reveal(asset: Asset): void;
  rename(asset: Asset): void;
  move(asset: Asset): void;
  trash(assetIds: string[]): void;
  setCollectionCover?(collectionId: string, assetId: string): void;
  clearCollectionCover?(collectionId: string): void;
}

export interface CollectionContext {
  id: string;
  coverAssetId?: string;
}
