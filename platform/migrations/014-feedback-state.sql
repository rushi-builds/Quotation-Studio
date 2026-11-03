-- Feedback inbox handled marker (2026-11-02)
--
-- Project notes (gallery_feedback) and customer notes on a shared quotation
-- (portal_events with event_type 'proposal_feedback') are read in one inbox.
-- The "handled" state lives here, keyed by source + item id, so neither source
-- table is rewritten and a note can be re-opened without losing its text.
--
-- The Worker (and the local server) create this table on first use; the file
-- exists so a fresh database can be built from migrations alone.

CREATE TABLE IF NOT EXISTS feedback_state (
  source TEXT NOT NULL,
  item_id TEXT NOT NULL,
  handled_at TEXT,
  handled_by TEXT,
  PRIMARY KEY (source, item_id)
);
