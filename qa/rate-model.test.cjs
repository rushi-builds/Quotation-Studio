/* The rate model itself: ₹45–₹63.6/Wp, percentage softening, hard floors.

   This is the file the owner's model is written down in, so it is tested here
   once, directly, rather than through either surface:

     - the whole business lives inside ₹45–₹63.6/Wp;
     - the drop is a percentage (degradation-style), never a straight line;
     - subsidy and non-subsidy are separate curves with their own floors;
     - 100 kW, 500 kW and anything larger sit exactly on the floor, so a bad
       retune can never produce a ₹30 or ₹20 rate;
     - the runway is gentle: reaching ₹45 by 20 kW was too steep, so both bands
       spend it over 100 kW.

   Both surfaces must read this one model: the gallery card prices with it and
   the quotation editor offers it as the auto rate. The last checks here make
   sure neither page has drifted back to a copy of its own.

   Run: node qa/rate-model.test.cjs
*/
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const Model = require(path.join(ROOT, 'assets/js/rate-model.js'));

let pass = 0;
const t = (name, fn) => {
  try { fn(); } catch (e) { console.error('  ✗ FAIL:', name, '→', e.message); throw e; }
  pass++;
  console.log('  ✓', name);
};
const rate = Model.ratePerWp;
const percentDrop = (from, to) => ((from - to) / from) * 100;

console.log('rate model — one band, one percentage, hard floors');

t('the band is declared by its own numbers: anchor, floors, breakpoints', () => {
  assert.equal(Model.anchor, 63.6);
  assert.deepEqual(Object.keys(Model.bands).sort(), ['nonsubsidy', 'subsidy']);
  assert.equal(Model.bands.subsidy.floor, 60);
  assert.equal(Model.bands.nonsubsidy.floor, 45);
  assert.equal(Model.bands.subsidy.reachesFloorAtKwp, 100);
  assert.equal(Model.bands.nonsubsidy.reachesFloorAtKwp, 100);
  assert.equal(Model.bandOf('residential'), 'subsidy');
  assert.equal(Model.bandOf('society'), 'subsidy');
  assert.equal(Model.bandOf('rwa'), 'subsidy', 'the quotation spells the society "rwa"');
  assert.equal(Model.bandOf('commercial'), 'nonsubsidy');
  assert.equal(Model.bandOf('industrial'), 'nonsubsidy');
});

t('the published table is exact', () => {
  const close = (got, want, label) => assert.ok(Math.abs(got - want) < 0.005, label + ': ' + got);
  close(rate('residential', 1), 63.60, 'residential 1 kW');
  close(rate('residential', 3), 63.53, 'residential 3 kW');
  close(rate('residential', 50), 61.79, 'residential 50 kW');
  close(rate('residential', 100), 60.00, 'residential 100 kW');
  close(rate('commercial', 1), 63.60, 'commercial 1 kW');
  close(rate('commercial', 10), 61.63, 'commercial 10 kW');
  close(rate('commercial', 50), 53.59, 'commercial 50 kW');
  close(rate('commercial', 100), 45.00, 'commercial 100 kW');
});

t('100 kW, 500 kW and 1 GW sit exactly on the floor, both bands', () => {
  for (const [type, floor] of [['residential', 60], ['society', 60], ['rwa', 60], ['commercial', 45], ['industrial', 45]]) {
    for (const kwp of [100, 500, 5000, 1e6]) {
      assert.equal(rate(type, kwp), floor, type + ' at ' + kwp + ' kWp was ' + rate(type, kwp));
    }
  }
});

t('the drop to 20 kW stays gentle — it is not a cliff to the floor', () => {
  /* The owner's correction on 2026-11-05: reaching ₹45 by 20 kW dropped the rate
     too fast. A 20 kW commercial system must still be well above the floor, and
     the whole first-20-kW slide must stay inside single digits. */
  assert.ok(rate('commercial', 20) > 55, '20 kW commercial is ' + rate('commercial', 20));
  assert.ok(percentDrop(rate('commercial', 1), rate('commercial', 20)) < 8,
    'the 1 → 20 kW slide is ' + percentDrop(rate('commercial', 1), rate('commercial', 20)).toFixed(1) + '%');
  /* …and it is still a real slide, not a flat line pretending to be a model. */
  assert.ok(rate('commercial', 50) < rate('commercial', 20) - 4, 'the middle of the band must still move');
});

t('every capacity from 0.25 to 1000 kW stays inside its band and never rises', () => {
  const sizes = [];
  for (let k = 0.25; k <= 100; k += 0.25) sizes.push(Number(k.toFixed(2)));
  for (let k = 101; k <= 1000; k += 1) sizes.push(k);
  let samples = 0;
  for (const type of ['residential', 'society', 'commercial', 'industrial']) {
    const band = Model.bands[Model.bandOf(type)];
    let previous = Infinity;
    for (const kwp of sizes) {
      const r = rate(type, kwp);
      samples++;
      assert.ok(Number.isFinite(r), type + ' at ' + kwp + ' kWp was not finite');
      assert.ok(r >= band.floor - 1e-9, type + ' at ' + kwp + ' kWp fell below ₹' + band.floor + ': ' + r);
      assert.ok(r <= Model.anchor + 1e-9, type + ' at ' + kwp + ' kWp exceeded the anchor: ' + r);
      assert.ok(r <= previous + 1e-9, type + ' at ' + kwp + ' kWp went UP');
      previous = r;
    }
  }
  assert.ok(samples > 4000, 'expected a dense sweep, got ' + samples);
});

t('the softening is one constant percentage, not a straight line', () => {
  const ratio1 = rate('commercial', 11) / rate('commercial', 10);
  const ratio2 = rate('commercial', 31) / rate('commercial', 30);
  assert.ok(Math.abs(ratio1 - ratio2) < 1e-12, 'the per-kW factor changed: ' + ratio1 + ' vs ' + ratio2);
  const span = Model.bands.nonsubsidy.reachesFloorAtKwp - 1;
  const expected = 1 - Math.pow(Model.bands.nonsubsidy.floor / Model.anchor, 1 / span);
  assert.ok(Math.abs(ratio1 - (1 - expected)) < 1e-12, 'the factor is not the one derived from floor/anchor/breakpoint');

  /* Below the chord from 1 kW to the breakpoint — the signature of compounding. */
  const chordAt10 = Model.anchor - (Model.anchor - Model.bands.nonsubsidy.floor) * (9 / span);
  assert.ok(rate('commercial', 10) < chordAt10 - 0.05, 'curve is not softer than a straight line at 10 kW');
});

t('no cliff between neighbouring capacities', () => {
  for (const type of ['residential', 'commercial']) {
    let previous = rate(type, 1);
    for (let k = 1.1; k <= 120; k += 0.1) {
      const r = rate(type, Number(k.toFixed(1)));
      assert.ok(previous - r <= 0.3, type + ' dropped ' + (previous - r).toFixed(3) + ' ₹/Wp at ' + k.toFixed(1) + ' kW');
      previous = r;
    }
  }
});

t('hostile capacities price at the anchor instead of NaN', () => {
  for (const bad of [undefined, null, NaN, -5, 0, '', 'abc', {}, []]) {
    const r = rate('residential', bad);
    assert.ok(Number.isFinite(r), 'rate(' + String(bad) + ') = ' + r);
    assert.equal(r, Model.anchor);
  }
});

t('both surfaces read this one model — no second copy of the curve', () => {
  const gallery = fs.readFileSync(path.join(ROOT, 'gallery.html'), 'utf8');
  const quotation = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8');
  assert.match(gallery, /rate-model\.js/, 'the gallery must load the shared model');
  assert.match(quotation, /rate-model\.js/, 'the quotation must load the shared model');
  assert.ok(gallery.indexOf('rate-model.js') < gallery.indexOf('estimate-calculator.js'),
    'the model must load before the card that prices with it');

  const calculator = fs.readFileSync(path.join(ROOT, 'assets/js/estimate-calculator.js'), 'utf8');
  assert.doesNotMatch(calculator, /reachesFloorAtKwp\s*:\s*\d/, 'the card has grown its own band again');
  assert.match(calculator, /RateModel/, 'the card must price through the shared model');

  const auto = fs.readFileSync(path.join(ROOT, 'assets/js/pricing-auto.js'), 'utf8');
  assert.match(auto, /RateModel/, 'the quotation auto rate must come from the shared model');
  assert.doesNotMatch(auto, /45|63\.6/, 'the quotation auto rate must not carry its own literals');
});

console.log(`\n${pass} rate model checks passed.`);
