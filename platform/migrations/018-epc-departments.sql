-- Migration 018: KTM EPC department list + Super Admin assignment.
-- Departments are labels only (no role power changes); the dropdown presets
-- live in code (worker.js / local-server / dashboard.js). This migration just
-- makes sure the workspace's full-access accounts carry the Super Admin label.
-- Apply: wrangler d1 execute quotation-studio-db --remote --file=018-epc-departments.sql

UPDATE users SET department = 'Super Admin', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE department = '' AND role IN ('admin', 'owner');
