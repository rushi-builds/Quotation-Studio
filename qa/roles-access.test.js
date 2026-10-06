/* Elevation-model roles / auth / visibility — behaviour tests against the local
   server. Run: node roles-access.test.js   (starts its own server on an
   ephemeral port)

   Covers the contract the Cloudflare worker implements too; the worker half is
   checked structurally by qa/roles-parity.test.js because running a Worker
   needs wrangler, which is not available in this suite.

   The model under test:

     OWNER_EMAIL  the company mailbox. Promoted to owner unconditionally on
                  every request, so it is always the visible Owner.
     ADMIN_EMAIL  a personal mailbox that MAY elevate. Its stored row is left
                  EXACTLY as it is - nothing demotes or retitles it
                  automatically - and reach comes from ADMIN_EMAIL, and
                  permanently from the stored is_admin flag once it elevates
                  itself. The OWNER_EMAIL bootstrap is the only automatic role
                  transition left in the product.
     is_admin     stored elevation. Outranks owner. Changes no display field.

   Deliberately NOT covered here: Firebase / phone auth (untouched by this
   round), and browser rendering of the team panel (no CI browser). */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'platform/local-server/server.js');

const OWNER = 'company@ktm.example';
const ADMIN = 'admin-personal@ktm.example';
const SALES = 'sales@ktm.example';
const MEMBER = 'member@ktm.example';
const VIEWER = 'viewer@ktm.example';
const PASSWORD = 'password123';

let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name, extra !== undefined ? '→ ' + String(extra).slice(0, 300) : ''); }
};

function req(port, method, urlPath, body, auth) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      ...(auth ? { Authorization: 'Bearer ' + auth } : {})
    };
    const r = http.request({ hostname: '127.0.0.1', port, path: urlPath, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (_) { json = { raw: text }; }
        resolve({ status: res.statusCode, json });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function startServer(port, dataDir, env) {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  const child = spawn(process.execPath, [SERVER], {
    env: Object.assign({}, process.env, {
      PORT: String(port),
      HOST: '127.0.0.1',
      QS_DATA_DIR: dataDir,
      ...env
    }),
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server start timeout')), 8000);
    child.stdout.on('data', (buf) => { if (String(buf).includes('Dash:')) { clearTimeout(timer); resolve(); } });
    child.stderr.on('data', (buf) => process.stderr.write(buf));
    child.on('exit', (code) => reject(new Error('server exited early ' + code)));
  });
  return { child, ready };
}

async function register(port, email, name, role) {
  const r = await req(port, 'POST', '/api/auth/register', { email, name, password: PASSWORD, role });
  if (r.status !== 201) throw new Error('register failed for ' + email + ': ' + r.status + ' ' + JSON.stringify(r.json));
  return r.json;
}
async function login(port, email) {
  const r = await req(port, 'POST', '/api/auth/login', { email, password: PASSWORD });
  if (r.status !== 200) throw new Error('login failed for ' + email + ': ' + r.status);
  return r.json;
}

/* The three fields a human being actually reads. Stealth means these are
   identical before and after an elevation — nothing else in the payload
   matters, because nothing else is rendered. */
const displayOf = (o) => [o && o.role, o && o.roleCustom, o && o.roleLabel].map((v) => (v == null ? null : String(v))).join('|');
const hasAdminWord = (o) => /admin/i.test(String((o && o.roleLabel) || '')) ||
  /admin/i.test(String((o && o.roleCustom) || '')) ||
  String((o && o.role) || '').toLowerCase() === 'admin';

async function main() {
  const PORT = 8991 + Math.floor(Math.random() * 90);
  const DATA = path.join(ROOT, 'platform/data-roles-test');
  const srv = startServer(PORT, DATA, { OWNER_EMAIL: OWNER, ADMIN_EMAIL: ADMIN });
  await srv.ready;
  const fixturePath = path.join(DATA, 'db.json');
  const readRow = (email) => JSON.parse(fs.readFileSync(fixturePath, 'utf8')).users.find((u) => u.email === email);

  try {
    console.log('\nroles-access (elevation model: is_admin, no auto-demotion, stealth)');

    /* ---- fixture: four accounts ----
       Registration is open and never grants power. The ADMIN_EMAIL row is then
       forced to owner with a NULL title to reproduce today's live D1 exactly:
       that is the state the removed heal used to demote, and it must now
       survive untouched. */
    const adminReg = await register(PORT, ADMIN, 'Personal Mailbox', 'Sales');
    const salesReg = await register(PORT, SALES, 'Second Owner', 'Sales');
    const memberReg = await register(PORT, MEMBER, 'Sales Member', 'Sales');
    const viewerReg = await register(PORT, VIEWER, 'View Only', 'Viewer');

    t('signup writes is_admin = 0 explicitly (JSON rows carry the flag like SQL rows)',
      readRow(ADMIN).is_admin === 0, JSON.stringify(readRow(ADMIN).is_admin));
    t('signup never elevates, whatever role word was typed', readRow(SALES).is_admin === 0 && readRow(MEMBER).is_admin === 0 && readRow(VIEWER).is_admin === 0,
      [readRow(SALES).is_admin, readRow(MEMBER).is_admin, readRow(VIEWER).is_admin].join(','));

    let fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const setRow = (email, role) => {
      const u = fixture.users.find((x) => x.email === email);
      u.role = role; u.role_custom = null;
    };
    setRow(ADMIN, 'owner');
    setRow(SALES, 'owner');
    setRow(MEMBER, 'sales');
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));

    /* ---- health: version marker, elevation feature, no P1 warning ---- */
    let r = await req(PORT, 'GET', '/api/health');
    t('health reports the code version marker', r.status === 200 && r.json.codeVersion === 'roles-r1', r.json && r.json.codeVersion);
    t('health advertises features.elevation', r.status === 200 && r.json.features && r.json.features.elevation === true, JSON.stringify(r.json && r.json.features));
    t('health roles[] has no "admin" entry (elevation is not a role)', r.status === 200 && !(r.json.features.roles || []).includes('admin'), JSON.stringify(r.json && r.json.features.roles));
    t('health has no warning when ADMIN_EMAIL != OWNER_EMAIL', r.status === 200 && Array.isArray(r.json.warnings) && r.json.warnings.length === 0, JSON.stringify(r.json && r.json.warnings));
    t('health never names either mailbox', r.status === 200 && !JSON.stringify(r.json).includes(ADMIN) && !JSON.stringify(r.json).includes(OWNER));

    /* ---- item 1: NOTHING is automatic. The ADMIN_EMAIL row is left alone ----
       This is the behaviour the spec owner asked for: whatever role that row
       holds, it keeps. An earlier revision demoted owner -> viewer on sign-in,
       which also silently undid a deliberate promotion, so it is gone. */
    const adminSess = await login(PORT, ADMIN);
    let adminRow = readRow(ADMIN);
    t('no auto-demotion: the ADMIN_EMAIL row keeps its stored role', adminRow.role === 'owner', adminRow.role);
    t('no auto-demotion: role_custom stays NULL — no title is stamped', adminRow.role_custom === null, JSON.stringify(adminRow.role_custom));
    t('no auto-demotion: other owner rows are untouched too', readRow(SALES).role === 'owner', readRow(SALES).role);
    t('the word Founder appears nowhere in the row', !/founder/i.test(JSON.stringify(adminRow)), JSON.stringify(adminRow).slice(0, 200));
    for (let i = 0; i < 4; i++) { await login(PORT, ADMIN); await req(PORT, 'GET', '/api/auth/me', null, adminSess.token); }
    t('no auto-demotion across repeated sign-ins and requests (no oscillation)',
      readRow(ADMIN).role === 'owner' && readRow(ADMIN).role_custom === null,
      readRow(ADMIN).role + '/' + JSON.stringify(readRow(ADMIN).role_custom));

    let me = await req(PORT, 'GET', '/api/auth/me', null, adminSess.token);
    t('display is the stored role, unchanged ("Owner")', me.json.user.roleLabel === 'Owner', me.json.user.roleLabel);
    t('no display field reads Admin', !hasAdminWord(me.json.user), displayOf(me.json.user));

    /* ---- C3 flags on this row. The row is owner, so this proves the flags are
           present and correct, not yet that ADMIN_EMAIL overrides anything. The
           override is proven properly further down, on a row demoted to viewer:
           see "C3 proof, on a row that is NOT owner". ---- */
    t('C3 both levels: canWrite (sales gate) is true', me.json.user.canWrite === true, JSON.stringify(me.json.user));
    t('C3 both levels: canManageTeam (owner gate) is true', me.json.user.canManageTeam === true, JSON.stringify(me.json.user));
    t('C3 both levels: seesAll is true', me.json.user.seesAll === true);
    t('/me reports canElevate for the designated mailbox', me.json.user.canElevate === true, JSON.stringify(me.json.user.canElevate));
    t('/me reports isAdmin before elevating (ADMIN_EMAIL alone counts)', me.json.user.isAdmin === true, JSON.stringify(me.json.user.isAdmin));

    r = await req(PORT, 'POST', '/api/proposals', { title: 'Designated admin can create', customer_name: 'Admin Client' }, adminSess.token);
    t('C3 proof: designated admin (viewer row) can CREATE a proposal', r.status === 200 || r.status === 201, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    const adminProposalId = r.json && r.json.proposal ? r.json.proposal.id : (r.json && r.json.id);

    r = await req(PORT, 'GET', '/api/team/members', null, adminSess.token);
    t('C3 proof: designated admin can LIST the team (owner gate)', r.status === 200 && Array.isArray(r.json.members), r.status);
    t('team response tells the actor it manages the team', r.json.canManageTeam === true, JSON.stringify(r.json.canManageTeam));

    /* ---- item 3/4/5: ELEVATION roundtrip, and the zero display delta ---- */
    const preElevate = displayOf(me.json.user);
    /* Snapshot the stored columns so the assertions below compare against what
       the row actually held, not against a hardcoded role. */
    const preRole = readRow(ADMIN).role;
    const preCustom = readRow(ADMIN).role_custom;
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'custom', roleCustom: 'admin' }, adminSess.token);
    t('elevate: self-elevation returns 200', r.status === 200, r.status + ' ' + JSON.stringify(r.json).slice(0, 200));
    t('elevate: stored is_admin = 1', readRow(ADMIN).is_admin === 1, JSON.stringify(readRow(ADMIN).is_admin));
    t('elevate: role and role_custom were NOT written', readRow(ADMIN).role === preRole && readRow(ADMIN).role_custom === preCustom,
      preRole + '/' + JSON.stringify(preCustom) + ' -> ' + readRow(ADMIN).role + '/' + JSON.stringify(readRow(ADMIN).role_custom));
    t('elevate: ZERO display delta in the response', displayOf(r.json.member) === preElevate, preElevate + ' -> ' + displayOf(r.json.member));
    t('elevate: response note says the display did not change', typeof r.json.note === 'string' && /display/i.test(r.json.note), r.json.note);
    t('elevate: own row reports isAdmin true', r.json.member.isAdmin === true);
    t('elevate: own row reports canElevate true', r.json.member.canElevate === true);
    t('elevate: own row carries effectiveCanManageTeam', r.json.member.effectiveCanManageTeam === true, JSON.stringify(r.json.member.effectiveCanManageTeam));

    me = await req(PORT, 'GET', '/api/auth/me', null, adminSess.token);
    t('elevate: ZERO display delta on the next /me', displayOf(me.json.user) === preElevate, preElevate + ' -> ' + displayOf(me.json.user));
    t('elevate: powers are intact', me.json.user.canWrite === true && me.json.user.canManageTeam === true && me.json.user.seesAll === true);

    /* Nothing writes the role back, elevated or not. */
    await login(PORT, ADMIN);
    await req(PORT, 'GET', '/api/auth/me', null, adminSess.token);
    t('an elevated row keeps its stored role across further requests', readRow(ADMIN).role === 'owner' && readRow(ADMIN).is_admin === 1,
      readRow(ADMIN).role + '/' + JSON.stringify(readRow(ADMIN).is_admin));

    /* ---- item 4 EXTRA: elevated outranks owner, so an admin can edit owners ---- */
    const ownerReg = await register(PORT, OWNER, 'KTM Energy', 'Project lead');
    const ownerSess = await login(PORT, OWNER);
    r = await req(PORT, 'POST', '/api/team/role', { userId: ownerReg.user.id, role: 'custom', roleCustom: 'Operations' }, adminSess.token);
    t('more than owner: an elevated actor CAN change the bootstrap owner row', r.status === 200 && r.json.member.roleCustom === 'Operations',
      r.status + ' ' + JSON.stringify(r.json).slice(0, 200));
    await login(PORT, OWNER);
    t('...and the unconditional bootstrap puts OWNER_EMAIL straight back', readRow(OWNER).role === 'owner', readRow(OWNER).role);

    /* ---- item 4: an owner who is NOT the designated admin cannot touch it ---- */
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'viewer' }, ownerSess.token);
    t('owner cannot change an elevated row (403)', r.status === 403, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    const elevatedRefusal = { status: r.status, body: r.json };
    t('owner refusal says "Ask admin" and nothing more', r.json && r.json.error === 'Ask admin', JSON.stringify(r.json));
    /* The refusal must not identify WHICH row is elevated. The two things an
       owner can try on an elevated row — change its power, or retitle it — must
       produce BYTE-IDENTICAL refusals, or the difference itself would tell the
       owner which row is elevated. */
    t('owner refusal names no row and no stored flag', !/is_admin|ELEVATED_TARGET/i.test(JSON.stringify(r.json)), JSON.stringify(r.json));
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'custom', roleCustom: 'Director' }, ownerSess.token);
    const retitleRefusal = { status: r.status, body: r.json };
    t('owner cannot retitle an elevated row either', r.status === 403 && r.json.error === 'Ask admin', r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    t('stealth: changing power and retitling an elevated row are indistinguishable',
      retitleRefusal.status === elevatedRefusal.status && JSON.stringify(retitleRefusal.body) === JSON.stringify(elevatedRefusal.body),
      JSON.stringify(elevatedRefusal) + ' vs ' + JSON.stringify(retitleRefusal));
    t('the elevated row is still is_admin = 1 after both refusals', readRow(ADMIN).is_admin === 1, JSON.stringify(readRow(ADMIN).is_admin));

    /* ---- item 3: nobody else may elevate. For anyone but the designated
       ADMIN_EMAIL login, typing "admin" is a harmless custom title with sales
       power (C6) — never elevation, never is_admin. ---- */
    r = await req(PORT, 'POST', '/api/team/role', { userId: salesReg.user.id, role: 'custom', roleCustom: 'admin' }, ownerSess.token);
    t('a non-admin owner typing "admin" on another row sets a harmless custom title (200, sales power)',
      r.status === 200 && r.json.member.power === 'sales' && r.json.member.roleCustom === 'admin', r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    t('...and it did NOT elevate that row', readRow(SALES).is_admin === 0, JSON.stringify(readRow(SALES).is_admin));
    await req(PORT, 'POST', '/api/team/role', { userId: salesReg.user.id, role: 'owner' }, ownerSess.token); /* restore */

    r = await req(PORT, 'POST', '/api/team/role', { userId: ownerReg.user.id, role: 'custom', roleCustom: 'admin' }, ownerSess.token);
    t('the OWNER_EMAIL row is not elevated by typing "admin" either (is_admin stays 0)', readRow(OWNER).is_admin === 0, JSON.stringify(readRow(OWNER).is_admin));
    await req(PORT, 'POST', '/api/team/role', { userId: ownerReg.user.id, role: 'owner', roleCustom: '' }, ownerSess.token); /* restore */

    r = await req(PORT, 'POST', '/api/team/role', { userId: ownerReg.user.id, role: 'custom', roleCustom: 'admin' }, adminSess.token);
    t('the designated admin cannot elevate ANOTHER row (self-only)', r.status === 403 && r.json.code === 'ELEVATION_NOT_SELF', r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    t('no second row became elevated', readRow(OWNER).is_admin === 0 && readRow(SALES).is_admin === 0 && readRow(MEMBER).is_admin === 0,
      [readRow(OWNER).is_admin, readRow(SALES).is_admin, readRow(MEMBER).is_admin].join(','));

    const memberSess = await login(PORT, MEMBER);
    r = await req(PORT, 'POST', '/api/team/role', { userId: memberReg.user.id, role: 'custom', roleCustom: 'admin' }, memberSess.token);
    t('an ordinary member cannot reach the role route at all (owner gate, 403)', r.status === 403, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    t('and its stored flag did not move', readRow(MEMBER).is_admin === 0, JSON.stringify(readRow(MEMBER).is_admin));

    /* ---- R2 OFF-switch: the designated admin setting its OWN role to anything
       else de-elevates (is_admin = 0). Unlike elevation this is a real role
       change, so the display DOES move. No "unadmin" word, no toggle. ---- */
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'sales' }, adminSess.token);
    t('de-elevate: 200 and stored is_admin = 0 (R2 off-switch)', r.status === 200 && readRow(ADMIN).is_admin === 0, r.status + ' ' + JSON.stringify(readRow(ADMIN).is_admin));
    t('de-elevate: the chosen role is applied (display moves to Sales)', displayOf(r.json.member) === 'sales||Sales', displayOf(r.json.member));
    t('de-elevate: stored role is now sales with no title', readRow(ADMIN).role === 'sales' && readRow(ADMIN).role_custom === null,
      readRow(ADMIN).role + '/' + JSON.stringify(readRow(ADMIN).role_custom));
    me = await req(PORT, 'GET', '/api/auth/me', null, adminSess.token);
    t('de-elevate: /me `elevated` (the red-dot flag) is now false', me.json.user.elevated === false, JSON.stringify(me.json.user.elevated));
    t('de-elevate: isAdmin stays true — reach persists from ADMIN_EMAIL alone', me.json.user.isAdmin === true && me.json.user.canManageTeam === true && me.json.user.canWrite === true);
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'viewer' }, ownerSess.token);
    t('after de-elevating, an owner CAN change the row again', r.status === 200, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    t('roundtrip complete: back to viewer with no title', readRow(ADMIN).role === 'viewer' && readRow(ADMIN).role_custom === null && readRow(ADMIN).is_admin === 0,
      readRow(ADMIN).role + '/' + JSON.stringify(readRow(ADMIN).role_custom) + '/' + JSON.stringify(readRow(ADMIN).is_admin));
    /* Put the row back how the rest of the suite expects it, and prove an
       owner's role change to this row is now possible again. */
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'custom', roleCustom: 'Director' }, ownerSess.token);
    t('owner can set a deliberate typed title once elevation is gone', r.status === 200 && r.json.member.roleCustom === 'Director', JSON.stringify(r.json).slice(0, 200));
    await login(PORT, ADMIN);
    t('a deliberate typed title sticks (nothing writes the role or title back)',
      readRow(ADMIN).role === 'custom' && readRow(ADMIN).role_custom === 'Director',
      readRow(ADMIN).role + '/' + readRow(ADMIN).role_custom);

    /* ---- a deliberate promote to visible Owner STICKS ----
       This is the behaviour the spec owner asked for. It used to be undone on
       the next sign-in by the heal; nothing undoes it now. */
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'owner' }, ownerSess.token);
    t('owner can promote the designated admin row to owner', r.status === 200 && r.json.member.role === 'owner', r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    t('promotion stores NULL, never an empty string', r.json.member.roleCustom === null, JSON.stringify(r.json.member.roleCustom));
    t('promotion displays "Owner"', r.json.member.roleLabel === 'Owner', r.json.member.roleLabel);
    t('promotion badge is the stored role', r.json.member.power === 'owner' && r.json.member.canManageTeam === true, JSON.stringify(r.json.member));
    for (let i = 0; i < 3; i++) await login(PORT, ADMIN);
    t('PROMOTION STICKS: the row is still owner after repeated ADMIN_EMAIL sign-ins',
      readRow(ADMIN).role === 'owner' && readRow(ADMIN).role_custom === null,
      readRow(ADMIN).role + '/' + JSON.stringify(readRow(ADMIN).role_custom));
    const promoted = await req(PORT, 'GET', '/api/auth/me', null, (await login(PORT, ADMIN)).token);
    t('and the promoted login displays "Owner" with full powers',
      promoted.json.user.roleLabel === 'Owner' && promoted.json.user.canWrite === true &&
      promoted.json.user.canManageTeam === true && promoted.json.user.seesAll === true,
      JSON.stringify(promoted.json.user).slice(0, 200));

    /* ---- C3 proof, on a row that is NOT owner ----
       Demote the designated admin to viewer. The demotion must stick (nothing
       restores it), and the account must STILL clear both gate levels - that is
       what proves ADMIN_EMAIL grants powers rather than the role column. */
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'viewer' }, ownerSess.token);
    t('an owner can demote the designated admin row once it is not elevated', r.status === 200 && r.json.member.role === 'viewer',
      r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    for (let i = 0; i < 3; i++) await login(PORT, ADMIN);
    t('the demotion STICKS too - nothing restores the role automatically',
      readRow(ADMIN).role === 'viewer' && readRow(ADMIN).role_custom === null,
      readRow(ADMIN).role + '/' + JSON.stringify(readRow(ADMIN).role_custom));

    const demotedSess = await login(PORT, ADMIN);
    const demotedMe = await req(PORT, 'GET', '/api/auth/me', null, demotedSess.token);
    t('C3 on a viewer row: canWrite (sales gate) is true', demotedMe.json.user.canWrite === true, JSON.stringify(demotedMe.json.user).slice(0, 200));
    t('C3 on a viewer row: canManageTeam (owner gate) is true', demotedMe.json.user.canManageTeam === true, JSON.stringify(demotedMe.json.user).slice(0, 200));
    t('C3 on a viewer row: seesAll is true', demotedMe.json.user.seesAll === true);
    t('C3 on a viewer row: the display is honestly "Viewer"', demotedMe.json.user.roleLabel === 'Viewer', demotedMe.json.user.roleLabel);
    r = await req(PORT, 'POST', '/api/proposals', { title: 'Demoted designated admin can still create', customer_name: 'C3 Client' }, demotedSess.token);
    t('C3 proof: a viewer-row designated admin can CREATE a proposal (sales gate)', r.status === 200 || r.status === 201, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'viewer' }, demotedSess.token);
    t('C3 proof: a viewer-row designated admin passes the OWNER write gate', r.status === 200, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));

    /* Elevate from the viewer row: this is where rank 4 earns its keep. */
    const viewerDisplay = displayOf(demotedMe.json.user);
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'custom', roleCustom: 'admin' }, demotedSess.token);
    t('re-elevate from a viewer row', r.status === 200 && readRow(ADMIN).is_admin === 1, r.status + ' ' + JSON.stringify(readRow(ADMIN).is_admin));
    t('re-elevate changed no display field', displayOf(r.json.member) === viewerDisplay, viewerDisplay + ' -> ' + displayOf(r.json.member));
    t('re-elevate left the stored role as viewer', readRow(ADMIN).role === 'viewer' && readRow(ADMIN).role_custom === null,
      readRow(ADMIN).role + '/' + JSON.stringify(readRow(ADMIN).role_custom));
    /* And now promote it while elevated: an owner could not touch an elevated
       row, but the elevated actor can change its OWN row. Per R2, choosing a
       real role (owner) is itself the off-switch, so this also clears is_admin. */
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'owner' }, demotedSess.token);
    t('an elevated actor can promote its OWN row to a visible Owner', r.status === 200 && readRow(ADMIN).role === 'owner',
      r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    for (let i = 0; i < 3; i++) await login(PORT, ADMIN);
    t('promoting itself to a real role de-elevates (R2) and the owner role sticks',
      readRow(ADMIN).role === 'owner' && readRow(ADMIN).is_admin === 0,
      readRow(ADMIN).role + '/' + JSON.stringify(readRow(ADMIN).is_admin));

    /* ---- an ordinary member's promotion must not inherit any of this ---- */
    r = await req(PORT, 'POST', '/api/team/role', { userId: memberReg.user.id, role: 'owner' }, ownerSess.token);
    t('ordinary member promoted to owner stores NULL, not empty string', r.status === 200 && r.json.member.roleCustom === null && r.json.member.roleLabel === 'Owner', JSON.stringify(r.json.member).slice(0, 200));
    t('ordinary member promotion does not elevate', readRow(MEMBER).is_admin === 0, JSON.stringify(readRow(MEMBER).is_admin));
    r = await req(PORT, 'POST', '/api/team/role', { userId: memberReg.user.id, role: 'sales' }, ownerSess.token);
    t('fixture restore: member row is back to sales', r.status === 200 && r.json.member.role === 'sales', JSON.stringify(r.json.member).slice(0, 160));

    /* ---- item 5: owner-sees-all vs members own-only ---- */
    r = await req(PORT, 'POST', '/api/proposals', { title: 'Member own proposal', customer_name: 'Member Client' }, memberSess.token);
    t('sales member can create its own proposal', r.status === 200 || r.status === 201, r.status);
    const salesProposalId = r.json && r.json.proposal ? r.json.proposal.id : (r.json && r.json.id);

    r = await req(PORT, 'GET', '/api/proposals', null, adminSess.token);
    const adminList = (r.json && r.json.proposals) || [];
    t('owner-sees-all: elevated admin list contains the member proposal', adminList.some((p) => p.id === salesProposalId), adminList.map((p) => p.id).join(','));

    r = await req(PORT, 'GET', '/api/proposals', null, memberSess.token);
    const salesList = (r.json && r.json.proposals) || [];
    t('members own-only: member list does NOT contain the admin proposal', !salesList.some((p) => p.id === adminProposalId), salesList.map((p) => p.id).join(','));
    t('members own-only: member list still contains its own proposal', salesList.some((p) => p.id === salesProposalId));

    r = await req(PORT, 'GET', '/api/proposals/' + salesProposalId, null, adminSess.token);
    t('owner-sees-all: elevated admin can OPEN another member proposal detail', r.status === 200, r.status);
    r = await req(PORT, 'GET', '/api/proposals/' + adminProposalId, null, memberSess.token);
    t('members own-only: member CANNOT open the admin proposal detail', r.status === 404, r.status);

    /* ---- S1: the team-panel badge is the STORED role, never Admin ---- */
    r = await req(PORT, 'GET', '/api/team/members', null, ownerSess.token);
    t('owner can still list the team', r.status === 200 && Array.isArray(r.json.members), r.status);
    let members = (r.json && r.json.members) || [];
    t('team list returns every member', members.length === 5, members.length);
    const adminMember = members.find((m) => m.email === ADMIN);
    t('S1: the elevated row badge reads its STORED role, never admin',
      adminMember && adminMember.power === (readRow(ADMIN).role === 'owner' ? 'owner' : readRow(ADMIN).role === 'viewer' ? 'viewer' : 'sales'),
      adminMember && adminMember.power + ' vs stored ' + readRow(ADMIN).role);
    t('S1: the elevated row label is neutral', adminMember && !hasAdminWord(adminMember), adminMember && displayOf(adminMember));
    t('S1: no team row is ever labelled Admin', !members.some((m) => hasAdminWord(m)), members.map(displayOf).join(' ; '));
    t('S1: no team row power is ever "admin"', !members.some((m) => String(m.power).toLowerCase() === 'admin'), members.map((m) => m.power).join(','));

    /* ---- S2: elevation is disclosed about nobody else ---- */
    /* S2 is actor-relative: the ONLY row that may carry an elevation field is
       the requester's own. Here the actor is the owner, so the elevated row is
       a stranger's row and must look completely ordinary. */
    const others = members.filter((m) => m.id !== ownerReg.user.id);
    t('S2: no OTHER member row carries isAdmin', !others.some((m) => 'isAdmin' in m),
      JSON.stringify(others.map((m) => Object.keys(m))));
    t('S2: no OTHER member row carries canElevate', !others.some((m) => 'canElevate' in m));
    t('S2: no OTHER member row carries an effective* field', !others.some((m) => Object.keys(m).some((k) => /^effective/.test(k))));
    t('S2: exactly one row carries isAdmin, and it is the actor own row',
      members.filter((m) => 'isAdmin' in m).length === 1 && members.find((m) => 'isAdmin' in m).id === ownerReg.user.id,
      members.filter((m) => 'isAdmin' in m).map((m) => m.email).join(','));
    t('S2: the ELEVATED row is byte-identical in shape to an ordinary row',
      JSON.stringify(Object.keys(members.find((m) => m.email === ADMIN) || {})) === JSON.stringify(Object.keys(members.find((m) => m.email === VIEWER) || {})),
      JSON.stringify(Object.keys(members.find((m) => m.email === ADMIN) || {})));
    t('S2: another member canWrite is the STORED-role value', (members.find((m) => m.email === MEMBER) || {}).canWrite === true
      && (members.find((m) => m.email === VIEWER) || {}).canWrite === false,
      JSON.stringify(members.map((m) => [m.email, m.canWrite])));

    /* The same, seen by a member rather than by the owner. */
    r = await req(PORT, 'GET', '/api/team/members', null, memberSess.token);
    t('item 5: every member may READ the team panel', r.status === 200 && Array.isArray(r.json.members), r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    members = (r.json && r.json.members) || [];
    t('a member is told it does not manage the team', r.json.canManageTeam === false, JSON.stringify(r.json.canManageTeam));
    t('item 5: contact detail is owner/admin only — no email on another row', !members.filter((m) => m.email !== MEMBER).some((m) => 'email' in m && m.email),
      JSON.stringify(members.map((m) => m.email)));
    t('a member keeps its own email', (members.find((m) => m.id === memberReg.user.id) || {}).email === MEMBER);
    t('S1 holds for a member viewer too: no Admin badge', !members.some((m) => hasAdminWord(m) || String(m.power).toLowerCase() === 'admin'), members.map(displayOf).join(' ; '));
    t('S2 holds for a member viewer too: no isAdmin/canElevate on other rows', !members.filter((m) => m.id !== memberReg.user.id).some((m) => 'isAdmin' in m || 'canElevate' in m));
    t('item 5: roles[] has NO admin/elevation entry (elevation is a typed title, not a dropdown option)',
      !(r.json.roles || []).some((x) => x.id === 'admin' || x.elevation === true),
      JSON.stringify(r.json.roles));

    /* ---- item 8: typed titles are display text and never decide access ---- */
    const viewerSess = await login(PORT, VIEWER);
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'custom', roleCustom: 'Project lead' }, ownerSess.token);
    t('setTeamRole accepts roleCustom', r.status === 200 && r.json.member.roleCustom === 'Project lead', JSON.stringify(r.json).slice(0, 200));
    t('custom title is sales-level power, not owner', r.json.member.power === 'sales' && r.json.member.canManageTeam === false, JSON.stringify(r.json.member));
    t('custom title label is the typed title', r.json.member.roleLabel === 'Project lead');
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'custom', roleCustom: '' }, ownerSess.token);
    t('empty typed title is rejected, not silently stored', r.status === 400, r.status);
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'custom', roleCustom: 'Owner' }, ownerSess.token);
    t('C6 no blocklist: the typed title "Owner" is accepted', r.status === 200 && r.json.member.roleCustom === 'Owner', JSON.stringify(r.json.member).slice(0, 160));
    t('C6 truth is the badge: typing "Owner" grants sales power only', r.json.member.power === 'sales' && r.json.member.canManageTeam === false, JSON.stringify(r.json.member));
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'custom', roleCustom: 'Admin' }, ownerSess.token);
    t('C6 no blocklist: the typed title "Admin" is accepted as a TITLE', r.status === 200 && r.json.member.roleCustom === 'Admin', JSON.stringify(r.json.member).slice(0, 160));
    t('typing "Admin" grants sales power only — a title is not power', r.json.member.power === 'sales' && r.json.member.canManageTeam === false, JSON.stringify(r.json.member));
    t('typing "Admin" does NOT set is_admin', readRow(VIEWER).is_admin === 0, JSON.stringify(readRow(VIEWER).is_admin));
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'custom', roleCustom: 'x'.repeat(61) }, ownerSess.token);
    t('over-long typed title is rejected', r.status === 400, r.status);
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'owner' }, viewerSess.token);
    t('a member cannot change roles', r.status === 403, r.status);
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'viewer' }, ownerSess.token);
    t('fixture restore: viewer row back to viewer', r.status === 200 && r.json.member.role === 'viewer', JSON.stringify(r.json.member).slice(0, 160));

    /* ---- a member may read but never write ---- */
    r = await req(PORT, 'POST', '/api/proposals', { title: 'nope' }, viewerSess.token);
    t('viewer cannot create', r.status === 403, r.status);

    /* ---- C2 honesty: demoting the OWNER_EMAIL mailbox is restored ---- */
    r = await req(PORT, 'POST', '/api/team/role', { userId: ownerReg.user.id, role: 'sales' }, adminSess.token);
    t('demoting the OWNER_EMAIL row returns an honest note', r.status === 200 && typeof r.json.note === 'string' && r.json.note.length > 0, JSON.stringify(r.json).slice(0, 200));
    await login(PORT, OWNER);
    t('OWNER_EMAIL row is restored to owner on its next sign-in (unconditional bootstrap)', readRow(OWNER).role === 'owner');

    /* ---- C2: the bootstrap is unconditional and runs on register ---- */
    t('C2 bootstrap: OWNER_EMAIL was owner immediately after signup', ownerReg.user.role === 'owner', ownerReg.user.role);
    t('C2 bootstrap: signup PRESERVED the typed title (no NULL-wipe)', ownerReg.user.roleCustom === 'Project lead', String(ownerReg.user.roleCustom));
    const ownerMe = await req(PORT, 'GET', '/api/auth/me', null, (await login(PORT, OWNER)).token);
    t('visible owner label is Owner', ownerMe.json.user.roleLabel === 'Owner', ownerMe.json.user.roleLabel);
    t('visible owner canManageTeam', ownerMe.json.user.canManageTeam === true);
    t('a visible owner is NOT told it can elevate', ownerMe.json.user.canElevate === false, JSON.stringify(ownerMe.json.user.canElevate));
    t('a visible owner row is not elevated', ownerMe.json.user.isAdmin === false, JSON.stringify(ownerMe.json.user.isAdmin));

    /* ---- P1 guard: ADMIN_EMAIL == OWNER_EMAIL -> bootstrap wins, no oscillation ---- */
    const PORT2 = PORT + 400;
    const DATA2 = path.join(ROOT, 'platform/data-roles-conflict');
    const srv2 = startServer(PORT2, DATA2, { OWNER_EMAIL: ADMIN, ADMIN_EMAIL: ADMIN });
    await srv2.ready;
    try {
      r = await req(PORT2, 'GET', '/api/health');
      t('P1 warning reported when ADMIN_EMAIL == OWNER_EMAIL', r.status === 200 && Array.isArray(r.json.warnings) && r.json.warnings.length === 1, JSON.stringify(r.json && r.json.warnings));
      t('P1 warning text names no email address', !JSON.stringify(r.json.warnings).includes(ADMIN));
      t('P1 warning contains no Founder wording', !/founder/i.test(JSON.stringify(r.json.warnings)), JSON.stringify(r.json.warnings));
      t('P1 warning no longer claims a heal is disabled', !/heal/i.test(JSON.stringify(r.json.warnings)), JSON.stringify(r.json.warnings));
      t('P1 warning explains the redundancy instead', /redundant/i.test(JSON.stringify(r.json.warnings)), JSON.stringify(r.json.warnings));

      await register(PORT2, ADMIN, 'Conflict User', 'Sales');
      const c1 = await login(PORT2, ADMIN);
      const row2 = () => JSON.parse(fs.readFileSync(path.join(DATA2, 'db.json'), 'utf8')).users.find((u) => u.email === ADMIN);
      t('P1: bootstrap promotes the shared mailbox to owner', row2().role === 'owner', row2().role);
      for (let i = 0; i < 5; i++) { await req(PORT2, 'GET', '/api/auth/me', null, c1.token); await login(PORT2, ADMIN); }
      t('P1: role stays owner after repeated logins (nothing is automatic, no oscillation)', row2().role === 'owner', row2().role);
      t('P1: bootstrap stamps no title of its own — the signup title is preserved', row2().role_custom === 'Sales', row2().role + '/' + String(row2().role_custom));
      const cMe = await req(PORT2, 'GET', '/api/auth/me', null, c1.token);
      t('P1: shared mailbox keeps owner powers', cMe.json.user.canManageTeam === true && cMe.json.user.canWrite === true);
      t('P1: the shared mailbox may still elevate itself', cMe.json.user.canElevate === true, JSON.stringify(cMe.json.user.canElevate));
      r = await req(PORT2, 'POST', '/api/team/role', { userId: cMe.json.user.id, role: 'custom', roleCustom: 'admin' }, c1.token);
      t('P1: self-elevation by typing "admin" works even in the collision case', r.status === 200 && row2().is_admin === 1, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
      t('P1: elevation did not disturb the bootstrap owner role or its title', row2().role === 'owner' && row2().role_custom === 'Sales' && row2().is_admin === 1, row2().role + '/' + String(row2().role_custom) + '/' + JSON.stringify(row2().is_admin));
    } finally {
      srv2.child.kill('SIGTERM');
      try { fs.rmSync(DATA2, { recursive: true, force: true }); } catch (_) {}
    }

    /* ---- malformed ADMIN_EMAIL: the silent-lockout case the diagnostic exists
           for. A typo grants nobody and nobody may elevate. ---- */
    const PORT3 = PORT + 500;
    const DATA3 = path.join(ROOT, 'platform/data-roles-typo');
    const srv3 = startServer(PORT3, DATA3, { OWNER_EMAIL: OWNER, ADMIN_EMAIL: 'admin-personal@ktm' });
    await srv3.ready;
    try {
      r = await req(PORT3, 'GET', '/api/health');
      t('malformed ADMIN_EMAIL is reported by health', r.status === 200 && (r.json.warnings || []).length === 1, JSON.stringify(r.json && r.json.warnings));
      t('health does not echo the malformed value', !JSON.stringify(r.json).includes('admin-personal@ktm'));
      await register(PORT3, ADMIN, 'Typo User', 'Sales');
      const fp3 = path.join(DATA3, 'db.json');
      let fx = JSON.parse(fs.readFileSync(fp3, 'utf8'));
      const u3 = fx.users.find((x) => x.email === ADMIN);
      u3.role = 'owner'; u3.role_custom = null;
      fs.writeFileSync(fp3, JSON.stringify(fx));
      const typoSess = await login(PORT3, ADMIN);
      const typoMe = await req(PORT3, 'GET', '/api/auth/me', null, typoSess.token);
      t('a typo means nobody may elevate (fail-closed)', typoMe.json.user.canElevate === false, JSON.stringify(typoMe.json.user.canElevate));
      t('a typo means powers follow the stored role only', typoMe.json.user.canManageTeam === (typoMe.json.user.role === 'owner'), JSON.stringify(typoMe.json.user));
      r = await req(PORT3, 'POST', '/api/team/role', { userId: typoMe.json.user.id, role: 'custom', roleCustom: 'admin' }, typoSess.token);
      t('with a typo, typing "admin" is a harmless custom title (nobody is the designated admin), not elevation',
        r.status === 200 && r.json.member.power === 'sales' && r.json.member.roleCustom === 'admin', r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
      fx = JSON.parse(fs.readFileSync(fp3, 'utf8'));
      t('a malformed ADMIN_EMAIL elevates nobody — is_admin stays 0', fx.users.find((x) => x.email === ADMIN).is_admin === 0,
        JSON.stringify(fx.users.find((x) => x.email === ADMIN).is_admin));
    } finally {
      srv3.child.kill('SIGTERM');
      try { fs.rmSync(DATA3, { recursive: true, force: true }); } catch (_) {}
    }
  } finally {
    srv.child.kill('SIGTERM');
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (_) {}
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
