/* Studio Pulse production-integration gates.
   Fails fast if: fixtures leak into assets/, frozen files move off 8cc7db1,
   demo identity strings ship, shell wiring (panel/nav/whitelist) breaks, or the
   real-data adapter misbehaves. Node-only; no browser required. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; console.log('  ok - ' + name); }
  catch (e) { console.error('  FAIL ' + name + ' :: ' + e.message); process.exitCode = 1; }
}

/* 1. fixture / sandbox files must NOT exist anywhere under assets/ */
ok('no fixture files in assets/', () => {
  for (const f of ['dashboard-fixtures.js', 'business-fixtures.js', 'quote-summary-data.js', 'pulse-storage.js', 'pulse-server.py', 'studio-sandbox.js', 'growth-hub-data.js', 'sales-workspace.js', 'studio-preview.js']) {
    const hits = [];
    const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name === f) hits.push(p); } };
    walk(path.join(ROOT, 'assets'));
    assert.strictEqual(hits.length, 0, f + ' found at ' + hits.join(','));
  }
});

/* 2. frozen files textually identical with the 8cc7db1 baseline (git-normalized) */
ok('frozen files identical to 8cc7db1', () => {
  const { spawnSync } = require('child_process');
  for (const f of ['assets/js/finance.js', 'assets/js/cloud-bridge.js']) {
    const r = spawnSync('git', ['-C', ROOT, 'diff', '--quiet', '8cc7db1', '--', f]);
    assert.strictEqual(r.status, 0, f + ' differs from 8cc7db1');
  }
});

/* 3. shell wiring */
ok('dashboard.html mounts Pulse shell', () => {
  const html = read('dashboard.html');
  for (const s of ['<section id="panel-sales"', '<div id="ghTabs"', '<div id="biBody"', '<div id="ghStatus"', '<dialog id="ghDialog"', 'data-panel="sales"']) {
    assert.ok(html.includes(s), 'missing markup: ' + s);
  }
});
ok('dashboard.html loads pulse scripts in order, without fixtures', () => {
  const html = read('dashboard.html');
  const order = ['assets/js/pulse/business-engine.js', 'assets/js/pulse/pulse-operations.js', 'assets/js/pulse/pulse-data.js', 'assets/js/pulse/business-pulse.js'];
  let last = -1;
  for (const s of order) { const i = html.indexOf(s); assert.ok(i > last, 'script out of order or missing: ' + s); last = i; }
  for (const bad of ['dashboard-fixtures.js', 'business-fixtures.js', 'pulse-storage.js', 'quote-summary-data.js']) {
    assert.ok(!html.includes(bad), 'fixture script referenced in production html: ' + bad);
  }
});
ok('dashboard.js whitelist + label include sales', () => {
  const js = read('assets/js/dashboard.js');
  assert.ok(/'home','proposals','tasks','activity','reports','send','sales'/.test(js), '?panel= whitelist missing sales');
  assert.ok(/sales:'Studio Pulse'/.test(js), 'PAGE_LABELS missing sales');
});

/* 4. no demo identity / sample records strings in shipped assets */
ok('no demo identity strings in pulse assets', () => {
  const files = ['assets/js/pulse/business-pulse.js', 'assets/js/pulse/pulse-ui.js', 'assets/js/pulse/pulse-governance-ui.js', 'assets/js/pulse/pulse-data.js', 'assets/js/pulse/quote-summary.js', 'assets/js/pulse/pulse-customer.js', 'dashboard.html'];
  for (const f of files) {
    const t = read(f);
    for (const bad of ['demo@example.invalid', 'Rushi · Demo', 'demo-owner', 'demo-admin', 'demo-member', 'demo-viewer', "meta[name=\"pulse-access-role\"]", 'DemoQuoteSummaryData', 'BusinessFixtures']) {
      assert.ok(!t.includes(bad), f + ' contains forbidden string: ' + bad);
    }
  }
});
ok('pulse data adapter declares unwritable + empty missing-domain collections', () => {
  const js = read('assets/js/pulse/pulse-data.js');
  assert.ok(js.includes('writable: false'));
  for (const k of ['leads: []', 'threads: []', 'calendar: []', 'rules: []', 'posts: []', 'acquisition: []', 'daily: []']) {
    assert.ok(js.includes(k), 'adapter missing empty collection: ' + k);
  }
});

/* 5. adapter behaviour with stubbed APIs (node) */
(function adapterTest() {
  const E = require(path.join(ROOT, 'assets/js/pulse/business-engine.js'));
  const stub = {
    user: { id: 'u1', name: 'Rushi Dhumal', email: 'owner@studio.test', role: 'owner', roleLabel: 'Owner' },
    listTasks: async () => ({ tasks: [
      { id: 'tk1', title: 'Call back about survey', proposalId: 'p1', dueAt: '2026-10-20T09:00:00Z', status: 'open' },
      { id: 'tk2', title: 'Send revised quote', proposalId: null, dueAt: '2026-10-25T18:30:00Z', status: 'open' },
      { id: 'tk3', title: 'Completed task', proposalId: 'p1', status: 'done' }
    ]}),
    listActivity: async () => ({ events: [ { id: 'ev1', type: 'link_opened', proposalId: 'p1', createdAt: '2026-10-21T05:00:00Z' } ] }),
    listProposals: async () => ({ proposals: [ { id: 'p1', customer: 'KTM Energy', title: 'Rooftop solar' } ] }),
    reportSummary: async () => ({ value: { quotedSum: 480000, proposalsWithValue: 2, proposalsMissingValue: 1 }, engagement: { versionsPublished: 3, linkOpens: 7, surveyRequests: 1 } })
  };
  /* build a bare window context and evaluate the adapter */
  const code = fs.readFileSync(path.join(ROOT, 'assets/js/pulse/pulse-data.js'), 'utf8');
  const fakeWindow = { PlatformAPI: stub, BusinessEngine: E };
  const fn = new Function('window', code + '\nreturn window.PulseData;');
  const PulseData = fn(fakeWindow);
  return PulseData.create().then(data => {
    assert.strictEqual(data.writable, false, 'adapter must be unwritable');
    assert.deepStrictEqual(data.leads, []);
    assert.deepStrictEqual(data.threads, []);
    assert.strictEqual(data.tasks.length, 3, 'real tasks mapped');
    assert.strictEqual(data.tasks[0].company, 'KTM Energy', 'proposal title joins task');
    assert.ok(data.tasks[0].date >= '2026-10-20' && data.tasks[0].date <= '2026-10-20', 'IST day parse');
    assert.strictEqual(data.tasks[2].status, 'done');
    assert.ok(data.events.length === 1 && data.events[0].text.startsWith('Quotation link opened'), 'activity label mapped');
    assert.strictEqual(data.report.value.quotedSum, 480000, 'server report attached');
    /* desk: real overdue open tasks surface even without lead CRM */
    const O = require(path.join(ROOT, 'assets/js/pulse/pulse-operations.js'));
    const now = Date.parse('2026-10-22T05:00:00Z');
    const state = { ...data, nextId: 1 };
    O.ensure(state);
    const desk = O.desk(state, now);
    assert.ok(desk.some(r => r.sourceId === 'studio-tk1' && r.kind === 'Overdue'), 'overdue real task appears on desk');
    assert.ok(desk.every(r => r.sourceId !== 'studio-tk2'), 'future task not overdue');
    /* governance role mapping */
    assert.strictEqual(PulseData.mapUser(stub.user).role, 'Owner');
    assert.strictEqual(PulseData.mapUser({ id: 'a', isAdmin: true }).role, 'Admin');
    assert.strictEqual(PulseData.mapUser({ id: 'b', canWrite: true }).role, 'Member');
    assert.strictEqual(PulseData.mapUser({ id: 'c' }).role, 'Viewer');
    passed++;
    console.log('  ok - PulseData.create() maps real API data; missing domains stay empty');
  }).catch(e => { console.error('  FAIL adapter test :: ' + e.stack); process.exitCode = 1; });
})();
