-- Verification for 005-is-admin.sql. One statement, so it is safe to run with
-- either --file or --command, and safe to run as often as you like.
--
--   cd platform/cloudflare
--   npx wrangler d1 execute quotation-studio-db --remote \
--     --file=../migrations/005-is-admin-verify.sql
--
-- EXPECTED after a successful apply — exactly one row:
--
--   table_name | column_found | column_type | not_null | default_value
--   users      | is_admin     | INTEGER     | 1        | 0
--
-- ZERO rows means the migration has not been applied yet. More than one row
-- means the query matched something unexpected and should be read by hand.
--
-- This is PRAGMA-driven rather than a `SELECT is_admin` probe on purpose: a
-- missing column makes the probe throw, which tells you the same thing but as
-- an error instead of an answer.
SELECT 'users'                       AS table_name,
       p.name                        AS column_found,
       p.type                        AS column_type,
       p."notnull"                   AS not_null,
       p.dflt_value                  AS default_value
FROM pragma_table_info('users') AS p
WHERE p.name = 'is_admin';
