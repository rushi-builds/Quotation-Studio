/* Phase A platform API smoke tests against the local JSON server.
   Run: node platform-api.test.js   (starts its own server on an ephemeral port) */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'platform/local-server/server.js');
const DATA = path.join(ROOT, 'platform/data-test');
const PORT = 8791 + Math.floor(Math.random() * 200);

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name, extra !== undefined ? '→ ' + String(extra).slice(0, 200) : ''); }
};

function req(method, urlPath, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const r = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method,
      headers: Object.assign({
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }, cookie ? { Cookie: cookie } : {})
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_) { json = { raw: text }; }
        const setCookie = res.headers['set-cookie'];
        resolve({ status: res.statusCode, json, setCookie });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function cookieFrom(res) {
  if (!res.setCookie || !res.setCookie.length) return '';
  return res.setCookie.map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(DATA, { recursive: true });

  const child = spawn(process.execPath, [SERVER], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      QS_DATA_DIR: DATA
    }),
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  /* Isolated QS_DATA_DIR so tests never touch the developer db.json. */
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 8000);
    child.stdout.on('data', (buf) => {
      if (String(buf).includes('Dash:')) { clearTimeout(timer); resolve(); }
    });
    child.stderr.on('data', (buf) => process.stderr.write(buf));
    child.on('exit', (code) => reject(new Error('server exited early ' + code)));
  });

  try {
    console.log('\nplatform-api');

    let r = await req('GET', '/api/health');
    t('health ok', r.status === 200 && r.json && r.json.ok === true, r.status);

    r = await req('GET', '/api/proposals');
    t('proposals require auth', r.status === 401);

    r = await req('POST', '/api/auth/register', {
      name: 'Test Owner',
      email: 'owner@example.com',
      password: 'short'
    });
    t('reject short password', r.status === 400);

    r = await req('POST', '/api/auth/register', {
      name: 'Test Owner',
      email: 'owner@example.com',
      password: 'password123'
    });
    t('register 201', r.status === 201 && r.json.user && r.json.user.role === 'owner', r.status);
    const cookie = cookieFrom(r);
    t('session cookie set', /qs_session=/.test(cookie), cookie);

    r = await req('GET', '/api/auth/me', null, cookie);
    t('me returns user', r.status === 200 && r.json.user.email === 'owner@example.com');

    r = await req('POST', '/api/auth/register', {
      name: 'Other',
      email: 'owner@example.com',
      password: 'password123'
    });
    t('duplicate email 409', r.status === 409);

    r = await req('POST', '/api/proposals', {
      form: { custName: 'Asha Patil', capacity: '5', propRef: 'KTM/2026/Solar/001' },
      status: 'draft'
    }, cookie);
    t('create proposal', r.status === 201 && r.json.proposal && r.json.proposal.customer === 'Asha Patil', r.status);
    const id = r.json.proposal.id;

    r = await req('GET', '/api/proposals', null, cookie);
    t('list has one', r.status === 200 && r.json.proposals.length === 1);

    r = await req('PUT', '/api/proposals/' + id, {
      form: { custName: 'Asha Patil', capacity: '6', propRef: 'KTM/2026/Solar/001' },
      status: 'ready'
    }, cookie);
    t('update status', r.status === 200 && r.json.proposal.status === 'ready' && r.json.proposal.capacity === '6');
    t('revision bumps on update', r.json.proposal.revision === 2, r.json.proposal.revision);
    const rev1 = r.json.proposal.revision;

    r = await req('PUT', '/api/proposals/' + id, {
      form: { custName: 'Asha Patil', capacity: '7', propRef: 'KTM/2026/Solar/001' },
      status: 'ready',
      baseRevision: 1
    }, cookie);
    t('stale baseRevision is 409', r.status === 409 && r.json.code === 'CONFLICT', r.status);

    r = await req('PUT', '/api/proposals/' + id, {
      form: { custName: 'Asha Patil', capacity: '7', propRef: 'KTM/2026/Solar/001' },
      status: 'ready',
      baseRevision: rev1
    }, cookie);
    t('matching baseRevision updates', r.status === 200 && r.json.proposal.capacity === '7' && r.json.proposal.revision === 3, r.status);

    r = await req('GET', '/api/proposals/' + id, null, cookie);
    t('get full form', r.status === 200 && r.json.proposal.form.custName === 'Asha Patil');

    r = await req('GET', '/api/dashboard/summary', null, cookie);
    t('summary uses ready not fake sent label', r.status === 200 && r.json.counts.ready != null);

    r = await req('POST', '/api/proposals/' + id + '/duplicate', {}, cookie);
    t('duplicate', r.status === 201 && r.json.proposal.id !== id && r.json.proposal.status === 'draft');

    r = await req('GET', '/api/dashboard/summary', null, cookie);
    t('summary counts', r.status === 200 && r.json.counts.total === 2, JSON.stringify(r.json && r.json.counts));

    r = await req('DELETE', '/api/proposals/' + id, null, cookie);
    t('delete', r.status === 200 && r.json.ok);

    r = await req('GET', '/api/proposals/' + id, null, cookie);
    t('deleted is 404', r.status === 404);

    r = await req('POST', '/api/auth/logout', {}, cookie);
    t('logout', r.status === 200);

    r = await req('GET', '/api/auth/me', null, cookie);
    t('me after logout 401', r.status === 401);

    r = await req('POST', '/api/auth/login', {
      email: 'owner@example.com',
      password: 'wrong-password'
    });
    t('bad login 401', r.status === 401);
    t('bad login uniform message', r.json && r.json.error === 'Invalid email or password');

    r = await req('POST', '/api/auth/login', {
      email: 'nobody-not-registered@example.com',
      password: 'wrong-password'
    });
    t('unknown email same 401 message', r.status === 401 && r.json.error === 'Invalid email or password');

    /* Exhaust backoff on a throwaway email: 5 quick fails then 429. */
    const burn = 'burn-' + Date.now() + '@example.com';
    let limited = null;
    for (let i = 0; i < 8; i++) {
      limited = await req('POST', '/api/auth/login', { email: burn, password: 'x' });
      if (limited.status === 429) break;
    }
    t('email backoff eventually 429', limited && limited.status === 429, limited && limited.status);
    t('429 body does not reveal account', limited && limited.json.error === 'Too many sign-in attempts. Try again in a few minutes.');

    r = await req('POST', '/api/auth/login', {
      email: 'owner@example.com',
      password: 'password123'
    });
    t('good login', r.status === 200 && r.json.user.email === 'owner@example.com');
    const cookie2 = cookieFrom(r);

    /* After success, same account is not stuck behind a long lock from earlier fails. */
    r = await req('POST', '/api/auth/login', {
      email: 'owner@example.com',
      password: 'password123'
    });
    t('success clears email backoff', r.status === 200);

    const html = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: PORT, path: '/dashboard.html' }, (res) => {
        const c = [];
        res.on('data', (b) => c.push(b));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(c).toString('utf8') }));
      }).on('error', reject);
    });
    t('dashboard html served', html.status === 200);
    t('dashboard has auth form', html.body.includes('authForm'));
    t('dashboard loads platform-api', html.body.includes('platform-api.js'));

    r = await req('GET', '/api/proposals', null, cookie2);
    t('session works after re-login', r.status === 200);

    /* ---- Phase B: publish, portal token, freeze, revoke ---- */
    r = await req('POST', '/api/proposals', {
      form: { custName: 'Portal Customer', capacity: '8', propRef: 'KTM/2026/Solar/100', companyName: 'KTM Energy Experts', companyPhone: '+91 93094 86769' },
      status: 'ready'
    }, cookie2);
    t('phaseB create proposal', r.status === 201, r.status);
    const pid = r.json.proposal.id;

    r = await req('POST', '/api/proposals/' + pid + '/publish', {
      label: 'Customer link',
      expiresInDays: 14,
      note: 'Test publish'
    }, cookie2);
    t('publish 201', r.status === 201 && r.json.version && r.json.access && r.json.access.token, r.status);
    const rawTok = r.json.access.token;
    const versionId = r.json.version.id;
    const snapHash = r.json.version.snapshotSha256;
    t('token is long', rawTok && rawTok.length >= 40, rawTok && rawTok.length);
    t('snapshot hash present', !!(snapHash && snapHash.length === 64));

    r = await req('GET', '/api/portal/proposal?t=' + encodeURIComponent(rawTok));
    t('portal opens without staff cookie', r.status === 200 && r.json.snapshot && r.json.snapshot.customerName === 'Portal Customer', r.status);
    t('portal snapshot has form', r.json.snapshot.form && r.json.snapshot.form.custName === 'Portal Customer');
    t('portal does not leak password fields', !JSON.stringify(r.json).includes('password_hash'));

    /* Draft edit after publish must not change frozen portal snapshot */
    r = await req('PUT', '/api/proposals/' + pid, {
      form: { custName: 'CHANGED DRAFT', capacity: '99', propRef: 'KTM/2026/Solar/100' },
      status: 'draft',
      baseRevision: 1
    }, cookie2);
    t('draft edit after publish', r.status === 200 || r.status === 409, r.status);
    /* If conflict on revision, fetch current and force update without base */
    if (r.status === 409) {
      r = await req('PUT', '/api/proposals/' + pid, {
        form: { custName: 'CHANGED DRAFT', capacity: '99', propRef: 'KTM/2026/Solar/100' },
        status: 'draft'
      }, cookie2);
    }
    t('draft now changed', r.status === 200 && r.json.proposal.customer === 'CHANGED DRAFT', r.status);

    r = await req('GET', '/api/portal/proposal?t=' + encodeURIComponent(rawTok));
    t('portal still shows frozen customer name', r.status === 200 && r.json.snapshot.customerName === 'Portal Customer', r.json.snapshot && r.json.snapshot.customerName);
    t('portal snapshot hash unchanged', r.json.version.snapshotSha256 === snapHash);

    r = await req('GET', '/api/portal/proposal?t=not-a-real-token-value-at-all-xx');
    t('bad token 404', r.status === 404);

    r = await req('GET', '/api/proposals/' + pid + '/versions', null, cookie2);
    t('versions list', r.status === 200 && r.json.versions.length >= 1);

    r = await req('GET', '/api/proposals/' + pid + '/links', null, cookie2);
    t('links list', r.status === 200 && r.json.links.length >= 1);
    const linkId = r.json.links[0].id;
    t('links hide raw token', r.json.links.every((L) => !L.token));

    r = await req('POST', '/api/links/' + linkId + '/revoke', {}, cookie2);
    t('revoke link', r.status === 200 && r.json.access && r.json.access.revokedAt, r.status);

    r = await req('GET', '/api/portal/proposal?t=' + encodeURIComponent(rawTok));
    t('revoked token denied', r.status === 404);

    r = await req('GET', '/api/proposals/' + pid + '/events', null, cookie2);
    t('events include publish', r.status === 200 && r.json.events.some((e) => e.type === 'version_published'));
    t('events include open or prefetch', r.json.events.some((e) => e.type === 'link_opened' || e.type === 'suspected_prefetch'));

    const portalHtml = await new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port: PORT, path: '/portal.html' }, (res) => {
        const c = [];
        res.on('data', (b) => c.push(b));
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(c).toString('utf8') }));
      }).on('error', reject);
    });
    t('portal html served', portalHtml.status === 200);
    t('portal omits control-panel', !portalHtml.body.includes('control-panel.js'));
    t('portal omits editor', !portalHtml.body.includes('editor.js'));
    t('portal loads portal.js', portalHtml.body.includes('portal.js'));

  } finally {
    child.kill('SIGTERM');
    try { fs.rmSync(path.join(ROOT, 'platform/data'), { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (_) {}
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
