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
        if (!(prop in target)) target[prop] = (...args) => { void args; };
        return target[prop];
      }
      return undefined;
    },
    set() { return true; }
  });
}

function bootApp(seedStorage, url) {
  const html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: url || 'http://localhost/quotation.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
      window.Element.prototype.scrollIntoView = function () {};
      window.devicePixelRatio = 2;
      window.confirm = () => true;
      if (seedStorage) {
        for (const [k, v] of Object.entries(seedStorage)) window.localStorage.setItem(k, v);
      }
      window.addEventListener('error', (e) => errors.push('window: ' + e.message));
    }
  });
  const { window } = dom;
  /* browser <script> tags share top-level scope; a single concatenated eval mimics that */
  const src = ['content.js', 'finance.js', 'icons.js', 'charts.js', 'model.js', 'state.js',
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

/* =================== run 1 — fresh boot =================== */
console.log('— boot —');
const w = bootApp();
const d = w.document;

const visibleWraps = () => [...d.querySelectorAll('.page-wrap')].filter((w) => w.style.display !== 'none').length;
t('no uncaught errors on boot', errors.length === 0, errors.join(' | '));
t('15 pages visible (options off by default)', visibleWraps() === 15, visibleWraps());
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
t('pay chips rendered', d.querySelectorAll('#v_inPayChips .pay-chip').length === 3);
t('advance chip amount = ₹3,43,035', d.getElementById('v_inPayChips').textContent.includes('₹3,43,035'),
  d.getElementById('v_inPayChips').textContent);
t('why-ktm 9 differentiators', d.querySelectorAll('#v_wkDiffs .diff-card').length === 9);
t('projects 9 cards with images', d.querySelectorAll('#v_prCats .proj-card img').length === 9);
t('projects stats strip filled', d.getElementById('v_prStats').textContent.includes('flagship projects'));
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

/* ---------- Phase 1: proposal store ---------- */
console.log('— proposal store (Phase 1) —');
t('one proposal created on first boot', w.Proposals.list().length === 1, w.Proposals.list().length);
t('active id set', !!w.Proposals.activeId());
t('manager dropdown populated', d.getElementById('proposalSelect').options.length === 1);
t('status select shows Draft', d.getElementById('pmStatus').value === 'draft', d.getElementById('pmStatus').value);
t('blob contains live form', w.Proposals.active().form.capacity === '7');

/* ---------- Phase 1: equipment catalog ---------- */
console.log('— equipment catalog (Phase 1) —');
t('3 seed modules in catalog', w.EquipmentStore.cat().modules.length === 3);
t('module select built from catalog', d.getElementById('moduleMake').options.length === 3);
t('inverter select built from catalog', d.getElementById('inverterMake').options.length === 3);
t('structure select built from catalog', d.getElementById('mountMake').options.length === 2);
t('catalog manager rendered rows', d.querySelectorAll('#eqCatalog .eq-row').length >= 8,
  d.querySelectorAll('#eqCatalog .eq-row').length);
/* adding a catalog entry propagates to the form select and component fields */
w.EquipmentStore.cat().modules.push({ id: 'mx', make: 'TestModule 550', model: '', wp: 550, tech: 'TOPCon', lengthMm: '2333', widthMm: '1134', efficiency: '', voc: '', isc: '', vmp: '', imp: '' });
w.EquipmentStore.save();
w.EquipmentStore.refreshSelects();
t('catalog add appears in select', d.getElementById('moduleMake').options.length === 4);
d.getElementById('moduleMake').value = 'TestModule 550';
fire(w, d.getElementById('moduleMake'), 'change');
t('selecting module syncs wattage', d.getElementById('moduleWattage').value === '550', d.getElementById('moduleWattage').value);
t('selecting module syncs length', d.getElementById('moduleLengthMm').value === '2333');
t('selecting module syncs technology', d.getElementById('moduleTech').value === 'TOPCon');
/* restore original selection */
d.getElementById('moduleMake').value = 'Panasonic / Waaree / Adani or Equivalent';
fire(w, d.getElementById('moduleMake'), 'change');

/* ---------- interactions ---------- */
console.log('— interactions —');
d.getElementById('capacity').value = '10';
fire(w, d.getElementById('capacity'), 'input');
t('capacity 10 → hero updates', d.getElementById('v_exHeroNet').textContent === '₹9,02,100',
  d.getElementById('v_exHeroNet').textContent);
t('capacity 10 → module count 19', d.getElementById('v_tsTable').textContent.includes('19 modules'),
  d.getElementById('v_tsTable').textContent.match(/\d+ modules/));
d.getElementById('capacity').value = '7';
fire(w, d.getElementById('capacity'), 'input');

d.getElementById('customerType').value = 'commercial';
fire(w, d.getElementById('customerType'), 'change');
t('commercial → subsidy ₹0 shown', d.getElementById('v_inCostSub').textContent === '− ₹0',
  d.getElementById('v_inCostSub').textContent);
t('commercial → caption N/A', d.getElementById('v_inCostSubCap').textContent.includes('Not applicable'),
  d.getElementById('v_inCostSubCap').textContent);
d.getElementById('customerType').value = 'residential';
fire(w, d.getElementById('customerType'), 'change');

['bomModules:300000', 'bomInverter:80000', 'bomStructure:70000', 'bomBos:60000', 'bomInstall:90000', 'bomLiaison:30000']
  .forEach((pair) => {
    const [id, v] = pair.split(':');
    d.getElementById(id).value = v;
    fire(w, d.getElementById(id), 'input');
  });
t('BOM section appears', d.getElementById('v_inBomSection').style.display !== 'none');
t('BOM legend 6 rows', d.querySelectorAll('#v_inBomLegend .bom-row').length === 6);
t('BOM legend has %', d.getElementById('v_inBomLegend').textContent.includes('%'));
t('BOM delta warning shown (630k vs 630k → none)',
  d.getElementById('v_inBomLegend').querySelector('.bom-warn') === null);

d.getElementById('payCompletion').value = '20';
fire(w, d.getElementById('payCompletion'), 'input');
t('payment ≠100% shows warning', d.getElementById('v_inPayWarn').style.display !== 'none',
  d.getElementById('v_inPayWarn').style.display);
d.getElementById('payCompletion').value = '10';
fire(w, d.getElementById('payCompletion'), 'input');

d.getElementById('monthlyBill').value = '12000';
fire(w, d.getElementById('monthlyBill'), 'input');
t('bill-offset KPI appears', d.getElementById('v_exKpis').textContent.includes('of your bill'));
d.getElementById('availableArea').value = '25';
fire(w, d.getElementById('availableArea'), 'input');
t('area fit check flags shortage', d.getElementById('v_tsTable').textContent.includes('exceeds available area'));

const advInput = [...d.querySelectorAll('#advContainer input')].find((i) => i.value === 'Why Rooftop Solar?');
if (advInput) {
  advInput.value = 'Why Go Solar?';
  fire(w, advInput, 'input');
  t('advanced edit updates page', d.getElementById('v_wsHeading').textContent === 'Why Go Solar?');
} else {
  t('advanced edit updates page', false, 'field not found');
}

/* ---------- manager workflow ---------- */
console.log('— manager workflow —');
d.getElementById('pmNew').click();
t('New creates 2nd proposal', w.Proposals.list().length === 2, w.Proposals.list().length);
t('New switches active', w.Proposals.get(w.Proposals.activeId()).form.custName === 'Mr. Bhooshan Waghmare');
t('New resets BOM (pristine template)', d.getElementById('bomModules').value === '');
t('manager dropdown now 2 options', d.getElementById('proposalSelect').options.length === 2);
t('New preserved the previous proposal\u2019s edits',
  w.Proposals.list().map((p) => w.Proposals.get(p.id))
    .some((b) => b.form && b.form.bomModules === '300000'));

d.getElementById('pmStatus').value = 'sent';
fire(w, d.getElementById('pmStatus'), 'change');
t('status change persists (sentAt set)', w.Proposals.active().status === 'sent' && !!w.Proposals.active().sentAt);

d.getElementById('capacity').value = '5';
fire(w, d.getElementById('capacity'), 'input');
d.getElementById('pmVersion').click();
const verBlob = w.Proposals.active();
t('version bumped to 1.1', verBlob.form.propVersion === '1.1', verBlob.form.propVersion);
t('version links to previous', verBlob.prevId && verBlob.prevId !== verBlob.id);
t('previous version still intact (immutable history)', w.Proposals.get(verBlob.prevId).form.capacity === '5');
t('original still v1.0 + sent', w.Proposals.get(verBlob.prevId).form.propVersion === '1.0' &&
  w.Proposals.get(verBlob.prevId).status === 'sent');
t('version shown on cover meta', d.querySelector('[data-head-ref]').textContent.includes('v1.1'));

d.getElementById('pmDup').click();
t('duplicate creates copy', w.Proposals.list().length === 4, w.Proposals.list().length);
t('duplicate marked (copy)', w.Proposals.active().form.custName.includes('(copy)'));

const beforeDelete = w.Proposals.activeId();
d.getElementById('pmDelete').click();
t('delete removes proposal', w.Proposals.list().length === 3 && w.Proposals.activeId() !== beforeDelete);

/* switch back to the original proposal (the one holding the BOM edits) */
const target = w.Proposals.list()
  .map((p) => w.Proposals.get(p.id))
  .find((b) => b.form && b.form.bomModules === '300000');
t('original edits were persisted before switching', !!target);
d.getElementById('proposalSelect').value = target.id;
fire(w, d.getElementById('proposalSelect'), 'change');
t('switching proposals restores data (BOM repopulated)',
  w.Proposals.activeId() === target.id && d.getElementById('bomModules').value === '300000',
  d.getElementById('bomModules').value);
t('switching restores capacity', d.getElementById('capacity').value === '7',
  d.getElementById('capacity').value);

/* ---------- system options (Good / Better / Best) ---------- */
console.log('— system options —');
d.getElementById('optShow').checked = true;
fire(w, d.getElementById('optShow'), 'change');
t('options page visible (16 total)', visibleWraps() === 16, visibleWraps());
t('nav chips 16', d.querySelectorAll('#pageNav .nav-chip').length === 16,
  d.querySelectorAll('#pageNav .nav-chip').length);
t('labels say "of 16"', /of 16/.test(d.querySelector('[data-page="pageExec"] .page-label').textContent),
  d.querySelector('[data-page="pageExec"] .page-label').textContent);
t('about shifted to page 4 of 16', /Page 4 of 16/.test(d.querySelector('[data-page="pageAbout"] .page-label').textContent),
  d.querySelector('[data-page="pageAbout"] .page-label').textContent);
d.getElementById('opt1Kwp').value = '5';
fire(w, d.getElementById('opt1Kwp'), 'input');
d.getElementById('opt2Kwp').value = '7';
d.getElementById('opt2Cost').value = '92000';
fire(w, d.getElementById('opt2Kwp'), 'input');
fire(w, d.getElementById('opt2Cost'), 'input');
const cardsTxt = d.getElementById('v_opCards').textContent;
t('option 1 net = ₹4,12,050 (5 kWp @ ₹90k, subsidy ₹78k)', cardsTxt.includes('₹4,12,050'),
  cardsTxt.slice(0, 160));
t('option 1 generation 7,300 kWh', cardsTxt.includes('7,300 kWh'));
t('option 2 net = ₹6,23,316 (7 kWp @ ₹92k)', cardsTxt.includes('₹6,23,316'), cardsTxt.slice(0, 260));
t('RECOMMENDED badge on ★ option (default ★2)', cardsTxt.includes('RECOMMENDED'));
t('IN THIS PROPOSAL on 7 kWp option (matches main)', cardsTxt.includes('IN THIS PROPOSAL'));
t('comparison table has 6 metric rows', d.querySelectorAll('#v_opTable tbody tr').length === 6,
  d.querySelectorAll('#v_opTable tbody tr').length);
d.getElementById('optShow').checked = false;
fire(w, d.getElementById('optShow'), 'change');
t('options off → back to 15', visibleWraps() === 15, visibleWraps());
t('about back to page 3 of 15', /Page 3 of 15/.test(d.querySelector('[data-page="pageAbout"] .page-label').textContent));

/* ---------- persistence ---------- */
setTimeout(() => {
  console.log('— persistence —');
  const dump = dumpStorage(w);
  t('active blob persisted edits', (() => {
    const blob = JSON.parse(dump['qstudio.proposal.' + dump['qstudio.activeId']]);
    return blob.form.monthlyBill === '12000' && blob.form.availableArea === '25';
  })());
  t('content override persisted in blob', (() => {
    const blob = JSON.parse(dump['qstudio.proposal.' + dump['qstudio.activeId']]);
    return blob.content && blob.content.pageWhySolar.heading === 'Why Go Solar?';
  })());
  t('equipment catalog persisted', (() => {
    const eq = JSON.parse(dump['qstudio.equipment']);
    return eq.modules.length === 4 && eq.modules.some((m) => m.make === 'TestModule 550');
  })());

  /* run 2 — restore from full storage dump */
  console.log('— restore —');
  const w2 = bootApp(dump);
  const d2 = w2.document;
  t('restored heading (Why Go Solar?)', d2.getElementById('v_wsHeading').textContent === 'Why Go Solar?',
    d2.getElementById('v_wsHeading').textContent);
  t('restored BOM shows donut', d2.getElementById('v_inBomSection').style.display !== 'none');
  t('restored proposal count', w2.Proposals.list().length === 3, w2.Proposals.list().length);
  t('restored active is same proposal', w2.Proposals.activeId() === dump['qstudio.activeId']);
  t('restored equipment catalog', w2.EquipmentStore.cat().modules.length === 4);
  t('no errors in run 2', errors.length === 0, errors.join(' | '));

  /* run 3 — legacy migration */
  console.log('— legacy migration —');
  const legacyPayload = JSON.stringify({
    v: 2, savedAt: '2026-01-01T00:00:00.000Z',
    form: { capacity: '9', custName: 'Legacy Customer', propRef: 'LEGACY/001', propVersion: '1.0' },
    content: { pageWhySolar: { heading: 'Legacy Heading' } },
    projectImages: {}
  });
  const w3 = bootApp({ 'qstudio.proposal.v2': legacyPayload });
  const d3 = w3.document;
  t('legacy migrated to 1 proposal', w3.Proposals.list().length === 1, w3.Proposals.list().length);
  t('legacy form applied (capacity 9)', w3.Proposals.active().form.capacity === '9');
  t('legacy customer on cover', d3.getElementById('v_coverCustName').textContent.includes('Legacy Customer'));
  t('legacy content applied', d3.getElementById('v_wsHeading').textContent === 'Legacy Heading',
    d3.getElementById('v_wsHeading').textContent);

  /* run 4 — customer share mode (?p=<id>) */
  console.log('— customer share mode —');
  const otherId = Object.keys(dump)
    .filter((k) => k.indexOf('qstudio.proposal.') === 0)
    .map((k) => k.replace('qstudio.proposal.', ''))
    .find((id) => id !== dump['qstudio.activeId']);
  const w4 = bootApp(dump, 'http://localhost/quotation.html?p=' + otherId);
  const d4 = w4.document;
  t('customer mode class on body', d4.body.classList.contains('customer-mode'));
  t('topbar shows company', d4.getElementById('ctCompany').textContent.includes('KTM'),
    d4.getElementById('ctCompany').textContent);
  t('topbar shows prepared-for', (d4.getElementById('ctFor').textContent || '').length > 5,
    d4.getElementById('ctFor').textContent);
  t('call link is tel:', (d4.getElementById('ctCall').getAttribute('href') || '').indexOf('tel:') === 0);
  t('owner active pointer untouched', w4.Proposals.activeId() === dump['qstudio.activeId'],
    w4.Proposals.activeId() + ' vs ' + dump['qstudio.activeId']);
  t('no errors in customer mode', errors.length === 0, errors.join(' | '));

  /* ---------- pdf export smoke ---------- */
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
}, 700);
