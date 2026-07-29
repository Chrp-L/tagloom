-- Rebuild the v1 moodboard tables: a board can now be shown in zero or more contexts.
PRAGMA foreign_keys = OFF;

ALTER TABLE moodboard_edges RENAME TO moodboard_edges_legacy;
ALTER TABLE moodboard_nodes RENAME TO moodboard_nodes_legacy;
ALTER TABLE moodboards RENAME TO moodboards_legacy;

DROP INDEX IF EXISTS idx_moodboard_nodes_asset;
DROP INDEX IF EXISTS idx_moodboard_edges_source;

CREATE TABLE moodboards (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  viewport_x REAL NOT NULL DEFAULT 0,
  viewport_y REAL NOT NULL DEFAULT 0,
  viewport_zoom REAL NOT NULL DEFAULT 1,
  background_color TEXT NOT NULL DEFAULT '#f8f8f6',
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_moodboards_updated ON moodboards(updated_at DESC);

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

INSERT INTO moodboards(id, name, viewport_x, viewport_y, viewport_zoom, background_color, revision, created_at, updated_at)
SELECT id, name, viewport_x, viewport_y, viewport_zoom, background_color, revision, created_at, updated_at
FROM moodboards_legacy;

INSERT INTO moodboard_nodes(moodboard_id, id, node_type, asset_id, position_x, position_y, width, height, z_index, config_json)
SELECT moodboard_id, id, node_type, asset_id, position_x, position_y, width, height, z_index, config_json
FROM moodboard_nodes_legacy;

INSERT INTO moodboard_edges(moodboard_id, id, source_node_id, target_node_id, color, config_json)
SELECT moodboard_id, id, source_node_id, target_node_id, color, config_json
FROM moodboard_edges_legacy;

CREATE TABLE moodboard_contexts (
  moodboard_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(moodboard_id, collection_id)
);

CREATE INDEX idx_moodboard_contexts_collection ON moodboard_contexts(collection_id, moodboard_id);

INSERT INTO moodboard_contexts(moodboard_id, collection_id, created_at)
SELECT id, collection_id, created_at FROM moodboards_legacy;

CREATE TABLE moodboard_asset_groups (
  id TEXT PRIMARY KEY NOT NULL,
  moodboard_id TEXT NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(moodboard_id, name)
);

CREATE INDEX idx_moodboard_asset_groups_board_position
  ON moodboard_asset_groups(moodboard_id, position ASC, id ASC);

CREATE TABLE moodboard_asset_group_items (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL REFERENCES moodboard_asset_groups(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(group_id, asset_id)
);

CREATE INDEX idx_moodboard_asset_group_items_group_position
  ON moodboard_asset_group_items(group_id, position ASC, id ASC);

DROP TABLE moodboard_edges_legacy;
DROP TABLE moodboard_nodes_legacy;
DROP TABLE moodboards_legacy;

PRAGMA foreign_keys = ON;
