-- Verification for 006-profile-info.sql. One statement, so it is safe to run
-- with either --file or --command, and safe to run as often as you like.
--
--   cd platform/cloudflare
--   npx wrangler d1 execute -c wrangler.company.toml --remote quotation-studio-db \
--     --file=../migrations/006-profile-info-verify.sql
--
-- EXPECTED after a successful apply — exactly two rows:
--
--   table_name | column_found  | column_type | not_null | default_value
--   users      | phone         | TEXT        | 1        | ''
--   users      | profile_done  | INTEGER     | 1        | 0
--
-- ZERO rows means the migration has not been applied yet. One row means only
-- one of the two columns landed and the file should be re-read by hand.
--
-- This is PRAGMA-driven rather than a `SELECT phone` probe on purpose: a
-- missing column makes the probe throw, which tells you the same thing but as
-- an error instead of an answer.
SELECT 'users'                       AS table_name,
       p.name                        AS column_found,
       p.type                        AS column_type,
       p."notnull"                   AS not_null,
       p.dflt_value                  AS default_value
FROM pragma_table_info('users') AS p
WHERE p.name IN ('phone', 'profile_done');
