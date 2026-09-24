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

-- Phase B will add: proposal_versions, access_tokens, sends, events, files
