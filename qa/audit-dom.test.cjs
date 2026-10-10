/* DOM-equivalence harness (2026-10-04). Runs the REAL shipped page scripts
   (index.html inline JS + platform-api.js + oauth-ui.js) inside jsdom against
   a live local server. This is NOT a browser run: no layout, no viewport-fit
   checks, no canvas/PDF. It verifies DOM behaviour, event wiring, message
   copy, and page↔API integration (including through the CSRF gate).
   Run: node qa/audit-dom.test.cjs */
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0;
const t = (name, cond, extra) => {
  assert.ok(cond, `FAIL [dom]: ${name}${extra !== undefined ? ' → ' + String(extra).slice(0, 300) : ''}`);
  pass++;
  console.log('  ✓', name);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-dom-'));
  const port = 19100 + Math.floor(Math.random() * 700);
  const child = spawn(process.execPath, ['platform/local-server/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      QS_STORE_PATH: path.join(dir, 'db.json'),
      QS_DATA_DIR: dir,
      PORT: String(port),
      GEMINI_ENABLED: 'false',
      /* Mirror oauth-browser: providers exist but are not configured. */
      OAUTH_PUBLIC_ORIGIN: '',
      OAUTH_GOOGLE_ENABLED: 'false',
      OAUTH_MICROSOFT_ENABLED: 'false',
      OAUTH_APPLE_ENABLED: 'false'
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

async function loadPage(base, pagePath, { cookie = '', preset = null } = {}) {
  const html = await (await fetch(base + pagePath)).text();
  /* jsdom ships no window.fetch: bridge to node fetch with a cookie jar so
     cookie-authenticated flows (oauth-complete) behave like a browser. */
  const calls = [];
  const dom = new JSDOM(html, {
    url: base + pagePath,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = async (url, opts = {}) => {
        const absolute = String(url).startsWith('http')
          ? String(url)
          : base + String(url);
        calls.push(absolute);
        const headers = { ...(opts.headers || {}) };
        const jar = [window.document.cookie, cookie].filter(Boolean).join('; ');
        if (jar && !headers.Cookie && !headers.cookie) headers.Cookie = jar;
        const res = await fetch(absolute, { ...opts, headers });
        const setCookies = res.headers.getSetCookie
          ? res.headers.getSetCookie()
          : [];
        for (const sc of setCookies) {
          const pair = String(sc).split(';')[0];
          if (pair) window.document.cookie = pair;
        }
        return res;
      };
    }
  });
  const { window } = dom;
  if (cookie) window.document.cookie = cookie.split(';')[0];
  /* Runs before deferred external scripts execute. */
  if (preset) preset(window);
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message || e.error || e)));
  await new Promise((resolve) => {
    if (window.document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve);
    setTimeout(resolve, 8000);
  });
  await sleep(500);
  return { dom, window, calls, errors };
}

(async () => {
  const srv = await boot();
  try {
    const { base } = srv;

    /* Seed one account for the sign-in round-trip. */
    const seeded = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dom@example.test', name: 'Dom User',
        password: 'Dom-pass-9', role: 'Viewer'
      })
    });
    assert.equal(seeded.status, 201, 'seed signup failed');

    /* A. Recovery UI honesty (mirrors studio-security.test.cjs browser half,
       minus the viewport-fit check, which needs a real layout engine).

       The flow is three steps inside the sign-in panel — email, then the code,
       then a new password (owner decision, 2026-10-10). Opening it must fire
       nothing: the server is not asked about any address until the user submits
       one, so merely loading the page can never confirm or deny an account. */
    {
      const { window, calls } = await loadPage(base, '/index.html#forgotPassword');
      const doc = window.document;
      const rp = doc.getElementById('f-rp');
      t('recovery deep link opens the reset panel', rp && rp.hidden === false, rp && rp.hidden);
      t('sign-in panel is swapped out', doc.getElementById('f-in').hidden === true);
      t('only step 1 (email) is shown',
        !!doc.querySelector('[data-rstep="1"]:not([hidden])') &&
        !doc.querySelector('[data-rstep="2"]:not([hidden])') &&
        !doc.querySelector('[data-rstep="3"]:not([hidden])'));
      t('email step asks for the address',
        !!doc.getElementById('r-e') && !!doc.querySelector('#f-rp [data-rstep="1"] .cta2'));
      t('code step carries the resend control and its counter',
        !!doc.getElementById('rp-resend') && /\bof 3 left\b/.test(doc.getElementById('rp-resend').textContent),
        doc.getElementById('rp-resend') && doc.getElementById('rp-resend').textContent);
      t('password step has the new-password field', !!doc.getElementById('r-p'));
      t('no code or token is pre-filled or rendered',
        !/\b\d{6}\b/.test((rp && rp.textContent) || '') && !(rp && rp.querySelector('[name="token"]')),
        rp && rp.textContent.slice(0, 120));
      t('UI issues zero recovery requests when the panel merely opens',
        calls.filter((u) => /\/api\/auth\/(forgot-password|verify-code|reset-password)/.test(u)).length === 0,
        calls.join(','));

      const back = rp.querySelector('[data-go="in"]');
      t('Back to sign in present', !!back);
      back.click();
      t('Back to sign in returns to the sign-in form',
        rp.hidden === true && doc.getElementById('f-in').hidden === false);
      doc.getElementById('forgotPassword').click();
      t('Forgot password re-opens the reset panel',
        rp.hidden === false && doc.getElementById('f-in').hidden === true);
      window.close();
    }

    /* B. Sign-in is email + password only.

       Owner decision (2026-10-10): the Google, Phone and Microsoft buttons are
       removed from the sign-in screen, leaving the built-in email/password
       flow as the single entry point. The provider code (oauth-ui.js,
       phone-auth.js, and the Worker OAuth/phone routes) stays wired but
       unreachable, so it can be restored without a rewrite; both scripts are
       null-guarded, so an empty button set must not throw. These guards fail
       the moment any social control returns. */
    {
      const { window } = await loadPage(base, '/index.html');
      t('StudioSocial bridge loads', !!window.StudioSocial);
      t('Google button removed from sign-in', !window.document.querySelector('[data-p="google"]'));
      t('Microsoft button removed from sign-in', !window.document.querySelector('[data-p="microsoft"]'));
      t('Apple button removed from sign-in', !window.document.querySelector('[data-p="apple"]'));
      t('Phone button removed from sign-in', !window.document.getElementById('btnPhone'));
      t('"or continue with" divider removed', !window.document.querySelector('.or'));
      const order = Array.from(window.document.querySelectorAll('.soc button'))
        .map((b) => b.id === 'btnPhone' ? 'phone' : b.dataset.p).join(',');
      t('no social buttons remain', order === '', order);
      t('phone-auth script loads with bridge', !!window.StudioPhone);
      t('socialMessage retained for provider-error copy',
        !!window.document.getElementById('socialMessage'));
      t('email and password fields present',
        !!window.document.getElementById('i-e') && !!window.document.getElementById('i-p'));
      t('sign-in submit button present', !!window.document.querySelector('#f-in button.cta2'));
      t('create-account link present', !!window.document.querySelector('#f-in [data-go="up"]'));
      t('forgot-password control present', !!window.document.getElementById('forgotPassword'));
      /* "Remember me" (owner request, 2026-10-10) sits LEFT of Forgot password
         on one row, UNCHECKED by default so a sign-in is browser-session-only
         unless the user asks to be remembered. */
      const reco = window.document.querySelector('#f-in .reco');
      t('remember-me row present', !!reco, reco ? '' : 'no .reco row');
      const remember = window.document.getElementById('rememberMe');
      t('remember-me checkbox present and UNCHECKED by default',
        !!remember && remember.type === 'checkbox' && !remember.checked,
        remember ? 'type=' + remember.type + ' checked=' + remember.checked : 'missing');
      t('remember-me and Forgot password share one row',
        !!reco && !!reco.querySelector('#rememberMe') && !!reco.querySelector('#forgotPassword'));
      /* Flex row reads left-to-right, so DOM order IS visual order here —
         measurable in any environment, unlike layout rects under jsdom. */
      t('remember-me is to the LEFT of Forgot password',
        !!reco &&
        reco.innerHTML.indexOf('rememberMe') < reco.innerHTML.indexOf('id="forgotPassword"'));
      t('remember-me is opted IN to the form (name="remember")',
        !!remember && remember.getAttribute('name') === 'remember');
      window.close();
    }
    {
      const { window } = await loadPage(base, '/index.html?oauth_error=ACCOUNT_EXISTS');
      await sleep(800);
      const msg = window.document.getElementById('socialMessage');
      t('ACCOUNT_EXISTS guidance shown, never auto-merge',
        !msg.hidden && /never merged automatically/i.test(msg.textContent),
        msg.textContent.slice(0, 160));
      t('error param scrubbed from URL',
        !window.location.href.includes('oauth_error'), window.location.href);
      window.close();
    }

    /* C. Real sign-in through the shipped page JS → API (same-origin path). */
    {
      const { window, errors } = await loadPage(base, '/index.html');
      const doc = window.document;
      const form = doc.getElementById('f-in');
      form.querySelector('input[name="email"]').value = 'dom@example.test';
      form.querySelector('input[name="password"]').value = 'Dom-pass-9';
      form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
      await sleep(1500);
      const toast = doc.getElementById('toast');
      t('password sign-in succeeds end-to-end',
        /Signed in\. Opening your workspace/i.test(toast.textContent),
        toast.textContent.slice(0, 120));
      t('no page script errors during sign-in', errors.length === 0, errors.join(' | '));
      window.close();
    }

    /* D. oauth-complete: stale bearer token cleared, cookie session confirmed.
       (jsdom cannot navigate, so the redirect itself is NOT verified here.) */
    {
      const login = await (await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dom@example.test', password: 'Dom-pass-9' })
      })).json();
      const setCookie = await (async () => {
        const r = await fetch(`${base}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'dom@example.test', password: 'Dom-pass-9' })
        });
        return r.headers.get('set-cookie') || '';
      })();
      const sessionPair = setCookie.split(';')[0];
      assert.ok(sessionPair.includes('='), 'login sets a session cookie');
      const { window } = await loadPage(base, '/oauth-complete.html', {
        cookie: sessionPair,
        preset: (w) => w.localStorage.setItem('qs.sessionToken', 'stale-previous-token')
      });
      await sleep(1200);
      t('oauth-complete clears stale bearer token',
        window.localStorage.getItem('qs.sessionToken') === null);
      const result = window.document.getElementById('oauthResult').textContent;
      t('oauth-complete confirms cookie session (no error shown)',
        !/could not|error|fail/i.test(result), result.slice(0, 160));
      assert.ok(login.token, 'login token present');
      window.close();
    }

    /* E. Quotation save/reopen data round-trip (API level; PDF/canvas need a
       real browser and are NOT RUN here). Uses the exact shape
       cloud-bridge.collectPayload() sends, through the changed endpoints. */
    {
      const login = await (await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dom@example.test', password: 'Dom-pass-9' })
      })).json();
      /* Promote the seed to owner for write access (fresh signups are viewers). */
      const storePath = path.join(srv.dir, 'db.json');
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      store.users.find((u) => u.id === login.user.id).role = 'owner';
      fs.writeFileSync(storePath, JSON.stringify(store));
      const H = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${login.token}`
      };
      const payload = {
        form: { custName: 'Round Trip', capacity: '10', city: 'Pune' },
        content: { blocks: [{ t: 'p', x: 'hello' }] },
        projectImages: [{ id: 'img1' }],
        pageImages: null,
        options: [{ label: 'AMC', amount: 5000 }],
        status: 'draft',
        localId: 'local-1',
        sentAt: null,
        acceptedAt: null,
        prevId: null
      };
      const created = await (await fetch(`${base}/api/proposals`, {
        method: 'POST', headers: H, body: JSON.stringify(payload)
      })).json();
      const id = created.proposal.id;
      t('studio-shaped proposal saves', !!id && !!created.proposal.ref, id);
      const reopened = await (await fetch(`${base}/api/proposals/${id}`, { headers: H })).json();
      const p = reopened.proposal;
      t('form survives save/reopen',
        p.form && p.form.custName === 'Round Trip' && p.form.capacity === '10');
      t('content/options survive save/reopen',
        JSON.stringify(p.content.blocks) === JSON.stringify(payload.content.blocks) &&
        p.options.length === 1 && p.options[0].amount === 5000);
      const updated = await fetch(`${base}/api/proposals/${id}`, {
        method: 'PUT', headers: H,
        body: JSON.stringify({ ...payload, status: 'ready', baseRevision: p.revision })
      });
      t('studio-shaped update with revision succeeds', updated.status === 200, updated.status);
      const reread = await (await fetch(`${base}/api/proposals/${id}`, { headers: H })).json();
      t('status advance persists', reread.proposal.status === 'ready', reread.proposal.status);
    }

    /* F. Dashboard boots with real scripts; settings shows honest OAuth states
       (mirrors oauth-browser.test.cjs dashboard half; layout NOT verified). */
    {
      const login = await (await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dom@example.test', password: 'Dom-pass-9' })
      })).json();
      const { window, errors } = await loadPage(base, '/dashboard.html', {
        preset: (w) => w.localStorage.setItem('qs.sessionToken', login.token)
      });
      await sleep(2500);
      t('dashboard boots (QSDash live)', !!window.QSDash);
      const user = window.QSDash && window.QSDash.user();
      t('dashboard session resolves user', user && user.email === 'dom@example.test');
      window.QSDash.show('settings');
      await sleep(1500);
      const conn = window.document.getElementById('socialConnections');
      t('provider-connect block removed from profile card', conn === null, String(conn));
      t('role pencil present', !!window.document.getElementById('btnRoleEdit'));
      t('role editor slot present', !!window.document.getElementById('roleEditor'));
      const since = window.document.getElementById('settingsSince').textContent;
      t('member-since shown', since.startsWith('Member since '), since);
      t('owner session (promoted earlier)', user && user.role === 'owner', user && user.role);
      window.document.getElementById('btnRoleEdit').click();
      await sleep(150);
      const ed = window.document.getElementById('roleEditor');
      t('owner pencil opens inline editor', !ed.hidden && !!ed.querySelector('select.role-select'));
      ed.querySelector('.role-cancel').click();
      await sleep(150);
      t('editor cancel closes', ed.hidden === true);
      t('no dashboard script errors', errors.length === 0, errors.join(' | '));
      window.close();
    }

    console.log(`\n${pass} passed, 0 failed`);
  } finally {
    await srv.stop();
  }
})().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
