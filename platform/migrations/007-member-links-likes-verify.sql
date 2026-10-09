-- Verification for 007-member-links-likes.sql. One statement, safe with either
-- --file or --command, and safe to run as often as you like.
--
--   cd platform/cloudflare
--   npx wrangler d1 execute -c wrangler.company.toml --remote quotation-studio-db \
--     --file=../migrations/007-member-links-likes-verify.sql
--
-- EXPECTED after a successful apply — four rows:
--
--   table_name | object_name        | object_kind | column_type | not_null | default_value
--   users      | instagram_url      | column      | TEXT        | 1        | ''
--   users      | linkedin_url       | column      | TEXT        | 1        | ''
--   member_likes | member_likes     | table       |             |          |
--   member_likes | idx_member_likes_target | index  |             |          |
--
-- ZERO rows means the migration has not been applied yet. Rows missing for
-- member_likes alone mean the columns landed but the table did not — read the
-- apply output by hand rather than re-running blindly.
--
-- This is PRAGMA-driven rather than a `SELECT instagram_url` probe on purpose:
-- a missing column makes the probe throw, which tells you the same thing but
-- as an error instead of an answer.
SELECT 'users'         AS table_name,
       p.name          AS object_name,
       'column'        AS object_kind,
       p.type          AS column_type,
       p."notnull"     AS not_null,
       p.dflt_value    AS default_value
FROM pragma_table_info('users') AS p
WHERE p.name IN ('instagram_url', 'linkedin_url')
UNION ALL
SELECT 'member_likes', m.name, 'table', '', '', ''
FROM sqlite_master AS m
WHERE m.type = 'table' AND m.name = 'member_likes'
UNION ALL
SELECT 'member_likes', i.name, 'index', '', '', ''
FROM sqlite_master AS i
WHERE i.type = 'index' AND i.name = 'idx_member_likes_target';
