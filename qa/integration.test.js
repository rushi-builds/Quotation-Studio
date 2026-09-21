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
      // jsdom has no image loader; browser suites exercise real image readiness.
      Object.defineProperty(window.HTMLImageElement.prototype, 'complete', {get: () => true});
      Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', {get: () => 100});
      Object.defineProperty(window.HTMLImageElement.prototype, 'naturalHeight', {get: () => 100});
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
    'equipment.js', 'render.js', 'editor.js', 'experience.js', 'export.js', 'app.js']
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

t('no uncaught errors on boot', errors.length === 0, errors.join(' | '));
t('rendered all 17 page shells (options + financing hidden by default)', d.querySelectorAll('.page').length === 17, d.querySelectorAll('.page').length);
t('page labels generated', /Page 1 of 15/.test(d.querySelector('[data-page="pageCover"] .page-label').textContent),
  d.querySelector('[data-page="pageCover"] .page-label').textContent);
t('cover shows customer', d.getElementById('v_coverCustName').textContent.includes('Bhooshan'));
t('cover badge generation', /₹78/.test(d.getElementById('v_coverBadgeGen').textContent),
  d.getElementById('v_coverBadgeGen').textContent);
t('exec hero net = ₹6,08,070', d.getElementById('v_exHeroNet').textContent === '₹6,08,070',
  d.getElementById('v_exHeroNet').textContent);
t('exec payback ≈ 3.7 yrs', /^3\.\d/.test(d.getElementById('v_exHeroPayback').textContent),
  d.getElementById('v_exHeroPayback').textContent);
t('exec 8 KPI tiles', d.querySelectorAll('#v_exKpis .kpi-tile').length === 8);
t('summary does not repeat its financial tiles in a journey strip', !d.getElementById('v_exJourney'));
t('solution does not repeat the summary inclusion block', !d.getElementById('v_soIncluded'));
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
t('why-ktm has six differentiators without repeated company stats', d.querySelectorAll('#v_wkDiffs .diff-card').length === 6);
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
t('customer-view button opens share.html with active id', (() => {
  w.open = (u) => { w.__cv = u; return {}; };
  d.getElementById('custViewBtn').click();
  return (w.__cv || '').indexOf('share.html?p=') === 0;
})(), w.__cv);
t('timeline: Created+Sent done, Accepted pending',
  d.getElementById('pmTimeline').querySelectorAll('.pm-tl-step.done').length === 2 &&
  d.getElementById('pmTimeline').querySelectorAll('.pm-tl-step.next').length === 1,
  d.getElementById('pmTimeline').textContent);

d.getElementById('pmStatus').value = 'accepted';
fire(w, d.getElementById('pmStatus'), 'change');
t('timeline: all three milestones stamped on accepted',
  d.getElementById('pmTimeline').querySelectorAll('.pm-tl-step.done').length === 3,
  d.getElementById('pmTimeline').textContent);
d.getElementById('pmStatus').value = 'sent'; /* restore for the version flow below */
fire(w, d.getElementById('pmStatus'), 'change');

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

  /* ---------- financing (EMI) page flow ---------- */
  console.log('— financing (EMI) page —');
  t('Financing page hidden by default',
    d.querySelector('.page-wrap[data-page="pageFinance"]').style.display === 'none' &&
    !Array.from(d.querySelectorAll('.nav-chip')).some((c) => c.textContent === 'Financing'));
  d.getElementById('loanAmt').value = '500000';
  fire(w, d.getElementById('loanAmt'), 'input');
  d.getElementById('loanRate').value = '9';
  fire(w, d.getElementById('loanRate'), 'input');
  d.getElementById('loanYears').value = '10';
  fire(w, d.getElementById('loanYears'), 'input');
  t('Financing page appears with all three inputs',
    d.querySelector('.page-wrap[data-page="pageFinance"]').style.display !== 'none');
  t('nav gains Financing chip (16 pages)',
    Array.from(d.querySelectorAll('.nav-chip')).some((c) => c.textContent.includes('Financing')) &&
    d.querySelectorAll('.nav-chip').length === 16,
    d.querySelectorAll('.nav-chip').length);
  t('EMI card shows ₹6,334 / mo', d.getElementById('v_finCards').textContent.includes('₹6,334'),
    d.getElementById('v_finCards').textContent);
  t('recap line carries rate + tenure',
    d.getElementById('v_finRecap').textContent.includes('9% p.a.') &&
    d.getElementById('v_finRecap').textContent.includes('10 years'),
    d.getElementById('v_finRecap').textContent);
  t('cash-flow-positive highlight (Y1 saving > EMI)',
    d.getElementById('v_finHighlight').style.display !== 'none' &&
    d.getElementById('v_finHighlight').textContent.includes('cash-flow positive'),
    d.getElementById('v_finHighlight').textContent);
  t('net outgo card shows saving − EMI (₹6,441 / mo)',
    d.getElementById('v_finCards').textContent.includes('₹6,441'),
    d.getElementById('v_finCards').textContent);
  d.getElementById('loanAmt').value = ''; fire(w, d.getElementById('loanAmt'), 'input');
  d.getElementById('loanRate').value = ''; fire(w, d.getElementById('loanRate'), 'input');
  d.getElementById('loanYears').value = ''; fire(w, d.getElementById('loanYears'), 'input');
  t('Financing page hides again when inputs cleared',
    d.querySelector('.page-wrap[data-page="pageFinance"]').style.display === 'none' &&
    d.querySelectorAll('.nav-chip').length === 15,
    d.querySelectorAll('.nav-chip').length);

  /* financing persists with the proposal blob and survives a re-boot */
  d.getElementById('loanAmt').value = '500000'; fire(w, d.getElementById('loanAmt'), 'input');
  d.getElementById('loanRate').value = '9'; fire(w, d.getElementById('loanRate'), 'input');
  d.getElementById('loanYears').value = '10'; fire(w, d.getElementById('loanYears'), 'input');
  w.__qsSaveNow();
  const dumpF = dumpStorage(w);
  const blobF = JSON.parse(dumpF['qstudio.proposal.' + dumpF['qstudio.activeId']]);
  t('loan inputs persisted in blob',
    blobF.form.loanAmt === '500000' && blobF.form.loanRate === '9' && blobF.form.loanYears === '10',
    JSON.stringify([blobF.form.loanAmt, blobF.form.loanRate, blobF.form.loanYears]));
  const wF = bootApp(dumpF);
  t('financing page restored after re-boot',
    wF.document.querySelector('.page-wrap[data-page="pageFinance"]').style.display !== 'none');
  t('restored EMI figure correct', wF.document.getElementById('v_finCards').textContent.includes('\u20B96,334'),
    wF.document.getElementById('v_finCards').textContent.slice(0, 60));

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
