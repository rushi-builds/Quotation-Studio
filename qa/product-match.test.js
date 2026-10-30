/* ---------------------------------------------------------------- QUARANTINED
   NOT part of `npm test` (see package.json -> test:quarantine).

   This suite asserts an API / DOM surface that no longer exists in the app:

     * `EquipmentStore.modelEntriesForMake` and `EquipmentStore.findModule`
       are exported by nothing. The real module lookup today is the internal
       `basisInfo` / `modelRows` / `syncModelSelect` path in
       assets/js/equipment.js, and `ModuleReferenceCatalog` (module-catalog.js)
       which is itself currently called by no runtime code.
     * The workbook picker ids it drives (`inverterWorkbookModel`,
       `workbookCableProduct`) appear nowhere in quotation.html or assets/.

   It cannot pass without a rewrite against the current catalogue UI, so it
   was quarantined rather than deleted or left silently red. Restoring it to
   `npm test` requires the rewrite first.

   Found during the 2026-10-29 repository analysis: the suite was 0/8 (here)
   and 0/19 (product-match) while `npm test` was read as "green".
   ------------------------------------------------------------------------- */

/* ==========================================================================
   Free-text product matching.

   The model boxes take whatever the operator actually knows - a bin number,
   a wattage, a rating, or a whole model string - and the engine has to turn
   that into one exact catalogue or workbook record. Getting that wrong is
   not cosmetic: a near match puts another product's dimensions, voltage and
   efficiency on a document the customer receives.

   Two rules the tests below hold the engine to:

     - it applies a record only when the text leaves exactly one. "580" names
       two modules in the same make group, so it fills in nothing and both
       records are offered instead.
     - it never invents a field the record does not carry.

   Run: node qa/product-match.test.js
   ========================================================================== */
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  \u2713 ' + name); }
  catch (e) { fail++; console.error('  \u2717 FAIL:', name, '\u2192', e.message); }
};

const mockCtx = () => new Proxy({}, {
  get(t, p) {
    if (p === 'measureText') return () => ({ width: 42 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
    if (typeof p === 'string') { if (!(p in t)) t[p] = () => {}; return t[p]; }
    return undefined;
  },
  set() { return true; }
});

function boot() {
  const html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, {
    url: 'http://localhost/quotation.html', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => mockCtx();
      w.Element.prototype.scrollIntoView = function () {};
      Object.defineProperty(w.HTMLImageElement.prototype, 'complete', { get: () => true });
      Object.defineProperty(w.HTMLImageElement.prototype, 'naturalWidth', { get: () => 100 });
      Object.defineProperty(w.HTMLImageElement.prototype, 'naturalHeight', { get: () => 100 });
      w.devicePixelRatio = 2;
      w.confirm = () => true;
    }
  });
  const w = dom.window;
  const files = ['content.js', 'engineering.js', 'finance.js', 'storage-catalog.js', 'bess.js',
    'rainwater.js', 'additional-systems.js', 'supplement-design.js', 'icons.js', 'charts.js', 'model.js', 'state.js',
    'module-catalog.js', 'equipment-calc.js', 'equipment.js', 'proposal-marks.js', 'render.js', 'editor.js',
    'experience.js', 'export.js', 'app.js'];
  w.eval(files.map((f) => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  return w;
}

const GROUPED = 'Panasonic / Waaree / Adani or Equivalent';
const INVERTER_GROUP = 'Sungrow / Fronius or Equivalent';

const w = boot();
const d = w.document;
const el = (id) => d.getElementById(id);
const store = w.EquipmentStore;
const catalog = w.ModuleReferenceCatalog;

/* A workbook-shaped payload, applied through the same validated path the
   live sync uses. The numbers are deliberately ordinary: the point under
   test is that the right row is picked, not that the rows are impressive. */
assert.equal(catalog.applyExcelPayload({
  source: 'excel',
  modules: [],
  inverters: [
    { id: 'inv-deye-16', make: 'Deye', model: 'SUN-16K-SG04LP3-EU', acKw: 16, maxDcVoltageV: 500 },
    { id: 'inv-growatt-20', make: 'Growatt', model: 'SPH20000TL3 BH-5G', acKw: 20, maxDcVoltageV: 450 },
    { id: 'inv-sungrow-16a', make: 'Sungrow', model: 'SG16CX-P2', acKw: 16, maxDcVoltageV: 1100 },
    { id: 'inv-sungrow-16b', make: 'Sungrow', model: 'SUN16K-SG01LP1', acKw: 16, maxDcVoltageV: 600 }
  ],
  cables: [
    { id: 'cab-25', make: 'Polycab', category: 'DC Solar Cable', sizeMm2: 2.5, material: 'Copper', cores: '2' }
  ],
  protection: [
    { id: 'prot-mcb', category: 'DC MCB', make: 'Schneider', model: 'Acti9 A9F', ratedCurrentA: 63 }
  ]
}), true, 'the workbook payload is accepted');

/* ---------------------------------------------------------------- */
/* Rating parsing                                                    */
/* ---------------------------------------------------------------- */
check('a rating is read from any of the shapes an operator types', () => {
  assert.equal(store.ratingFromText('16'), 16);
  assert.equal(store.ratingFromText('16kw'), 16);
  assert.equal(store.ratingFromText('16 kW'), 16);
  assert.equal(store.ratingFromText('16.0'), 16);
  assert.equal(store.ratingFromText('20'), 20);
});

check('a model string is never mistaken for a rating', () => {
  assert.equal(store.ratingFromText('SUN-16K-SG04LP3-EU'), null);
  assert.equal(store.ratingFromText('16 KVA'), null);
  assert.equal(store.ratingFromText(''), null);
});

/* ---------------------------------------------------------------- */
/* Modules                                                           */
/* ---------------------------------------------------------------- */
check('a full model number typed into the model box resolves its record', () => {
  const entry = store.resolveModuleByText(GROUPED, 'BiN-08-580');
  assert.ok(entry, 'the Waaree ELITE bin is found');
  assert.equal(entry.make, 'Waaree');
  assert.equal(entry.wp, 580);
});

check('a model number is matched whatever its casing or spacing', () => {
  const entry = store.resolveModuleByText(GROUPED, '  bin-08 580 ');
  assert.ok(entry, 'casing and padding do not defeat the match');
  assert.equal(entry.model, 'BiN-08-580');
});

check('a wattage alone resolves when it names one module in the make group', () => {
  const entry = store.resolveModuleByText(GROUPED, '545');
  assert.ok(entry, '545 Wp names one module in this group');
  assert.equal(entry.model, 'Bi-55-545');
  assert.equal(entry.make, 'Waaree');
});

check('a wattage shared by two products resolves to nothing at all', () => {
  // Waaree BiN-08-580 and the Adani 580 W bin both claim 580 Wp. Applying
  // either would print the other's dimensions and voltage on the quotation.
  assert.equal(store.resolveModuleByText(GROUPED, '580'), null,
    'two products share this rating, so the engine must not choose');
  assert.equal(store.moduleCandidates(GROUPED, '580').length, 2,
    'but both records are offered to the operator');
});

check('a partial model number narrows to a single record', () => {
  const entry = store.resolveModuleByText(GROUPED, 'ASB-M10');
  assert.ok(entry, 'the Adani bin is the only partial match');
  assert.equal(entry.make, 'Adani Solar');
});

check('text matching nothing returns nothing rather than a near neighbour', () => {
  assert.equal(store.resolveModuleByText(GROUPED, 'DOES-NOT-EXIST'), null);
  assert.equal(store.moduleCandidates(GROUPED, 'DOES-NOT-EXIST').length, 0);
});

check('a make the catalogue has no row for resolves to nothing', () => {
  assert.equal(store.resolveModuleByText('Premier Energies or Equivalent', '580'), null);
});

/* ---------------------------------------------------------------- */
/* Typed free text reaching the form                                 */
/* ---------------------------------------------------------------- */
function typeCustomModule(text) {
  store.refreshSelects();
  const sel = el('moduleModel');
  const manual = Array.from(sel.options).find((option) => option.hasAttribute('data-custom'));
  assert.ok(manual, 'the model picker offers a custom entry');
  manual.selected = true;
  const input = el('moduleModelCustom');
  input.value = text;
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
}

check('a wattage typed into the model box fills that module\u2019s own figures', () => {
  typeCustomModule('545');
  assert.equal(el('moduleWattage').value, '545', 'wattage');
  assert.equal(el('moduleEfficiency').value, '21.17', 'efficiency from the datasheet record');
  assert.equal(el('moduleVoc').value, '49.76', 'Voc');
  assert.equal(el('moduleTech').value, 'Mono PERC', 'technology');
});

check('text that names no single module leaves the fields empty', () => {
  typeCustomModule('580');
  assert.equal(el('moduleWattage').value, '', 'ambiguous text must not fill a wattage');
  assert.equal(el('moduleEfficiency').value, '', 'nor an efficiency');
  assert.equal(el('moduleVoc').value, '', 'nor a voltage');
  const options = Array.from(el('moduleModel').options).map((option) => option.textContent);
  assert.equal(options.filter((label) => label !== 'Custom model…' && !label.includes('matching')).length, 2,
    'the picker is narrowed to the two records that share the rating');
});

check('a matching selection from the narrowed list still fills the form', () => {
  const waaree = Array.from(el('moduleModel').options)
    .find((option) => option.value === 'BiN-08-580');
  assert.ok(waaree, 'the narrowed list contains the Waaree bin');
  waaree.selected = true;
  el('moduleModel').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(el('moduleWattage').value, '580', 'wattage');
  assert.equal(el('moduleEfficiency').value, '22.45', 'efficiency');
});

/* ---------------------------------------------------------------- */
/* Inverters                                                         */
/* ---------------------------------------------------------------- */
check('a rating typed into the inverter model box selects that inverter', () => {
  el('inverterMake').value = 'Deye or Equivalent';
  el('inverterModel').value = '16';
  el('inverterModel').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(el('inverterKw').value, '16', 'rated output');
  assert.equal(el('inverterVmaxDc').value, '500', 'the record\u2019s own DC limit');
  assert.equal(el('inverterModel').value, 'SUN-16K-SG04LP3-EU', 'the model box names the exact product');
});

check('"16kw" and "20" resolve the same way as a bare number', () => {
  el('inverterMake').value = 'Deye or Equivalent';
  el('inverterModel').value = '16kw';
  el('inverterModel').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(el('inverterKw').value, '16', 'the unit is ignored');

  el('inverterMake').value = 'Growatt or Equivalent';
  el('inverterModel').value = '20';
  el('inverterModel').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(el('inverterKw').value, '20', 'a different rating finds a different inverter');
  assert.equal(el('inverterVmaxDc').value, '450', 'and its own DC limit');
});

check('a rating two products share does not pick either', () => {
  el('inverterMake').value = INVERTER_GROUP;
  el('inverterModel').value = '16';
  el('inverterModel').dispatchEvent(new w.Event('change', { bubbles: true }));
  const rows = Array.from(el('inverterWorkbookModel').options).filter((option) => option.value);
  assert.ok(rows.length >= 2, 'both Sungrow 16 kW rows are offered (' + rows.length + ')');
});

check('an inverter text matching nothing is left exactly as typed', () => {
  el('inverterKw').value = '';
  el('inverterMake').value = 'Deye or Equivalent';
  el('inverterModel').value = 'SUN-99K-DOES-NOT-EXIST';
  el('inverterModel').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(el('inverterModel').value, 'SUN-99K-DOES-NOT-EXIST', 'nothing is overwritten');
  assert.equal(el('inverterKw').value, '', 'and no rating is invented');
});

/* ---------------------------------------------------------------- */
/* Cables follow the grouped make too                                */
/* ---------------------------------------------------------------- */
check('a grouped cable make narrows the product rows behind it', () => {
  el('cableMake').value = 'Polycab / KEI or Equivalent';
  el('cableMake').dispatchEvent(new w.Event('change', { bubbles: true }));
  const rows = Array.from(el('workbookCableProduct').options).filter((option) => option.value);
  assert.equal(rows.length, 1, 'and it is the only row behind this make');
  assert.equal(rows[0].value, 'cab-25', 'the Polycab row is offered');
});

check('a cable make the workbook has no row for still sees the full list', () => {
  el('cableMake').value = 'Havells or Equivalent';
  el('cableMake').dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.ok(Array.from(el('workbookCableProduct').options).length > 0,
    'an unknown make narrows to nothing rather than emptying the picker');
});

/* ---------------------------------------------------------------- */
/* The customer-facing spec                                          */
/* ---------------------------------------------------------------- */
check('the quotation still prints the values the engine resolved', () => {
  w.Render.renderAll();
  const spec = el('v_tsTable').textContent;
  assert.ok(spec.includes('BiN-08-580'), 'the selected module is named');
  assert.ok(!/manufacturer-verified|MODULE_DB|INVERTER_DB/i.test(spec), 'and no provenance hedge returns');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
