/* OAuth attack suite (2026-10-04): malicious, forged and replayed callbacks —
   including Apple form_post — must fail closed with no session, no user, and
   no provider contact on pre-exchange failures. Mocks ONLY the provider HTTP
   endpoints (token + JWKS); the app code, stores and routes are real.
   Real provider login is NOT covered here (see docs/social-sign-in-setup.md).
   Run: node --test qa/oauth-attacks.test.mjs */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleOAuth, configurationIssues } from '../platform/cloudflare/src/oauth.mjs';
import { localOAuthStore } from '../platform/oauth-store.mjs';
import { generateKeyPair, SignJWT } from '../platform/vendor/jose.mjs';

const origin = 'https://studio.example.test';
const pair = await generateKeyPair('RS256');
const futureSecret = 'e30.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.x';
const pastSecret = 'e30.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 10 })).toString('base64url') + '.x';
const env = {
  OAUTH_PUBLIC_ORIGIN: origin,
  OAUTH_GOOGLE_ENABLED: 'true', GOOGLE_CLIENT_ID: 'google-test', GOOGLE_CLIENT_SECRET: 'not-real',
  OAUTH_MICROSOFT_ENABLED: 'true', MICROSOFT_CLIENT_ID: 'microsoft-test', MICROSOFT_CLIENT_SECRET: 'not-real',
  OAUTH_APPLE_ENABLED: 'true', APPLE_CLIENT_ID: 'apple-test', APPLE_CLIENT_SECRET: futureSecret
};
const claims = (provider, nonce, extra = {}) => ({
  iss: provider === 'google' ? 'https://accounts.google.com' : provider === 'apple' ? 'https://appleid.apple.com' : 'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0',
  exp: Math.floor(Date.now() / 1000) + 300, sub: 'subject-1', aud: provider + '-test', nonce,
  email: 'person@example.test', email_verified: true, name: 'Provider Name',
  ...(provider === 'microsoft' ? { tid: '11111111-2222-3333-4444-555555555555' } : {}), ...extra
});
const signed = (p) => new SignJWT(p).setProtectedHeader({ alg: 'RS256', kid: 'k' }).setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);

function local() {
  let db = { users: [], sessions: [] };
  return { store: localOAuthStore(() => structuredClone(db), (v) => { db = v; }), db: () => db };
}
function harness(store, user = null) {
  const sessions = [];
  const auth = {
    canLink: async () => true, user: async () => user, token: () => 'tok',
    userByToken: async () => user,
    session: async (u) => { sessions.push(u); return { token: 'new-session' }; },
    cookie: (t) => 'qs_session=' + t, rateKey: 'test-ip'
  };
  return { auth, sessions };
}
const request = (route, method = 'GET', body, headers = {}) =>
  new Request(origin + '/api/auth/oauth/' + route, { method, headers: { Origin: origin, ...headers }, ...(body === undefined ? {} : { body }) });

async function begin(store, auth, provider = 'google') {
  const r = await handleOAuth(request(provider + '/start', 'POST', '{}'), env, store, auth);
  assert.equal(r.status, 200);
  const u = new URL((await r.json()).url);
  return { state: u.searchParams.get('state'), nonce: u.searchParams.get('nonce'), cookie: r.headers.get('set-cookie').split(';')[0] };
}
function exchanging(token, { ok = true, raw = null } = {}) {
  let exchanges = 0;
  const deps = {
    keyResolver: pair.publicKey,
    fetch: async () => {
      exchanges++;
      if (!ok) return new Response('denied', { status: 400 });
      return new Response(raw !== null ? raw : JSON.stringify({ id_token: token }));
    }
  };
  return { deps, count: () => exchanges };
}
async function callback(store, auth, provider, params, cookie, deps) {
  const p = new URLSearchParams(params);
  const isPost = provider === 'apple';
  return handleOAuth(
    request(provider + '/callback' + (isPost ? '' : '?' + p), isPost ? 'POST' : 'GET', isPost ? p.toString() : undefined, { Cookie: cookie }),
    env, store, auth, deps
  );
}
const codeOf = (res) => new URL(res.headers.get('location'), origin).searchParams.get('oauth_error');

test('malformed state/binding formats die before any provider contact', async () => {
  const { store, db } = local(), { auth } = harness(store), a = await begin(store, auth);
  const idToken = await signed(claims('google', a.nonce));
  for (const bad of ['short', 'x'.repeat(44), 'has!illegal*chars-in-state-43-characters-long!!', '', 'a'.repeat(43)]) {
    const { deps, count } = exchanging(idToken);
    const r = await callback(store, auth, 'google', { state: bad, code: 'c' }, a.cookie, deps);
    assert.match(r.headers.get('location'), /SIGNIN_EXPIRED/);
    assert.equal(count(), 0);
  }
  /* 'a'*43 passes the format check but matches no stored state. */
  const { deps, count } = exchanging(idToken);
  const r = await callback(store, auth, 'google', { state: a.state, code: 'c' }, '__Host-qs-oauth-google=short', deps);
  assert.match(r.headers.get('location'), /SIGNIN_EXPIRED/);
  assert.equal(count(), 0);
  assert.equal(db().users.length, 0);
});

test('missing/oversized code and error-first callbacks are safe', async () => {
  const { store } = local(), { auth } = harness(store), a = await begin(store, auth);
  const idToken = await signed(claims('google', a.nonce));
  const missing = await callback(store, auth, 'google', { state: a.state }, a.cookie, exchanging(idToken).deps);
  assert.equal(codeOf(missing), 'SIGNIN_FAILED');
  const b = await begin(store, auth);
  const huge = await callback(store, auth, 'google', { state: b.state, code: 'c'.repeat(10001) }, b.cookie, exchanging(idToken).deps);
  assert.equal(codeOf(huge), 'SIGNIN_FAILED');
  /* error param with garbage state: state check runs first, still expired. */
  const c = await handleOAuth(request('google/callback?' + new URLSearchParams({ state: 'z'.repeat(43), error: 'access_denied' }), 'GET', undefined, { Cookie: a.cookie }), env, store, auth);
  assert.equal(codeOf(c), 'SIGNIN_EXPIRED');
});

test('token-endpoint failures never create sessions or users', async () => {
  for (const mode of ['http-error', 'non-json', 'no-id-token']) {
    const { store, db } = local(), { auth, sessions } = harness(store), a = await begin(store, auth);
    const idToken = await signed(claims('google', a.nonce));
    const { deps } = mode === 'http-error'
      ? exchanging(idToken, { ok: false })
      : exchanging(idToken, { raw: mode === 'non-json' ? 'not json{{' : JSON.stringify({ access_token: 'x' }) });
    const r = await callback(store, auth, 'google', { state: a.state, code: 'c' }, a.cookie, deps);
    assert.equal(codeOf(r), 'SIGNIN_FAILED', mode);
    assert.equal(sessions.length, 0, mode);
    assert.equal(db().users.length, 0, mode);
  }
});

test('oversized callback body is rejected without parsing', async () => {
  const { store } = local(), { auth } = harness(store), a = await begin(store, auth, 'apple');
  const big = 'state=' + a.state + '&code=' + 'c'.repeat(21000);
  const r = await handleOAuth(request('apple/callback', 'POST', big, { Cookie: a.cookie }), env, store, auth, exchanging('x').deps);
  assert.equal(codeOf(r), 'SIGNIN_FAILED');
});

test('Apple user payload is untrusted display text only', async () => {
  /* Invalid JSON in user param: flow still completes with token name. */
  {
    const { store, db } = local(), { auth } = harness(store), a = await begin(store, auth, 'apple');
    const idToken = await signed(claims('apple', a.nonce));
    const r = await callback(store, auth, 'apple', { state: a.state, code: 'c', user: '{{{' }, a.cookie, exchanging(idToken).deps);
    assert.equal(r.headers.get('location'), '/oauth-complete.html');
    assert.equal(db().users[0].name, 'Provider Name');
  }
  /* Hostile user object: non-strings dropped, length capped. */
  {
    const { store, db } = local(), { auth } = harness(store), a = await begin(store, auth, 'apple');
    const idToken = await signed(claims('apple', a.nonce));
    const evil = JSON.stringify({ name: { firstName: 'A'.repeat(5000), lastName: { $ne: 1 }, x: ['<img src=x onerror=1>'] } });
    const r = await callback(store, auth, 'apple', { state: a.state, code: 'c', user: evil }, a.cookie, exchanging(idToken).deps);
    assert.equal(r.headers.get('location'), '/oauth-complete.html');
    assert.equal(db().users[0].name, 'A'.repeat(120));
  }
});

test('tampered nonce via full callback creates nothing', async () => {
  const { store, db } = local(), { auth, sessions } = harness(store), a = await begin(store, auth, 'apple');
  const idToken = await signed(claims('apple', 'attacker-nonce'));
  const r = await callback(store, auth, 'apple', { state: a.state, code: 'c' }, a.cookie, exchanging(idToken).deps);
  assert.equal(codeOf(r), 'SIGNIN_FAILED');
  assert.equal(sessions.length, 0);
  assert.equal(db().users.length, 0);
});

test('cross-provider state reuse and double-callback replay fail', async () => {
  const { store } = local(), { auth } = harness(store), a = await begin(store, auth, 'google');
  const idToken = await signed(claims('google', a.nonce));
  const cross = await callback(store, auth, 'apple', { state: a.state, code: 'c' }, a.cookie, exchanging(idToken).deps);
  assert.equal(codeOf(cross), 'SIGNIN_EXPIRED');
  /* Genuine first use succeeds… */
  const first = await callback(store, auth, 'google', { state: a.state, code: 'c' }, a.cookie, exchanging(idToken).deps);
  assert.equal(first.headers.get('location'), '/oauth-complete.html');
  /* …and the exact replay is dead (state was consumed). */
  const { deps, count } = exchanging(idToken);
  const replay = await callback(store, auth, 'google', { state: a.state, code: 'c' }, a.cookie, deps);
  assert.equal(codeOf(replay), 'SIGNIN_EXPIRED');
  assert.equal(count(), 0);
});

test('wrong callback method per provider is rejected', async () => {
  const { store } = local(), { auth } = harness(store);
  assert.equal((await handleOAuth(request('google/callback', 'POST', 'x=y'), env, store, auth)).status, 405);
  assert.equal((await handleOAuth(request('apple/callback?x=y'), env, store, auth)).status, 405);
  assert.equal((await handleOAuth(request('microsoft/callback', 'DELETE'), env, store, auth)).status, 405);
});

test('expired Apple secret and bad tenant fail closed with diagnostics', async () => {
  const { store } = local(), { auth } = harness(store);
  const expiredEnv = { ...env, APPLE_CLIENT_SECRET: pastSecret };
  const r = await handleOAuth(request('apple/start', 'POST', '{}'), expiredEnv, store, auth);
  assert.equal(r.status, 503);
  assert.ok(configurationIssues(expiredEnv, 'apple').join(' ').includes('expired'));
  const badTenant = { ...env, MICROSOFT_TENANT_ID: 'evil..tenant' };
  const r2 = await handleOAuth(request('microsoft/start', 'POST', '{}'), badTenant, store, auth);
  assert.equal(r2.status, 503);
  assert.ok(configurationIssues(badTenant, 'microsoft').join(' ').includes('MICROSOFT_TENANT_ID'));
  /* Non-localhost http origin stays unconfigured. */
  const httpEnv = { ...env, OAUTH_PUBLIC_ORIGIN: 'http://example.test:8787' };
  assert.equal((await handleOAuth(request('google/start', 'POST', '{}'), httpEnv, store, auth)).status, 503);
});

test('malformed start bodies are rejected, never crash', async () => {
  const { store } = local(), { auth } = harness(store);
  assert.equal((await handleOAuth(request('google/start', 'POST', '{{{'), env, store, auth)).status, 400);
  assert.equal((await handleOAuth(request('google/start', 'POST', 'x'.repeat(5000)), env, store, auth)).status, 400);
});

test('CSRF exemption holds end-to-end on real Worker routes: evil-Origin Apple POST reaches the callback and fails safely', async () => {
  const { readFileSync } = await import('node:fs');
  const { DatabaseSync } = await import('node:sqlite');
  const { default: worker } = await import('../platform/cloudflare/src/worker.js');
  const { exportJWK } = await import('../platform/vendor/jose.mjs');
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../platform/schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, params) => {
    const verb = String(sql).trim().split(/\s+/)[0].toUpperCase();
    if (verb === 'SELECT' || verb === 'WITH' || verb === 'PRAGMA' || /\bRETURNING\b/i.test(String(sql))) {
      return {
        run: async () => ({ success: true, meta: { changes: 0, last_row_id: 0 } }),
        first: async () => sqlite.prepare(sql).get(...params) ?? null,
        all: async () => ({ results: sqlite.prepare(sql).all(...params) })
      };
    }
    return {
      run: async () => { const i = sqlite.prepare(sql).run(...params); return { success: true, meta: { changes: Number(i.changes || 0), last_row_id: 0 } }; },
      first: async () => null, all: async () => ({ results: [] })
    };
  };
  const DB = {
    prepare: (sql) => ({ bind: (...p) => stmt(sql, p), ...stmt(sql, []) }),
    batch: async (ss) => Promise.all(ss.map((s) => s.run())),
    exec: async (sql) => { sqlite.exec(sql); return { success: true }; }
  };
  const APP = 'https://studio.test';
  const wenv = { ...env, OAUTH_PUBLIC_ORIGIN: APP, DB, APP_URL: APP };
  const wfetch = (path, opts = {}) => worker.fetch(new Request(APP + path, opts), wenv, {});

  /* Start from the real origin (same as the browser would). */
  const start = await wfetch('/api/auth/oauth/apple/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: APP }, body: '{}'
  });
  assert.equal(start.status, 200);
  const authUrl = new URL((await start.json()).url);
  const state = authUrl.searchParams.get('state'), nonce = authUrl.searchParams.get('nonce');
  const binding = start.headers.get('set-cookie').split(';')[0];
  assert.ok(/__Host-qs-oauth-apple=/.test(binding));

  const jwk = await exportJWK(pair.publicKey);
  Object.assign(jwk, { kid: 'k', alg: 'RS256', use: 'sig' });
  const idToken = await signed(claims('apple', nonce));
  const realFetch = globalThis.fetch;
  try {
    /* Attack 1: cross-site POST with a garbage code → safe failure, not a bypass. */
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === 'https://appleid.apple.com/auth/token') return new Response('bad code', { status: 400 });
      if (url === 'https://appleid.apple.com/auth/keys') return Response.json({ keys: [jwk] });
      throw Error('unexpected ' + url);
    };
    const evil = await wfetch('/api/auth/oauth/apple/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example', Cookie: binding },
      body: new URLSearchParams({ state, code: 'attacker-code' }).toString()
    });
    assert.equal(evil.status, 303);
    assert.match(evil.headers.get('location'), /SIGNIN_FAILED/);
    assert.ok(!JSON.stringify([...evil.headers]).includes('attacker-code'));

    /* Genuine Apple-style POST (foreign Origin, valid code) completes. */
    const start2 = await wfetch('/api/auth/oauth/apple/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: APP }, body: '{}'
    });
    const authUrl2 = new URL((await start2.json()).url);
    const binding2 = start2.headers.get('set-cookie').split(';')[0];
    const idToken2 = await signed(claims('apple', authUrl2.searchParams.get('nonce')));
    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === 'https://appleid.apple.com/auth/token') return Response.json({ id_token: idToken2 });
      if (url === 'https://appleid.apple.com/auth/keys') return Response.json({ keys: [jwk] });
      throw Error('unexpected ' + url);
    };
    const good = await wfetch('/api/auth/oauth/apple/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://appleid.apple.com', Cookie: binding2 },
      body: new URLSearchParams({ state: authUrl2.searchParams.get('state'), code: 'real-code' }).toString()
    });
    assert.equal(good.status, 303);
    assert.equal(good.headers.get('location'), '/oauth-complete.html');
    const session = good.headers.getSetCookie().find((c) => c.startsWith('qs_session=')).split(';')[0];
    const me = await wfetch('/api/auth/me', { headers: { Cookie: session } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).user.role, 'viewer');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('localhost http origin enables Google/Microsoft for local dev only', async () => {
  const devEnv = { ...env, OAUTH_PUBLIC_ORIGIN: 'http://127.0.0.1:8787' };
  assert.equal(configurationIssues(devEnv, 'google').length, 0);
  assert.equal(configurationIssues(devEnv, 'microsoft').length, 0);
  assert.ok(configurationIssues(devEnv, 'apple').length > 0, 'apple stays https-only');
  const { store } = local(), { auth } = harness(store);
  const devRequest = (route, method = 'GET', body, headers = {}) =>
    new Request('http://127.0.0.1:8787/api/auth/oauth/' + route, { method, headers: { Origin: 'http://127.0.0.1:8787', ...headers }, ...(body === undefined ? {} : { body }) });
  const r = await handleOAuth(devRequest('google/start', 'POST', '{}'), devEnv, store, auth);
  assert.equal(r.status, 200);
  assert.ok(new URL((await r.json()).url).searchParams.get('state'));
});
