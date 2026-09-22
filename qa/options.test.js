/* Options comparison, QR/share and share-view tests.
   Run: node qa/options.test.js */
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

function bootBuilder(seedStorage, url) {
  const html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: url || 'http://localhost/quotation.html',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
      window.Element.prototype.scrollIntoView = function () {};
      window.confirm = () => true;
      window.open = (u) => { window.__lastOpen = u; return {}; };
      if (seedStorage) for (const [k, v] of Object.entries(seedStorage)) window.localStorage.setItem(k, v);
      window.addEventListener('error', (e) => errors.push('window: ' + e.message));
    }
  });
  const { window } = dom;
  const src = ['content.js', 'finance.js', 'bess.js', 'icons.js', 'charts.js', 'model.js', 'state.js',
    'equipment.js', 'render.js', 'editor.js', 'export.js', 'app.js']
    .map((f) => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n;\n');
  window.eval(src);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  return window;
}

const fire = (w, el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const dumpStorage = (w) => {
  const out = {};
  for (let i = 0; i < w.localStorage.length; i++) {
    const k = w.localStorage.key(i);
    out[k] = w.localStorage.getItem(k);
  }
  return out;
};

console.log('— options: default state —');
const w = bootBuilder();
const d = w.document;
t('no errors on boot', errors.length === 0, errors.join('|'));
t('options page hidden by default', d.querySelector('[data-page="pageOptions"]').style.display === 'none');
t('nav has 15 chips (no options)', d.querySelectorAll('#pageNav .nav-chip').length === 15,
  d.querySelectorAll('#pageNav .nav-chip').length);
t('labels say of 15', d.getElementById('v_pgnum_pageAbout').textContent === 'Page 3 of 15');
t('opt list shows empty hint', d.getElementById('optList').textContent.includes('No saved options'));

console.log('— options: save & compare —');
d.getElementById('capacity').value = '5';
fire(w, d.getElementById('capacity'), 'input');
d.getElementById('optName').value = 'Good — 5 kWp';
d.getElementById('optSave').click();
d.getElementById('capacity').value = '8';
fire(w, d.getElementById('capacity'), 'input');
d.getElementById('optName').value = 'Best — 8 kWp';
d.getElementById('optSave').click();

t('two options stored', w.__qsOptions.length === 2);
t('options page now visible', d.querySelector('[data-page="pageOptions"]').style.display !== 'none');
t('nav now has 16 chips', d.querySelectorAll('#pageNav .nav-chip').length === 16,
  d.querySelectorAll('#pageNav .nav-chip').length);
t('labels renumber (of 16)', d.getElementById('v_pgnum_pageAbout').textContent === 'Page 4 of 16',
  d.getElementById('v_pgnum_pageAbout').textContent);
t('options page is page 3', d.getElementById('v_pgnum_pageOptions').textContent === 'Page 3 of 16');
t('comparison has 2 option columns', d.querySelectorAll('#v_opTable thead th').length === 3,
  d.querySelectorAll('#v_opTable thead th').length);
t('comparison rows = 10 metrics', d.querySelectorAll('#v_opTable tbody tr').length === 10);
t('header shows option names', d.getElementById('v_opTable').textContent.includes('Good — 5 kWp') &&
  d.getElementById('v_opTable').textContent.includes('Best — 8 kWp'));
t('payback row exists', d.getElementById('v_opTable').textContent.includes('Payback Period'));
t('best-cell highlighting applied', d.querySelectorAll('#v_opTable td.best').length >= 3,
  d.querySelectorAll('#v_opTable td.best').length);
t('option summaries computed (payback in list)', d.getElementById('optList').textContent.includes('payback'));

console.log('— options: recommended, apply, delete —');
const recBtn = [...d.querySelectorAll('#optList button[data-act="rec"]')][1];
recBtn.click();
t('recommended badge in table header', !!d.querySelector('#v_opTable th .opt-rec'));
t('row highlighted as recommended', !!d.querySelector('#optList .opt-row.recommended'));
const recAgain = [...d.querySelectorAll('#optList button[data-act="rec"]')][0];
recAgain.click();
t('recommended moves (exclusive)', [...d.querySelectorAll('#optList .opt-row.recommended')].length === 1 &&
  d.querySelector('#optList .opt-row.recommended .opt-name').textContent.includes('Good'));

d.getElementById('capacity').value = '7';
fire(w, d.getElementById('capacity'), 'input');
[...d.querySelectorAll('#optList button[data-act="apply"]')][1].click(); /* apply Best */
t('apply option restores its capacity (8)', d.getElementById('capacity').value === '8',
  d.getElementById('capacity').value);
[...d.querySelectorAll('#optList button[data-act="del"]')][0].click();
t('delete removes option', w.__qsOptions.length === 1);
t('page still visible with 1 option? (needs 2) → hidden', d.querySelector('[data-page="pageOptions"]').style.display === 'none');

console.log('— whatsapp share —');
d.getElementById('custName').value = 'QA Customer'; fire(w, d.getElementById('custName'), 'input');
d.getElementById('shareUrl').value = 'https://example.com/p/KTME-2026-013';
fire(w, d.getElementById('shareUrl'), 'input');
d.getElementById('waShare').click();
const openUrl = decodeURIComponent(w.__lastOpen || '');
t('wa.me link opened', (w.__lastOpen || '').startsWith('https://wa.me/?text='));
t('message contains customer name', openUrl.includes('QA Customer'));
t('message contains proposal link', openUrl.includes('https://example.com/p/KTME-2026-013'));

console.log('— persistence with options —');
setTimeout(async () => {
  const dump = dumpStorage(w);
  const activeBlob = JSON.parse(dump['qstudio.proposal.' + dump['qstudio.activeId']]);
  t('options persisted on blob', Array.isArray(activeBlob.options) && activeBlob.options.length === 1,
    JSON.stringify(activeBlob.options || []).slice(0, 120));
  t('shareUrl persisted', activeBlob.form.shareUrl === 'https://example.com/p/KTME-2026-013');

  /* restore in a fresh boot */
  const w2 = bootBuilder(dump);
  const d2 = w2.document;
  t('restored option list', w2.__qsOptions.length === 1);
  t('restored shareUrl', d2.getElementById('shareUrl').value === 'https://example.com/p/KTME-2026-013');

  /* options survive versioning */
  d2.getElementById('capacity').value = '9';
  fire(w2, d2.getElementById('capacity'), 'input');
  d2.getElementById('pmVersion').click();
  const nb = w2.Proposals.active();
  t('new version carries options', Array.isArray(nb.options) && nb.options.length === 1);
  t('old version keeps its own options', w2.Proposals.get(nb.prevId).options.length === 1);

  /* export/import round-trip keeps options */
  const blob2 = w2.Proposals.active();
  const payload = JSON.stringify({ kind: 'ktm-proposal', v: 3, proposal: blob2 });
  const f = new w2.File([payload], 'proposal.json', { type: 'application/json' });
  const imported = await w2.StateStore.importFile(f);
  t('imported proposal keeps options', Array.isArray(imported.options) && imported.options.length === 1,
    JSON.stringify(imported.options || []).slice(0, 80));

  /* ---------- share view ---------- */
  console.log('— share view (share.html?p=…) —');
  const shareId = dump['qstudio.activeId'];
  const shareStorage = {};
  Object.keys(dump).forEach((k) => {
    if (k.startsWith('qstudio.proposal.') || k === 'qstudio.proposals.index') shareStorage[k] = dump[k];
  });
  const shtml = fs.readFileSync(path.join(ROOT, 'share.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom3 = new JSDOM(shtml, {
    url: 'http://localhost/share.html?p=' + shareId,
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
      window.Element.prototype.scrollIntoView = function () {};
      window.fetch = () => Promise.resolve({
        text: () => Promise.resolve(
          fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8'))
      });
      if (shareStorage) for (const [k, v] of Object.entries(shareStorage)) window.localStorage.setItem(k, v);
      window.addEventListener('error', (e) => errors.push('share: ' + e.message));
    }
  });
  const w3 = dom3.window;
  /* stub jsPDF so the share-view export path is testable */
  w3.jspdf = {
    jsPDF: class {
      constructor() { this.internal = { pageSize: { getWidth: () => 794, getHeight: () => 1123 } }; }
      addPage() {} addImage() {} setProperties() {} save() {}
    }
  };
  const src3 = ['content.js', 'finance.js', 'bess.js', 'icons.js', 'charts.js', 'model.js', 'state.js',
    'equipment.js', 'render.js', 'export.js', 'share.js']
    .map((f) => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n;\n');
  w3.eval(src3);
  w3.document.dispatchEvent(new w3.Event('DOMContentLoaded', { bubbles: true }));
  setTimeout(() => {
    const d3 = w3.document;
    const expectedNet = w3.Finance.fmtINR(w3.Finance.compute(Object.assign(
      {}, w3.StateStore.DEFAULTS, w3.Proposals.get(shareId).form)).netInvestment);
    t('share: customer banner', d3.getElementById('shareCustomer').textContent.includes('QA Customer'),
      d3.getElementById('shareCustomer').textContent);
    t('share: capacity line', d3.getElementById('shareCapacity').textContent.includes('kWp'));
    t('share: status chip', d3.getElementById('shareStatus').textContent.length > 0);
    t('share: pages injected', d3.querySelectorAll('.page-wrap').length === 19, d3.querySelectorAll('.page-wrap').length);
    t('share: pages visible', [...d3.querySelectorAll('.page-wrap')].filter((x) => x.style.display !== 'none').length === 15);
    t('share: hero matches proposal finance', d3.getElementById('v_exHeroNet').textContent === expectedNet,
      d3.getElementById('v_exHeroNet').textContent + ' vs ' + expectedNet);
    t('share: no editor panel', !d3.getElementById('quoteForm'));
    t('share: no errors', errors.length === 0, errors.join('|'));

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }, 900);
}, 700);
