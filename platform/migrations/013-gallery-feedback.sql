-- Public gallery feedback (2026-11-02)
--
-- A visitor on the portfolio page can leave a short note about a project (or
-- about the page). It is the same anonymous visitor id as the likes - a random
-- first-party cookie, no account, no email required - and the note is plain
-- text with a hard length cap. The studio reads these; they are never rendered
-- back to other visitors.
--
-- The Worker also creates this table on first use (ensureGalleryFeedbackSchema),
-- so a deployment that has not run this migration still works; the file exists
-- so a fresh database can be built from migrations alone.

CREATE TABLE IF NOT EXISTS gallery_feedback (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  visitor_id TEXT NOT NULL,
  name TEXT,
  rating INTEGER,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS gallery_feedback_visitor
  ON gallery_feedback (visitor_id, created_at);

CREATE INDEX IF NOT EXISTS gallery_feedback_project
  ON gallery_feedback (project_id, created_at);
