/* ==========================================================================
   Reconcile (rendered) - the pages must DISPLAY what the engine computed
   --------------------------------------------------------------------------
   companion to reconcile.test.js, which proves the engine's arithmetic.
   This file boots the real app in jsdom, changes capacity through the real
   input element, and reads each figure back out of the DOM, so a renderer
   that drifts from the engine fails here even when the engine is correct.

   Every displayed value is checked against an independent recomputation -
   the form's own defaults are read at runtime rather than assumed.

   Run: node qa/reconcile-render.test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ FAIL: ' + name + ' → ' + e.message); }
}
const assert = require('node:assert/strict');

/* ---------- canvas stub (same approach as the project's jsdom harness) ---------- */
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

const pageErrors = [];
function bootApp() {
  let html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  /* jsdom fetches nothing, so inline every stylesheet the page links: layout
     rules (the sticky summary bar) only exist for a style-aware assertion. */
  html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const href = /href=["']([^"']+)["']/i.exec(tag);
    if (!href || /^https?:/i.test(href[1])) return tag;
    const file = path.join(ROOT, href[1]);
    if (!fs.existsSync(file)) return tag;
    return '<style data-from="' + href[1] + '">' + fs.readFileSync(file, 'utf8') + '</style>';
  });
  const dom = new JSDOM(html, {
    url: 'http://localhost/quotation.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
      window.Element.prototype.scrollIntoView = function () {};
      Object.defineProperty(window.HTMLImageElement.prototype, 'complete', { get: () => true });
      Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', { get: () => 100 });
      Object.defineProperty(window.HTMLImageElement.prototype, 'naturalHeight', { get: () => 100 });
      window.devicePixelRatio = 2;
      window.confirm = () => true;
      window.addEventListener('error', (e) => pageErrors.push(e.message));
    }
  });
  const { window } = dom;
  /* the order matches quotation.html, so page wiring behaves as it does live */
  const src = ['content.js', 'engineering.js', 'finance.js', 'storage-catalog.js', 'bess.js', 'additional-systems.js',
    'supplement-design.js', 'icons.js', 'charts.js', 'model.js', 'state.js', 'equipment.js',
    'render.js', 'editor.js', 'experience.js', 'salutation.js', 'briefing.js', 'export.js', 'workspace-prefs.js',
    'app.js', 'control-panel.js']
    .map((f) => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n;\n');
  window.eval(src);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  return window;
}

/* ---------- independent arithmetic (shares nothing with finance.js) ---------- */
function expected(cap, cfg) {
  const ratio = Math.round(((cap * 1000) / cfg.wattage) * 1e6) / 1e6;
  const count = Math.ceil(ratio);
  const installed = count * cfg.wattage / 1000;
  const cost = cap * cfg.rate;
  const gross = cost + cost * cfg.gstPct / 100;
  let subsidy = 30000 * Math.min(installed, 2);
  if (installed > 2) subsidy += 18000 * Math.min(installed - 2, 1);
  subsidy = Math.min(subsidy, 78000);
  const net = gross - subsidy;
  const annualGen = installed * cfg.genFactor;
  let cum = 0, payback = NaN;
  for (let y = 0; y < 25; y++) {
    const before = cum;
    cum += annualGen * Math.pow(1 - cfg.deg / 100, y) * cfg.tariff * Math.pow(1 + cfg.esc / 100, y);
    if (Number.isNaN(payback) && cum >= net) payback = y + (net - before) / (cum - before);
  }
  return { count, installed, cost, gross, subsidy, net, annualGen, lifetime: cum, payback };
}

const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const num = (n) => Math.round(n).toLocaleString('en-IN');
function short(n) {
  const a = Math.abs(n);
  if (a >= 1e7) return '₹' + (Math.round((n / 1e7) * 100) / 100) + ' Cr';
  if (a >= 1e5) return '₹' + (Math.round((n / 1e5) * 100) / 100) + ' L';
  return inr(n);
}
const digit = (text) => parseFloat(String(text).replace(/[^\d.]/g, ''));

/* =============================================================== run ===== */
const w = bootApp();
const d = w.document;
const txt = (id) => (d.getElementById(id) || {}).textContent || '';
const setInput = (id, value) => {
  const el = d.getElementById(id);
  el.value = String(value);
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
};

/* read the shipping defaults out of the form instead of assuming them */
const cfg = {
  genFactor: digit(d.getElementById('genFactor').value),
  /* the form quotes ₹/Wp; the engine and this expectation work in ₹/kWp */
  rate: digit(d.getElementById('costPerWp').value) * 1000,
  gstPct: digit(d.getElementById('gstPercent').value),
  tariff: digit(d.getElementById('tariff').value),
  esc: digit(d.getElementById('escalation').value),
  deg: digit(d.getElementById('degradation').value),
  /* The clearance is no longer a literal default: it is derived from these
     two, so they are what the defaults pin. */
  tilt: digit(d.getElementById('tiltDeg').value),
  latitude: digit(d.getElementById('latitudeDeg').value),
  wattage: digit(d.getElementById('moduleWattage').value)
};

let bootErrors = pageErrors.length;

console.log('- Reconcile (rendered): the shipped defaults are pinned -');
/* Two different things seed the form, and they disagreeing is a real risk:
     · StateStore.DEFAULTS (state.js) - applied on boot and when resuming a proposal
     · the HTML value attributes      - applied by "New proposal"
   Reading the live value alone is tautological (the test would simply follow
   whatever the default became), so BOTH sources are pinned explicitly. */
const REVIEWED = {
  capacity: '7', genFactor: '1460', costPerWp: '63.6', gstPercent: '8.9',
  tariff: '10', escalation: '4', degradation: '0.5',
  co2Factor: '0.71', treeFactor: '22', moduleWattage: '545',
  moduleLengthMm: '2278', moduleWidthMm: '1134',
  /* engineering design basis - the assumptions the whole engineering section
     stands on, so they are pinned here rather than left to drift */
  tiltDeg: '15', latitudeDeg: '18.52', shadeHalfWindowHours: '3', roofSetbackM: '0.6',
  windSpeed: '39', buildingHeightM: '10', windK1: '1', windK3: '1', windK4: '1',
  netUpliftCp: '1.2', anchorsPerModule: '4',
  inverterVmaxDc: '1100', mpptMinV: '200', mpptMaxV: '1000', minAmbientC: '0',
  maxCellC: '65', moduleVocBetaPct: '-0.27', moduleVmpBetaPct: '-0.36',
  electrodeLengthM: '3', electrodeDiaM: '0.05', electrodeEfficiency: '0.75',
  thunderstormDays: '30', moduleWeightKg: '28', rackKgPerM2: '2.5',
  roofLoadBenchmarkKgM2: '60'
};
const authored = (id) => d.getElementById(id).getAttribute('value');
/* the shipped default, read once - restore points must not hardcode a rate */
const DEFAULT_RATE = authored('costPerWp');
for (const [id, want] of Object.entries(REVIEWED)) {
  check(id + ' = ' + want + ' in StateStore.DEFAULTS (used on boot)', () => {
    assert.equal(w.StateStore.DEFAULTS[id], want);
  });
  check(id + ' = ' + want + ' as the HTML default (used by "New proposal")', () => {
    assert.equal(authored(id), want);
  });
}
check('live form values match the authored defaults', () => {
  for (const [id, want] of Object.entries(REVIEWED)) {
    assert.equal(d.getElementById(id).value, want, id + ' live value');
  }
});
check('every authored default satisfies its own step and min', () => {
  /* A default in the step's own terms is not a free choice: 63.6 against
     step="0.5" is a step mismatch, which flags the field and makes the spinners
     snap to 63.5/64. Guard the whole sheet, not just the rate. */
  for (const input of d.querySelectorAll('input[type="number"][value]')) {
    const step = input.getAttribute('step');
    if (!step || step === 'any') continue;
    assert.equal(input.validity.stepMismatch, false,
      input.id + ' default ' + input.value + ' does not fit step ' + step);
    assert.equal(input.validity.rangeUnderflow, false, input.id + ' is below min');
    assert.equal(input.validity.rangeOverflow, false, input.id + ' is above max');
  }
});
check('the 8.9 % default matches the 70:30 composite rule, not the pre-reform 12 %', () => {
  assert.equal(Math.round((0.7 * 5 + 0.3 * 18) * 10) / 10, 8.9);
  assert.notEqual(w.StateStore.DEFAULTS.gstPercent, '12');
});
check('roof clearance factor is present, editable, and blank means derive', () => {
  const el = d.getElementById('roofClearanceFactor');
  assert.equal(el.disabled, false);
  assert.equal(el.value, '', 'blank by default so the geometry decides');
  assert.equal(authored('roofClearanceFactor'), null, 'no authored default to fall back on');
});

console.log('- Reconcile (rendered): ₹/Wp form rate maps to the ₹/kWp engine -');
check('the form quotes ₹/Wp and the legacy ₹/kWp field is gone', () => {
  assert.ok(d.getElementById('costPerWp'), 'costPerWp input must exist');
  assert.equal(d.getElementById('costPerKwp'), null, 'the old ₹/kWp input must be removed');
});
check('₹90/Wp becomes ₹90,000/kWp for the engine', () => {
  setInput('costPerWp', 90);
  setInput('capacity', 7);
  assert.equal(w.Render.lastState.costPerKwp, '90000', 'engine input');
  assert.equal(w.Finance.compute(w.Render.lastState).projectCost, 630000, 'project cost');
});
check('editing the ₹/Wp rate moves the quoted price', () => {
  setInput('costPerWp', 75);
  assert.equal(w.Finance.compute(w.Render.lastState).projectCost, 525000, '7 kWp × ₹75/Wp');
  assert.equal(txt('v_inCostNet'), inr(525000 * 1.089 - 78000), 'exec hero follows the rate');
  setInput('costPerWp', DEFAULT_RATE);
  assert.equal(w.Finance.compute(w.Render.lastState).projectCost, 7 * DEFAULT_RATE * 1000, 'restored');
});
check('a fractional ₹/Wp rate is preserved, not rounded', () => {
  setInput('costPerWp', 88.5);
  assert.equal(w.Render.lastState.costPerKwp, '88500');
  setInput('costPerWp', DEFAULT_RATE);
});
check('a proposal saved with the old ₹/kWp field still resumes its own price', () => {
  /* legacy blob: form.costPerKwp only, no costPerWp */
  w.StateStore.applyForm({ costPerKwp: '64500' });
  assert.equal(d.getElementById('costPerWp').value, '64.5', '₹64,500/kWp must resume as ₹64.5/Wp');
  setInput('costPerWp', DEFAULT_RATE);
});
check('a fresh ₹/Wp value is never re-converted when the form is re-applied', () => {
  w.StateStore.applyForm({ costPerWp: '88' });
  assert.equal(d.getElementById('costPerWp').value, '88');
  setInput('costPerWp', DEFAULT_RATE);
});
check('saving an option captures ₹/Wp and it survives the round trip', () => {
  setInput('capacity', 7);
  setInput('costPerWp', 90);
  d.getElementById('optName').value = 'QA ₹/Wp option';
  d.getElementById('optSave').click();
  const saved = (w.__qsOptions || [])[0];
  assert.ok(saved, 'an option must be saved');
  assert.equal(saved.fields.costPerWp, '90', 'the option snapshot carries ₹/Wp');
  assert.equal(saved.fields.costPerKwp, undefined, 'no ₹/kWp in a new snapshot');
  /* clean up so later page-count assertions are unaffected */
  const del = d.getElementById('optDelete') || d.querySelector('[data-opt-delete]');
  if (del) del.click();
  setInput('costPerWp', DEFAULT_RATE);
});

console.log('- Reconcile (rendered): the panel reports derived totals while typing -');
check('the generation field explains its own derived total', () => {
  setInput('capacity', 7);
  setInput('genFactor', 1460);
  const hint = txt('hintGenFactor');
  assert.ok(hint.includes(num(10344.1) + ' kWh'), 'hint must show the year-1 total, got: ' + hint);
  assert.ok(hint.includes('7.085 kWp installed'), 'hint must name the installed array, got: ' + hint);
});
check('the generation hint follows a capacity change with no preview scrolling', () => {
  setInput('capacity', 10);
  assert.ok(txt('hintGenFactor').includes(num(10.355 * 1460) + ' kWh'), txt('hintGenFactor'));
  assert.ok(txt('hintGenFactor').includes('10.355 kWp installed'), txt('hintGenFactor'));
  setInput('capacity', 7);
});
check('the cost field explains the project cost it produces', () => {
  setInput('capacity', 7);
  setInput('costPerWp', 90);
  const hint = txt('hintCostPerWp');
  assert.ok(hint.includes(inr(630000)), 'hint must show ex-GST cost, got: ' + hint);
  assert.ok(hint.includes(inr(630000 * 1.089)), 'hint must show the GST-inclusive total, got: ' + hint);
  assert.ok(hint.includes('ex-GST') && hint.includes('with GST'), 'hint must label both, got: ' + hint);
});
check('both hints follow a rate change', () => {
  setInput('costPerWp', 80);
  assert.ok(txt('hintCostPerWp').includes(inr(560000)), txt('hintCostPerWp'));
  setInput('costPerWp', 90);
});
check('the hints report the shipped default rate', () => {
  setInput('costPerWp', DEFAULT_RATE);
  assert.ok(txt('hintCostPerWp').includes(inr(7 * DEFAULT_RATE * 1000)),
    'default rate hint: ' + txt('hintCostPerWp'));
});
check('the hints degrade honestly with no capacity instead of showing ₹0', () => {
  setInput('capacity', 0);
  assert.ok(/capacity/i.test(txt('hintGenFactor')), txt('hintGenFactor'));
  setInput('capacity', 7);
});
check('the live summary is pinned inside a sticky bar', () => {
  const bar = d.querySelector('.studio-overview-bar');
  assert.ok(bar, 'sticky wrapper must exist');
  assert.ok(bar.contains(d.querySelector('.studio-overview')), 'the summary lives inside the bar');
  assert.equal(w.getComputedStyle(bar).position, 'sticky', 'the bar must be sticky');
  assert.equal(w.getComputedStyle(bar).backgroundColor, 'rgb(255, 255, 255)',
    'the bar needs an opaque backdrop or the fields scroll through it');
});
check('the sticky bar releases on a narrow screen so it cannot cover fields', () => {
  const css = fs.readFileSync(path.join(ROOT, 'assets/css/control-panel.css'), 'utf8');
  /* pull the max-width:1100px block out by balancing braces - the sheet is minified-ish */
  const at = /@media\s*\(\s*max-width:\s*1100px\s*\)\s*\{/.exec(css);
  assert.ok(at, 'a narrow-screen override must exist');
  let i = at.index + at[0].length - 1, depth = 0, block = '';
  for (; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { i++; break; } }
    if (depth > 0) block += ch;
  }
  const rule = /\.studio-overview-bar\s*\{([^}]*)\}/.exec(block);
  assert.ok(rule, 'the bar must be restyled in that block');
  assert.match(rule[1], /position:\s*static/, 'the bar must fall back to static below 1100px');
});
check('the live summary still updates from the capacity input', () => {
  setInput('capacity', 3);
  assert.equal(d.querySelector('[data-metric="capacity"]').textContent, '3 kWp');
  assert.equal(d.querySelector('[data-metric="energy"]').textContent, num(3.27 * 1460) + ' kWh');
  setInput('capacity', 7);
  assert.equal(d.querySelector('[data-metric="energy"]').textContent, num(7.085 * 1460) + ' kWh');
});

/* the sweep below renders from the shipped defaults, so the rate must be back */
setInput('costPerWp', DEFAULT_RATE);
setInput('capacity', 7);

console.log('- Reconcile (rendered): capacity sweep across the pages -');
for (const cap of [1, 2, 2.5, 3, 7, 10, 25, 100]) {
  check(cap + ' kWp renders consistently on every page', () => {
    setInput('capacity', cap);
    const e = expected(cap, cfg);

    /* cover */
    assert.equal(txt('v_coverCapacity'), cap + ' kWp', 'cover capacity');
    assert.equal(txt('v_coverBadgeGen'), num(e.annualGen) + ' kWh', 'cover generation badge');
    assert.equal(txt('v_inCostSub'), '− ' + inr(e.subsidy), 'investment subsidy');
    assert.equal(txt('v_exHeroLifetime'), '24/7', 'summary monitoring highlight');
    assert.equal(txt('v_exHeroSave'), w.Finance.compute(w.Render.lastState).installedKwp.toLocaleString('en-IN', {maximumFractionDigits:3}) + ' kWp', 'installed capacity precision');

    /* executive summary */
    assert.equal(txt('v_inCostNet'), inr(e.net), 'exec net investment');
    assert.equal(txt('v_exHeroNet'), num(e.annualGen / 12) + ' kWh', 'summary monthly generation');
    assert.equal(txt('v_inPayback'), e.payback.toFixed(1) + ' years', 'investment payback from existing projection');
    assert.ok(txt('v_exKpis').includes(num(e.annualGen) + ' kWh'), 'exec generation KPI');

    /* technical specification */
    const ts = txt('v_tsTable');
    assert.ok(ts.includes(e.count + ' modules'), 'tech spec module count');
    assert.ok(ts.includes('Installed Array Size'), 'tech spec array-size row present');
    const shownKw = parseFloat((ts.match(/([\d.]+) kWp/) || [])[1]);
    assert.ok(Math.abs(shownKw - e.installed) < 0.0005, 'tech spec installed array ' + shownKw + ' vs ' + e.installed);
    if (Math.abs(e.installed - cap) > 1e-9) {
      assert.ok(ts.includes('contracted ' + cap + ' kWp'), 'tech spec must name the contracted capacity');
    }
    const moduleArea = e.count * (digit(d.getElementById('moduleLengthMm').value) / 1000) *
      (digit(d.getElementById('moduleWidthMm').value) / 1000);
    assert.ok(ts.includes(Math.round(moduleArea) + ' m²'), 'tech spec module area');
    const dcac = (e.installed / cap).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    assert.ok(ts.includes(dcac + ' : 1'), 'tech spec DC/AC ratio must use the installed array');

    /* generation & savings */
    assert.equal(txt('v_svChipGen'), num(e.annualGen) + ' kWh', 'savings page generation chip');
    assert.ok(txt('v_svAssumptions').includes(cfg.genFactor + ' kWh/kWp/yr'), 'assumptions strip generation basis');

    /* investment */
    assert.equal(txt('v_inCostNet'), inr(e.net), 'investment net cost');
    assert.equal(txt('v_inCostSub'), '− ' + inr(e.subsidy), 'investment subsidy');
    /* the page prints the rate to one decimal, so read it back as a number and
       hold it to that print precision rather than to any rounding call */
    const shownRate = parseFloat(txt('v_inRate').replace(/[^\d.]/g, ''));
    assert.ok(Math.abs(shownRate - e.cost / (cap * 1000)) <= 0.05,
      'investment ₹/Wp showed ' + shownRate + ' for ' + (e.cost / (cap * 1000)));

    /* the multiplication a customer would do by hand must agree with the page */
    assert.ok(Math.abs(digit(txt('v_svChipGen')) - e.installed * cfg.genFactor) < 1,
      'shown generation must equal shown installed array × generation factor');
  });
}

console.log('- Reconcile (rendered): subsidy follows installed DC capacity -');
for (const [cap, want] of [[1, 32700], [2, 63240], [2.5, 73050], [3, 78000], [10, 78000]]) {
  check(cap + ' kWp shows the installed-capacity subsidy ' + inr(want), () => {
    setInput('capacity', cap);
    assert.equal(txt('v_inCostSub'), '− ' + inr(want));
  });
}
check('a lower figure than the installed basis is never shown below the 3 kW slab', () => {
  /* guard against a regression to contracted-capacity subsidy */
  for (const [cap, contracted] of [[2, 60000], [2.5, 69000]]) {
    setInput('capacity', cap);
    const shown = digit(txt('v_inCostSub'));
    assert.ok(shown > contracted, cap + ' kWp showed ' + shown + ', expected more than ' + contracted);
  }
});

console.log('- Reconcile (rendered): roof clearance drives the fit verdict -');
check('the same roof flips verdict when the clearance factor changes', () => {
  setInput('capacity', 7);
  setInput('availableArea', 40);
  setInput('roofClearanceFactor', 1.1);
  assert.ok(txt('v_tsTable').includes('fits ✓'), 'should fit at ×1.1');
  assert.ok(txt('v_tsTable').includes('module area × 1.1 clearance'), 'must state the factor it used');
  setInput('roofClearanceFactor', 1.4);
  assert.ok(txt('v_tsTable').includes('exceeds available area'), 'should not fit at ×1.4');
  assert.ok(txt('v_tsTable').includes('module area × 1.4 clearance'), 'must state the factor it used');
  setInput('availableArea', '');
});

console.log('- Reconcile (rendered): commercial customers -');
check('commercial shows nil subsidy and gross investment', () => {
  setInput('capacity', 25);
  const typeEl = d.getElementById('customerType');
  typeEl.value = 'commercial';
  typeEl.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(txt('v_inCostSub'), '− ₹0', 'commercial subsidy must be nil');
  assert.ok(txt('v_inCostSubCap').includes('Not applicable'), 'subsidy caption must explain why');
  const gross = 25 * cfg.rate * (1 + cfg.gstPct / 100);
  assert.equal(txt('v_inCostNet'), inr(gross), 'commercial net equals gross');
  typeEl.value = 'residential';
  typeEl.dispatchEvent(new w.Event('change', { bubbles: true }));
});

console.log('- Reconcile (rendered): the pages agree with each other -');
check('opening pages are non-financial while investment retains the figures', () => {
  setInput('capacity', 7);
  const net = inr(w.Finance.compute(w.Render.lastState).netInvestment);
  assert.ok(!/₹|Payback|Estimated IRR|Net Investment|Effective Solar Cost|Estimated Subsidy/i.test(txt('pageCover') + txt('pageExec')));
  assert.equal(txt('v_exHeroNet'), num(w.Finance.compute(w.Render.lastState).annualGen / 12) + ' kWh');
  assert.equal(txt('v_exEffectiveHint'), '');
  assert.equal(txt('v_inCostNet'), net, 'investment card must match the summary');
  assert.equal(txt('v_inCostSub'), '− ₹78,000', '7 kWp is above the subsidy cap');
});
check('generation is identical on the summary, savings page and assumptions strip', () => {
  setInput('capacity', 7);
  const gen = num(expected(7, cfg).annualGen) + ' kWh';
  assert.ok(txt('v_exKpis').includes(gen), 'summary KPI');
  assert.equal(txt('v_svChipGen'), gen, 'savings chip');
});
check('no runtime errors during the whole sweep', () => {
  assert.equal(pageErrors.length, bootErrors, pageErrors.join(' | '));
});

/* =================================================================== report */
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
