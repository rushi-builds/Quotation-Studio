-- Quotation Studio — one-time repair for pre-launch databases.
-- ---------------------------------------------------------------------------
-- USE ONLY when the D1 database has NO real data yet (first signup failing).
-- Old databases were created before `users.role_custom` existed, and
-- CREATE TABLE IF NOT EXISTS never adds missing columns/constraints.
-- This drops all app tables (children first for FK safety); run schema.sql
-- right after to rebuild them correctly. NEVER run on a live database.
-- Run: npm run db:reset-schema   (from platform/cloudflare)
-- ---------------------------------------------------------------------------
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS gallery_blobs;
DROP TABLE IF EXISTS gallery;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS sends;
DROP TABLE IF EXISTS portal_events;
DROP TABLE IF EXISTS proposal_versions;
DROP TABLE IF EXISTS access_tokens;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS password_resets;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS proposals;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS users;

PRAGMA foreign_keys = ON;
