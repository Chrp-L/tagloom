CREATE TABLE moodboards (
  id TEXT PRIMARY KEY NOT NULL,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  viewport_x REAL NOT NULL DEFAULT 0,
  viewport_y REAL NOT NULL DEFAULT 0,
  viewport_zoom REAL NOT NULL DEFAULT 1,
  background_color TEXT NOT NULL DEFAULT '#f8f8f6',
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(collection_id, name)
);

CREATE INDEX idx_moodboards_collection_updated
  ON moodboards(collection_id, updated_at DESC);

CREATE TABLE moodboard_nodes (
  moodboard_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  z_index INTEGER NOT NULL DEFAULT 0,
  config_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(moodboard_id, id)
);

CREATE INDEX idx_moodboard_nodes_asset ON moodboard_nodes(asset_id);

CREATE TABLE moodboard_edges (
  moodboard_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  color TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(moodboard_id, id),
  FOREIGN KEY(moodboard_id, source_node_id)
    REFERENCES moodboard_nodes(moodboard_id, id) ON DELETE CASCADE,
  FOREIGN KEY(moodboard_id, target_node_id)
    REFERENCES moodboard_nodes(moodboard_id, id) ON DELETE CASCADE,
  CHECK(source_node_id <> target_node_id)
);

CREATE INDEX idx_moodboard_edges_source ON moodboard_edges(moodboard_id, source_node_id);
