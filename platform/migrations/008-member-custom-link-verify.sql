-- Verification for 008-member-custom-link.sql. One statement, safe with either
-- --file or --command, and safe to run as often as you like.
--
--   cd platform/cloudflare
--   npx wrangler d1 execute -c wrangler.company.toml --remote quotation-studio-db \
--     --file=../migrations/008-member-custom-link-verify.sql
--
-- EXPECTED after a successful apply — one row:
--
--   table_name | object_name | object_kind | column_type | not_null | default_value
--   users      | custom_url  | column      | TEXT        | 1        | ''
--
-- ZERO rows means the migration has not been applied yet.
--
-- PRAGMA-driven rather than a `SELECT custom_url` probe on purpose: a missing
-- column makes the probe throw, which tells you the same thing but as an
-- error instead of an answer.
SELECT 'users'      AS table_name,
       p.name       AS object_name,
       'column'     AS object_kind,
       p.type       AS column_type,
       p."notnull"  AS not_null,
       p.dflt_value AS default_value
FROM pragma_table_info('users') AS p
WHERE p.name IN ('custom_url');
