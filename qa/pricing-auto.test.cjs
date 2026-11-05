/* The pricing block's "auto rate": follows the band, yield to the dealer, and
   come back on reset.

   Owner's requirement (2026-11-05): in the quotation's pricing block, next to
   the faint "auto" the subsidy field already shows, the rate should offer the
   band's own price — the dealer can type his own and save it, and a reset puts
   the percentage logic back in charge. The rate a saved proposal carries must
   never move because a later capacity edit or a later model change says so.

   Runs the real quotation.html, the real rate-model.js, state.js and
   pricing-auto.js in jsdom — no browser, no server, so it belongs in the
   required npm test chain.

   Run: node qa/pricing-auto.test.cjs
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

function page() {
  const html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://quote.test/quotation.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.Element.prototype.scrollIntoView = function () {};
  w.Bess = { DEFAULTS: {}, enabled: (v) => !!v.bessEnabled };
  w.AdditionalSystems = { DEFAULTS: {} };
  for (const file of ['rate-model.js', 'state.js', 'pricing-auto.js']) {
    w.eval(fs.readFileSync(path.join(ROOT, 'assets/js', file), 'utf8'));
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { w, d: w.document };
}

const rate = (w, type, kwp) => w.RateModel.ratePerWp(type, kwp);

function set(ctx, id, value, events) {
  const el = ctx.d.getElementById(id);
  el.value = String(value);
  for (const name of events || ['input', 'change']) el.dispatchEvent(new ctx.w.Event(name, { bubbles: true }));
  return el;
}

console.log('quotation pricing — auto rate, manual override, reset');

const ctx = page();
const { w, d } = ctx;
const field = () => d.getElementById('costPerWp');
const mode = () => d.getElementById('rateMode').value;

t('a new proposal is not repriced before a capacity is chosen', () => {
  /* The template ships ₹63.6/Wp; opening the page must not move it. The band is
     shown beside the field and takes over on the first capacity/type edit. */
  assert.equal(mode(), 'auto');
  assert.equal(field().value, '63.6');
  const expected = rate(w, 'residential', d.getElementById('capacity').value);
  assert.match(d.getElementById('rateAutoPrice').textContent, new RegExp('₹' + expected.toFixed(2)));
});

t('the block states the auto price, its capacity and its band', () => {
  const text = d.getElementById('rateAutoPrice').textContent;
  assert.match(text, /Auto ₹\d+\.\d\d\/Wp/);
  assert.match(text, /kWp/);
  assert.match(text, /residential \(subsidy\)/);
});

t('changing the capacity moves an auto rate with it', () => {
  set(ctx, 'capacity', '100');
  assert.equal(mode(), 'auto');
  assert.ok(Math.abs(parseFloat(field().value) - 60) < 0.01, '100 kWp residential must sit on the ₹60 floor, got ' + field().value);
});

t('changing the customer type moves it too — subsidy and non-subsidy are different bands', () => {
  set(ctx, 'customerType', 'commercial');
  assert.ok(Math.abs(parseFloat(field().value) - 45) < 0.01, '100 kWp commercial must sit on the ₹45 floor, got ' + field().value);
  assert.match(d.getElementById('rateAutoPrice').textContent, /commercial \(no subsidy\)/);
  set(ctx, 'capacity', '20');
  const auto = parseFloat(field().value);
  assert.ok(auto > 55, 'a 20 kW commercial rate must still be well above the floor, got ' + auto);
});

t('a society quotation uses the subsidy band, spelled rwa in this form', () => {
  set(ctx, 'customerType', 'rwa');
  set(ctx, 'capacity', '100');
  assert.ok(Math.abs(parseFloat(field().value) - 60) < 0.01, 'RWA must follow the subsidy floor, got ' + field().value);
  set(ctx, 'customerType', 'residential');
});

t('typing a rate takes the field over and the band stops touching it', () => {
  set(ctx, 'capacity', '30');
  const auto = parseFloat(field().value);
  set(ctx, 'costPerWp', '58.25');
  assert.equal(mode(), 'manual', 'typing must switch the proposal to manual');
  assert.match(d.getElementById('rateAutoHint').textContent, /Your rate/);
  set(ctx, 'capacity', '60');
  assert.equal(field().value, '58.25', 'a manual rate must survive a capacity change');
  set(ctx, 'customerType', 'commercial');
  assert.equal(field().value, '58.25', 'a manual rate must survive a customer-type change');
  void auto;
});

t('reset puts the percentage logic back in charge', () => {
  set(ctx, 'capacity', '100');
  set(ctx, 'customerType', 'commercial');
  d.getElementById('rateAutoReset').click();
  assert.equal(mode(), 'auto');
  assert.ok(Math.abs(parseFloat(field().value) - 45) < 0.01, 'reset must land on the band rate, got ' + field().value);
  set(ctx, 'capacity', '50');
  assert.ok(Math.abs(parseFloat(field().value) - rate(w, 'commercial', 50)) < 0.01, 'auto must keep following after a reset');
});

t('a rate typed below ₹45 is flagged, not silently kept', () => {
  set(ctx, 'customerType', 'commercial');
  set(ctx, 'capacity', '100');
  set(ctx, 'costPerWp', '40');
  assert.equal(field().value, '40', 'the dealer\'s number is never overwritten');
  assert.equal(d.getElementById('rateAutoBox').dataset.warn, 'below-floor');
  assert.match(d.getElementById('rateAutoHint').textContent, /Below the ₹45\.00\/Wp floor/);
  set(ctx, 'costPerWp', '45.5');
  assert.equal(d.getElementById('rateAutoBox').dataset.warn, '', 'a rate back inside the band clears the warning');
  /* A curated residential rate under the band's own ₹60 floor is the dealer's
     call - only ₹45 is hard. */
  set(ctx, 'customerType', 'residential');
  set(ctx, 'costPerWp', '58');
  assert.equal(d.getElementById('rateAutoBox').dataset.warn, '', '₹58 is above the absolute floor');
  d.getElementById('rateAutoReset').click();
  assert.equal(mode(), 'auto', 'back on the band for the next check');
});

t('the button only offers itself when the field is off the band', () => {
  const button = d.getElementById('rateAutoReset');
  set(ctx, 'customerType', 'commercial');
  set(ctx, 'capacity', '100');
  assert.ok(Math.abs(parseFloat(field().value) - 45) < 0.01, 'precondition: on the band');
  assert.equal(button.hidden, true, 'a field already on the band has nothing to reset');
  set(ctx, 'costPerWp', '61');
  assert.equal(button.hidden, false, 'a manual rate must offer the way back');
  assert.equal(button.textContent, 'Reset to auto');
});

t('a proposal saved before auto existed opens as manual and is never re-priced', () => {
  const legacy = { custName: 'Legacy Customer', capacity: '7', customerType: 'residential', costPerWp: '63.6' };
  w.StateStore.applyForm(legacy);
  assert.equal(mode(), 'manual', 'an old proposal carries an agreed price, not a mode');
  assert.equal(field().value, '63.6');
  set(ctx, 'capacity', '50');
  assert.equal(field().value, '63.6', 'opening an old quotation must never re-price it');
});

t('a proposal saved on auto reopens on auto, on the price it was saved with', () => {
  w.StateStore.applyForm({ capacity: '100', customerType: 'industrial', costPerWp: '45.00', rateMode: 'auto' });
  assert.equal(mode(), 'auto');
  assert.equal(field().value, '45.00', 'loading a proposal must not rewrite its price');
  set(ctx, 'capacity', '20');
  assert.ok(Math.abs(parseFloat(field().value) - rate(w, 'industrial', 20)) < 0.01,
    'the next capacity edit must apply the band, got ' + field().value);
});

t('the mode travels with the proposal, so a save keeps it', () => {
  assert.equal(w.StateStore.collectForm().rateMode, 'auto');
  set(ctx, 'costPerWp', '59.5');
  assert.equal(w.StateStore.collectForm().rateMode, 'manual');
  assert.equal(w.StateStore.collectForm().costPerWp, '59.5');
});

t('the auto rate can never leave the band, whatever the capacity', () => {
  w.StateStore.applyForm({ rateMode: 'auto' });
  for (const [kwp, type] of [['1', 'residential'], ['3', 'residential'], ['100', 'commercial'], ['500', 'industrial'], ['5000', 'commercial']]) {
    set(ctx, 'customerType', type);
    set(ctx, 'capacity', kwp);
    const value = parseFloat(field().value);
    const floor = w.RateModel.bands[w.RateModel.bandOf(type)].floor;
    assert.ok(value >= floor - 0.01 && value <= w.RateModel.anchor + 0.01,
      kwp + ' kWp ' + type + ' priced at ' + value + ', outside ' + floor + '–' + w.RateModel.anchor);
  }
});

console.log(`\n${pass} pricing auto checks passed.`);
