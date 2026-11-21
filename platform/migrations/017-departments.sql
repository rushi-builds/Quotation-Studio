-- Migration 017: Departments.
-- Adds one display/administration field per member. It changes no role power;
-- the Access control matrix (later) is the permission source of truth.
-- Apply: wrangler d1 execute quotation-studio-db --remote --file=017-departments.sql

ALTER TABLE users ADD COLUMN department TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department);

-- The designated admin starts as Super Admin of the workspace. Only that
-- department will be able to open advanced Settings once the gate ships.
UPDATE users SET department = 'Super Admin'
WHERE lower(email) = 'rushidhumal.04@gmail.com' AND department = '';
