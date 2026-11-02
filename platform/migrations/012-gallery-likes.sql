-- Public gallery likes (2026-11-02)
--
-- The portfolio page (gallery.html) shows real like counts without a login.
-- A visitor is a random id kept in a first-party cookie; no user id, email or
-- IP address is stored. The composite primary key is the rule that makes one
-- like per visitor per project true even under a double tap or a re-open.
--
-- The Worker also creates this table on first use (ensureGalleryLikesSchema),
-- so a deployment that has not run this migration still works; the file exists
-- so a fresh database can be built from migrations alone.

CREATE TABLE IF NOT EXISTS gallery_likes (
  project_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS gallery_likes_visitor
  ON gallery_likes (visitor_id);
