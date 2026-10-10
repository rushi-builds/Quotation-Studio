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
/* Outbound SMTP for password recovery. Port 25 is blocked by the platform;
   Gmail submission uses 465 with implicit TLS, which is supported here.
   The socket module is pulled in LAZILY inside smtpSend() rather than here:
   `cloudflare:sockets` exists only inside a Worker, and three of the test
   suites import this file directly under plain Node — a static import would
   make every one of them throw at load time, before a single assertion ran. */

const SESSION_DAYS = 30;
/* "Remember me" is OFF by default (owner decision, 2026-10-10): the sign-in
   then returns a session cookie with NO Max-Age, so the browser drops it when
   it closes, and the server-side session row is capped at 12 hours as defence
   in depth. Ticking the box restores the 30-day behaviour. */
const SESSION_HOURS_SHORT = 12;
/* --- Password recovery (owner decision, 2026-10-10) -----------------------
   The fail-closed gate is lifted now that a verified delivery channel exists:
   outbound SMTP over cloudflare:sockets, sending as the company mailbox so the
   From address is one Google actually owns (a relay cannot send AS a gmail.com
   address — SPF would not align and Google would reject or spam it).

   OTP_TTL_MS   how long a code lives.
   OTP_MAX_RESENDS  resends allowed after the first code (1 + 3 = 4 emails).
   OTP_RESEND_COOLDOWN_MS  minimum gap the client must wait between resends.
   OTP_MAX_ATTEMPTS  wrong guesses against ONE code before it is voided.
                     A 6-digit code is 1e6 combinations; without this a caller
                     could grind through them inside the window.
   RECOVERY_*    limits on the endpoints themselves (anti mail-bombing). */
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_RESENDS = 3;
const OTP_RESEND_COOLDOWN_MS = 45 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RECOVERY_PER_EMAIL_MAX = 3;
const RECOVERY_PER_EMAIL_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_PER_IP_MAX = 20;
const RECOVERY_PER_IP_WINDOW_MS = 15 * 60 * 1000;
/* The company mailbox. SMTP_USER overrides it; this is the default so a
   deployment that has only set the password still sends from the right place. */
const RECOVERY_MAIL_FROM = 'ktmenergyexperts@gmail.com';
/* Subject and brand. The product is wider than the quotation builder, so the
   email carries the studio name, not just "Quotation Studio". */
const RECOVERY_MAIL_SUBJECT = 'KTM Studio — password reset code';
const COOKIE = 'qs_session';
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/* Deployed code marker. /api/health reports it so an operator can prove the
   running Worker is actually the build that contains the role changes,
   instead of inferring it from behaviour. Bump on every behaviour change. */
const CODE_VERSION = 'roles-r1';

const SEND_CHANNELS = {
  whatsapp_manual: true,
  email_manual: true,
  copy_link: true,
  other: true
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
function crossSiteBlocked(request, url) {
  const claimed = String(
    request.headers.get('Origin') || request.headers.get('Referer') || ''
  ).trim();
  if (!claimed) return false;
  try {
    return new URL(claimed).host.toLowerCase() !== url.host.toLowerCase();
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
    'SameSite=' + (isHttps ? 'None' : 'Lax')
  ];
  /* maxAgeSec === null means "session cookie": no Max-Age, so the browser
     discards it when it closes. That is what makes "Remember me" being OFF
     mean anything. 0 is still emitted — logout relies on it to clear. */
  if (maxAgeSec !== null && maxAgeSec !== undefined) parts.push('Max-Age=' + String(maxAgeSec));
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}
function authHeaders(token, request, remember) {
  /* remember === true → 30-day cookie. Anything else → a session cookie (no
     Max-Age) that the browser discards when it closes. */
  return {
    'Set-Cookie': sessionCookie(token, remember ? SESSION_DAYS * 86400 : null, request)
  };
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
  /* Mixed characters (owner request, 2026-10-10): at least TWO of lowercase /
     uppercase / digits / symbols. Two, not three — the policy applies only to
     passwords being SET (sign-up and change-password), never to sign-in, so no
     existing account can be locked out by it. */
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  if (classes < 2) return 'Password must mix at least two of: lowercase, uppercase, digits, symbols.';
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
  const r = String(u.role || '').toLowerCase();
  /* The typed title is the LABEL only where a title is a real thing: owner and
     custom. A Sales / Engineer row still keeps its wording in role_custom — so
     it is shown as the job title and returns the moment the member comes back
     to a titleable role — but it is labelled by its power, like every other
     row. */
  if (u.role_custom && (r === 'owner' || r === 'custom')) return String(u.role_custom);
  if (r === 'owner') return 'Owner';
  if (r === 'sales') return 'Sales';
  if (r === 'viewer') return 'Viewer';
  return u.role || '';
}
function publicUser(u, env) {
  const admin = canManageTeam(u, env);
  /* The red-dot flag is the STORED elevation ONLY. The designated mailbox is
     not elevated by virtue of its address — the address only decides who MAY
     type "admin" (canElevate) — so the dot appears once, and only once, admin
     has actually been set. */
  const elevated = isAdminRow(u);
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
       (typing "admin"). It drives the small red dot beside their own role.
       Both fields read the STORED flag; the ADMIN_EMAIL address decides only
       WHO may type that word, never who holds rank. Self-only: publicUser is
       the /me shape. */
    elevated: isAdminRow(u),
    canElevate: canElevate(u, env),
    /* Contact number and the profile-nudge flag. Self-only by construction:
       publicUser is what GET /api/auth/me returns about the actor. */
    phone: u.phone || '',
    instagram: u.instagram_url || '',
    linkedin: u.linkedin_url || '',
    custom: u.custom_url || '',
    profileDone: Number(u.profile_done || 0) === 1,
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
       field is omitted rather than blanked, so there is nothing to unhide.
       The contact number rides the exact same opt-in, so the two can never
       drift apart: whoever may see the address may see the number. */
    ...(o.contact ? { email: u.email } : {}),
    ...(o.contact ? { phone: u.phone || '' } : {}),
    /* Profile links and kudos are TEAM-visible by design: a social profile is
       public anyway and the point of the card is being able to reach the
       person. `likedByMe` is the caller's own vote only, and the pair confers
       nothing — it is a count of clicks, never a permission. */
    instagram: u.instagram_url || '',
    linkedin: u.linkedin_url || '',
    custom: u.custom_url || '',
    likes: Number(o.likes || 0),
    likedByMe: !!o.likedByMe,
    role: u.role,
    roleCustom: u.role_custom || null,
    /* Typed title. Elevation leaves it alone, so this string is identical
       before and after an elevation. */
    roleLabel: roleDisplay(u),
    power: stored,
    canWrite: roleRank(stored) >= roleRank('sales'),
    canManageTeam: roleRank(stored) >= roleRank('owner'),
    /* Sign-in times answer "when was this person last active", which is an
       owner/admin question. They are OMITTED for everyone else — the same
       move as S2, so a row carries no date to unhide. `login` is still
       computed above so the creation-time fallback stays in one place. The
       team list passes `signin` from the CALLER's manage flag; the
       role-change route passes true because its gate is already owner/admin. */
    ...(o.signin ? { lastLogin: login } : {}),
    ...(o.signin ? { lastLoginLabel: login ? new Date(login).toISOString() : null } : {}),
    ...(o.signin ? { createdAt: u.created_at } : {})
  };
}
/* The actor's OWN row: the same payload plus what only they may know about
   themselves. GET /api/auth/me is already self-only, so this discloses nothing
   new. The effective flags are named apart from the stored-role ones: a
   viewer-level elevated account reads canWrite false (badge) and
   effectiveCanWrite true (what it may actually do). */
function selfMemberPayload(u, env, lastLogin, opts) {
  /* Own row: always allowed its own contact detail AND its own sign-in times —
     an account may always read when IT last signed in. The team list keeps
     this default for the caller's own row and overrides `signin` with the
     manage flag for everyone else's. */
  return Object.assign(memberPayload(u, env, lastLogin, Object.assign({ contact: true, signin: true }, opts || {})), {
    isAdmin: isAdminRow(u),
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
   POWER follows the ROLE: an elevated row (one that typed "admin") or a stored
   Owner. The ADMIN_EMAIL address itself grants NOTHING — it only decides who
   MAY type "admin" (see canElevate), so signing in with that mailbox leaves
   you at your stored rank until you do. */
function permissionRole(user, env) {
  if (isAdminRow(user)) return 'admin';
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
   members stay scoped to their own owner_id exactly as before. VISIBILITY IS
   NOT POWER — the designated mailbox keeps reading this workspace's rows, but
   team edit/delete comes from permissionRole, i.e. from the ROLE. */
function seesAll(user, env) {
  return requireRole(user, 'owner', env) || isHiddenAdmin(user, env);
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
    version: v.version_label,
    sha256: v.snapshot_sha256,
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
    state: s.state,
    recipientName: s.recipient_name || '',
    recipientTo: s.recipient_to || '',
    messageBody: s.message_body || '',
    portalUrl: s.portal_url || '',
    provider: s.provider || 'manual',
    note: s.note || '',
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    shareClickedAt: s.share_clicked_at || null
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
  const form = (() => { try { return JSON.parse(row.form_json || '{}'); } catch (_) { return {}; } })();
  const cust = row.customer_name || form.custName || 'there';
  const cap = row.capacity || form.capacity || '';
  return [
    'Hello ' + cust + ',',
    '',
    'Please review your solar proposal' + (cap ? (' (' + cap + ' kWp)') : '') + ' here:',
    portalUrl,
    '',
    'This link opens a read-only customer view. Reply if you have questions.',
    '',
    '— KTM Solar'
  ].join('\n');
}
function digitsForWhatsApp(value) {
  const d = String(value || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return '91' + d;
  return d;
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
async function createSession(db, user, ttlMs) {
  /* ttlMs is the server-side life of the session. The sign-in route passes the
     30-day value when "Remember me" is ticked and SESSION_HOURS_SHORT otherwise;
     callers with no such control keep the long default. */
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : SESSION_DAYS * 864e5;
  const token = randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + ttl).toISOString();
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

/* Password recovery has its OWN budget. Reusing the sign-in throttle would be
   wrong on both counts: a recovery REQUEST is not a failure, so counting it in
   `fails` would lock the address out for legitimate use, and a failed CODE check
   would be a recovery concern, not a sign-in one. Same table, different scopes
   (`recovery:*` / `recovery-ip:*`), so the two budgets never contaminate each
   other and neither can be used to starve the other. */
async function recoveryThrottleCheck(db, request, email) {
  await ensureAuthThrottle(db);
  const now = Date.now();
  const ip = await one(db, 'SELECT * FROM auth_throttles WHERE scope = ?', 'recovery-ip:' + clientIp(request));
  if (ip && ip.window_start && now - ip.window_start <= RECOVERY_PER_IP_WINDOW_MS && ip.window_count >= RECOVERY_PER_IP_MAX) {
    return Math.max(1, Math.ceil((ip.window_start + RECOVERY_PER_IP_WINDOW_MS - now) / 1000));
  }
  const em = String(email || '').trim().toLowerCase();
  if (em) {
    const eb = await one(db, 'SELECT * FROM auth_throttles WHERE scope = ?', 'recovery:' + em);
    if (eb && eb.window_start && now - eb.window_start <= RECOVERY_PER_EMAIL_WINDOW_MS && eb.window_count >= RECOVERY_PER_EMAIL_MAX) {
      return Math.max(1, Math.ceil((eb.window_start + RECOVERY_PER_EMAIL_WINDOW_MS - now) / 1000));
    }
  }
  return null;
}
async function recoveryThrottleHit(db, request, email) {
  await ensureAuthThrottle(db);
  const now = Date.now();
  const em = String(email || '').trim().toLowerCase();
  const keys = [['recovery-ip:' + clientIp(request), RECOVERY_PER_IP_WINDOW_MS]];
  if (em) keys.push(['recovery:' + em, RECOVERY_PER_EMAIL_WINDOW_MS]);
  for (const [key, windowMs] of keys) {
    const row = await one(db, 'SELECT * FROM auth_throttles WHERE scope = ?', key);
    let ws = (row && row.window_start) || 0;
    let wc = (row && row.window_count) || 0;
    if (!ws || now - ws > windowMs) { ws = now; wc = 0; }
    wc += 1;
    await run(
      db,
      `INSERT INTO auth_throttles (scope, fails, blocked_until, window_start, window_count)
       VALUES (?, 0, 0, ?, ?)
       ON CONFLICT(scope) DO UPDATE SET window_start = excluded.window_start, window_count = excluded.window_count`,
      key, ws, wc
    );
  }
}
/* Compare two fixed-length hex digests without leaking how far along they are.
   The throw guards a length mismatch (timingSafeEqual throws on different
   lengths), which is not a secret: a 6-digit code and its hash are never the
   same length anyway. */
function hexEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'hex');
  const y = Buffer.from(String(b || ''), 'hex');
  if (x.length !== y.length || x.length === 0) return false;
  try { return timingSafeEqual(x, y); } catch (_) { return false; }
}
const RECOVERY_429_BODY = 'Too many requests. Please try again in a few minutes.';
function recoveryLimited(retryAfterSec) {
  return json({ error: RECOVERY_429_BODY }, 429, {
    'Retry-After': String(Math.max(1, retryAfterSec || 60))
  });
}
/* Every recovery route starts here, and it runs BEFORE the account lookup and
   BEFORE the throttle (which itself touches storage). Two consequences that both
   matter: a deployment with no delivery channel answers the same way for every
   address, and it does exactly the same amount of work for each — so neither
   the status nor the effort spent can be used to probe which addresses exist. */
function recoveryUnavailable() {
  return json({
    error: 'Self-service password recovery is unavailable. Contact your company administrator to arrange identity-verified assistance. No recovery email has been sent.',
    code: 'RECOVERY_UNAVAILABLE'
  }, 503);
}
function recoveryConfigured(env) {
  return Boolean(String(env.SMTP_PASSWORD || '').replace(/\s+/g, ''));
}

/* A rejected code looks the SAME whether the address has no account, or the
   code is wrong, expired, already used, or out of attempts. One string for all
   five, so nothing about the reply distinguishes them. */
const RESET_REJECTED = {
  error: 'That code is invalid or has expired. Request a new one.',
  code: 'CODE_INVALID'
};
async function findActiveReset(db, userId) {
  return one(
    db,
    'SELECT * FROM password_resets WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
    userId, nowISO()
  );
}
/* Counting a miss against the ACTIVE code (when there is one) is what stops
   1e6 combinations being ground through inside the 10-minute window. An address
   with no account has no code to count against, which costs nothing: the reply
   is identical either way. */
async function rejectResetCode(db, email) {
  const em = String(email || '').trim().toLowerCase();
  const userRow = em ? await one(db, 'SELECT * FROM users WHERE email = ? COLLATE NOCASE', em) : null;
  if (userRow) {
    const active = await findActiveReset(db, userRow.id);
    if (active) {
      const tries = (Number(active.attempts) || 0) + 1;
      await run(
        db,
        'UPDATE password_resets SET attempts = ?, used_at = ? WHERE id = ?',
        tries, tries >= OTP_MAX_ATTEMPTS ? nowISO() : active.used_at, active.id
      );
    }
  }
  return json(RESET_REJECTED, 400);
}
/* One gate behind BOTH verify-code and reset-password, so the two can never
   drift into accepting different things. On success returns { user, row }; on
   failure returns { rejected } already counted and ready to send. */
async function checkResetCode(db, email, code) {
  const em = String(email || '').trim().toLowerCase();
  const shaped = String(code || '').replace(/\s+/g, '');
  if (!em || shaped.length !== 6 || !/^\d{6}$/.test(shaped)) return { rejected: await rejectResetCode(db, em) };
  const user = await one(db, 'SELECT * FROM users WHERE email = ? COLLATE NOCASE', em);
  if (!user) return { rejected: await rejectResetCode(db, em) };
  const row = await findActiveReset(db, user.id);
  if (!row) return { rejected: await rejectResetCode(db, em) };
  if ((Number(row.attempts) || 0) >= OTP_MAX_ATTEMPTS) return { rejected: await rejectResetCode(db, em) };
  if (!hexEqual(row.code_hash, hashToken(shaped))) return { rejected: await rejectResetCode(db, em) };
  return { user, row };
}
/* --- Outbound mail --------------------------------------------------------
   Password recovery needs a verified delivery channel. Outbound SMTP runs over
   cloudflare:sockets to Gmail's submission port (465, implicit TLS — port 25 is
   blocked by the platform and is not used here).

   The From address is the company mailbox, which Google actually owns. A
   third-party relay cannot send AS a gmail.com address: SPF would not align and
   Google would reject or spam it. Sending through Google keeps the whole hop
   inside Google.

   Returns { ok: true } or { ok: false, reason }. The reason is for /api/health
   and logs only — it is never echoed to the caller, because telling a caller
   that a delivery path worked for one address and not another would leak
   account state. */

function mailEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function b64utf8(s) {
  const bytes = new TextEncoder().encode(String(s));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
/* RFC 2047: the subject carries a UTF-8 em dash, which must be encoded or some
   servers mangle it in transit. */
function encodeSubject(s) {
  return '=?UTF-8?B?' + b64utf8(s) + '?=';
}

/* RFC 5322 requires a Date, and most filters treat a message without one —
   or without a Message-ID — as forged. Both are exactly the kind of omission
   that sends a legitimate code to Spam. The zone is written +0000 rather than
   the "GMT" toUTCString emits, because GMT is the obsolete form. */
function mailDate() {
  return new Date().toUTCString().replace(/GMT$/, '+0000');
}
function mailMessageId() {
  return randomBytes(12).toString('hex') + '.' + Date.now().toString(36) + '@gmail.com';
}
/* The plain-text alternative is DERIVED from the HTML rather than written a
   second time. Two copies of this copy would drift, and the OTP is the one
   line that must never be allowed to go stale in one of them. */
function htmlToText(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]*\balt="([^"]*)"[^>]*>/gi, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|td|h[1-6]|li|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;|&#8212;/g, '\u2014')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
    .trim();
}
/* The DATA payload, built and returned rather than sent, so the exact bytes
   on the wire are something a test can read. */
function buildMailMessage(user, to, subject, htmlBody) {
  /* Dot-stuffing: a body line starting with "." would otherwise end the
     message early. Normalise to CRLF, which SMTP requires.
     multipart/alternative, plain FIRST: an HTML-only message is one of the
     oldest spam signals there is, and the plain part is what a filter reads
     to decide what this even is. Date and Message-ID go in the headers for
     the same reason — a legitimate code should not look forged. */
  const boundary = '----=_Part_' + randomBytes(12).toString('hex');
  const onePart = (label, value) => [
    '--' + boundary,
    'Content-Type: ' + label + '; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    String(value).replace(/\r\n?/g, '\n').replace(/\n+$/, '')
  ].join('\n');
  const data = [
    onePart('text/plain', htmlToText(htmlBody)),
    '',
    onePart('text/html', htmlBody),
    '',
    '--' + boundary + '--'
  ].join('\n');
  const stuffed = data.split('\n').map((l) => (l.charAt(0) === '.' ? '.' + l : l)).join('\n');
  return [
    'From: KTM Studio <' + user + '>',
    'To: <' + to + '>',
    'Subject: ' + encodeSubject(subject),
    'Date: ' + mailDate(),
    'Message-ID: <' + mailMessageId() + '>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + boundary + '"',
    'X-Auto-Response-Suppress: All',
    'Auto-Submitted: auto-generated',
    '',
    stuffed.replace(/\n/g, '\r\n')
  ].join('\r\n') + '\r\n.\r\n';
}
async function smtpSend(env, toAddress, subject, htmlBody) {
  const user = String(env.SMTP_USER || '').trim() || RECOVERY_MAIL_FROM;
  /* Every whitespace is removed, not just the ends: Gmail shows an App
     Password as four groups of four (abcd efgh ijkl mnop) and people paste it
     exactly as shown, so an inner space would otherwise reach AUTH LOGIN and
     fail there with an unhelpful 535. The groups are purely visual — the
     credential is the sixteen characters. */
  const pass = String(env.SMTP_PASSWORD || '').replace(/\s+/g, '');
  if (!pass) return { ok: false, reason: 'SMTP_PASSWORD is not configured' };
  const to = String(toAddress || '').trim();
  if (!to) return { ok: false, reason: 'no recipient' };

  let socket = null;
  try {
    /* Lazy, and deliberately so: `cloudflare:sockets` is a Worker built-in that
       plain Node cannot resolve. Importing it here — only on a path that runs
       after the config gate, inside a Worker — keeps this module loadable by the
       test suites while leaving production behaviour identical. */
    const { connect } = await import('cloudflare:sockets');
    socket = connect({ hostname: 'smtp.gmail.com', port: 465 }, { secureTransport: 'on' });
    await socket.opened;

    const reader = socket.readable.getReader();
    const decoder = new TextDecoder();
    const writer = socket.writable.getWriter();
    const out = new TextEncoder();
    const deadline = Date.now() + 20000;
    let buffer = '';

    async function readLine() {
      for (;;) {
        const i = buffer.indexOf('\n');
        if (i >= 0) {
          const line = buffer.slice(0, i);
          buffer = buffer.slice(i + 1);
          return line.replace(/\r$/, '');
        }
        const left = deadline - Date.now();
        if (left <= 0) throw new Error('SMTP read timed out');
        // Race the read against the remaining deadline. A peer that simply stops
        // talking would otherwise leave reader.read() pending forever, and the
        // check above would never run again to break the wait — turning a slow
        // server into a hung request rather than an error.
        const read = reader.read();
        read.catch(() => {}); // also handled on this path, so a timeout cannot strand it
        const chunk = await Promise.race([
          read,
          new Promise((_, rej) => setTimeout(() => rej(new Error('SMTP read timed out')), left))
        ]);
        if (chunk.done) throw new Error('SMTP connection closed by peer');
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    }
    /* SMTP replies can span lines: "250-…" then a final "250 …". */
    async function readReply() {
      const lines = [];
      for (;;) {
        const line = await readLine();
        if (line.length < 4) continue;
        lines.push(line);
        if (line[3] === ' ') break;
        if (line[3] !== '-') break;
        if (lines.length > 40) break;
      }
      if (!lines.length) throw new Error('empty SMTP reply');
      return { code: parseInt(lines[0].slice(0, 3), 10), lines, text: lines.join(' | ') };
    }
    async function expect(cmd, want) {
      await writer.write(out.encode(cmd + '\r\n'));
      const r = await readReply();
      if (r.code !== want) {
        throw new Error(String(cmd).split(' ')[0] + ' refused: ' + r.text.slice(0, 200));
      }
      return r;
    }

    const banner = await readReply();
    if (banner.code !== 220) throw new Error('no SMTP banner: ' + banner.text.slice(0, 160));
    await expect('EHLO localhost', 250);
    await expect('AUTH LOGIN', 334);
    await expect(b64utf8(user), 334);
    await expect(b64utf8(pass), 235);
    await expect('MAIL FROM:<' + user + '>', 250);
    await expect('RCPT TO:<' + to + '>', 250);
    await expect('DATA', 354);

    await writer.write(out.encode(buildMailMessage(user, to, subject, htmlBody)));
    const accepted = await readReply();
    if (accepted.code !== 250) throw new Error('message rejected: ' + accepted.text.slice(0, 200));
    try { await writer.write(out.encode('QUIT\r\n')); } catch (_) { /* closing anyway */ }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e).slice(0, 300) };
  } finally {
    try { if (socket) socket.close(); } catch (_) { /* already closed */ }
  }
}

/* The recovery email. Table layout and inline styles only: Gmail strips most
   <style> blocks. The logo is an ABSOLUTE url because email has no origin —
   Gmail blocks remote images until the reader allows them, which is why the
   code itself is plain text and never lives inside an image. */
function recoveryEmailHtml(origin, displayName, otp) {
  const logoUrl = origin
    ? origin.replace(/\/+$/, '') + '/assets/images/ktm-logo-light.png'
    : '';
  const logo = logoUrl
    ? '<img src="' + mailEsc(logoUrl) + '" width="150" alt="KTM Energy Experts" ' +
      'style="display:block;border:0;height:auto;width:150px;max-width:100%">'
    : '';
  const greeting = displayName
    ? 'Hello ' + mailEsc(displayName) + ','
    : 'Hello,';
  return [
    '<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#f4f6f9;',
    'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#17304a">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:24px 12px"><tr><td align="center">',
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">',
    '<tr><td style="padding:26px 32px 18px;border-bottom:1px solid #eef2f7">' + logo + '</td></tr>',
    '<tr><td style="padding:26px 32px 8px">',
    '<h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;font-weight:700;color:#17304a">Reset your KTM Studio password</h1>',
    '<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3c4a5e">' + greeting + '</p>',
    '<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3c4a5e">We received a request to reset the password for your KTM Studio account. Enter the code below to continue.</p>',
    '<p style="margin:0 0 20px;text-align:center"><span style="display:inline-block;font-size:30px;letter-spacing:9px;font-weight:700;color:#17304a;background:#f4f6f9;border:1px dashed #c9d3e0;border-radius:10px;padding:15px 10px 15px 19px">' + mailEsc(otp) + '</span></p>',
    '<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#3c4a5e">This code expires in <strong>10 minutes</strong> and can be used <strong>only once</strong>.</p>',
    '<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#3c4a5e">If you did not request this, simply ignore this email &mdash; your password has not changed.</p>',
    '<p style="margin:0;font-size:14px;line-height:1.6;color:#3c4a5e">Please do not share this code. KTM Energy Experts will never ask for it.</p>',
    '</td></tr>',
    '<tr><td style="padding:18px 32px 26px;border-top:1px solid #eef2f7">',
    '<p style="margin:0;font-size:12px;line-height:1.7;color:#8494a8">This is an automatically generated email from KTM Energy Experts.<br>Please do not reply to this message.</p>',
    '</td></tr></table>',
    '</td></tr></table></body></html>'
  ].join('');
}

/* Issue a fresh code: voids any previous unused one, stores only its hash.
   resendCount is how many times this recovery attempt has already been
   re-issued AFTER the first code (0 on the first). */
async function issuePasswordReset(db, user, resendCount) {
  const raw = String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, '0');
  const id = uid('pwr');
  const resend = Number.isFinite(resendCount) && resendCount > 0 ? Math.floor(resendCount) : 0;
  await run(
    db,
    'UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL',
    nowISO(), user.id
  );
  await run(
    db,
    `INSERT INTO password_resets
       (id, user_id, code_hash, expires_at, used_at, resend_count, attempts, created_at)
     VALUES (?, ?, ?, ?, NULL, ?, 0, ?)`,
    id, user.id, hashToken(raw),
    new Date(Date.now() + OTP_TTL_MS).toISOString(),
    resend, nowISO()
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
async function handleApi(request, env, url, ctx) {
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
        !(parts[0] === 'auth' && parts[1] === 'oauth') && crossSiteBlocked(request, url)) {
      return json({
        error: 'Cross-site request blocked. Open Studio from the application website and try again.',
        code: 'ORIGIN_BLOCKED'
      }, 403);
    }
    if (parts[0] === 'auth' && parts[1] === 'oauth') {
      /* The `await` is not decoration: `return somePromise` inside a try block
         does NOT route that promise's rejection through the catch below. An
         error thrown anywhere in the OAuth flow would have escaped handleApi,
         rejected the fetch handler itself, and Cloudflare would answer the
         browser with a bare 502 carrying no JSON — which is exactly what the
         dashboard renders as "Request failed (502)". Awaited, the rejection
         lands in the catch and the client gets JSON with a real status. */
      return await handleOAuth(request, env, d1OAuthStore(db), {
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
      /* Same reason as the OAuth call above: without the await a rejection in
         the phone flow bypasses the catch and reaches Cloudflare as a bare
         502. */
      return await handlePhoneAuth(request, env, d1OAuthStore(db), {
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
      /* Create Account offers no "Remember me" control, so a fresh sign-up gets
         the secure default: a session cookie plus the 12-hour server cap. */
      const sess = await createSession(db, user, SESSION_HOURS_SHORT * 3600 * 1000);
      return json(
        { user: publicUser(user, env), token: sess.token, expiresAt: sess.expiresAt },
        201,
        authHeaders(sess.token, request, false)
      );
    }

    if (parts[0] === 'auth' && parts[1] === 'login' && method === 'POST') {
      /* ONE message for BOTH failure paths, on purpose. Saying "no such
         account" only for an unknown address would let anyone test which
         addresses are registered (user enumeration). Attaching the create-account
         hint to the shared failure keeps the guidance and leaks nothing. */
      const LOGIN_FAILED = 'Invalid email or password. Don’t have an account yet? Create one.';
      const body = await readBody(request);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      /* "Remember me" is OFF by default: session cookie (no Max-Age) plus the
         12-hour server cap. Ticking it restores the 30-day behaviour. */
      const remember = body.remember === true || body.remember === 'true';
      const loginBlocked = await authThrottleCheck(db, request, email);
      if (loginBlocked != null) return authLimited(loginBlocked);
      if (!email || !password) {
        await authThrottleFail(db, request, email);
        return json({ error: LOGIN_FAILED }, 401);
      }
      const user = await one(db, 'SELECT * FROM users WHERE email = ? COLLATE NOCASE', email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        await authThrottleFail(db, request, email);
        return json({ error: LOGIN_FAILED }, 401);
      }
      await authThrottleSuccess(db, email);
      await applyOwnerBootstrap(db, env, user);
      const ttlMs = remember ? SESSION_DAYS * 864e5 : SESSION_HOURS_SHORT * 3600 * 1000;
      const sess = await createSession(db, user, ttlMs);
      return json(
        { user: publicUser(user, env), token: sess.token, expiresAt: sess.expiresAt },
        200,
        authHeaders(sess.token, request, remember)
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

    // --- Password recovery (owner decision, 2026-10-10) --------------------
    // The fail-closed gate is lifted: a verified delivery channel now exists
    // (outbound SMTP over cloudflare:sockets, sending as the company mailbox).
    //
    // Uniformity is the load-bearing property here. Whether or not the address
    // has an account, the caller sees the SAME status and the SAME body at every
    // step — accepted, cooling down, over the resend limit, throttled. Account
    // state is only ever revealed by a code the caller already holds.
    if (parts[0] === 'auth' && parts[1] === 'forgot-password' && method === 'POST') {
      const body = await readBody(request);
      const email = String(body.email || '').trim().toLowerCase();

      // Fail closed, before the throttle (which touches storage) and before any
      // account lookup: a deployment with no delivery channel must answer every
      // address identically AND do exactly the same work for each, or the
      // difference in status — or in effort — becomes an oracle.
      if (!recoveryConfigured(env)) return recoveryUnavailable();

      const blocked = await recoveryThrottleCheck(db, request, email);
      if (blocked != null) return recoveryLimited(blocked);

      const ACCEPTED = {
        ok: true,
        message: 'If that email has an account, a reset code is on its way. Check your inbox and spam folder.'
      };

      // Empty/malformed input is not a lookup and spends no budget — but it
      // still returns the same body, so a probe learns nothing either way.
      if (!email) return json(ACCEPTED, 200);

      // Issuance state is tracked for EVERY address, including ones with no
      // account. If only real accounts were counted, an over-limit reply would
      // confirm the account exists; tracking both keeps the reply identical.
      const issuance = await one(db, 'SELECT * FROM auth_throttles WHERE scope = ?', 'recovery-issued:' + email);
      const now = Date.now();
      const windowStart = (issuance && issuance.window_start) || 0;
      const issuedCount = (issuance && issuance.window_count) || 0;
      const nextAllowed = (issuance && issuance.blocked_until) || 0;
      const attemptLive = windowStart && now - windowStart < OTP_TTL_MS;

      if (attemptLive && issuedCount >= 1 + OTP_MAX_RESENDS) {
        return json({
          error: 'Too many codes have been requested for this attempt. Please wait a few minutes and start again.',
          code: 'RESEND_LIMIT'
        }, 429, { 'Retry-After': String(Math.ceil((windowStart + OTP_TTL_MS - now) / 1000)) });
      }
      if (attemptLive && now < nextAllowed) {
        return json({
          error: 'Please wait a moment before requesting another code.',
          code: 'RESEND_COOLDOWN'
        }, 429, { 'Retry-After': String(Math.max(1, Math.ceil((nextAllowed - now) / 1000))) });
      }

      // A known account gets a code; an unknown one follows the identical path
      // minus the send. The response below is the same either way.
      const user = await one(db, 'SELECT * FROM users WHERE email = ? COLLATE NOCASE', email);
      if (user) {
        // `issuedCount` is how many codes this attempt has already produced, so
        // it IS this issuance's resend number: 0 on the first, 1 on the second.
        const otp = await issuePasswordReset(db, user, attemptLive ? issuedCount : 0);
        const origin = String(env.PUBLIC_ORIGIN || env.OAUTH_PUBLIC_ORIGIN || '').trim();
        const html = recoveryEmailHtml(origin, user.name, otp);
        const to = user.email;
        // The send runs AFTER the reply. Awaiting it here would make a known
        // address answer measurably slower than an unknown one, and that timing
        // gap would become an oracle the body no longer exposes. waitUntil keeps
        // the isolate alive until it settles, so nothing is dropped either.
        ctx.waitUntil(smtpSend(env, to, RECOVERY_MAIL_SUBJECT, html).then((sent) => {
          if (sent.ok) {
            // Positive evidence for wrangler tail. Without it a successful
            // send and a send that never ran would look identical in the
            // stream, and "no error appeared" is not proof that mail left.
            // The recipient and the code are deliberately absent: the log is
            // read by the account owner, but neither belongs in one.
            console.log('recovery.sent', JSON.stringify({ bytes: html.length }));
          } else {
            // For wrangler tail and /api/health. Never echoed to the caller: a
            // delivery-specific error only ever fires for real accounts.
            console.log('recovery.send_failed', JSON.stringify({ reason: sent.reason }));
          }
        }));
      }

      // Record the issuance for BOTH branches so the counters advance in step.
      if (attemptLive) {
        await run(
          db,
          `UPDATE auth_throttles SET window_count = ?, blocked_until = ? WHERE scope = ?`,
          issuedCount + 1, now + OTP_RESEND_COOLDOWN_MS, 'recovery-issued:' + email
        );
      } else {
        await run(
          db,
          `INSERT INTO auth_throttles (scope, fails, blocked_until, window_start, window_count)
           VALUES (?, 0, ?, ?, 1)
           ON CONFLICT(scope) DO UPDATE SET blocked_until = excluded.blocked_until,
             window_start = excluded.window_start, window_count = excluded.window_count`,
          'recovery-issued:' + email, now + OTP_RESEND_COOLDOWN_MS, now
        );
      }
      await recoveryThrottleHit(db, request, email);
      return json(ACCEPTED, 200);
    }

    // Step 2 of the recovery flow: prove the code BEFORE asking for a new
    // password, so nobody types a password and only then learns the code was
    // wrong. The code is deliberately NOT consumed here — the caller still has
    // to set the password, and burning it now would strand anyone whose chosen
    // password failed policy. It runs through the same gate as the reset below,
    // so the two cannot disagree about what counts as valid.
    if (parts[0] === 'auth' && parts[1] === 'verify-code' && method === 'POST') {
      const body = await readBody(request);
      const email = String(body.email || '').trim().toLowerCase();
      const code = String(body.code || '').replace(/\s+/g, '');

      // Fail closed first, exactly like the other two recovery routes. With no
      // delivery channel no code can ever exist, and gating AFTER the throttle
      // would let the difference between "503 here" and "429 there" say whether
      // an address has storage behind it.
      if (!recoveryConfigured(env)) return recoveryUnavailable();

      const blocked = await recoveryThrottleCheck(db, request, email);
      if (blocked != null) return recoveryLimited(blocked);
      await recoveryThrottleHit(db, request, email);

      const checked = await checkResetCode(db, email, code);
      if (checked.rejected) return checked.rejected;
      return json({ ok: true, message: 'Code verified. Choose a new password.' }, 200);
    }

    if (parts[0] === 'auth' && parts[1] === 'reset-password' && method === 'POST') {
      const body = await readBody(request);
      const email = String(body.email || '').trim().toLowerCase();
      const code = String(body.code || '').replace(/\s+/g, '');
      const password = String(body.password || '');

      // Fail closed first, ahead of both the policy check and the throttle: when
      // the channel is off no code can be valid, and answering "bad password"
      // here while forgot-password answers 503 would give one deployment two
      // different faces.
      if (!recoveryConfigured(env)) return recoveryUnavailable();

      // Cheap first among the real checks: a malformed password is a client-side
      // problem and costs no attempt against the code.
      const policy = passwordPolicyError(password);
      if (policy) return json({ error: policy }, 400);

      const blocked = await recoveryThrottleCheck(db, request, email);
      if (blocked != null) return recoveryLimited(blocked);
      await recoveryThrottleHit(db, request, email);

      const checked = await checkResetCode(db, email, code);
      if (checked.rejected) return checked.rejected;
      const { user, row } = checked;

      await run(db, 'UPDATE password_resets SET used_at = ? WHERE id = ?', nowISO(), row.id);
      await run(db, 'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', hashPassword(password), nowISO(), user.id);
      // A password change voids every other session: whoever holds the code
      // has proven control of the mailbox, and stale cookies must not outlive
      // that decision.
      await revokeUserSessions(db, user.id, null);
      await authThrottleSuccess(db, user.email);
      return json({ ok: true, message: 'Password updated. You can sign in now.' }, 200);
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
      /* Display data only, and deliberately so: this route writes `name`,
         `phone`, `role_custom` and the profile-nudge flag — `role` and
         `is_admin` never appear in its UPDATE, so a member editing their own
         profile can no more grant themselves reach than they can reach another
         member's row. Permission is written in exactly one place,
         POST /api/team/role, which keeps its own owner gate. */
      const next = {
        name: sessionUser.name,
        phone: sessionUser.phone || '',
        roleCustom: sessionUser.role_custom || null,
        instagram: sessionUser.instagram_url || '',
        linkedin: sessionUser.linkedin_url || '',
        custom: sessionUser.custom_url || ''
      };
      if (body.name != null) {
        const name = String(body.name || '').trim().replace(/\s+/g, ' ');
        if (!name) return json({ error: 'Name cannot be empty.' }, 400);
        next.name = name.slice(0, 120);
      }
      if (body.phone != null) {
        /* A contact number is display data, so the shape check only rejects
           what a stray paste would carry. Empty is valid — declining to publish
           a number is a choice, not an incomplete profile. */
        const phone = String(body.phone || '').trim().slice(0, 30);
        if (phone && !/^[0-9+\-().\s]{3,30}$/.test(phone)) {
          return json({ error: 'A phone number may contain digits and the characters + - ( ) only.' }, 400);
        }
        next.phone = phone;
      }
      /* Social profile links. Display data only — shown as buttons on the
         member card, team-wide, because a social profile is public anyway and
         the point is reaching the person. An empty value simply means "not
         shared", never an error. A bare handle is completed to that platform's
         own URL; anything else must already be an http(s) URL, so a stray paste
         cannot smuggle a javascript: or data: scheme into an <a href>. */
      const socialLink = (kind, raw) => {
        const v = String(raw || '').trim().slice(0, 300);
        if (!v) return { value: '' };
        const base = kind === 'instagram' ? 'https://instagram.com/' : 'https://www.linkedin.com/in/';
        const url = v.charAt(0) === '@'
          ? base + v.replace(/^@+/, '')
          : (/^https?:\/\//i.test(v) ? v : base + v.replace(/^\/+/, ''));
        if (!/^https?:\/\/[^\s]+$/i.test(url)) return { error: true };
        return { value: url };
      };
      if (body.instagram != null) {
        const parsed = socialLink('instagram', body.instagram);
        if (parsed.error) return json({ error: 'That does not look like an Instagram link.' }, 400);
        next.instagram = parsed.value;
      }
      if (body.linkedin != null) {
        const parsed = socialLink('linkedin', body.linkedin);
        if (parsed.error) return json({ error: 'That does not look like a LinkedIn link.' }, 400);
        next.linkedin = parsed.value;
      }
      /* The "any other link" field. Same contract as the two platform links —
         display data, team-visible, empty means "not shared" rather than an
         error — but with NO bare-handle completion, because a custom link has
         no platform to complete to: it must already be an http(s) URL. The
         scheme check is what stops a stray paste smuggling javascript: or
         data: into the button's href. */
      if (body.custom != null) {
        const v = String(body.custom || '').trim().slice(0, 300);
        if (v && !/^https?:\/\/[^\s]+$/i.test(v)) {
          return json({ error: 'That does not look like a link. Start it with https://' }, 400);
        }
        next.custom = v;
      }
      /* The display title, accepted as `title` or `roleCustom`. Validated by
         parseRoleTitle, which maps NOTHING: a title is wording and can never
         decide power, so typing "owner" or "admin" here changes a label. An
         explicitly empty value clears the title rather than erroring, which is
         how a member undoes a title they no longer want. */
      const rawTitle = body.title != null ? body.title : body.roleCustom;
      if (rawTitle != null) {
        const typed = String(rawTitle).trim();
        if (!typed) {
          next.roleCustom = null;
        } else {
          const parsed = parseRoleTitle(typed);
          if (parsed.error) return json({ error: parsed.error }, 400);
          next.roleCustom = parsed.roleCustom;
        }
      }
      /* profile_done flips on any successful save. It is what hides the
         one-time "update your role and info" nudge, and it is a display flag:
         it appears in no gate and no query that decides permission. */
      await run(
        db,
        `UPDATE users SET name = ?, phone = ?, role_custom = ?, instagram_url = ?, linkedin_url = ?, custom_url = ?, profile_done = 1, updated_at = ? WHERE id = ?`,
        next.name, next.phone, next.roleCustom, next.instagram, next.linkedin, next.custom, nowISO(), sessionUser.id
      );
      sessionUser.name = next.name;
      sessionUser.phone = next.phone;
      sessionUser.role_custom = next.roleCustom;
      sessionUser.instagram_url = next.instagram;
      sessionUser.linkedin_url = next.linkedin;
      sessionUser.custom_url = next.custom;
      sessionUser.profile_done = 1;
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
        /* Password recovery. Reports only whether the delivery channel is
           configured — never the address, never a password — so an operator can
           tell "secret not set" apart from "mail is not arriving". The same
           answer goes to every caller. */
        recovery: {
          selfService: true,
          channel: 'smtp',
          deliveryConfigured: Boolean(String(env.SMTP_PASSWORD || '').replace(/\s+/g, '')),
          codeTtlMinutes: Math.round(OTP_TTL_MS / 60000),
          resendLimit: OTP_MAX_RESENDS,
          verifyAttempts: OTP_MAX_ATTEMPTS
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
         WHERE id=? AND owner_id=?`,
        customerId, meta.ref, meta.title, status, meta.version, prevId,
        meta.capacity, meta.customer, formJson, contentJson, projectImagesJson,
        pageImagesJson, optionsJson, localId, sentAt, acceptedAt,
        revision, updated, row.id, user.id
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
      const origin = url.origin;
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
        proposalId: row.id,
        title: row.title,
        customer: row.customer_name,
        defaultEmail: form.custEmail || form.email || '',
        defaultWhatsApp: form.custPhone || form.phone || '',
        versions: versions.map(publicVersion),
        activeLinks: active.length,
        hasPublishedVersion: versions.length > 0
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
      const channel = String(body.channel || 'copy_link');
      if (!SEND_CHANNELS[channel]) return json({ error: 'Unsupported channel' }, 400);
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
      if (!version) return json({ error: 'Publish a version before sending.' }, 400);

      let tok = null;
      let rawToken = null;
      const existing = await all(
        db,
        'SELECT * FROM access_tokens WHERE proposal_id = ? AND version_id = ? AND ' + OWN_SCOPE + ' AND revoked_at IS NULL',
        row.id, version.id, scope, user.id
      );
      tok = existing.find(tokenIsActive) || null;
      if (!tok) {
        rawToken = randomBytes(24).toString('hex');
        tok = {
          id: uid('tok'),
          token_hash: hashToken(rawToken),
          version_id: version.id,
          proposal_id: row.id,
          owner_id: user.id,
          label: 'Send link',
          expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
          created_at: nowISO()
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
      }
      const portalUrl = url.origin + '/portal.html?t=' + encodeURIComponent(rawToken || 'USE_EXISTING_LINK');
      /* If we reused a link we cannot recover raw token — tell client to copy from links list */
      const finalPortal = rawToken
        ? portalUrl
        : (url.origin + '/portal.html?t=OPEN_FROM_LINKS');
      const message = String(body.message || buildDefaultMessage(row, rawToken ? portalUrl : (url.origin + '/portal.html')));
      const recipientTo = String(body.recipientTo || body.to || '');
      const recipientName = String(body.recipientName || body.name || row.customer_name || '');
      const sendRow = {
        id: uid('snd'),
        proposal_id: row.id,
        version_id: version.id,
        token_id: tok.id,
        owner_id: user.id,
        channel,
        state: 'share_clicked',
        recipient_name: recipientName.slice(0, 120),
        recipient_to: recipientTo.slice(0, 200),
        message_body: message.slice(0, 4000),
        portal_url: rawToken ? portalUrl : '',
        provider: 'manual',
        note: String(body.note || '').slice(0, 500),
        created_at: nowISO(),
        updated_at: nowISO(),
        share_clicked_at: nowISO()
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
      if (row.status === 'draft' || row.status === 'ready' || row.status === 'internal_review') {
        await run(
          db,
          "UPDATE proposals SET status = 'sent', sent_at = COALESCE(sent_at, ?), updated_at = ? WHERE id = ?",
          nowISO(), nowISO(), row.id
        );
      }
      const wa = channel === 'whatsapp_manual'
        ? 'https://wa.me/' + digitsForWhatsApp(recipientTo) + '?text=' + encodeURIComponent(message)
        : null;
      const mailto = channel === 'email_manual'
        ? 'mailto:' + encodeURIComponent(recipientTo) +
          '?subject=' + encodeURIComponent('Solar proposal') +
          '&body=' + encodeURIComponent(message)
        : null;
      return json({
        send: publicSend(sendRow),
        launch: { whatsapp: wa, mailto, portalUrl: sendRow.portal_url || finalPortal, rawToken: rawToken || null },
        note: 'State is share_clicked only. This is not provider-confirmed delivery.'
      }, 201);
    }

    if (parts[0] === 'sends' && parts[1] && parts[2] === 'state' && method === 'POST') {
      if (!canWrite) return json({ error: 'Your role can view data but cannot update sends.' }, 403);
      const sendRow = await one(db, 'SELECT * FROM sends WHERE id = ? AND ' + OWN_SCOPE, parts[1], scope, user.id);
      if (!sendRow) return json({ error: 'Send not found' }, 404);
      const body = await readBody(request);
      const state = String(body.state || '');
      /* Manual channels cannot claim delivered / submitted without a provider */
      if (state === 'delivered' || state === 'submitted_to_provider') {
        return json({
          error: 'Manual channels cannot mark delivered. That requires a future provider webhook.'
        }, 400);
      }
      if (state !== 'cancelled' && state !== 'failed' && state !== 'share_clicked') {
        return json({ error: 'Unsupported state transition' }, 400);
      }
      await run(
        db,
        'UPDATE sends SET state = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?',
        state,
        body.note != null ? String(body.note).slice(0, 500) : null,
        nowISO(),
        sendRow.id
      );
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
      let status = task.status;
      let completedAt = task.completed_at;
      if (body.title != null) {
        title = String(body.title).trim().slice(0, 200);
        if (!title) return json({ error: 'Task title cannot be empty' }, 400);
      }
      if (body.notes != null) notes = String(body.notes).slice(0, 2000);
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
        `UPDATE tasks SET title=?, notes=?, due_at=?, status=?, completed_at=?, updated_at=?
         WHERE id=? AND owner_id=?`,
        title, notes, dueAt, status, completedAt, nowISO(), task.id, user.id
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
      /* Kudos: one aggregate for the panel and one set for the caller, rather
         than a query per row. Both are wrapped because 007 may not have been
         applied yet — the panel must still open, with empty hearts. */
      let likeCount = new Map();
      let mine = new Set();
      try {
        const likeRows = await all(db, 'SELECT target_id, COUNT(*) AS n FROM member_likes GROUP BY target_id');
        likeCount = new Map(likeRows.map((r) => [r.target_id, Number(r.n) || 0]));
        const mineRows = await all(db, 'SELECT target_id FROM member_likes WHERE liker_id = ?', user.id);
        mine = new Set(mineRows.map((r) => r.target_id));
      } catch (e) {
        likeCount = new Map();
        mine = new Set();
      }
      const kudos = (u) => ({ likes: likeCount.get(u.id) || 0, likedByMe: mine.has(u.id) });
      return json({
        /* S2: only the actor's own row carries an elevation field. Sign-in
           times ride the caller's manage flag for everyone ELSE's row, while
           the caller's own row keeps them unconditionally — an account may
           always read when it itself last signed in. */
        members: members.map((u) => (u.id === user.id
          ? selfMemberPayload(u, env, u.last_login, kudos(u))
          : memberPayload(u, env, u.last_login, Object.assign({ contact: true, signin: canAdmin }, kudos(u))))),
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
      const body = await readBody(request);
      const targetId = String(body.userId || '');
      const wanted = String(body.role || '').trim().toLowerCase();
      /* The typed title, whether it arrived as roleCustom or title. */
      const rawTitle = (body.roleCustom != null && body.roleCustom !== '')
        ? String(body.roleCustom)
        : (body.title != null && body.title !== '') ? String(body.title) : null;
      /* THE SELF-ELEVATION DOOR. Power follows the ROLE now, so the designated
         mailbox reaches this route at its stored rank with nothing to its name
         — and the owner gate below would refuse it, which would mean elevation
         could never be STARTED. So before that gate, exactly one passage is
         open: the designated address, naming its OWN row, asking for the word
         "admin". It opens nothing else — every other row and every other
         command stops at the gate — and once inside, the checks that already
         exist (ELEVATION_NOT_SELF, self-only elevation) apply unchanged. */
      const wantsAdminWord = (rawTitle != null && rawTitle.trim().toLowerCase() === 'admin') || wanted === 'admin';
      const selfElevationDoor = canElevate(user, env) && targetId === user.id && wantsAdminWord;
      if (!canAdmin && !selfElevationDoor) return json({ error: 'Only the workspace owner can change roles.' }, 403);
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
        /* A title rides ALONGSIDE a power key instead of replacing it: owner
           keeps owner power with the title as its chip, and Sales/Engineer
           keeps the wording in role_custom — that is the title preserve, so a
           role change edits ACCESS and never the wording. Only `custom` takes
           its power from a title arriving with no explicit power key. */
        parsed = wantsOwner ? { role: 'owner', roleCustom: t.roleCustom }
          : (wanted === 'sales' || wanted === 'viewer') ? { role: wanted, roleCustom: t.roleCustom }
          : t;
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
      /* This route is owner / designated-admin gated, so the returned row keeps
         its sign-in times and never drifts from the team list's shape. */
      const outMember = (target.id === user.id) ? selfMemberPayload(target, env) : memberPayload(target, env, undefined, { signin: true });
      return json({ member: outMember, note });
    }

    /* Removing a member — owner or designated admin only.

       What goes: the account row, every session it holds, its provider
       sign-in links and its failed-sign-in throttle, plus everything it owns
       (customers, proposals and their versions/links/sends, tasks,
       notifications and gallery uploads) — the schema declares ON DELETE
       CASCADE on all of them, so one statement removes the set rather than
       leaving orphaned rows behind. auth_throttles is keyed by scope instead
       of by user id, and gallery.created_by is SET NULL, so those two are
       handled explicitly.

       What does NOT go: three rows are unreachable — your own, the
       OWNER_EMAIL backstop, and an elevated row unless the designated admin
       is removing it. Each answers with the same shape as its neighbours, so
       a refusal never discloses which of the three it hit.

       This is irreversible from the product, so the counts are returned and
       the confirmation dialog reads them out loud BEFORE the request is sent. */
    /* ---- the heart on the member card: ONE vote per member per member ----
       Anyone signed in may press it — it is a count of clicks and decides
       nothing — but the composite PRIMARY KEY is what makes it exactly one:
       an insert for an already-voted pair is refused by SQLite, so a double
       click or a replayed request cannot inflate the counter. The route is a
       TOGGLE, so the front end sends the same POST either way and the reply
       says which state it landed in. */
    if (parts[0] === 'team' && parts[1] === 'members' && parts[2] && parts[3] === 'like' && method === 'POST') {
      const targetId = String(parts[2]);
      const target = await one(db, 'SELECT id FROM users WHERE id = ?', targetId);
      if (!target) return json({ error: 'User not found' }, 404);
      let liked;
      try {
        const existing = await one(
          db, 'SELECT liker_id FROM member_likes WHERE liker_id = ? AND target_id = ?', user.id, targetId
        );
        if (existing) {
          await run(db, 'DELETE FROM member_likes WHERE liker_id = ? AND target_id = ?', user.id, targetId);
          liked = false;
        } else {
          await run(db, 'INSERT INTO member_likes (liker_id, target_id, created_at) VALUES (?, ?, ?)',
            user.id, targetId, nowISO());
          liked = true;
        }
      } catch (e) {
        /* 007 not applied yet: say so plainly rather than pretending it counted. */
        return json({ error: 'Kudos are not available on this workspace yet.' }, 503);
      }
      const c = await one(db, 'SELECT COUNT(*) AS n FROM member_likes WHERE target_id = ?', targetId);
      return json({ ok: true, likes: Number((c && c.n) || 0), likedByMe: liked });
    }

    if (parts[0] === 'team' && parts[1] === 'members' && parts[2] && parts.length === 3 && method === 'DELETE') {
      if (!canAdmin) return json({ error: 'Only the workspace owner can remove members.' }, 403);
      const target = await one(db, 'SELECT * FROM users WHERE id = ?', String(parts[2]));
      if (!target) return json({ error: 'User not found' }, 404);
      if (target.id === user.id) {
        return json({ error: 'You cannot remove the account you are signed in with.' }, 403);
      }
      if (ownerEmail(env) && normalizeEmail(target.email) === ownerEmail(env)) {
        return json({
          error: 'This mailbox is the workspace OWNER_EMAIL, so it cannot be removed. Change or remove that Worker variable first.'
        }, 403);
      }
      if (isAdminRow(target) && !canElevate(user, env)) {
        return json({ error: 'Ask admin', code: 'ELEVATION_FORBIDDEN' }, 403);
      }
      const countOwned = async (table, column) => {
        const r = await one(db, 'SELECT COUNT(*) AS n FROM ' + table + ' WHERE ' + column + ' = ?', target.id);
        return Number((r && r.n) || 0);
      };
      const owned = {
        proposals: await countOwned('proposals', 'owner_id'),
        customers: await countOwned('customers', 'owner_id'),
        tasks: await countOwned('tasks', 'owner_id'),
        notifications: await countOwned('notifications', 'owner_id'),
        galleryUploads: await countOwned('gallery', 'created_by'),
        sessions: await countOwned('sessions', 'user_id')
      };
      await ensureAuthThrottle(db);
      await run(db, 'DELETE FROM auth_throttles WHERE scope = ?', 'email:' + normalizeEmail(target.email));
      /* Kudos rows point both ways — the ones this member gave and the ones it
         received — and only the team list reads them, so they go with the
         account instead of surviving as a count of a ghost. */
      try {
        await run(db, 'DELETE FROM member_likes WHERE liker_id = ? OR target_id = ?', target.id, target.id);
      } catch (e) {
        /* 007 not applied: there is nothing to purge. */
      }
      await run(db, 'DELETE FROM gallery WHERE created_by = ?', target.id);
      /* Sessions are auth artefacts, not business records, so they go with the
         account. The counts above were taken first, so the response still
         reports how many there were. requireUser already refuses a deleted
         member (its user lookup returns nothing), so this is hygiene rather
         than a security fix — but a live session has no business outliving the
         person it belongs to. */
      await run(db, 'DELETE FROM sessions WHERE user_id = ?', target.id);
      /* password_resets too — the local server already drops them (server.js),
         so the Worker must not be the one that keeps them. */
      try {
        await run(db, 'DELETE FROM password_resets WHERE user_id = ?', target.id);
      } catch (e) {
        /* Table not present: nothing to purge. */
      }
      const removed = await run(db, 'DELETE FROM users WHERE id = ?', target.id);
      if (!removed.meta || removed.meta.changes === 0) return json({ error: 'User not found' }, 404);
      return json({ ok: true, removed: Object.assign({ email: target.email, name: target.name }, owned) });
    }

    return json({ error: 'Unknown API route' }, 404);
  } catch (err) {
    /* The status is CLAMPED, and the clamp is the whole point. This catch is
       the last line of defence: if constructing its own Response were to throw,
       nothing downstream could recover and the browser would get Cloudflare's
       bare 502 with no JSON body — the "Request failed (502)" the dashboard
       shows. A thrown error may carry a `.status` that is not a legal HTTP
       status at all (a string, a float, an out-of-range value), and
       `new Response()` rejects every one of those with a RangeError. Anything
       that is not an integer in 400..599 becomes a 500 instead. */
    const raw = Number(err && err.status);
    const status = (Number.isInteger(raw) && raw >= 400 && raw <= 599) ? raw : 500;
    try {
      return json({ error: (err && err.message) || 'Server error' }, status);
    } catch (_) {
      /* Even this response can fail: JSON.stringify refuses a circular
         structure or a BigInt, so building the error body throws for exactly
         the payloads most likely to be broken. A body made of literals cannot
         throw, and 500 beats Cloudflare's bare 502. */
      return new Response('{"error":"Server error","code":"RESPONSE_FAILED"}', {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff'
        }
      });
    }
  }
}

/* ---------- fetch handler ---------- */
async function serve(request, env, ctx) {
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
          if (o.host === url.host) {
            headers['Access-Control-Allow-Origin'] = origin;
            headers['Access-Control-Allow-Credentials'] = 'true';
          }
        } catch (_) {}
      }
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      /* `ctx` is not decoration: password recovery schedules its SMTP send with
         ctx.waitUntil so the reply can leave before the network round-trip.
         Without the parameter that call throws — but only once a mailbox is
         actually configured, because the config gate sits in front of it. */
      return handleApi(request, env, url, ctx);
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

/* A response for anything that escaped `serve`.
   Built from literals and never from the offending object: a body that tried
   to render the error could throw again and hand the problem straight back to
   Cloudflare, which is the outcome this whole wrapper exists to prevent. */
function workerEscape(request, err) {
  let isApi = false;
  try {
    const u = new URL(request.url);
    isApi = u.pathname === '/api' || u.pathname.startsWith('/api/');
  } catch (_) { /* the URL itself was the thing that broke */ }
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
  if (isApi) {
    return new Response('{"error":"Server error","code":"WORKER_ERROR"}', {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    });
  }
  return new Response(
    '<!DOCTYPE html><html><body style="font-family:system-ui;padding:2rem;background:#111;color:#eee">' +
    '<h1>Something went wrong</h1>' +
    '<p>Reload the page. If this keeps happening, quote the error code <code>WORKER_ERROR</code>.</p>' +
    '</body></html>',
    { status: 500, headers }
  );
}

/* THE GUARD AGAINST 502.
   An exception that escapes this handler does not become a 500 — Cloudflare
   catches it at the edge and answers with their bare 502 ("Error 1101:
   Worker threw exception"), which the dashboard renders as "Request failed
   (502)" with no status, no body and nothing to act on. Every earlier defence
   closes one specific hole: the awaited OAuth and phone calls route their
   rejections into handleApi's catch, the status clamp keeps a bad err.status
   from turning that catch into a RangeError, and the literal-body fallback
   keeps JSON.stringify from doing the same. Those are all fixes for known
   paths. This is the property that covers the paths nobody has hit yet —
   `getDb` and `bindingNames` sit outside handleApi's own try, the assets
   block has no handler of its own, and any future line can throw. Nothing
   below is allowed to reject; a bug degrades to a readable 500. */
export default {
  async fetch(request, env, ctx) {
    try {
      return await serve(request, env, ctx);
    } catch (err) {
      return workerEscape(request, err);
    }
  }
};

/* Named exports for the mail test. The recovery message has to be inspectable
   without opening a socket: "it is on the wire somewhere" is not proof that
   the Date and Message-ID are in it, and those two are what put the code in
   Spam when they are missing. */
export { buildMailMessage, htmlToText };
