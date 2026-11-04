/* Quick Estimate Calculator — regression suite (no server, no Chromium).

   Why this file exists: the gallery calculator shipped with `compute()` reading
   the system size BEFORE it was assigned. `var` hoisting made the rate NaN, so
   the live page showed "Estimated cost ₹—", "Your net cost ₹—" and
   "Payback period NaN years" — including inside the WhatsApp message and the
   printed PDF. CI was green throughout, because nothing in the repo exercised
   this file. These assertions are that missing coverage: they load the real
   gallery.html, run the real calculator script in jsdom, click Calculate and
   read what a customer actually sees.

   Run: node qa/estimate-calculator.test.cjs
*/
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0;
const t = (name, fn) => {
  try { fn(); } catch (e) { console.error('  ✗ FAIL:', name, '→', e.message); throw e; }
  pass++;
  console.log('  ✓', name);
};

/* ---------- harness: real page, real script, no network ---------- */
const HTML = fs.readFileSync(path.join(ROOT, 'gallery.html'), 'utf8')
  .replace(/<script[\s\S]*?<\/script>/g, '');
/* pretendToBeVisual gives the page a real requestAnimationFrame, which the
   calculator's paint() uses to reveal the result cards. Without it jsdom throws
   inside the click handler and the cards are only half painted. */
const dom = new JSDOM(HTML, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'https://example.test/gallery.html'
});
const w = dom.window;
w.HTMLCanvasElement.prototype.getContext = () => null;      /* jsdom has no canvas */
w.ResizeObserver = class { observe() {} disconnect() {} };
w.console.error = () => {};
w.alert = () => {};                /* jsdom has no alert(); the WhatsApp handler may call it */
w.print = () => {};
w.eval(fs.readFileSync(path.join(ROOT, 'assets/js/estimate-calculator.js'), 'utf8'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

const d = w.document;
const $ = (id) => d.getElementById(id);
const setInput = (id, value) => {
  const el = $(id);
  el.value = String(value);
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  el.dispatchEvent(new w.Event('change', { bubbles: true }));
};

function run(bill, type, city) {
  setInput('estBill', bill);
  setInput('estType', type);
  setInput('estCity', city || 'Pune');
  $('estCalculate').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const card = $('estimateResult');
  const text = (card ? card.textContent : '').replace(/\s+/g, ' ').trim();
  const num = (id) => {
    const raw = $(id) ? $(id).textContent : '';
    const cleaned = raw.replace(/[^\d.]/g, '');
    return cleaned ? Number(cleaned) : null;
  };
  const kwpMatch = text.match(/Recommended system\s+([\d.]+)\s*kWp/i);
  return {
    text,
    cost: num('estCost'),
    net: num('estNet'),
    subsidy: num('estSubsidy'),
    paybackText: $('estPayback') ? $('estPayback').textContent : '',
    savingsText: $('estSavings') ? $('estSavings').textContent : '',
    kwp: kwpMatch ? Number(kwpMatch[1]) : null,
    rawCost: $('estCost') ? $('estCost').textContent : ''
  };
}

console.log('estimate calculator — result integrity');

/* 1. The regression itself: a normal residential estimate must produce numbers. */
{
  const r = run(5000, 'residential');
  t('residential ₹5,000 bill: cost is a real amount, not ₹—', () => {
    assert.match(r.rawCost, /₹[\d,]/, 'cost rendered as: ' + r.rawCost);
    assert.ok(Number.isFinite(r.cost) && r.cost > 0, 'cost must be finite, got ' + r.cost);
  });
  t('residential ₹5,000 bill: net cost is a real amount', () => {
    assert.ok(Number.isFinite(r.net) && r.net > 0, 'net must be finite, got ' + r.net);
    assert.ok(r.net < r.cost, 'net must be lower than gross (subsidy applied)');
  });
  t('residential ₹5,000 bill: payback is a number of years, never NaN', () => {
    assert.doesNotMatch(r.text, /NaN/i);
    assert.match(r.paybackText, /^[\d.]+ years$/);
    assert.ok(Number(r.paybackText.split(' ')[0]) > 0);
  });
  t('residential ₹5,000 bill: subsidy is the PM Surya Ghar cap and captioned', () => {
    assert.equal(r.subsidy, 78000);
    assert.match(r.text, /PM Surya Ghar/);
  });
}

/* 2. Every consumer type must render a full card — the bug was type-blind. */
for (const type of ['residential', 'society', 'commercial', 'industrial']) {
  t(`${type}: every card shows a value, none shows — or NaN`, () => {
    const r = run(20000, type);
    assert.doesNotMatch(r.text, /NaN/i, type + ' produced NaN');
    assert.doesNotMatch(r.rawCost, /^₹—$/, type + ' cost is a dash');
    assert.match(r.rawCost, /₹[\d,]/);
    assert.match(r.paybackText, /^[\d.]+ years$/);
    assert.match(r.savingsText, /₹[\d,]+\s*\/\s*yr/);
  });
}

/* 3. The published rate band: ₹63.6/Wp at 1 kW, then the two documented floors.
      Read back from the rendered cost, so this checks the wiring the bug broke,
      not a private function. */
const rateOf = (r) => (r.kwp ? r.cost / (r.kwp * 1000) : null);

t('1 kW (floor of the size clamp): rate is the ₹63.6/Wp anchor', () => {
  const r = run(500, 'residential');
  assert.equal(r.kwp, 1, 'a ₹500 bill must clamp to the 1 kWp minimum');
  assert.ok(Math.abs(rateOf(r) - 63.6) < 0.6, 'rate was ' + rateOf(r));
});

t('residential large system: rate settles on the ₹60/Wp subsidy floor', () => {
  const r = run(100000, 'residential');
  assert.ok(Math.abs(rateOf(r) - 60) < 0.5, 'rate was ' + rateOf(r) + ' at ' + r.kwp + ' kWp');
});

t('commercial large system: rate settles on the ₹45/Wp non-subsidy floor', () => {
  const r = run(100000, 'commercial');
  assert.ok(Math.abs(rateOf(r) - 45) < 0.5, 'rate was ' + rateOf(r) + ' at ' + r.kwp + ' kWp');
});

t('floors never cross: even a 500 kW-class bill stays inside ₹45–₹63.6/Wp', () => {
  const res = run(2000000, 'residential');
  const com = run(2000000, 'commercial');
  const r1 = rateOf(res), r2 = rateOf(com);
  assert.ok(r1 >= 59.5 && r1 <= 63.7, 'residential rate left the band: ' + r1);
  assert.ok(r2 >= 44.5 && r2 <= 63.7, 'commercial rate left the band: ' + r2);
});

/* 4. The customer-facing artefacts must be clean too — this is where "NaN
      years" used to reach a real document. */
t('WhatsApp message carries cost, subsidy, net and payback with no NaN', () => {
  const r = run(5000, 'residential');
  setInput('estBill', 5000);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  const btn = $('estWhatsApp');
  assert.ok(btn, 'WhatsApp button must exist');
  let opened = '';
  w.open = (url) => { opened = String(url); return null; };
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const msg = decodeURIComponent(opened);
  assert.ok(msg, 'no WhatsApp URL was produced');
  assert.doesNotMatch(msg, /NaN/i, 'message contains NaN: ' + msg.slice(0, 160));
  assert.doesNotMatch(msg, /₹—/, 'message contains ₹—: ' + msg.slice(0, 160));
  assert.match(msg, /Cost ₹[\d,]+\s*\(GST included\)/);
  assert.match(msg, /Payback [\d.]+ years/);
  void r;
});

t('printed PDF sheet shows the same numbers, never a dash or NaN', () => {
  const r = run(5000, 'residential');
  const printBtn = $('estPrint');
  assert.ok(printBtn, 'Download PDF button must exist');
  let doc = '';
  w.open = () => ({
    document: {
      write: (html) => { doc += html; },
      close: () => {}
    },
    focus: () => {},
    print: () => {}
  });
  printBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  assert.ok(doc.length > 200, 'print document was not written');
  assert.doesNotMatch(doc, /NaN/i, 'PDF sheet contains NaN');
  assert.match(doc, /Payback Period<\/div><div class="value">[\d.]+/);
  void r;
});

/* 5. What the customer must NOT see: the internal ₹/Wp rate. */
t('no ₹/Wp rate is shown to the customer in the result card', () => {
  const r = run(20000, 'commercial');
  assert.doesNotMatch(r.text, /\/\s*Wp/i);
  assert.doesNotMatch(r.text, /per\s*Wp/i);
});

/* ---------------------------------------------------------------------------
   6. THE RATE CURVE ITSELF — percentage model, two bands, hard floors.
      Swept against the shipped curve (window.EstimateCalculator.ratePerWp), not
      a copy of it, so a future edit to the maths has to satisfy these too.
   --------------------------------------------------------------------------- */
console.log('\nestimate calculator — rate curve (percentage model)');

const curve = w.EstimateCalculator;
const ANCHOR = curve.rateAnchor;
const BANDS = curve.rateBands;
const rate = curve.ratePerWp;

t('anchor is ₹63.6/Wp and both bands are declared with a floor + breakpoint', () => {
  assert.equal(ANCHOR, 63.6);
  assert.deepEqual(Object.keys(BANDS).sort(), ['nonsubsidy', 'subsidy']);
  assert.equal(BANDS.subsidy.floor, 60);
  assert.equal(BANDS.subsidy.reachesFloorAtKwp, 3);
  assert.equal(BANDS.nonsubsidy.floor, 45);
  assert.equal(BANDS.nonsubsidy.reachesFloorAtKwp, 20);
});

t('the documented table is exact: 1/2/3 kW subsidy and 10/20 kW non-subsidy', () => {
  const close = (got, want, label) => assert.ok(Math.abs(got - want) < 0.005, label + ': ' + got);
  close(rate('residential', 1), 63.6, 'residential 1 kW');
  close(rate('residential', 2), 61.77, 'residential 2 kW');
  close(rate('residential', 3), 60.0, 'residential 3 kW');
  close(rate('commercial', 10), 53.99, 'commercial 10 kW');
  close(rate('commercial', 20), 45.0, 'commercial 20 kW');
});

/* The failure mode the owner called out: a mis-tuned percentage that lands on
   ₹30 or ₹20 for a big system. 500 kW, 100 kW and 1 GW must all sit on the floor. */
for (const [type, floor] of [['residential', 60], ['society', 60], ['commercial', 45], ['industrial', 45]]) {
  t(`${type}: 100 kW, 500 kW and 1000 MW all sit exactly on the ₹${floor} floor`, () => {
    for (const kwp of [100, 500, 1000, 1e6]) {
      assert.equal(rate(type, kwp), floor, type + ' at ' + kwp + ' kWp was ' + rate(type, kwp));
    }
  });
}

/* Property sweep: 0.25 kW → 1000 kW in fine steps. Three invariants at once. */
t('sweep 0.25–1000 kW: never outside [floor, anchor], never rises, never NaN', () => {
  const sizes = [];
  for (let k = 0.25; k <= 100; k += 0.25) sizes.push(Number(k.toFixed(2)));
  for (let k = 101; k <= 1000; k += 1) sizes.push(k);
  let samples = 0;
  for (const type of ['residential', 'society', 'commercial', 'industrial']) {
    const band = BANDS[(type === 'residential' || type === 'society') ? 'subsidy' : 'nonsubsidy'];
    let prev = Infinity;
    for (const kwp of sizes) {
      const r = rate(type, kwp);
      samples++;
      assert.ok(Number.isFinite(r), type + ' at ' + kwp + ' kWp was not finite');
      assert.ok(r <= ANCHOR + 1e-9, type + ' at ' + kwp + ' kWp exceeded the anchor: ' + r);
      assert.ok(r >= band.floor - 1e-9, type + ' at ' + kwp + ' kWp fell below ₹' + band.floor + ': ' + r);
      assert.ok(r <= prev + 1e-9, type + ' at ' + kwp + ' kWp went UP from ' + prev + ' to ' + r);
      prev = r;
    }
  }
  assert.ok(samples > 4000, 'expected a dense sweep, got ' + samples + ' samples');
});

t('no cliff: the drop between neighbouring capacities stays a percentage, not a step', () => {
  for (const type of ['residential', 'commercial']) {
    let prev = rate(type, 1);
    for (let k = 1.1; k <= 60; k += 0.1) {
      const r = rate(type, Number(k.toFixed(1)));
      assert.ok(prev - r <= 0.3, type + ' dropped ' + (prev - r).toFixed(3) + ' ₹/Wp at ' + k.toFixed(1) + ' kW');
      prev = r;
    }
  }
});

t('hostile capacities price at the anchor instead of returning NaN', () => {
  for (const bad of [undefined, null, NaN, -5, 0, '', 'abc', {}, []]) {
    const r = rate('residential', bad);
    assert.ok(Number.isFinite(r), 'rate(' + String(bad) + ') = ' + r);
    assert.equal(r, ANCHOR, 'rate(' + String(bad) + ') should be the anchor, got ' + r);
  }
});

t('the band is a percentage curve, not a straight line', () => {
  const one = rate('commercial', 1);
  const two = rate('commercial', 2);
  const twenty = rate('commercial', 20);
  /* A straight line would put 2 kW on the chord (1 kW → 20 kW). Compounding
     softens MORE at the start and flattens towards the floor, so the curve sits
     below the chord — that is the signature of percentage logic. */
  const chordAt2 = one - (one - twenty) / 19;
  assert.ok(two < chordAt2 - 0.05, '2 kW should sit BELOW the linear chord: ' + two + ' vs ' + chordAt2);

  /* …and every extra kW multiplies by the SAME factor: a constant percentage. */
  const ratio1 = rate('commercial', 3) / rate('commercial', 2);
  const ratio2 = rate('commercial', 11) / rate('commercial', 10);
  const ratio3 = rate('commercial', 16) / rate('commercial', 15);
  assert.ok(Math.abs(ratio1 - ratio2) < 1e-9, 'multiplicative factor changed: ' + ratio1 + ' vs ' + ratio2);
  assert.ok(Math.abs(ratio2 - ratio3) < 1e-9, 'multiplicative factor changed: ' + ratio2 + ' vs ' + ratio3);
  assert.ok(Math.abs(ratio1 - 1 + (1 - Math.pow(45 / 63.6, 1 / 19))) < 1e-9,
    'per-kW percentage is not the one derived from floor/anchor/breakpoint');

  /* Absolute ₹ drops must shrink with size — front-loaded, not even. */
  const dropEarly = rate('commercial', 1) - rate('commercial', 2);
  const dropLate = rate('commercial', 15) - rate('commercial', 16);
  assert.ok(dropEarly > dropLate, 'early drop ' + dropEarly + ' should exceed late drop ' + dropLate);
});

t('end-to-end: a 500 kW-class residential bill still prices at ₹60/Wp, not ₹30', () => {
  const r = run(5000000, 'residential');
  assert.ok(r.kwp > 100, 'expected a very large system, got ' + r.kwp + ' kWp');
  const endToEnd = r.cost / (r.kwp * 1000);
  assert.ok(Math.abs(endToEnd - 60) < 0.5, 'rendered rate was ₹' + endToEnd.toFixed(2) + '/Wp');
  assert.doesNotMatch(r.text, /NaN/i);
});

t('end-to-end: a 100 kW-class commercial bill prices at ₹45/Wp', () => {
  const r = run(5000000, 'commercial');
  assert.ok(r.kwp > 100, 'expected a very large system, got ' + r.kwp + ' kWp');
  const endToEnd = r.cost / (r.kwp * 1000);
  assert.ok(Math.abs(endToEnd - 45) < 0.5, 'rendered rate was ₹' + endToEnd.toFixed(2) + '/Wp');
});

console.log(`\n${pass} calculator checks passed.`);

