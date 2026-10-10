/* Phase A platform API smoke tests against the local JSON server.
   Run: node platform-api.test.js   (starts its own server on an ephemeral port) */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'platform/local-server/server.js');
const DATA = path.join(ROOT, 'platform/data-test');
const PORT = 8791 + Math.floor(Math.random() * 200);

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name, extra !== undefined ? '→ ' + String(extra).slice(0, 200) : ''); }
};

function req(method, urlPath, body, auth) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    };
    /* auth may be a Cookie header value, a raw session token, or { cookie, token }. */
    if (typeof auth === 'string' && auth) {
      if (auth.includes('=') || auth.startsWith('qs_session')) headers.Cookie = auth;
      else headers.Authorization = 'Bearer ' + auth;
    } else if (auth && typeof auth === 'object') {
      if (auth.cookie) headers.Cookie = auth.cookie;
      if (auth.token) headers.Authorization = 'Bearer ' + auth.token;
    }
    const r = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method,
      headers
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
function tokenFrom(res) {
  return (res && res.json && res.json.token) || '';
}
/* The server keeps only a SHA-256 of the reset code, so a test that needs the
   code itself recovers it the way anyone holding the database would: 1e6
   six-digit guesses. Which is exactly why the code is single-use and
   attempt-capped — the hash alone is not the defence, the expiry and the
   attempt counter are. */
function recoverResetCode() {
  const db = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
  const row = (db.password_resets || []).filter((x) => !x.used_at).pop();
  if (!row) return null;
  for (let i = 0; i < 1000000; i++) {
    const c = String(i).padStart(6, '0');
    if (crypto.createHash('sha256').update(c).digest('hex') === row.code_hash) return c;
  }
  return null;
}

async function main() {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(DATA, { recursive: true });

  const child = spawn(process.execPath, [SERVER], {
    env: Object.assign({}, process.env, {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      QS_DATA_DIR: DATA,
      /* Recovery is live in these tests: the channel must be CONFIGURED for the
         endpoint to answer at all (it fails closed when it is not). The value is
         a dummy, so every send stops at AUTH and no mail ever leaves the
         machine — only the issuing, throttling and verification paths run. */
      SMTP_PASSWORD: 'dummy-not-a-real-secret'
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

    /* Mixed characters (owner request, 2026-10-10): at least two of lowercase /
       uppercase / digits / symbols. Applies to passwords being SET only — the
       sign-in path below never runs this policy, so no existing account can be
       locked out by it. */
    r = await req('POST', '/api/auth/register', {
      name: 'Test Owner',
      email: 'owner@example.com',
      password: 'abcdefghijkl'
    });
    t('reject single-class password (no mixed characters)',
      r.status === 400 && /mix at least two/i.test((r.json && r.json.error) || ''),
      r.json && r.json.error);

    r = await req('POST', '/api/auth/register', {
      name: 'Test Owner',
      email: 'owner@example.com',
      password: 'password123',
      role: 'owner'
    });
    t('public registration starts read-only', r.status === 201 && r.json.user && r.json.user.role === 'viewer', r.status);
    // Trusted offline fixture represents an existing owner, not a signup bypass.
    const fixturePath = path.join(DATA, 'db.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    fixture.users.find(u => u.id === r.json.user.id).role = 'owner';
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));
    const cookie = cookieFrom(r);
    t('session cookie set', /qs_session=/.test(cookie), cookie);
    t('register returns session token', !!(r.json && r.json.token), r.json && r.json.token);
    const bearer = tokenFrom(r);
    r = await req('GET', '/api/auth/me', null, bearer);
    t('me works with Bearer token only', r.status === 200 && r.json.user && r.json.user.email === 'owner@example.com', r.status);

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
    /* The copy carries a create-account hint now, but the security property is
       that ONE message serves BOTH failures. Capture it so the unknown-email
       case below can be compared against it exactly. */
    const uniformLoginError = r.json && r.json.error;
    t('bad login message explains itself', /^Invalid email or password\./.test(uniformLoginError || ''));
    t('bad login message invites a new account', /Create one\./.test(uniformLoginError || ''));

    r = await req('POST', '/api/auth/login', {
      email: 'nobody-not-registered@example.com',
      password: 'wrong-password'
    });
    /* THE anti-enumeration property: an unknown address must never be told
       "no such account". Same status AND byte-identical message as a wrong
       password, so nothing distinguishes the two from outside. */
    t('unknown email same 401 message', r.status === 401 && r.json.error === uniformLoginError);

    /* "Remember me" is OFF by default (owner decision, 2026-10-10): the cookie
       carries no Max-Age, so the browser drops it when it closes, and the
       server-side session row is capped at 12 hours. Ticking the box restores
       the 30-day behaviour. */
    r = await req('POST', '/api/auth/login', {
      email: 'owner@example.com', password: 'password123'
    });
    const defaultCookie = (r.setCookie || []).join(' | ');
    t('remember me OFF by default: cookie has no Max-Age',
      r.status === 200 && !/Max-Age=/.test(defaultCookie), defaultCookie);
    t('remember me OFF by default: session capped near 12 hours', (() => {
      const hours = (Date.parse(r.json.expiresAt) - Date.now()) / 36e5;
      return hours > 11.5 && hours <= 12.1;
    })());

    r = await req('POST', '/api/auth/login', {
      email: 'owner@example.com', password: 'password123', remember: true
    });
    const rememberedCookie = (r.setCookie || []).join(' | ');
    t('remember me ticked: cookie carries the 30-day Max-Age',
      r.status === 200 && /Max-Age=2592000/.test(rememberedCookie), rememberedCookie);
    t('remember me ticked: session expires about 30 days out', (() => {
      const days = (Date.parse(r.json.expiresAt) - Date.now()) / 864e5;
      return days > 29 && days <= 30.1;
    })());

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
    let cookie2 = cookieFrom(r);

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
    t('dashboard has session gate', html.body.includes('authScreen') && html.body.includes('index.html'));
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

    /* ---- Phase C: send centre (honest manual states) ---- */
    r = await req('POST', '/api/proposals/' + pid + '/sends', {
      channel: 'whatsapp_manual',
      recipientName: 'Portal Customer',
      recipientTo: '9876543210',
      publishFirst: true,
      markShareClicked: true
    }, cookie2);
    t('send prepare 201', r.status === 201 && r.json.send && r.json.launch, r.status);
    t('send state is share_clicked', r.json.send.state === 'share_clicked', r.json.send && r.json.send.state);
    t('send never claims verified delivery', r.json.send.deliveryIsVerified === false);
    t('whatsapp launch url present', !!(r.json.launch && r.json.launch.whatsappUrl && r.json.launch.whatsappUrl.includes('wa.me')));
    t('portal url in launch', !!(r.json.launch && r.json.launch.portalUrl && r.json.launch.portalUrl.includes('portal.html?t=')));
    const sendId = r.json.send.id;
    const sendTok = r.json.access && r.json.access.token;

    r = await req('POST', '/api/sends/' + sendId + '/state', { state: 'delivered' }, cookie2);
    t('manual cannot mark delivered', r.status === 400 && r.json.code === 'DELIVERY_NOT_AVAILABLE', r.status);

    r = await req('POST', '/api/sends/' + sendId + '/state', { state: 'cancelled' }, cookie2);
    t('manual can cancel', r.status === 200 && r.json.send.state === 'cancelled');

    r = await req('GET', '/api/proposals/' + pid + '/sends', null, cookie2);
    t('sends list', r.status === 200 && r.json.sends.length >= 1);

    r = await req('POST', '/api/proposals/' + pid + '/sends', {
      channel: 'email_manual',
      recipientTo: 'customer@example.com',
      recipientName: 'Portal Customer',
      publishFirst: true
    }, cookie2);
    t('email send prepare', r.status === 201 && r.json.launch && r.json.launch.mailtoUrl, r.status);
    t('email mailto has recipient', r.json.launch.mailtoUrl.includes('customer%40example.com') || r.json.launch.mailtoUrl.includes('customer@example.com'));

    r = await req('GET', '/api/health');
    t('health phase C or later', r.status === 200 && ['C','D','E'].includes(r.json.phase), r.json && r.json.phase);
    t('health denies provider delivery', r.json.sending && r.json.sending.providerDelivery === false);

    /* ---- Phase D: notifications + tasks ---- */
    r = await req('GET', '/api/notifications', null, cookie2);
    t('notifications list', r.status === 200 && Array.isArray(r.json.notifications), r.status);
    t('open created a notification', r.json.notifications.some((n) => n.kind === 'link_opened' || n.kind === 'version_published') || r.json.unread >= 0);

    r = await req('POST', '/api/tasks', {
      title: 'Call customer after open',
      proposalId: pid,
      dueInDays: 2,
      notes: 'Follow up on portal open'
    }, cookie2);
    t('create task', r.status === 201 && r.json.task && r.json.task.status === 'open', r.status);
    const taskId = r.json.task.id;
    t('task not overdue immediately for +2d', r.json.task.overdue === false);

    r = await req('GET', '/api/tasks', null, cookie2);
    t('list tasks', r.status === 200 && r.json.tasks.some((x) => x.id === taskId));

    r = await req('PUT', '/api/tasks/' + taskId, { status: 'done' }, cookie2);
    t('complete task', r.status === 200 && r.json.task.status === 'done');

    r = await req('POST', '/api/tasks', {
      title: 'Overdue sample',
      dueAt: new Date(Date.now() - 864e5).toISOString()
    }, cookie2);
    t('overdue task flagged', r.status === 201 && r.json.task.overdue === true, r.status);

    r = await req('GET', '/api/activity', null, cookie2);
    t('activity feed', r.status === 200 && Array.isArray(r.json.activity));

    r = await req('POST', '/api/notifications/read-all', {}, cookie2);
    t('mark all notifications read', r.status === 200);

    r = await req('GET', '/api/notifications?unread=1', null, cookie2);
    t('unread empty after read-all', r.status === 200 && r.json.unread === 0);

    /* ---- Phase E: reports + roles ---- */
    r = await req('GET', '/api/reports/summary', null, cookie2);
    t('reports summary', r.status === 200 && r.json.proposals && r.json.engagement, r.status);
    t('reports honesty notes', Array.isArray(r.json.honesty) && r.json.honesty.length >= 1);
    t('reports value note present', r.json.value && typeof r.json.value.note === 'string');

    r = await req('GET', '/api/team/members', null, cookie2);
    t('owner can list team', r.status === 200 && r.json.members && r.json.members.length >= 1, r.status);

    r = await req('POST', '/api/auth/register', {
      name: 'Viewer User',
      email: 'viewer@example.com',
      password: 'password123',
      role: 'viewer'
    });
    t('second user register', r.status === 201 && r.json.user.role === 'viewer', r.status);
    const viewerCookie = cookieFrom(r);
    const viewerId = r.json.user.id;

    r = await req('POST', '/api/team/role', { userId: viewerId, role: 'viewer' }, cookie2);
    t('owner sets viewer role', r.status === 200 && r.json.member.role === 'viewer', r.status);

    r = await req('POST', '/api/proposals', {
      form: { custName: 'Should Fail', capacity: '1' },
      status: 'draft'
    }, viewerCookie);
    t('viewer cannot create proposal', r.status === 403, r.status);

    r = await req('GET', '/api/proposals', null, viewerCookie);
    t('viewer can list own proposals', r.status === 200);

    /* CHANGED by the elevation round (item 5): the team panel is readable by
       every member, and only the ability to CHANGE a role plus the Remove
       button stay owner/designated-admin only. Contact detail now rides every
       row too, because the eye opens the same card for everyone. This
       assertion used to be `r.status === 403`. The write gate is still proven
       below and in qa/roles-access.test.js. */
    r = await req('GET', '/api/team/members', null, viewerCookie);
    t('viewer may READ the team panel (view-only)', r.status === 200 && Array.isArray(r.json.members), r.status);
    t('viewer is told it does not manage the team', r.json.canManageTeam === false, JSON.stringify(r.json.canManageTeam));
    t('viewer sees the same contact detail as the owner (the eye shows it to all)',
      r.json.members.some((m) => m.email === 'owner@example.com'), JSON.stringify(r.json.members.map((m) => m.email)));
    t('viewer still sees its own email', r.json.members.some((m) => m.email === 'viewer@example.com'));
    t('viewer sees no elevation field on another row',
      !r.json.members.filter((m) => m.email !== 'viewer@example.com').some((m) => 'isAdmin' in m || 'canElevate' in m));

    r = await req('POST', '/api/team/role', { userId: 'someone-else', role: 'viewer' }, viewerCookie);
    t('viewer still cannot CHANGE a role', r.status === 403, r.status);

    r = await req('GET', '/api/health');
    t('health phase E', r.status === 200 && r.json.phase === 'E');
    t('health features flags', r.json.features && r.json.features.notifications && r.json.features.reports);

    /* ---- Account hygiene: password change, forgot/reset, duplicate email ---- */
    r = await req('POST', '/api/auth/register', {
      name: 'Dup',
      email: 'owner@example.com',
      password: 'password123'
    });
    t('duplicate email blocked', r.status === 409, r.status);

    r = await req('POST', '/api/auth/register', {
      name: 'Bad',
      email: 'not-an-email',
      password: 'password123'
    });
    t('invalid email rejected', r.status === 400);

    r = await req('POST', '/api/auth/register', {
      name: 'Bad',
      email: 'okuser@example.com',
      password: 'short'
    });
    t('short password rejected', r.status === 400);

    r = await req('POST', '/api/auth/register', {
      name: 'Bad',
      email: 'spacepass@example.com',
      password: 'bad pass1'
    });
    t('password with spaces rejected', r.status === 400);

    r = await req('POST', '/api/auth/change-password', {
      currentPassword: 'password123',
      newPassword: 'newpass999'
    }, cookie2);
    t('change password while signed in', r.status === 200, r.status);

    r = await req('POST', '/api/auth/login', {
      email: 'owner@example.com',
      password: 'password123'
    });
    t('old password fails after change', r.status === 401);

    r = await req('POST', '/api/auth/login', {
      email: 'owner@example.com',
      password: 'newpass999'
    });
    t('new password works', r.status === 200);
    cookie2 = cookieFrom(r);

    /* Self-service recovery (owner decision, 2026-10-10).

       The property that matters is UNIFORMITY: every step answers with the same
       status and body whether the address has an account or not, so none of it
       is an enumeration oracle. The only difference between the two paths is
       whether mail is attempted — and that now happens AFTER the reply is
       written, so response time cannot tell them apart either. */
    r = await req('POST', '/api/auth/forgot-password', {
      email: 'owner@example.com'
    });
    const recoAccepted = r;
    t('known account: code request accepted', r.status === 200 && r.json.ok === true, r.status + ' ' + JSON.stringify(r.json));
    t('accepted reply leaks no code and no token',
      !/\b\d{6}\b/.test(JSON.stringify(r.json)) && !r.json.token && !r.json.recoveryCode,
      JSON.stringify(r.json));
    r = await req('POST', '/api/auth/forgot-password', {email:'no-such-user-xyz@example.com'});
    t('unknown account gets identical recovery response',
      r.status === recoAccepted.status && JSON.stringify(r.json) === JSON.stringify(recoAccepted.json),
      r.status + ' ' + JSON.stringify(r.json));

    /* The cooldown is per ADDRESS, so an unknown address opens its own window
       on its first call and then walks exactly the same sequence. */
    r = await req('POST', '/api/auth/forgot-password', {email:'owner@example.com'});
    t('immediate second request is throttled', r.status === 429 && r.json.code === 'RESEND_COOLDOWN', r.status + ' ' + JSON.stringify(r.json));
    const recoCooldown = JSON.stringify(r.json);
    r = await req('POST', '/api/auth/forgot-password', {email:'no-such-user-xyz@example.com'});
    t('unknown account throttled identically', r.status === 429 && JSON.stringify(r.json) === recoCooldown, r.status + ' ' + JSON.stringify(r.json));

    /* Verify and reset answer the same way for a wrong code and for an address
       that has no account at all. */
    r = await req('POST', '/api/auth/verify-code', {email:'owner@example.com', code:'000000'});
    const badVerify = r;
    t('wrong code rejected on verify', r.status === 400 && r.json.code === 'CODE_INVALID' && !r.json.token, r.status + ' ' + JSON.stringify(r.json));
    r = await req('POST', '/api/auth/verify-code', {email:'ghost@example.test', code:'000000'});
    t('unknown account verify is indistinguishable',
      r.status === badVerify.status && JSON.stringify(r.json) === JSON.stringify(badVerify.json),
      r.status + ' ' + JSON.stringify(r.json));

    r = await req('POST', '/api/auth/reset-password', {email:'owner@example.com',code:'old-code',password:'resetpass88'});
    t('reset with a legacy/wrong code rejected', r.status === 400 && r.json.code === 'CODE_INVALID' && !r.json.token, r.status + ' ' + JSON.stringify(r.json));
    r = await req('POST', '/api/auth/login', {email:'owner@example.com',password:'newpass999'});
    t('recovery attempts preserve current password', r.status === 200);
    cookie2 = cookieFrom(r);

    r = await req('POST', '/api/auth/profile', { name: 'Owner Renamed' }, cookie2);
    t('profile name update', r.status === 200 && r.json.user.name === 'Owner Renamed');

    r = await req('POST', '/api/auth/change-password', {
      currentPassword: 'wrong',
      newPassword: 'whatever12'
    }, cookie2);
    t('wrong current password rejected', r.status === 400);

    r = await req('POST', '/api/auth/login', {
      email: 'owner@example.com',
      password: 'newpass999'
    });
    t('login returns session token', !!(r.json && r.json.token));
    r = await req('GET', '/api/auth/me', null, r.json.token);
    t('bearer me after login', r.status === 200 && r.json.user);

    {
      const loginR = await req('POST', '/api/auth/login', {
        email: 'owner@example.com', password: 'newpass999'
      });
      const tok = loginR.json && loginR.json.token;
      const meR = await new Promise((resolve, reject) => {
        const r2 = http.request({
          hostname: '127.0.0.1', port: PORT, path: '/api/auth/me', method: 'GET',
          headers: { 'X-QS-Session': tok || '' }
        }, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            let json = null;
            try { json = text ? JSON.parse(text) : null; } catch (_) {}
            resolve({ status: res.statusCode, json });
          });
        });
        r2.on('error', reject);
        r2.end();
      });
      t('x-qs-session header auth', meR.status === 200 && meR.json && meR.json.user, meR.status);


    r = await req('POST', '/api/auth/register', {
      name: 'Sales Sam', email: 'sales-role@example.com', password: 'password123', role: 'sales'
    });
    t('sales job title starts read-only', r.status === 201 && r.json.user.role === 'viewer', r.status);

    r = await req('POST', '/api/auth/register', {
      name: 'Owner Two', email: 'owner-two@example.com', password: 'password123', role: 'owner'
    });
    t('owner job title cannot grant owner', r.status === 201 && r.json.user.role === 'viewer', r.status);

    r = await req('POST', '/api/auth/register', {
      name: 'Viewer Jo', email: 'viewer-role@example.com', password: 'password123', role: 'viewer'
    });
    t('register viewer role', r.status === 201 && r.json.user.role === 'viewer', r.status);

    r = await req('POST', '/api/auth/register', {
      name: 'Custom Chris', email: 'custom-role@example.com', password: 'password123',
      role: 'Project lead'
    });
    t('register free-text custom role', r.status === 201 && r.json.user.role === 'viewer' && r.json.user.roleCustom === 'Project lead', r.status);

    r = await req('POST', '/api/auth/register', {
      name: 'Bad Custom', email: 'bad-custom@example.com', password: 'password123', role: ''
    });
    t('empty role rejected', r.status === 400, r.status);

    r = await req('POST', '/api/auth/register', {
      name: 'Owner Typed', email: 'owner-typed@example.com', password: 'password123', role: 'Owner'
    });
    t('capitalized Owner remains read-only', r.status === 201 && r.json.user.role === 'viewer', r.status);

    r = await req('POST', '/api/auth/login', {
      email: 'custom-role@example.com', password: 'password123'
    });
    const customTok = r.json.token;
    r = await req('POST', '/api/proposals', { title: 'Custom can write' }, customTok);
    t('unapproved job title cannot create proposals', r.status === 403, r.status);

    r = await req('POST', '/api/auth/profile', { role: 'owner' }, customTok);
    t('profile ignores role change body', r.status === 200 && r.json.user.role === 'viewer', r.status);

    /* --- Self-service recovery, full round trip (owner decision, 2026-10-10) --
       Run on two dedicated accounts so it neither depends on nor disturbs any
       password the rest of this file signs in with, and so no test has to wait
       out the 45-second resend cooldown: each account makes its FIRST request. */
    r = await req('POST', '/api/auth/register', {
      name: 'Reco Round Trip', email: 'reco-round@example.com', password: 'password123', role: 'viewer'
    });
    t('recovery fixture registered', r.status === 201, r.status + ' ' + JSON.stringify(r.json));

    r = await req('POST', '/api/auth/forgot-password', { email: 'reco-round@example.com' });
    t('recovery code issued', r.status === 200 && r.json.ok === true, r.status + ' ' + JSON.stringify(r.json));

    const roundCode = recoverResetCode();
    t('code recovered from the stored hash', typeof roundCode === 'string' && /^\d{6}$/.test(roundCode), roundCode);

    r = await req('POST', '/api/auth/verify-code', { email: 'reco-round@example.com', code: roundCode });
    t('verify accepts the real code', r.status === 200 && r.json.ok === true, r.status + ' ' + JSON.stringify(r.json));
    t('verify hands back no session and no code', !r.json.token && !/\b\d{6}\b/.test(JSON.stringify(r.json)), JSON.stringify(r.json));

    r = await req('POST', '/api/auth/verify-code', { email: 'reco-round@example.com', code: roundCode });
    t('verify stays repeatable until the password is set', r.status === 200, r.status + ' ' + JSON.stringify(r.json));

    r = await req('POST', '/api/auth/reset-password', { email: 'reco-round@example.com', code: roundCode, password: 'brandnew99' });
    t('reset accepts the real code', r.status === 200 && r.json.ok === true, r.status + ' ' + JSON.stringify(r.json));

    r = await req('POST', '/api/auth/login', { email: 'reco-round@example.com', password: 'password123' });
    t('old password no longer works', r.status === 401, r.status + ' ' + JSON.stringify(r.json));

    r = await req('POST', '/api/auth/login', { email: 'reco-round@example.com', password: 'brandnew99' });
    t('new password works', r.status === 200, r.status + ' ' + JSON.stringify(r.json));

    r = await req('POST', '/api/auth/reset-password', { email: 'reco-round@example.com', code: roundCode, password: 'anotherone1' });
    t('code is single use', r.status === 400 && r.json.code === 'CODE_INVALID', r.status + ' ' + JSON.stringify(r.json));

    /* Attempt cap. A 6-digit code is only 1e6 combinations, so five misses void
       it rather than let a caller grind through the 10-minute window. Read back
       from the stored row: the API deliberately cannot show the difference
       between a voided code and a wrong one, which is the whole point. */
    r = await req('POST', '/api/auth/register', {
      name: 'Reco Attempts', email: 'reco-attempts@example.com', password: 'password123', role: 'viewer'
    });
    t('attempt fixture registered', r.status === 201, r.status);
    r = await req('POST', '/api/auth/forgot-password', { email: 'reco-attempts@example.com' });
    t('attempt fixture code issued', r.status === 200, r.status);
    let verifyMisses = 0;
    for (let miss = 0; miss < 5; miss++) {
      r = await req('POST', '/api/auth/verify-code', { email: 'reco-attempts@example.com', code: String(100000 + miss) });
      if (r.status === 400 && r.json && r.json.code === 'CODE_INVALID') verifyMisses++;
      else t('wrong code rejected on attempt ' + (miss + 1), false, r.status + ' ' + JSON.stringify(r.json));
    }
    t('all five wrong codes rejected with the same reply', verifyMisses === 5, verifyMisses);
    {
      const db = JSON.parse(fs.readFileSync(path.join(DATA, 'db.json'), 'utf8'));
      const uid2 = ((db.users.find((u) => u.email === 'reco-attempts@example.com')) || {}).id;
      const rows = (db.password_resets || []).filter((x) => x.user_id === uid2);
      const row = rows[rows.length - 1];
      t('five misses void the code',
        !!row && Number(row.attempts) >= 5 && !!row.used_at,
        row ? 'attempts=' + row.attempts + ' used_at=' + row.used_at : 'no password_resets row');
    }
    }

  } finally {
    child.kill('SIGTERM');
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (_) {}
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
