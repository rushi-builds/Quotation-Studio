/* Phone OTP sign-in via Firebase Authentication.
   The browser proves the phone number to Google (SMS code + reCAPTCHA); this
   handler only accepts Firebase ID tokens it cryptographically verifies
   against Google's securetoken certificates. No SMS is sent from here, and
   tokens, codes, and phone numbers are never logged. */
import { jwtVerify, importX509, decodeProtectedHeader } from '../../vendor/jose.mjs';
import { createHash } from 'node:crypto';

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const E164 = /^\+[1-9]\d{6,14}$/;
const PROJECT_ID = /^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/;
const TOKEN_TTL_MS = 15 * 60 * 1000;

const response = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...headers }
});

/* Granular setup diagnostics. phoneConfig() stays fail-closed: any issue
   means disabled. Never log secret values, only presence. */
export function phoneIssues(env) {
  const issues = [];
  if (env.PHONE_ENABLED !== 'true') issues.push('PHONE_ENABLED is not true');
  if (!PROJECT_ID.test(String(env.FIREBASE_PROJECT_ID || ''))) issues.push('FIREBASE_PROJECT_ID is missing or invalid');
  const key = String(env.FIREBASE_API_KEY || '');
  if (!key) issues.push('FIREBASE_API_KEY is missing');
  else if (!key.startsWith('AIza') || key.length < 20) issues.push('FIREBASE_API_KEY does not look like a Firebase web API key');
  const domain = String(env.FIREBASE_AUTH_DOMAIN || '');
  if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) issues.push('FIREBASE_AUTH_DOMAIN is invalid');
  return issues;
}

/* Public client config. The Firebase web API key is public by design (it only
   identifies the project; quotas and domains are enforced by Google). */
export function phoneConfig(env) {
  if (phoneIssues(env).length) return { enabled: false };
  const projectId = String(env.FIREBASE_PROJECT_ID);
  return {
    enabled: true,
    apiKey: String(env.FIREBASE_API_KEY),
    projectId,
    authDomain: String(env.FIREBASE_AUTH_DOMAIN || projectId + '.firebaseapp.com')
  };
}

const certCache = new Map(); // 'certs' -> {certs, at}; Google certs are global, not per-project
async function getCerts(fetcher, force) {
  const now = Date.now();
  const hit = certCache.get('certs');
  if (hit && !force && now - hit.at < 6 * 3600 * 1000) return hit.certs;
  // 'manual' (not 'error'): the Workers fetch rejects 'error' with a TypeError
  // before sending. A redirect is still never followed — it surfaces as !res.ok.
  const res = await fetcher(CERTS_URL, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error('CERTS_FETCH_FAILED');
  const text = await res.text();
  if (text.length > 100000) throw new Error('CERTS_TOO_LARGE');
  const certs = JSON.parse(text);
  if (!certs || typeof certs !== 'object' || Array.isArray(certs)) throw new Error('CERTS_INVALID');
  certCache.set('certs', { certs, at: now });
  return certs;
}

const jwtOpts = projectId => ({
  algorithms: ['RS256'],
  issuer: `https://securetoken.google.com/${projectId}`,
  audience: projectId,
  requiredClaims: ['sub', 'aud', 'exp', 'iat'],
  maxTokenAge: '15m',
  clockTolerance: 30
});

/* Verify a Firebase ID token from a completed phone sign-in. dependencies may
   carry fetch (cert download) or keyResolver (tests only; production always
   verifies against Google's live certificates). Returns {sub, phone}. */
export async function verifyFirebaseToken(idToken, projectId, dependencies = {}) {
  const fail = () => { throw Object.assign(new Error('PHONE_VERIFY_FAILED'), { phoneCode: 'PHONE_VERIFY_FAILED' }); };
  if (typeof idToken !== 'string' || !idToken || idToken.length > 12000) fail();
  let p;
  if (dependencies.keyResolver) {
    try {
      ({ payload: p } = await jwtVerify(idToken, dependencies.keyResolver, jwtOpts(projectId)));
    } catch { fail(); }
  } else {
    let kid = '';
    try { kid = String(decodeProtectedHeader(idToken).kid || ''); } catch { fail(); }
    if (!kid) fail();
    const fetcher = dependencies.fetch || fetch;
    let certs;
    try { certs = await getCerts(fetcher, false); } catch { fail(); }
    let pem = certs[kid];
    if (!pem) { // key rotation: refetch once before rejecting
      try { certs = await getCerts(fetcher, true); } catch { fail(); }
      pem = certs[kid];
    }
    if (typeof pem !== 'string' || !pem.includes('BEGIN CERTIFICATE')) fail();
    try {
      const key = await importX509(pem, 'RS256');
      ({ payload: p } = await jwtVerify(idToken, key, jwtOpts(projectId)));
    } catch { fail(); }
  }
  const phone = typeof p.phone_number === 'string' ? p.phone_number : '';
  if (!E164.test(phone)) fail();
  const authTime = Number(p.auth_time);
  if (!Number.isFinite(authTime) || Date.now() / 1000 - authTime > TOKEN_TTL_MS / 1000) fail();
  if (typeof p.sub !== 'string' || !p.sub || p.sub.length > 512) fail();
  return { sub: p.sub, phone };
}

export async function handlePhoneAuth(request, env, store, auth, dependencies = {}) {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  // GET /api/auth/phone/config — public; reveals only the public web key when enabled
  if (parts.length === 3 && parts[2] === 'config') {
    if (request.method !== 'GET') return response({ error: 'Unsupported request.' }, 405);
    return response(phoneConfig(env));
  }
  if (parts.length !== 3 || parts[2] !== 'verify' || request.method !== 'POST') {
    return response({ error: 'Unknown phone sign-in request.' }, 404);
  }
  const cfg = phoneConfig(env);
  if (!cfg.enabled) {
    return response({ error: 'Phone sign-in needs administrator setup. It is not live yet.', code: 'PHONE_NOT_CONFIGURED' }, 503);
  }
  const scope = 'phone:' + createHash('sha256').update(String(auth.rateKey || 'unknown')).digest('hex');
  if (!await store.allowStart(scope)) {
    return response({ error: 'Too many attempts. Try again in a few minutes.' }, 429);
  }
  let body = {};
  try {
    const text = await request.text();
    if (text.length > 16384) return response({ error: 'Request too large.' }, 413);
    body = JSON.parse(text || '{}');
  } catch { return response({ error: 'Invalid request.' }, 400); }
  try {
    const { phone } = await verifyFirebaseToken(body.idToken, cfg.projectId, dependencies);
    const digits = phone.replace(/\D/g, '');
    const user = await store.resolve({
      provider: 'phone', subject: phone,
      email: digits + '@phone.invalid', name: phone
    }, null);
    const session = await auth.session(user);
    return response({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, roleCustom: user.role_custom || null },
      token: session.token, expiresAt: session.expiresAt
    }, 200, { 'Set-Cookie': auth.cookie(session.token, request) });
  } catch { return response({ error: 'Phone verification failed. Try again.', code: 'PHONE_VERIFY_FAILED' }, 401); }
}
