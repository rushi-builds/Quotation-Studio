-- Round-3 team profile: two additive columns on `users`, plus one new table.
--
--   users.instagram_url   the member's Instagram profile URL. Display data,
--                         shown as a button on the member card. Never a
--                         credential: nothing reads it at sign-in and no gate
--                         depends on it.
--   users.linkedin_url    the member's LinkedIn profile URL. Same contract.
--   member_likes          one row per (liker, target): the heart on the member
--                         card. The PRIMARY KEY is what makes it ONE vote per
--                         member per member — a second insert for the same
--                         pair is rejected by SQLite, so the counter can never
--                         be inflated by a double click or a replayed request.
--                         Toggle only: the front end sends the same POST and
--                         the server inserts or deletes.
--
-- Neither column nor the new table is read by the permission core. `role`
-- keeps its CHECK constraint, `is_admin` keeps its meaning, and a row that
-- gains these two values reads exactly the same to every gate as one that
-- does not. Kudos confer NOTHING: they are a count of clicks.
--
-- VISIBILITY: the links and the counter are team-wide on purpose — a social
-- profile is public anyway and the point of the card is being able to reach
-- the person. Edit and Delete remain owner/admin exactly as before; this
-- migration adds no gate and removes none.
--
-- ---------------------------------------------------------------------------
-- BACK UP FIRST (per the standing rule):
--
--   cd platform/cloudflare
--   $env:CLOUDFLARE_API_TOKEN = <ktm-scoped token>
--   $env:CLOUDFLARE_ACCOUNT_ID = 'e43beb41b3e88e546967398e5767800c'
--   npx wrangler d1 execute -c wrangler.company.toml --remote quotation-studio-db \
--     --command "SELECT id, email, role, is_admin FROM users"
--
-- APPLY:
--
--   npx wrangler d1 execute -c wrangler.company.toml --remote quotation-studio-db \
--     --file=../migrations/007-member-links-likes.sql
--
-- VERIFY (see 007-member-links-likes-verify.sql):
--
--   npx wrangler d1 execute -c wrangler.company.toml --remote quotation-studio-db \
--     --file=../migrations/007-member-links-likes-verify.sql
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENCY: SQLite has no `ADD COLUMN IF NOT EXISTS`, so re-running this
-- file fails with "duplicate column name: instagram_url". That is harmless and
-- means the column is already present — run the verify file instead.
-- `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` are safe to
-- re-run as often as you like.
--
-- Until it is applied the deployment still serves traffic: every read of these
-- columns and of `member_likes` is defensive, so an old database simply
-- reports empty links and a zero count. The Worker tolerates a missing
-- `member_likes` table by answering the like route with a clear error rather
-- than by crashing; every other route is unaffected.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK / LEAVING IT IN PLACE: the two columns are inert if left. They are
-- TEXT with a constant default, no index, CHECK constraint or foreign key
-- references them, and `member_likes` is a leaf table — nothing joins to it
-- except the team list, which can do without it.
--
-- SQLite cannot drop a column without a table rebuild (create-new / copy /
-- drop / rename), which is not worth the risk for two display strings. Leave
-- them. Dropping the table is a one-liner if the feature is ever retired:
--   DROP TABLE IF EXISTS member_likes;
--
-- Rolling back the CODE instead needs no DDL at all: the pre-migration Worker
-- never selects these columns, so an old deployment runs fine against a
-- migrated database. The migration is forward- and backward-safe.
-- ---------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN instagram_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN linkedin_url TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS member_likes (
  liker_id   TEXT NOT NULL,
  target_id  TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (liker_id, target_id)
);

-- Look up "how many did THIS member receive" during the team list, which is
-- the only read path. Without it the count is a table scan on every panel
-- refresh; with it the primary key does the work.
CREATE INDEX IF NOT EXISTS idx_member_likes_target ON member_likes (target_id);
