/* Post-merge audit (2026-10-04): Cloudflare Worker regressions.
   Run: node qa/audit-fixes-worker.test.mjs
   Drives the real Worker (both entries) against an in-memory SQLite database
   through a D1-shaped adapter. No network, no mocks of app logic. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const workerEntry = await import('../platform/cloudflare/src/worker.js');
const indexEntry = await import('../platform/cloudflare/src/index.js');

let pass = 0;
const t = (name, cond, extra) => {
  assert.ok(cond, `FAIL: ${name}${extra !== undefined ? ' → ' + String(extra).slice(0, 400) : ''}`);
  pass++;
  console.log('  ✓', name);
};

/* Minimal D1 binding over node:sqlite. Anonymous ? params only, like D1. */
function d1Over(sqlite) {
  const stmt = (sql, params) => {
    const text = String(sql);
    const verb = text.trim().split(/\s+/)[0].toUpperCase();
    /* D1 .first()/.all() also work on INSERT/UPDATE/DELETE ... RETURNING
       (reference allocation relies on it); node:sqlite needs .get()/.all(). */
    const returnsRows = verb === 'SELECT' || verb === 'WITH' || verb === 'PRAGMA' ||
      verb === 'EXPLAIN' || /\bRETURNING\b/i.test(text);
    if (returnsRows) {
      return {
        run: async () => {
          const rows = sqlite.prepare(sql).all(...params);
          return { success: true, meta: { changes: rows.length, last_row_id: 0 } };
        },
        first: async () => sqlite.prepare(sql).get(...params) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...params) })
      };
    }
    return {
      run: async () => {
        const info = sqlite.prepare(sql).run(...params);
        return {
          success: true,
          meta: {
            changes: Number(info.changes || 0),
            last_row_id: Number(info.lastInsertRowid || 0)
          }
        };
      },
      first: async () => null,
      all: async () => ({ results: [] })
    };
  };
  return {
    prepare(sql) {
      /* D1 permits .run()/.first()/.all() with no .bind() for param-less SQL. */
      return { bind: (...params) => stmt(sql, params), ...stmt(sql, []) };
    },
    async batch(stmts) {
      return Promise.all(stmts.map((s) => s.run()));
    },
    async exec(sql) {
      sqlite.exec(sql);
      return { success: true };
    }
  };
}

function freshDb() {
  const sqlite = new DatabaseSync(':memory:');
  const schema = fs.readFileSync(path.join(ROOT, 'platform/schema.sql'), 'utf8');
  sqlite.exec(schema);
  return d1Over(sqlite);
}

const call = (entry, db, method, urlPath, { body, headers = {}, ip = '10.9.9.9' } = {}) =>
  entry.default.fetch(
    new Request('https://studio.test' + urlPath, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'CF-Connecting-IP': ip,
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    { DB: db, APP_URL: 'https://studio.test' },
    {}
  );

async function asJson(res) {
  let jsonBody = null;
  try { jsonBody = await res.clone().json(); } catch (_) { /* non-JSON */ }
  return { status: res.status, json: jsonBody, headers: res.headers };
}

async function signupOwner(entry, db, email) {
  const raw = await call(entry, db, 'POST', '/api/auth/register', {
    body: { email, name: 'Audit', password: 'Audit-pass-9', role: 'Viewer' }
  });
  const res = await asJson(raw);
  assert.equal(res.status, 201, `signup failed: ${res.status} ${JSON.stringify(res.json)}`);
  /* Fresh signups are viewers; promote in D1 for the write-path assertions. */
  await db.prepare("UPDATE users SET role = 'owner' WHERE id = ?").bind(res.json.user.id).run();
  return res.json;
}

const ENTRIES = [['worker', workerEntry], ['index', indexEntry]];
for (const [name, entry] of ENTRIES) {
  console.log(`— entry: ${name} —`);

  /* 1. Same-host Origin passes, foreign Origin is blocked, absent is allowed. */
  {
    const db = freshDb();
    const same = await asJson(await call(entry, db, 'POST', '/api/auth/register', {
      headers: { Origin: 'https://studio.test' },
      body: { email: 'same@example.com', name: 'S', password: 'Same-pass-9', role: 'Viewer' }
    }));
    t(`[${name}] same-host Origin register → 201`, same.status === 201, same.status);
    const evil = await asJson(await call(entry, db, 'POST', '/api/auth/register', {
      headers: { Origin: 'https://evil.example' },
      body: { email: 'evil@example.com', name: 'E', password: 'Evil-pass-9', role: 'Viewer' }
    }));
    t(`[${name}] foreign-Origin register → 403 ORIGIN_BLOCKED`,
      evil.status === 403 && evil.json && evil.json.code === 'ORIGIN_BLOCKED', evil.status);
    const none = await asJson(await call(entry, db, 'POST', '/api/auth/register', {
      headers: {},
      body: { email: 'plain@example.com', name: 'P', password: 'Plain-pass-9', role: 'Viewer' }
    }));
    t(`[${name}] absent-Origin register → 201`, none.status === 201, none.status);
  }

  /* 2. Auth throttle: 6th bad login backs off, correct login still works
     after the window is cleared, success resets the email counter. */
  {
    const db = freshDb();
    const me = await signupOwner(entry, db, 'throttle@example.com');
    const bad = { email: 'throttle@example.com', password: 'wrong-pass-1', role: 'Viewer' };
    for (let i = 1; i <= 5; i++) {
      const r = await asJson(await call(entry, db, 'POST', '/api/auth/login', { body: bad }));
      assert.equal(r.status, 401, `bad login ${i} should be 401, got ${r.status}`);
    }
    const sixth = await asJson(await call(entry, db, 'POST', '/api/auth/login', { body: bad }));
    t(`[${name}] 6th bad login → 429`,
      sixth.status === 429 && sixth.json && typeof sixth.json.error === 'string', sixth.status);
    t(`[${name}] 429 carries Retry-After`, Number(sixth.headers.get('Retry-After')) > 0);
    /* Clear the throttle rows (simulating window expiry) and log in cleanly. */
    await db.exec('DELETE FROM auth_throttles');
    const good = await asJson(await call(entry, db, 'POST', '/api/auth/login', {
      body: { email: 'throttle@example.com', password: 'Audit-pass-9' }
    }));
    t(`[${name}] correct login after window → 200`, good.status === 200, good.status);
    const row = await db.prepare('SELECT * FROM auth_throttles WHERE scope = ?')
      .bind('email:throttle@example.com').first();
    t(`[${name}] success clears email throttle`, row == null || row.fails === 0, JSON.stringify(row));
    assert.ok(me.token, 'signup token present');
  }

  /* 3. Expires-in-days is clamped; invalid input gets 30 days, never null. */
  {
    const db = freshDb();
    const me = await signupOwner(entry, db, 'expiry@example.com');
    const auth = { Authorization: `Bearer ${me.token}` };
    const mk = async () => {
      const r = await asJson(await call(entry, db, 'POST', '/api/proposals', {
        headers: auth, body: { title: 'Expiry prop' }
      }));
      assert.equal(r.status, 201, `proposal create failed: ${JSON.stringify(r.json)}`);
      const id = r.json.proposal.id;
      const v = await asJson(await call(entry, db, 'POST', `/api/proposals/${id}/publish`, {
        headers: auth, body: {}
      }));
      assert.equal(v.status, 201, `publish failed: ${JSON.stringify(v.json)}`);
      return id;
    };
    const pub = async (id, body) => asJson(await call(
      entry, db, 'POST', `/api/proposals/${id}/links`, { headers: auth, body }
    ));
    const bad = await pub(await mk(), { expiresInDays: -3 });
    const badAt = Date.parse(bad.json.link && bad.json.link.expiresAt);
    t(`[${name}] negative expiresInDays → ~30 days out`,
      bad.status === 201 && badAt - Date.now() > 29 * 864e5 && badAt - Date.now() < 31 * 864e5,
      `${bad.status} ${bad.json.link && bad.json.link.expiresAt}`);
    const huge = await pub(await mk(), { expiresInDays: 9999 });
    const hugeAt = Date.parse(huge.json.link && huge.json.link.expiresAt);
    t(`[${name}] expiresInDays capped at 365`,
      huge.status === 201 && hugeAt - Date.now() < 366 * 864e5,
      huge.json.link && huge.json.link.expiresAt);
  }

  /* 4. Portal: dead /open is gone, /event allowlist matches local. */
  {
    const db = freshDb();
    const me = await signupOwner(entry, db, 'portal@example.com');
    const auth = { Authorization: `Bearer ${me.token}` };
    const made = await asJson(await call(entry, db, 'POST', '/api/proposals', {
      headers: auth, body: { title: 'Portal prop' }
    }));
    const ver = await asJson(await call(
      entry, db, 'POST', `/api/proposals/${made.json.proposal.id}/publish`,
      { headers: auth, body: {} }
    ));
    assert.equal(ver.status, 201, `publish failed: ${JSON.stringify(ver.json)}`);
    const pub = await asJson(await call(
      entry, db, 'POST', `/api/proposals/${made.json.proposal.id}/links`,
      { headers: auth, body: { expiresInDays: 7 } }
    ));
    assert.equal(pub.status, 201, `link create failed: ${JSON.stringify(pub.json)}`);
    const token = pub.json.rawToken;
    const gone = await asJson(await call(entry, db, 'POST', '/api/portal/open', {
      body: { token }
    }));
    /* Removed route: falls through to the staff-session gate (401). The
       security property is that no snapshot leaks, whatever the code. */
    t(`[${name}] POST /api/portal/open leaks no snapshot`,
      gone.status !== 200 && !(gone.json && gone.json.snapshot),
      `${gone.status} ${JSON.stringify(gone.json).slice(0, 120)}`);
    const ok = await asJson(await call(entry, db, 'POST', '/api/portal/event', {
      body: { token, eventType: 'survey_requested', meta: { note: 'please call', stage: 'design', junk: 'x'.repeat(5000) } }
    }));
    t(`[${name}] portal/event supported type → 200`, ok.status === 200, ok.status);
    const ev = await db.prepare('SELECT * FROM portal_events WHERE event_type = ?')
      .bind('survey_requested').first();
    const storedMeta = ev ? JSON.parse(ev.meta_json) : null;
    t(`[${name}] portal meta allowlisted + bounded`,
      storedMeta && storedMeta.note === 'please call' && storedMeta.stage === 'design' && !('junk' in storedMeta),
      JSON.stringify(storedMeta));
    const no = await asJson(await call(entry, db, 'POST', '/api/portal/event', {
      body: { token, eventType: 'link_opened', meta: {} }
    }));
    t(`[${name}] portal/event rejects link_opened → 400`, no.status === 400, no.status);
  }

  /* 5. Proposal status is constrained on create + update. */
  {
    const db = freshDb();
    const me = await signupOwner(entry, db, 'status@example.com');
    const auth = { Authorization: `Bearer ${me.token}` };
    const bogus = await asJson(await call(entry, db, 'POST', '/api/proposals', {
      headers: auth, body: { title: 'Bogus', status: 'not-a-status' }
    }));
    t(`[${name}] create with bad status → 400`, bogus.status === 400, bogus.status);
    const made = await asJson(await call(entry, db, 'POST', '/api/proposals', {
      headers: auth, body: { title: 'Fine', status: 'draft' }
    }));
    const upd = await asJson(await call(entry, db, 'PUT', `/api/proposals/${made.json.proposal.id}`, {
      headers: auth, body: { status: 'hacked' }
    }));
    t(`[${name}] update with bad status → 400`, upd.status === 400, upd.status);
  }

  /* 6. Tasks: dueInDays parity + proposal ownership check. */
  {
    const db = freshDb();
    const me = await signupOwner(entry, db, 'tasks@example.com');
    const auth = { Authorization: `Bearer ${me.token}` };
    const due = await asJson(await call(entry, db, 'POST', '/api/tasks', {
      headers: auth, body: { title: 'Follow up', dueInDays: 3 }
    }));
    const dueAt = due.json && due.json.task ? Date.parse(due.json.task.dueAt) : NaN;
    t(`[${name}] tasks accept dueInDays`,
      due.status === 201 && dueAt - Date.now() > 2 * 864e5 && dueAt - Date.now() < 4 * 864e5,
      `${due.status} ${due.json && due.json.task && due.json.task.dueAt}`);
    const stranger = await asJson(await call(entry, db, 'POST', '/api/tasks', {
      headers: auth, body: { title: 'Nope', proposalId: 'prp_does_not_exist' }
    }));
    t(`[${name}] tasks reject foreign proposalId → 404`, stranger.status === 404, stranger.status);
  }

  /* 7. Gallery: declared oversize is rejected before buffering. */
  {
    const db = freshDb();
    const me = await signupOwner(entry, db, 'gallery@example.com');
    const res = await entry.default.fetch(
      new Request('https://studio.test/api/gallery', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${me.token}`,
          'Content-Type': 'image/jpeg',
          'Content-Length': '2000000',
          'X-Filename': 'roof.jpg',
          'CF-Connecting-IP': '10.9.9.9'
        },
        body: 'tiny'
      }),
      { DB: db, APP_URL: 'https://studio.test' },
      {}
    );
    t(`[${name}] oversize Content-Length → 413`, res.status === 413, res.status);
  }

  /* 8. Worker responses carry the anti-leak headers. */
  {
    const db = freshDb();
    const res = await call(entry, db, 'POST', '/api/auth/login', {
      body: { email: 'nobody@example.com', password: 'nope-nope-1' }
    });
    t(`[${name}] API sends Referrer-Policy: no-referrer`,
      (res.headers.get('Referrer-Policy') || '').toLowerCase() === 'no-referrer');
  }
}

console.log(`\n${pass} passed, 0 failed`);
