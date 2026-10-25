import { memDb } from './catalogue-db-fixture.mjs';
/* Catalogue sync route contract (worker level).
   Run: node qa/catalogue-worker.test.mjs
   Asserts: GET 404 until synced, POST owner-only (403 otherwise), owner POST
   pulls the Drive workbook once and lands rows in D1, GET then serves them,
   NOT_CONFIGURED -> 503, broken workbook -> 502. D1 is an in-memory adapter
   with immutable bindings and atomic batches, like real D1. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import worker from '../platform/cloudflare/src/worker.js';

const FIXTURE = readFileSync(new URL('./fixtures/catalogue-fixture.xlsm', import.meta.url));
const FIXTURE_SHA = createHash('sha256').update(FIXTURE).digest('hex');


const baseEnv = (db) => ({ DB: db, GDRIVE_MODE: 'public', GDRIVE_FILE_ID: 'fixture-file-id' });
const call = (env, route, method = 'GET', token) => worker.fetch(
  new Request('https://workspace.test/api/' + route, {
    method,
    headers: { ...(token ? { 'X-QS-Session': token } : {}) }
  }), env);

const realFetch = globalThis.fetch;
let lastUrl = '';

async function withFetchStub(fn) {
  globalThis.fetch = async (url) => {
    lastUrl = String(url);
    if (lastUrl.includes('drive.google.com/uc')) return new Response(FIXTURE, { status: 200 });
    throw new Error('unexpected fetch ' + lastUrl);
  };
  try { return await fn(); } finally { globalThis.fetch = realFetch; }
}

const db = memDb();
const env = baseEnv(db);

await withFetchStub(async () => {
  const before = await call(env, 'catalogue');
  assert.equal(before.status, 404, 'GET before any sync is 404');
  assert.match((await before.json()).error, /Sync Catalogue/);

  const anon = await call(env, 'catalogue', 'POST');
  assert.equal(anon.status, 403, 'unauthenticated POST is 403');
  const viewer = await call(env, 'catalogue', 'POST', 'viewer-token');
  assert.equal(viewer.status, 403, 'viewer POST is 403');
  assert.equal(db.rows.length, 0, 'denied attempts never touch the catalogue tables');
  assert.ok(db.statements.filter((s) => /(DELETE FROM|INSERT INTO|INSERT OR REPLACE INTO) equipment_catalogue/.test(s.sql)).length === 0,
    'denied attempts never write the catalogue tables');

  const sync = await call(env, 'catalogue', 'POST', 'owner-token');
  assert.equal(sync.status, 200, 'owner POST syncs');
  const body = await sync.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.counts, { modules: 2, inverters: 2, cables: 1 });
  assert.equal(body.sha, FIXTURE_SHA);
  assert.equal(body.catalogue.modules.length, 2);
  assert.equal(body.catalogue.inverters.find((r) => r.make === 'Sungrow').maxIscA, '54');
  assert.ok(lastUrl.includes('export=download&id=fixture-file-id'), 'workbook pulled from Drive exactly once per click');
  assert.equal(db.rows.length, 5);
  assert.equal(db.meta.get('source').length > 0, true);

  const after = await call(env, 'catalogue');
  assert.equal(after.status, 200, 'GET after sync serves the stored catalogue');
  const stored = (await after.json()).catalogue;
  assert.equal(stored.modules.length, 2);
  assert.equal(stored.inverters.length, 2);
  assert.equal(stored.cables.length, 1);
  assert.equal(stored.sha, FIXTURE_SHA);
  assert.ok(stored.syncedAt);
  assert.equal(stored.modules.find((r) => r.model === 'Bi-55-545').wp, 545);
  assert.equal(stored.cables[0].voltage, '1.5 kV');

  const insertBinds = db.statements
    .filter((s) => s.sql.includes('INSERT INTO equipment_catalogue'))
    .reduce((n, s) => n + (s.params || []).length / 4, 0);
  assert.equal(insertBinds, 5, 'one bound row per catalogue row');
});

await withFetchStub(async () => {
  const missing = await call({ DB: memDb(), GDRIVE_MODE: 'public' }, 'catalogue', 'POST', 'owner-token');
  assert.equal(missing.status, 503, 'missing secrets still fails closed even with a token');
  assert.equal((await missing.json()).code, 'NOT_CONFIGURED');
});

const brokenEnv = { DB: memDb(), GDRIVE_MODE: 'public', GDRIVE_FILE_ID: 'broken-id' };
globalThis.fetch = async () => new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 });
try {
  const r = await call(brokenEnv, 'catalogue', 'POST', 'owner-token');
  assert.equal(r.status, 502, 'unreadable workbook is a 502, not a 200 with junk data');
  assert.match((await r.json()).error, /Catalogue sync failed/);
} finally { globalThis.fetch = realFetch; }

console.log('PASS: catalogue routes — GET 404-until-synced, owner-only POST, Drive pulled once, D1 round-trip, NOT_CONFIGURED 503, junk workbook 502.');
