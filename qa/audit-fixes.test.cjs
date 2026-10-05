/* Post-merge audit (2026-10-04): local-server regressions.
   Run: node qa/audit-fixes.test.cjs
   Uses an isolated temp store and a free loopback port; deletes nothing else. */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
let pass = 0;
const t = (name, cond, extra) => {
  assert.ok(cond, `FAIL: ${name}${extra !== undefined ? ' → ' + String(extra).slice(0, 400) : ''}`);
  pass++;
  console.log('  ✓', name);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot(envExtra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-audit-'));
  const port = 18800 + Math.floor(Math.random() * 900);
  const store = path.join(dir, 'db.json');
  const child = spawn(process.execPath, ['platform/local-server/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      QS_STORE_PATH: store,
      QS_DATA_DIR: dir,
      PORT: String(port),
      ...envExtra
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/index.html`);
      if (r.ok) break;
    } catch (_) { /* still booting */ }
    await sleep(100);
    if (i === 99) {
      child.kill();
      throw new Error('local server did not boot');
    }
  }
  return {
    base,
    dir,
    async stop() {
      child.kill();
      await sleep(250);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

const api = (base, token, extraHeaders = {}) => async (method, url, body) => {
  const headers = { ...extraHeaders };
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + url, { method, headers, body: payload });
  let jsonBody = null;
  try { jsonBody = await res.clone().json(); } catch (_) { /* non-JSON */ }
  return { status: res.status, json: jsonBody, headers: res.headers };
};

async function signup(base, email) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: 'Audit', password: 'Audit-pass-9', role: 'Viewer' })
  });
  const text = await res.text();
  assert.equal(res.status, 201, `signup for ${email} failed with ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

(async () => {
  /* Gate the wait behind a fresh boot so port probes do not slow other tests. */
  const srv = await boot({ QS_ENABLE_DEV_ROUTES: '' });
  try {
    const { base } = srv;
    const anon = api(base);

    /* 1. Static allowlist: source, git, docs, and db stay unreachable. */
    for (const blocked of [
      '/platform/local-server/server.js',
      '/platform/cloudflare/src/worker.js',
      '/.git/HEAD',
      '/.git/config',
      '/platform/data/db.json',
      '/docs/security-audit-2026-10-04.md',
      '/qa/audit-fixes.test.cjs',
      '/drop-bag-ref.html',
      '/preview-solar-login.html'
    ]) {
      const r = await anon('GET', blocked);
      t(`GET ${blocked} → 404`, r.status === 404, r.status);
    }
    for (const open of ['/portal.html', '/share.html', '/quotation.html', '/dashboard.html', '/index.html', '/gallery.html', '/oauth-complete.html']) {
      const r = await anon('GET', open);
      t(`GET ${open} → 200`, r.status === 200, r.status);
      t(`${open} sends Referrer-Policy`,
        (r.headers.get('referrer-policy') || '').toLowerCase() === 'no-referrer');
      t(`${open} sends X-Content-Type-Options`,
        (r.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff');
    }
    const css = await anon('GET', '/assets/css/gallery.css');
    t('allowlisted asset → 200', css.status === 200, css.status);

    /* 2. Cross-site mutation requires the app origin. */
    const evil = api(base, null, { Origin: 'https://evil.example' });
    const cross = await evil('POST', '/api/auth/register', {
      email: 'evil@example.com', name: 'E', password: 'Evil-pass-9', role: 'Viewer'
    });
    t('foreign-Origin register → 403 ORIGIN_BLOCKED',
      cross.status === 403 && cross.json && cross.json.code === 'ORIGIN_BLOCKED', cross.status);
    const me = await signup(base, 'owner@example.com');
    /* Fresh signups are viewers (least privilege); promote the seeded user to
       owner in the temp store so the write-path assertions can run. */
    {
      const storePath = path.join(srv.dir, 'db.json');
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      store.users.find((u) => u.id === me.user.id).role = 'owner';
      fs.writeFileSync(storePath, JSON.stringify(store));
    }

    /* 3. Portal meta is allowlisted + bounded. */
    const authed = api(base, me.token);
    const prop = await authed('POST', '/api/proposals', { title: 'Audit prop', status: 'draft' });
    assert.equal(prop.status, 201, 'proposal create failed');
    const published = await authed('POST', `/api/proposals/${prop.json.proposal.id}/publish`, { expiresInDays: 7 });
    assert.equal(published.status, 201, `publish failed: ${published.status}`);
    const token = published.json.access.token;
    /* Real portal.js keys (stage/wants/loc/format) must survive; junk must not. */
    const badMeta = {
      note: 'x'.repeat(5000),
      stage: 'design', wants: 'callback', loc: 'Pune', format: 'pdf',
      when: 'soon', nested: { deep: true }
    };
    const pe = await anon('POST', '/api/portal/event', { token, type: 'survey_requested', meta: badMeta });
    t('portal/event accepts supported type', pe.status === 201, pe.status);
    const store = JSON.parse(fs.readFileSync(path.join(srv.dir, 'db.json'), 'utf8'));
    const event = store.events.find((e) => e.event_type === 'survey_requested');
    const storedMeta = event ? JSON.parse(event.meta_json) : null;
    t('portal meta allowlist drops unknown keys + caps note at 500',
      storedMeta && storedMeta.note === 'x'.repeat(500) &&
      storedMeta.stage === 'design' && storedMeta.wants === 'callback' &&
      storedMeta.loc === 'Pune' && storedMeta.format === 'pdf' &&
      !('when' in storedMeta) && !('nested' in storedMeta),
      JSON.stringify(storedMeta).slice(0, 200));
    const unsupported = await anon('POST', '/api/portal/event', { token, type: 'link_opened', meta: {} });
    t('portal/event rejects link_opened', unsupported.status === 400, unsupported.status);

    /* 4. Proposal status is constrained. */
    const bogus = await authed('POST', '/api/proposals', { title: 'Bogus', status: 'not-a-status' });
    t('create with bad status → 400', bogus.status === 400, bogus.status);
    const bogusUpdate = await authed('PUT', `/api/proposals/${prop.json.proposal.id}`, { status: 'hacked' });
    t('update with bad status → 400', bogusUpdate.status === 400, bogusUpdate.status);

    /* 5. Dev routes stay dark without the flag. */
    const devList = await anon('GET', '/api/dev/bag-ref-list');
    t('dev list → 404 without flag', devList.status === 404, devList.status);
    const devPage = await anon('GET', '/drop-bag-ref.html');
    t('dev page → 404 without flag', devPage.status === 404, devPage.status);
  } finally {
    await srv.stop();
  }

  /* 6. With the flag, dev routes answer (200/400/500 all prove reachability). */
  const dev = await boot({ QS_ENABLE_DEV_ROUTES: '1' });
  try {
    const r = await api(dev.base)('GET', '/api/dev/bag-ref-list');
    t('dev list answers with flag', r.status === 200, r.status);
    const page = await api(dev.base)('GET', '/drop-bag-ref.html');
    t('dev page answers with flag', page.status === 200, page.status);
  } finally {
    await dev.stop();
  }

  console.log(`\n${pass} passed, 0 failed`);
})().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
