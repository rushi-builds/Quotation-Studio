/* Page 5/6 presentation contract.

   Two regressions this file exists to catch, both shipped once already:

   1. The value row under page 5 lost the proposal's own two-tone marks and
      started printing monochrome line icons, so it stopped matching the value
      rows on the other thirteen pages.
   2. Page 6's sheet went grey and its bottom-right petal artwork vanished,
      because proposal-v2.css re-painted the generic `.page` background with a
      gradient and overrode proposal-values.css (loaded earlier).

   Runs on jsdom, so it checks the DOM contract rather than pixels: which
   artwork a row is built from, which labels it carries, and that the v2 sheet
   rule still resolves to the white page + corner artwork. Geometry that needs a
   real layout engine stays in the browser suites (proposal-values.test.cjs,
   tech-spec.test.js, page-spacing.test.js).

   Run: node page56-marks.test.cjs
*/
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let passed = 0;
const failures = [];
function t(name, fn) {
  try { fn(); passed++; console.log('  \u2713 ' + name); }
  catch (e) { failures.push(name + ' \u2192 ' + e.message); console.log('  \u2717 FAIL: ' + name + ' \u2192 ' + e.message); }
}

const css = read('assets/css/proposal-v2.css');
const js = read('assets/js/proposal-v2.js');
const valuesCss = read('assets/css/proposal-values.css');

console.log('\npage 5/6 marks, labels and sheet (the two regressions that shipped)');

/* ---------------------------------------------------------------- page 5 row */
t('page 5 value row is built from ProposalMarks, the proposal-wide artwork', () => {
  assert.match(js, /root\.ProposalMarks/,
    'proposal-v2.js must ask ProposalMarks for the value marks');
  assert.match(js, /M\.get\(ic, 30, PALETTES\[i % 4\]\)/,
    'marks must use ProposalMarks.get(icon, size, palette) in the four-palette rotation');
});

t('NEGATIVE: the row no longer draws bare line icons for its four cells', () => {
  assert.doesNotMatch(js, /values\(items\) \{[\s\S]{0,400}?icon\(ic, 34, 'pv2-svg'/,
    'the old monochrome icon(...) call is what made page 5 differ from the other pages');
});

t('page 5 keeps the pre-redesign labels: Site-fit / Specified / Design / Planned', () => {
  const call = js.match(/vals\.innerHTML = values\(\[([\s\S]*?)\]\);/);
  assert.ok(call, 'the value row call must still be in proposal-v2.js');
  for (const word of ['Site-fit', 'Specified', 'Design', 'Safety', 'Planned', 'Handover']) {
    assert.ok(call[1].includes(word), `label "${word}" is part of the original row`);
  }
  assert.equal((call[1].match(/\['/g) || []).length, 4, 'exactly four cells');
});

t('the four cells use marks that exist in ProposalMarks', () => {
  const marks = read('assets/js/proposal-marks.js');
  const call = js.match(/vals\.innerHTML = values\(\[([\s\S]*?)\]\);/)[1];
  const icons = [...call.matchAll(/\['([a-zA-Z]+)'/g)].map((m) => m[1]);
  assert.equal(icons.length, 4);
  for (const ic of icons) {
    assert.ok(new RegExp('\\n  ' + ic + ':').test(marks), `ProposalMarks has no shape named "${ic}"`);
  }
});

/* --------------------------------------------------------- page 6 sheet + art */
t('the petal artwork is anchored by the generic page rule, on white', () => {
  assert.match(valuesCss, /background-image:url\('\.\.\/images\/proposal-corner-petals\.svg'\)/);
  const svg = read('assets/images/proposal-corner-petals.svg');
  /* Three <linearGradient> definitions, three paths, three fills referencing them. */
  assert.equal((svg.match(/<linearGradient/g) || []).length, 3, 'three differently coloured petals');
  assert.equal((svg.match(/<path/g) || []).length, 3, 'one petal each');
});

t('REGRESSION: page 5 and 6 re-assert the white sheet + petals after the v2 gradient', () => {
  /* proposal-v2.css line ~4 paints a gradient on .page.pv2 with the same
     specificity as the petals rule, and it loads later - so without this
     override the artwork is painted over. */
  const override = css.match(
    /\.page\.pv2\.pv2-solution:not\(#pageCover\):not\(#pageClosing\),\s*\n?\.page\.pv2\.pv2-tech:not\(#pageCover\):not\(#pageClosing\)\s*\{([^}]*)\}/);
  assert.ok(override, 'a page-5/6 rule must re-declare the sheet background');
  assert.match(override[1], /background:#fff/, 'the sheet must be white again, not the grey gradient');
  assert.match(override[1], /proposal-corner-petals\.svg/, 'and it must carry the corner artwork');
  assert.match(override[1], /background-position:100% 100%/, 'anchored at the physical bottom-right corner');
  assert.match(override[1], /background-size:170px 170px/);
});

t('the override comes AFTER the gradient it corrects', () => {
  const gradient = css.indexOf('.page.pv2:not(#pageCover):not(#pageClosing){background:linear-gradient');
  const override = css.indexOf('.page.pv2.pv2-solution:not(#pageCover):not(#pageClosing),');
  assert.ok(gradient > -1 && override > -1 && override > gradient,
    'cascade order is what makes the correction win; it must sit below the gradient');
});

t('NEGATIVE: cover and approved closing page are not repainted', () => {
  for (const block of css.match(/\.page\.pv2\.pv2-(?:solution|tech)[^{]*\{[^}]*\}/g) || []) {
    assert.match(block, /:not\(#pageCover\):not\(#pageClosing\)/, 'both exclusions must be present');
  }
});

/* ------------------------------------------------------------ page 6 spacing */
t('page 6 note is one compact inline line, not an absolute overlay', () => {
  assert.match(css, /#pageTechSpec\.pv2 \.note-box #v_tsNoteLabel\{position:static/,
    'the label must flow inline; the old rule pinned it with position:absolute + 48px inset');
  assert.doesNotMatch(css, /#pageTechSpec\.pv2 \.note-box #v_tsNoteLabel\{letter-spacing:0;font-size:13px!important;position:absolute/,
    'the tall overlay label is the thing that was removed');
});

t('page 6 reclaimed vertical space on the card grid and the label', () => {
  assert.match(css, /\.pv2-tech \.pv2-spec\{display:flex;flex-direction:column;gap:8px;\}/,
    'card gap 10 -> 8');
  assert.match(css, /\.pv2-tech #v_tsGroupsLabel\.pv2-label\{margin:10px 0 8px -12px;height:24px;\}/,
    'group label 28px tall / 14+10 margin -> 24px tall / 10+8 margin');
  assert.match(css, /\.pv2-tech \.pv2-row \.pv2-k,\.pv2-tech \.pv2-row \.pv2-v\{padding-top:3px;padding-bottom:3px;\}/,
    'row padding 4 -> 3 on both cells');
});

t('the space came from padding and gaps, not from shrinking the body copy', () => {
  /* The reclaimed 54px is margins/gaps/padding only. The two sizes the reader
     actually reads (row text and the note) must not drop below what the page
     already shipped at its tightest fit step (9.4px / 9.8px). */
  /* The compress rule touches padding only - no font declarations in it. */
  const compress = css.match(/\.pv2-tech \.pv2-row \.pv2-k,\.pv2-tech \.pv2-row \.pv2-v\{([^}]*)\}/);
  assert.ok(compress, 'the row-compression rule must exist');
  assert.doesNotMatch(compress[1], /font/, 'it must change padding only, never the type');
  assert.match(compress[1], /padding-top:3px;padding-bottom:3px/, 'row padding 4 -> 3');
  const noteSize = Number((css.match(/#pageTechSpec\.pv2 \.pg-body > \.note-box\{[^}]*font-size:([\d.]+)px/) || [])[1]);
  const rowSize = Number((css.match(/\.pv2-tech \.pv2-k\{[^}]*font:(?:\d+ )?([\d.]+)px/) || [])[1]);
  assert.ok(noteSize >= 9.8, `note text ${noteSize}px would be smaller than the 9.8px it shipped at`);
  assert.ok(rowSize >= 10, `row text ${rowSize}px would be smaller than the 10.2px it shipped at`);
});

/* ------------------------------------------------------------- CSS sanity */
t('both stylesheets stay brace-balanced', () => {
  for (const [name, text] of [['proposal-v2.css', css], ['proposal-values.css', valuesCss]]) {
    const open = (text.match(/\{/g) || []).length;
    const close = (text.match(/\}/g) || []).length;
    assert.equal(open, close, `${name} has ${open} opening and ${close} closing braces`);
  }
});

t('jsdom builds the row end to end, with four marks and no page error', () => {
  const dom = new JSDOM(read('quotation.html'), { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.Render = { renderAll() {}, lastState: null };
  w.eval(read('assets/js/proposal-marks.js'));
  w.eval(read('assets/js/proposal-values.js'));
  w.eval(read('assets/js/proposal-v2.js'));
  w.Render.lastState = {};
  w.ProposalV2.sync();
  const vals = w.document.querySelector('#pageSolution .pv2-values-wrap');
  assert.ok(vals, 'page 5 grew its value row');
  assert.equal(vals.querySelectorAll('li').length, 4, 'four cells');
  assert.equal(vals.querySelectorAll('li svg').length, 4, 'every cell carries artwork');
  const tints = [...vals.querySelectorAll('li svg path')].map((p) => p.getAttribute('fill')).filter(Boolean);
  assert.ok(new Set(tints).size >= 2,
    'two-tone ProposalMarks artwork uses the palette tints; monochrome line icons would not');
});

console.log('\n==== RESULT: ' + passed + ' passed, ' + failures.length + ' failed ====');
if (failures.length) { for (const f of failures) console.log('  FAILED: ' + f); process.exitCode = 1; }
