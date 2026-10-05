-- Worker login/register throttling (fixed IP ceiling + per-email backoff).
-- Also self-created by the Worker on first auth use; safe to apply twice.
CREATE TABLE IF NOT EXISTS auth_throttles (
  scope TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL DEFAULT 0,
  window_count INTEGER NOT NULL DEFAULT 0
);
