#!/usr/bin/env node
/* Repair the foreign keys that SQLite rewrites when a table is renamed.

   Why this exists
   ---------------
   Migration 015 rebuilds `users` (new roles + full_access). The only way to
   change a CHECK constraint in SQLite is to rename the old table, create the
   new one, copy the rows and drop the old table. What SQLite does NOT tell
   you: ALTER TABLE users RENAME TO users_old also rewrites the FOREIGN KEY
   clause of every other table that references users, so those tables now say
   REFERENCES "users_old". Dropping users_old then leaves them pointing at a
   table that no longer exists - every write fails with:

       D1_ERROR: no such table: main.users_old: SQLITE_ERROR

   There is no ALTER TABLE ... ALTER FOREIGN KEY in SQLite, and D1 ignores
   PRAGMA legacy_alter_table / foreign_keys for this, so the child tables have
   to be rebuilt. This script does that generically:

     - finds every table whose schema still mentions users_old
     - rebuilds it against users(id), copying every row
     - recreates its indexes and triggers
     - retries in dependency order (a DROP can fail while another table that
       still mentions users_old references it)
     - verifies nothing mentions users_old and that foreign_key_check is clean

   Usage (after applying 015):
     CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
       node platform/migrations/fix-user-fk-refs.cjs

   Optional env:
     D1_DATABASE_NAME   default quotation-studio-db
     D1_DATABASE_ID     skip the name lookup
*/
'use strict';

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const DB_NAME = process.env.D1_DATABASE_NAME || 'quotation-studio-db';
let DB_ID = process.env.D1_DATABASE_ID || '';
const API = 'https://api.cloudflare.com/client/v4';

if (!TOKEN) { console.error('CLOUDFLARE_API_TOKEN is required'); process.exit(2); }
if (!ACCOUNT) { console.error('CLOUDFLARE_ACCOUNT_ID is required'); process.exit(2); }

async function cf(path, init) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(init && init.headers) },
  });
  const json = await res.json().catch(() => ({}));
  if (!json.success) throw new Error('Cloudflare API: ' + JSON.stringify(json.errors || json));
  return json.result;
}

async function q(sql) {
  const out = await cf(`/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`, {
    method: 'POST',
    body: JSON.stringify({ sql }),
  });
  return out[0].results;
}

const fix = (sql) => sql.replace(/"users_old"/g, '"users"').replace(/\busers_old\b/g, 'users');

async function resolveDb() {
  if (DB_ID) return;
  const dbs = await cf(`/accounts/${ACCOUNT}/d1/database?name=${encodeURIComponent(DB_NAME)}`);
  const hit = (dbs || []).find((d) => d.name === DB_NAME) || (dbs || [])[0];
  if (!hit) throw new Error('D1 database not found: ' + DB_NAME);
  DB_ID = hit.uuid;
}

async function main() {
  await resolveDb();
  const initial = await q("SELECT name FROM sqlite_master WHERE type='table' AND sql LIKE '%users_old%' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  if (initial.length === 0) {
    console.log('Nothing to repair: no table references users_old.');
    return;
  }
  console.log('Tables to rebuild: ' + initial.map((t) => t.name).join(', '));

  let pending = await q("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%users_old%' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    const still = [];
    for (const t of pending) {
      try {
        const indexes = await q("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='" + t.name + "' AND sql IS NOT NULL");
        const triggers = await q("SELECT sql FROM sqlite_master WHERE type='trigger' AND tbl_name='" + t.name + "' AND sql IS NOT NULL");
        const create = fix(t.sql);
        if (/"users_old"/.test(create)) throw new Error('schema still mentions users_old after rewrite');
        /* Copy first into a temp name so a failure cannot lose the table. */
        const cols = await q('PRAGMA table_info("' + t.name + '")');
        const colList = cols.map((c) => '"' + c.name + '"').join(', ');
        const createTemp = create.replace(
          /^(\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?)(?:"[^"]+"|'[^']+'|[A-Za-z_][\w$]*)/i,
          '$1"' + t.name + '__fkfix"'
        );
        if (createTemp === create) throw new Error('could not rename table in its CREATE statement');
        await q('DROP TABLE IF EXISTS "' + t.name + '__fkfix"');
        await q(createTemp);
        await q('INSERT INTO "' + t.name + '__fkfix" (' + colList + ') SELECT ' + colList + ' FROM "' + t.name + '"');
        await q('DROP TABLE "' + t.name + '"');
        await q('ALTER TABLE "' + t.name + '__fkfix" RENAME TO "' + t.name + '"');
        for (const i of indexes) await q(fix(i.sql));
        for (const g of triggers) await q(fix(g.sql));
        console.log('  rebuilt ' + t.name + ' (indexes=' + indexes.length + ', triggers=' + triggers.length + ')');
        progress = true;
      } catch (e) {
        console.log('  retry later: ' + t.name + ' (' + e.message + ')');
        still.push(t);
      }
    }
    pending = still;
  }
  if (pending.length) throw new Error('Could not rebuild: ' + pending.map((t) => t.name).join(', '));

  const left = await q("SELECT name FROM sqlite_master WHERE sql LIKE '%users_old%' AND name NOT LIKE 'sqlite_%'");
  if (left.length) throw new Error('Still referencing users_old: ' + JSON.stringify(left));
  const fk = await q('PRAGMA foreign_key_check');
  if (fk.length) throw new Error('foreign_key_check found ' + fk.length + ' violation(s): ' + JSON.stringify(fk));
  console.log('OK: every foreign key points at users(id); foreign_key_check is clean.');
}

main().catch((e) => { console.error('FAIL: ' + e.message); process.exit(1); });
