-- Quotation Studio — Phase A schema (Cloudflare D1 / SQLite compatible)
-- Apply: wrangler d1 execute qs-db --file=platform/schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  /* owner | sales | viewer | custom — custom uses role_custom title */
  role          TEXT NOT NULL DEFAULT 'sales'
                CHECK (role IN ('owner', 'sales', 'viewer', 'custom')),
  role_custom   TEXT,
  /* Elevation flag, deliberately NOT a `role` value: it outranks owner without
     changing the role, so no label and no role-reading code moves when it is
     set. Only the designated ADMIN_EMAIL login may set or clear it, and only on
     its own row. Existing databases gain it via migrations/005-is-admin.sql. */
  is_admin      INTEGER NOT NULL DEFAULT 0,
  /* Contact number for the team panel. Display data only: never read during
     authentication, never part of a gate. Existing databases gain it via
     migrations/006-profile-info.sql. */
  phone         TEXT NOT NULL DEFAULT '',
  /* 0 until the member has saved their profile once, then 1. Drives the
     one-time "update your role and info" nudge. Changes no permission. */
  profile_done  INTEGER NOT NULL DEFAULT 0,
  /* Social profile links for the member card. Display data only, team-wide on
     purpose (a social profile is public anyway): never read at sign-in,
     never part of a gate. Existing databases gain them via
     migrations/007-member-links-likes.sql. */
  instagram_url TEXT NOT NULL DEFAULT '',
  linkedin_url  TEXT NOT NULL DEFAULT '',
  /* The member's own "any other link" — neither Instagram nor LinkedIn.
     Same contract as the two above: display data, team-wide, never read at
     sign-in and never part of a gate. Existing databases gain it via
     migrations/008-member-custom-link.sql. */
  custom_url    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

/* The heart on the member card: one row per (liker, target). The composite
   PRIMARY KEY is what makes it exactly ONE vote per member per member — a
   second insert for the same pair is rejected by SQLite, so the count cannot
   be inflated by a double click or a replayed request. Kudos confer NOTHING:
   they are a count of clicks, read only by the team list. */
CREATE TABLE IF NOT EXISTS member_likes (
  liker_id   TEXT NOT NULL,
  target_id  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (liker_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_member_likes_target ON member_likes (target_id);

-- One-time password recovery codes (hash only; the raw code leaves the process
-- in the recovery email and is never stored).
CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  /* How many times a NEW code replaced the current one. Capped at 3 by the
     Worker, so one recovery attempt sends at most 4 emails. */
  resend_count INTEGER NOT NULL DEFAULT 0,
  /* Failed verification tries against THIS code. A 6-digit code has 1e6
     combinations, so five misses invalidate it rather than let a caller grind
     through the 10-minute window. */
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS customers (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  company    TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  site       TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_owner ON customers(owner_id);

CREATE TABLE IF NOT EXISTS proposals (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id     TEXT REFERENCES customers(id) ON DELETE SET NULL,
  ref             TEXT NOT NULL DEFAULT '',
  title           TEXT NOT NULL DEFAULT 'Untitled',
  status          TEXT NOT NULL DEFAULT 'draft',
  version_label   TEXT NOT NULL DEFAULT '1.0',
  prev_id         TEXT,
  capacity        TEXT NOT NULL DEFAULT '',
  customer_name   TEXT NOT NULL DEFAULT '',
  form_json       TEXT NOT NULL DEFAULT '{}',
  content_json    TEXT,
  project_images_json TEXT,
  page_images_json    TEXT,
  options_json    TEXT NOT NULL DEFAULT '[]',
  local_id        TEXT,
  sent_at         TEXT,
  accepted_at     TEXT,
  revision        INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proposals_owner ON proposals(owner_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_updated ON proposals(updated_at);

-- Phase B: immutable published snapshots + secure customer access tokens
CREATE TABLE IF NOT EXISTS proposal_versions (
  id              TEXT PRIMARY KEY,
  proposal_id     TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_label   TEXT NOT NULL DEFAULT '1.0',
  snapshot_json   TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL DEFAULT '',
  pdf_sha256      TEXT,
  pdf_path        TEXT,
  note            TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_versions_proposal ON proposal_versions(proposal_id);
CREATE INDEX IF NOT EXISTS idx_versions_owner ON proposal_versions(owner_id);

CREATE TABLE IF NOT EXISTS access_tokens (
  id              TEXT PRIMARY KEY,
  token_hash      TEXT NOT NULL UNIQUE,
  version_id      TEXT NOT NULL REFERENCES proposal_versions(id) ON DELETE CASCADE,
  proposal_id     TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label           TEXT NOT NULL DEFAULT '',
  expires_at      TEXT,
  revoked_at      TEXT,
  created_at      TEXT NOT NULL,
  first_opened_at TEXT,
  last_opened_at  TEXT,
  open_count      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tokens_hash ON access_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_tokens_proposal ON access_tokens(proposal_id);
CREATE INDEX IF NOT EXISTS idx_tokens_version ON access_tokens(version_id);

CREATE TABLE IF NOT EXISTS portal_events (
  id          TEXT PRIMARY KEY,
  token_id    TEXT REFERENCES access_tokens(id) ON DELETE SET NULL,
  version_id  TEXT REFERENCES proposal_versions(id) ON DELETE SET NULL,
  proposal_id TEXT,
  owner_id    TEXT,
  event_type  TEXT NOT NULL,
  meta_json   TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_owner ON portal_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_events_proposal ON portal_events(proposal_id);

-- Phase C: outbound send attempts (honest state machine — no fabricated delivery)
CREATE TABLE IF NOT EXISTS sends (
  id              TEXT PRIMARY KEY,
  proposal_id     TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  version_id      TEXT REFERENCES proposal_versions(id) ON DELETE SET NULL,
  token_id        TEXT REFERENCES access_tokens(id) ON DELETE SET NULL,
  owner_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL
                  CHECK (channel IN ('whatsapp_manual', 'email_manual', 'copy_link', 'other')),
  state           TEXT NOT NULL DEFAULT 'draft'
                  CHECK (state IN (
                    'draft',
                    'share_clicked',
                    'submitted_to_provider',
                    'delivered',
                    'failed',
                    'cancelled'
                  )),
  recipient_name  TEXT NOT NULL DEFAULT '',
  recipient_to    TEXT NOT NULL DEFAULT '',
  message_body    TEXT NOT NULL DEFAULT '',
  portal_url      TEXT NOT NULL DEFAULT '',
  provider        TEXT NOT NULL DEFAULT 'manual',
  provider_message_id TEXT,
  note            TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  share_clicked_at TEXT,
  submitted_at    TEXT,
  delivered_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_sends_owner ON sends(owner_id);
CREATE INDEX IF NOT EXISTS idx_sends_proposal ON sends(proposal_id);
CREATE INDEX IF NOT EXISTS idx_sends_state ON sends(state);

-- Phase D: in-app notifications + follow-up tasks
CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_id  TEXT REFERENCES proposals(id) ON DELETE SET NULL,
  event_id     TEXT,
  kind         TEXT NOT NULL DEFAULT 'info',
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  read_at      TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications(owner_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(owner_id, read_at);

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposal_id   TEXT REFERENCES proposals(id) ON DELETE SET NULL,
  title         TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  due_at        TEXT,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'done', 'cancelled')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  completed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);

-- Later: R2 file objects for server-held PDFs

CREATE TABLE IF NOT EXISTS gallery (
  id            TEXT PRIMARY KEY,
  store_key        TEXT NOT NULL DEFAULT '',
  file_name     TEXT NOT NULL DEFAULT '',
  mime          TEXT NOT NULL DEFAULT '',
  caption       TEXT NOT NULL DEFAULT '',
  category      TEXT NOT NULL DEFAULT 'site',
  size          INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery(created_at);

CREATE TABLE IF NOT EXISTS gallery_blobs (
  id            TEXT PRIMARY KEY REFERENCES gallery(id) ON DELETE CASCADE,
  data          BLOB NOT NULL
);
-- Persistent cross-isolate Gemini rate limits. Contains counters only, never prompts.
CREATE TABLE IF NOT EXISTS assistant_usage (
  scope TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, bucket)
);
CREATE INDEX IF NOT EXISTS idx_assistant_usage_expiry ON assistant_usage(expires_at);

-- Monotonic allocation metadata; deleting a proposal must not recycle its number.
CREATE TABLE IF NOT EXISTS proposal_reference_counters (
  year INTEGER PRIMARY KEY,
  sequence INTEGER NOT NULL
);

-- Worker login/register throttling (fixed IP ceiling + per-email backoff).
-- Also self-created by the Worker on first auth use; counters only, no secrets.
CREATE TABLE IF NOT EXISTS auth_throttles (
  scope TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL DEFAULT 0,
  window_count INTEGER NOT NULL DEFAULT 0
);
