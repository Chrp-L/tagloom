ALTER TABLE collections ADD COLUMN cover_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE assets ADD COLUMN last_viewed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_last_viewed ON assets(last_viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_collections_cover_asset ON collections(cover_asset_id);
