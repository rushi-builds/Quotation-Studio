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
   Module picker: a grouped make must still reach its datasheet record.

   The make on the page is authored as a group - "Panasonic / Waaree / Adani
   or Equivalent" - while every catalogue record names one manufacturer. The
   module picker compared those two as equal strings, so it found no models,
   the model list stayed empty, and the form never received a datasheet
   figure: wattage and dimensions came from the generic seed row, and
   efficiency, Voc/Vmp/Isc/Imp and the temperature coefficients were printed
   as "Not supplied" no matter what was picked.

   Run: node qa/module-autofill.test.js
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
const w = boot();
const g = (id) => w.document.getElementById(id).value;
const store = w.EquipmentStore;

check('a grouped make lists the manufacturers behind it', () => {
  const models = store.modelEntriesForMake(GROUPED).map((row) => row.model);
  assert.ok(models.length > 0, 'the model list must not be empty');
  assert.ok(models.includes('BiN-08-580'), 'the Waaree ELITE bin is offered');
  assert.ok(models.some((m) => m.includes('ASB-M10')), 'the Adani bin is offered');
});

check('a grouped make with no catalogue record still offers nothing', () => {
  // Compared by length: the array is built inside jsdom's realm, so its
  // prototype is not Node's and deepStrictEqual would reject it as a mismatch.
  const rows = store.modelEntriesForMake('Premier Energies or Equivalent');
  assert.equal(rows.length, 0,
    'no Premier row exists, so no model may be invented for it');
});

check('the grouped make resolves to the manufacturer record', () => {
  const entry = store.findModule(GROUPED, 'BiN-08-580');
  assert.ok(entry, 'findModule must return the Waaree record');
  assert.equal(entry.make, 'Waaree');
  assert.equal(entry.wp, 580);
});

check('a plain make resolves to the same record as before', () => {
  assert.ok(store.findModule('Waaree', 'BiN-08-580'), 'exact make still matches');
});

check('an unknown model returns nothing rather than a near match', () => {
  assert.equal(store.findModule(GROUPED, 'DOES-NOT-EXIST'), null);
});

check('choosing the model fills every field its datasheet carries', () => {
  const entry = store.findModule(GROUPED, 'BiN-08-580');
  assert.equal(store.applyModuleDefaults(entry), true);
  assert.equal(g('moduleWattage'), '580', 'wattage');
  assert.equal(g('moduleEfficiency'), '22.45', 'efficiency');
  assert.equal(g('moduleLengthMm'), '2278', 'length');
  assert.equal(g('moduleWidthMm'), '1134', 'width');
  assert.equal(g('moduleVoc'), '52.5', 'Voc');
  assert.equal(g('moduleVmp'), '44.01', 'Vmp');
  assert.equal(g('moduleIsc'), '13.93', 'Isc');
  assert.equal(g('moduleImp'), '13.18', 'Imp');
  assert.equal(g('modulePmaxBetaPct'), '-0.3', 'temperature coefficient of Pmax');
  assert.equal(g('moduleTech'), 'N-type TOPCon', 'technology');
});

check('switching to another model clears the previous one first', () => {
  const other = store.modelEntriesForMake(GROUPED).find((row) => row.model !== 'BiN-08-580');
  assert.ok(other, 'a second model is available to switch to');
  assert.equal(store.applyModuleDefaults(other), true);
  assert.notEqual(g('moduleWattage'), '580', 'the previous wattage must not survive the switch');
  // The replacement's own figure, or blank when its record carries none -
  // never the number the model before it left behind.
  assert.equal(g('moduleEfficiency'), other.efficiency === '' ? '' : String(other.efficiency),
    'efficiency follows the newly selected record only');
});

check('the Tech Spec resolves the datasheet record from the grouped make', () => {
  assert.ok(store.findModule(GROUPED, 'BiN-08-580')?.verified === true,
    'the datasheet-backed row is the one render.js receives');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
