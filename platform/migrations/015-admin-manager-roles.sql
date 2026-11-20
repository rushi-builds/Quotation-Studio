-- Migration 015: Expanded roles + full_access flag.
-- Old roles: owner, sales, viewer, custom.
-- New roles: admin, owner, manager, sales, production, site_engineer, viewer, custom.
-- New column: full_access (0/1) - admin can toggle this per member.
-- Apply: wrangler d1 execute quotation-studio-db --remote --file=015-admin-manager-roles.sql
--
-- !! RUN THE FK REPAIR AFTER THIS FILE !!
-- SQLite has no ALTER for foreign keys. Renaming users below makes SQLite
-- rewrite the FOREIGN KEY of every child table (sessions, proposals,
-- customers, tasks, notifications, password_resets, projects, gallery,
-- oauth_identities, access_tokens, proposal_versions, sends) to point at
-- "users_old". Dropping users_old at the end then leaves those tables
-- pointing at a table that no longer exists, and every write fails with:
--     D1_ERROR: no such table: main.users_old: SQLITE_ERROR
-- D1 ignores PRAGMA legacy_alter_table / foreign_keys for this, so the child
-- tables must be rebuilt. Run, once, with the deploy credentials:
--     CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
--       node platform/migrations/fix-user-fk-refs.cjs
-- It finds every table still mentioning users_old, rebuilds it against
-- users(id) with all rows, indexes and triggers, and checks foreign_key_check.
-- Skipping it is how production hit the users_old error on 2026-11-21.

-- SQLite cannot ALTER a CHECK constraint, so we rebuild the table.

-- 1. Rename old table
ALTER TABLE users RENAME TO users_old;

-- 2. Create new table with updated CHECK + full_access column
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'sales'
                CHECK (role IN ('admin', 'owner', 'manager', 'sales', 'production', 'site_engineer', 'viewer', 'custom')),
  role_custom   TEXT,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  full_access   INTEGER NOT NULL DEFAULT 0,
  phone         TEXT NOT NULL DEFAULT '',
  profile_done  INTEGER NOT NULL DEFAULT 0,
  instagram_url TEXT NOT NULL DEFAULT '',
  linkedin_url  TEXT NOT NULL DEFAULT '',
  custom_url    TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- 3. Copy data (full_access defaults to 0 for all existing users)
INSERT INTO users (id, email, name, password_hash, role, role_custom, is_admin,
  full_access, phone, profile_done, instagram_url, linkedin_url, custom_url, created_at, updated_at)
SELECT id, email, name, password_hash, role, role_custom, is_admin,
  0, phone, profile_done, instagram_url, linkedin_url, custom_url, created_at, updated_at
FROM users_old;

-- 4. Drop old table
DROP TABLE users_old;

-- 5. Promote the ADMIN_EMAIL account to 'admin' role (run manually):
-- UPDATE users SET role = 'admin' WHERE email = 'rushidhumal.04@gmail.com';
