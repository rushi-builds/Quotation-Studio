-- Isolated sample-workspace schema, never a migration for production Studio/D1.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS workspace (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  payload TEXT NOT NULL CHECK (json_valid(payload))
);
CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  organisation_id TEXT NOT NULL REFERENCES organisations(id),
  contact_id TEXT NOT NULL REFERENCES contacts(id),
  payload TEXT NOT NULL CHECK (json_valid(payload))
);
CREATE TABLE IF NOT EXISTS linked_records (
  kind TEXT NOT NULL CHECK (kind IN ('task', 'thread', 'meeting', 'activity')),
  id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id),
  channel TEXT NOT NULL CHECK (channel IN ('Internal', 'WhatsApp', 'Gmail', 'Outlook')),
  status TEXT NOT NULL CHECK (status IN ('Needs approval', 'Scheduled', 'Blocked', 'Paused', 'Cancelled', 'Done')),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  CHECK (channel = 'Internal' OR status != 'Done')
);
CREATE TABLE IF NOT EXISTS control_audit (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL CHECK (json_valid(payload))
);

-- Protected governance snapshots are only written by role-checked commands.
CREATE TABLE IF NOT EXISTS governance_audit (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL CHECK (json_valid(payload))
);
