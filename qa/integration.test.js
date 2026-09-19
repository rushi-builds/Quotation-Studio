/* Integration test: boots the real app in jsdom and exercises the full pipeline.
   Run: node qa/integration.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name, extra !== undefined ? '→ ' + String(extra).slice(0, 200) : ''); }
};
const errors = [];

/* ---------- canvas 2d recording mock ---------- */
function mockCtx() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'measureText') return () => ({ width: 42 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof prop === 'string') {
        if (!(prop in target)) target[prop] = (...args) => { /* record draws */ void args; };
        return target[prop];
      }
      return undefined;
    },
    set() { return true; }
  });
}

function bootApp(seedStorage) {
  const html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: 'http://localhost/quotation.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
      window.Element.prototype.scrollIntoView = function () {};
      window.devicePixelRatio = 2;
      if (seedStorage) {
        for (const [k, v] of Object.entries(seedStorage)) window.localStorage.setItem(k, v);
      }
      window.addEventListener('error', (e) => errors.push('window: ' + e.message));
    }
  });
  const { window } = dom;
  /* browser <script> tags share top-level scope; a single concatenated eval mimics that */
  const src = ['content.js', 'finance.js', 'icons.js', 'charts.js', 'state.js', 'render.js', 'editor.js', 'export.js', 'app.js']
    .map((f) => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n;\n');
  window.eval(src);
  /* scripts attach to DOMContentLoaded which has already fired in jsdom */
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  return window;
}

/* =================== run 1 — fresh boot =================== */
console.log('— boot —');
const w = bootApp();
const d = w.document;

t('no uncaught errors on boot', errors.length === 0, errors.join(' | '));
t('rendered 15 pages', d.querySelectorAll('.page').length === 15, d.querySelectorAll('.page').length);
t('page labels generated', /Page 1 of 15/.test(d.querySelector('[data-page="pageCover"] .page-label').textContent),
  d.querySelector('[data-page="pageCover"] .page-label').textContent);
t('cover shows customer', d.getElementById('v_coverCustName').textContent.includes('Bhooshan'));
t('cover badge generation', /10,220/.test(d.getElementById('v_coverBadgeGen').textContent),
  d.getElementById('v_coverBadgeGen').textContent);
t('exec hero net = ₹6,08,070', d.getElementById('v_exHeroNet').textContent === '₹6,08,070',
  d.getElementById('v_exHeroNet').textContent);
t('exec payback ≈ 3.7 yrs', /^3\.\d/.test(d.getElementById('v_exHeroPayback').textContent),
  d.getElementById('v_exHeroPayback').textContent);
t('exec 8 KPI tiles', d.querySelectorAll('#v_exKpis .kpi-tile').length === 8);
t('exec journey 5 steps', d.querySelectorAll('#v_exJourney .jstep').length === 5);
t('what-you-get has 8 items', d.querySelectorAll('#v_exIncluded .inc-item').length === 8);
t('about stats rendered', d.querySelectorAll('#v_abStats .stat-card').length === 4);
t('why-solar benefits 6', d.querySelectorAll('#v_wsBenefits .benefit-card').length === 6);
t('benefit template filled ({treesAnnual})', !/{[a-zA-Z]+}/.test(d.getElementById('v_wsBenefits').textContent),
  d.getElementById('v_wsBenefits').textContent.match(/\{\w+\}/));
t('solution spec cards 8 (3 dyn + 5 content)', d.querySelectorAll('#v_soSpecs .spec-card').length === 8);
t('tech spec table has groups', d.querySelectorAll('#v_tsTable tr.spec-group').length >= 3);
t('tech spec module count 13', d.getElementById('v_tsTable').textContent.includes('13 modules'));
t('scope deliverables 6', d.querySelectorAll('#v_scDeliverables .deliv-box').length === 6);
t('quality checklist 6', d.querySelectorAll('#v_quChecklist .check-card').length === 6);
t('savings table 5 milestone rows', d.querySelectorAll('#v_svTable tbody tr').length === 5);
t('investment cost cards filled', d.getElementById('v_inCostNet').textContent === '₹6,08,070',
  d.getElementById('v_inCostNet').textContent);
t('investment ₹/Wp = ₹90', d.getElementById('v_inRate').textContent === '₹90 / Wp', d.getElementById('v_inRate').textContent);
t('BOM section hidden when empty', d.getElementById('v_inBomSection').style.display === 'none');
t('bridge chart shown when no BOM', d.getElementById('v_inBridgeSolo').style.display !== 'none');
t('pay chips rendered', d.querySelectorAll('#v_inPayChips .pay-chip').length === 3);
t('advance chip amount = ₹3,43,035', d.getElementById('v_inPayChips').textContent.includes('₹3,43,035'),
  d.getElementById('v_inPayChips').textContent);
t('why-ktm 9 differentiators', d.querySelectorAll('#v_wkDiffs .diff-card').length === 9);
t('projects 9 cards with images', d.querySelectorAll('#v_prCats .proj-card img').length === 9);
t('project img src resolves', d.querySelector('#v_prCats .proj-card img').getAttribute('src').includes('site-'));
t('warranty 4 cards', d.querySelectorAll('#v_wrWarranties .warr-card').length === 4);
t('journey 6 steps', d.querySelectorAll('#v_wrJourney .journey-card').length === 6);
t('terms 12 items', d.querySelectorAll('#v_tmItems .term-item').length === 12);
t('terms validity templated (15 days)', d.getElementById('v_tmItems').textContent.includes('15 days'));
t('closing signature boxes 2', d.querySelectorAll('.sign-box').length === 2);
t('footer page numbers', d.getElementById('v_pgnum_pageTerms').textContent === 'Page 14 of 15',
  d.getElementById('v_pgnum_pageTerms').textContent);
t('footer company filled', d.querySelector('[data-foot-company]').textContent.includes('KTM'));
t('head meta has ref+version', d.querySelector('[data-head-ref]').textContent.includes('v1.0'));
t('advanced editor built', d.querySelectorAll('#advContainer details.page-group').length >= 14,
  d.querySelectorAll('#advContainer details.page-group').length);
t('navigator has 15 chips', d.querySelectorAll('#pageNav .nav-chip').length === 15);

console.log('— interactions —');
/* capacity change re-renders */
d.getElementById('capacity').value = '10';
d.getElementById('capacity').dispatchEvent(new w.Event('input', { bubbles: true }));
t('capacity 10 → hero updates', d.getElementById('v_exHeroNet').textContent === '₹9,02,100',
  d.getElementById('v_exHeroNet').textContent);
t('capacity 10 → module count 19', d.getElementById('v_tsTable').textContent.includes('19 modules'),
  d.getElementById('v_tsTable').textContent.match(/\d+ modules/));
d.getElementById('capacity').value = '7';
d.getElementById('capacity').dispatchEvent(new w.Event('input', { bubbles: true }));

/* commercial subsidy */
d.getElementById('customerType').value = 'commercial';
d.getElementById('customerType').dispatchEvent(new w.Event('change', { bubbles: true }));
t('commercial → subsidy ₹0 shown', d.getElementById('v_inCostSub').textContent === '− ₹0',
  d.getElementById('v_inCostSub').textContent);
t('commercial → caption N/A', d.getElementById('v_inCostSubCap').textContent.includes('Not applicable'),
  d.getElementById('v_inCostSubCap').textContent);
d.getElementById('customerType').value = 'residential';
d.getElementById('customerType').dispatchEvent(new w.Event('change', { bubbles: true }));

/* BOM + donut + legend */
['bomModules:300000', 'bomInverter:80000', 'bomStructure:70000', 'bomBos:60000', 'bomInstall:90000', 'bomLiaison:30000']
  .forEach((pair) => {
    const [id, v] = pair.split(':');
    d.getElementById(id).value = v;
    d.getElementById(id).dispatchEvent(new w.Event('input', { bubbles: true }));
  });
t('BOM section appears', d.getElementById('v_inBomSection').style.display !== 'none');
t('bridge chart stays visible alongside donut', !!d.getElementById('chartBridge'));
t('BOM legend 6 rows', d.querySelectorAll('#v_inBomLegend .bom-row').length === 6);
t('BOM legend has %', d.getElementById('v_inBomLegend').textContent.includes('%'));
t('BOM delta warning shown (630k vs 630k → none)',
  d.getElementById('v_inBomLegend').querySelector('.bom-warn') === null);

/* payment warning */
d.getElementById('payCompletion').value = '20';
d.getElementById('payCompletion').dispatchEvent(new w.Event('input', { bubbles: true }));
t('payment ≠100% shows warning', d.getElementById('v_inPayWarn').style.display !== 'none',
  d.getElementById('v_inPayWarn').style.display);
d.getElementById('payCompletion').value = '10';
d.getElementById('payCompletion').dispatchEvent(new w.Event('input', { bubbles: true }));

/* monthly bill + available area extras */
d.getElementById('monthlyBill').value = '12000';
d.getElementById('monthlyBill').dispatchEvent(new w.Event('input', { bubbles: true }));
t('bill-offset KPI appears', d.getElementById('v_exKpis').textContent.includes('of your bill'));
d.getElementById('availableArea').value = '25';
d.getElementById('availableArea').dispatchEvent(new w.Event('input', { bubbles: true }));
t('area fit check flags shortage', d.getElementById('v_tsTable').textContent.includes('exceeds available area'),
  d.getElementById('v_tsTable').textContent.includes('fits'));

/* advanced edit propagation */
const advInput = [...d.querySelectorAll('#advContainer input')].find((i) => i.value === 'Why Rooftop Solar?');
if (advInput) {
  advInput.value = 'Why Go Solar?';
  advInput.dispatchEvent(new w.Event('input', { bubbles: true }));
  t('advanced edit updates page', d.getElementById('v_wsHeading').textContent === 'Why Go Solar?');
} else {
  t('advanced edit updates page', false, 'field not found');
}

/* autosave */
await_new_tick(() => {
  console.log('— persistence —');
  const saved = w.localStorage.getItem('qstudio.proposal.v2');
  t('autosave wrote storage', !!saved);
  const data = JSON.parse(saved);
  t('saved form has capacity 7', data.form.capacity === '7');
  t('saved content override persisted', data.content.pageWhySolar.heading === 'Why Go Solar?');
  t('saved BOM persisted', data.form.bomModules === '300000');

  /* run 2 — restore */
  console.log('— restore —');
  const w2 = bootApp({ 'qstudio.proposal.v2': saved });
  const d2 = w2.document;
  t('restored heading (Why Go Solar?)', d2.getElementById('v_wsHeading').textContent === 'Why Go Solar?',
    d2.getElementById('v_wsHeading').textContent);
  t('restored BOM shows donut', d2.getElementById('v_inBomSection').style.display !== 'none');
  t('no errors in run 2', errors.length === 0, errors.join(' | '));

  /* PDF export smoke */
  console.log('— pdf export —');
  let savedName = '';
  w.html2canvas = async () => ({ toDataURL: () => 'data:image/jpeg;base64,AAAA' });
  w.jspdf = {
    jsPDF: class {
      constructor() { this.internal = { pageSize: { getWidth: () => 794, getHeight: () => 1123 } }; this.calls = []; }
      addPage() { this.calls.push('addPage'); }
      addImage() { this.calls.push('addImage'); }
      setProperties() { this.calls.push('setProps'); }
      save(n) { savedName = n; }
    }
  };
  w.document.getElementById('downloadBtn').click();
  setTimeout(() => {
    t('pdf saved with customer+capacity+ref', /Proposal_Mr_Bhooshan_Waghmare_7kWp_KTM-2026-Solar-013\.pdf/.test(savedName), savedName);
    t('status message shown', w.document.getElementById('statusMsg').textContent.includes('Downloaded'),
      w.document.getElementById('statusMsg').textContent);

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }, 300);
});

function await_new_tick(fn) { setTimeout(fn, 700); }
