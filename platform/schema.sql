-- Quotation Studio — Phase A schema (Cloudflare D1 / SQLite compatible)
-- Apply: wrangler d1 execute qs-db --file=platform/schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner'
                CHECK (role IN ('owner', 'sales', 'viewer')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- One-time password recovery codes (hash only; raw code shown once, never emailed yet)
CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
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
