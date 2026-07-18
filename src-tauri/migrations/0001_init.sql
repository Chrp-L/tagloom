PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS source_roots (
  id TEXT PRIMARY KEY NOT NULL,
  path TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',
  last_scanned_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  source_id TEXT NOT NULL REFERENCES source_roots(id) ON DELETE CASCADE,
  path TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  extension TEXT NOT NULL,
  media_kind TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  modified_at TEXT NOT NULL,
  captured_at TEXT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  quick_hash TEXT NOT NULL,
  full_hash TEXT,
  thumbnail_path TEXT,
  preview_path TEXT,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ready',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assets_source ON assets(source_id);
CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(media_kind);
CREATE INDEX IF NOT EXISTS idx_assets_captured ON assets(captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_modified ON assets(modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_quick_hash ON assets(quick_hash);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(asset_id, tag_id)
);

CREATE TABLE IF NOT EXISTS collections (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_items (
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY(collection_id, asset_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS file_operations (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  asset_id TEXT,
  from_path TEXT NOT NULL,
  to_path TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
  asset_id UNINDEXED,
  filename,
  path,
  note,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS assets_ai AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts(asset_id, filename, path, note)
  VALUES (new.id, new.filename, new.path, new.note);
END;

CREATE TRIGGER IF NOT EXISTS assets_au AFTER UPDATE OF filename, path, note ON assets BEGIN
  DELETE FROM assets_fts WHERE asset_id = old.id;
  INSERT INTO assets_fts(asset_id, filename, path, note)
  VALUES (new.id, new.filename, new.path, new.note);
END;

CREATE TRIGGER IF NOT EXISTS assets_ad AFTER DELETE ON assets BEGIN
  DELETE FROM assets_fts WHERE asset_id = old.id;
END;

INSERT OR IGNORE INTO settings(key, value, updated_at)
VALUES
  ('language', 'system', datetime('now')),
  ('theme', 'system', datetime('now')),
  ('reduce_motion', 'false', datetime('now'));
