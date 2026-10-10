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
  t(label + ': permissionRole returns \'admin\' for an elevated OR designated row',
    new RegExp("function permissionRole\\(user" + env + "\\) \\{\\s*\\n\\s*if \\(isAdminRow\\(user\\) \\|\\| isHiddenAdmin\\(user" + env + "\\)\\) return 'admin';").test(src),
    fn(src, 'permissionRole', ['roleRank', 'canManageTeam']).slice(0, 160));
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
  t('S1 ' + label + ': roleDisplay still prefers the typed title',
    /if \(u\.role_custom\) return String\(u\.role_custom\);/.test(src));
}
/* The team routes must actually use the split. */
for (const [label, src] of BOTH) {
  const list = src.slice(src.indexOf("'team' && parts[1] === 'members'"));
  const listBody = list.slice(0, list.indexOf("'team' && parts[1] === 'role'"));
  t('S2 ' + label + ': the team list picks selfMemberPayload only for the actor',
    /u\.id === user\.id/.test(listBody) && /selfMemberPayload\(/.test(listBody) && /memberPayload\(/.test(listBody));
  t('S2 ' + label + ': other rows get contact detail only for a manager',
    /contact: canAdmin/.test(listBody));
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
for (const [rel, rootFile] of [['assets/js/dashboard.js', DASH], ['assets/css/dashboard.css', CSS], ['dashboard.html', HTML]]) {
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
t('worker: 55 owner-scoped queries rewritten', scopeSites === 55, scopeSites);
t('worker: all rewritten queries bind scope + user.id correctly', badBinds.length === 0, JSON.stringify(badBinds.slice(0, 5)));

const portalFn = worker.slice(worker.indexOf('async function notifyFromPortalEvent'));
const portalBody = portalFn.slice(0, portalFn.indexOf('\n}') + 2);
t('C4: portal query keeps its literal owner_id filter', portalBody.includes('owner_id = ?'));
t('C4: portal query has NO scope guard', !portalBody.includes('OWN_SCOPE'));
t('C4: portal function has no user/env in scope', !/\(db, ev, (user|env)/.test(portalBody) && /function notifyFromPortalEvent\(db, ev\)/.test(portalBody));

/* ---------- 12. server.js in-memory parity ---------- */
/* 49 call sites, plus the one occurrence inside the inScope() definition
   itself (`row.owner_id === scope`), which is not a call site. */
const inScopeCount = (server.match(/inScope\(scope, /g) || []).length - 1;
t('server: 49 staff ownership tests routed through inScope', inScopeCount === 49, inScopeCount);
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
  const FROZEN = /assets\/js\/(finance|export|render|bess|additional-systems|storage-catalog|model|salutation|supplement-design)\.js$/;
  frozen = changed.filter((f) => FROZEN.test(f));
  t('FROZEN calculation/finance/export engine files untouched', frozen.length === 0, frozen.join(', '));
  const cloudBar = /<div class=\"studio-cloud-bar\" id=\"studioCloudBar\" hidden>[\s\S]*?<\/div>/;
  const baselineQuotation = execFileSync('git', ['show', 'origin/main:quotation.html'], { cwd: ROOT, encoding: 'utf8' });
  const currentQuotation = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8');
  const barPlaceholder = '<div class=\"studio-cloud-bar\" id=\"studioCloudBar\" hidden></div>';
  const normalizeQuotation = html => html.replace(cloudBar, barPlaceholder)
    .replace(/assets\/css\/app\.css\?v=[^\"']+/g, 'assets/css/app.css?v=<cache-key>')
    .replace(/assets\/js\/platform-api\.js\?v=[^\"']+/g, 'assets/js/platform-api.js?v=<cache-key>')
    .replace(/assets\/js\/cloud-bridge\.js\?v=[^\"']+/g, 'assets/js/cloud-bridge.js?v=<cache-key>');
  t('quotation changes are limited to the Studio cloud-sync bar and its asset cache keys',
    cloudBar.test(baselineQuotation) && cloudBar.test(currentQuotation) &&
    normalizeQuotation(baselineQuotation) === normalizeQuotation(currentQuotation));
  t('phone button + Firebase untouched', !changed.some((f) => /phone/i.test(f)));
  const wranglerDiff = execFileSync('git', ['diff', '--unified=0', 'origin/main', '--', 'platform/cloudflare/wrangler.toml'], { cwd: ROOT, encoding: 'utf8' });
  const wranglerEdits = wranglerDiff.split('\n').filter((line) => /^[+-][^-+]/.test(line));
  t('wrangler only configures the verified app origin; zone/NS untouched',
    wranglerEdits.length === 1 && wranglerEdits[0] === '+APP_URL = \"https://quotation-studio-taupe.vercel.app\"', wranglerEdits.join(' | '));
  /* Allowlist of files this task may touch; finance/rendering engines,
     phone/Firebase login, and unrelated deployment configuration stay frozen. */
  const ALLOWED = /^(platform\/cloudflare\/(src\/worker\.js|wrangler\.toml)|platform\/local-server\/server\.js|platform\/schema\.sql|platform\/migrations\/005-is-admin(-verify)?\.sql|assets\/js\/(dashboard|dashboard-home|platform-api|cloud-bridge|portal)\.js|assets\/css\/(app|dashboard)\.css|dashboard\.html|quotation\.html|portal\.html|index\.html|oauth-complete\.html|qa\/[^/]+|docs\/[^/]+\.md)$/;
  t('changed files are the intended set', changed.every((f) => ALLOWED.test(f)),
    changed.filter((f) => !ALLOWED.test(f)).join(', '));
  t('no earlier migration was modified', !changed.some((f) => /^platform\/migrations\//.test(f) && !/005-is-admin/.test(f)),
    changed.filter((f) => /^platform\/migrations\//.test(f)).join(', '));
} catch (e) {
  t('git diff available to check the frozen list', false, e.message);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
