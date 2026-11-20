-- Migration 016: Activity log + enhanced sessions + 2FA support.
-- Apply: wrangler d1 execute quotation-studio-db --remote --file=016-activity-log-sessions.sql

-- Activity log: audit trail for admin actions.
CREATE TABLE IF NOT EXISTS activity_logs (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  actor_name  TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id   TEXT NOT NULL DEFAULT '',
  target_name TEXT NOT NULL DEFAULT '',
  detail      TEXT NOT NULL DEFAULT '',
  ip          TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_logs(action);

-- 2FA secrets: one row per user who has enabled 2FA.
CREATE TABLE IF NOT EXISTS totp_secrets (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret     TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  enabled_at TEXT
);

-- Add user_agent to sessions for session management display.
-- SQLite cannot ALTER to add with default, so we handle gracefully.
-- The code reads user_agent with COALESCE so missing column is fine.
