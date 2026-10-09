/* Structural parity: the Cloudflare Worker must implement the same elevation
   contract that qa/roles-access.test.js proves end-to-end on the local server.
   Running a Worker needs wrangler + a D1 binding, which this suite does not
   have, so the worker half is verified by source analysis:

     - the permission core is present in both backends, and elevation overrides
       at exactly ONE place per backend
     - is_admin outranks owner, and every gate inherits it by rank comparison
     - nothing demotes or retitles the ADMIN_EMAIL row automatically
     - S1: no badge / label is ever derived from is_admin
     - S2: no elevation field is emitted about another member's row
     - the front end has NO "Admin" option; elevation is a typed title with a
       self-only red dot, and owner can carry an optional display title
     - every owner-scoped SQL query is still rewritten and bound correctly
     - the token-based portal query is NOT rewritten (no user context there)
     - the migration file and schema.sql agree on the column
     - the frozen calculation / pricing / finance / export files are untouched

   Run: node roles-parity.test.js */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WORKER = path.join(ROOT, 'platform/cloudflare/src/worker.js');
const SERVER = path.join(ROOT, 'platform/local-server/server.js');
const DASH = path.join(ROOT, 'assets/js/dashboard.js');
const DASH_PUB = path.join(ROOT, 'platform/cloudflare/public/assets/js/dashboard.js');
const DASH_HOME = path.join(ROOT, 'assets/js/dashboard-home.js');
const CSS = path.join(ROOT, 'assets/css/dashboard.css');
const HTML = path.join(ROOT, 'dashboard.html');
const MIGRATION = path.join(ROOT, 'platform/migrations/005-is-admin.sql');
const VERIFY_SQL = path.join(ROOT, 'platform/migrations/005-is-admin-verify.sql');
const SCHEMA = path.join(ROOT, 'platform/schema.sql');
const OAUTH = path.join(ROOT, 'platform/cloudflare/src/oauth.mjs');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name, extra !== undefined ? '→ ' + String(extra).slice(0, 300) : ''); }
};

const worker = fs.readFileSync(WORKER, 'utf8');
const server = fs.readFileSync(SERVER, 'utf8');
const dash = fs.readFileSync(DASH, 'utf8');
const dashHome = fs.readFileSync(DASH_HOME, 'utf8');
const BOTH = [['worker', worker], ['server', server]];

/* strip block and line comments, so an assertion about CODE is not answered by
   a sentence of prose that happens to contain the word */
function noComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1 ');
}

/* slice a function body out of a source, up to the next named declaration */
function fn(src, name, nextNames) {
  const start = src.indexOf('function ' + name);
  if (start < 0) return '';
  let end = src.length;
  for (const n of nextNames) {
    const k = src.indexOf('function ' + n, start + 1);
    if (k > start && k < end) end = k;
  }
  return src.slice(start, end);
}

/* ---------- argument splitter, quote/nesting aware ---------- */
function splitArgs(s) {
  const r = []; let d = 0, q = null, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === '\\') cur += s[++i] || ''; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; cur += c; continue; }
    if ('([{'.includes(c)) { d++; cur += c; continue; }
    if (')]}'.includes(c)) { d--; cur += c; continue; }
    if (c === ',' && d === 0) { r.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '') r.push(cur);
  return r;
}

/* ---------- walk every one()/all()/run() call in the worker ---------- */
function eachDbCall(text, fn2) {
  const CALL = /(?<![A-Za-z0-9_$.])(one|all|run)\s*\(/g;
  let m;
  while ((m = CALL.exec(text))) {
    const open = m.index + m[0].length - 1;
    let d = 0, q = null, end = -1;
    for (let k = open; k < text.length; k++) {
      const ch = text[k];
      if (q) { if (ch === '\\') { k++; continue; } if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
      if (ch === '(') d++;
      else if (ch === ')') { d--; if (d === 0) { end = k; break; } }
    }
    if (end < 0) continue;
    const inner = text.slice(open + 1, end);
    const line = text.slice(0, m.index).split('\n').length;
    fn2({ inner, line, helper: m[1] });
    CALL.lastIndex = end;
  }
}

console.log('\nroles-parity (elevation model: worker/server parity, S1/S2 stealth, frozen files)');

/* ---------- 1. permission core present in BOTH backends ---------- */
const WORKER_CORE = [
  'normalizeEmail', 'adminEmail', 'ownerEmail', 'isHiddenAdmin', 'adminOwnerConflict',
  'isAdminRow', 'permissionRole', 'roleRank', 'requireRole', 'canManageTeam', 'canElevate',
  'seesAll', 'rolesIssues', 'parseRoleTitle', 'roleDisplay', 'publicUser',
  'storedRoleWord', 'memberPayload', 'selfMemberPayload',
  'ensureBootstrapOwner', 'applyOwnerBootstrap'
];
const SERVER_CORE = WORKER_CORE.map((n) => (n === 'ensureBootstrapOwner' ? 'applyBootstrapOwner' : n));
WORKER_CORE.forEach((name) => t('worker defines ' + name + '()', new RegExp('function\\s+' + name + '\\b').test(worker)));
SERVER_CORE.forEach((name) => t('server defines ' + name + '()', new RegExp('function\\s+' + name + '\\b').test(server)));

/* The Founder model is gone: nothing may still stamp or name it. */
for (const [label, src] of BOTH) {
  t(label + ': no Founder reference survives anywhere', !/founder/i.test(src), (src.match(/.{0,40}founder.{0,40}/i) || [''])[0]);
  t(label + ': heal is named healAdminRow, not healFounderRole', !/healFounderRole/.test(src));
  /* The old latch stored '' instead of NULL so a promotion would survive the
     heal. It is gone: promotion now stores plain NULL and permanent reach comes
     from is_admin. Checked as code, with comments stripped, because the heal's
     own comment explains why the latch was removed. */
  t(label + ': the empty-string promotion latch is gone (storedCustom removed)',
    !/storedCustom/.test(noComments(src)) && !/role_custom\s*=\s*''/.test(noComments(src)));
}

/* ---------- 2. elevation overrides at exactly ONE place per backend ---------- */
for (const [label, src] of BOTH) {
  const env = label === 'worker' ? ', env' : '';
  /* POWER follows the ROLE: only a row that has actually been elevated ranks
     above the rest. The ADMIN_EMAIL address returns NO rank here at all — it
     only decides who MAY type "admin" (canElevate) — so this assertion is the
     machine-checked form of "the mailbox is not power". */
  t(label + ': permissionRole returns \'admin\' for an elevated row ONLY (the address grants no rank)',
    new RegExp("function permissionRole\\(user" + env + "\\) \\{\\s*\\n\\s*if \\(isAdminRow\\(user\\)\\) return 'admin';").test(src),
    fn(src, 'permissionRole', ['roleRank', 'canManageTeam']).slice(0, 160));
  t(label + ': the mailbox still only decides who MAY type admin (canElevate keeps isHiddenAdmin)',
    new RegExp("function canElevate\\(user" + env + "\\) \\{\\s*\\n\\s*return isHiddenAdmin\\(user" + env + "\\);").test(src),
    fn(src, 'canElevate', ['permissionRole', 'seesAll']).slice(0, 160));
  t(label + ': isAdminRow is the single stored-flag reader',
    /function isAdminRow\(user\) \{\s*\n\s*return Number\(\(user && user\.is_admin\) \|\| 0\) === 1;/.test(src));
  t(label + ': roleRank puts admin ABOVE owner',
    /if \(role === 'admin'\) return 4;[\s\S]{0,80}?if \(role === 'owner'\) return 3;/.test(src));
  t(label + ': canElevate is the ADMIN_EMAIL login only, never "any elevated row"',
    new RegExp("function canElevate\\(user" + env + "\\) \\{\\s*\\n\\s*return isHiddenAdmin\\(user" + env + "\\);").test(src),
    fn(src, 'canElevate', ['seesAll', 'scopeOf']).slice(0, 160));
}
t('worker: every gate routes through requireRole -> permissionRole',
  /function requireRole\(user, minRole, env\) \{\s*\n\s*return roleRank\(permissionRole\(user, env\)\)/.test(worker) &&
  /function canManageTeam\(user, env\) \{\s*\n\s*return requireRole\(user, 'owner', env\)/.test(worker) &&
  /function seesAll\(user, env\) \{\s*\n\s*return requireRole\(user, 'owner', env\)/.test(worker));
t('server: every gate routes through requireRole -> permissionRole',
  /function canManageTeam\(user\) \{\s*\n\s*return requireRole\(user, 'owner'\)/.test(server) &&
  /function seesAll\(user\) \{\s*\n\s*return requireRole\(user, 'owner'\)/.test(server));

/* ---------- 3. NO automatic demotion of the ADMIN_EMAIL row ----------
   An earlier revision healed that row owner -> viewer on sign-in. It was
   removed at the spec owner's request: it also silently undid a deliberate
   promotion, and it was never needed for safety because reach comes from
   ADMIN_EMAIL and is_admin, not from the role column. These assertions exist
   so the heal cannot be reintroduced quietly. */
for (const [label, src] of BOTH) {
  t(label + ': healAdminRow is gone', !/healAdminRow/.test(src));
  t(label + ': no code demotes a row to viewer automatically',
    !/role = 'viewer', updated_at/.test(src) && !/user\.role = 'viewer'/.test(src));
  /* A write of `role` must always decide `role_custom` too, so nothing can
     silently strip or stamp a title as a side effect. The worker writes SQL;
     the local server mutates a JSON row and has no SQL at all. */
  const setRole = (src.match(/SET role[^'"]*/g) || []);
  if (label === 'worker') {
    /* Every role write decides role_custom too, EXCEPT the bootstrap promotion,
       which deliberately PRESERVES the title (no role_custom in its SET). */
    const noCustom = setRole.filter((x) => !x.includes('role_custom'));
    t('worker: every SQL role write either writes role_custom or is the title-preserving bootstrap',
      setRole.length > 0 && noCustom.length === 1 && /^SET role = \?, updated_at = \?/.test(noCustom[0].trim()),
      JSON.stringify(setRole));
    t('worker: no SQL writes role = viewer', !/SET role = 'viewer'/.test(src));
  } else {
    t('server: no SQL at all (JSON backend), and no role write outside a route',
      setRole.length === 0 && (src.match(/\.role = 'viewer'/g) || []).length === 0);
    t('server: a role change always assigns role_custom alongside role',
      /target\.role = parsed\.role;\s*\n\s*target\.role_custom = parsed\.roleCustom;/.test(src));
  }
  t(label + ': nothing stamps a title on the designated admin',
    !/role_custom = 'Founder'/.test(src) && !/role_custom = ''/.test(src));
  const boot = fn(src, 'applyOwnerBootstrap', ['createSession', 'requireUser', 'revokeUserSessions']);
  t(label + ': applyOwnerBootstrap only promotes the OWNER_EMAIL row',
    /ensureBootstrapOwner\(db, env, user\);|return applyBootstrapOwner\(user\);/.test(boot) && boot.split('\n').length < 12,
    boot.slice(0, 220));
  t(label + ': the removal is documented in the source so it is not "fixed" back in',
    /deliberately NO automatic demotion/.test(src));
  t(label + ': the P1 warning no longer claims a heal is disabled',
    !/heal is disabled/.test(src) && !/self-heal/.test(src) && !/one-time heal/.test(src),
    (src.match(/.{0,50}heal.{0,50}/) || [''])[0]);
  t(label + ': adminOwnerConflict survives as a config diagnostic', /function adminOwnerConflict/.test(src));
}

/* ---------- 4. C2: the owner bootstrap is unconditional ---------- */
const bootW = fn(worker, 'ensureBootstrapOwner', ['healAdminRow']);
const bootS = fn(server, 'applyBootstrapOwner', ['healAdminRow']);
t('C2 worker: bootstrap matches on OWNER_EMAIL', /ownerEmail\(env\)/.test(bootW));
t('C2 worker: bootstrap has NO typed-title gate', !/if \(user\.role_custom\)/.test(bootW) && !/role_custom\) return/.test(bootW));
t('C2 worker: bootstrap PRESERVES the title on promotion (no role_custom = NULL)',
  !/role_custom = NULL/.test(bootW) && /SET role = \?, updated_at = \?/.test(bootW));
t('C2 server: bootstrap has NO typed-title gate', !/if \(user\.role_custom\)/.test(bootS) && !/role_custom\) return/.test(bootS));
t('C2 server: bootstrap PRESERVES the title (no role_custom = null)', !/role_custom = null/.test(bootS));
t('worker: the bootstrap is the only transition applyOwnerBootstrap performs',
  /async function applyOwnerBootstrap\(db, env, user\) \{\s*\n\s*await ensureBootstrapOwner\(db, env, user\);\s*\n\s*\}/.test(worker));
t('server: the bootstrap is the only transition applyOwnerBootstrap performs',
  /function applyOwnerBootstrap\(user\) \{\s*\n\s*return applyBootstrapOwner\(user\);\s*\n\s*\}/.test(server));

/* ---------- 5. setTeamRole: the elevation path, identical in both ---------- */
for (const [label, src] of BOTH) {
  const route = src.slice(src.indexOf("'team' && parts[1] === 'role'"));
  const body = route.slice(0, route.indexOf("'Unknown API route'") > 0 ? route.indexOf("'Unknown API route'") : 6000);
  t(label + ': elevation triggers on a TYPED "admin" title (case-insensitive), not a role value',
    /typedAdmin/.test(body) && /rawTitle\.trim\(\)\.toLowerCase\(\) === 'admin'/.test(body) && !/unadmin/.test(body));
  t(label + ': elevation requires the designated admin actor',
    /actorIsAdmin/.test(body) && /ELEVATION_FORBIDDEN/.test(body));
  t(label + ': elevation is self-only', /ELEVATION_NOT_SELF/.test(body) && /target\.id !== user\.id/.test(body));
  t(label + ': an elevated target is out of reach for a non-admin actor',
    /targetElevated && !actorIsAdmin/.test(body));
  t(label + ': the refusal never names the elevated row (no ELEVATED_TARGET; uniform ELEVATION_FORBIDDEN)',
    !/ELEVATED_TARGET/.test(src) && /code: 'ELEVATION_FORBIDDEN'/.test(body));
  t(label + ': elevation writes ONLY is_admin = 1 (display untouched, idempotent — not a toggle)',
    label === 'worker'
      ? /SET is_admin = 1, updated_at = \? WHERE id = \?/.test(body) && !/is_admin = \?/.test(body)
      : /target\.is_admin = 1;/.test(body) && !/target\.is_admin = next/.test(body));
  t(label + ': R2 off-switch — any OTHER self role change by the designated admin de-elevates (is_admin = 0)',
    label === 'worker'
      ? /clearingElevation/.test(body) && /is_admin = 0/.test(body)
      : /target\.is_admin = 0/.test(body));
  t(label + ': boss scenario — role "owner" WITH a title keeps owner power and stores the chip title',
    /wantsOwner \? \{ role: 'owner', roleCustom: t\.roleCustom \}/.test(body));
  t(label + ': the self-demotion guard exempts an elevated actor and target',
    /!actorIsAdmin && !targetElevated/.test(body));
  t(label + ': self-demotion is allowed whenever the OWNER_EMAIL backstop exists',
    label === 'worker' ? /if \(!ownerEmail\(env\)\)/.test(body) : /if \(!ownerEmail\(\)\)/.test(body));
  t(label + ': the elevation note states the display did not change',
    /Nothing about how this account is displayed has changed/.test(body));
  t(label + ': the write gate is still owner-level', /if \(!canAdmin\)/.test(body));
}

/* ---------- 6. S1 — no badge or label is ever derived from is_admin ---------- */
for (const [label, src] of BOTH) {
  const mp = fn(src, 'memberPayload', ['selfMemberPayload']);
  const smp = fn(src, 'selfMemberPayload', label === 'worker' ? ['normalizeEmail'] : ['isAdminRow']);
  const srw = fn(src, 'storedRoleWord', ['memberPayload']);
  t(label + ': memberPayload exists and is shared', mp.length > 0);
  t('S1 ' + label + ': storedRoleWord reads `role` only', /u && u\.role/.test(srw) && !/is_admin/.test(srw), srw.slice(0, 200));
  t('S1 ' + label + ': memberPayload derives power from storedRoleWord', /const stored = storedRoleWord\(u\)/.test(mp) && /power: stored/.test(mp));
  t('S1 ' + label + ': memberPayload never calls permissionRole', !/permissionRole/.test(mp), (mp.match(/.{0,40}permissionRole.{0,40}/) || [''])[0]);
  t('S1 ' + label + ': canWrite/canManageTeam in the row are the STORED-role values',
    /canWrite: roleRank\(stored\)/.test(mp) && /canManageTeam: roleRank\(stored\)/.test(mp));
  t('S2 ' + label + ': memberPayload emits NO isAdmin', !/isAdmin/.test(noComments(mp)), (noComments(mp).match(/.{0,40}isAdmin.{0,40}/) || [''])[0]);
  t('S2 ' + label + ': memberPayload emits NO canElevate', !/canElevate/.test(noComments(mp)));
  t('S2 ' + label + ': memberPayload emits NO effective* field', !/effective/i.test(noComments(mp)));
  t('S2 ' + label + ': memberPayload emits NO elevated flag (the red-dot tell is self-only)',
    !/elevated:/.test(noComments(mp)));
  t('S2 ' + label + ': contact detail is opt-in per row', /\.\.\.\(o\.contact \? \{ email: u\.email \} : \{\}\)/.test(mp));
  t('S2 ' + label + ': selfMemberPayload is the only emitter of the elevation fields',
    /isAdmin:/.test(smp) && /elevated:/.test(smp) && /canElevate:/.test(smp) && /effectiveCanWrite:/.test(smp) && /effectiveCanManageTeam:/.test(smp));
  t('S2 ' + label + ': selfMemberPayload builds on memberPayload (no shape drift)',
    /Object\.assign\(memberPayload\(/.test(smp));
  t('S1 ' + label + ': roleDisplay never produces the literal "Admin"',
    !/return\s+'Admin'|roleLabel:\s*'Admin'|=\s*'Admin'/.test(src));
  t('S1 ' + label + ': roleDisplay still prefers the typed title, for owner/custom only',
    /if \(u\.role_custom && \(r === 'owner' \|\| r === 'custom'\)\) return String\(u\.role_custom\);/.test(src));
}
/* The team routes must actually use the split. */
for (const [label, src] of BOTH) {
  const list = src.slice(src.indexOf("'team' && parts[1] === 'members'"));
  const listBody = list.slice(0, list.indexOf("'team' && parts[1] === 'role'"));
  t('S2 ' + label + ': the team list picks selfMemberPayload only for the actor',
    /u\.id === user\.id/.test(listBody) && /selfMemberPayload\(/.test(listBody) && /memberPayload\(/.test(listBody));
  t('team ' + label + ': every member\'s row carries contact detail (the eye opens the same card for all)',
    /contact: true/.test(listBody) && !/contact: canAdmin/.test(listBody));
  t('item 5 ' + label + ': every member may READ the team panel (no canAdmin gate on GET)',
    !/if \(!canAdmin\)/.test(listBody), (listBody.match(/.{0,60}canAdmin.{0,60}/) || [''])[0]);
  t('item 5 ' + label + ': the response tells the actor whether it manages the team',
    /canManageTeam: canAdmin/.test(listBody));
  t('item 5 ' + label + ': roles[] has NO admin/elevation entry (no Admin dropdown anywhere)',
    !/id: 'admin'/.test(listBody) && !/elevation: true/.test(listBody) && !/label: 'Admin'/.test(listBody));
}
/* publicUser is self-only by construction, so it may carry the flags. */
for (const [label, src] of BOTH) {
  const pu = fn(src, 'publicUser', ['storedRoleWord']);
  t(label + ': publicUser exposes isAdmin + elevated + canElevate (self-only route)',
    /isAdmin:/.test(pu) && /elevated: isAdminRow\(u\)/.test(pu) && /canElevate:/.test(pu));
  t(label + ': publicUser still exposes canWrite + canManageTeam + seesAll',
    /canWrite:/.test(pu) && /canManageTeam:/.test(pu) && /seesAll:/.test(pu));
  t('S1 ' + label + ': publicUser roleLabel comes from roleDisplay, not from elevation',
    /roleLabel: roleDisplay\(u\)/.test(pu));
}

/* ---------- 7. health contract ---------- */
for (const [label, src] of BOTH) {
  t(label + ': health exposes codeVersion + warnings', /codeVersion: CODE_VERSION/.test(src) && /warnings/.test(src));
  t(label + ': health exposes features.elevation', /elevation:/.test(src));
  t(label + ': health roles[] has no "admin" entry (elevation is not a role)',
    /roles: \['owner', 'sales', 'viewer', 'custom'\]/.test(src));
}
t('worker: health PROBES for the column rather than assuming it',
  /pragma_table_info\('users'\)[\s\S]{0,200}is_admin/.test(worker) || /SELECT name FROM pragma_table_info\('users'\) WHERE name = 'is_admin'/.test(worker));
t('worker: a missing column produces a warning that names the migration',
  /005-is-admin\.sql/.test(worker));
t('worker: features.elevation follows the probe, not a constant', /elevation: hasElevationColumn/.test(worker));
const wv = /const CODE_VERSION = '([^']+)'/.exec(worker);
const sv = /const CODE_VERSION = '([^']+)'/.exec(server);
t('both backends define CODE_VERSION', !!wv && !!sv);
t('CODE_VERSION matches across backends', !!wv && !!sv && wv[1] === sv[1], (wv && wv[1]) + ' vs ' + (sv && sv[1]));

/* ---------- 8. the migration, its verifier, and schema.sql agree ---------- */
const mig = fs.readFileSync(MIGRATION, 'utf8');
const ver = fs.readFileSync(VERIFY_SQL, 'utf8');
const schema = fs.readFileSync(SCHEMA, 'utf8');
const migStatements = mig.split(';').map((x) => x.replace(/--[^\n]*/g, '').trim()).filter(Boolean);
t('migration 005 contains exactly ONE statement', migStatements.length === 1, migStatements.length + ': ' + JSON.stringify(migStatements));
t('migration 005 is the expected ALTER TABLE',
  migStatements[0] === 'ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0',
  JSON.stringify(migStatements[0]));
t('migration 005 does not touch any other table or column',
  !/DROP|CREATE TABLE|UPDATE|DELETE|INSERT/i.test(migStatements.join(' ')));
t('migration 005 tells the operator to back up first', /back\s*up|backup/i.test(mig));
t('migration 005 documents the harmless re-run (SQLite has no IF NOT EXISTS for columns)',
  /duplicate column name/i.test(mig));
t('migration 005 documents rollback', /rollback|roll back/i.test(mig));
t('verify SQL is a single read-only statement', ver.split(';').map((x) => x.replace(/--[^\n]*/g, '').trim()).filter(Boolean).length === 1);
t('verify SQL is PRAGMA-driven so a missing column answers instead of throwing',
  /pragma_table_info\('users'\)/.test(ver) && !/ALTER|UPDATE|INSERT/.test(ver));
t('schema.sql declares the same column with the same shape',
  /is_admin\s+INTEGER NOT NULL DEFAULT 0/.test(schema),
  (schema.match(/[^\n]*is_admin[^\n]*/) || [''])[0]);
t('schema.sql does not add "admin" as a role value', !/role[^\n]*admin/i.test(schema.replace(/--[^\n]*/g, '')));

/* ---------- 8b. migration 006: two additive display columns ---------- */
const mig6 = fs.readFileSync(path.join(ROOT, 'platform/migrations/006-profile-info.sql'), 'utf8');
/* Comments first, then split: a sentence in the header legitimately contains a
   semicolon, and splitting before stripping would tear an ALTER in half. */
const mig6Statements = mig6.replace(/--[^\n]*/g, '').split(';').map((x) => x.trim()).filter(Boolean);
t('migration 006 contains exactly TWO statements', mig6Statements.length === 2,
  mig6Statements.length + ': ' + JSON.stringify(mig6Statements));
t('migration 006 is the expected additive ALTER TABLE pair',
  mig6Statements[0] === "ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''" &&
  mig6Statements[1] === 'ALTER TABLE users ADD COLUMN profile_done INTEGER NOT NULL DEFAULT 0',
  JSON.stringify(mig6Statements));
t('migration 006 adds columns only — no elevation, no role write, no other table',
  !/DROP|CREATE TABLE|UPDATE|DELETE|INSERT|is_admin/i.test(mig6Statements.join(' ')),
  mig6Statements.join(' | '));
t('migration 006 tells the operator to back up first', /back\s*up|backup/i.test(mig6));
t('migration 006 documents the harmless re-run (SQLite has no IF NOT EXISTS for columns)',
  /duplicate column name/i.test(mig6));
t('migration 006 documents rollback', /rollback|roll back/i.test(mig6));
const usersBlock = schema.slice(
  schema.indexOf('CREATE TABLE IF NOT EXISTS users'),
  schema.indexOf('CREATE TABLE IF NOT EXISTS password_resets')
);
t('schema.sql declares both new columns inside the users table',
  /phone\s+TEXT NOT NULL DEFAULT ''/.test(usersBlock) &&
  /profile_done\s+INTEGER NOT NULL DEFAULT 0/.test(usersBlock),
  (usersBlock.match(/[^\n]*(?:phone|profile_done)[^\n]*/) || [''])[0]);

/* ---------- 9. front-end stealth ---------- */
const adminLiterals = (dash.match(/textContent = 'Admin'|>\s*Admin\s*</g) || []).length;
t('dashboard.js never renders "Admin" as a role option (elevation is a typed title)',
  adminLiterals === 0, adminLiterals + ' occurrences');
t('wireElevationEditor + canElevateSelf are gone (no elevation dropdown/control)',
  !/wireElevationEditor/.test(dash) && !/canElevateSelf/.test(dash));
t('the role editor never OFFERS Admin as a selectable value',
  !/value = 'admin'|textContent = 'Admin'|>\s*Admin\s*</.test(fn(dash, 'wireRoleEditor', ['refreshTeamPanel'])));
t('the role editor sends a typed title for custom AND owner (boss display title)',
  /v === 'custom' \|\| v === 'owner'/.test(fn(dash, 'wireRoleEditor', ['refreshTeamPanel'])));
t('the red dot is driven by the stored `elevated` flag (self-only tell)',
  /admin-dot/.test(dash) && /user\.elevated/.test(dash));
t('dashboard-home renders the red dot on the top chip from u.elevated',
  /admin-dot/.test(dashHome) && /u\.elevated/.test(dashHome));
t('the team panel role select never offers Admin', (() => {
  const panel = fn(dash, 'refreshTeamPanel', ['fillSendSelect']);
  return !/'admin'/.test(panel.replace(/\/\*[\s\S]*?\*\//g, ''));
})());
t('S1 dashboard: POWER_LABEL has no admin key', !/admin/i.test(/const POWER_LABEL = \{[^}]*\}/.exec(dash)[0]));
t('S1 dashboard: the badge is clamped to the stored role in the UI too',
  /function storedPowerWord\(m\)/.test(dash) && /const pwr = storedPowerWord\(m\)/.test(dash));
t('S1 dashboard: the badge never reads m.power directly', !/const pwr = m\.power/.test(dash));
t('C3 dashboard: applyRole prefers the EFFECTIVE capability fields',
  /effectiveCanWrite != null/.test(dash) && /effectiveCanManageTeam != null/.test(dash));
t('item 5 dashboard: the panel renders read-only for a non-manager',
  /class="team-readonly"/.test(dash) && /r\.canManageTeam != null/.test(dash));
t('item 5 dashboard: the access pill follows the server flag',
  /teamAccessPill/.test(dash) && /'Owner access' : 'Read-only'/.test(dash));
t('item 5 html: the pill is no longer hardcoded to Owner access',
  !/<span class="count-pill">Owner access<\/span>/.test(fs.readFileSync(HTML, 'utf8')) &&
  /id="teamAccessPill"/.test(fs.readFileSync(HTML, 'utf8')));
t('dashboard.js: no name-plate reader consults elevation',
  !/chipRole[\s\S]{0,120}isAdmin/.test(dash) && /u\.roleLabel \|\| u\.role/.test(fs.readFileSync(path.join(ROOT, 'assets/js/dashboard-home.js'), 'utf8')));
t('css: the elevation hint and read-only rows are styled',
  /#roleEditor \.role-hint/.test(fs.readFileSync(CSS, 'utf8')) && /team-readonly/.test(fs.readFileSync(CSS, 'utf8')));

/* ---------- 10. C5: the deployed copy matches the repo root ---------- */
t('C5: platform/cloudflare/public exists', fs.existsSync(path.join(ROOT, 'platform/cloudflare/public')));
for (const [rel, rootFile] of [['assets/js/dashboard.js', DASH], ['assets/js/dashboard-home.js', DASH_HOME], ['assets/css/dashboard.css', CSS], ['dashboard.html', HTML]]) {
  const pub = path.join(ROOT, 'platform/cloudflare/public', rel);
  t('C5: public/' + rel + ' is byte-identical to the root copy',
    fs.existsSync(pub) && fs.readFileSync(pub, 'utf8') === fs.readFileSync(rootFile, 'utf8'));
}

/* ---------- 11. C4 + item 5: every owner-scoped SQL site is rewritten and bound right ---------- */
let scopeSites = 0, badBinds = [], rawLeft = 0;
eachDbCall(worker, ({ inner, line }) => {
  if (inner.includes('owner_id = ?')) rawLeft++;
  if (!inner.includes('OWN_SCOPE')) return;
  scopeSites++;
  const args = splitArgs(inner);
  const sqlIdx = args.findIndex((a) => a.includes('OWN_SCOPE'));
  const sqlText = args[sqlIdx];
  const binds = args.slice(sqlIdx + 1).map((a) => a.trim());
  const lit = (sqlText.match(/\?/g) || []).length;
  const nScope = (sqlText.match(/OWN_SCOPE/g) || []).length;
  if (lit + 2 * nScope !== binds.length) { badBinds.push([line, 'arity', lit + 2 * nScope, binds.length]); return; }
  const ordinals = [];
  const re = /OWN_SCOPE/g; let m;
  while ((m = re.exec(sqlText))) {
    const upto = sqlText.slice(0, m.index);
    const base = (upto.match(/\?/g) || []).length + 2 * (upto.match(/OWN_SCOPE/g) || []).length;
    ordinals.push(base + 1, base + 2);
  }
  for (let i = 0; i < ordinals.length; i += 2) {
    if (binds[ordinals[i] - 1] !== 'scope') badBinds.push([line, 'scope-bind', binds[ordinals[i] - 1]]);
    if (binds[ordinals[i + 1] - 1] !== 'user.id') badBinds.push([line, 'owner-bind', binds[ordinals[i + 1] - 1]]);
  }
});
t('worker: OWN_SCOPE constant is the NULL-lifting guard',
  /const OWN_SCOPE = '\(\? IS NULL OR owner_id = \?\)'/.test(worker));
t('worker: per-request scope is declared at the staff gate',
  /const scope = seesAll\(user, env\) \? null : user\.id;/.test(worker));
/* Exactly ONE raw filter may remain: the token-based portal query, which has no
   user context and is deliberately excluded (C4). */
t('worker: only the excluded portal query keeps a raw owner_id filter', rawLeft === 1, rawLeft + ' raw owner_id = ? remain');
t('worker: 52 owner-scoped queries rewritten', scopeSites === 52, scopeSites);
t('worker: all rewritten queries bind scope + user.id correctly', badBinds.length === 0, JSON.stringify(badBinds.slice(0, 5)));

const portalFn = worker.slice(worker.indexOf('async function notifyFromPortalEvent'));
const portalBody = portalFn.slice(0, portalFn.indexOf('\n}') + 2);
t('C4: portal query keeps its literal owner_id filter', portalBody.includes('owner_id = ?'));
t('C4: portal query has NO scope guard', !portalBody.includes('OWN_SCOPE'));
t('C4: portal function has no user/env in scope', !/\(db, ev, (user|env)/.test(portalBody) && /function notifyFromPortalEvent\(db, ev\)/.test(portalBody));

/* ---------- 12. server.js in-memory parity ---------- */
/* 47 call sites, plus the one occurrence inside the inScope() definition
   itself (`row.owner_id === scope`), which is not a call site. */
const inScopeCount = (server.match(/inScope\(scope, /g) || []).length - 1;
t('server: 47 staff ownership tests routed through inScope', inScopeCount === 47, inScopeCount);
t('server: no raw `owner_id === user.id` staff filter left', !/owner_id === user\.id/.test(server));
t('server: per-request scope declared at the staff gate', /const scope = scopeOf\(user\);/.test(server));
t('server: token-context owner_id untouched', (server.match(/owner_id: tok\.owner_id/g) || []).length === 3);
t('server: inScope lifts the filter only for null scope',
  /function inScope\(scope, row\) \{\s*\n\s*return scope === null \|\| \(row && row\.owner_id === scope\);/.test(server));
t('server: local signup writes is_admin explicitly so JSON rows match SQL rows',
  /is_admin: 0,/.test(server));

/* ---------- 13. C6: no signup/title blocklist ---------- */
for (const [label, src] of BOTH) {
  /* Exact bodies only: the surrounding prose legitimately discusses
     ADMIN_EMAIL, which must not be mistaken for a keyword mapping. */
  const ps = noComments(fn(src, 'parseSignupRole', ['rolesIssues', 'parseRoleTitle', 'roleDisplay']));
  t(label + ': parseSignupRole has no blocklist', !/blocklist|reserved|deny|forbidden/i.test(ps));
  t(label + ': parseSignupRole still maps the three power keys',
    /key === 'owner'/.test(ps) && /key === 'sales'/.test(ps) && /key === 'viewer'/.test(ps));
  t(label + ': parseSignupRole never maps anything to admin', !/admin/i.test(ps), (ps.match(/.{0,40}admin.{0,40}/i) || [''])[0]);
  t(label + ': parseSignupRole falls through to the custom power level', /return \{ role: 'custom'/.test(ps));
  const pr = noComments(fn(src, 'parseRoleTitle', ['roleDisplay', 'publicUser']));
  t(label + ': parseRoleTitle never maps a keyword to power', !/key === 'owner'|role: 'owner'/.test(pr));
  t(label + ': parseRoleTitle validates length only', /typed\.length > 60/.test(pr));
  t(label + ': parseRoleTitle always returns the custom power level', /role: 'custom'/.test(pr));
  t(label + ': parseRoleTitle never mentions admin', !/admin/i.test(pr));
}

/* ---------- 14. frozen files: this patch must not touch them ---------- */
let frozen = [];
try {
  const out = execFileSync('git', ['diff', '--name-only', 'origin/main'], { cwd: ROOT, encoding: 'utf8' });
  const changed = out.split('\n').filter(Boolean);
  const FROZEN = /assets\/js\/(finance|export|render|bess|additional-systems|storage-catalog|model|salutation|supplement-design)\.js$|^quotation\.html$/;
  frozen = changed.filter((f) => FROZEN.test(f));
  t('FROZEN calc/pricing/finance/export files untouched', frozen.length === 0, frozen.join(', '));
  /* The phone sign-in BUTTON and Firebase must not move. The rule is now
     expressed on what it actually protects — the phone UI and its client
     script — rather than on any path that happens to contain the word, because
     this round carries the same one-line Workers-fetch fix as src/oauth.mjs
     into src/phone.mjs: `redirect:'error'` is not a legal value on Workers, so
     the token exchange threw before sending a single byte. That is a dormant
     copy of the very bug that broke Google sign-in, and the phone button,
     phone-auth.js and the PHONE_ENABLED default are all still untouched. */
  t('phone button + Firebase untouched',
    !changed.some((f) => /firebase/i.test(f) || /phone-auth\.js$/.test(f) || /index\.html$/.test(f)) &&
    !changed.some((f) => /phone/i.test(f) && f !== 'platform/cloudflare/src/phone.mjs'),
    changed.filter((f) => /phone|firebase/i.test(f)).join(', '));
  t('wrangler config / zone / NS untouched', !changed.some((f) => /wrangler|vercel\.json/.test(f)));
  /* Allowlist of files this round may touch. Anything outside it means the
     patch wandered — notably into the frozen calculation/finance/export set,
     a deploy config, or a deploy config. The set below is this round's scope
     in full:

       the Google sign-in root-cause fix   src/oauth.mjs + src/phone.mjs
       the team/profile/delete feature    worker.js, server.js, schema.sql,
                                          dashboard.js, platform-api.js,
                                          dashboard.css, dashboard.html
       the C5 mirror of the three files   platform/cloudflare/public/**
       migration 006 (contact + nudge)    platform/migrations/006-profile-info*
       this guard and the feature's tests qa/**
       the stale callback documentation   docs/**
     platform/migrations is limited to 005 (round 1), 006 (contact), 007
     (member links + kudos) and 008 (member custom link); the elevation
     column of round 1 must not be
     rewritten by any of them. */
  const ALLOWED = new RegExp('^(?:' + [
    'platform/cloudflare/src/(?:worker\\.js|oauth\\.mjs|phone\\.mjs)',
    'platform/local-server/server\\.js',
    'platform/schema\\.sql',
    'platform/migrations/(?:005-is-admin(?:-verify)?|006-profile-info(?:-verify)?|007-member-links-likes(?:-verify)?|008-member-custom-link(?:-verify)?)\\.sql',
    'platform/cloudflare/public/.+',
    'assets/js/(?:dashboard|dashboard-home|platform-api|cloud-bridge)\\.js',
    'assets/css/dashboard\\.css',
    'dashboard\\.html',
    'qa/[^/]+',
    'docs/[^/]+\\.md'
  ].join('|') + ')$');
  t('changed files are the intended set', changed.every((f) => ALLOWED.test(f)),
    changed.filter((f) => !ALLOWED.test(f)).join(', '));
  t('no earlier migration was modified',
    !changed.some((f) => /^platform\/migrations\//.test(f) && !/005-is-admin|006-profile-info|007-member-links-likes|008-member-custom-link/.test(f)),
    changed.filter((f) => /^platform\/migrations\//.test(f)).join(', '));
} catch (e) {
  t('git diff available to check the frozen list', false, e.message);
}

/* ---------- 15. team profile round: the two backends agree ----------
   qa/team-profile.test.js proves the behaviour end to end on the local
   server; this proves the Worker ships the same contract, since running a
   Worker here needs wrangler. */
{
  const both = (needle, label) =>
    t(label, worker.includes(needle) && server.includes(needle), needle);

  both("phone: u.phone || ''", 'parity: /me emits the contact number in both backends');
  both('profileDone: Number(u.profile_done || 0) === 1', 'parity: /me emits the profile-nudge flag in both backends');
  both("...(o.contact ? { phone: u.phone || '' } : {}),",
    'parity: the contact number rides the same per-row opt-in as the address, in both backends');
  both("parts[2] && parts.length === 3 && method === 'DELETE'",
    'parity: both expose DELETE /api/team/members/:id');
  both('Only the workspace owner can remove members.', 'parity: both gate removal behind the owner gate');
  both('You cannot remove the account you are signed in with.', 'parity: both refuse your own row');
  both('This mailbox is the workspace OWNER_EMAIL, so it cannot be removed.',
    'parity: both refuse the OWNER_EMAIL backstop row');
  both('ELEVATION_FORBIDDEN', 'parity: both refuse an elevated row with the uniform refusal');
  both("'auth' && parts[1] === 'profile' && method === 'POST'",
    'parity: both expose the profile save route');
  both("custom: u.custom_url || ''",
    'parity: both publish the custom link on the same payload shape');
  both('That does not look like a link. Start it with https://',
    'parity: both refuse a custom link that is not an http(s) URL');
  both('.custom_url = next.custom',
    'parity: both persist the custom link');

  /* The one SQL statement that decides what a self-service profile edit can
     ever write, asserted as a whole string so a future column cannot slip
     into it without failing here first. */
  const profileSql = ((worker.match(/UPDATE users SET name = \?[^\n`]*/) || [''])[0] || '').trim();
  t('worker: the profile UPDATE is exactly the seven display columns',
    profileSql === 'UPDATE users SET name = ?, phone = ?, role_custom = ?, instagram_url = ?, linkedin_url = ?, custom_url = ?, profile_done = 1, updated_at = ? WHERE id = ?',
    profileSql);
  t('worker: the profile UPDATE carries no permission column',
    !/(?:^|,)\s*(?:role|is_admin)\s*=/.test(profileSql), profileSql);
  /* The kudos toggle is a click counter and must never look like a write to
     permission. Asserted on both backends so neither can drift into using it. */
  t('both: the member kudos toggle route exists in worker and server',
    /parts\[3\] === 'like'/.test(worker) && /parts\[3\] === 'like'/.test(server),
    (/parts\[3\] === 'like'/.test(worker) ? 'worker:found' : 'worker:MISSING') + ' ' +
    (/parts\[3\] === 'like'/.test(server) ? 'server:found' : 'server:MISSING'));
  t('neither backend grants anything from member_likes',
    !/(?:role|is_admin|canManageTeam|permissionRole)[^\n]{0,80}member_likes/.test(worker) &&
    !/(?:role|is_admin|canManageTeam|permissionRole)[^\n]{0,80}member_likes/.test(server),
    'kudos must stay out of every permission expression');

  const profileStart = server.indexOf("'auth' && parts[1] === 'profile' && method === 'POST'");
  const profileEnd = server.indexOf("'health' && method === 'GET'", profileStart);
  const serverProfile = profileStart > 0 && profileEnd > profileStart
    ? server.slice(profileStart, profileEnd) : '';
  t('server: the profile save assigns no permission field',
    !!serverProfile && !/user\.(?:role|is_admin)\s*=/.test(serverProfile),
    serverProfile ? 'found' : 'profile handler slice not located');
}

/* ---------- 16. team panel layout + the role vocabulary ----------
   Two things this round had to get exactly right, both presentation:

   (a) The team table must fit ONE panel. There is no left/right scrolling:
       fixed columns keep it at the panel's width, and once the team outgrows
       the panel the ROWS scroll vertically under a pinned header. Scoped to
       .team-wrap so every other data table keeps its own horizontal scroll.

   (b) `viewer` reads "Engineer" on screen — in the badge, the dropdown, the
       Settings chip and the top chip — and nowhere else. It is a label
       rename: no server source may contain the word, so the stored role, its
       rank and every gate are untouched. */
{
  const css = fs.readFileSync(CSS, 'utf8');
  const html = fs.readFileSync(HTML, 'utf8');
  const powerMap = (/const POWER_LABEL = \{[^}]*\}/.exec(dash) || [''])[0];
  const roleMap = (/const ROLE_LABEL = \{[^}]*\}/.exec(dash) || [''])[0];
  const adminDot = (/\.admin-dot \{[^}]*\}/.exec(css) || [''])[0];
  const teamFn = fn(dash, 'refreshTeamPanel', ['fillSendSelect']);

  t('ui: ROLE_LABEL calls the stored viewer role Engineer', /viewer: 'Engineer'/.test(roleMap), roleMap);
  t('ui: POWER_LABEL (the badge) calls it Engineer too', /viewer: 'Engineer'/.test(powerMap), powerMap);
  t('ui: the server word Viewer is mapped once, for display only', /Viewer: 'Engineer'/.test(dash));
  t('ui: a typed title passes through that map untouched',
    /SERVER_ROLE_LABEL\[roleOrUser\.roleLabel\] \|\| roleOrUser\.roleLabel/.test(dash));
  t('ui: dashboard-home maps the same word on the top chip',
    /CHIP_ROLE\[u\.roleLabel\] \|\| u\.roleLabel \|\| u\.role/.test(dashHome));
  t('backend: no backend role word was renamed — the Engineer label is display-only',
    /if \(r === 'viewer'\) return 'Viewer';/.test(worker) &&
    /if \(r === 'viewer'\) return 'Viewer';/.test(server) &&
    !/['"]engineer['"]/i.test(worker + server));

  const buildIdx = teamFn.indexOf("['owner', 'sales', 'viewer']");
  const customIdx = teamFn.indexOf('opts += \'<option value="custom"\'');
  t('ui: the team role dropdown puts Custom LAST', buildIdx > -1 && customIdx > buildIdx,
    buildIdx + ' vs ' + customIdx);
  t('ui: a Sales / Engineer row renders no typed-title box at all',
    /\(titleable \? '' : ' hidden'\)/.test(dash) && !/\(titleable \? '' : ' disabled'\)/.test(dash));
  t('ui: choosing Custom or Owner opens the box; the other roles remove it',
    /input\.hidden = !wantsTitle/.test(dash) && /const wantsTitle = sel\.value === 'custom' \|\| sel\.value === 'owner'/.test(dash));

  t('html: the team table is the one wrapped for single-panel layout',
    /table-wrap team-wrap/.test(html));
  t('css: the team panel never scrolls sideways and scrolls its rows instead',
    /\.table-wrap\.team-wrap \{[\s\S]{0,200}?overflow-x: hidden;[\s\S]{0,80}?overflow-y: auto;/.test(css));
  t('css: the team header stays pinned while the rows scroll',
    /\.table-wrap\.team-wrap table\.data th \{[\s\S]{0,160}?position: sticky;/.test(css));
  t('css: the team columns are fixed, so six of them always fit the panel',
    /\.table-wrap\.team-wrap table\.data \{ table-layout: fixed; \}/.test(css));
  t('css: every OTHER data table keeps its own horizontal scroll',
    /\.table-wrap \{\s+overflow-x: auto;/.test(css));
  t('css: the elevation dot is the smaller, lower-contrast one',
    /width: 5px/.test(adminDot) && /60%/.test(adminDot), adminDot);
  t('css: the elevation dot is HOVER-ONLY, so a glance at the screen shows nothing',
    /opacity: 0;/.test(adminDot) &&
    /#chipRole:hover \.admin-dot,\s*#settingsRole:hover \.admin-dot/.test(css));

  /* This round: a wider panel so addresses do not wrap, softer corners on the
     little white boxes, and the honest words in a read-only Edit cell. */
  t('css: the settings panel is wide enough for an address to read on one line',
    /grid-template-columns: 190px minmax\(0, 900px\)/.test(css));
  t('css: the role box, title box and eye button share the softer 12px corners',
    /\.team-edit-cell \.team-role-select \{[^}]*border-radius: 12px/.test(css) &&
    /\.team-title-input \{[^}]*border-radius: 12px/.test(css) &&
    /\.team-info-btn \{[^}]*border-radius: 12px/.test(css));
  t('ui: a read-only Edit cell says "Only owner access", not a dead control',
    /muted micro">Only owner access</.test(dash) && !/Owner only</.test(dash));
  t('ui: the read-only row shows the same contact detail as every other row',
    /'<td class="muted">' \+ contact \+ '<\/td>'/.test(teamFn));

  /* Regression — THE EYE MUST OPEN FOR EVERYONE. The button is rendered on
     BOTH sides of the manager check, so its listener has to be bound on both
     sides too. An early `if (!manage) return` sat between the two: the row
     drew a perfectly good eye for every role and email, and then the binding
     never ran, so the click went nowhere and only a manager could open a
     card. Comments are stripped first so the fix's own explanation cannot
     answer this test. */
  t('ui: the eye listener is bound for every role, not only for managers',
    !/if \(!manage\) return/.test(noComments(teamFn)) &&
    /body\.querySelectorAll\('\.team-info-btn'\)\.forEach/.test(noComments(teamFn)));

  /* Sign-in times answer "when was this person last active", which is an
     owner/admin question. The status line and both sign-in rows are removed
     from the card — hidden, not greyed — for anyone the server does not
     report as managing the team. The gate reads teamCanManage, which starts
     false and is only set once the team list returns, so it fails closed. */
  const cardFn = fn(dash, 'openMemberInfo', ['askRemoveMember']);
  t('ui: the card exposes its status line and both sign-in dates as rows',
    ['id="miStatusRow"', 'id="miFirstRow"', 'id="miLastRow"'].every((s) => html.includes(s)));
  t('ui: sign-in times render only for whoever the server says manages the team',
    /seeSignIn = !!teamCanManage/.test(noComments(cardFn)) &&
    /\['miStatusRow', 'miFirstRow', 'miLastRow'\]/.test(noComments(cardFn)));
  t('ui: the gate removes those rows outright rather than styling them away',
    /el\.hidden = !seeSignIn/.test(noComments(cardFn)));

  /* The card's facts read as chips and the three platform marks keep their
     brand colour, because at 16px a recognisable colour IS the label. The two
     utility glyphs are not brands and must stay on the theme colour. */
  t('css: the card facts are tinted 12px chips, not loose label/value pairs',
    /\.mi-facts > div \{[^}]*border-radius: 12px/.test(css));
  t('css: the platform marks carry brand colour while the utilities do not',
    /\.mi-link--wa \{ color: #25d366/.test(css) &&
    /\.mi-link--li \{ color: #0a66c2/.test(css) &&
    /linearGradient id="miIgGrad"/.test(html) &&
    /class="mi-link" id="miContact"/.test(html) &&
    /class="mi-link" id="miCustom"/.test(html));

  /* Title preserve: a role change edits ACCESS, never the wording. The title
     rides beside the power key in BOTH backends, and the client sends it for
     every role instead of blanking it. */
  const ridesBeside = "(wanted === 'sales' || wanted === 'viewer') ? { role: wanted, roleCustom: t.roleCustom }";
  t('parity: both backends let a title ride beside a Sales/Engineer power key',
    worker.includes(ridesBeside) && server.includes(ridesBeside), ridesBeside);
  t('ui: applyRole sends the title with every role, not just custom/owner',
    /api\.setTeamRole\(memberId, role, titleVal\)/.test(dash) &&
    !/role === 'custom' \|\| role === 'owner'\) \? titleVal/.test(dash));
  t('ui: the team row sends whatever the (possibly hidden) box still holds',
    /applyRole\(id, sel\.value, input \? input\.value\.trim\(\) : ''\)/.test(dash));
  const pencil = fn(dash, 'wireRoleEditor', ['refreshTeamPanel']);
  t('ui: the own-role editor never blanks the title box when a role hides it',
    !/title\.value = ''/.test(pencil) && /title\.value = user\.roleCustom \|\| ''/.test(pencil));

  /* SIGNIN_EXPIRED graceful replay: the callback asks ONE question before it
     scares a visitor — is this browser already signed in? — and walks a valid
     session straight to the dashboard. The error itself is untouched. */
  const oauth = fs.readFileSync(OAUTH, 'utf8');
  const replay = oauth.indexOf("if(code==='SIGNIN_EXPIRED')");
  t('oauth: the callback has a graceful-replay branch on SIGNIN_EXPIRED',
    replay > 0, replay);
  t('oauth: the branch reads the EXISTING session with the dashboard\'s own check',
    replay > 0 && /const signedIn=await auth\.user\(request\);/.test(oauth.slice(replay, replay + 400)),
    oauth.slice(replay, replay + 400));
  t('oauth: a still-signed-in visitor is taken to the dashboard, not an error page',
    /if\(signedIn\)return redirect\('\/dashboard\.html',\[cookie\(provider,'',0\)\]\);/.test(oauth));
  t('oauth: the honest error survives for a visitor with no session at all',
    /return redirect\('\/index\.html\?oauth_error='\+code,\[cookie\(provider,'',0\)\]\);/.test(oauth));
  t('oauth: the replay grants nothing — it reads, and writes only the expired binding cookie',
    !/auth\.session\(|await store\.resolve\(|setSession|is_admin/.test(oauth.slice(replay, replay + 700)));

  /* The panel intro is ONE fixed theme line now: the gate speaks for itself
     through the access pill and the "Only owner access" cell. */
  t('ui: the team intro is a fixed theme line, not a paragraph of rules',
    /Your members, their roles, everything that matters — in one place\./.test(html));
  t('ui: refreshTeamPanel no longer writes the intro — the copy lives in the page',
    !/teamPanelSub/.test(dash), 'dashboard.js still writes teamPanelSub');
  t('ui: the old rules paragraph is gone from both the page and the script',
    !/Removing a member is owner and admin only/.test(dash + html) &&
    !/Under Edit it reads/.test(dash + html));

  /* The EDIT dropdown selects on the POWER KEY. Since a title now survives a
     role change, a Sales row can carry role_custom — and that must never
     re-label it: the bug this guards is a badge reading "Sales" while the
     dropdown read "Custom title" and the typed-title box sat open underneath. */
  t('ui: the EDIT dropdown selects on the power key, never on whether a title exists',
    /const isCustom = m\.role === 'custom';/.test(dash) &&
    !/m\.role === 'custom' \|\| !!m\.roleCustom/.test(dash));
  t('ui: the typed-title box therefore opens for owner and custom only',
    /const titleable = isCustom \|\| m\.role === 'owner';/.test(dash));
  t('ui: the last option reads as an instruction, not a stored value',
    />Custom — type here<\/option>/.test(dash) && !/>Custom title<\/option>/.test(dash));
  t('ui: the own-role pencil follows the power key too',
    /if \(user\.role === 'custom'\)/.test(dash) &&
    !/user\.roleCustom && user\.role !== 'owner'/.test(dash));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
