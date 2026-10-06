/* Round-1 roles / auth / visibility — behaviour tests against the local server.
   Run: node roles-access.test.js   (starts its own server on an ephemeral port)

   Covers the contract the Cloudflare worker implements too; the worker half is
   checked structurally by qa/roles-parity.test.js because running a Worker
   needs wrangler, which is not available in this suite.

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
const ADMIN = 'founder@ktm.example';
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
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
    };
    if (auth) headers.Authorization = 'Bearer ' + auth;
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
  const PORT = 8991 + Math.floor(Math.random() * 90);
  const DATA = path.join(ROOT, 'platform/data-roles-test');
  const srv = startServer(PORT, DATA, { OWNER_EMAIL: OWNER, ADMIN_EMAIL: ADMIN });
  await srv.ready;

  try {
    console.log('\nroles-access (Round-1: hidden admin, owner-sees-all, self-heal, titles)');

    /* ---- fixture: four accounts ----
       Registration is open and never grants power, so the founder row is made
       owner the same way the product does it today: a promoted existing row.
       The self-heal under test then demotes it back to a titled viewer. */
    const adminReg = await register(PORT, ADMIN, 'Rushi Founder', 'Sales');
    const salesReg = await register(PORT, SALES, 'Second Owner', 'Sales');
    const memberReg = await register(PORT, MEMBER, 'Sales Member', 'Sales');
    const viewerReg = await register(PORT, VIEWER, 'View Only', 'Viewer');

    /* Reproduce today's D1 exactly: personal = owner with role_custom NULL (so
       the one-time heal can fire), and sales@ = owner. The member keeps the
       sales power level, and is the account whose reads must stay own-only. */
    const fixturePath = path.join(DATA, 'db.json');
    let fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const setRow = (email, role) => {
      const u = fixture.users.find((x) => x.email === email);
      u.role = role; u.role_custom = null;
    };
    setRow(ADMIN, 'owner');
    setRow(SALES, 'owner');
    setRow(MEMBER, 'sales');
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));

    /* ---- health: version marker, no P1 warning when the mailboxes differ ---- */
    let r = await req(PORT, 'GET', '/api/health');
    t('health reports the code version marker', r.status === 200 && r.json.codeVersion === 'roles-r1', r.json && r.json.codeVersion);
    t('health has no warning when ADMIN_EMAIL != OWNER_EMAIL', r.status === 200 && Array.isArray(r.json.warnings) && r.json.warnings.length === 0, JSON.stringify(r.json && r.json.warnings));
    t('health never names either mailbox', r.status === 200 && !JSON.stringify(r.json).includes(ADMIN) && !JSON.stringify(r.json).includes(OWNER));

    /* ---- C3: hidden admin passes BOTH gate levels from a viewer base ---- */
    // Sign in as the founder; this also triggers the one-time self-heal.
    const adminSess = await login(PORT, ADMIN);
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const adminRow = fixture.users.find((u) => u.email === ADMIN);

    t('C1 self-heal: admin own row demoted owner -> viewer', adminRow.role === 'viewer', adminRow.role);
    t('C1 self-heal: admin own row titled Founder', adminRow.role_custom === 'Founder', adminRow.role_custom);
    t('C1 self-heal: sales@ owner row untouched by the heal', fixture.users.find((u) => u.email === SALES).role === 'owner');

    let me = await req(PORT, 'GET', '/api/auth/me', null, adminSess.token);
    t('C3 both levels: hidden admin canWrite (sales gate) is true', me.status === 200 && me.json.user.canWrite === true, JSON.stringify(me.json && me.json.user));
    t('C3 both levels: hidden admin canManageTeam (owner gate) is true', me.status === 200 && me.json.user.canManageTeam === true, JSON.stringify(me.json && me.json.user));
    t('C3 both levels: hidden admin seesAll is true', me.status === 200 && me.json.user.seesAll === true);
    t('hidden admin label is the typed title, never "Admin"', me.json.user.roleLabel === 'Founder', me.json.user && me.json.user.roleLabel);
    t('the word "admin" appears nowhere in the payload', !JSON.stringify(me.json).toLowerCase().includes('admin'));

    // Prove the sales-level gate with a real write.
    r = await req(PORT, 'POST', '/api/proposals', { title: 'Hidden admin can create', customer_name: 'Admin Client' }, adminSess.token);
    t('C3 proof: hidden admin (viewer row) can CREATE a proposal', r.status === 200 || r.status === 201, r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    const adminProposalId = r.json && r.json.proposal ? r.json.proposal.id : (r.json && r.json.id);

    // Prove the owner-level gate with a real team read.
    r = await req(PORT, 'GET', '/api/team/members', null, adminSess.token);
    t('C3 proof: hidden admin can LIST the team (owner gate)', r.status === 200 && Array.isArray(r.json.members), r.status);

    /* ---- item 5: owner-sees-all vs members own-only ---- */
    const salesSess = await login(PORT, MEMBER);
    r = await req(PORT, 'POST', '/api/proposals', { title: 'Member own proposal', customer_name: 'Member Client' }, salesSess.token);
    t('sales member can create its own proposal', r.status === 200 || r.status === 201, r.status);
    const salesProposalId = r.json && r.json.proposal ? r.json.proposal.id : (r.json && r.json.id);

    r = await req(PORT, 'GET', '/api/proposals', null, adminSess.token);
    const adminList = (r.json && r.json.proposals) || [];
    t('owner-sees-all: hidden admin list contains the sales member proposal', adminList.some((p) => p.id === salesProposalId), adminList.map((p) => p.id).join(','));

    r = await req(PORT, 'GET', '/api/proposals', null, salesSess.token);
    const salesList = (r.json && r.json.proposals) || [];
    t('members own-only: member list does NOT contain the admin proposal', !salesList.some((p) => p.id === adminProposalId), salesList.map((p) => p.id).join(','));
    t('members own-only: member list still contains its own proposal', salesList.some((p) => p.id === salesProposalId));

    r = await req(PORT, 'GET', '/api/proposals/' + salesProposalId, null, adminSess.token);
    t('owner-sees-all: hidden admin can OPEN another member proposal detail', r.status === 200, r.status);
    r = await req(PORT, 'GET', '/api/proposals/' + adminProposalId, null, salesSess.token);
    t('members own-only: member CANNOT open the admin proposal detail', r.status === 404, r.status);

    /* ---- item 4: OWNER_EMAIL bootstrap is unconditional (C2) ---- */
    const ownerReg = await register(PORT, OWNER, 'KTM Energy', 'Project lead');
    /* C2: the bootstrap is unconditional and also runs on register, so the
       designated company mailbox is already Owner at the end of signup - a
       typed title on the form never blocks it. Ordinary signups stay
       read-only, asserted below with the member account. */
    t('C2 bootstrap: OWNER_EMAIL is owner immediately after signup', ownerReg.user.role === 'owner', ownerReg.user.role);
    t('C2 bootstrap: signup cleared the typed title', ownerReg.user.roleCustom === null, String(ownerReg.user.roleCustom));
    t('ordinary signup with a typed title stays read-only', memberReg.user.role === 'viewer' || viewerReg.user.role === 'viewer', memberReg.user.role);
    const ownerSess = await login(PORT, OWNER);
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const ownerRow = fixture.users.find((u) => u.email === OWNER);
    t('C2 bootstrap: OWNER_EMAIL promoted to owner', ownerRow.role === 'owner', ownerRow.role);
    t('C2 bootstrap: promotion cleared the typed title (unconditional, no title gate)', ownerRow.role_custom === null, String(ownerRow.role_custom));
    let ownerMe = await req(PORT, 'GET', '/api/auth/me', null, ownerSess.token);
    t('visible owner label is Owner', ownerMe.json.user.roleLabel === 'Owner', ownerMe.json.user.roleLabel);
    t('visible owner canManageTeam', ownerMe.json.user.canManageTeam === true);

    /* ---- item 3: self-heal is one-time and never re-fires ---- */
    await login(PORT, ADMIN);
    await login(PORT, ADMIN);
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const adminRow2 = fixture.users.find((u) => u.email === ADMIN);
    t('self-heal is one-time: repeat admin logins leave viewer + Founder', adminRow2.role === 'viewer' && adminRow2.role_custom === 'Founder', adminRow2.role + '/' + adminRow2.role_custom);
    /* A deliberate TITLE change re-arms the latch, so the heal stays quiet. */
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'custom', roleCustom: 'Director' }, ownerSess.token);
    t('owner can set a deliberate typed title on the founder row', r.status === 200 && r.json.member.roleCustom === 'Director', JSON.stringify(r.json).slice(0, 200));
    await login(PORT, ADMIN);
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const latched = fixture.users.find((u) => u.email === ADMIN);
    t('heal does NOT re-fire while a deliberate title is set', latched.role === 'custom' && latched.role_custom === 'Director', latched.role + '/' + latched.role_custom);
    t('hidden admin keeps owner powers on a custom row', (await req(PORT, 'GET', '/api/auth/me', null, (await login(PORT, ADMIN)).token)).json.user.canManageTeam === true);

    /* FINDING (behaviour locked by the spec's `only if role_custom null` latch,
       asserted here so a future change cannot alter it silently): promoting the
       founder row to Owner CLEARS its typed title, which re-arms the heal, so
       the next ADMIN_EMAIL sign-in stamps Founder again. The hidden admin never
       loses access - its powers come from ADMIN_EMAIL, not from the row - but a
       permanent visible second Owner needs a latch that survives role changes
       (a dedicated column or a settled flag). Flagged for the spec owner. */
    r = await req(PORT, 'POST', '/api/team/role', { userId: adminReg.user.id, role: 'owner' }, ownerSess.token);
    t('owner can promote the hidden admin row to owner', r.status === 200 && r.json.member.role === 'owner', r.status + ' ' + JSON.stringify(r.json).slice(0, 160));
    t('promoting to owner clears the typed title (re-arms the heal latch)', r.json.member.roleCustom === null, String(r.json.member.roleCustom));
    await login(PORT, ADMIN);
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const refired = fixture.users.find((u) => u.email === ADMIN);
    t('FINDING: heal re-fires after the title was cleared, restamping Founder', refired.role === 'viewer' && refired.role_custom === 'Founder', refired.role + '/' + refired.role_custom);
    t('FINDING is access-safe: the hidden admin still has owner powers', (await req(PORT, 'GET', '/api/auth/me', null, (await login(PORT, ADMIN)).token)).json.user.canManageTeam === true);

    /* ---- item 6: team panel payload = badge + title + last login + contact ---- */
    r = await req(PORT, 'GET', '/api/team/members', null, ownerSess.token);
    const members = (r.json && r.json.members) || [];
    t('team list returns every member', members.length === 5, members.length);
    const salesMember = members.find((m) => m.email === MEMBER);
    t('team row carries a power badge', salesMember && salesMember.power === 'sales', salesMember && salesMember.power);
    t('team row carries the typed title separately', members.every((m) => typeof m.roleLabel === 'string'));
    t('team row carries contact (owner/hidden-admin only route)', salesMember && salesMember.email === MEMBER);
    t('team row carries a last sign-in from sessions', salesMember && !!salesMember.lastLogin, salesMember && salesMember.lastLogin);
    const founderMember = members.find((m) => m.email === ADMIN);
    t('founder row shows the typed title, not the power word', founderMember && founderMember.roleLabel === 'Founder', founderMember && founderMember.roleLabel);
    t('no team row is ever labelled Admin', !members.some((m) => /admin/i.test(String(m.roleLabel))));
    t('roles list offers a custom title entry', (r.json.roles || []).some((x) => x.id === 'custom' && x.acceptsTitle === true));

    /* ---- members cannot see the team or other members' contact ---- */
    const viewerSess = await login(PORT, VIEWER);
    r = await req(PORT, 'GET', '/api/team/members', null, viewerSess.token);
    t('viewer cannot list the team', r.status === 403, r.status);
    t('viewer 403 body leaks no member email', !JSON.stringify(r.json).includes(MEMBER));
    r = await req(PORT, 'POST', '/api/proposals', { title: 'nope' }, viewerSess.token);
    t('viewer cannot create', r.status === 403, r.status);

    /* ---- item 8: setTeamRole accepts roleCustom / typed titles ---- */
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'custom', roleCustom: 'Project lead' }, ownerSess.token);
    t('setTeamRole accepts roleCustom', r.status === 200 && r.json.member.roleCustom === 'Project lead', JSON.stringify(r.json).slice(0, 200));
    t('custom title is sales-level power, not owner', r.json.member.power === 'sales' && r.json.member.canManageTeam === false, JSON.stringify(r.json.member));
    t('custom title label is the typed title', r.json.member.roleLabel === 'Project lead');
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'custom', roleCustom: '' }, ownerSess.token);
    t('empty typed title is rejected, not silently stored', r.status === 400, r.status);
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'custom', roleCustom: 'Owner' }, ownerSess.token);
    t('C6 no blocklist: the typed title "Owner" is accepted', r.status === 200 && r.json.member.roleCustom === 'Owner', JSON.stringify(r.json).slice(0, 160));
    t('C6 truth is the badge: typing "Owner" grants sales power only', r.json.member.power === 'sales' && r.json.member.canManageTeam === false, JSON.stringify(r.json.member));
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'custom', roleCustom: 'x'.repeat(61) }, ownerSess.token);
    t('over-long typed title is rejected', r.status === 400, r.status);
    r = await req(PORT, 'POST', '/api/team/role', { userId: viewerReg.user.id, role: 'owner' }, viewerSess.token);
    t('a member cannot change roles', r.status === 403, r.status);

    /* ---- C2 honesty: demoting the OWNER_EMAIL mailbox is restored ---- */
    r = await req(PORT, 'POST', '/api/team/role', { userId: ownerReg.user.id, role: 'sales' }, adminSess.token);
    t('demoting the OWNER_EMAIL row returns an honest note', r.status === 200 && typeof r.json.note === 'string' && r.json.note.length > 0, JSON.stringify(r.json).slice(0, 200));
    await login(PORT, OWNER);
    fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    t('OWNER_EMAIL row is restored to owner on its next sign-in (unconditional bootstrap)', fixture.users.find((u) => u.email === OWNER).role === 'owner');

    /* ---- P1 guard: ADMIN_EMAIL == OWNER_EMAIL ---- */
    const PORT2 = PORT + 400;
    const DATA2 = path.join(ROOT, 'platform/data-roles-conflict');
    const srv2 = startServer(PORT2, DATA2, { OWNER_EMAIL: ADMIN, ADMIN_EMAIL: ADMIN });
    await srv2.ready;
    try {
      r = await req(PORT2, 'GET', '/api/health');
      t('P1 warning reported when ADMIN_EMAIL == OWNER_EMAIL', r.status === 200 && Array.isArray(r.json.warnings) && r.json.warnings.length === 1, JSON.stringify(r.json && r.json.warnings));
      t('P1 warning text names no email address', !JSON.stringify(r.json.warnings).includes(ADMIN));

      await register(PORT2, ADMIN, 'Conflict User', 'Sales');
      const c1 = await login(PORT2, ADMIN);
      let row = JSON.parse(fs.readFileSync(path.join(DATA2, 'db.json'), 'utf8')).users.find((u) => u.email === ADMIN);
      t('P1: bootstrap promotes the shared mailbox to owner', row.role === 'owner', row.role);
      // Hammer it: every request must leave the same answer (no oscillation).
      for (let i = 0; i < 5; i++) { await req(PORT2, 'GET', '/api/auth/me', null, c1.token); await login(PORT2, ADMIN); }
      row = JSON.parse(fs.readFileSync(path.join(DATA2, 'db.json'), 'utf8')).users.find((u) => u.email === ADMIN);
      t('P1: role stays owner after repeated logins (self-heal skipped, no oscillation)', row.role === 'owner', row.role);
      t('P1: no Founder title stamped on the shared mailbox', !row.role_custom, String(row.role_custom));
      const cMe = await req(PORT2, 'GET', '/api/auth/me', null, c1.token);
      t('P1: shared mailbox keeps owner powers', cMe.json.user.canManageTeam === true && cMe.json.user.canWrite === true);
    } finally {
      srv2.child.kill('SIGTERM');
      try { fs.rmSync(DATA2, { recursive: true, force: true }); } catch (_) {}
    }
    /* ---- malformed ADMIN_EMAIL: the silent-lockout case the diagnostic exists
           for. A typo grants nobody and the heal never runs; health must say so
           without printing the bad value. ---- */
    const PORT3 = PORT + 500;
    const DATA3 = path.join(ROOT, 'platform/data-roles-typo');
    const srv3 = startServer(PORT3, DATA3, { OWNER_EMAIL: OWNER, ADMIN_EMAIL: 'founder@ktm' });
    await srv3.ready;
    try {
      r = await req(PORT3, 'GET', '/api/health');
      t('malformed ADMIN_EMAIL is reported by health', r.status === 200 && (r.json.warnings || []).length === 1, JSON.stringify(r.json && r.json.warnings));
      t('health does not echo the malformed value', !JSON.stringify(r.json).includes('founder@ktm'));
      const typoReg = await register(PORT3, ADMIN, 'Founder', 'Sales');
      const fp3 = path.join(DATA3, 'db.json');
      let fx = JSON.parse(fs.readFileSync(fp3, 'utf8'));
      const u3 = fx.users.find((x) => x.email === ADMIN);
      u3.role = 'owner'; u3.role_custom = null;
      fs.writeFileSync(fp3, JSON.stringify(fx));
      const typoSess = await login(PORT3, ADMIN);
      const typoMe = await req(PORT3, 'GET', '/api/auth/me', null, typoSess.token);
      t('a typo means nobody is the designated admin (fail-closed)', typoMe.json.user.canManageTeam === (typoMe.json.user.role === 'owner'), JSON.stringify(typoMe.json.user));
      fx = JSON.parse(fs.readFileSync(fp3, 'utf8'));
      t('self-heal never runs for a malformed ADMIN_EMAIL', fx.users.find((x) => x.email === ADMIN).role === 'owner');
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
