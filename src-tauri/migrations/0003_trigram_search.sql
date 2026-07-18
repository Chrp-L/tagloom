DROP TRIGGER IF EXISTS assets_ai;
DROP TRIGGER IF EXISTS assets_au;
DROP TRIGGER IF EXISTS assets_ad;
DROP TABLE IF EXISTS assets_fts;

CREATE VIRTUAL TABLE assets_fts USING fts5(
  asset_id UNINDEXED,
  content,
  tokenize = 'trigram'
);

INSERT INTO assets_fts(asset_id, content)
SELECT
  a.id,
  a.filename || ' ' || a.path || ' ' || a.note || ' ' ||
  COALESCE((SELECT group_concat(t.name, ' ') FROM asset_tags at JOIN tags t ON t.id = at.tag_id WHERE at.asset_id = a.id), '')
FROM assets a;

CREATE TRIGGER assets_ai AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts(asset_id, content)
  VALUES (new.id, new.filename || ' ' || new.path || ' ' || new.note);
END;

CREATE TRIGGER assets_au AFTER UPDATE OF filename, path, note ON assets BEGIN
  DELETE FROM assets_fts WHERE asset_id = old.id;
  INSERT INTO assets_fts(asset_id, content)
  VALUES (
    new.id,
    new.filename || ' ' || new.path || ' ' || new.note || ' ' ||
    COALESCE((SELECT group_concat(t.name, ' ') FROM asset_tags at JOIN tags t ON t.id = at.tag_id WHERE at.asset_id = new.id), '')
  );
END;

CREATE TRIGGER assets_ad AFTER DELETE ON assets BEGIN
  DELETE FROM assets_fts WHERE asset_id = old.id;
END;

CREATE TRIGGER asset_tags_search_ai AFTER INSERT ON asset_tags BEGIN
  DELETE FROM assets_fts WHERE asset_id = new.asset_id;
  INSERT INTO assets_fts(asset_id, content)
  SELECT
    a.id,
    a.filename || ' ' || a.path || ' ' || a.note || ' ' ||
    COALESCE((SELECT group_concat(t.name, ' ') FROM asset_tags at JOIN tags t ON t.id = at.tag_id WHERE at.asset_id = a.id), '')
  FROM assets a WHERE a.id = new.asset_id;
END;

CREATE TRIGGER asset_tags_search_ad AFTER DELETE ON asset_tags BEGIN
  DELETE FROM assets_fts WHERE asset_id = old.asset_id;
  INSERT INTO assets_fts(asset_id, content)
  SELECT
    a.id,
    a.filename || ' ' || a.path || ' ' || a.note || ' ' ||
    COALESCE((SELECT group_concat(t.name, ' ') FROM asset_tags at JOIN tags t ON t.id = at.tag_id WHERE at.asset_id = a.id), '')
  FROM assets a WHERE a.id = old.asset_id;
END;

CREATE TRIGGER tags_search_au AFTER UPDATE OF name ON tags BEGIN
  DELETE FROM assets_fts WHERE asset_id IN (SELECT asset_id FROM asset_tags WHERE tag_id = new.id);
  INSERT INTO assets_fts(asset_id, content)
  SELECT
    a.id,
    a.filename || ' ' || a.path || ' ' || a.note || ' ' ||
    COALESCE((SELECT group_concat(t.name, ' ') FROM asset_tags at JOIN tags t ON t.id = at.tag_id WHERE at.asset_id = a.id), '')
  FROM assets a WHERE EXISTS (SELECT 1 FROM asset_tags at WHERE at.asset_id = a.id AND at.tag_id = new.id);
END;
