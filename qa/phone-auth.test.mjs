/* Phone OTP sign-in: config, verification, and failure paths.
   Firebase ID tokens are REALLY signed (runtime RSA keys) and verified through
   the production code path with an injected key resolver; the certificate-
   download branch is covered with mocked fetch. No network is used. */
import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { handlePhoneAuth, phoneConfig, phoneIssues, verifyFirebaseToken } from '../platform/cloudflare/src/phone.mjs';
import { generateKeyPair, SignJWT } from '../platform/vendor/jose.mjs';

const PROJECT = 'demophone1';
const ISS = `https://securetoken.google.com/${PROJECT}`;
const PHONE = '+919876543210';
const ENV = { PHONE_ENABLED: 'true', FIREBASE_PROJECT_ID: PROJECT, FIREBASE_API_KEY: 'AIzaTestKey1234567890abcdef' };

let pub, priv, otherPub, otherPriv;
before(async () => {
  ({ publicKey: pub, privateKey: priv } = await generateKeyPair('RS256'));
  ({ publicKey: otherPub, privateKey: otherPriv } = await generateKeyPair('RS256'));
});

const resolver = async () => pub;
const deps = () => ({ keyResolver: resolver });

async function sign({ phone = PHONE, aud = PROJECT, iss = ISS, privKey = priv, iatSkew = 0, expIn = 3600, authTimeSkew = 0, extra = {} } = {}) {
  const now = Math.floor(Date.now() / 1000);
  return await new SignJWT({ phone_number: phone, auth_time: now - authTimeSkew, ...extra })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1', typ: 'JWT' })
    .setIssuer(iss).setAudience(aud).setSubject('firebase-uid-1')
    .setIssuedAt(now - iatSkew).setExpirationTime(now + expIn)
    .sign(privKey);
}

function storeStub({ allow = true } = {}) {
  const calls = { allow: [], resolved: [] };
  return {
    calls,
    async allowStart(scope) { calls.allow.push(scope); return allow; },
    async resolve(identity) {
      calls.resolved.push(identity);
      return { id: 'usr_phone1', email: identity.email, name: identity.name, role: 'viewer', role_custom: null };
    }
  };
}
const authStub = () => ({
  rateKey: '203.0.113.9',
  async session() { return { token: 'sess-phone-token', expiresAt: '2026-10-11T00:00:00.000Z' }; },
  cookie: (t) => `qs_test=${t}; Path=/; HttpOnly`
});
const req = (path, method = 'GET', body) => new Request('https://studio.test' + path, {
  method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body } : {})
});

// ---- config ----
test('phone disabled by default reports enabled:false', () => {
  assert.deepEqual(phoneConfig({}), { enabled: false });
  assert.ok(phoneIssues({}).length >= 3);
});

test('phone config valid env returns public client config', () => {
  const c = phoneConfig(ENV);
  assert.equal(c.enabled, true);
  assert.equal(c.projectId, PROJECT);
  assert.equal(c.authDomain, PROJECT + '.firebaseapp.com');
  assert.ok(c.apiKey.startsWith('AIza'));
});

test('phoneIssues flags bad key and bad domain', () => {
  assert.ok(phoneIssues({ ...ENV, FIREBASE_API_KEY: 'nope' }).some(i => i.includes('API key')));
  assert.ok(phoneIssues({ ...ENV, FIREBASE_AUTH_DOMAIN: 'not a domain!' }).some(i => i.includes('AUTH_DOMAIN')));
  assert.deepEqual(phoneIssues(ENV), []);
});

test('GET /api/auth/phone/config is public', async () => {
  const r = await handlePhoneAuth(req('/api/auth/phone/config'), ENV, storeStub(), authStub(), deps());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.enabled, true);
  assert.equal(j.projectId, PROJECT);
});

test('POST /api/auth/phone/config is rejected', async () => {
  const r = await handlePhoneAuth(req('/api/auth/phone/config', 'POST', '{}'), ENV, storeStub(), authStub(), deps());
  assert.equal(r.status, 405);
});

// ---- verify guards ----
test('verify unconfigured fails closed with 503', async () => {
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', '{}'), {}, storeStub(), authStub(), deps());
  assert.equal(r.status, 503);
  assert.equal((await r.json()).code, 'PHONE_NOT_CONFIGURED');
});

test('verify malformed JSON is 400', async () => {
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', '{nope'), ENV, storeStub(), authStub(), deps());
  assert.equal(r.status, 400);
});

test('verify missing idToken is 401 without session', async () => {
  const st = storeStub();
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', '{}'), ENV, st, authStub(), deps());
  assert.equal(r.status, 401);
  assert.equal((await r.json()).code, 'PHONE_VERIFY_FAILED');
  assert.equal(st.calls.resolved.length, 0);
});

test('verify oversized idToken is rejected', async () => {
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', JSON.stringify({ idToken: 'x'.repeat(12001) })), ENV, storeStub(), authStub(), deps());
  assert.equal(r.status, 401);
});

test('verify throttled caller gets 429', async () => {
  const token = await sign();
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', JSON.stringify({ idToken: token })), ENV, storeStub({ allow: false }), authStub(), deps());
  assert.equal(r.status, 429);
});

test('verify unknown phone route is 404 and GET verify is 404', async () => {
  const a = await handlePhoneAuth(req('/api/auth/phone/nope'), ENV, storeStub(), authStub(), deps());
  const b = await handlePhoneAuth(req('/api/auth/phone/verify'), ENV, storeStub(), authStub(), deps());
  assert.equal(a.status, 404);
  assert.equal(b.status, 404);
});

// ---- token verification (real RS256) ----
test('verify garbage token is 401', async () => {
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', JSON.stringify({ idToken: 'not.a.jwt' })), ENV, storeStub(), authStub(), deps());
  assert.equal(r.status, 401);
});

test('verify wrong-signature token is 401', async () => {
  const token = await sign({ privKey: otherPriv });
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', JSON.stringify({ idToken: token })), ENV, storeStub(), authStub(), deps());
  assert.equal(r.status, 401);
});

test('verify wrong audience is 401', async () => {
  const token = await sign({ aud: 'evilproject1' });
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', JSON.stringify({ idToken: token })), ENV, storeStub(), authStub(), deps());
  assert.equal(r.status, 401);
});

test('verify wrong issuer is 401', async () => {
  const token = await sign({ iss: 'https://securetoken.google.com/evilproject1' });
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', JSON.stringify({ idToken: token })), ENV, storeStub(), authStub(), deps());
  assert.equal(r.status, 401);
});

test('verify token without phone_number is 401', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ auth_time: now })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISS).setAudience(PROJECT)
    .setSubject('u1').setIssuedAt(now).setExpirationTime(now + 3600).sign(priv);
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', JSON.stringify({ idToken: token })), ENV, storeStub(), authStub(), deps());
  assert.equal(r.status, 401);
});

test('verify malformed phone is 401', async () => {
  for (const bad of ['9876543210', '+91', '+abc', '++919876543210', '+91987654321099999']) {
    const token = await sign({ phone: bad });
    const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', JSON.stringify({ idToken: token })), ENV, storeStub(), authStub(), deps());
    assert.equal(r.status, 401, bad);
  }
});

test('verify expired token is 401', async () => {
  const token = await sign({ iatSkew: 7200, expIn: -10 });
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', JSON.stringify({ idToken: token })), ENV, storeStub(), authStub(), deps());
  assert.equal(r.status, 401);
});

test('verify stale auth_time is 401', async () => {
  const token = await sign({ authTimeSkew: 16 * 60 });
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', JSON.stringify({ idToken: token })), ENV, storeStub(), authStub(), deps());
  assert.equal(r.status, 401);
});

test('verify valid token creates session with phone identity', async () => {
  const st = storeStub();
  const token = await sign();
  const r = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', JSON.stringify({ idToken: token })), ENV, st, authStub(), deps());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.token, 'sess-phone-token');
  assert.equal(j.user.name, PHONE);
  assert.equal(j.user.role, 'viewer');
  assert.ok(r.headers.get('Set-Cookie').includes('sess-phone-token'));
  assert.equal(st.calls.resolved.length, 1);
  const id = st.calls.resolved[0];
  assert.equal(id.provider, 'phone');
  assert.equal(id.subject, PHONE);
  assert.equal(id.email, '919876543210@phone.invalid');
});

test('verify same token twice logs in twice (idempotent re-login)', async () => {
  const st = storeStub();
  const token = await sign();
  const body = JSON.stringify({ idToken: token });
  const a = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', body), ENV, st, authStub(), deps());
  const b = await handlePhoneAuth(req('/api/auth/phone/verify', 'POST', body), ENV, st, authStub(), deps());
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(st.calls.resolved.length, 2);
});

// ---- certificate-download branch (mocked fetch, production code path) ----
test('cert branch: unknown kid with empty certs fails closed', async () => {
  const fetchMock = async () => ({ ok: true, text: async () => '{}' });
  await assert.rejects(verifyFirebaseToken('h.e.s', PROJECT, { fetch: fetchMock }), /PHONE_VERIFY_FAILED/);
});

test('cert branch: non-certificate payload fails closed', async () => {
  const hdr = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k9' })).toString('base64url');
  const fetchMock = async () => ({ ok: true, text: async () => JSON.stringify({ k9: 'not-a-certificate' }) });
  await assert.rejects(verifyFirebaseToken(`${hdr}.e30.c2ln`, PROJECT, { fetch: fetchMock }), /PHONE_VERIFY_FAILED/);
});

test('cert branch: cert endpoint outage fails closed', async () => {
  const fetchMock = async () => ({ ok: false, status: 500 });
  const hdr = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
  // prime cache with empty certs so the test exercises fetch failure on forced refetch
  await assert.rejects(verifyFirebaseToken(`${hdr}.e30.c2ln`, PROJECT, { fetch: fetchMock }), /PHONE_VERIFY_FAILED/);
});
