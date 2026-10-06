/* Round-1 structural parity: the Cloudflare Worker must implement the same
   role contract that qa/roles-access.test.js proves end-to-end on the local
   server. Running a Worker needs wrangler + a D1 binding, which this suite
   does not have, so the worker half is verified by source analysis:

     - the permission core is present and overrides at ONE place
     - every owner-scoped SQL query is rewritten correctly and binds the
       scope value into the right placeholder
     - the token-based portal query is NOT rewritten (no user context there)
     - display/label rules, the code version marker and the health contract
     - the frozen calculation / pricing / finance / export files are untouched

   Run: node roles-parity.test.js */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WORKER = path.join(ROOT, 'platform/cloudflare/src/worker.js');
const SERVER = path.join(ROOT, 'platform/local-server/server.js');

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name, extra !== undefined ? '→ ' + String(extra).slice(0, 300) : ''); }
};

const worker = fs.readFileSync(WORKER, 'utf8');
const server = fs.readFileSync(SERVER, 'utf8');

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
function eachDbCall(text, fn) {
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
    fn({ inner, line, helper: m[1] });
    CALL.lastIndex = end;
  }
}

console.log('\nroles-parity (worker.js structural parity + frozen files)');

/* ---------- 1. permission core present in BOTH backends ---------- */
const CORE = [
  'normalizeEmail', 'adminEmail', 'ownerEmail', 'isHiddenAdmin', 'adminOwnerConflict',
  'permissionRole', 'canManageTeam', 'seesAll', 'rolesIssues', 'parseRoleTitle',
  'ensureBootstrapOwner', 'healFounderRole', 'applyOwnerBootstrap'
];
const serverCore = CORE.map((n) => n.replace(/^ensureBootstrapOwner$/, 'applyBootstrapOwner'));
for (const name of CORE) {
  const re = new RegExp('(function|const)\\s+' + name + '\\b');
  t('worker defines ' + name + '()', re.test(worker));
}
for (const name of ['normalizeEmail', 'adminEmail', 'ownerEmail', 'isHiddenAdmin', 'adminOwnerConflict',
  'permissionRole', 'canManageTeam', 'seesAll', 'scopeOf', 'inScope', 'rolesIssues', 'parseRoleTitle',
  'applyBootstrapOwner', 'healFounderRole']) {
  t('server defines ' + name + '()', new RegExp('function\\s+' + name + '\\b').test(server));
}

/* ---------- 2. the override happens in exactly ONE place per backend ---------- */
t('worker: permissionRole overrides for the designated admin first',
  /function permissionRole\(user, env\) \{\s*\n\s*if \(isHiddenAdmin\(user, env\)\) return 'owner';/.test(worker));
t('server: permissionRole overrides for the designated admin first',
  /function permissionRole\(user\) \{\s*\n\s*if \(isHiddenAdmin\(user\)\) return 'owner';/.test(server));
t('worker: both gate levels route through permissionRole',
  /function requireRole\(user, minRole, env\) \{\s*\n\s*return roleRank\(permissionRole\(user, env\)\)/.test(worker) &&
  /function canManageTeam\(user, env\) \{\s*\n\s*return requireRole\(user, 'owner', env\)/.test(worker) &&
  /function seesAll\(user, env\) \{\s*\n\s*return requireRole\(user, 'owner', env\)/.test(worker));

/* ---------- 3. C1: the heal targets the admin's OWN row, never OWNER_EMAIL ---------- */
const heal = worker.slice(worker.indexOf('async function healFounderRole'), worker.indexOf('async function applyOwnerBootstrap'));
t('C1 worker: heal is gated on isHiddenAdmin(actor)', /isHiddenAdmin\(actor, env\)/.test(heal));
t('C1 worker: heal writes actor.id (its OWN row)', /actor\.id/.test(heal));
t('C1 worker: heal never selects by OWNER_EMAIL', !/ownerEmail\(env\)/.test(heal) && !/OWNER_EMAIL/.test(heal));
t('C1 worker: heal stamps viewer + Founder', /role = 'viewer', role_custom = 'Founder'/.test(heal));
t('C1 worker: heal keeps the P1 conflict guard', /adminOwnerConflict\(env\)/.test(heal));
const healS = server.slice(server.indexOf('function healFounderRole'), server.indexOf('function applyOwnerBootstrap'));
t('C1 server: heal mutates the passed-in user only', /user\.role = 'viewer'/.test(healS) && /user\.role_custom = 'Founder'/.test(healS));
t('C1 server: heal never selects by OWNER_EMAIL', !/ownerEmail\(\)/.test(healS));

/* ---------- 4. C2: the owner bootstrap is unconditional ---------- */
const boot = worker.slice(worker.indexOf('async function ensureBootstrapOwner'), worker.indexOf('/* Founder self-heal'));
t('C2 worker: bootstrap matches on OWNER_EMAIL', /ownerEmail\(env\)/.test(boot));
t('C2 worker: bootstrap has NO typed-title gate', !/if \(user\.role_custom\)/.test(boot) && !/role_custom\) return/.test(boot));
t('C2 worker: bootstrap clears the title on promotion', /role_custom = NULL/.test(boot));
const bootS = server.slice(server.indexOf('function applyBootstrapOwner'), server.indexOf('/* Founder self-heal'));
t('C2 server: bootstrap has NO typed-title gate', !/if \(user\.role_custom\)/.test(bootS) && !/role_custom\) return/.test(bootS));

/* ---------- 5. C4 + item 5: every owner-scoped SQL site is rewritten and bound right ---------- */
let scopeSites = 0, badBinds = [], portalRewritten = false, rawLeft = 0;
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

/* the token-based portal query has no user context and must be untouched */
const portalFn = worker.slice(worker.indexOf('async function notifyFromPortalEvent'));
const portalBody = portalFn.slice(0, portalFn.indexOf('\n}') + 2);
t('C4: portal query keeps its literal owner_id filter', portalBody.includes('owner_id = ?'));
t('C4: portal query has NO scope guard', !portalBody.includes('OWN_SCOPE'));
t('C4: portal function has no user/env in scope', !/\(db, ev, (user|env)/.test(portalBody) && /function notifyFromPortalEvent\(db, ev\)/.test(portalBody));

/* ---------- 5b. latch fix: a deliberate visible promote of the designated
           admin must STICK, with no schema change ---------- */
for (const [label, src] of [['worker', worker], ['server', server]]) {
  /* The heal latch has to be an explicit NULL test. '' is falsy in JavaScript,
     so a truthiness latch would treat a deliberate promotion exactly like NULL
     and undo it on the next sign-in. */
  t(label + ': heal latch tests NULL-ness, not truthiness',
    /role_custom != null\) return false/.test(src),
    'expected `... || <actor|user>.role_custom != null) return false`');
  t(label + ': heal latch is not a bare truthiness check',
    !/\|\| (actor|user)\.role_custom\) return false/.test(src));
  /* setTeamRole stores '' (not NULL) when it promotes the designated admin. */
  t(label + ': setTeamRole stores \'\' when promoting the designated admin to owner',
    /const storedCustom = \(parsed\.role === 'owner' && isHiddenAdmin\(target(, env)?\)\)\s*\n\s*\? ''\s*\n\s*: parsed\.roleCustom;/.test(src));
  t(label + ': the stored value is written, not the parsed one',
    /role_custom = storedCustom|target\.role_custom = storedCustom/.test(src));
  /* No schema change: the latch fix must not add a column or a migration. */
  t(label + ': latch fix needs no new column', !/settled|heal_done|latch_|founder_healed/i.test(src));
}
t('worker: heal UPDATE is guarded so concurrent admin sessions cannot double-stamp',
  /WHERE id = \? AND role = 'owner' AND role_custom IS NULL/.test(worker));
t('display: roleDisplay still falls through on an empty title',
  /if \(u\.role_custom\) return String\(u\.role_custom\);/.test(worker) &&
  /if \(u\.role_custom\) return String\(u\.role_custom\);/.test(server));

/* ---------- 6. server.js in-memory parity ---------- */
/* 47 call sites, plus the one occurrence inside the inScope() definition
   itself (`row.owner_id === scope`), which is not a call site. */
const inScopeCount = (server.match(/inScope\(scope, /g) || []).length - 1;
t('server: 47 staff ownership tests routed through inScope', inScopeCount === 47, inScopeCount);
t('server: no raw `owner_id === user.id` staff filter left', !/owner_id === user\.id/.test(server));
t('server: per-request scope declared at the staff gate', /const scope = scopeOf\(user\);/.test(server));
t('server: token-context owner_id untouched', (server.match(/owner_id: tok\.owner_id/g) || []).length === 3);
t('server: inScope lifts the filter only for null scope',
  /function inScope\(scope, row\) \{\s*\n\s*return scope === null \|\| \(row && row\.owner_id === scope\);/.test(server));

/* ---------- 7. display contract: typed title wins, never "Admin" ---------- */
for (const [label, src] of [['worker', worker], ['server', server]]) {
  const rd = src.slice(src.indexOf('function roleDisplay'), src.indexOf('function publicUser'));
  t(label + ': roleDisplay prefers the typed title', rd.indexOf('u.role_custom') < rd.indexOf("r === 'owner'"));
  t(label + ': no literal "Admin" label is ever produced', !/return\s+'Admin'|roleLabel:\s*'Admin'|=\s*'Admin'/.test(src));
}
t('worker: publicUser exposes canWrite + canManageTeam + seesAll',
  /canWrite: roleRank\(permissionRole\(u, env\)\) >= roleRank\('sales'\)/.test(worker) &&
  /canManageTeam: admin,/.test(worker) && /seesAll: seesAll\(u, env\)/.test(worker));

/* ---------- 8. CODE_VERSION marker agrees across backends ---------- */
const wv = /const CODE_VERSION = '([^']+)'/.exec(worker);
const sv = /const CODE_VERSION = '([^']+)'/.exec(server);
t('both backends define CODE_VERSION', !!wv && !!sv);
t('CODE_VERSION matches across backends', !!wv && !!sv && wv[1] === sv[1], (wv && wv[1]) + ' vs ' + (sv && sv[1]));
for (const [label, src] of [['worker', worker], ['server', server]]) {
  t(label + ': health exposes codeVersion + warnings', /codeVersion: CODE_VERSION/.test(src) && /warnings/.test(src));
}

/* ---------- 9. C6: no signup/title blocklist ---------- */
for (const [label, src] of [['worker', worker], ['server', server]]) {
  const ps = src.slice(src.indexOf('function parseSignupRole'), src.indexOf('function parseRoleTitle'));
  t(label + ': parseSignupRole has no blocklist', !/blocklist|reserved|deny|forbidden/i.test(ps));
  t(label + ': parseSignupRole still maps the three power keys',
    /key === 'owner'/.test(ps) && /key === 'sales'/.test(ps) && /key === 'viewer'/.test(ps));
  const pr = src.slice(src.indexOf('function parseRoleTitle'), src.indexOf('function roleDisplay'));
  t(label + ': parseRoleTitle never maps a keyword to power', !/key === 'owner'|role: 'owner'/.test(pr));
  t(label + ': parseRoleTitle validates length only', /typed\.length > 60/.test(pr));
}

/* ---------- 10. frozen files: this patch must not touch them ---------- */
let frozen = [];
try {
  const out = execFileSync('git', ['diff', '--name-only', 'origin/main'], { cwd: ROOT, encoding: 'utf8' });
  const changed = out.split('\n').filter(Boolean);
  const FROZEN = /assets\/js\/(finance|export|render|bess|additional-systems|storage-catalog|model|salutation|supplement-design)\.js$|^quotation\.html$/;
  frozen = changed.filter((f) => FROZEN.test(f));
  t('FROZEN calc/pricing/finance/export files untouched', frozen.length === 0, frozen.join(', '));
  t('phone button + Firebase untouched', !changed.some((f) => /phone/i.test(f)));
  t('wrangler config / zone / NS untouched', !changed.some((f) => /wrangler|vercel\.json/.test(f)));
  /* Allowlist of files this round may touch. Anything outside it means the
     patch wandered - notably into the frozen calculation/finance/export set,
     the phone/Firebase code, or a deploy config. */
  const ALLOWED = /^(platform\/cloudflare\/src\/worker\.js|platform\/local-server\/server\.js|assets\/js\/(dashboard|dashboard-home|platform-api|cloud-bridge)\.js|assets\/css\/dashboard\.css|dashboard\.html|qa\/[^/]+|docs\/[^/]+\.md)$/;
  t('changed files are the intended set', changed.every((f) => ALLOWED.test(f)),
    changed.filter((f) => !ALLOWED.test(f)).join(', '));
} catch (e) {
  t('git diff available to check the frozen list', false, e.message);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
