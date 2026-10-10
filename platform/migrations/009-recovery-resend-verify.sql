-- Read-only confirmation for 009-recovery-resend.sql.
--
-- Expects two extra columns on `password_resets`. SQLite reports a missing
-- column as a failed statement, so an un-migrated database is loud rather than
-- silently passing.
--
--   npx wrangler d1 execute -c wrangler.company.toml --remote quotation-studio-db \
--     --file=../migrations/009-recovery-resend-verify.sql

SELECT resend_count, attempts FROM password_resets LIMIT 1;

SELECT
  (SELECT COUNT(*) FROM pragma_table_info('password_resets') WHERE name = 'resend_count') AS has_resend_count,
  (SELECT COUNT(*) FROM pragma_table_info('password_resets') WHERE name = 'attempts')     AS has_attempts;
