/* Equipment dropdowns — a catalogue refresh must never paste an old name back
   over text the user is typing.

   Why this file exists: qa/equipment-entry.test.js (real browser) reported
   "catalog refresh does not discard custom values —
   moduleMake field='Custom Solar & Partners' state='Waaree'". The preview
   renders on a trailing debounce, so the <select> can sit a keystroke behind
   the text box it belongs to. refreshSelects() rebuilt the list from the stale
   select value and wrote it into the box, which is the customer-visible form of
   the bug: you type a vendor name, something syncs, and the old one is back.

   This suite is the offline half: it drives the real page, the real
   catalogue-data.js and the real equipment.js in jsdom, with no browser and no
   server, so the rule is enforced in the required `npm test` chain rather than
   only in the opt-in Chromium job.

   Run: node qa/equipment-custom-text.test.cjs
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
  const dom = new JSDOM(html, { url: 'https://equipment.test/quotation.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.Element.prototype.scrollIntoView = function () {};
  for (const file of ['catalogue-data.js', 'equipment.js']) {
    w.eval(fs.readFileSync(path.join(ROOT, 'assets/js', file), 'utf8'));
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  /* app.js wires the dropdowns and paints them on boot; the editor is the only
     caller of these two, so the harness has to stand in for it. */
  w.EquipmentStore.wire();
  w.EquipmentStore.refreshSelects();
  return { w, d: w.document };
}

/* Type into a field's Custom box the way a keyboard does: the select flips to
   its data-custom option and the text box carries the value. */
function typeCustom(ctx, id, text) {
  const { w, d } = ctx;
  const sel = d.getElementById(id);
  const input = d.getElementById(id + 'Custom');
  const manual = sel.querySelector('option[data-custom]');
  manual.selected = true;
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  input.value = text;
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  return { sel, input };
}

console.log('equipment dropdowns — custom text survives a catalogue refresh');

const ctx = page();
const { w, d } = ctx;

t('the make dropdown starts on a catalogue value with a hidden Custom box', () => {
  const sel = d.getElementById('moduleMake');
  assert.equal(sel.value, 'Waaree');
  assert.equal(d.getElementById('moduleMakeCustomWrap').hidden, true);
  assert.equal(d.getElementById('moduleMakeCustom').disabled, true);
});

t('typing a custom make switches the field to Custom mode and takes the text', () => {
  const { sel, input } = typeCustom(ctx, 'moduleMake', 'Custom Solar & Partners');
  assert.equal(sel.value, 'Custom Solar & Partners');
  assert.equal(sel.selectedOptions[0].hasAttribute('data-custom'), true);
  assert.equal(input.value, 'Custom Solar & Partners');
  assert.equal(d.getElementById('moduleMakeCustomWrap').hidden, false);
  assert.equal(input.disabled, false);
});

/* The exact shape of the reported bug: the select has not caught up with the
   text box yet. The refresh must trust the box. */
t('a refresh reads the typed text, not a select that has not caught up', () => {
  const sel = d.getElementById('moduleMake');
  const input = d.getElementById('moduleMakeCustom');
  const typed = 'Custom Solar & Partners';
  /* The shape the browser test caught: the Custom option is still selected but
     it still carries the PREVIOUS name, while the box already holds the new
     one. Rebuilding from the option pasted 'Waaree' back over the text. */
  sel.querySelector('option[data-custom]').value = 'Waaree';
  assert.equal(sel.value, 'Waaree', 'precondition: the option lags behind the box');
  assert.equal(input.value, typed, 'precondition: the box holds the new text');
  w.EquipmentStore.refreshSelects();
  assert.equal(input.value, typed, 'the typed text was overwritten');
  assert.equal(sel.value, typed, 'the rebuilt select lost the typed text');
  assert.equal(sel.selectedOptions[0].hasAttribute('data-custom'), true, 'Custom mode was dropped');
});

t('a catalogue import keeps the custom text and the Custom mode', () => {
  const sel = d.getElementById('moduleMake');
  const current = w.EquipmentStore.cat();
  w.EquipmentStore.importCloud({
    sha: 'custom-text-fixture',
    syncedAt: '2026-11-05T00:00:00Z',
    source: 'Disposable Excel fixture',
    modules: [...current.modules, { make: 'Fresh Catalog Make', model: 'FC-610', wp: 610, cellType: 'HJT' }],
    inverters: current.inverters.slice(),
    cables: current.cables.slice()
  });
  assert.equal(d.getElementById('moduleMakeCustom').value, 'Custom Solar & Partners');
  assert.equal(sel.value, 'Custom Solar & Partners');
  assert.ok([...sel.options].some((o) => o.value === 'Fresh Catalog Make'), 'the new catalogue row must be offered');
});

t('an empty Custom box is not filled in with a catalogue default', () => {
  const sel = d.getElementById('moduleMake');
  const input = d.getElementById('moduleMakeCustom');
  input.value = '';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  w.EquipmentStore.refreshSelects();
  assert.equal(input.value, '');
  assert.equal(sel.value, '');
  assert.equal(sel.selectedOptions[0].hasAttribute('data-custom'), true);
  assert.notEqual(sel.value, 'Waaree', 'a blank box must never silently become the template make');
});

t('a second, independent field keeps its own text through the same refresh', () => {
  const { sel, input } = typeCustom(ctx, 'cableMake', 'Custom cable <series>');
  w.EquipmentStore.refreshSelects();
  assert.equal(input.value, 'Custom cable <series>');
  assert.equal(sel.value, 'Custom cable <series>');
  assert.equal(d.getElementById('moduleMakeCustom').value, '', 'refreshing one field must not touch another');
});

t('picking a listed make again leaves Custom mode cleanly', () => {
  const sel = d.getElementById('moduleMake');
  sel.value = 'Waaree';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(d.getElementById('moduleMakeCustomWrap').hidden, true);
  assert.equal(d.getElementById('moduleMakeCustom').disabled, true);
  w.EquipmentStore.refreshSelects();
  assert.equal(sel.value, 'Waaree');
  assert.equal(sel.selectedOptions[0].hasAttribute('data-custom'), false);
});

console.log(`\n${pass} equipment custom-text checks passed.`);
