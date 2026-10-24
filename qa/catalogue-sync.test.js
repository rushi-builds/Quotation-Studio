/* Sync Catalogue button + cloud merge layer (app side, jsdom).
   Run: node qa/catalogue-sync.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name, extra !== undefined ? '→ ' + String(extra).slice(0, 220) : ''); }
};
const errors = [];

function mockCtx() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'measureText') return () => ({ width: 42 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof prop === 'string') {
        if (!(prop in target)) target[prop] = () => {};
        return target[prop];
      }
      return undefined;
    },
    set() { return true; }
  });
}

function bootBuilder(seedStorage) {
  const html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: 'http://localhost/quotation.html',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
      window.Element.prototype.scrollIntoView = function () {};
      window.confirm = () => true;
      window.open = () => ({});
      if (seedStorage) for (const [k, v] of Object.entries(seedStorage)) window.localStorage.setItem(k, v);
      window.addEventListener('error', (e) => errors.push('window: ' + e.message));
    }
  });
  const { window } = dom;
  const src = ['content.js', 'engineering.js', 'engineering.js', 'finance.js', 'storage-catalog.js', 'bess.js', 'rainwater.js', 'additional-systems.js', 'supplement-design.js', 'icons.js', 'charts.js', 'model.js', 'state.js',
    'catalogue-data.js', 'equipment.js', 'render.js', 'editor.js', 'export.js', 'app.js']
    .map((f) => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n;\n');
  window.eval(src);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  return window;
}

const until = async (cond, ms = 5000) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('until() timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};

const SYNCHED_AT = '2026-10-13T10:00:00.000Z';
const SHA = 'f'.repeat(64);
const CLOUD = {
  syncedAt: SYNCHED_AT, source: 'Solar_EPC (fixture)', sha: SHA,
  modules: [
    { make: 'Waaree', series: 'AHNAY', model: 'Bi-55-545', cellType: 'Mono PERC', moduleType: 'Bifacial', wp: 545, voc: 49.01, vmp: 41.9, isc: 13.9, imp: 13.02, efficiency: 21.17, lengthMm: 2272, widthMm: 1133, maxSystemV: 1500, tempCoefVoc: -0.25, tempCoefPmax: -0.34, maxSeriesFuse: 30, weightKg: 32, warrantyYr: 30, almm: 'ALMM Listed' },
    { make: 'Waaree', series: '', model: 'Fixture-Only-999', cellType: '', moduleType: '', wp: 999, voc: null, vmp: null, isc: null, imp: null, efficiency: null, lengthMm: null, widthMm: null, maxSystemV: null, tempCoefVoc: null, tempCoefPmax: null, maxSeriesFuse: null, weightKg: null, warrantyYr: null, almm: '' }
  ],
  inverters: [
    { make: 'Sungrow', model: 'SG7.0RT', invType: 'String', hybrid: 'No', kw: 7, phase: 3, mppt: 2, inputsPerMppt: 2, totalDcInputs: 4, maxDcKw: 10.5, vmaxDc: 1100, startV: 160, mpptMin: 160, mpptMax: 1000, nominalMppt: 585, maxCurrentA: '26', maxIscA: '54', acOutputA: 10.6, efficiency: 98.2, ip: 'IP66', weightKg: 16 },
    { make: 'Growatt', model: 'Fixture-Inv-999', invType: '', hybrid: '', kw: 999, phase: null, mppt: null, inputsPerMppt: null, totalDcInputs: null, maxDcKw: null, vmaxDc: null, startV: null, mpptMin: null, mpptMax: null, nominalMppt: null, maxCurrentA: '', maxIscA: '', acOutputA: null, efficiency: null, ip: '', weightKg: null }
  ],
  cables: [
    { make: 'Polycab', category: 'DC Cable', size: 4, material: 'Copper', ampacity: 44, resistance: 4.61, voltage: '1.5 kV', core: '1C', insulation: 'XLPE', armoured: 'No', standard: 'IS 694' }
  ]
};
const CLOUD_PAYLOAD = {
  ok: true,
  counts: { modules: CLOUD.modules.length, inverters: CLOUD.inverters.length, cables: CLOUD.cables.length },
  syncedAt: SYNCHED_AT, source: CLOUD.source, sha: SHA, catalogue: CLOUD
};
const keyOf = (r) => r.make + '\u0001' + r.model;
const okResponse = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });

(async () => {
console.log('- catalogue sync: button placement & boot state -');
const w = bootBuilder();
const d = w.document;
t('no errors on boot', errors.length === 0, errors.join('|'));
t('Sync Catalogue button exists', !!d.getElementById('syncCatalogueBtn'));
t('button sits immediately right of Save now', d.getElementById('saveNowBtn').nextElementSibling.id === 'syncCatalogueBtn',
  d.getElementById('saveNowBtn').nextElementSibling.id);
t('status span sits after the button', d.getElementById('syncCatalogueBtn').nextElementSibling.id === 'catalogueSyncStatus');
t('status empty before any sync', d.getElementById('catalogueSyncStatus').textContent === '',
  d.getElementById('catalogueSyncStatus').textContent);
t('cloudInfo empty before any sync', w.EquipmentStore.cloudInfo().syncedAt === '');

console.log('- catalogue sync: successful click merges cloud rows -');
const builtinModules = w.EquipmentStore.cat().modules;
const builtinKeys = new Set(builtinModules.map(keyOf));
const target = builtinModules.find((r) => r.make === 'Waaree' && r.model === 'Bi-55-545');
const cloudWp = (target ? target.wp : 540) + 111;
CLOUD.modules[0].wp = cloudWp;
w.fetch = async (url, opts) => {
  if (String(url).includes('/api/catalogue/sync') && opts && opts.method === 'POST') return okResponse(CLOUD_PAYLOAD);
  throw new Error('unexpected fetch ' + url);
};
d.getElementById('syncCatalogueBtn').click();
await until(() => d.getElementById('catalogueSyncStatus').textContent.includes('Synced ·'));
t('status shows the sync counts', d.getElementById('catalogueSyncStatus').textContent === 'Synced · 2 modules / 2 inverters / 1 cables',
  d.getElementById('catalogueSyncStatus').textContent);
t('cloud payload persisted under its own storage key', (() => {
  const raw = w.localStorage.getItem('qsCloudCatalogue');
  return !!raw && JSON.parse(raw).syncedAt === SYNCHED_AT;
})());
const info = w.EquipmentStore.cloudInfo();
t('cloudInfo reflects the sync', info.modules === 2 && info.inverters === 2 && info.cables === 1 && info.sha === SHA);
const mergedModules = w.EquipmentStore.cat().modules;
t('cloud row overrides the built-in row with the same make+model',
  mergedModules.find((r) => r.make === 'Waaree' && r.model === 'Bi-55-545').wp === cloudWp);
t('cloud-only rows are appended to the built-in catalogue',
  mergedModules.some((r) => r.make === 'Waaree' && r.model === 'Fixture-Only-999'));
t('cloud-only inverter reachable through the merged catalogue',
  w.EquipmentStore.cat().inverters.some((r) => r.make === 'Growatt' && r.model === 'Fixture-Inv-999'));
t('built-in rows untouched by the merge stay present', builtinKeys.size > 0 &&
  builtinModules.every((r) => mergedModules.some((m) => keyOf(m) === keyOf(r))));
t('module dropdown rebuilt without runtime errors', errors.length === 0, errors.join('|'));

console.log('- catalogue sync: manual rows still win; save() keeps cloud rows out of user storage -');
const USER_ROW = { make: 'Waaree', model: 'Bi-55-545', wp: 777, voc: '', isc: '', vmp: '', imp: '', tech: '', efficiency: '', lengthMm: '', widthMm: '' };
const USER_SEED = { _v: 2, modules: [USER_ROW, { make: 'Legacy Make', model: 'Legacy-1', wp: 123 }], inverters: [], structures: [], cables: [] };
const w2 = bootBuilder({ 'qstudio.equipment': JSON.stringify(USER_SEED) });
const d2 = w2.document;
w2.fetch = async () => okResponse(CLOUD_PAYLOAD);
d2.getElementById('syncCatalogueBtn').click();
await until(() => d2.getElementById('catalogueSyncStatus').textContent.includes('Synced ·'));
t('user row overrides the same cloud row after sync',
  w2.EquipmentStore.cat().modules.find((r) => r.make === 'Waaree' && r.model === 'Bi-55-545').wp === 777);
t('legacy user rows survive the merge',
  w2.EquipmentStore.cat().modules.some((r) => r.make === 'Legacy Make' && r.model === 'Legacy-1'));
w2.EquipmentStore.save();
const saved = JSON.parse(w2.localStorage.getItem('qstudio.equipment'));
const savedKeys = saved.modules.map(keyOf);
t('save() drops rows covered by the cloud (no double source of truth)', !savedKeys.includes('Waaree\u0001Bi-55-545'));
t('save() keeps genuinely manual rows', savedKeys.includes('Legacy Make\u0001Legacy-1'));
t('save() writes nothing else unexpected', saved.modules.length === 1, saved.modules.length);
t('cloud storage key untouched by save()', w2.localStorage.getItem('qsCloudCatalogue') !== null);

console.log('- catalogue sync: reload restores the cloud catalogue -');
const w3 = bootBuilder({ qsCloudCatalogue: JSON.stringify(CLOUD) });
const d3 = w3.document;
t('status shows the synced catalogue at boot', /^Catalogue: 2\/2\/1 · synced /.test(d3.getElementById('catalogueSyncStatus').textContent),
  d3.getElementById('catalogueSyncStatus').textContent);
t('cloud rows available at boot', w3.EquipmentStore.cat().modules.some((r) => r.model === 'Fixture-Only-999'));

console.log('- catalogue sync: honest failure messaging -');
const w4 = bootBuilder();
const d4 = w4.document;
w4.fetch = async () => okResponse({ error: 'Catalogue sync is not configured: GDRIVE_FILE_ID missing (public mode).', code: 'NOT_CONFIGURED' }, 503);
d4.getElementById('syncCatalogueBtn').click();
await until(() => d4.getElementById('catalogueSyncStatus').textContent.startsWith('Sync not set up yet'));
t('NOT_CONFIGURED explained in plain words', d4.getElementById('catalogueSyncStatus').textContent.includes('GDRIVE_FILE_ID'),
  d4.getElementById('catalogueSyncStatus').textContent);
t('cloud store left untouched after failure', w4.localStorage.getItem('qsCloudCatalogue') === null);
w4.fetch = async () => okResponse({ error: 'Catalogue sync failed: Not a zip file (no end-of-central-directory record).' }, 502);
d4.getElementById('syncCatalogueBtn').click();
await until(() => d4.getElementById('catalogueSyncStatus').textContent.startsWith('Sync failed:'));
t('generic failure shown as Sync failed', d4.getElementById('catalogueSyncStatus').textContent.includes('Not a zip file'),
  d4.getElementById('catalogueSyncStatus').textContent);
t('button re-enabled after failures', !d4.getElementById('syncCatalogueBtn').disabled);
t('no runtime errors across all boots', errors.length === 0, errors.join('|'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
})().catch((e) => { console.error(e); process.exitCode = 1; });
