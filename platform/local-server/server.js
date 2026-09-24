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

const SEND_CHANNELS = {
  whatsapp_manual: { label: 'WhatsApp (manual)', provider: 'manual' },
  email_manual: { label: 'Email (manual)', provider: 'manual' },
  copy_link: { label: 'Copy link only', provider: 'manual' },
  other: { label: 'Other / offline', provider: 'manual' }
};
const SEND_STATES = {
  draft: 'Draft',
  share_clicked: 'Share opened (not delivery-confirmed)',
  submitted_to_provider: 'Submitted to provider',
  delivered: 'Delivered (provider-confirmed only)',
  failed: 'Failed',
  cancelled: 'Cancelled'
};
function publicSend(s) {
  return {
    id: s.id,
    proposalId: s.proposal_id,
    versionId: s.version_id || null,
    tokenId: s.token_id || null,
    channel: s.channel,
    channelLabel: (SEND_CHANNELS[s.channel] || {}).label || s.channel,
    state: s.state,
    stateLabel: SEND_STATES[s.state] || s.state,
    recipientName: s.recipient_name || '',
    recipientTo: s.recipient_to || '',
    messageBody: s.message_body || '',
    portalUrl: s.portal_url || '',
    provider: s.provider || 'manual',
    providerMessageId: s.provider_message_id || null,
    note: s.note || '',
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    shareClickedAt: s.share_clicked_at || null,
    submittedAt: s.submitted_at || null,
    deliveredAt: s.delivered_at || null,
    /* Honest capability flags — UI must not invent delivery for manual channels */
    canConfirmDelivery: s.provider !== 'manual' && s.state === 'submitted_to_provider',
    deliveryIsVerified: s.state === 'delivered' && !!s.delivered_at && s.provider !== 'manual'
  };
}
function buildDefaultMessage(row, portalUrl) {
  let form = {};
  try { form = JSON.parse(row.form_json || '{}'); } catch (_) {}
  const company = form.companyName || 'KTM Energy Experts';
  const cust = row.customer_name || form.custName || 'there';
  const cap = row.capacity || form.capacity || '';
  const ref = row.ref || form.propRef || '';
  const lines = [
    'Dear ' + cust + ',',
    '',
    'Please find your personalised rooftop solar proposal from ' + company +
      (cap ? (' for ' + cap + ' kWp') : '') +
      (ref ? (' (reference ' + ref + ')') : '') + '.',
    '',
    'Secure proposal link (read-only):',
    portalUrl || '[link will appear after publish]',
    '',
    'You can review the system design, savings summary and next steps in your browser.',
    'A PDF can be downloaded from the same page. This link does not require a password.',
    '',
    'If you have questions or would like a site survey, reply on this chat or use the request form inside the proposal.',
    '',
    'Kind regards,',
    company,
    form.companyPhone ? String(form.companyPhone) : '',
    form.companyEmail ? String(form.companyEmail) : ''
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === ''));
  return lines.join('\n');
}
function digitsForWhatsApp(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) digits = '91' + digits;
  return /^[1-9]\d{10,14}$/.test(digits) ? digits : '';
}

const NOTIFY_KINDS = {
  link_opened: { title: 'Proposal link opened', priority: 'normal' },
  suspected_prefetch: { title: 'Link preview / bot (not a confirmed open)', priority: 'low' },
  pdf_download_requested: { title: 'PDF download requested', priority: 'normal' },
  survey_requested: { title: 'Customer requested a survey / review', priority: 'high' },
  interest_recorded: { title: 'Customer interest recorded', priority: 'high' },
  share_clicked: { title: 'Share flow started', priority: 'low' },
  version_published: { title: 'Version published', priority: 'low' },
  link_revoked: { title: 'Customer link revoked', priority: 'normal' },
  task_due: { title: 'Follow-up due', priority: 'high' },
  task_overdue: { title: 'Follow-up overdue', priority: 'high' }
};

function pushNotification(db, partial) {
  const n = {
    id: uid('ntf'),
    owner_id: partial.owner_id,
    proposal_id: partial.proposal_id || null,
    event_id: partial.event_id || null,
    kind: partial.kind || 'info',
    title: String(partial.title || 'Notification').slice(0, 200),
    body: String(partial.body || '').slice(0, 500),
    read_at: null,
    created_at: nowISO()
  };
  db.notifications.push(n);
  /* Keep the newest 500 per owner to bound local JSON size. */
  const mine = db.notifications.filter((x) => x.owner_id === n.owner_id);
  if (mine.length > 500) {
    const drop = new Set(
      mine.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .slice(0, mine.length - 500).map((x) => x.id)
    );
    db.notifications = db.notifications.filter((x) => !drop.has(x.id));
  }
  return n;
}

function publicNotification(n) {
  return {
    id: n.id,
    proposalId: n.proposal_id || null,
    eventId: n.event_id || null,
    kind: n.kind,
    title: n.title,
    body: n.body,
    readAt: n.read_at || null,
    createdAt: n.created_at,
    unread: !n.read_at
  };
}

function publicTask(t) {
  const due = t.due_at ? Date.parse(t.due_at) : null;
  const overdue = t.status === 'open' && due != null && due < Date.now();
  return {
    id: t.id,
    proposalId: t.proposal_id || null,
    title: t.title || '',
    notes: t.notes || '',
    dueAt: t.due_at || null,
    status: t.status || 'open',
    overdue: !!overdue,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    completedAt: t.completed_at || null
  };
}

function proposalQuotedValue(row) {
  let form = {};
  try { form = JSON.parse(row.form_json || '{}'); } catch (_) {}
  const keys = ['netInvestment', 'totalInvestment', 'projectCost', 'systemCost', 'grossCost', 'priceTotal'];
  for (let i = 0; i < keys.length; i++) {
    const n = Number(form[keys[i]]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const cap = Number(row.capacity || form.capacity || 0);
  const rate = Number(form.ratePerKwp || form.pricePerKwp || form.epcRate || 0);
  if (Number.isFinite(cap) && cap > 0 && Number.isFinite(rate) && rate > 0) return cap * rate;
  return null;
}

function roleRank(role) {
  if (role === 'owner') return 3;
  if (role === 'sales') return 2;
  if (role === 'viewer') return 1;
  return 0;
}

function requireRole(user, minRole) {
  return roleRank(permissionRole(user)) >= roleRank(minRole);
}

/** Notify owner when a customer-facing event is worth a follow-up. */
function notifyFromPortalEvent(db, ev) {
  if (!ev || !ev.owner_id) return null;
  const skip = { suspected_prefetch: true };
  if (skip[ev.event_type]) return null;
  const kindMeta = NOTIFY_KINDS[ev.event_type];
  if (!kindMeta) return null;
  /* Only first confirmed open gets a notification — not every refresh. */
  if (ev.event_type === 'link_opened') {
    let meta = {};
    try { meta = JSON.parse(ev.meta_json || '{}'); } catch (_) {}
    if (meta.openCount && Number(meta.openCount) > 1) return null;
  }
  const prop = (db.proposals || []).find((p) => p.id === ev.proposal_id);
  const who = prop ? (prop.customer_name || prop.ref || 'a proposal') : 'a proposal';
  return pushNotification(db, {
    owner_id: ev.owner_id,
    proposal_id: ev.proposal_id || null,
    event_id: ev.id,
    kind: ev.event_type,
    title: kindMeta.title,
    body: who + (prop && prop.ref ? ' · ' + prop.ref : '')
  });
}
function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
      users: [], sessions: [], customers: [], proposals: [],
      versions: [], tokens: [], events: [], sends: [],
      notifications: [], tasks: [], password_resets: []
    }, null, 2));
  }
}
function loadDb() {
  ensureData();
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  if (!Array.isArray(db.versions)) db.versions = [];
  if (!Array.isArray(db.tokens)) db.tokens = [];
  if (!Array.isArray(db.events)) db.events = [];
  if (!Array.isArray(db.sends)) db.sends = [];
  if (!Array.isArray(db.notifications)) db.notifications = [];
  if (!Array.isArray(db.tasks)) db.tasks = [];
  if (!Array.isArray(db.password_resets)) db.password_resets = [];
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.sessions)) db.sessions = [];
  if (!Array.isArray(db.customers)) db.customers = [];
  if (!Array.isArray(db.proposals)) db.proposals = [];
  return db;
}
function passwordPolicyError(password) {
  const p = String(password || '');
  if (p.length < 8) return 'Password must be at least 8 characters';
  if (p.length > 128) return 'Password must be at most 128 characters';
  if (/\s/.test(p)) return 'Password cannot contain spaces';
  return null;
}
function revokeUserSessions(db, userId, keepToken) {
  db.sessions = (db.sessions || []).filter((s) => {
    if (s.user_id !== userId) return true;
    if (keepToken && s.token === keepToken) return true;
    return false;
  });
}
function issuePasswordReset(db, user) {
  /* Invalidate previous unused codes for this user. */
  const now = nowISO();
  (db.password_resets || []).forEach((r) => {
    if (r.user_id === user.id && !r.used_at) r.used_at = now;
  });
  const raw = crypto.randomBytes(4).toString('hex') + '-' + crypto.randomBytes(4).toString('hex');
  const row = {
    id: uid('rst'),
    user_id: user.id,
    code_hash: hashToken(raw.toLowerCase()),
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    used_at: null,
    created_at: now
  };
  db.password_resets.push(row);
  return raw.toLowerCase();
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
  const proto = (req && (req.headers['x-forwarded-proto'] || '')).split(',')[0].trim();
  const isHttps = proto === 'https';
  /* Lax on plain HTTP (local). None+Secure on HTTPS so an embedded preview
     iframe can still receive the cookie when the browser allows it. Bearer
     token in the API client is the reliable fallback when cookies are blocked. */
  const parts = [
    COOKIE + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=' + (isHttps ? 'None' : 'Lax'),
    'Max-Age=' + String(maxAgeSec)
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}
function roleDisplay(u) {
  if (!u) return '';
  const r = String(u.role || '').toLowerCase();
  if (r === 'custom' && u.role_custom) return String(u.role_custom);
  if (r === 'owner') return 'Owner';
  if (r === 'sales') return 'Sales';
  if (r === 'viewer') return 'Viewer';
  if (u.role_custom) return String(u.role_custom);
  return u.role || '';
}
function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    roleCustom: u.role_custom || null,
    roleLabel: roleDisplay(u)
  };
}
/** Permission rank: custom titles act as Sales (can write, cannot manage team). */
function permissionRole(user) {
  const r = String((user && user.role) || '').toLowerCase();
  if (r === 'owner') return 'owner';
  if (r === 'viewer') return 'viewer';
  return 'sales'; /* sales + custom */
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
/* Session token sources (first match wins):
   1) Authorization: Bearer <token>
   2) X-QS-Session header (proxies sometimes strip Authorization)
   3) HttpOnly qs_session cookie
   4) qs_client cookie set by the browser JS when storage works but cookies from Set-Cookie do not */
function sessionTokenFrom(req) {
  const auth = String(req.headers.authorization || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && m[1]) return m[1].trim();
  const hdr = String(req.headers['x-qs-session'] || '').trim();
  if (hdr) return hdr;
  const cookies = parseCookies(req);
  return cookies[COOKIE] || cookies['qs_client'] || null;
}
function requireUser(req, db) {
  scrubExpiredSessions(db);
  const token = sessionTokenFrom(req);
  if (!token) return null;
  const session = (db.sessions || []).find((s) => s.token === token);
  if (!session) return null;
  if (Date.parse(session.expires_at) <= Date.now()) return null;
  const user = (db.users || []).find((u) => u.id === session.user_id);
  return user || null;
}
function createSession(db, user) {
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.sessions.push({ token, user_id: user.id, expires_at: expires, created_at: nowISO() });
  return { token, expiresAt: expires };
}
function authSuccessHeaders(token, req) {
  return { 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400, req) };
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
        return sendJson(res, 400, { error: 'Enter a valid email address (for example name@company.com).' });
      }
      const policy = passwordPolicyError(password);
      if (policy) {
        authThrottleFail(req, email);
        return sendJson(res, 400, { error: policy });
      }
      if ((db.users || []).some((u) => u.email.toLowerCase() === email)) {
        /* Registration needs a clear duplicate message; login stays non-enumerating. */
        authThrottleFail(req, email);
        return sendJson(res, 409, {
          error: 'An account with this email already exists. Sign in instead, or use Forgot password if you cannot access it.'
        });
      }
      /* Role chosen on Create account: owner | sales | viewer | custom. */
      let role = String(body.role || 'sales').trim().toLowerCase();
      let roleCustom = null;
      if (role === 'custom') {
        roleCustom = String(body.roleCustom || body.customRole || '').trim().slice(0, 60);
        if (!roleCustom) {
          authThrottleFail(req, email);
          return sendJson(res, 400, { error: 'Enter a custom role title (for example Project lead).' });
        }
        role = 'custom';
      } else if (!['owner', 'sales', 'viewer'].includes(role)) {
        authThrottleFail(req, email);
        return sendJson(res, 400, { error: 'Choose a role: Owner, Sales, Viewer, or Custom.' });
      }
      const user = {
        id: uid('usr'),
        email,
        name: name.slice(0, 120),
        password_hash: hashPassword(password),
        role,
        role_custom: roleCustom,
        created_at: nowISO(),
        updated_at: nowISO()
      };
      db.users.push(user);
      authThrottleSuccess(email);
      const sess = createSession(db, user);
      saveDb(db);
      return sendJson(res, 201, { user: publicUser(user), token: sess.token, expiresAt: sess.expiresAt }, authSuccessHeaders(sess.token, req));
    }

    if (parts[0] === 'auth' && parts[1] === 'login' && method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const blocked = authThrottleCheck(req, email);
      if (blocked != null) return sendAuthLimited(res, blocked);
      if (!email || !password) {
        authThrottleFail(req, email);
        return sendJson(res, 401, { error: 'Invalid email or password' });
      }
      const user = (db.users || []).find((u) => u.email.toLowerCase() === email);
      /* Uniform failure path: same status + message whether email is unknown
         or password is wrong (no username enumeration on login). */
      if (!user || !verifyPassword(password, user.password_hash)) {
        authThrottleFail(req, email);
        return sendJson(res, 401, { error: 'Invalid email or password' });
      }
      authThrottleSuccess(email);
      const sess = createSession(db, user);
      saveDb(db);
      return sendJson(res, 200, { user: publicUser(user), token: sess.token, expiresAt: sess.expiresAt }, authSuccessHeaders(sess.token, req));
    }

    if (parts[0] === 'auth' && parts[1] === 'logout' && method === 'POST') {
      const token = sessionTokenFrom(req);
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

    /* Forgot password — no outbound email on this local stack.
       For existing accounts we return a one-time recovery code (shown once).
       For unknown emails we return the same generic OK (no account enumeration). */
    if (parts[0] === 'auth' && parts[1] === 'forgot-password' && method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const blocked = authThrottleCheck(req, email);
      if (blocked != null) return sendAuthLimited(res, blocked);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return sendJson(res, 400, { error: 'Enter a valid email address.' });
      }
      const user = (db.users || []).find((u) => u.email.toLowerCase() === email);
      const generic = {
        ok: true,
        message: 'If an account exists for that email, a recovery code is available. Enter it below with your new password. Codes expire in 30 minutes and can be used once.'
      };
      if (!user) {
        /* Spend a little work so timing is closer to the real path. */
        hashPassword('timing-pad-' + email);
        authThrottleFail(req, email);
        return sendJson(res, 200, generic);
      }
      const rawCode = issuePasswordReset(db, user);
      saveDb(db);
      authThrottleSuccess(email);
      return sendJson(res, 200, Object.assign({}, generic, {
        recoveryCode: rawCode,
        delivery: 'local_display',
        note: 'Email delivery is not configured on this server yet. Copy this recovery code now — it will not be shown again.'
      }));
    }

    if (parts[0] === 'auth' && parts[1] === 'reset-password' && method === 'POST') {
      const body = await readBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const code = String(body.code || '').trim().toLowerCase();
      const password = String(body.password || '');
      const blocked = authThrottleCheck(req, email);
      if (blocked != null) return sendAuthLimited(res, blocked);
      const policy = passwordPolicyError(password);
      if (policy) {
        authThrottleFail(req, email);
        return sendJson(res, 400, { error: policy });
      }
      if (!email || !code) {
        authThrottleFail(req, email);
        return sendJson(res, 400, { error: 'Email and recovery code are required.' });
      }
      const user = (db.users || []).find((u) => u.email.toLowerCase() === email);
      const codeHash = hashToken(code);
      const reset = user
        ? (db.password_resets || []).find((r) =>
          r.user_id === user.id &&
          !r.used_at &&
          r.code_hash === codeHash &&
          Date.parse(r.expires_at) > Date.now()
        )
        : null;
      if (!user || !reset) {
        authThrottleFail(req, email);
        return sendJson(res, 400, { error: 'Invalid or expired recovery code. Request a new one.' });
      }
      reset.used_at = nowISO();
      user.password_hash = hashPassword(password);
      user.updated_at = nowISO();
      revokeUserSessions(db, user.id, null);
      authThrottleSuccess(email);
      const sess = createSession(db, user);
      saveDb(db);
      return sendJson(res, 200, {
        user: publicUser(user),
        token: sess.token,
        expiresAt: sess.expiresAt,
        message: 'Password updated. You are signed in. Other sessions were signed out.'
      }, authSuccessHeaders(sess.token, req));
    }

    if (parts[0] === 'auth' && parts[1] === 'change-password' && method === 'POST') {
      const sessionUser = requireUser(req, db);
      if (!sessionUser) return sendJson(res, 401, { error: 'Sign in required' });
      const body = await readBody(req);
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      const user = (db.users || []).find((u) => u.id === sessionUser.id);
      if (!user) return sendJson(res, 401, { error: 'Sign in required' });
      if (!verifyPassword(currentPassword, user.password_hash)) {
        return sendJson(res, 400, { error: 'Current password is incorrect.' });
      }
      const policy = passwordPolicyError(newPassword);
      if (policy) return sendJson(res, 400, { error: policy });
      if (verifyPassword(newPassword, user.password_hash)) {
        return sendJson(res, 400, { error: 'New password must be different from the current password.' });
      }
      user.password_hash = hashPassword(newPassword);
      user.updated_at = nowISO();
      const keep = sessionTokenFrom(req);
      revokeUserSessions(db, user.id, keep);
      saveDb(db);
      return sendJson(res, 200, {
        ok: true,
        message: 'Password changed. Other signed-in sessions were signed out.'
      });
    }

    if (parts[0] === 'auth' && parts[1] === 'profile' && method === 'POST') {
      const sessionUser = requireUser(req, db);
      if (!sessionUser) return sendJson(res, 401, { error: 'Sign in required' });
      const body = await readBody(req);
      const user = (db.users || []).find((u) => u.id === sessionUser.id);
      if (!user) return sendJson(res, 401, { error: 'Sign in required' });
      if (body.name != null) {
        const name = String(body.name || '').trim();
        if (!name) return sendJson(res, 400, { error: 'Name cannot be empty.' });
        user.name = name.slice(0, 120);
      }
      /* Role is set at Create account (or Team). Profile only updates name. */
      user.updated_at = nowISO();
      saveDb(db);
      return sendJson(res, 200, { user: publicUser(user) });
    }

    if (parts[0] === 'health' && method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        phase: 'E',
        storage: 'local-json',
        time: nowISO(),
        sending: {
          manualChannels: Object.keys(SEND_CHANNELS),
          providerDelivery: false,
          note: 'Manual WhatsApp/email record share_clicked only. Delivered requires a future provider webhook.'
        },
        features: {
          notifications: true,
          tasks: true,
          reports: true,
          roles: ['owner', 'sales', 'viewer']
        }
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
        const ev = recordEvent(db, {
          token_id: tok.id,
          version_id: version.id,
          proposal_id: tok.proposal_id,
          owner_id: tok.owner_id,
          event_type: 'suspected_prefetch',
          meta: { ua }
        });
        notifyFromPortalEvent(db, ev);
      } else {
        if (!tok.first_opened_at) tok.first_opened_at = nowISO();
        tok.last_opened_at = nowISO();
        tok.open_count = (tok.open_count || 0) + 1;
        const ev = recordEvent(db, {
          token_id: tok.id,
          version_id: version.id,
          proposal_id: tok.proposal_id,
          owner_id: tok.owner_id,
          event_type: 'link_opened',
          meta: { ua, openCount: tok.open_count }
        });
        notifyFromPortalEvent(db, ev);
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
      const ev = recordEvent(db, {
        token_id: tok.id,
        version_id: tok.version_id,
        proposal_id: tok.proposal_id,
        owner_id: tok.owner_id,
        event_type: type,
        meta: body.meta && typeof body.meta === 'object' ? body.meta : {}
      });
      notifyFromPortalEvent(db, ev);
      saveDb(db);
      return sendJson(res, 201, { ok: true });
    }

    /* Everything below needs a staff session */
    const user = requireUser(req, db);
    if (!user) return sendJson(res, 401, { error: 'Sign in required' });

    const canWrite = requireRole(user, 'sales'); /* owner + sales */
    const canAdmin = requireRole(user, 'owner');

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
      const unread = (db.notifications || []).filter((n) => n.owner_id === user.id && !n.read_at).length;
      const openTasks = (db.tasks || []).filter((t) => t.owner_id === user.id && t.status === 'open');
      const overdueTasks = openTasks.filter((t) => t.due_at && Date.parse(t.due_at) < Date.now()).length;
      return sendJson(res, 200, {
        counts: {
          total: mine.length,
          draft: byStatus.draft || 0,
          ready: (byStatus.ready || 0) + (byStatus.internal_review || 0),
          accepted: byStatus.accepted || 0,
          sent: (byStatus.sent || 0) + (byStatus.viewed || 0),
          won: byStatus.accepted || 0,
          lost: byStatus.rejected || 0,
          byStatus,
          unreadNotifications: unread,
          openTasks: openTasks.length,
          overdueTasks
        },
        recent,
        role: user.role
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
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view data but cannot create or edit proposals.' });
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
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view data but cannot edit proposals.' });
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
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view data but cannot delete proposals.' });
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
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view data but cannot duplicate proposals.' });
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
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view data but cannot publish proposals.' });
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
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view data but cannot create customer links.' });
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
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view data but cannot revoke links.' });
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

    /* ---------- Phase C: send centre (manual channels; honest states) ---------- */
    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'send-preview' && method === 'GET') {
      const row = (db.proposals || []).find((p) => p.id === parts[1] && p.owner_id === user.id);
      if (!row) return sendJson(res, 404, { error: 'Proposal not found' });
      let form = {};
      try { form = JSON.parse(row.form_json || '{}'); } catch (_) {}
      const latestVersion = (db.versions || [])
        .filter((v) => v.proposal_id === row.id && v.owner_id === user.id)
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
      const activeLink = (db.tokens || [])
        .filter((t) => t.proposal_id === row.id && t.owner_id === user.id && tokenIsActive(t))
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] || null;
      return sendJson(res, 200, {
        proposal: proposalSummary(row),
        hasPublishedVersion: !!latestVersion,
        latestVersion: latestVersion ? publicVersion(latestVersion) : null,
        hasActiveLink: !!activeLink,
        /* Raw token is never re-listed; staff must publish/create link to obtain URL. */
        needsNewLinkForUrl: true,
        defaultRecipientName: row.customer_name || form.custName || '',
        defaultWhatsApp: form.custPhone || form.customerPhone || '',
        defaultEmail: form.custEmail || form.customerEmail || '',
        companyWhatsApp: form.companyPhone || '',
        channels: Object.keys(SEND_CHANNELS).map((id) => ({
          id,
          label: SEND_CHANNELS[id].label,
          provider: SEND_CHANNELS[id].provider,
          recordsAs: 'share_clicked',
          deliveryVerified: false
        })),
        honestyNote: 'Opening WhatsApp or your mail app only records that you started sharing. It does not prove the message was sent or delivered.'
      });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'sends' && method === 'GET') {
      const row = (db.proposals || []).find((p) => p.id === parts[1] && p.owner_id === user.id);
      if (!row) return sendJson(res, 404, { error: 'Proposal not found' });
      const list = (db.sends || [])
        .filter((s) => s.proposal_id === row.id && s.owner_id === user.id)
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .map(publicSend);
      return sendJson(res, 200, { sends: list });
    }

    if (parts[0] === 'sends' && parts.length === 1 && method === 'GET') {
      const list = (db.sends || [])
        .filter((s) => s.owner_id === user.id)
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 100)
        .map(publicSend);
      return sendJson(res, 200, { sends: list });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'sends' && method === 'POST') {
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view data but cannot prepare sends.' });
      const row = (db.proposals || []).find((p) => p.id === parts[1] && p.owner_id === user.id);
      if (!row) return sendJson(res, 404, { error: 'Proposal not found' });
      const body = await readBody(req);
      const channel = String(body.channel || 'whatsapp_manual');
      if (!SEND_CHANNELS[channel]) {
        return sendJson(res, 400, { error: 'Unsupported send channel' });
      }

      /* Ensure a published version + fresh customer link so the message has a real portal URL. */
      let version = null;
      if (body.versionId) {
        version = (db.versions || []).find(
          (v) => v.id === body.versionId && v.proposal_id === row.id && v.owner_id === user.id
        );
      }
      if (!version) {
        version = (db.versions || [])
          .filter((v) => v.proposal_id === row.id && v.owner_id === user.id)
          .slice()
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      }
      if (!version || body.publishFirst) {
        const snapshot = customerSnapshotFromProposal(row);
        const snapshotJson = JSON.stringify(snapshot);
        version = {
          id: uid('ver'),
          proposal_id: row.id,
          owner_id: user.id,
          version_label: snapshot.versionLabel || row.version_label || '1.0',
          snapshot_json: snapshotJson,
          snapshot_sha256: sha256Hex(snapshotJson),
          pdf_sha256: null,
          pdf_path: null,
          note: String(body.note || 'Published for customer send').slice(0, 500),
          created_at: nowISO()
        };
        db.versions.push(version);
        recordEvent(db, {
          token_id: null,
          version_id: version.id,
          proposal_id: row.id,
          owner_id: user.id,
          event_type: 'version_published',
          meta: { snapshotSha256: version.snapshot_sha256, via: 'send' }
        });
      }

      const rawToken = newAccessTokenRaw();
      const tokenRow = {
        id: uid('tok'),
        token_hash: hashToken(rawToken),
        version_id: version.id,
        proposal_id: row.id,
        owner_id: user.id,
        label: String(body.linkLabel || 'Send link').slice(0, 120),
        expires_at: parseExpiryDays(body),
        revoked_at: null,
        created_at: nowISO(),
        first_opened_at: null,
        last_opened_at: null,
        open_count: 0
      };
      db.tokens.push(tokenRow);

      const host = req.headers.host || ('localhost:' + PORT);
      const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim() || 'http';
      const portalUrl = proto + '://' + host + '/portal.html?t=' + encodeURIComponent(rawToken);
      const messageBody = String(body.messageBody || buildDefaultMessage(row, portalUrl)).slice(0, 4000);
      const recipientTo = String(body.recipientTo || '').trim().slice(0, 200);
      const recipientName = String(body.recipientName || row.customer_name || '').trim().slice(0, 200);

      if (channel === 'whatsapp_manual' && recipientTo && !digitsForWhatsApp(recipientTo)) {
        return sendJson(res, 400, {
          error: 'Enter a valid WhatsApp mobile number with country code (for example +91 98765 43210).'
        });
      }
      if (channel === 'email_manual' && recipientTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientTo)) {
        return sendJson(res, 400, { error: 'Enter a valid email address.' });
      }

      const markShared = body.markShareClicked !== false;
      const sendRow = {
        id: uid('snd'),
        proposal_id: row.id,
        version_id: version.id,
        token_id: tokenRow.id,
        owner_id: user.id,
        channel,
        state: markShared ? 'share_clicked' : 'draft',
        recipient_name: recipientName,
        recipient_to: recipientTo,
        message_body: messageBody,
        portal_url: portalUrl,
        provider: 'manual',
        provider_message_id: null,
        note: String(body.note || '').slice(0, 500),
        created_at: nowISO(),
        updated_at: nowISO(),
        share_clicked_at: markShared ? nowISO() : null,
        submitted_at: null,
        delivered_at: null
      };
      db.sends.push(sendRow);

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
        event_type: markShared ? 'share_clicked' : 'send_drafted',
        meta: { channel, sendId: sendRow.id }
      });
      saveDb(db);

      const waDigits = channel === 'whatsapp_manual' ? digitsForWhatsApp(recipientTo) : '';
      const launch = {
        whatsappUrl: waDigits
          ? ('https://wa.me/' + waDigits + '?text=' + encodeURIComponent(messageBody))
          : null,
        mailtoUrl: channel === 'email_manual' && recipientTo
          ? ('mailto:' + encodeURIComponent(recipientTo) +
            '?subject=' + encodeURIComponent(
              (row.ref ? row.ref + ' — ' : '') + 'Your solar proposal'
            ) +
            '&body=' + encodeURIComponent(messageBody))
          : null,
        copyText: messageBody,
        portalUrl,
        /* Explicit: these launches are not provider delivery receipts */
        honesty: 'Launching WhatsApp or mail only means the share flow was opened. Delivery is unconfirmed until a provider reports it.'
      };

      return sendJson(res, 201, {
        send: publicSend(sendRow),
        access: publicToken(tokenRow, rawToken),
        version: publicVersion(version),
        launch
      });
    }

    if (parts[0] === 'sends' && parts[1] && parts[2] === 'state' && method === 'POST') {
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view data but cannot update sends.' });
      const sendRow = (db.sends || []).find((s) => s.id === parts[1] && s.owner_id === user.id);
      if (!sendRow) return sendJson(res, 404, { error: 'Send record not found' });
      const body = await readBody(req);
      const next = String(body.state || '');
      const allowedManual = {
        share_clicked: true,
        cancelled: true,
        failed: true,
        draft: true
      };
      /* Manual channels must never jump to delivered / submitted_to_provider. */
      if (sendRow.provider === 'manual') {
        if (next === 'delivered' || next === 'submitted_to_provider') {
          return sendJson(res, 400, {
            error: 'Manual channels cannot be marked delivered. That state is reserved for provider-confirmed webhooks (not enabled yet).',
            code: 'DELIVERY_NOT_AVAILABLE'
          });
        }
        if (!allowedManual[next]) {
          return sendJson(res, 400, { error: 'Unsupported state for this send' });
        }
      } else if (!SEND_STATES[next]) {
        return sendJson(res, 400, { error: 'Unknown state' });
      }
      sendRow.state = next;
      sendRow.updated_at = nowISO();
      if (next === 'share_clicked' && !sendRow.share_clicked_at) sendRow.share_clicked_at = nowISO();
      if (next === 'submitted_to_provider' && !sendRow.submitted_at) sendRow.submitted_at = nowISO();
      if (next === 'delivered' && !sendRow.delivered_at) sendRow.delivered_at = nowISO();
      if (body.note) sendRow.note = String(body.note).slice(0, 500);
      recordEvent(db, {
        token_id: sendRow.token_id,
        version_id: sendRow.version_id,
        proposal_id: sendRow.proposal_id,
        owner_id: user.id,
        event_type: 'send_state_' + next,
        meta: { sendId: sendRow.id, channel: sendRow.channel }
      });
      saveDb(db);
      return sendJson(res, 200, { send: publicSend(sendRow) });
    }

    /* ---------- Phase D: notifications + activity + follow-up tasks ---------- */
    if (parts[0] === 'notifications' && parts.length === 1 && method === 'GET') {
      const unreadOnly = url.searchParams.get('unread') === '1';
      let list = (db.notifications || []).filter((n) => n.owner_id === user.id);
      if (unreadOnly) list = list.filter((n) => !n.read_at);
      list = list.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 100);
      const unread = (db.notifications || []).filter((n) => n.owner_id === user.id && !n.read_at).length;
      return sendJson(res, 200, {
        notifications: list.map(publicNotification),
        unread
      });
    }

    if (parts[0] === 'notifications' && parts[1] === 'read-all' && method === 'POST') {
      const now = nowISO();
      (db.notifications || []).forEach((n) => {
        if (n.owner_id === user.id && !n.read_at) n.read_at = now;
      });
      saveDb(db);
      return sendJson(res, 200, { ok: true });
    }

    if (parts[0] === 'notifications' && parts[1] && parts[2] === 'read' && method === 'POST') {
      const n = (db.notifications || []).find((x) => x.id === parts[1] && x.owner_id === user.id);
      if (!n) return sendJson(res, 404, { error: 'Notification not found' });
      if (!n.read_at) n.read_at = nowISO();
      saveDb(db);
      return sendJson(res, 200, { notification: publicNotification(n) });
    }

    if (parts[0] === 'activity' && parts.length === 1 && method === 'GET') {
      const list = (db.events || [])
        .filter((e) => e.owner_id === user.id)
        .slice()
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 150)
        .map((e) => {
          const prop = (db.proposals || []).find((p) => p.id === e.proposal_id);
          return {
            id: e.id,
            type: e.event_type,
            proposalId: e.proposal_id || null,
            proposalTitle: prop ? (prop.title || prop.customer_name || prop.ref || '') : '',
            versionId: e.version_id || null,
            tokenId: e.token_id || null,
            createdAt: e.created_at,
            meta: (() => { try { return JSON.parse(e.meta_json || '{}'); } catch (_) { return {}; } })()
          };
        });
      return sendJson(res, 200, { activity: list });
    }

    if (parts[0] === 'tasks' && parts.length === 1 && method === 'GET') {
      const status = url.searchParams.get('status') || '';
      let list = (db.tasks || []).filter((t) => t.owner_id === user.id);
      if (status) list = list.filter((t) => t.status === status);
      list = list.slice().sort((a, b) => {
        const ad = a.due_at || '9999';
        const bd = b.due_at || '9999';
        if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
        return String(ad).localeCompare(String(bd));
      });
      return sendJson(res, 200, { tasks: list.map(publicTask) });
    }

    if (parts[0] === 'tasks' && parts.length === 1 && method === 'POST') {
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view tasks but cannot create them.' });
      const body = await readBody(req);
      const title = String(body.title || '').trim();
      if (!title) return sendJson(res, 400, { error: 'Task title is required' });
      let dueAt = null;
      if (body.dueAt) {
        const t = Date.parse(body.dueAt);
        if (!Number.isFinite(t)) return sendJson(res, 400, { error: 'Invalid due date' });
        dueAt = new Date(t).toISOString();
      } else if (body.dueInDays != null) {
        const d = Number(body.dueInDays);
        if (!Number.isFinite(d) || d < 0) return sendJson(res, 400, { error: 'Invalid dueInDays' });
        dueAt = new Date(Date.now() + d * 864e5).toISOString();
      }
      if (body.proposalId) {
        const p = (db.proposals || []).find((x) => x.id === body.proposalId && x.owner_id === user.id);
        if (!p) return sendJson(res, 404, { error: 'Proposal not found for this task' });
      }
      const task = {
        id: uid('tsk'),
        owner_id: user.id,
        proposal_id: body.proposalId || null,
        title: title.slice(0, 200),
        notes: String(body.notes || '').slice(0, 2000),
        due_at: dueAt,
        status: 'open',
        created_at: nowISO(),
        updated_at: nowISO(),
        completed_at: null
      };
      db.tasks.push(task);
      saveDb(db);
      return sendJson(res, 201, { task: publicTask(task) });
    }

    if (parts[0] === 'tasks' && parts[1] && parts.length === 2 && method === 'PUT') {
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view tasks but cannot update them.' });
      const task = (db.tasks || []).find((t) => t.id === parts[1] && t.owner_id === user.id);
      if (!task) return sendJson(res, 404, { error: 'Task not found' });
      const body = await readBody(req);
      if (body.title != null) {
        const title = String(body.title).trim();
        if (!title) return sendJson(res, 400, { error: 'Task title cannot be empty' });
        task.title = title.slice(0, 200);
      }
      if (body.notes != null) task.notes = String(body.notes).slice(0, 2000);
      if (body.dueAt !== undefined) {
        if (body.dueAt === null || body.dueAt === '') task.due_at = null;
        else {
          const t = Date.parse(body.dueAt);
          if (!Number.isFinite(t)) return sendJson(res, 400, { error: 'Invalid due date' });
          task.due_at = new Date(t).toISOString();
        }
      }
      if (body.status) {
        if (!['open', 'done', 'cancelled'].includes(body.status)) {
          return sendJson(res, 400, { error: 'Invalid task status' });
        }
        task.status = body.status;
        if (body.status === 'done') task.completed_at = nowISO();
        if (body.status === 'open') task.completed_at = null;
      }
      task.updated_at = nowISO();
      saveDb(db);
      return sendJson(res, 200, { task: publicTask(task) });
    }

    if (parts[0] === 'tasks' && parts[1] && parts.length === 2 && method === 'DELETE') {
      if (!canWrite) return sendJson(res, 403, { error: 'Your role can view tasks but cannot delete them.' });
      const before = (db.tasks || []).length;
      db.tasks = (db.tasks || []).filter((t) => !(t.id === parts[1] && t.owner_id === user.id));
      if (db.tasks.length === before) return sendJson(res, 404, { error: 'Task not found' });
      saveDb(db);
      return sendJson(res, 200, { ok: true });
    }

    /* ---------- Phase E: reports + team roles ---------- */
    if (parts[0] === 'reports' && parts[1] === 'summary' && method === 'GET') {
      const mine = (db.proposals || []).filter((p) => p.owner_id === user.id);
      const byStatus = {};
      let quotedKnown = 0;
      let quotedSum = 0;
      let quotedMissing = 0;
      mine.forEach((p) => {
        const s = p.status || 'draft';
        byStatus[s] = (byStatus[s] || 0) + 1;
        const v = proposalQuotedValue(p);
        if (v != null) { quotedKnown += 1; quotedSum += v; }
        else quotedMissing += 1;
      });
      const mySends = (db.sends || []).filter((s) => s.owner_id === user.id);
      const myEvents = (db.events || []).filter((e) => e.owner_id === user.id);
      const opens = myEvents.filter((e) => e.event_type === 'link_opened').length;
      const prefetches = myEvents.filter((e) => e.event_type === 'suspected_prefetch').length;
      const surveys = myEvents.filter((e) => e.event_type === 'survey_requested').length;
      const pdfs = myEvents.filter((e) => e.event_type === 'pdf_download_requested').length;
      const shareClicks = mySends.filter((s) => s.state === 'share_clicked' || s.share_clicked_at).length;
      const published = (db.versions || []).filter((v) => v.owner_id === user.id).length;
      const activeLinks = (db.tokens || []).filter((t) => t.owner_id === user.id && tokenIsActive(t)).length;
      const openTasks = (db.tasks || []).filter((t) => t.owner_id === user.id && t.status === 'open');
      const overdueTasks = openTasks.filter((t) => t.due_at && Date.parse(t.due_at) < Date.now()).length;

      /* Pipeline by salesperson is single-owner local accounts for now; multi-user
         shared org reporting arrives with company multi-tenant auth. */
      return sendJson(res, 200, {
        generatedAt: nowISO(),
        role: user.role,
        proposals: {
          total: mine.length,
          byStatus,
          accepted: byStatus.accepted || 0,
          rejected: byStatus.rejected || 0,
          sentOrOut: (byStatus.sent || 0) + (byStatus.viewed || 0) + (byStatus.negotiation || 0)
        },
        value: {
          currency: 'INR',
          quotedSum,
          proposalsWithValue: quotedKnown,
          proposalsMissingValue: quotedMissing,
          note: 'Quoted value uses explicit investment fields when present, otherwise capacity × rate when both exist. Missing values are counted separately — never invented.'
        },
        engagement: {
          versionsPublished: published,
          activeCustomerLinks: activeLinks,
          shareClicksRecorded: shareClicks,
          linkOpens: opens,
          suspectedPrefetches: prefetches,
          pdfDownloadRequests: pdfs,
          surveyRequests: surveys,
          note: 'Opens and survey requests come from the customer portal. Share clicks are manual send starts, not provider delivery.'
        },
        followUps: {
          openTasks: openTasks.length,
          overdueTasks
        },
        honesty: [
          'No provider-confirmed email/WhatsApp delivery counts are included.',
          'Prefetch / link-unfurl bots are listed separately from human opens.',
          'Accepted / rejected statuses are staff-marked unless a future verified workflow is added.'
        ]
      });
    }

    if (parts[0] === 'team' && parts[1] === 'members' && method === 'GET') {
      if (!canAdmin) {
        return sendJson(res, 403, { error: 'Only the workspace owner can view team members.' });
      }
      /* Local single-tenant: list accounts on this server. Company org scoping comes later. */
      const members = (db.users || []).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        roleCustom: u.role_custom || null,
        roleLabel: roleDisplay(u),
        createdAt: u.created_at
      }));
      return sendJson(res, 200, {
        members,
        roles: [
          { id: 'owner', label: 'Owner', canWrite: true, canManageTeam: true },
          { id: 'sales', label: 'Sales', canWrite: true, canManageTeam: false },
          { id: 'viewer', label: 'Viewer', canWrite: false, canManageTeam: false }
        ]
      });
    }

    if (parts[0] === 'team' && parts[1] === 'role' && method === 'POST') {
      if (!canAdmin) {
        return sendJson(res, 403, { error: 'Only the workspace owner can change roles.' });
      }
      const body = await readBody(req);
      const targetId = String(body.userId || '');
      const role = String(body.role || '');
      if (!['owner', 'sales', 'viewer'].includes(role)) {
        return sendJson(res, 400, { error: 'Role must be owner, sales, or viewer' });
      }
      const target = (db.users || []).find((u) => u.id === targetId);
      if (!target) return sendJson(res, 404, { error: 'User not found' });
      if (target.id === user.id && role !== 'owner') {
        const otherOwners = (db.users || []).filter((u) => u.id !== user.id && u.role === 'owner');
        if (!otherOwners.length) {
          return sendJson(res, 400, {
            error: 'Promote another owner before changing your own role away from owner.'
          });
        }
      }
      target.role = role;
      target.role_custom = null;
      target.updated_at = nowISO();
      saveDb(db);
      return sendJson(res, 200, {
        member: {
          id: target.id,
          name: target.name,
          email: target.email,
          role: target.role,
          roleCustom: null,
          roleLabel: roleDisplay(target)
        }
      });
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
      ? 'no-store, no-cache, must-revalidate' : 'public, max-age=86400';
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-QS-Session',
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
  console.log('Quotation Studio platform (Phase A + B + C)');
  console.log('  App:    http://' + HOST + ':' + PORT + '/quotation.html');
  console.log('  Dash:   http://' + HOST + ':' + PORT + '/dashboard.html');
  console.log('  Portal: http://' + HOST + ':' + PORT + '/portal.html?t=<token>');
  console.log('  API:    http://' + HOST + ':' + PORT + '/api/health');
  console.log('  Data:   ' + DB_PATH);
});
