ALTER TABLE assets ADD COLUMN preview_byte_size INTEGER;
ALTER TABLE assets ADD COLUMN preview_last_used_at TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_preview_lru
  ON assets(preview_last_used_at ASC)
  WHERE preview_path IS NOT NULL;

INSERT OR IGNORE INTO settings(key, value, updated_at)
VALUES('video_preview_cache_limit_bytes', '5368709120', datetime('now'));
