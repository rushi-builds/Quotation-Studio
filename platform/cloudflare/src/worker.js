/* ============================================================================
   Quotation Studio — Cloudflare Worker (D1)
   NEW project: quotation-studio  —  do NOT use solar-epc-relay
   --------------------------------------------------------------------------
   Same /api/* contract as platform/local-server/server.js so dashboard.html
   and platform-api.js work unchanged on Pages/Workers assets.
   ============================================================================ */
'use strict';

import { reserveCloudReference } from '../../reference-numbers.mjs';
import { handleOAuth } from './oauth.mjs';
import { handlePhoneAuth } from './phone.mjs';
import { d1OAuthStore } from '../../oauth-store.mjs';

import { handleAssistant, boundedJson, quotaWindows } from '../../gemini.mjs';

import { scryptSync, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

const SESSION_DAYS = 30;
const COOKIE = 'qs_session';
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/* Deployed code marker. /api/health reports it so an operator can prove the
   running Worker is the current API build instead of inferring it from
   behaviour. Bump on every behaviour change. */
const CODE_VERSION = 'studio-flows-r1';

const SEND_CHANNELS = {
  whatsapp_manual: { label: 'WhatsApp (manual)', provider: 'manual' },
  email_manual: { label: 'Email (manual)', provider: 'manual' },
  copy_link: { label: 'Copy link only', provider: 'manual' },
  other: { label: 'Other / offline', provider: 'manual' }
};
const SEND_STATES = {
  draft: 'Draft (not shared)',
  share_clicked: 'Share action started (not delivery-confirmed)',
  submitted_to_provider: 'Submitted to provider',
  delivered: 'Delivered (provider-confirmed only)',
  failed: 'Failed',
  cancelled: 'Cancelled'
};

const NOTIFY_KINDS = {
  link_opened: { kind: 'open', title: 'Customer opened proposal' },
  survey_requested: { kind: 'survey', title: 'Survey requested' },
  pdf_download_requested: { kind: 'pdf', title: 'PDF download requested' }
};

/* ---------- tiny helpers ---------- */
function nowISO() { return new Date().toISOString(); }
function uid(prefix) {
  return (prefix || 'id') + '_' + randomBytes(8).toString('hex');
}
function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}
function hashToken(raw) { return sha256Hex(String(raw).toLowerCase()); }
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      ...headers
    }
  });
}
function text(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}
const MAX_JSON_BYTES = 8 * 1024 * 1024; /* same bound as the local server */
async function readBody(request) {
  const declared = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
    const e = new Error('Body too large');
    e.status = 413;
    throw e;
  }
  const t = await request.text();
  if (t.length > MAX_JSON_BYTES) {
    const e = new Error('Body too large');
    e.status = 413;
    throw e;
  }
  if (!t) return {};
  try { return JSON.parse(t); }
  catch (_) {
    const e = new Error('Invalid JSON');
    e.status = 400;
    throw e;
  }
}

/* CSRF: session cookies are SameSite=None so preview iframes keep working,
   which means browsers will send them on cross-site requests too. A state-
   changing /api call that carries a foreign Origin/Referer is a forged
   cross-site request and must be rejected. Absent or unparseable values come
   from non-browser clients (curl, scripts, tests) and are allowed through;
   real browsers always send a valid Origin on cross-site POST/PUT/DELETE.
   OAuth callbacks are exempt: Apple POSTs from appleid.apple.com and that
   flow has its own state/binding verification. */
function allowedAppHost(env) {
  try { return new URL(env && env.APP_URL).host.toLowerCase(); }
  catch (_) { return ''; }
}
function crossSiteBlocked(request, url, env) {
  const claimed = String(
    request.headers.get('Origin') || request.headers.get('Referer') || ''
  ).trim();
  if (!claimed) return false;
  try {
    const host = new URL(claimed).host.toLowerCase();
    return host !== url.host.toLowerCase() && host !== allowedAppHost(env);
  } catch (_) {
    return false;
  }
}

/* Customer portal event metadata is untrusted bearer-token input. Strict
   allowlist + per-field caps so a shared link cannot bloat the database or
   smuggle payloads into notification emails. Keys mirror what portal.js
   actually sends (format/stage/wants/loc) plus note/section fields. */
function sanitizePortalMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  const out = {};
  if (typeof meta.note === 'string' && meta.note) {
    out.note = meta.note.slice(0, 500);
  }
  for (const key of ['sectionId', 'choice', 'label', 'format', 'stage', 'wants', 'loc']) {
    if (typeof meta[key] === 'string' && meta[key]) {
      out[key] = meta[key].slice(0, 120);
    }
  }
  for (const key of ['index', 'progress', 'sectionIndex']) {
    if (typeof meta[key] === 'number' && Number.isFinite(meta[key])) {
      out[key] = meta[key];
    }
  }
  return out;
}

const PROPOSAL_STATUSES = new Set([
  'draft', 'internal_review', 'ready', 'sent', 'viewed',
  'negotiation', 'accepted', 'rejected', 'expired', 'archived'
]);
function proposalStatusError(status) {
  if (status == null || status === '') return null;
  return PROPOSAL_STATUSES.has(status) ? null : 'Unknown proposal status';
}
function parseCookies(request) {
  const out = {};
  const raw = request.headers.get('Cookie') || '';
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try { out[k] = decodeURIComponent(v); }
      catch (_) { out[k] = v; }
    }
  });
  return out;
}
function sessionTokenFrom(request) {
  const auth = String(request.headers.get('Authorization') || '');
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && m[1]) return m[1].trim();
  const hdr = String(request.headers.get('X-QS-Session') || '').trim();
  if (hdr) return hdr;
  const cookies = parseCookies(request);
  return cookies[COOKIE] || cookies.qs_client || null;
}
function sessionCookie(token, maxAgeSec, request) {
  const url = new URL(request.url);
  const isHttps = url.protocol === 'https:';
  const parts = [
    COOKIE + '=' + encodeURIComponent(token || ''),
    'Path=/',
    'HttpOnly',
    'SameSite=' + (isHttps ? 'None' : 'Lax'),
    'Max-Age=' + String(maxAgeSec)
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}
function authHeaders(token, request) {
  return { 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400, request) };
}

function hashPassword(password, salt) {
  const s = salt || randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), s, 32, SCRYPT).toString('hex');
  return 'scrypt$' + s + '$' + hash;
}
function verifyPassword(password, stored) {
  const raw = String(stored || '');
  let salt, hash;
  if (raw.startsWith('scrypt$')) {
    const parts = raw.split('$');
    salt = parts[1]; hash = parts[2];
  } else {
    const parts = raw.split(':');
    salt = parts[0]; hash = parts[1];
  }
  if (!salt || !hash) return false;
  let next;
  try {
    next = scryptSync(String(password), salt, 32, SCRYPT).toString('hex');
  } catch (_) {
    try { next = scryptSync(String(password), salt, 32).toString('hex'); }
    catch (e2) { return false; }
  }
  try {
    return timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(next, 'hex'));
  } catch (_) {
    return false;
  }
}
function passwordPolicyError(password) {
  const p = String(password || '');
  if (p.length < 8) return 'Password must be at least 8 characters.';
  if (p.length > 128) return 'Password must be at most 128 characters.';
  if (/\s/.test(p)) return 'Password cannot contain spaces.';
  return null;
}

function parseSignupRole(raw) {
  const typed = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!typed) return { error: 'Enter your role (for example Owner, Sales, Viewer, or Project lead).' };
  if (typed.length > 60) return { error: 'Role must be at most 60 characters.' };
  const key = typed.toLowerCase();
  if (key === 'owner') return { role: 'owner', roleCustom: null, roleLabel: 'Owner' };
  if (key === 'sales') return { role: 'sales', roleCustom: null, roleLabel: 'Sales' };
  if (key === 'viewer') return { role: 'viewer', roleCustom: null, roleLabel: 'Viewer' };
  return { role: 'custom', roleCustom: typed, roleLabel: typed };
}
/* Role configuration diagnostics — the same fail-open-but-reported shape as
   phoneIssues() in src/phone.mjs, with one difference: nothing here disables a
   feature. A missing variable is a legitimate state (the workspace simply runs
   without a designated owner or admin), so only a MALFORMED value or a
   conflicting pair is worth reporting.

   Why it exists: a typo in ADMIN_EMAIL does not error anywhere — it silently
   grants nobody. That is a deploy-time
   mistake an operator cannot see from the UI, so /api/health says so.

   Never returns an email address or a count of admins: this route is public. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function rolesIssues(env) {
  const issues = [];
  const o = ownerEmail(env), a = adminEmail(env);
  if (o && !EMAIL_SHAPE.test(o)) issues.push('OWNER_EMAIL is set but is not a valid email address, so the workspace owner bootstrap cannot match any account');
  if (a && !EMAIL_SHAPE.test(a)) issues.push('ADMIN_EMAIL is set but is not a valid email address, so the designated admin login cannot match any account');
  if (a && o && a === o) issues.push('ADMIN_EMAIL and OWNER_EMAIL name the same mailbox, so the ADMIN_EMAIL designation is redundant: the bootstrap already makes that account a visible Owner. Set ADMIN_EMAIL to the personal mailbox and OWNER_EMAIL to the company mailbox.');
  return issues;
}
/* Typed title wins over the power word. Power is decided by permissionRole,
   never by this string, so a title can say anything and grant nothing.
   Elevation is invisible here on purpose: it does not write role or
   role_custom, so a row reads exactly the same before and after. */
/* A typed role title, validated exactly like the one on Create account
   (non-empty, <= 60 chars, whitespace collapsed) but WITHOUT the keyword
   mapping. Deliberate: a title is display text and must never decide access.
   Typing "Owner" therefore stores a custom title with sales-level power; only
   choosing the Owner power key grants owner. The power badge is the truth. */
function parseRoleTitle(raw) {
  const typed = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!typed) return { error: 'Enter a title (for example Project lead).' };
  if (typed.length > 60) return { error: 'Role must be at most 60 characters.' };
  return { role: 'custom', roleCustom: typed, roleLabel: typed };
}
function roleDisplay(u) {
  if (!u) return '';
  if (u.role_custom) return String(u.role_custom);
  const r = String(u.role || '').toLowerCase();
  if (r === 'owner') return 'Owner';
  if (r === 'sales') return 'Sales';
  if (r === 'viewer') return 'Viewer';
  return u.role || '';
}
function publicUser(u, env) {
  const admin = canManageTeam(u, env);
  const elevated = isAdminRow(u) || isHiddenAdmin(u, env);
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    roleCustom: u.role_custom || null,
    roleLabel: roleDisplay(u),
    /* Capability flags, not titles. The UI gates on these instead of
       re-deriving `role === 'owner'`, so a hidden admin passes every gate
       while still displaying only their typed title. Deliberately absent:
       any "admin" / "hidden" wording — it must not leak into the display. */
    canWrite: roleRank(permissionRole(u, env)) >= roleRank('sales'),
    canManageTeam: admin,
    seesAll: seesAll(u, env),
    /* Elevation capability. Sent to the signed-in user only, so it cannot
       disclose who else is elevated. It is what the front end uses to decide
       whether the word "Admin" may appear in a dropdown at all — the label
       never reaches anyone else, and no name-plate reads it. */
    isAdmin: elevated,
    /* `elevated` is the STORED is_admin flag — the user's own secret toggle
       (typing "admin"). It drives the small red dot beside their own role and
       is distinct from isAdmin, which also covers the ADMIN_EMAIL designation.
       Self-only: publicUser is the /me shape. */
    elevated: isAdminRow(u),
    canElevate: canElevate(u, env),
    createdAt: u.created_at || null
  };
}
/* The badge word for a row, derived from the STORED role only — deliberately
   blind to is_admin. See memberPayload (S1). */
function storedRoleWord(u) {
  const r = String((u && u.role) || '').toLowerCase();
  if (r === 'owner') return 'owner';
  if (r === 'viewer') return 'viewer';
  return 'sales'; /* sales, and every custom title, act as Sales */
}
/* One team-panel row. Shared by GET /api/team/members and the response of
   POST /api/team/role so the two can never drift apart.

   S1 — the badge is the STORED role and never reflects elevation. Members can
   see the team panel, so a badge reading "Admin" would announce the elevation
   to the whole workspace and defeat the purpose of it. `power` comes from
   `role` alone; permissionRole, which does account for elevation, is never used
   to produce a label anywhere in this worker.

   S2 — nothing that discloses elevation is sent about ANOTHER member's row.
   isAdmin and canElevate are absent here entirely, and canWrite/canManageTeam
   are the stored-role values, so a viewer-level elevated account is
   byte-identical to an ordinary viewer in every other member's payload — in
   devtools as well as on screen. Only the actor's own row carries the extra
   fields, via selfMemberPayload(). */
function memberPayload(u, env, lastLogin, opts) {
  const stored = storedRoleWord(u);
  const login = lastLogin || u.created_at || null;
  const o = opts || {};
  return {
    id: u.id,
    name: u.name,
    /* Contact detail is owner / designated-admin only. Every member can see
       the panel, but a member never receives another member's email — the
       field is omitted rather than blanked, so there is nothing to unhide. */
    ...(o.contact ? { email: u.email } : {}),
    role: u.role,
    roleCustom: u.role_custom || null,
    /* Typed title. Elevation leaves it alone, so this string is identical
       before and after an elevation. */
    roleLabel: roleDisplay(u),
    power: stored,
    canWrite: roleRank(stored) >= roleRank('sales'),
    canManageTeam: roleRank(stored) >= roleRank('owner'),
    lastLogin: login,
    lastLoginLabel: login ? new Date(login).toISOString() : null,
    createdAt: u.created_at
  };
}
/* The actor's OWN row: the same payload plus what only they may know about
   themselves. GET /api/auth/me is already self-only, so this discloses nothing
   new. The effective flags are named apart from the stored-role ones: a
   viewer-level elevated account reads canWrite false (badge) and
   effectiveCanWrite true (what it may actually do). */
function selfMemberPayload(u, env, lastLogin, opts) {
  /* Own row: always allowed its own contact detail. */
  return Object.assign(memberPayload(u, env, lastLogin, Object.assign({ contact: true }, opts || {})), {
    isAdmin: isAdminRow(u) || isHiddenAdmin(u, env),
    elevated: isAdminRow(u),
    canElevate: canElevate(u, env),
    effectiveCanWrite: requireRole(u, 'sales', env),
    effectiveCanManageTeam: requireRole(u, 'owner', env)
  });
}
/* ---------- the designated admin (ADMIN_EMAIL) ----------
   Two separate ideas, deliberately kept apart:

     ADMIN_EMAIL  who MAY elevate. Computed per request from env + the account
                  email, never persisted, and enough on its own to clear every
                  gate — so the workspace is never locked out before the
                  migration runs or before anyone has elevated.

     is_admin     who IS elevated. A stored column that outranks owner, and the
                  only elevation state that survives a change of the variable.

   Neither ever produces a label. `roleDisplay` does not read them, and nothing
   in the product writes a title on their account, so nothing says "Admin" to a
   member — the word appears only in a dropdown that canElevate unlocks. */
function normalizeEmail(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}
function adminEmail(env) {
  return normalizeEmail(env && env.ADMIN_EMAIL);
}
function ownerEmail(env) {
  return normalizeEmail(env && env.OWNER_EMAIL);
}
function isHiddenAdmin(user, env) {
  const designated = adminEmail(env);
  if (!designated || !user) return false;
  return normalizeEmail(user.email) === designated;
}
/* P1 — the case where the two designated emails collide. With
   ADMIN_EMAIL == OWNER_EMAIL both variables aim at the SAME row: the bootstrap
   promotes that account to owner (preserving any display title), which makes the
   ADMIN_EMAIL designation redundant rather than harmful — the account is
   already a visible Owner, and it may still elevate itself.

   Nothing oscillates, because the bootstrap is the only automatic role
   transition left in the product. This exists purely so /api/health can report
   what is almost certainly a deploy-time mistake. With two different mailboxes
   this is false. */
function adminOwnerConflict(env) {
  const a = adminEmail(env), o = ownerEmail(env);
  return !!a && a === o;
}
/* Single source of truth for permission. Every gate in this worker calls
   requireRole/canManageTeam, so overriding here overrides everywhere. */
/* Elevation is a stored flag, not an email match. `is_admin` outranks owner,
   and it is the ONLY thing that survives a change of the ADMIN_EMAIL variable:
   the variable decides who may elevate, the column decides who is elevated. */
function isAdminRow(user) {
  return Number((user && user.is_admin) || 0) === 1;
}
/* Single source of truth for permission. Every gate in this worker calls
   requireRole/canManageTeam, so overriding here overrides everywhere.
   'admin' is returned for an elevated row and for the designated ADMIN_EMAIL
   login, so both spellings of "the admin" reach the same rank. */
function permissionRole(user, env) {
  if (isAdminRow(user) || isHiddenAdmin(user, env)) return 'admin';
  const r = String((user && user.role) || '').toLowerCase();
  if (r === 'owner') return 'owner';
  if (r === 'viewer') return 'viewer';
  return 'sales';
}
function roleRank(role) {
  /* Elevated sits ABOVE owner. Because requireRole is a rank comparison, every
     existing gate — canWrite (sales), canAdmin/canManageTeam (owner), seesAll —
     inherits the elevation with no further change. */
  if (role === 'admin') return 4;
  if (role === 'owner') return 3;
  if (role === 'sales') return 2;
  if (role === 'viewer') return 1;
  return 0;
}
function requireRole(user, minRole, env) {
  return roleRank(permissionRole(user, env)) >= roleRank(minRole);
}
function canManageTeam(user, env) {
  return requireRole(user, 'owner', env);
}
/* Who may elevate. Deliberately the ADMIN_EMAIL login ONLY — not "any row with
   is_admin = 1". Elevation is self-service for the designated admin; an
   elevated row cannot create another one. Flagged in docs/workspace-roles.md. */
function canElevate(user, env) {
  return isHiddenAdmin(user, env);
}
/* Owner-sees-all: owner, elevated and the designated admin read every row;
   members stay scoped to their own owner_id exactly as before. */
function seesAll(user, env) {
  return requireRole(user, 'owner', env);
}
/* Owner-sees-all SQL guard. Bound TWICE with the same value (plain `?`, no
   numbered params — D1 binds positionally). When the first bind is NULL the
   owner_id test short-circuits and every row is returned; when it is a user id
   the query behaves exactly like the old `owner_id = ?`. */
const OWN_SCOPE = '(? IS NULL OR owner_id = ?)';
function proposalRevision(row) {
  return Number(row.revision) || 1;
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
  const form = body.form && typeof body.form === 'object' ? body.form : (existing && (() => {
    try { return JSON.parse(existing.form_json || '{}'); } catch (_) { return {}; }
  })()) || {};
  const customer = form.custName || body.customer || (existing && existing.customer_name) || '';
  const capacity = form.capacity != null ? String(form.capacity) : ((existing && existing.capacity) || '');
  const ref = form.propRef || body.ref || (existing && existing.ref) || '';
  const version = form.propVersion || body.version || (existing && existing.version_label) || '1.0';
  const title = body.title ||
    ((customer || 'Untitled customer') + ' — ' + (capacity || '0') + ' kWp');
  return { form, customer, capacity, ref, version, title };
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
  return {
    id: t.id,
    label: t.label || '',
    versionId: t.version_id,
    proposalId: t.proposal_id,
    expiresAt: t.expires_at || null,
    revokedAt: t.revoked_at || null,
    createdAt: t.created_at,
    firstOpenedAt: t.first_opened_at || null,
    lastOpenedAt: t.last_opened_at || null,
    openCount: t.open_count || 0,
    portalPath: rawToken ? '/portal.html?t=' + encodeURIComponent(rawToken) : '/portal.html?t=',
    token: rawToken || undefined,
    active: !t.revoked_at && (!t.expires_at || Date.parse(t.expires_at) > Date.now())
  };
}
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
    canConfirmDelivery: s.provider !== 'manual' && s.state === 'submitted_to_provider',
    deliveryIsVerified: s.state === 'delivered' && !!s.delivered_at && s.provider !== 'manual'
  };
}
function publicNotification(n) {
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    proposalId: n.proposal_id || null,
    readAt: n.read_at || null,
    createdAt: n.created_at
  };
}
function publicTask(t) {
  const overdue = t.status === 'open' && t.due_at && Date.parse(t.due_at) < Date.now();
  return {
    id: t.id,
    title: t.title,
    notes: t.notes || '',
    proposalId: t.proposal_id || null,
    dueAt: t.due_at || null,
    status: t.status,
    overdue: !!overdue,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    completedAt: t.completed_at || null
  };
}
function proposalQuotedValue(row) {
  let form = {};
  try { form = JSON.parse(row.form_json || '{}'); } catch (_) {}
  const explicit = Number(
    form.totalInvestment || form.projectCost || form.quotedValue || form.investment || 0
  );
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const cap = Number(form.capacity || row.capacity || 0);
  const rate = Number(form.ratePerKwp || form.pricePerKwp || form.epcRate || 0);
  if (Number.isFinite(cap) && cap > 0 && Number.isFinite(rate) && rate > 0) return cap * rate;
  return null;
}
function tokenIsActive(t) {
  if (!t || t.revoked_at) return false;
  if (t.expires_at && Date.parse(t.expires_at) <= Date.now()) return false;
  return true;
}
function customerSnapshotFromProposal(row) {
  let form = {}, content = null, projectImages = null, pageImages = null, options = [];
  try { form = JSON.parse(row.form_json || '{}'); } catch (_) {}
  try { content = row.content_json ? JSON.parse(row.content_json) : null; } catch (_) {}
  try { projectImages = row.project_images_json ? JSON.parse(row.project_images_json) : null; } catch (_) {}
  try { pageImages = row.page_images_json ? JSON.parse(row.page_images_json) : null; } catch (_) {}
  try { options = JSON.parse(row.options_json || '[]'); } catch (_) {}
  const safeForm = Object.assign({}, form);
  delete safeForm.internalNotes;
  delete safeForm.staffNotes;
  return {
    form: safeForm,
    content,
    projectImages,
    pageImages,
    options,
    ref: row.ref || '',
    title: row.title || '',
    capacity: row.capacity || '',
    version: row.version_label || '1.0',
    customerName: row.customer_name || safeForm.custName || ''
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
function messageWithPortalLink(value, row, portalUrl) {
  const placeholder = '[A secure link will be inserted when you prepare the send]';
  const linkedUrl = /https?:\/\/[^\s"'<>]*\/portal\.html\?t=[^\s"'<>]*/g;
  let message = String(value || '').trim() || buildDefaultMessage(row, portalUrl);
  message = message.replaceAll(placeholder, portalUrl);
  if (linkedUrl.test(message)) message = message.replace(linkedUrl, portalUrl);
  if (!message.includes(portalUrl)) {
    const suffix = '\n\nSecure proposal link (read-only):\n' + portalUrl;
    message = message.slice(0, Math.max(0, 4000 - suffix.length)).trimEnd() + suffix;
  }
  if (message.length > 4000) {
    const linkAt = message.lastIndexOf(portalUrl);
    message = linkAt >= 0 && linkAt + portalUrl.length > 4000
      ? message.slice(0, Math.max(0, 4000 - portalUrl.length - 1)).trimEnd() + '\n' + portalUrl
      : message.slice(0, 4000);
  }
  return message;
}
function digitsForWhatsApp(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) digits = '91' + digits;
  return /^[1-9]\d{10,14}$/.test(digits) ? digits : '';
}
function publicAppOrigin(env, requestUrl) {
  try { return new URL((env && env.APP_URL) || requestUrl.origin).origin; }
  catch (_) { return requestUrl.origin; }
}
function parseExpiryDays(body) {
  /* Same defensive defaults as the local server: explicit future dates win,
     anything invalid falls back to 30 days, capped at 365. Never silently
     mint a non-expiring link from bad input. */
  if (body && body.expiresAt) {
    const t = Date.parse(body.expiresAt);
    if (Number.isFinite(t) && t > Date.now()) return new Date(t).toISOString();
  }
  let days = body && body.expiresInDays != null ? Number(body.expiresInDays) : 30;
  if (!Number.isFinite(days) || days <= 0) days = 30;
  if (days > 365) days = 365;
  return new Date(Date.now() + days * 864e5).toISOString();
}

const assistantSchemas = new WeakMap();
async function ensureAssistantSchema(db) {
  let pending = assistantSchemas.get(db);
  if (!pending) {
    pending = run(db, `CREATE TABLE IF NOT EXISTS assistant_usage (
      scope TEXT NOT NULL, bucket TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER NOT NULL, PRIMARY KEY(scope,bucket)
    )`).catch(err => { assistantSchemas.delete(db); throw err; });
    assistantSchemas.set(db, pending);
  }
  await pending;
}

/* ---------- D1 helpers ---------- */
async function one(db, sql, ...binds) {
  return db.prepare(sql).bind(...binds).first();
}
async function all(db, sql, ...binds) {
  const r = await db.prepare(sql).bind(...binds).all();
  return (r && r.results) || [];
}
async function run(db, sql, ...binds) {
  return db.prepare(sql).bind(...binds).run();
}

async function requireUser(request, db, env) {
  const token = sessionTokenFrom(request);
  if (!token) return null;
  const session = await one(
    db,
    'SELECT * FROM sessions WHERE token = ? AND expires_at > ?',
    token,
    nowISO()
  );
  if (!session) return null;
  const user = await one(db, 'SELECT * FROM users WHERE id = ?', session.user_id);
  if (user) await applyOwnerBootstrap(db, env, user);
  return user;
}
/* Bootstrap owner: the deployed workspace designates one login email via the
   OWNER_EMAIL variable. That account is promoted to owner (persisted) on any
   authenticated request. One-way: removing the variable does not demote.

   UNCONDITIONAL — no role_custom / typed-title gate. The company mailbox must
   become the visible Owner even if that row signed up with a typed title, so
   nothing here may refuse to promote it.

   This is the ONLY automatic role transition in the product. The ADMIN_EMAIL
   row is deliberately left exactly as it is stored — see the note above
   applyOwnerBootstrap. */
async function ensureBootstrapOwner(db, env, user) {
  const designated = ownerEmail(env);
  if (!designated || !user || user.role === 'owner') return;
  if (normalizeEmail(user.email) !== designated) return;
  /* Promote the ROLE only. role_custom is deliberately PRESERVED, not wiped:
     an owner may carry a display title (powers = Owner, chip = "Director"), and
     the unconditional bootstrap must not erase it on the next request. Display
     is title-first, so the chip reads the title while the power badge reads
     Owner. */
  await run(
    db,
    'UPDATE users SET role = ?, updated_at = ? WHERE id = ?',
    'owner', nowISO(), user.id
  );
  user.role = 'owner';
}
/* There is deliberately NO automatic demotion of the ADMIN_EMAIL row.

   An earlier revision healed that row owner -> viewer on sign-in so the
   personal mailbox would not show up as a second visible Owner. It is gone,
   and it should not come back:

     - it fought deliberate promotions. Promoting the designated admin to a
       visible Owner stored owner/NULL, which re-armed the heal, so the next
       request from that mailbox silently undid what an owner had just done on
       purpose. A role that cannot be set is a bug wearing a feature's clothes.
     - it was never needed for safety. This account's reach comes from
       ADMIN_EMAIL and, once used, from is_admin - not from its role column.
       Demotion changed the display and nothing else.

   If the account should read "Viewer" instead of "Owner", change its role once
   from the team panel (or its own pencil) and it sticks: nothing here writes
   the role back. The OWNER_EMAIL bootstrap below is the only automatic role
   transition left in the product. */
/* Kept as a thin wrapper so the three call sites (requireUser, login,
   register) read as one named transition. */
async function applyOwnerBootstrap(db, env, user) {
  await ensureBootstrapOwner(db, env, user);
}
async function createSession(db, user) {
  const token = randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await run(
    db,
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
    token, user.id, expires, nowISO()
  );
  return { token, expiresAt: expires };
}
async function revokeUserSessions(db, userId, keepToken) {
  if (keepToken) {
    await run(db, 'DELETE FROM sessions WHERE user_id = ? AND token != ?', userId, keepToken);
  } else {
    await run(db, 'DELETE FROM sessions WHERE user_id = ?', userId);
  }
}

/* Auth throttling: fixed IP ceiling + per-email exponential backoff, stored in
   D1 so every Worker isolate shares the same counters. Same semantics and
   response body as the local server: the 429 body never reveals whether an
   account exists, and limits apply on the attempt path before user lookup.
   The table self-creates on first use (also declared in schema.sql), so no
   manual D1 migration is required. Concurrent same-millisecond failures may
   undercount by a little; the IP ceiling bounds total abuse regardless. */
const AUTH_429_BODY = 'Too many sign-in attempts. Try again in a few minutes.';
const AUTH_THROTTLE_DDL = `CREATE TABLE IF NOT EXISTS auth_throttles (
  scope TEXT PRIMARY KEY,
  fails INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL DEFAULT 0,
  window_count INTEGER NOT NULL DEFAULT 0
)`;
const throttleReadyDbs = new WeakSet();
async function ensureAuthThrottle(db) {
  if (throttleReadyDbs.has(db)) return;
  await run(db, AUTH_THROTTLE_DDL);
  throttleReadyDbs.add(db);
}
function clientIp(request) {
  /* Prefer Cloudflare's verified edge header; do not trust X-Forwarded-For
     alone (it is attacker-controlled unless the edge strips/overwrites it). */
  return String(request.headers.get('CF-Connecting-IP') || '').trim() || 'unknown';
}
/** Returns null if allowed, or retry-after seconds if blocked. */
async function authThrottleCheck(db, request, email) {
  await ensureAuthThrottle(db);
  const now = Date.now();
  const ip = await one(db, 'SELECT * FROM auth_throttles WHERE scope = ?', 'ip:' + clientIp(request));
  if (ip && ip.window_start && now - ip.window_start <= 15 * 60 * 1000 && ip.window_count >= 40) {
    return Math.max(1, Math.ceil((ip.window_start + 15 * 60 * 1000 - now) / 1000));
  }
  const em = String(email || '').trim().toLowerCase();
  if (em) {
    const eb = await one(db, 'SELECT * FROM auth_throttles WHERE scope = ?', 'email:' + em);
    if (eb && eb.blocked_until && now < eb.blocked_until) {
      return Math.max(1, Math.ceil((eb.blocked_until - now) / 1000));
    }
  }
  return null;
}
async function authThrottleFail(db, request, email) {
  await ensureAuthThrottle(db);
  const now = Date.now();
  const ipKey = 'ip:' + clientIp(request);
  const ip = await one(db, 'SELECT * FROM auth_throttles WHERE scope = ?', ipKey);
  let ws = (ip && ip.window_start) || 0;
  let wc = (ip && ip.window_count) || 0;
  if (!ws || now - ws > 15 * 60 * 1000) { ws = now; wc = 0; }
  wc += 1;
  await run(
    db,
    `INSERT INTO auth_throttles (scope, fails, blocked_until, window_start, window_count)
     VALUES (?, 0, 0, ?, ?)
     ON CONFLICT(scope) DO UPDATE SET window_start = excluded.window_start, window_count = excluded.window_count`,
    ipKey, ws, wc
  );
  const em = String(email || '').trim().toLowerCase();
  if (!em) return;
  const eb = await one(db, 'SELECT * FROM auth_throttles WHERE scope = ?', 'email:' + em);
  const fails = ((eb && eb.fails) || 0) + 1;
  let blocked = (eb && eb.blocked_until) || 0;
  /* Exponential backoff after the 5th failure: 2s, 4s, 8s… capped at 15 min. */
  if (fails >= 5) {
    blocked = now + Math.min(15 * 60, Math.pow(2, Math.min(fails - 4, 10))) * 1000;
  }
  await run(
    db,
    `INSERT INTO auth_throttles (scope, fails, blocked_until, window_start, window_count)
     VALUES (?, ?, ?, 0, 0)
     ON CONFLICT(scope) DO UPDATE SET fails = excluded.fails, blocked_until = excluded.blocked_until`,
    'email:' + em, fails, blocked
  );
}
async function authThrottleSuccess(db, email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return;
  await ensureAuthThrottle(db);
  await run(db, 'DELETE FROM auth_throttles WHERE scope = ?', 'email:' + em);
}
function authLimited(retryAfterSec) {
  return json({ error: AUTH_429_BODY }, 429, {
    'Retry-After': String(Math.max(1, retryAfterSec || 60))
  });
}
async function issuePasswordReset(db, user) {
  const raw = randomBytes(4).toString('hex'); /* 8 hex chars */
  const id = uid('pwr');
  await run(
    db,
    'UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
    nowISO(), user.id
  );
  await run(
    db,
    'INSERT INTO password_resets (id, user_id, code_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
    id, user.id, hashToken(raw),
    new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    nowISO()
  );
  return raw;
}
async function pushNotification(db, partial) {
  const id = uid('ntf');
  await run(
    db,
    `INSERT INTO notifications (id, owner_id, proposal_id, event_id, kind, title, body, read_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    id,
    partial.owner_id,
    partial.proposal_id || null,
    partial.event_id || null,
    partial.kind || 'info',
    partial.title || '',
    partial.body || '',
    nowISO()
  );
  return id;
}
async function recordEvent(db, partial) {
  const id = uid('evt');
  await run(
    db,
    `INSERT INTO portal_events (id, token_id, version_id, proposal_id, owner_id, event_type, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    partial.token_id || null,
    partial.version_id || null,
    partial.proposal_id || null,
    partial.owner_id || null,
    partial.event_type,
    JSON.stringify(partial.meta || {}),
    nowISO()
  );
  return { id, ...partial, created_at: nowISO() };
}
async function notifyFromPortalEvent(db, ev) {
  if (!ev || !ev.owner_id) return null;
  if (ev.event_type === 'suspected_prefetch') return null;
  const kindMeta = NOTIFY_KINDS[ev.event_type];
  if (!kindMeta) return null;
  if (ev.event_type === 'link_opened') {
    const prev = await one(
      db,
      `SELECT id FROM portal_events
       WHERE proposal_id = ? AND owner_id = ? AND event_type = 'link_opened' AND id != ?
       LIMIT 1`,
      ev.proposal_id, ev.owner_id, ev.id
    );
    if (prev) return null;
  }
  const prop = ev.proposal_id
    ? await one(db, 'SELECT customer_name, ref FROM proposals WHERE id = ?', ev.proposal_id)
    : null;
  const who = prop ? (prop.customer_name || prop.ref || 'a proposal') : 'a proposal';
  return pushNotification(db, {
    owner_id: ev.owner_id,
    proposal_id: ev.proposal_id || null,
    event_id: ev.id,
    kind: kindMeta.kind,
    title: kindMeta.title,
    body: who + ' — ' + (ev.event_type || 'event')
  });
}

/* Resolve bindings even if the dashboard renamed them (must still be D1 / Assets). */
function getDb(env) {
  if (env && env.DB && typeof env.DB.prepare === 'function') return env.DB;
  if (!env || typeof env !== 'object') return null;
  for (const key of Object.keys(env)) {
    const v = env[key];
    if (v && typeof v.prepare === 'function' && typeof v.batch === 'function') return v;
  }
  for (const key of Object.keys(env)) {
    const v = env[key];
    if (v && typeof v.prepare === 'function') return v;
  }
  return null;
}
function getAssets(env) {
  if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') return env.ASSETS;
  if (!env || typeof env !== 'object') return null;
  for (const key of Object.keys(env)) {
    const v = env[key];
    if (v && typeof v.fetch === 'function' && key !== 'DB') {
      /* Workers Assets binding exposes fetch(); skip obvious non-assets */
      if (typeof v.prepare === 'function') continue;
      return v;
    }
  }
  return null;
}
function bindingNames(env) {
  try { return env && typeof env === 'object' ? Object.keys(env).sort() : []; }
  catch (_) { return []; }
}

/* Staff gallery: photo bytes as D1 BLOBs (free tier forever — no R2, no card).
   Browser auto-compresses uploads under ~900 KB so rows stay small.
   Public page stays repo-curated. */
const GALLERY_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const GALLERY_CAT = new Set(['site', 'industrial', 'commercial', 'residential']);
const GALLERY_MAX_BYTES = 900 * 1024;
function safeGalleryName(name) {
  const base = String(name || 'photo.jpg').split('/').pop().replace(/[^a-zA-Z0-9._-]/g, '_');
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot).toLowerCase() : '';
  const type = GALLERY_MIME[ext];
  if (!type) return null;
  const stem = (dot >= 0 ? base.slice(0, dot) : base).slice(0, 60) || 'photo';
  return { name: stem + ext, type };
}
function publicGallery(g) {
  return {
    id: g.id,
    url: '/api/gallery/file/' + encodeURIComponent(g.id),
    caption: g.caption || '',
    category: g.category || 'site',
    size: g.size || 0,
    created_at: g.created_at
  };
}

/* ---------- API ---------- */
async function handleApi(request, env, url) {
  const db = getDb(env);
  if (!db) {
    return json({
      error: 'D1 database binding is missing.',
      hint: 'In Cloudflare → Workers → quotation-studio → Settings → Bindings, add D1 with variable name DB pointing at quotation-studio-db. Or run: cd platform/cloudflare && npx wrangler deploy',
      bindingNames: bindingNames(env)
    }, 500);
  }

  const method = request.method || 'GET';
  const parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);

  try {
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' &&
        !(parts[0] === 'auth' && parts[1] === 'oauth') && crossSiteBlocked(request, url, env)) {
      return json({
        error: 'Cross-site request blocked. Open Studio from the application website and try again.',
        code: 'ORIGIN_BLOCKED'
      }, 403);
    }
    if (parts[0] === 'auth' && parts[1] === 'oauth') {
      return handleOAuth(request, env, d1OAuthStore(db), {
        user: r => requireUser(r, db, env), token: sessionTokenFrom, rateKey: request.headers.get('CF-Connecting-IP') || 'unknown',
        userByToken: token => requireUser(new Request(request.url, {headers:{Authorization:'Bearer '+token}}), db, env),
        canLink: async (user, password, r) => {
          if (!String(user.password_hash).startsWith('oauth-only$')) return password.length <= 128 && verifyPassword(password, user.password_hash);
          const session = await one(db, 'SELECT created_at FROM sessions WHERE token = ? AND user_id = ?', sessionTokenFrom(r), user.id);
          return !!session && Date.parse(session.created_at) > Date.now() - 300000;
        },
        session: user => createSession(db, user),
        cookie: (token, r) => sessionCookie(token, SESSION_DAYS * 86400, r)
      });
    }
    if (parts[0] === 'auth' && parts[1] === 'phone') {
      return handlePhoneAuth(request, env, d1OAuthStore(db), {
        rateKey: request.headers.get('CF-Connecting-IP') || 'unknown',
        session: user => createSession(db, user),
        cookie: (token, r) => sessionCookie(token, SESSION_DAYS * 86400, r)
      });
    }
    /* AUTH */
    if (parts[0] === 'auth' && parts[1] === 'register' && method === 'POST') {
      const body = await readBody(request);
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').trim() || email.split('@')[0] || 'User';
      const password = String(body.password || '');
      /* Throttle before existence checks so 429 timing/body cannot reveal accounts. */
      const regBlocked = await authThrottleCheck(db, request, email);
      if (regBlocked != null) return authLimited(regBlocked);
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        await authThrottleFail(db, request, email);
        return json({ error: 'Enter a valid email address (for example name@company.com).' }, 400);
      }
      const policy = passwordPolicyError(password);
      if (policy) {
        await authThrottleFail(db, request, email);
        return json({ error: policy }, 400);
      }
      const existing = await one(db, 'SELECT id FROM users WHERE email = ? COLLATE NOCASE', email);
      if (existing) {
        await authThrottleFail(db, request, email);
        return json({
          error: 'An account with this email already exists. Sign in instead, or use Forgot password if you cannot access it.'
        }, 409);
      }
      const parsed = parseSignupRole(body.role != null ? body.role : body.roleCustom);
      if (parsed.error) {
        await authThrottleFail(db, request, email);
        return json({ error: parsed.error }, 400);
      }
      const user = {
        id: uid('usr'),
        email,
        name: name.slice(0, 120),
        password_hash: hashPassword(password),
        // A public job-title field is not an authorization grant.
        // Existing accounts are unchanged; only an existing owner may promote.
        role: 'viewer',
        role_custom: String(body.role != null ? body.role : body.roleCustom).trim(),
        created_at: nowISO(),
        updated_at: nowISO()
      };
      await run(
        db,
        `INSERT INTO users (id, email, name, password_hash, role, role_custom, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        user.id, user.email, user.name, user.password_hash, user.role, user.role_custom,
        user.created_at, user.updated_at
      );
      await applyOwnerBootstrap(db, env, user);
      await authThrottleSuccess(db, email);
      const sess = await createSession(db, user);
      return json(
        { user: publicUser(user, env), token: sess.token, expiresAt: sess.expiresAt },
        201,
        authHeaders(sess.token, request)
      );
    }

    if (parts[0] === 'auth' && parts[1] === 'login' && method === 'POST') {
      const body = await readBody(request);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const loginBlocked = await authThrottleCheck(db, request, email);
      if (loginBlocked != null) return authLimited(loginBlocked);
      if (!email || !password) {
        await authThrottleFail(db, request, email);
        return json({ error: 'Invalid email or password' }, 401);
      }
      const user = await one(db, 'SELECT * FROM users WHERE email = ? COLLATE NOCASE', email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        await authThrottleFail(db, request, email);
        return json({ error: 'Invalid email or password' }, 401);
      }
      await authThrottleSuccess(db, email);
      await applyOwnerBootstrap(db, env, user);
      const sess = await createSession(db, user);
      return json(
        { user: publicUser(user, env), token: sess.token, expiresAt: sess.expiresAt },
        200,
        authHeaders(sess.token, request)
      );
    }

    if (parts[0] === 'auth' && parts[1] === 'logout' && method === 'POST') {
      const token = sessionTokenFrom(request);
      if (token) await run(db, 'DELETE FROM sessions WHERE token = ?', token);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0, request) });
    }

    if (parts[0] === 'auth' && parts[1] === 'me' && method === 'GET') {
      const user = await requireUser(request, db, env);
      if (!user) return json({ error: 'Not signed in' }, 401);
      return json({ user: publicUser(user, env) });
    }

    // Public recovery is fail-closed until a verified delivery channel exists.
    // Reject reset as well: previously disclosed, unexpired codes must not work.
    // Identical response for known/unknown accounts; no lookup or code issuance.
    if (parts[0] === 'auth' && ['forgot-password', 'reset-password'].includes(parts[1]) && method === 'POST') {
      return json({
        error: 'Self-service password recovery is unavailable. Contact your company administrator to arrange identity-verified assistance. No recovery email has been sent.',
        code: 'RECOVERY_UNAVAILABLE'
      }, 403);
    }

    if (parts[0] === 'auth' && parts[1] === 'change-password' && method === 'POST') {
      const sessionUser = await requireUser(request, db, env);
      if (!sessionUser) return json({ error: 'Sign in required' }, 401);
      const body = await readBody(request);
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (!verifyPassword(currentPassword, sessionUser.password_hash)) {
        return json({ error: 'Current password is incorrect.' }, 400);
      }
      const policy = passwordPolicyError(newPassword);
      if (policy) return json({ error: policy }, 400);
      if (verifyPassword(newPassword, sessionUser.password_hash)) {
        return json({ error: 'New password must be different from the current password.' }, 400);
      }
      await run(
        db,
        'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
        hashPassword(newPassword), nowISO(), sessionUser.id
      );
      const keep = sessionTokenFrom(request);
      await revokeUserSessions(db, sessionUser.id, keep);
      return json({
        ok: true,
        message: 'Password changed. Other signed-in sessions were signed out.'
      });
    }

    if (parts[0] === 'auth' && parts[1] === 'profile' && method === 'POST') {
      const sessionUser = await requireUser(request, db, env);
      if (!sessionUser) return json({ error: 'Sign in required' }, 401);
      const body = await readBody(request);
      if (body.name != null) {
        const name = String(body.name || '').trim();
        if (!name) return json({ error: 'Name cannot be empty.' }, 400);
        await run(
          db,
          'UPDATE users SET name = ?, updated_at = ? WHERE id = ?',
          name.slice(0, 120), nowISO(), sessionUser.id
        );
        sessionUser.name = name.slice(0, 120);
      }
      return json({ user: publicUser(sessionUser, env) });
    }

    if (parts[0] === 'health' && method === 'GET') {
      /* Role configuration warnings (P1 conflict + malformed values).
         Deliberately reports STATE ONLY: no email address, no count of admins,
         and no hint that a designated admin exists — this route is
         unauthenticated, so anything it says is public. */
      const warnings = rolesIssues(env);
      /* The elevation column arrives by migration, not implicitly. Until it is
         applied, elevation cannot work and every read of it has to be
         defensive — so say so here rather than let an operator discover it by
         watching a dropdown do nothing. One row, no user data returned. */
      let hasElevationColumn = true;
      try {
        const col = await one(
          db,
          "SELECT name FROM pragma_table_info('users') WHERE name = 'is_admin'"
        );
        hasElevationColumn = !!col;
      } catch (_) {
        hasElevationColumn = false;
      }
      if (!hasElevationColumn) {
        warnings.push(
          'The users.is_admin column is missing, so elevation is unavailable. Apply platform/migrations/005-is-admin.sql (back up the users table first), then verify with 005-is-admin-verify.sql.'
        );
      }
      return json({
        ok: true,
        phase: 'E',
        build: 'workspace-5',
        codeVersion: CODE_VERSION,
        storage: 'cloudflare-d1',
        time: nowISO(),
        project: 'quotation-studio',
        bindings: bindingNames(env),
        hasDb: true,
        hasAssets: !!getAssets(env),
        sending: {
          manualChannels: Object.keys(SEND_CHANNELS),
          providerDelivery: false,
          note: 'Manual WhatsApp/email record share_clicked only. Delivered requires a future provider webhook.'
        },
        features: {
          notifications: true,
          tasks: true,
          reports: true,
          roles: ['owner', 'sales', 'viewer', 'custom'],
          /* Power levels, exposed as capabilities rather than titles: canWrite
             is sales-and-above, canManageTeam is owner-and-above. A designated
             ADMIN_EMAIL login satisfies both, and elevation sits above them. */
          roleCustomTitles: true,
          ownerSeesAll: true,
          elevation: hasElevationColumn
        },
        warnings
      });
    }

    /* Public customer portal (token only) */
    /* GET snapshot for portal.js — same contract as the local server. */
    if (parts[0] === 'portal' && parts[1] === 'proposal' && method === 'GET') {
      const raw = String(url.searchParams.get('t') || '').trim();
      const tok = await one(db, 'SELECT * FROM access_tokens WHERE token_hash = ?', hashToken(raw));
      if (!raw || !tok || !tokenIsActive(tok)) {
        return json({ error: 'This proposal link is invalid, expired, or has been revoked. Please contact the sender for a new link or the PDF.' }, 404);
      }
      const version = await one(db, 'SELECT * FROM proposal_versions WHERE id = ?', tok.version_id);
      if (!version) return json({ error: 'The published proposal version is no longer available.' }, 404);
      let snapshot;
      try { snapshot = JSON.parse(version.snapshot_json); }
      catch (_) { return json({ error: 'Published proposal data could not be read.' }, 500); }
      const ua = (request.headers.get('user-agent') || '').slice(0, 180);
      const isPrefetch = /bot|crawl|spider|preview|whatsapp|facebookexternalhit|slackbot|twitterbot|linkedinbot|discordbot|embedly|quora/i.test(ua)
        || String(request.headers.get('purpose') || '').toLowerCase() === 'prefetch'
        || String(request.headers.get('sec-purpose') || '').toLowerCase().includes('prefetch');
      const now = nowISO();
      if (isPrefetch) {
        const ev = await recordEvent(db, {
          token_id: tok.id,
          version_id: version.id,
          proposal_id: tok.proposal_id,
          owner_id: tok.owner_id,
          event_type: 'suspected_prefetch',
          meta: { ua }
        });
        await notifyFromPortalEvent(db, ev);
      } else {
        await run(
          db,
          `UPDATE access_tokens SET
             open_count = open_count + 1,
             first_opened_at = COALESCE(first_opened_at, ?),
             last_opened_at = ?
           WHERE id = ?`,
          now, now, tok.id
        );
        tok.open_count = (tok.open_count || 0) + 1;
        const ev = await recordEvent(db, {
          token_id: tok.id,
          version_id: version.id,
          proposal_id: tok.proposal_id,
          owner_id: tok.owner_id,
          event_type: 'link_opened',
          meta: { ua, openCount: tok.open_count }
        });
        await notifyFromPortalEvent(db, ev);
      }
      return json({
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
      const body = await readBody(request);
      const raw = String(body.token || body.t || '').trim();
      const eventType = String(body.eventType || body.type || '').trim();
      if (!raw || !eventType) return json({ error: 'token and eventType required' }, 400);
      /* Same allowlist as the local server. */
      const allowed = {
        pdf_download_requested: true,
        section_view: true,
        interest_recorded: true,
        survey_requested: true
      };
      if (!allowed[eventType]) return json({ error: 'Unsupported portal event' }, 400);
      const tok = await one(db, 'SELECT * FROM access_tokens WHERE token_hash = ?', hashToken(raw));
      if (!tok || !tokenIsActive(tok)) return json({ error: 'Invalid token' }, 404);
      const ev = await recordEvent(db, {
        token_id: tok.id,
        version_id: tok.version_id,
        proposal_id: tok.proposal_id,
        owner_id: tok.owner_id,
        event_type: eventType,
        meta: sanitizePortalMeta(body.meta)
      });
      await notifyFromPortalEvent(db, ev);
      return json({ ok: true });
    }

    /* Staff session required below */
    const user = await requireUser(request, db, env);
    if (!user) return json({ error: 'Sign in required' }, 401);
    const canWrite = requireRole(user, 'sales', env);
    const canAdmin = requireRole(user, 'owner', env);
    /* Owner-sees-all. Bound into every OWN_SCOPE guard below as the FIRST of
       its two placeholders: null for owner/hidden admin (the `? IS NULL` arm
       wins, so every row is returned), the user's own id for members (the
       `owner_id = ?` arm applies, exactly as before this change). */
    const scope = seesAll(user, env) ? null : user.id;

    /* Gemini: no browser-supplied context or mutation tools. */
    if (parts[0] === 'assistant' && parts.length === 2) {
      if (method === 'POST' && !request.headers.get('Authorization') && !request.headers.get('X-QS-Session')) return json({ error: 'Sign in again to use the assistant.' }, 403);
      const result = await handleAssistant({
        method, action: parts[1], user, env,
        readBody: () => boundedJson(request),
        reserveQuota: async userId => {
          // Additive, idempotent bootstrap: no manual D1 migration or destructive reset.
          await ensureAssistantSchema(db);
          // Atomic conditional UPSERTs enforce limits across Worker isolates.
          await run(db, 'DELETE FROM assistant_usage WHERE expires_at < ?', Date.now());
          for (const w of quotaWindows(userId)) {
            const row = await one(db,
              `INSERT INTO assistant_usage (scope,bucket,count,expires_at) VALUES (?,?,1,?)
               ON CONFLICT(scope,bucket) DO UPDATE SET count=count+1 WHERE count < ? RETURNING count`,
              w.scope,w.bucket,w.expires,w.limit);
            if (!row) return false;
          }
          return true;
        },
        loadContext: async proposalId => {
          const [counts, proposals, tasks, events, selected] = await Promise.all([
            all(db, 'SELECT status, COUNT(*) AS count FROM proposals WHERE ' + OWN_SCOPE + ' GROUP BY status', scope, user.id),
            all(db, 'SELECT id,owner_id,ref,title,status,capacity,customer_name,updated_at,created_at,form_json FROM proposals WHERE ' + OWN_SCOPE + ' ORDER BY updated_at DESC LIMIT 31', scope, user.id),
            all(db, "SELECT id,owner_id,proposal_id,title,due_at,status FROM tasks WHERE " + OWN_SCOPE + " AND status = 'open' ORDER BY due_at IS NULL,due_at ASC LIMIT 31", scope, user.id),
            all(db, "SELECT owner_id,proposal_id,event_type,created_at FROM portal_events WHERE " + OWN_SCOPE + " AND event_type != 'suspected_prefetch' ORDER BY created_at DESC LIMIT 16", scope, user.id),
            proposalId ? one(db, 'SELECT * FROM proposals WHERE id = ? AND ' + OWN_SCOPE, proposalId, scope, user.id) : null
          ]);
          const byStatus = {}; counts.forEach(r => { byStatus[r.status || 'draft'] = Number(r.count) || 0; });
          return { total: counts.reduce((sum,r) => sum + Number(r.count),0), byStatus, proposals,tasks,events,selected };
        }
      });
      return json(result.body, result.status);
    }

    /* PROJECT GALLERY (staff uploads; writes need sales+) */
    if (parts[0] === 'gallery' && parts.length === 1 && method === 'GET') {
      const rows = await all(db, 'SELECT * FROM gallery ORDER BY created_at DESC');
      return json({ gallery: rows.map(publicGallery) });
    }
    if (parts[0] === 'gallery' && parts.length === 1 && method === 'POST') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot upload photos.' }, 403);
      const safe = safeGalleryName(request.headers.get('X-Filename'));
      if (!safe) return json({ error: 'Allowed types: png, jpg, webp.' }, 400);
      const declaredUpload = Number(request.headers.get('Content-Length'));
      if (Number.isFinite(declaredUpload) && declaredUpload > GALLERY_MAX_BYTES) {
        return json({ error: 'Photo must stay under ~900 KB so storage stays on the free tier forever.' }, 413);
      }
      const buf = await request.arrayBuffer();
      if (!buf || !buf.byteLength) return json({ error: 'Empty file.' }, 400);
      if (buf.byteLength > GALLERY_MAX_BYTES) {
        return json({ error: 'Photo must stay under ~900 KB so storage stays on the free tier forever.' }, 413);
      }
      let caption = '';
      try { caption = decodeURIComponent(request.headers.get('X-Caption') || ''); }
      catch (_) { caption = request.headers.get('X-Caption') || ''; }
      caption = caption.slice(0, 140);
      const cat = String(request.headers.get('X-Category') || 'site').toLowerCase();
      const category = GALLERY_CAT.has(cat) ? cat : 'site';
      const id = uid('gal');
      const now = nowISO();
      await run(
        db,
        'INSERT INTO gallery (id, store_key, file_name, mime, caption, category, size, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id, '', safe.name, safe.type, caption, category, buf.byteLength, user.id, now
      );
      await run(db, 'INSERT INTO gallery_blobs (id, data) VALUES (?, ?)', id, buf);
      return json({ gallery: publicGallery({ id, caption, category, size: buf.byteLength, created_at: now }) }, 201);
    }
    if (parts[0] === 'gallery' && parts[1] === 'file' && parts[2] && method === 'GET') {
      const row = await one(
        db,
        'SELECT g.mime AS mime, b.data AS data FROM gallery g JOIN gallery_blobs b ON b.id = g.id WHERE g.id = ?',
        parts[2]
      );
      if (!row || !row.data) return json({ error: 'Photo not found.' }, 404);
      return new Response(row.data, {
        headers: {
          'Content-Type': row.mime || 'application/octet-stream',
          'Cache-Control': 'private, max-age=3600',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    }
    if (parts[0] === 'gallery' && parts[1] && parts.length === 2 && method === 'DELETE') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot delete photos.' }, 403);
      const row = await one(db, 'SELECT id FROM gallery WHERE id = ?', parts[1]);
      if (!row) return json({ error: 'Photo not found.' }, 404);
      await run(db, 'DELETE FROM gallery_blobs WHERE id = ?', parts[1]);
      await run(db, 'DELETE FROM gallery WHERE id = ?', parts[1]);
      return json({ ok: true });
    }

    if (parts[0] === 'dashboard' && parts[1] === 'summary' && method === 'GET') {
      const mine = await all(db, 'SELECT * FROM proposals WHERE ' + OWN_SCOPE, scope, user.id);
      const counts = { total: mine.length, draft: 0, ready: 0, accepted: 0, sent: 0, won: 0, lost: 0, byStatus: {} };
      mine.forEach((p) => {
        const s = p.status || 'draft';
        counts.byStatus[s] = (counts.byStatus[s] || 0) + 1;
        if (s === 'draft') counts.draft++;
        if (s === 'ready') counts.ready++;
        if (s === 'accepted') { counts.accepted++; counts.won++; }
        if (s === 'rejected') counts.lost++;
        if (s === 'sent' || s === 'viewed' || s === 'negotiation') counts.sent++;
      });
      const unreadRow = await one(
        db,
        'SELECT COUNT(*) AS c FROM notifications WHERE ' + OWN_SCOPE + ' AND read_at IS NULL',
        scope, user.id
      );
      const openTasks = await all(
        db,
        "SELECT * FROM tasks WHERE " + OWN_SCOPE + " AND status = 'open'",
        scope, user.id
      );
      const overdue = openTasks.filter((t) => t.due_at && Date.parse(t.due_at) < Date.now()).length;
      counts.unreadNotifications = Number(unreadRow && unreadRow.c) || 0;
      counts.openTasks = openTasks.length;
      counts.overdueTasks = overdue;
      const recent = mine
        .slice()
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
        .slice(0, 8)
        .map(proposalSummary);
      return json({ counts, recent, role: user.role, roleLabel: roleDisplay(user) });
    }

    if (parts[0] === 'proposals' && parts.length === 1 && method === 'GET') {
      const list = await all(
        db,
        'SELECT * FROM proposals WHERE ' + OWN_SCOPE + ' ORDER BY updated_at DESC',
        scope, user.id
      );
      return json({ proposals: list.map(proposalSummary) });
    }

    if (parts[0] === 'proposals' && parts[1] === 'reference' && parts.length === 2 && method === 'POST') {
      if (!canWrite) return json({ error: 'Your role cannot issue proposal references.' }, 403);
      return json({ reference: await reserveCloudReference(db) });
    }

    if (parts[0] === 'proposals' && parts.length === 1 && method === 'POST') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot create or edit proposals.' }, 403);
      const body = await readBody(request);
      const badStatus = proposalStatusError(body.status);
      if (badStatus) return json({ error: badStatus }, 400);
      const meta = metaFromBody(body, null);
      if (!String(meta.ref || '').trim()) meta.ref = await reserveCloudReference(db);
      meta.form = { ...meta.form, propRef: meta.ref };
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
      await run(
        db,
        `INSERT INTO proposals (
          id, owner_id, customer_id, ref, title, status, version_label, prev_id,
          capacity, customer_name, form_json, content_json, project_images_json,
          page_images_json, options_json, local_id, sent_at, accepted_at, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        row.id, row.owner_id, row.customer_id, row.ref, row.title, row.status, row.version_label,
        row.prev_id, row.capacity, row.customer_name, row.form_json, row.content_json,
        row.project_images_json, row.page_images_json, row.options_json, row.local_id,
        row.sent_at, row.accepted_at, row.revision, row.created_at, row.updated_at
      );
      return json({ proposal: proposalFull(row) }, 201);
    }

    if (parts[0] === 'proposals' && parts[1] && parts.length === 2 && method === 'GET') {
      const row = await one(db, 'SELECT * FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!row) return json({ error: 'Proposal not found' }, 404);
      return json({ proposal: proposalFull(row) });
    }

    if (parts[0] === 'proposals' && parts[1] && parts.length === 2 && method === 'PUT') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot edit proposals.' }, 403);
      const row = await one(db, 'SELECT * FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!row) return json({ error: 'Proposal not found' }, 404);
      const body = await readBody(request);
      const badUpdateStatus = proposalStatusError(body.status);
      if (badUpdateStatus) return json({ error: badUpdateStatus }, 400);
      /* Match the local-server optimistic concurrency contract. A stale Studio
         tab must not overwrite a newer save or a share-state status change. */
      if (body.baseRevision != null && body.baseRevision !== '') {
        const theirs = Number(body.baseRevision);
        const mine = proposalRevision(row);
        if (Number.isFinite(theirs) && theirs !== mine) {
          return json({
            error: 'This proposal was saved more recently in the cloud. Reload it, then save again so your edits are not overwritten.',
            code: 'CONFLICT',
            proposal: proposalFull(row)
          }, 409);
        }
      }
      const meta = metaFromBody(body, row);
      const status = body.status != null ? body.status : row.status;
      const customerId = body.customerId !== undefined ? body.customerId : row.customer_id;
      const localId = body.localId !== undefined ? body.localId : row.local_id;
      const sentAt = body.sentAt !== undefined ? body.sentAt : row.sent_at;
      const acceptedAt = body.acceptedAt !== undefined ? body.acceptedAt : row.accepted_at;
      const prevId = body.prevId !== undefined ? body.prevId : row.prev_id;
      const formJson = body.form !== undefined ? JSON.stringify(meta.form || {}) : row.form_json;
      const contentJson = body.content !== undefined
        ? (body.content == null ? null : JSON.stringify(body.content))
        : row.content_json;
      const projectImagesJson = body.projectImages !== undefined
        ? (body.projectImages == null ? null : JSON.stringify(body.projectImages))
        : row.project_images_json;
      const pageImagesJson = body.pageImages !== undefined
        ? (body.pageImages == null ? null : JSON.stringify(body.pageImages))
        : row.page_images_json;
      const optionsJson = body.options !== undefined
        ? JSON.stringify(Array.isArray(body.options) ? body.options : [])
        : row.options_json;
      const revision = proposalRevision(row) + 1;
      const updated = nowISO();
      await run(
        db,
        `UPDATE proposals SET
          customer_id=?, ref=?, title=?, status=?, version_label=?, prev_id=?,
          capacity=?, customer_name=?, form_json=?, content_json=?, project_images_json=?,
          page_images_json=?, options_json=?, local_id=?, sent_at=?, accepted_at=?,
          revision=?, updated_at=?
         WHERE id=? AND ` + OWN_SCOPE,
        customerId, meta.ref, meta.title, status, meta.version, prevId,
        meta.capacity, meta.customer, formJson, contentJson, projectImagesJson,
        pageImagesJson, optionsJson, localId, sentAt, acceptedAt,
        revision, updated, row.id, scope, user.id
      );
      const next = await one(db, 'SELECT * FROM proposals WHERE id = ?', row.id);
      return json({ proposal: proposalFull(next) });
    }

    if (parts[0] === 'proposals' && parts[1] && parts.length === 2 && method === 'DELETE') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot delete proposals.' }, 403);
      const r = await run(db, 'DELETE FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!r.meta || r.meta.changes === 0) return json({ error: 'Proposal not found' }, 404);
      return json({ ok: true });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'duplicate' && method === 'POST') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot duplicate proposals.' }, 403);
      const row = await one(db, 'SELECT * FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!row) return json({ error: 'Proposal not found' }, 404);
      let form = {};
      try { form = JSON.parse(row.form_json || '{}'); } catch (_) {}
      form = Object.assign({}, form);
      if (form.custName) form.custName = form.custName + ' (copy)';
      form.propRef = await reserveCloudReference(db);
      const copy = {
        id: uid('prp'),
        owner_id: user.id,
        customer_id: row.customer_id,
        ref: form.propRef,
        title: (form.custName || 'Untitled') + ' — ' + (form.capacity || row.capacity || '0') + ' kWp',
        status: 'draft',
        version_label: '1.0',
        prev_id: null,
        capacity: form.capacity || row.capacity || '',
        customer_name: form.custName || row.customer_name || '',
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
      await run(
        db,
        `INSERT INTO proposals (
          id, owner_id, customer_id, ref, title, status, version_label, prev_id,
          capacity, customer_name, form_json, content_json, project_images_json,
          page_images_json, options_json, local_id, sent_at, accepted_at, revision,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        copy.id, copy.owner_id, copy.customer_id, copy.ref, copy.title, copy.status,
        copy.version_label, copy.prev_id, copy.capacity, copy.customer_name, copy.form_json,
        copy.content_json, copy.project_images_json, copy.page_images_json, copy.options_json,
        copy.local_id, copy.sent_at, copy.accepted_at, copy.revision, copy.created_at, copy.updated_at
      );
      return json({ proposal: proposalFull(copy) }, 201);
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'publish' && method === 'POST') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot publish proposals.' }, 403);
      const row = await one(db, 'SELECT * FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!row) return json({ error: 'Proposal not found' }, 404);
      const body = await readBody(request);
      const snapshot = customerSnapshotFromProposal(row);
      const snapshotJson = JSON.stringify(snapshot);
      const version = {
        id: uid('ver'),
        proposal_id: row.id,
        owner_id: user.id,
        version_label: body.versionLabel || row.version_label || '1.0',
        snapshot_json: snapshotJson,
        snapshot_sha256: sha256Hex(snapshotJson),
        pdf_sha256: body.pdfSha256 || null,
        pdf_path: null,
        note: String(body.note || '').slice(0, 500),
        created_at: nowISO()
      };
      await run(
        db,
        `INSERT INTO proposal_versions (
          id, proposal_id, owner_id, version_label, snapshot_json, snapshot_sha256,
          pdf_sha256, pdf_path, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        version.id, version.proposal_id, version.owner_id, version.version_label,
        version.snapshot_json, version.snapshot_sha256, version.pdf_sha256,
        version.pdf_path, version.note, version.created_at
      );
      if (row.status === 'draft' || row.status === 'internal_review') {
        await run(
          db,
          "UPDATE proposals SET status = 'ready', updated_at = ? WHERE id = ?",
          nowISO(), row.id
        );
      }
      await recordEvent(db, {
        version_id: version.id,
        proposal_id: row.id,
        owner_id: user.id,
        event_type: 'published',
        meta: { version: version.version_label }
      });
      return json({ version: publicVersion(version) }, 201);
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'versions' && method === 'GET') {
      const row = await one(db, 'SELECT id FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!row) return json({ error: 'Proposal not found' }, 404);
      const list = await all(
        db,
        'SELECT * FROM proposal_versions WHERE proposal_id = ? AND ' + OWN_SCOPE + ' ORDER BY created_at DESC',
        parts[1], scope, user.id
      );
      return json({ versions: list.map(publicVersion) });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'links' && method === 'GET') {
      const row = await one(db, 'SELECT id FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!row) return json({ error: 'Proposal not found' }, 404);
      const list = await all(
        db,
        'SELECT * FROM access_tokens WHERE proposal_id = ? AND ' + OWN_SCOPE + ' ORDER BY created_at DESC',
        parts[1], scope, user.id
      );
      return json({ links: list.map((t) => publicToken(t)) });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'links' && method === 'POST') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot create customer links.' }, 403);
      const row = await one(db, 'SELECT * FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!row) return json({ error: 'Proposal not found' }, 404);
      const body = await readBody(request);
      let version = null;
      if (body.versionId) {
        version = await one(
          db,
          'SELECT * FROM proposal_versions WHERE id = ? AND proposal_id = ? AND ' + OWN_SCOPE,
          body.versionId, row.id, scope, user.id
        );
      } else {
        version = await one(
          db,
          'SELECT * FROM proposal_versions WHERE proposal_id = ? AND ' + OWN_SCOPE + ' ORDER BY created_at DESC LIMIT 1',
          row.id, scope, user.id
        );
      }
      if (!version) return json({ error: 'Publish a version before creating a customer link.' }, 400);
      const raw = randomBytes(24).toString('hex');
      const tok = {
        id: uid('tok'),
        token_hash: hashToken(raw),
        version_id: version.id,
        proposal_id: row.id,
        owner_id: user.id,
        label: String(body.label || '').slice(0, 120),
        expires_at: parseExpiryDays(body),
        revoked_at: null,
        created_at: nowISO(),
        first_opened_at: null,
        last_opened_at: null,
        open_count: 0
      };
      await run(
        db,
        `INSERT INTO access_tokens (
          id, token_hash, version_id, proposal_id, owner_id, label, expires_at,
          revoked_at, created_at, first_opened_at, last_opened_at, open_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, 0)`,
        tok.id, tok.token_hash, tok.version_id, tok.proposal_id, tok.owner_id,
        tok.label, tok.expires_at, tok.created_at
      );
      const origin = publicAppOrigin(env, url);
      const portalUrl = origin + '/portal.html?t=' + encodeURIComponent(raw);
      return json({ link: publicToken(tok, raw), portalUrl, rawToken: raw }, 201);
    }

    if (parts[0] === 'links' && parts[1] && parts[2] === 'revoke' && method === 'POST') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot revoke links.' }, 403);
      const tok = await one(db, 'SELECT * FROM access_tokens WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!tok) return json({ error: 'Link not found' }, 404);
      await run(db, 'UPDATE access_tokens SET revoked_at = ? WHERE id = ?', nowISO(), tok.id);
      return json({ ok: true });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'events' && method === 'GET') {
      const row = await one(db, 'SELECT id FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!row) return json({ error: 'Proposal not found' }, 404);
      const list = await all(
        db,
        'SELECT * FROM portal_events WHERE proposal_id = ? AND ' + OWN_SCOPE + ' ORDER BY created_at DESC LIMIT 200',
        parts[1], scope, user.id
      );
      return json({
        events: list.map((e) => ({
          id: e.id,
          type: e.event_type,
          createdAt: e.created_at,
          meta: (() => { try { return JSON.parse(e.meta_json || '{}'); } catch (_) { return {}; } })()
        }))
      });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'send-preview' && method === 'GET') {
      const row = await one(db, 'SELECT * FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!row) return json({ error: 'Proposal not found' }, 404);
      let form = {};
      try { form = JSON.parse(row.form_json || '{}'); } catch (_) {}
      const versions = await all(
        db,
        'SELECT * FROM proposal_versions WHERE proposal_id = ? AND ' + OWN_SCOPE + ' ORDER BY created_at DESC',
        row.id, scope, user.id
      );
      const links = await all(
        db,
        'SELECT * FROM access_tokens WHERE proposal_id = ? AND ' + OWN_SCOPE,
        row.id, scope, user.id
      );
      const active = links.filter(tokenIsActive);
      return json({
        proposal: proposalSummary(row),
        hasPublishedVersion: !!versions[0],
        latestVersion: versions[0] ? publicVersion(versions[0]) : null,
        hasActiveLink: active.length > 0,
        needsNewLinkForUrl: true,
        defaultRecipientName: row.customer_name || form.custName || '',
        defaultWhatsApp: form.custPhone || form.customerPhone || '',
        defaultEmail: form.custEmail || form.customerEmail || '',
        companyWhatsApp: form.companyPhone || '',
        channels: Object.keys(SEND_CHANNELS).map((id) => ({
          id,
          label: SEND_CHANNELS[id].label,
          provider: SEND_CHANNELS[id].provider,
          recordsAs: 'draft',
          deliveryVerified: false
        })),
        honestyNote: 'Preparing a message does not mark it shared. A WhatsApp, email or copy action records only that you started sharing; delivery is unconfirmed.'
      });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'sends' && method === 'GET') {
      const row = await one(db, 'SELECT id FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!row) return json({ error: 'Proposal not found' }, 404);
      const list = await all(
        db,
        'SELECT * FROM sends WHERE proposal_id = ? AND ' + OWN_SCOPE + ' ORDER BY created_at DESC',
        parts[1], scope, user.id
      );
      return json({ sends: list.map(publicSend) });
    }

    if (parts[0] === 'sends' && parts.length === 1 && method === 'GET') {
      const list = await all(
        db,
        'SELECT * FROM sends WHERE ' + OWN_SCOPE + ' ORDER BY created_at DESC LIMIT 100',
        scope, user.id
      );
      return json({ sends: list.map(publicSend) });
    }

    if (parts[0] === 'proposals' && parts[1] && parts[2] === 'sends' && method === 'POST') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot prepare sends.' }, 403);
      const row = await one(db, 'SELECT * FROM proposals WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!row) return json({ error: 'Proposal not found' }, 404);
      const body = await readBody(request);
      const channel = String(body.channel || 'whatsapp_manual');
      if (!SEND_CHANNELS[channel]) return json({ error: 'Unsupported send channel' }, 400);
      const recipientTo = String(body.recipientTo || '').trim().slice(0, 200);
      const recipientName = String(body.recipientName || row.customer_name || '').trim().slice(0, 200);
      const waDigits = channel === 'whatsapp_manual' ? digitsForWhatsApp(recipientTo) : '';
      if (channel === 'whatsapp_manual' && !waDigits) {
        return json({ error: 'Enter a valid WhatsApp mobile number with country code (for example +91 98765 43210).' }, 400);
      }
      if (channel === 'email_manual' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientTo)) {
        return json({ error: 'Enter a valid email address.' }, 400);
      }

      let version = null;
      if (body.versionId) {
        version = await one(
          db,
          'SELECT * FROM proposal_versions WHERE id = ? AND proposal_id = ? AND ' + OWN_SCOPE,
          body.versionId, row.id, scope, user.id
        );
      } else {
        version = await one(
          db,
          'SELECT * FROM proposal_versions WHERE proposal_id = ? AND ' + OWN_SCOPE + ' ORDER BY created_at DESC LIMIT 1',
          row.id, scope, user.id
        );
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
        await run(
          db,
          `INSERT INTO proposal_versions (
            id, proposal_id, owner_id, version_label, snapshot_json, snapshot_sha256,
            pdf_sha256, pdf_path, note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          version.id, version.proposal_id, version.owner_id, version.version_label,
          version.snapshot_json, version.snapshot_sha256, version.pdf_sha256,
          version.pdf_path, version.note, version.created_at
        );
        await recordEvent(db, {
          version_id: version.id,
          proposal_id: row.id,
          owner_id: user.id,
          event_type: 'version_published',
          meta: { snapshotSha256: version.snapshot_sha256, via: 'send' }
        });
      }

      const rawToken = randomBytes(24).toString('hex');
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
      await run(
        db,
        `INSERT INTO access_tokens (
          id, token_hash, version_id, proposal_id, owner_id, label, expires_at,
          revoked_at, created_at, first_opened_at, last_opened_at, open_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, NULL, 0)`,
        tokenRow.id, tokenRow.token_hash, tokenRow.version_id, tokenRow.proposal_id,
        tokenRow.owner_id, tokenRow.label, tokenRow.expires_at, tokenRow.created_at
      );

      const portalUrl = publicAppOrigin(env, url) + '/portal.html?t=' + encodeURIComponent(rawToken);
      const messageBody = messageWithPortalLink(body.messageBody || body.message, row, portalUrl);
      const sendRow = {
        id: uid('snd'),
        proposal_id: row.id,
        version_id: version.id,
        token_id: tokenRow.id,
        owner_id: user.id,
        channel,
        state: 'draft',
        recipient_name: recipientName,
        recipient_to: recipientTo,
        message_body: messageBody,
        portal_url: portalUrl,
        provider: 'manual',
        provider_message_id: null,
        note: String(body.note || '').slice(0, 500),
        created_at: nowISO(),
        updated_at: nowISO(),
        share_clicked_at: null,
        submitted_at: null,
        delivered_at: null
      };
      await run(
        db,
        `INSERT INTO sends (
          id, proposal_id, version_id, token_id, owner_id, channel, state,
          recipient_name, recipient_to, message_body, portal_url, provider,
          provider_message_id, note, created_at, updated_at, share_clicked_at,
          submitted_at, delivered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL)`,
        sendRow.id, sendRow.proposal_id, sendRow.version_id, sendRow.token_id, sendRow.owner_id,
        sendRow.channel, sendRow.state, sendRow.recipient_name, sendRow.recipient_to,
        sendRow.message_body, sendRow.portal_url, sendRow.provider, sendRow.note,
        sendRow.created_at, sendRow.updated_at, sendRow.share_clicked_at
      );
      await recordEvent(db, {
        token_id: tokenRow.id,
        version_id: version.id,
        proposal_id: row.id,
        owner_id: user.id,
        event_type: 'send_drafted',
        meta: { channel, sendId: sendRow.id }
      });
      const wa = channel === 'whatsapp_manual'
        ? 'https://wa.me/' + waDigits + '?text=' + encodeURIComponent(messageBody)
        : null;
      const mailto = channel === 'email_manual'
        ? 'mailto:' + encodeURIComponent(recipientTo) +
          '?subject=' + encodeURIComponent(
            (row.ref ? row.ref + ' — ' : '') + 'Your solar proposal'
          ) +
          '&body=' + encodeURIComponent(messageBody)
        : null;
      const launch = {
        whatsappUrl: wa,
        mailtoUrl: mailto,
        copyText: channel === 'copy_link' ? portalUrl : messageBody,
        portalUrl,
        honesty: 'The share action is not started yet. Launching WhatsApp/email or copying the message records only that action, not delivery.'
      };
      return json({
        send: publicSend(sendRow),
        access: publicToken(tokenRow, rawToken),
        version: publicVersion(version),
        launch
      }, 201);
    }

    if (parts[0] === 'sends' && parts[1] && parts[2] === 'state' && method === 'POST') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot update sends.' }, 403);
      const sendRow = await one(db, 'SELECT * FROM sends WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!sendRow) return json({ error: 'Send record not found' }, 404);
      const body = await readBody(request);
      const state = String(body.state || '');
      /* Manual channels cannot claim provider delivery. A send remains a draft
         until the user actually launches a channel or copies the message. */
      if (sendRow.provider === 'manual' && (state === 'delivered' || state === 'submitted_to_provider')) {
        return json({
          error: 'Manual channels cannot be marked delivered. That state is reserved for provider-confirmed webhooks (not enabled yet).',
          code: 'DELIVERY_NOT_AVAILABLE'
        }, 400);
      }
      if (sendRow.provider === 'manual' && !['draft', 'share_clicked', 'cancelled', 'failed'].includes(state)) {
        return json({ error: 'Unsupported state for this send' }, 400);
      }
      if (sendRow.provider !== 'manual' && !SEND_STATES[state]) {
        return json({ error: 'Unknown state' }, 400);
      }
      const updatedAt = nowISO();
      const shareClickedAt = state === 'share_clicked'
        ? (sendRow.share_clicked_at || updatedAt) : (sendRow.share_clicked_at || null);
      const submittedAt = state === 'submitted_to_provider'
        ? (sendRow.submitted_at || updatedAt) : (sendRow.submitted_at || null);
      const deliveredAt = state === 'delivered'
        ? (sendRow.delivered_at || updatedAt) : (sendRow.delivered_at || null);
      await run(
        db,
        `UPDATE sends SET state=?, note=COALESCE(?, note), updated_at=?,
          share_clicked_at=?, submitted_at=?, delivered_at=? WHERE id=?`,
        state,
        body.note != null ? String(body.note).slice(0, 500) : null,
        updatedAt, shareClickedAt, submittedAt, deliveredAt, sendRow.id
      );
      if (state === 'share_clicked' && !sendRow.share_clicked_at) {
        const proposal = await one(
          db,
          'SELECT * FROM proposals WHERE id = ? AND ' + OWN_SCOPE,
          sendRow.proposal_id, scope, user.id
        );
        if (proposal && ['draft', 'ready', 'internal_review'].includes(proposal.status)) {
          await run(
            db,
            "UPDATE proposals SET status='sent', sent_at=COALESCE(sent_at, ?), updated_at=?, revision=COALESCE(revision, 1)+1 WHERE id=?",
            updatedAt, updatedAt, proposal.id
          );
        }
      }
      await recordEvent(db, {
        token_id: sendRow.token_id,
        version_id: sendRow.version_id,
        proposal_id: sendRow.proposal_id,
        owner_id: user.id,
        event_type: 'send_state_' + state,
        meta: { sendId: sendRow.id, channel: sendRow.channel }
      });
      const next = await one(db, 'SELECT * FROM sends WHERE id = ?', sendRow.id);
      return json({ send: publicSend(next) });
    }

    if (parts[0] === 'notifications' && parts.length === 1 && method === 'GET') {
      const unreadOnly = url.searchParams.get('unread') === '1';
      let list;
      if (unreadOnly) {
        list = await all(
          db,
          'SELECT * FROM notifications WHERE ' + OWN_SCOPE + ' AND read_at IS NULL ORDER BY created_at DESC LIMIT 100',
          scope, user.id
        );
      } else {
        list = await all(
          db,
          'SELECT * FROM notifications WHERE ' + OWN_SCOPE + ' ORDER BY created_at DESC LIMIT 100',
          scope, user.id
        );
      }
      const unreadRow = await one(
        db,
        'SELECT COUNT(*) AS c FROM notifications WHERE ' + OWN_SCOPE + ' AND read_at IS NULL',
        scope, user.id
      );
      return json({
        notifications: list.map(publicNotification),
        unread: Number(unreadRow && unreadRow.c) || 0
      });
    }

    if (parts[0] === 'notifications' && parts[1] === 'read-all' && method === 'POST') {
      await run(
        db,
        'UPDATE notifications SET read_at = ? WHERE ' + OWN_SCOPE + ' AND read_at IS NULL',
        nowISO(), scope, user.id
      );
      return json({ ok: true });
    }

    if (parts[0] === 'notifications' && parts[1] && parts[2] === 'read' && method === 'POST') {
      await run(
        db,
        'UPDATE notifications SET read_at = ? WHERE id = ? AND ' + OWN_SCOPE,
        nowISO(), parts[1], scope, user.id
      );
      return json({ ok: true });
    }

    if (parts[0] === 'activity' && method === 'GET') {
      const list = await all(
        db,
        'SELECT * FROM portal_events WHERE ' + OWN_SCOPE + ' ORDER BY created_at DESC LIMIT 100',
        scope, user.id
      );
      return json({
        events: list.map((e) => ({
          id: e.id,
          type: e.event_type,
          proposalId: e.proposal_id,
          createdAt: e.created_at,
          meta: (() => { try { return JSON.parse(e.meta_json || '{}'); } catch (_) { return {}; } })()
        }))
      });
    }

    if (parts[0] === 'tasks' && parts.length === 1 && method === 'GET') {
      const status = url.searchParams.get('status');
      let list;
      if (status) {
        list = await all(
          db,
          'SELECT * FROM tasks WHERE ' + OWN_SCOPE + ' AND status = ? ORDER BY due_at IS NULL, due_at ASC, created_at DESC',
          scope,
          user.id, status
        );
      } else {
        list = await all(
          db,
          'SELECT * FROM tasks WHERE ' + OWN_SCOPE + ' ORDER BY due_at IS NULL, due_at ASC, created_at DESC',
          scope, user.id
        );
      }
      return json({ tasks: list.map(publicTask) });
    }

    if (parts[0] === 'tasks' && parts.length === 1 && method === 'POST') {
      if (!canWrite) return json({ error: 'Your role can view tasks but cannot create them.' }, 403);
      const body = await readBody(request);
      const title = String(body.title || '').trim();
      if (!title) return json({ error: 'Task title is required' }, 400);
      let dueAt = null;
      if (body.dueAt) {
        const t = Date.parse(body.dueAt);
        if (!Number.isFinite(t)) return json({ error: 'Invalid due date' }, 400);
        dueAt = new Date(t).toISOString();
      } else if (body.dueInDays != null) {
        const d = Number(body.dueInDays);
        if (!Number.isFinite(d) || d < 0) return json({ error: 'Invalid dueInDays' }, 400);
        dueAt = new Date(Date.now() + d * 864e5).toISOString();
      }
      if (body.proposalId) {
        const linked = await one(db, 'SELECT id FROM proposals WHERE id = ? AND ' + OWN_SCOPE, body.proposalId, scope, user.id);
        if (!linked) return json({ error: 'Proposal not found for this task' }, 404);
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
      await run(
        db,
        `INSERT INTO tasks (
          id, owner_id, proposal_id, title, notes, due_at, status, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        task.id, task.owner_id, task.proposal_id, task.title, task.notes, task.due_at,
        task.status, task.created_at, task.updated_at
      );
      return json({ task: publicTask(task) }, 201);
    }

    if (parts[0] === 'tasks' && parts[1] && parts.length === 2 && method === 'PUT') {
      if (!canWrite) return json({ error: 'Your role can view tasks but cannot edit them.' }, 403);
      const task = await one(db, 'SELECT * FROM tasks WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!task) return json({ error: 'Task not found' }, 404);
      const body = await readBody(request);
      let title = task.title;
      let notes = task.notes;
      let dueAt = task.due_at;
      let proposalId = task.proposal_id || null;
      let status = task.status;
      let completedAt = task.completed_at;
      if (body.title != null) {
        title = String(body.title).trim().slice(0, 200);
        if (!title) return json({ error: 'Task title cannot be empty' }, 400);
      }
      if (body.notes != null) notes = String(body.notes).slice(0, 2000);
      if (body.proposalId !== undefined) {
        proposalId = body.proposalId == null ? '' : String(body.proposalId).trim();
        const existingProposalId = task.proposal_id == null ? '' : String(task.proposal_id);
        if (proposalId && proposalId !== existingProposalId) {
          const linked = await one(db, 'SELECT id FROM proposals WHERE id = ? AND ' + OWN_SCOPE, proposalId, scope, user.id);
          if (!linked) return json({ error: 'Proposal not found for this task' }, 404);
        } else if (!proposalId) {
          proposalId = null;
        }
      }
      if (body.dueAt !== undefined) {
        if (body.dueAt === null || body.dueAt === '') dueAt = null;
        else {
          const t = Date.parse(body.dueAt);
          if (!Number.isFinite(t)) return json({ error: 'Invalid due date' }, 400);
          dueAt = new Date(t).toISOString();
        }
      }
      if (body.status) {
        if (!['open', 'done', 'cancelled'].includes(body.status)) {
          return json({ error: 'Invalid task status' }, 400);
        }
        status = body.status;
        if (body.status === 'done') completedAt = nowISO();
        if (body.status === 'open') completedAt = null;
      }
      await run(
        db,
        `UPDATE tasks SET title=?, notes=?, due_at=?, proposal_id=?, status=?, completed_at=?, updated_at=?
         WHERE id=? AND ` + OWN_SCOPE,
        title, notes, dueAt, proposalId, status, completedAt, nowISO(), task.id, scope, user.id
      );
      const next = await one(db, 'SELECT * FROM tasks WHERE id = ?', task.id);
      return json({ task: publicTask(next) });
    }

    if (parts[0] === 'tasks' && parts[1] && parts.length === 2 && method === 'DELETE') {
      if (!canWrite) return json({ error: 'Your role can view tasks but cannot delete them.' }, 403);
      const r = await run(db, 'DELETE FROM tasks WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!r.meta || r.meta.changes === 0) return json({ error: 'Task not found' }, 404);
      return json({ ok: true });
    }

    if (parts[0] === 'reports' && parts[1] === 'summary' && method === 'GET') {
      const mine = await all(db, 'SELECT * FROM proposals WHERE ' + OWN_SCOPE, scope, user.id);
      const byStatus = {};
      let quotedKnown = 0, quotedSum = 0, quotedMissing = 0;
      mine.forEach((p) => {
        const s = p.status || 'draft';
        byStatus[s] = (byStatus[s] || 0) + 1;
        const v = proposalQuotedValue(p);
        if (v != null) { quotedKnown += 1; quotedSum += v; }
        else quotedMissing += 1;
      });
      const mySends = await all(db, 'SELECT * FROM sends WHERE ' + OWN_SCOPE, scope, user.id);
      const myEvents = await all(db, 'SELECT * FROM portal_events WHERE ' + OWN_SCOPE, scope, user.id);
      const opens = myEvents.filter((e) => e.event_type === 'link_opened').length;
      const prefetches = myEvents.filter((e) => e.event_type === 'suspected_prefetch').length;
      const surveys = myEvents.filter((e) => e.event_type === 'survey_requested').length;
      const pdfs = myEvents.filter((e) => e.event_type === 'pdf_download_requested').length;
      const shareClicks = mySends.filter((s) => s.state === 'share_clicked' || s.share_clicked_at).length;
      const published = await one(
        db,
        'SELECT COUNT(*) AS c FROM proposal_versions WHERE ' + OWN_SCOPE,
        scope, user.id
      );
      const tokens = await all(db, 'SELECT * FROM access_tokens WHERE ' + OWN_SCOPE, scope, user.id);
      const activeLinks = tokens.filter(tokenIsActive).length;
      const openTasks = await all(
        db,
        "SELECT * FROM tasks WHERE " + OWN_SCOPE + " AND status = 'open'",
        scope, user.id
      );
      const overdueTasks = openTasks.filter((t) => t.due_at && Date.parse(t.due_at) < Date.now()).length;
      return json({
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
          versionsPublished: Number(published && published.c) || 0,
          activeCustomerLinks: activeLinks,
          shareClicksRecorded: shareClicks,
          linkOpens: opens,
          suspectedPrefetches: prefetches,
          pdfDownloadRequests: pdfs,
          surveyRequests: surveys,
          note: 'Opens and survey requests come from the customer portal. Share clicks are manual send starts, not provider delivery.'
        },
        followUps: { openTasks: openTasks.length, overdueTasks },
        honesty: [
          'No provider-confirmed email/WhatsApp delivery counts are included.',
          'Prefetch / link-unfurl bots are listed separately from human opens.',
          'Accepted / rejected statuses are staff-marked unless a future verified workflow is added.'
        ]
      });
    }

    if (parts[0] === 'team' && parts[1] === 'members' && method === 'GET') {
      /* Every signed-in member may READ the team panel; only an owner or the
         designated admin may change anything (POST /api/team/role keeps its own
         gate) and only they receive contact detail. `canManageTeam` tells the
         front end which of the two to render. */
      /* Last login comes from the sessions table (most recent session issued),
         falling back to account creation when no session row survives. */
      const members = await all(
        db,
        `SELECT u.*, (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_login
         FROM users u ORDER BY u.created_at ASC`
      );
      return json({
        /* S2: only the actor's own row carries an elevation field. */
        members: members.map((u) => (u.id === user.id
          ? selfMemberPayload(u, env, u.last_login)
          : memberPayload(u, env, u.last_login, { contact: canAdmin }))),
        canManageTeam: canAdmin,
        roles: [
          { id: 'owner', label: 'Owner', canWrite: true, canManageTeam: true },
          { id: 'sales', label: 'Sales', canWrite: true, canManageTeam: false },
          { id: 'viewer', label: 'Viewer', canWrite: false, canManageTeam: false },
          /* A custom entry is sales-level write access plus whatever title the
             member typed. Titles are unrestricted — the power badge above is
             the truth, so no blocklist is needed or wanted. */
          { id: 'custom', label: 'Custom title', canWrite: true, canManageTeam: false, acceptsTitle: true },
        ]
      });
    }

    if (parts[0] === 'team' && parts[1] === 'role' && method === 'POST') {
      if (!canAdmin) return json({ error: 'Only the workspace owner can change roles.' }, 403);
      const body = await readBody(request);
      const targetId = String(body.userId || '');
      const wanted = String(body.role || '').trim().toLowerCase();
      const target = await one(db, 'SELECT * FROM users WHERE id = ?', targetId);
      if (!target) return json({ error: 'User not found' }, 404);

      const actorIsAdmin = canElevate(user, env);
      const targetElevated = isAdminRow(target);

      /* An elevated row is out of reach for everyone except the designated
         admin. The refusal is deliberately INDISTINGUISHABLE from any other
         "you may not do this": same status, message and code, so it never
         reveals WHICH row is elevated. */
      if (targetElevated && !actorIsAdmin) {
        return json({ error: 'Ask admin', code: 'ELEVATION_FORBIDDEN' }, 403);
      }

      /* The typed title, whether it arrived as roleCustom or title. */
      const rawTitle = (body.roleCustom != null && body.roleCustom !== '')
        ? String(body.roleCustom)
        : (body.title != null && body.title !== '') ? String(body.title) : null;

      /* ---- ELEVATION by typing "admin" ----
         Self-service for the designated ADMIN_EMAIL login ONLY, and only on its
         own row. There is no "Admin" dropdown and no role value: the actor
         types admin / Admin / ADMIN into the custom-title box, and that is the
         trigger. For anyone else the same word is a harmless custom title with
         sales power (C6: a title never grants access), so this branch is
         skipped and the word falls through to normal parsing. */
      const typedAdmin = rawTitle != null && rawTitle.trim().toLowerCase() === 'admin';
      if ((typedAdmin || wanted === 'admin') && actorIsAdmin) {
        if (target.id !== user.id) {
          return json({ error: 'Ask admin', code: 'ELEVATION_NOT_SELF' }, 403);
        }
        /* Display is untouched: role and role_custom keep their values, so no
           chip, name-plate, badge or typed title moves. Re-typing "admin" is
           idempotent — it stays ON, it is not a toggle. */
        await run(db, 'UPDATE users SET is_admin = 1, updated_at = ? WHERE id = ?', nowISO(), target.id);
        target.is_admin = 1;
        return json({
          member: selfMemberPayload(target, env),
          note: 'Saved. Nothing about how this account is displayed has changed.'
        });
      }

      /* A role may arrive as a power key (owner / sales / viewer) or as a typed
         title. An explicit title is parsed as a title and never mapped onto a
         power keyword, EXCEPT the boss case: role 'owner' WITH a title keeps
         owner power and stores the title as the chip (powers = Owner, chip =
         the title). */
      const wantsCustom = wanted === 'custom';
      const wantsOwner = wanted === 'owner';
      let parsed;
      if (rawTitle != null) {
        const t = parseRoleTitle(rawTitle);
        if (t.error) return json({ error: t.error }, 400);
        parsed = wantsOwner ? { role: 'owner', roleCustom: t.roleCustom } : t;
      } else if (wantsCustom) {
        parsed = { error: 'Choose a power level, or send a title to show.' };
      } else {
        parsed = parseSignupRole(body.role);
      }
      if (parsed.error) return json({ error: parsed.error }, 400);

      /* Self-demotion. Allowed whenever a backstop exists: the OWNER_EMAIL
         bootstrap always restores the company owner, so the workspace can never
         be left without one. The designated admin and any elevated row are
         exempt (their reach is not in this column). Only when there is no
         OWNER_EMAIL backstop AND no other owner do we refuse, to avoid a genuine
         lockout. */
      if (target.id === user.id && parsed.role !== 'owner' && !actorIsAdmin && !targetElevated) {
        if (!ownerEmail(env)) {
          const otherOwners = await all(db, "SELECT id FROM users WHERE id != ? AND role = 'owner'", user.id);
          if (!otherOwners.length) {
            return json({ error: 'Promote another owner before changing your own role away from owner.' }, 400);
          }
        }
      }

      /* R2 OFF-switch: the designated admin setting its OWN role to anything
         other than "admin" de-elevates (is_admin = 0). is_admin is written only
         when there is something to clear, so an ordinary role change never
         touches the column and keeps working before the migration is applied. */
      const clearingElevation = target.id === user.id && actorIsAdmin && targetElevated;
      if (clearingElevation) {
        await run(
          db,
          'UPDATE users SET role = ?, role_custom = ?, is_admin = 0, updated_at = ? WHERE id = ?',
          parsed.role, parsed.roleCustom, nowISO(), target.id
        );
        target.is_admin = 0;
      } else {
        await run(
          db,
          'UPDATE users SET role = ?, role_custom = ?, updated_at = ? WHERE id = ?',
          parsed.role, parsed.roleCustom, nowISO(), target.id
        );
      }
      target.role = parsed.role;
      target.role_custom = parsed.roleCustom;
      /* Honest note, not a block: the OWNER_EMAIL bootstrap is unconditional, so
         a demotion of that mailbox is restored (role only, title kept) next. */
      const note = normalizeEmail(target.email) === ownerEmail(env) && parsed.role !== 'owner'
        ? 'This mailbox is the workspace OWNER_EMAIL, so it is restored to Owner on its next sign-in (its display title is kept). To make the change stick, remove or change OWNER_EMAIL in the Worker variables.'
        : null;
      const outMember = (target.id === user.id) ? selfMemberPayload(target, env) : memberPayload(target, env);
      return json({ member: outMember, note });
    }

    return json({ error: 'Unknown API route' }, 404);
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    return json({ error: (err && err.message) || 'Server error' }, status);
  }
}

/* ---------- fetch handler ---------- */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      const origin = request.headers.get('Origin') || '';
      const headers = {
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-QS-Session',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin'
      };
      if (origin) {
        try {
          const o = new URL(origin);
          if (o.host === url.host || o.host.toLowerCase() === allowedAppHost(env)) {
            headers['Access-Control-Allow-Origin'] = origin;
            headers['Access-Control-Allow-Credentials'] = 'true';
          }
        } catch (_) {}
      }
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleApi(request, env, url);
    }

    /* Static assets from Workers Assets (./public via wrangler [assets]).
       Pass-through (no path rewrite): Assets resolves '/' to index.html
       itself. Rewriting '/' -> '/index.html' causes ERR_TOO_MANY_REDIRECTS
       because Assets canonicalizes /index.html back to '/'. Same-origin
       asset redirects are followed server-side so browsers never loop. */
    const assets = getAssets(env);
    if (assets) {
      const get = (pathname) => (pathname === url.pathname)
        ? assets.fetch(request)
        : assets.fetch(new Request(new URL(pathname, url.origin).toString(), { headers: request.headers }));
      const follow = async (res) => {
        for (let i = 0; i < 3 && res && res.status >= 300 && res.status < 400; i++) {
          const loc = res.headers.get('Location');
          if (!loc) break;
          const next = new URL(loc, url.origin);
          if (next.origin !== url.origin) break;
          res = await assets.fetch(new Request(next.toString(), { headers: request.headers }));
        }
        return res;
      };
      let path = url.pathname;
      if (path === '/dashboard') path = '/dashboard.html';
      let res = await follow(await get(path));
      if (res.status === 404 && path === '/') {
        res = await follow(await get('/index.html'));
      }
      if (res.status === 404) {
        return new Response(
          '<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem;background:#111;color:#eee">' +
          '<h1>File not in ASSETS</h1>' +
          '<p>Path: <code>' + path.replace(/</g, '') + '</code></p>' +
          '<p>Run on your laptop:</p>' +
          '<pre style="background:#222;padding:1rem;border-radius:8px">cd platform/cloudflare\nnpm run deploy</pre>' +
          '<p>That syncs HTML/CSS/JS into <code>./public</code> and uploads ASSETS.</p>' +
          '<p><a href="/api/health" style="color:#F2811D">/api/health</a></p>' +
          '</body></html>',
          { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
        );
      }
      return res;
    }

    return new Response(
      '<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem;background:#111;color:#eee">' +
      '<h1>ASSETS binding missing</h1>' +
      '<p>Worker is live, but static files were not uploaded.</p>' +
      '<pre style="background:#222;padding:1rem;border-radius:8px">cd Quotation-Studio/platform/cloudflare\ngit pull\nnpm install\nnpm run deploy</pre>' +
      '<p>Bindings seen: <code>' + bindingNames(env).join(', ') + '</code></p>' +
      '<p><a href="/api/health" style="color:#F2811D">/api/health</a></p>' +
      '</body></html>',
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }
};
