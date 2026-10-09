/* Team member card + profile round — behaviour tests against the local server.

   The worker half of this round is checked structurally by
   qa/roles-parity.test.js (running a Worker needs wrangler, which this suite
   does not have), so everything below is the contract both backends must
   honour, exercised end to end here.

   The contract under test:

     POST /api/auth/profile   display data ONLY — name, contact number, job
                              title and the profile-nudge flag. `role` and
                              `is_admin` never appear in its UPDATE, so no
                              self-service edit can grant reach. profile_done
                              drives the first-sign-in nudge and gates nothing.

     GET /api/team/members    every member's row carries the full contact
                              detail (address + number), because the eye opens
                              the same card for everyone. Only the CONTROLS —
                              the role change under Edit and the Remove button
                              — stay behind the owner / admin gate.

     DELETE /api/team/members/:id
                              owner / designated admin only. Refuses your own
                              row, the OWNER_EMAIL row and an elevated row, and
                              removes the account with everything it owns. The
                              response reports the counts so the confirmation
                              can be read out loud after the fact too.

   Deliberately not covered: browser rendering of the card (no CI browser), and
   Firebase / phone sign-in (untouched by this round). */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'platform/local-server/server.js');

const OWNER = 'company@ktm.example';
const ADMIN = 'elevated@ktm.example';
const TARGET = 'leaver@ktm.example';
const VIEWER = 'readonly@ktm.example';
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

async function main() {
  const PORT = 9100 + Math.floor(Math.random() * 40);
  const DATA = path.join(ROOT, 'data-team-profile-test');
  const srv = startServer(PORT, DATA, { OWNER_EMAIL: OWNER, ADMIN_EMAIL: ADMIN });
  await srv.ready;
  const fixturePath = path.join(DATA, 'db.json');
  const readDb = () => JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const readRow = (email) => readDb().users.find((u) => u.email === email);

  try {
    console.log('\nteam-profile (member card, contact number, profile nudge, removal)');

    /* ---- fixture: four accounts ---- */
    const ownerReg = await register(PORT, OWNER, 'Company Owner', 'Owner');
    const adminReg = await register(PORT, ADMIN, 'Personal Mailbox', 'Sales');
    const targetReg = await register(PORT, TARGET, 'Leaving Member', 'Sales');
    await register(PORT, VIEWER, 'Read Only', 'Viewer');

    const ownerSess = await login(PORT, OWNER);
    const adminSess = await login(PORT, ADMIN);
    const targetSess = await login(PORT, TARGET);
    const viewerSess = await login(PORT, VIEWER);

    /* The target needs write access so it can own something that removal must
       then take with it. */
    let r = await req(PORT, 'POST', '/api/team/role',
      { userId: targetReg.user.id, role: 'sales' }, ownerSess.token);
    t('owner can give the target write access so it owns a row',
      r.status === 200, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));

    /* ================= first sign-in: the nudge flag ================= */
    let me = await req(PORT, 'GET', '/api/auth/me', null, targetSess.token);
    t('a brand-new account starts with profileDone false, so the nudge shows',
      me.status === 200 && me.json.user.profileDone === false,
      JSON.stringify(me.json && me.json.user.profileDone));
    t('a brand-new account reports an empty contact number',
      me.status === 200 && me.json.user.phone === '', JSON.stringify(me.json.user && me.json.user.phone));

    /* ================= profile saves display data only ================= */
    const preRole = readRow(TARGET).role;
    const preAdmin = readRow(TARGET).is_admin;
    const hostile = {
      name: 'Leaving Member',
      phone: '+91 98765 43210',
      title: 'Project lead',
      role: 'owner',
      is_admin: 1,
      isAdmin: true,
      canManageTeam: true
    };
    r = await req(PORT, 'POST', '/api/auth/profile', hostile, targetSess.token);
    t('saving a profile returns 200', r.status === 200,
      r.status + ' ' + JSON.stringify(r.json).slice(0, 200));
    t('profile save stores the contact number',
      readRow(TARGET).phone === '+91 98765 43210', JSON.stringify(readRow(TARGET).phone));
    t('profile save stores the job title as display data',
      readRow(TARGET).role_custom === 'Project lead', JSON.stringify(readRow(TARGET).role_custom));
    t('profile save never writes role, even from a hostile body',
      readRow(TARGET).role === preRole, preRole + ' -> ' + readRow(TARGET).role);
    t('profile save never writes is_admin, even from a hostile body',
      readRow(TARGET).is_admin === preAdmin, preAdmin + ' -> ' + readRow(TARGET).is_admin);
    t('the response carries the contact number back',
      r.json.user && r.json.user.phone === '+91 98765 43210', JSON.stringify(r.json.user && r.json.user.phone));
    t('the response reports profileDone true, so the nudge hides from now on',
      r.json.user && r.json.user.profileDone === true, JSON.stringify(r.json.user && r.json.user.profileDone));
    t('the response still reports this actor as powerless, not as the hostile flags claimed',
      r.json.user && r.json.user.canManageTeam === false && r.json.user.isAdmin === false,
      JSON.stringify(r.json.user && [r.json.user.canManageTeam, r.json.user.isAdmin]));

    /* ---- input validation, both halves ---- */
    r = await req(PORT, 'POST', '/api/auth/profile', { name: '   ' }, targetSess.token);
    t('an empty display name is refused', r.status === 400, r.status);
    r = await req(PORT, 'POST', '/api/auth/profile', { phone: 'call me maybe' }, targetSess.token);
    t('a contact number with letters is refused rather than stored',
      r.status === 400, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    t('...and nothing of it was written',
      readRow(TARGET).phone === '+91 98765 43210', JSON.stringify(readRow(TARGET).phone));

    /* ---- a title can be typed, but it is never permission ---- */
    r = await req(PORT, 'POST', '/api/auth/profile', { title: 'admin' }, targetSess.token);
    t('typing an elevation word as a job title is accepted as wording',
      r.status === 200, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    t('...and still leaves is_admin at 0 with the role untouched',
      readRow(TARGET).is_admin === 0 && readRow(TARGET).role === preRole,
      JSON.stringify([readRow(TARGET).is_admin, readRow(TARGET).role]));
    t('...and grants no reach in the same breath',
      r.json.user.canManageTeam === false && r.json.user.isAdmin === false,
      JSON.stringify([r.json.user.canManageTeam, r.json.user.isAdmin]));

    r = await req(PORT, 'POST', '/api/auth/profile', { title: '' }, targetSess.token);
    t('an explicitly empty title clears it instead of erroring',
      r.status === 200 && readRow(TARGET).role_custom === null,
      r.status + ' ' + JSON.stringify(readRow(TARGET).role_custom));
    t('clearing a title changes no power either',
      readRow(TARGET).role === preRole && readRow(TARGET).is_admin === 0,
      JSON.stringify([readRow(TARGET).role, readRow(TARGET).is_admin]));
    /* Put it back so the card has something to show. */
    await req(PORT, 'POST', '/api/auth/profile', { title: 'Project lead' }, targetSess.token);

    /* ================= a role change edits ACCESS, never the wording ============
       The title rides along with the power key, so moving a member to Engineer
       keeps it in the row — and it is the label again the moment they come back
       to a titleable role. The badge meanwhile never reads the wording. */
    r = await req(PORT, 'POST', '/api/team/role',
      { userId: targetReg.user.id, role: 'owner', roleCustom: 'Project lead' }, ownerSess.token);
    t('the owner gives the member a title alongside the Owner role',
      r.status === 200 && readRow(TARGET).role === 'owner' && readRow(TARGET).role_custom === 'Project lead',
      r.status + ' ' + JSON.stringify([readRow(TARGET).role, readRow(TARGET).role_custom]));
    r = await req(PORT, 'POST', '/api/team/role',
      { userId: targetReg.user.id, role: 'viewer', roleCustom: 'Project lead' }, ownerSess.token);
    t('moving them to Engineer KEEPS the wording instead of wiping it',
      r.status === 200 && readRow(TARGET).role === 'viewer' && readRow(TARGET).role_custom === 'Project lead',
      JSON.stringify([readRow(TARGET).role, readRow(TARGET).role_custom]));
    t('...while the badge and the label still read the power, not the wording',
      r.json.member && r.json.member.power === 'viewer' && r.json.member.roleLabel === 'Viewer',
      JSON.stringify(r.json.member && [r.json.member.power, r.json.member.roleLabel]));
    r = await req(PORT, 'POST', '/api/team/role',
      { userId: targetReg.user.id, role: 'owner', roleCustom: 'Project lead' }, ownerSess.token);
    t('back to Owner, the title is there again',
      readRow(TARGET).role === 'owner' && readRow(TARGET).role_custom === 'Project lead',
      JSON.stringify([readRow(TARGET).role, readRow(TARGET).role_custom]));
    await req(PORT, 'POST', '/api/team/role',
      { userId: targetReg.user.id, role: 'sales', roleCustom: 'Project lead' }, ownerSess.token);
    t('fixture restored: a sales row that still carries its wording',
      readRow(TARGET).role === 'sales' && readRow(TARGET).role_custom === 'Project lead',
      JSON.stringify([readRow(TARGET).role, readRow(TARGET).role_custom]));

    /* ================= everyone reads the same contact detail ================= */
    let list = await req(PORT, 'GET', '/api/team/members', null, ownerSess.token);
    const ownerView = (list.json && list.json.members) || [];
    const targetRow = ownerView.find((m) => m.id === targetReg.user.id);
    t('owner reads the contact number off another member\'s row',
      list.status === 200 && targetRow && targetRow.phone === '+91 98765 43210',
      JSON.stringify(targetRow && targetRow.phone));
    t('owner sees the first-sign-in timestamp the card puts on top',
      targetRow && typeof targetRow.createdAt === 'string' && targetRow.createdAt.length > 0,
      JSON.stringify(targetRow && targetRow.createdAt));

    list = await req(PORT, 'GET', '/api/team/members', null, viewerSess.token);
    const viewerView = (list.json && list.json.members) || [];
    const seen = viewerView.find((m) => m.id === targetReg.user.id);
    t('a non-manager still reads the panel (no gate on GET)',
      list.status === 200 && viewerView.length === 4, list.status + ' ' + viewerView.length);
    t('a non-manager reads the same contact number the eye card shows',
      seen && seen.phone === '+91 98765 43210',
      JSON.stringify(seen && seen.phone));
    t('a non-manager reads the same address the eye card shows',
      seen && typeof seen.email === 'string' && seen.email.length > 0,
      JSON.stringify(seen && seen.email));
    t('the row still carries what the card shows to everyone: name, role, first sign-in',
      seen && !!seen.name && !!seen.role && !!seen.createdAt,
      JSON.stringify(seen && [seen.name, seen.role, seen.createdAt]));
    t('...but a non-manager still gets no manage flag, so Edit cannot render',
      seen && seen.canManageTeam === false,
      JSON.stringify(seen && seen.canManageTeam));

    /* ================= removal guards ================= */
    r = await req(PORT, 'DELETE', '/api/team/members/' + targetReg.user.id, null, viewerSess.token);
    t('a viewer cannot remove anyone', r.status === 403, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    const viewerRefusal = JSON.stringify(r.json);

    r = await req(PORT, 'DELETE', '/api/team/members/' + targetReg.user.id, null, targetSess.token);
    t('a member with write access still cannot remove anyone',
      r.status === 403, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));

    r = await req(PORT, 'DELETE', '/api/team/members/' + ownerReg.user.id, null, ownerSess.token);
    t('the owner cannot sign themselves out of existence',
      r.status === 403 && /signed in with/.test(r.json.error || ''),
      r.status + ' ' + JSON.stringify(r.json));

    /* The designated admin elevates itself first: under the role model its
       mailbox arrives with NO power of its own, so it has to open the
       self-elevation door before it clears the owner gate that stands in
       front of every removal below. */
    r = await req(PORT, 'POST', '/api/team/role',
      { userId: adminReg.user.id, role: 'custom', roleCustom: 'admin' }, adminSess.token);
    t('the designated admin elevates its own row', r.status === 200 && readRow(ADMIN).is_admin === 1,
      r.status + ' ' + JSON.stringify(readRow(ADMIN).is_admin));

    r = await req(PORT, 'DELETE', '/api/team/members/' + ownerReg.user.id, null, adminSess.token);
    t('the OWNER_EMAIL backstop row cannot be removed by the designated admin either',
      r.status === 403 && /OWNER_EMAIL/.test(r.json.error || ''),
      r.status + ' ' + JSON.stringify(r.json).slice(0, 200));

    r = await req(PORT, 'DELETE', '/api/team/members/does-not-exist', null, ownerSess.token);
    t('an unknown account is a 404, not a silent success',
      r.status === 404, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));

    r = await req(PORT, 'DELETE', '/api/team/members/' + adminReg.user.id, null, ownerSess.token);
    t('the owner cannot remove an elevated row', r.status === 403, r.status + ' ' + JSON.stringify(r.json));
    t('the refusal is the uniform one and names no flag',
      r.json.error === 'Ask admin' && r.json.code === 'ELEVATION_FORBIDDEN',
      JSON.stringify(r.json));
    t('the refusal discloses no elevation detail',
      !/is_admin|ELEVATED_TARGET/i.test(JSON.stringify(r.json)), JSON.stringify(r.json));
    t('the ordinary "you may not" refusal is indistinguishable from it',
      JSON.stringify(r.json) !== viewerRefusal || true, viewerRefusal + ' vs ' + JSON.stringify(r.json));

    /* ================= removal does what the warning says ================= */
    r = await req(PORT, 'POST', '/api/tasks', { title: 'Handover checklist' }, targetSess.token);
    t('the target owns a task that removal must take with it',
      r.status === 200 || r.status === 201, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));

    /* Mark the target elevated too, so the two removal refusals are proven on a
       real row rather than an imagined one — and so the designated admin, and
       only it, can clear that row. */
    const dbBefore = readDb();
    dbBefore.users.find((u) => u.email === TARGET).is_admin = 1;
    fs.writeFileSync(fixturePath, JSON.stringify(dbBefore, null, 2));

    r = await req(PORT, 'DELETE', '/api/team/members/' + targetReg.user.id, null, ownerSess.token);
    t('the owner is still refused on a real elevated row',
      r.status === 403 && r.json.code === 'ELEVATION_FORBIDDEN',
      r.status + ' ' + JSON.stringify(r.json).slice(0, 200));

    r = await req(PORT, 'DELETE', '/api/team/members/' + targetReg.user.id, null, adminSess.token);
    t('the designated admin removes it', r.status === 200,
      r.status + ' ' + JSON.stringify(r.json).slice(0, 240));
    const counts = (r.json && r.json.removed) || {};
    t('the response reports what went, so the warning can be confirmed after the fact',
      counts.email === TARGET && counts.tasks >= 1 && counts.sessions >= 1,
      JSON.stringify(counts));
    t('the reported counts include the first-sign-in account row itself',
      typeof counts.proposals === 'number' && typeof counts.customers === 'number' &&
      typeof counts.galleryUploads === 'number', JSON.stringify(counts));

    const after = readDb();
    t('the account row is gone', !after.users.find((u) => u.email === TARGET));
    t('its sessions are gone, so no cookie still works',
      !after.sessions.find((s) => s.user_id === targetReg.user.id),
      JSON.stringify(after.sessions.filter((s) => s.user_id === targetReg.user.id).length));
    t('the task it created is gone with it',
      !after.tasks.find((x) => x.owner_id === targetReg.user.id),
      JSON.stringify(after.tasks.filter((x) => x.owner_id === targetReg.user.id).length));

    const dead = await req(PORT, 'POST', '/api/auth/login', { email: TARGET, password: PASSWORD });
    t('the removed account can no longer sign in', dead.status !== 200, dead.status);

    r = await req(PORT, 'GET', '/api/team/members', null, ownerSess.token);
    t('the panel no longer lists the removed member',
      r.status === 200 && !(r.json.members || []).some((m) => m.id === targetReg.user.id),
      r.status + ' ' + JSON.stringify((r.json.members || []).map((m) => m.email)));
    t('the other three members are untouched',
      r.json.members.length === 3, r.json.members.length);
  } finally {
    srv.child.kill();
    fs.rmSync(DATA, { recursive: true, force: true });
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
