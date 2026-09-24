#!/usr/bin/env node
/* ==========================================================================
   Quotation Studio — local platform API (Phase A)
   --------------------------------------------------------------------------
   Pure Node HTTP server: serves the static app + JSON API with a file-backed
   SQLite-free store (JSON on disk). Same route contract as the future
   Cloudflare Worker so the dashboard and studio client stay identical.

   Run:  node platform/local-server/server.js
   Open: http://0.0.0.0:8787/dashboard.html
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = process.env.QS_DATA_DIR
  ? path.resolve(process.env.QS_DATA_DIR)
  : path.join(__dirname, '../data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_DAYS = 30;
const COOKIE = 'qs_session';

/* ---------- tiny helpers ---------- */
function nowISO() { return new Date().toISOString(); }
function uid(prefix) {
  return (prefix || 'id') + '_' + crypto.randomBytes(8).toString('hex');
}
/* scrypt with explicit cost — not a bare SHA hash. N=2^15 keeps local
   register/login snappy while remaining expensive for offline guessing. */
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), s, 32, SCRYPT).toString('hex');
  return 'scrypt$' + s + '$' + hash;
}
function verifyPassword(password, stored) {
  const raw = String(stored || '');
  let salt, hash;
  if (raw.startsWith('scrypt$')) {
    const parts = raw.split('$');
    salt = parts[1]; hash = parts[2];
  } else {
    /* legacy salt:hash from early Phase A builds */
    const parts = raw.split(':');
    salt = parts[0]; hash = parts[1];
  }
  if (!salt || !hash) return false;
  let next;
  try {
    next = crypto.scryptSync(String(password), salt, 32, SCRYPT).toString('hex');
  } catch (_) {
    try { next = crypto.scryptSync(String(password), salt, 32).toString('hex'); }
    catch (e2) { return false; }
  }
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(next, 'hex'));
  } catch (_) {
    return false;
  }
}

/* Auth throttling: fixed IP ceiling + per-email exponential backoff.
   - Same 429 body for every blocked attempt (no username enumeration via limit).
   - Limits apply to the *attempt* path before user lookup, for any email string.
   - Successful login/register clears that email's backoff. */
const authHits = new Map();
const AUTH_429 = 'Too many sign-in attempts. Try again in a few minutes.';
function clientIp(req) {
  /* Prefer Cloudflare's verified edge header; do not trust X-Forwarded-For alone
     (it is attacker-controlled unless the edge strips/overwrites it). */
  const cf = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cf) return cf;
  return req.socket.remoteAddress || 'unknown';
}
function rateBucket(key) {
  let b = authHits.get(key);
  if (!b) {
    b = { fails: 0, blockedUntil: 0 };
    authHits.set(key, b);
  }
  return b;
}
/** Returns null if allowed, or retry-after seconds if blocked. */
function authThrottleCheck(req, email) {
  const now = Date.now();
  const ipKey = 'ip:' + clientIp(req);
  const ip = rateBucket(ipKey);
  /* Sliding-ish fixed window on IP: count recent fails; hard ceiling. */
  if (!ip.windowStart || now - ip.windowStart > 15 * 60 * 1000) {
    ip.windowStart = now;
    ip.windowCount = 0;
  }
  if (ip.windowCount >= 40) {
    return Math.max(1, Math.ceil((ip.windowStart + 15 * 60 * 1000 - now) / 1000));
  }
  const em = String(email || '').trim().toLowerCase();
  if (em) {
    const eb = rateBucket('email:' + em);
    if (eb.blockedUntil && now < eb.blockedUntil) {
      return Math.max(1, Math.ceil((eb.blockedUntil - now) / 1000));
    }
  }
  return null;
}
function authThrottleFail(req, email) {
  const now = Date.now();
  const ip = rateBucket('ip:' + clientIp(req));
  if (!ip.windowStart || now - ip.windowStart > 15 * 60 * 1000) {
    ip.windowStart = now;
    ip.windowCount = 0;
  }
  ip.windowCount += 1;
  const em = String(email || '').trim().toLowerCase();
  if (!em) return;
  const eb = rateBucket('email:' + em);
  eb.fails = (eb.fails || 0) + 1;
  /* Exponential backoff after the 5th failure: 2s, 4s, 8s… capped at 15 min.
     Early failures stay fast so a typo does not lock a real user out. */
  if (eb.fails >= 5) {
    const exp = Math.min(15 * 60, Math.pow(2, Math.min(eb.fails - 4, 10)));
    eb.blockedUntil = now + exp * 1000;
  }
}
function authThrottleSuccess(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return;
  authHits.delete('email:' + em);
}
function sendAuthLimited(res, retryAfterSec) {
  return sendJson(res, 429, { error: AUTH_429 }, {
    'Retry-After': String(Math.max(1, retryAfterSec || 60))
  });
}
function proposalRevision(row) {
  const n = Number(row && row.revision);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}
function sha256Hex(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}
function hashToken(raw) {
  return sha256Hex(String(raw || ''));
}
function newAccessTokenRaw() {
  return crypto.randomBytes(32).toString('base64url');
}
function publicVersion(v) {
  return {
    id: v.id,
    proposalId: v.proposal_id,
    versionLabel: v.version_label || '1.0',
    snapshotSha256: v.snapshot_sha256 || '',
    pdfSha256: v.pdf_sha256 || null,
    note: v.note || '',
    createdAt: v.created_at
  };
}
function publicToken(t, rawToken) {
  const out = {
    id: t.id,
    versionId: t.version_id,
    proposalId: t.proposal_id,
    label: t.label || '',
    expiresAt: t.expires_at || null,
    revokedAt: t.revoked_at || null,
    createdAt: t.created_at,
    firstOpenedAt: t.first_opened_at || null,
    lastOpenedAt: t.last_opened_at || null,
    openCount: t.open_count || 0,
    portalPath: '/portal.html?t='
  };
  if (rawToken) {
    out.token = rawToken;
    out.portalPath = '/portal.html?t=' + encodeURIComponent(rawToken);
  }
  return out;
}
function customerSnapshotFromProposal(row) {
  let form = {}, content = null, projectImages = null, pageImages = null, options = [];
  try { form = JSON.parse(row.form_json || '{}'); } catch (_) {}
  try { content = row.content_json ? JSON.parse(row.content_json) : null; } catch (_) {}
  try { projectImages = row.project_images_json ? JSON.parse(row.project_images_json) : null; } catch (_) {}
  try { pageImages = row.page_images_json ? JSON.parse(row.page_images_json) : null; } catch (_) {}
  try { options = JSON.parse(row.options_json || '[]'); } catch (_) {}
  /* Never expose internal staff fields in a frozen customer snapshot. */
  const safeForm = Object.assign({}, form);
  delete safeForm.internalNotes;
  delete safeForm.staffNotes;
  delete safeForm.costMargin;
  delete safeForm.marginPct;
  return {
    schema: 1,
    publishedAt: nowISO(),
    ref: row.ref || safeForm.propRef || '',
    versionLabel: row.version_label || safeForm.propVersion || '1.0',
    statusAtPublish: row.status || 'draft',
    form: safeForm,
    content,
    projectImages,
    pageImages,
    options,
    capacity: row.capacity || safeForm.capacity || '',
    customerName: row.customer_name || safeForm.custName || ''
  };
}
function findTokenByRaw(db, raw) {
  if (!raw || String(raw).length < 20) return null;
  const h = hashToken(raw);
  return (db.tokens || []).find((t) => t.token_hash === h) || null;
}
function tokenIsActive(t) {
  if (!t) return false;
  if (t.revoked_at) return false;
  if (t.expires_at && Date.parse(t.expires_at) <= Date.now()) return false;
  return true;
}
function recordEvent(db, partial) {
  const ev = {
    id: uid('evt'),
    token_id: partial.token_id || null,
    version_id: partial.version_id || null,
    proposal_id: partial.proposal_id || null,
    owner_id: partial.owner_id || null,
    event_type: partial.event_type || 'unknown',
    meta_json: JSON.stringify(partial.meta || {}),
    created_at: nowISO()
  };
  db.events.push(ev);
  return ev;
}
function parseExpiryDays(body) {
  if (body && body.expiresAt) {
    const t = Date.parse(body.expiresAt);
    if (Number.isFinite(t) && t > Date.now()) return new Date(t).toISOString();
  }
  let days = body && body.expiresInDays != null ? Number(body.expiresInDays) : 30;
  if (!Number.isFinite(days) || days <= 0) days = 30;
  if (days > 365) days = 365;
  return new Date(Date.now() + days * 864e5).toISOString();
}
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
      users: [], sessions: [], customers: [], proposals: [],
      versions: [], tokens: [], events: []
    }, null, 2));
  }
}
function loadDb() {
  ensureData();
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (!Array.isArray(db.versions)) db.versions = [];
  if (!Array.isArray(db.tokens)) db.tokens = [];
  if (!Array.isArray(db.events)) db.events = [];
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.sessions)) db.sessions = [];
  if (!Array.isArray(db.customers)) db.customers = [];
  if (!Array.isArray(db.proposals)) db.proposals = [];
  return db;
}
function saveDb(db) {
  ensureData();
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.map': 'application/json'
};

function send(res, status, body, headers) {
  const h = Object.assign({
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  }, headers || {});
  res.writeHead(status, h);
  res.end(body);
}
function sendJson(res, status, obj, extraHeaders) {
  send(res, status, JSON.stringify(obj), Object.assign({
    'Content-Type': 'application/json; charset=utf-8'
  }, extraHeaders || {}));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 8 * 1024 * 1024) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (_) { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}
function sessionCookie(token, maxAgeSec, req) {
  const parts = [
    COOKIE + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + String(maxAgeSec)
  ];
  /* Secure only on HTTPS so local http preview still stores the cookie. */
  const proto = (req && (req.headers['x-forwarded-proto'] || '')).split(',')[0].trim();
  const host = (req && req.headers.host) || '';
  if (proto === 'https' || (!proto && !/^localhost\b|^127\.0\.0\.1\b/i.test(host))) {
    /* Prefer Secure when we look production-like; never force it on localhost. */
  }
  if (proto === 'https') parts.push('Secure');
  return parts.join('; ');
}
function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
function proposalSummary(p) {
  return {
    id: p.id,
    ref: p.ref || '',
    title: p.title || 'Untitled',
    status: p.status || 'draft',
    version: p.version_label || '1.0',
    revision: proposalRevision(p),
    capacity: p.capacity || '',
    customer: p.customer_name || '',
    customerId: p.customer_id || null,
    localId: p.local_id || null,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    sentAt: p.sent_at || null,
    acceptedAt: p.accepted_at || null
  };
}
function proposalFull(p) {
  let form = {}, content = null, projectImages = null, pageImages = null, options = [];
  try { form = JSON.parse(p.form_json || '{}'); } catch (_) {}
  try { content = p.content_json ? JSON.parse(p.content_json) : null; } catch (_) {}
  try { projectImages = p.project_images_json ? JSON.parse(p.project_images_json) : null; } catch (_) {}
  try { pageImages = p.page_images_json ? JSON.parse(p.page_images_json) : null; } catch (_) {}
  try { options = JSON.parse(p.options_json || '[]'); } catch (_) {}
  return Object.assign(proposalSummary(p), {
    form, content, projectImages, pageImages, options,
    prevId: p.prev_id || null
  });
}
function metaFromBody(body, existing) {
  const form = body.form && typeof body.form === 'object' ? body.form : (existing && existing.form) || {};
  const customer = form.custName || body.customer || (existing && existing.customer_name) || '';
  const capacity = form.capacity != null ? String(form.capacity) : ((existing && existing.capacity) || '');
  const ref = form.propRef || body.ref || (existing && existing.ref) || '';
  const version = form.propVersion || body.version || (existing && existing.version_label) || '1.0';
  const title = body.title ||
    ((customer || 'Untitled customer') + ' — ' + (capacity || '0') + ' kWp');
  return { form, customer, capacity, ref, version, title };
}
function scrubExpiredSessions(db) {
  const t = Date.now();
  db.sessions = (db.sessions || []).filter((s) => Date.parse(s.expires_at) > t);
}
function requireUser(req, db) {
  scrubExpiredSessions(db);
  const cookies = parseCookies(req);
  const token = cookies[COOKIE];
  if (!token) return null;
  const session = (db.sessions || []).find((s) => s.token === token);
  if (!session) return null;
  if (Date.parse(session.expires_at) <= Date.now()) return null;
  const user = (db.users || []).find((u) => u.id === session.user_id);
  return user || null;
}
function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const clean = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  if (clean.includes('\0')) return null;
  const full = path.join(ROOT, clean);
  if (!full.startsWith(ROOT)) return null;
  return full;
}

/* ---------- API handlers ---------- */
async function handleApi(req, res, url) {
  const db = loadDb();
  const method = req.method || 'GET';
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  try {
    /* AUTH */
    if (parts[0] === 'auth' && parts[1] === 'register' && method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim() || email.split('@')[0] || 'User';
      const password = String(body.password || '');
      /* Throttle before existence checks so 429 timing/body cannot reveal accounts. */
      const blocked = authThrottleCheck(req, email);
      if (blocked != null) return sendAuthLimited(res, blocked);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        authThrottleFail(req, email);
        return sendJson(res, 400, { error: 'Valid email required' });
      }
      if (password.length < 8) {
        authThrottleFail(req, email);
        return sendJson(res, 400, { error: 'Password must be at least 8 characters' });
      }
      if ((db.users || []).some((u) => u.email.toLowerCase() === email)) {
        /* Count as a failed auth-shaped attempt so register spam still backs off,
           but keep the existing-account message (registration UX needs it). */
        authThrottleFail(req, email);
        return sendJson(res, 409, { error: 'An account with this email already exists' });
      }
      const user = {
        id: uid('usr'),
        email,
        name,
        password_hash: hashPassword(password),
        role: (db.users || []).length === 0 ? 'owner' : 'sales',
        created_at: nowISO(),
        updated_at: nowISO()
      };
      db.users.push(user);
      authThrottleSuccess(email);
      const token = crypto.randomBytes(24).toString('hex');
      const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
      db.sessions.push({ token, user_id: user.id, expires_at: expires, created_at: nowISO() });
      saveDb(db);
      return sendJson(res, 201, { user: publicUser(user) }, {
        'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400, req)
      });
    }

    if (parts[0] === 'auth' && parts[1] === 'login' && method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const blocked = authThrottleCheck(req, email);
      if (blocked != null) return sendAuthLimited(res, blocked);
      const user = (db.users || []).find((u) => u.email.toLowerCase() === email);
      /* Uniform failure path: same status + message whether email is unknown
         or password is wrong (no username enumeration on login). */
      if (!user || !verifyPassword(password, user.password_hash)) {
        authThrottleFail(req, email);
        return sendJson(res, 401, { error: 'Invalid email or password' });
      }
      authThrottleSuccess(email);
      const token = crypto.randomBytes(24).toString('hex');
      const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
      db.sessions.push({ token, user_id: user.id, expires_at: expires, created_at: nowISO() });
      saveDb(db);
      return sendJson(res, 200, { user: publicUser(user) }, {
        'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400, req)
      });
    }

    if (parts[0] === 'auth' && parts[1] === 'logout' && method === 'POST') {
      const cookies = parseCookies(req);
      const token = cookies[COOKIE];
      if (token) {
        db.sessions = (db.sessions || []).filter((s) => s.token !== token);
        saveDb(db);
      }
      return sendJson(res, 200, { ok: true }, {
        'Set-Cookie': sessionCookie('', 0, req)
      });
    }

    if (parts[0] === 'auth' && parts[1] === 'me' && method === 'GET') {
      const user = requireUser(req, db);
      if (!user) return sendJson(res, 401, { error: 'Not signed in' });
      return sendJson(res, 200, { user: publicUser(user) });
    }

    if (parts[0] === 'health' && method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        phase: 'B',
        storage: 'local-json',
        time: nowISO()
      });
    }

    /* ---------- Public customer portal (token only — no staff session) ---------- */
    if (parts[0] === 'portal' && parts[1] === 'proposal' && method === 'GET') {
      const raw = String(url.searchParams.get('t') || '');
      const tok = findTokenByRaw(db, raw);
      if (!tok || !tokenIsActive(tok)) {
        return sendJson(res, 404, {
          error: 'This proposal link is invalid, expired, or has been revoked. Please contact the sender for a new link or the PDF.'
        });
      }
      const version = (db.versions || []).find((v) => v.id === tok.version_id);
      if (!version) {
        return sendJson(res, 404, { error: 'The published proposal version is no longer available.' });
      }
      let snapshot = null;
      try { snapshot = JSON.parse(version.snapshot_json); } catch (_) {
        return sendJson(res, 500, { error: 'Published proposal data could not be read.' });
      }
      const ua = String(req.headers['user-agent'] || '').slice(0, 180);
      const isPrefetch = /bot|crawl|spider|preview|whatsapp|facebookexternalhit|slackbot|twitterbot|linkedinbot|discordbot|embedly|quora/i.test(ua)
        || String(req.headers['purpose'] || '').toLowerCase() === 'prefetch'
        || String(req.headers['sec-purpose'] || '').toLowerCase().includes('prefetch');
      if (isPrefetch) {
        recordEvent(db, {
          token_id: tok.id,
          version_id: version.id,
          proposal_id: tok.proposal_id,
          owner_id: tok.owner_id,
          event_type: 'suspected_prefetch',
          meta: { ua }
        });
      } else {
        if (!tok.first_opened_at) tok.first_opened_at = nowISO();
        tok.last_opened_at = nowISO();
        tok.open_count = (tok.open_count || 0) + 1;
        recordEvent(db, {
          token_id: tok.id,
          version_id: version.id,
          proposal_id: tok.proposal_id,
          owner_id: tok.owner_id,
          event_type: 'link_opened',
          meta: { ua, openCount: tok.open_count }
        });
      }
      saveDb(db);
      return sendJson(res, 200, {
        version: publicVersion(version),
        snapshot,
        access: {
          expiresAt: tok.expires_at || null,
          openCount: tok.open_count || 0,
          privacyNote: 'Opening this link may be recorded so the sender can follow up. No payment data is collected here.'
        }
      });
    }

    if (parts[0] === 'portal' && parts[1] === 'event' && method === 'POST') {
      const body = await readBody(req);
      const raw = String(body.token || url.searchParams.get('t') || '');
      const tok = findTokenByRaw(db, raw);
      if (!tok || !tokenIsActive(tok)) {
        return sendJson(res, 404, { error: 'Invalid or revoked link' });
      }
      const allowed = {
        pdf_download_requested: true,
        section_view: true,
        interest_recorded: true,
        survey_requested: true
      };
      const type = String(body.type || '');
      if (!allowed[type]) {
        return sendJson(res, 400, { error: 'Unknown event type' });
      }
      recordEvent(db, {
        token_id: tok.id,
        version_id: tok.version_id,
        proposal_id: tok.proposal_id,
        owner_id: tok.owner_id,
        event_type: type,
        meta: body.meta && typeof body.meta === 'object' ? body.meta : {}
      });
      saveDb(db);
      return sendJson(res, 201, { ok: true });
    }

    /* Everything below needs a staff session */
    const user = requireUser(req, db);
    if (!user) return sendJson(res, 401, { error: 'Sign in required' });

    /* DASHBOARD SUMMARY */
    if (parts[0] === 'dashboard' && parts[1] === 'summary' && method === 'GET') {
      const mine = (db.proposals || []).filter((p) => p.owner_id === user.id);
      const byStatus = {};
      mine.forEach((p) => {
        const s = p.status || 'draft';
        byStatus[s] = (byStatus[s] || 0) + 1;
      });
      const recent = mine
        .slice()
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .slice(0, 8)
        .map(proposalSummary);
      /* Phase A honesty: no real send/open pipeline yet. "Ready" is a staff
         status only — never labelled as verified customer delivery. */
      return sendJson(res, 200, {
        counts: {
          total: mine.length,
          draft: byStatus.draft || 0,
          ready: (byStatus.ready || 0) + (byStatus.internal_review || 0),
          accepted: byStatus.accepted || 0,
          /* kept for older clients; same values, not "provider-confirmed sent" */
          sent: (byStatus.sent || 0) + (byStatus.viewed || 0),
          won: byStatus.accepted || 0,
          lost: byStatus.rejected || 0,
          byStatus
        },
        recent
      });
    }

    /* PROPOSALS */
    if (parts[0] === 'proposals' && parts.length === 1 && method === 'GET') {
      const mine = (db.proposals || [])
        .filter((p) => p.owner_id === user.id)
        .slice()
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .map(proposalSummary);
      return sendJson(res, 200, { proposals: mine });
    }

    if (parts[0] === 'proposals' && parts.length === 1 && method === 'POST') {
      const body = await readBody(req);
      const meta = metaFromBody(body, null);
      const row = {
        id: uid('prp'),
        owner_id: user.id,
        customer_id: body.customerId || null,
        ref: meta.ref,
        title: meta.title,
        status: body.status || 'draft',
        version_label: meta.version,
        prev_id: body.prevId || null,
        capacity: meta.capacity,
        customer_name: meta.customer,
        form_json: JSON.stringify(meta.form || {}),
        content_json: body.content != null ? JSON.stringify(body.content) : null,
        project_images_json: body.projectImages != null ? JSON.stringify(body.projectImages) : null,
        page_images_json: body.pageImages != null ? JSON.stringify(body.pageImages) : null,
        options_json: JSON.stringify(Array.isArray(body.options) ? body.options : []),
        local_id: body.localId || null,
        sent_at: body.sentAt || null,
        accepted_at: body.acceptedAt || null,
        revision: 1,
        created_at: nowISO(),
        updated_at: nowISO()
      };
      db.proposals.push(row);
      saveDb(db);
      return sendJson(res, 201, { proposal: proposalFull(row) });
    }

    if (parts[0] === 'proposals' && parts[1] && parts.length === 2 && method === 'GET') {
      const row = (db.proposals || []).find((p) => p.id === parts[1] && p.owner_id === user.id);
      if (!row) return sendJson(res, 404, { error: 'Proposal not found' });
      return sendJson(res, 200, { proposal: proposalFull(row) });
    }

    if (parts[0] === 'proposals' && parts[1] && parts.length === 2 && method === 'PUT') {
      const row = (db.proposals || []).find((p) => p.id === parts[1] && p.owner_id === user.id);
      if (!row) return sendJson(res, 404, { error: 'Proposal not found' });
      const body = await readBody(req);
      /* Conflict guard: monotonic server revision (not client clocks). Client
         sends baseRevision from the last load/save; mismatch → 409, work kept. */
      if (body.baseRevision != null && body.baseRevision !== '') {
        const theirs = Number(body.baseRevision);
        const mine = proposalRevision(row);
        if (Number.isFinite(theirs) && theirs !== mine) {
          return sendJson(res, 409, {
            error: 'This proposal was saved more recently in the cloud. Reload it, then save again so your edits are not overwritten.',
            code: 'CONFLICT',
            proposal: proposalFull(row)
          });
        }
      }
      const meta = metaFromBody(body, row);
      if (body.status) row.status = body.status;
      if (body.customerId !== undefined) row.customer_id = body.customerId;
      if (body.localId !== undefined) row.local_id = body.localId;
      if (body.sentAt !== undefined) row.sent_at = body.sentAt;
      if (body.acceptedAt !== undefined) row.accepted_at = body.acceptedAt;
      if (body.prevId !== undefined) row.prev_id = body.prevId;
      row.ref = meta.ref;
      row.title = meta.title;
      row.version_label = meta.version;
      row.capacity = meta.capacity;
      row.customer_name = meta.customer;
      if (body.form !== undefined) row.form_json = JSON.stringify(meta.form || {});
      if (body.content !== undefined) {
        row.content_json = body.content == null ? null : JSON.stringify(body.content);
      }
      if (body.projectImages !== undefined) {
        row.project_images_json = body.projectImages == null ? null : JSON.stringify(body.projectImages);
      }
      if (body.pageImages !== undefined) {
        row.page_images_json = body.pageImages == null ? null : JSON.stringify(body.pageImages);
      }
      if (body.options !== undefined) {
        row.options_json = JSON.stringify(Array.isArray(body.options) ? body.options : []);
      }
      row.revision = proposalRevision(row) + 1;
      row.updated_at = nowISO();
      saveDb(db);
      return sendJson(res, 200, { proposal: proposalFull(row) });
    }

    if (parts[0] === 'proposals' && parts[1] && parts.length === 2 && method === 'DELETE') {
      const before = (db.proposals || []).length;
      db.proposals = (db.proposals || []).filter(
        (p) => !(p.id === parts[1] && p.owner_id === user.id)
      );
      if (db.proposals.length === before) {
        return sendJson(res, 404, { error: 'Proposal not found' });
      }
      saveDb(db);
      return sendJson(res, 200, { ok: true });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'duplicate' && method === 'POST') {
      const row = (db.proposals || []).find((p) => p.id === parts[1] && p.owner_id === user.id);
      if (!row) return sendJson(res, 404, { error: 'Proposal not found' });
      let form = {};
      try { form = JSON.parse(row.form_json || '{}'); } catch (_) {}
      form = Object.assign({}, form);
      if (form.custName) form.custName = form.custName + ' (copy)';
      form.propRef = '';
      const copy = {
        id: uid('prp'),
        owner_id: user.id,
        customer_id: row.customer_id,
        ref: '',
        title: (form.custName || 'Untitled') + ' — ' + (form.capacity || row.capacity || '0') + ' kWp',
        status: 'draft',
        version_label: '1.0',
        prev_id: null,
        capacity: row.capacity,
        customer_name: form.custName || row.customer_name,
        form_json: JSON.stringify(form),
        content_json: row.content_json,
        project_images_json: row.project_images_json,
        page_images_json: row.page_images_json,
        options_json: row.options_json,
        local_id: null,
        sent_at: null,
        accepted_at: null,
        revision: 1,
        created_at: nowISO(),
        updated_at: nowISO()
      };
      db.proposals.push(copy);
      saveDb(db);
      return sendJson(res, 201, { proposal: proposalFull(copy) });
    }

    /* ---------- Phase B: publish frozen version + secure customer link ---------- */
    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'publish' && method === 'POST') {
      const row = (db.proposals || []).find((p) => p.id === parts[1] && p.owner_id === user.id);
      if (!row) return sendJson(res, 404, { error: 'Proposal not found' });
      const body = await readBody(req);
      const snapshot = customerSnapshotFromProposal(row);
      const snapshotJson = JSON.stringify(snapshot);
      const version = {
        id: uid('ver'),
        proposal_id: row.id,
        owner_id: user.id,
        version_label: snapshot.versionLabel || row.version_label || '1.0',
        snapshot_json: snapshotJson,
        snapshot_sha256: sha256Hex(snapshotJson),
        pdf_sha256: null,
        pdf_path: null,
        note: String(body.note || '').slice(0, 500),
        created_at: nowISO()
      };
      db.versions.push(version);

      const rawToken = newAccessTokenRaw();
      const expiresAt = parseExpiryDays(body);
      const tokenRow = {
        id: uid('tok'),
        token_hash: hashToken(rawToken),
        version_id: version.id,
        proposal_id: row.id,
        owner_id: user.id,
        label: String(body.label || 'Customer link').slice(0, 120),
        expires_at: expiresAt,
        revoked_at: null,
        created_at: nowISO(),
        first_opened_at: null,
        last_opened_at: null,
        open_count: 0
      };
      db.tokens.push(tokenRow);

      if (row.status === 'draft' || row.status === 'ready' || row.status === 'internal_review') {
        row.status = 'sent';
        if (!row.sent_at) row.sent_at = nowISO();
        row.updated_at = nowISO();
      }
      recordEvent(db, {
        token_id: tokenRow.id,
        version_id: version.id,
        proposal_id: row.id,
        owner_id: user.id,
        event_type: 'version_published',
        meta: { snapshotSha256: version.snapshot_sha256 }
      });
      saveDb(db);
      return sendJson(res, 201, {
        version: publicVersion(version),
        access: publicToken(tokenRow, rawToken),
        message: 'Published an immutable customer version. Editing the draft will not change this link.'
      });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'versions' && method === 'GET') {
      const row = (db.proposals || []).find((p) => p.id === parts[1] && p.owner_id === user.id);
      if (!row) return sendJson(res, 404, { error: 'Proposal not found' });
      const list = (db.versions || [])
        .filter((v) => v.proposal_id === row.id && v.owner_id === user.id)
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .map(publicVersion);
      return sendJson(res, 200, { versions: list });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'links' && method === 'GET') {
      const row = (db.proposals || []).find((p) => p.id === parts[1] && p.owner_id === user.id);
      if (!row) return sendJson(res, 404, { error: 'Proposal not found' });
      const list = (db.tokens || [])
        .filter((t) => t.proposal_id === row.id && t.owner_id === user.id)
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .map((t) => publicToken(t, null));
      return sendJson(res, 200, { links: list });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'links' && method === 'POST') {
      const row = (db.proposals || []).find((p) => p.id === parts[1] && p.owner_id === user.id);
      if (!row) return sendJson(res, 404, { error: 'Proposal not found' });
      const body = await readBody(req);
      let version = null;
      if (body.versionId) {
        version = (db.versions || []).find(
          (v) => v.id === body.versionId && v.proposal_id === row.id && v.owner_id === user.id
        );
      } else {
        version = (db.versions || [])
          .filter((v) => v.proposal_id === row.id && v.owner_id === user.id)
          .slice()
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      }
      if (!version) {
        return sendJson(res, 400, {
          error: 'Publish a version first, then create additional customer links.'
        });
      }
      const rawToken = newAccessTokenRaw();
      const tokenRow = {
        id: uid('tok'),
        token_hash: hashToken(rawToken),
        version_id: version.id,
        proposal_id: row.id,
        owner_id: user.id,
        label: String(body.label || 'Customer link').slice(0, 120),
        expires_at: parseExpiryDays(body),
        revoked_at: null,
        created_at: nowISO(),
        first_opened_at: null,
        last_opened_at: null,
        open_count: 0
      };
      db.tokens.push(tokenRow);
      saveDb(db);
      return sendJson(res, 201, {
        version: publicVersion(version),
        access: publicToken(tokenRow, rawToken)
      });
    }

    if (parts[0] === 'links' && parts[1] && parts[2] === 'revoke' && method === 'POST') {
      const tok = (db.tokens || []).find((t) => t.id === parts[1] && t.owner_id === user.id);
      if (!tok) return sendJson(res, 404, { error: 'Link not found' });
      if (!tok.revoked_at) tok.revoked_at = nowISO();
      recordEvent(db, {
        token_id: tok.id,
        version_id: tok.version_id,
        proposal_id: tok.proposal_id,
        owner_id: user.id,
        event_type: 'link_revoked',
        meta: {}
      });
      saveDb(db);
      return sendJson(res, 200, { access: publicToken(tok, null) });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'events' && method === 'GET') {
      const row = (db.proposals || []).find((p) => p.id === parts[1] && p.owner_id === user.id);
      if (!row) return sendJson(res, 404, { error: 'Proposal not found' });
      const list = (db.events || [])
        .filter((e) => e.proposal_id === row.id && e.owner_id === user.id)
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 100)
        .map((e) => ({
          id: e.id,
          type: e.event_type,
          versionId: e.version_id,
          tokenId: e.token_id,
          createdAt: e.created_at,
          meta: (() => { try { return JSON.parse(e.meta_json || '{}'); } catch (_) { return {}; } })()
        }));
      return sendJson(res, 200, { events: list });
    }

    return sendJson(res, 404, { error: 'Unknown API route' });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    return sendJson(res, status, { error: (err && err.message) || 'Server error' });
  }
}

/* ---------- static + router ---------- */
function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  /* dashboard pretty path */
  if (rel === '/dashboard') rel = '/dashboard.html';
  const full = safePath(rel);
  if (!full) return send(res, 400, 'Bad path');
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    const ext = path.extname(full).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const cache = (ext === '.html' || ext === '.js' || ext === '.css')
      ? 'no-cache' : 'public, max-age=86400';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(full).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const host = req.headers.host || ('localhost:' + PORT);
  let url;
  try { url = new URL(req.url || '/', 'http://' + host); }
  catch (_) { return send(res, 400, 'Bad URL'); }

  if (req.method === 'OPTIONS') {
    /* Same-origin app: no wildcard CORS with credentials. Allow only the
       requesting Origin when it matches this host (local preview / Pages). */
    const origin = req.headers.origin || '';
    const host = req.headers.host || '';
    let allowOrigin = '';
    if (origin) {
      try {
        const o = new URL(origin);
        if (o.host === host || o.hostname === 'localhost' || o.hostname === '127.0.0.1') {
          allowOrigin = origin;
        }
      } catch (_) {}
    }
    const headers = {
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    if (allowOrigin) {
      headers['Access-Control-Allow-Origin'] = allowOrigin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    return send(res, 204, '', headers);
  }

  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return handleApi(req, res, url);
  }
  return serveStatic(req, res, url.pathname);
});

ensureData();
server.listen(PORT, HOST, () => {
  console.log('Quotation Studio platform (Phase A + B)');
  console.log('  App:    http://' + HOST + ':' + PORT + '/quotation.html');
  console.log('  Dash:   http://' + HOST + ':' + PORT + '/dashboard.html');
  console.log('  Portal: http://' + HOST + ':' + PORT + '/portal.html?t=<token>');
  console.log('  API:    http://' + HOST + ':' + PORT + '/api/health');
  console.log('  Data:   ' + DB_PATH);
});
