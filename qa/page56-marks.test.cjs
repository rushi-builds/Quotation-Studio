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
const render = read('assets/js/render.js');
const valuesCss = read('assets/css/proposal-values.css');

console.log('\npage 5/6 marks, labels and sheet (the two regressions that shipped)');

/* ---------------------------------------------------------------- page 5 row */
t('page 5 value row is built from ProposalMarks, the proposal-wide artwork', () => {
  assert.match(js, /root\.ProposalMarks/,
    'proposal-v2.js must ask ProposalMarks for the value marks');
  assert.match(js, /M\.get\(ic, 26, PALETTES\[i % 4\]\)/,
    'marks must use ProposalMarks.get(icon, 26, palette) - 26px is the .pv-mark size on the other pages');
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

/* ------------------------------------ page 5 band matches the other pages */
t('page 5 band uses the same metrics as the footer band on the other pages', () => {
  /* Copied deliberately from .proposal-value-footer .pv-values in
     proposal-values.css: if one changes, the other must too. */
  const band = css.match(/\.pv2 \.pv2-values li\{([^}]*)\}/);
  assert.ok(band, 'the value-row cell rule must exist');
  assert.match(band[1], /justify-content:flex-start/, 'cells start at the left, not centred');
  assert.match(band[1], /gap:11px/, 'mark-to-copy gap 11px, same as .pv-values');
  assert.match(css, /\.pv2 \.pv2-values li \+ li\{padding-left:15px;\}/, '15px left padding after the first cell');
  assert.match(css, /\.pv2 \.pv2-values \.pv2-label\{font:500 9px\/1\.5 'Inter',sans-serif/, '9px copy');
  const divider = css.match(/\.pv2 \.pv2-values li \+ li::before\{([^}]*)\}/);
  assert.ok(divider);
  assert.match(divider[1], /left:-9px/, 'divider sits at -9px like the footer band');
  assert.match(divider[1], /height:18px/);
});

t('every metric above is the same value the footer band uses', () => {
  const footer = valuesCss.match(/\.proposal-value-footer \.pv-values li\{([^}]*)\}/)[1];
  const page5 = css.match(/\.pv2 \.pv2-values li\{([^}]*)\}/)[1];
  for (const decl of ['justify-content:flex-start', 'gap:11px']) {
    assert.ok(footer.includes(decl), `footer band should carry ${decl}`);
    assert.ok(page5.includes(decl), `page 5 band must carry the same ${decl}`);
  }
  assert.match(valuesCss, /\.proposal-value-footer \.pv-mark svg\{display:block;\}/);
  assert.match(css, /\.pv2 \.pv2-values \.pv2-mark svg\{display:block;\}/);
});

t('the row markup mirrors the footer markup: a mark span plus a copy span', () => {
  assert.match(js, /<li><span class="pv2-mark">' \+ valueMark\(ic, i\) \+ '<\/span>'/,
    'mark is wrapped in its own span, as .pv-mark is on the other pages');
  assert.match(js, /'<span class="pv2-label">' \+ esc\(a\)/, 'copy gets its own span');
});

/* ------------------------------------------- page 6 opener is a quiet line */
t('page 6 opener replaces the dark DETAILED SPECIFICATION slab with one line', () => {
  const emitted = js.match(/groupsLabel\.innerHTML = '([\s\S]*?)';/);
  assert.ok(emitted, 'the opener must be emitted by the page itself');
  assert.doesNotMatch(emitted[1], /DETAILED SPECIFICATION/,
    'the slab text is gone from what actually renders; it repeated the sub-heading above it');
  assert.match(js, /groupsLabel\.classList\.add\('pv2-eyebrow'\)/, 'the opener gets its own class');
  assert.match(js, /<em>compatibility<\/em>/, 'one orange phrase');
  assert.match(js, /<em>certified performance<\/em>/, 'two orange phrases');
  /* Exactly two <em> - the owner asked for 2 quiet orange bits, not a rainbow. */
  const copy = js.match(/groupsLabel\.innerHTML = '([\s\S]*?)';/)[1];
  assert.equal((copy.match(/<em>/g) || []).length, 2, 'exactly two orange phrases');
});

t('the orange phrases are the only coloured part of that line', () => {
  const eyebrow = css.match(/\.pv2-tech #v_tsGroupsLabel\.pv2-eyebrow\{([^}]*)\}/);
  assert.ok(eyebrow, 'eyebrow rule exists');
  assert.match(eyebrow[1], /color:#7A828E/, 'the sentence itself is quiet grey');
  assert.match(css, /\.pv2-tech #v_tsGroupsLabel\.pv2-eyebrow em\{[^}]*color:#E5741A/,
    'only the <em> phrases take the orange');
});

/* ------------------------------------------ page 6 note wins the specificity */
t('REGRESSION: the note rule outweighs app.css `#pageTechSpec .note-box`', () => {
  const weights = (sel) => {
    const ids = (sel.match(/#/g) || []).length;
    const cls = (sel.match(/\.[a-z0-9-]+/gi) || []).length
      + (sel.match(/\[[^\]]*\]/g) || []).length;
    const el = (sel.match(/(^|[ >+~])([a-z][a-z0-9-]*)/gi) || []).length;
    return ids * 10000 + cls * 100 + el;
  };
  const base = weights('#pageTechSpec .note-box');
  const mine = weights('#pageTechSpec.pv2 .pg-body > .note-box');
  assert.ok(mine > base, `our rule (${mine}) must outrank app.css (${base}) or the old box returns`);
  /* And it must set every property the base rule sets, so nothing leaks through. */
  /* Several rules target this box; the LAST one is the one that wins the
     cascade at equal-or-higher specificity, so that is the one to assert on. */
  const blocks = [...css.matchAll(/#pageTechSpec\.pv2 \.pg-body > \.note-box\{([\s\S]*?)\}/g)];
  assert.ok(blocks.length >= 2, 'the shared note-bar rule and the page-6 override both exist');
  const block = blocks[blocks.length - 1][1];
  /* font-size now rides the `font:` shorthand, which resets it just as well. */
  for (const prop of ['background:', 'border:', 'box-shadow:', 'backdrop-filter:none', 'padding:', 'font:']) {
    assert.ok(block.includes(prop), `the override must re-set ${prop} instead of leaving app.css' value`);
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
  assert.match(css, /#pageTechSpec\.pv2 \.pg-body > \.note-box #v_tsNoteLabel\{[\s\S]{0,200}?position:static/,
    'the label must flow inline; the old rule pinned it with position:absolute + 48px inset');
  assert.doesNotMatch(css, /#pageTechSpec\.pv2 \.note-box #v_tsNoteLabel\{letter-spacing:0;font-size:13px!important;position:absolute/,
    'the tall overlay label is the thing that was removed');
});

t('page 6 reclaimed vertical space on the card grid and the label', () => {
  assert.match(css, /\.pv2-tech \.pv2-spec\{display:flex;flex-direction:column;gap:8px;\}/,
    'card gap 10 -> 8');
  assert.match(css, /\.pv2-tech #v_tsGroupsLabel\.pv2-eyebrow\{[\s\S]{0,160}?height:auto/,
    'the opener is a quiet single line now, not a height-locked slab');
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

/* ------------------------------- page 6 note reads as a fifth specification row */
t('the note is laid out as a row of the card (41% / 59%), not a floating box', () => {
  const block = [...css.matchAll(/#pageTechSpec\.pv2 \.pg-body > \.note-box\{([\s\S]*?)\}/g)].pop()[1];
  assert.match(block, /grid-template-columns:41% 59%/,
    'same column split as .pv2-row, so Important lines up under Lightning Protection');
  assert.match(block, /border-radius:8px/, 'same corner radius as the row stack');
  /* and it still reads as advice: warm paper with an orange spine, not a plain
     sheet (he asked for the note to look properly designed again). */
  assert.match(block, /background:#FFFBF6/, 'warm paper, so it is not mistaken for a spec row');
  assert.match(block, /border-left:3px solid #F2811D/, 'an orange spine marks it as the note');
});

t('the Important label keeps the key-column tint and an orange bullet', () => {
  assert.match(css, /#pageTechSpec\.pv2 \.pg-body > \.note-box #v_tsNoteLabel\{[\s\S]{0,300}?background:#FDF3E7/,
    'the label is a tinted key cell, like the key cells the rows above use');
  /* A real icon, not a bare square: the label carries a round orange badge with a
     line icon in it, so it matches the icon-led rows. */
  assert.match(css, /#pageTechSpec\.pv2 \.pg-body > \.note-box #v_tsNoteLabel::before\{[^}]*border-radius:50%/,
    'the badge is round');
  assert.match(css, /#pageTechSpec\.pv2 \.pg-body > \.note-box #v_tsNoteLabel::before\{[^}]*data:image\/svg\+xml/,
    'and it carries an inline line icon');
  /* The old round "i" badge must not come back on this row. */
  const before = [...css.matchAll(/#pageTechSpec\.pv2 \.pg-body > \.note-box::before\{([^}]*)\}/g)].pop()[1];
  assert.match(before, /content:none/, 'the circular info dot is switched off for this row');
});

/* --------------------------------------------- ARS is a marked make now */
t('ARS prints its own mark on the structure card instead of set type', () => {
  assert.match(js, /ars: 'ars-solartech'/, 'BRAND_LOGOS carries the structure make');
  assert.doesNotMatch(js, /is-ars"><b>ARS<\/b>/, 'the hand-built ARS wordmark is gone');
  assert.match(js, /brand = 'ARS Solar Tech'/, 'and the typed fallback names the full make');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/images/brands/ars-solartech.webp')),
    'the mark file exists');
});

/* ---------------------- page 5's value row sits on the footer's rule, flush */
t('the value row is glued to the footer rule, not stranded above it', () => {
  /* The band on the other pages is absolutely positioned flush to the rule.
     Page 5 keeps the row in flow, so it needs margin-top:auto to fall onto the
     footer and a -12px bottom margin (46px body padding - 34px footer) to meet
     the rule exactly. */
  const decl = [...css.matchAll(/\.pv2-solution(?:\.pv2-fit-\d)? \.pv2-values-wrap([^{]*)\{([^}]*)\}/g)]
    .map((m) => m[2]).filter((b) => /margin-top:auto/.test(b)).pop();
  assert.ok(decl, 'a rule gives the row margin-top:auto so no slack is left under it');
  assert.match(decl, /margin-bottom:-12px/,
    'and pulls it down by 12px to land on the rule (46px body padding - 34px footer)');
  /* and it must outrank the tighten steps that set an explicit 11px top margin */
  const guards = [...css.matchAll(/\.[^{}]*pv2-values-wrap[^{}]*\{[^}]*margin-top:auto[^}]*\}/g)].pop()[0];
  assert.match(guards, /\.pv2-solution\.pv2-fit-2 \.pv2-values-wrap/,
    'the tight step is re-declared too, or its 11px would win');
});

t('the value row has a definite height, so its lower edge meets the rule', () => {
  assert.match(css, /\.pv2 \.pv2-values\{[^}]*min-height:26px/, 'one icon tall, like the other pages');
  assert.match(css, /margin-bottom:-12px/, 'the row, not the label leading, lands on the rule');
});

/* -------------------------------------- card 03's walkway and card 04's badge */
t('the structure card names the walkway and draws it with its own icon', () => {
  /* Its own row, not a suffix on Structure: a row is what carries an icon. */
  assert.match(render, /\['Walkway',/, 'the mounting scope has a walkway row of its own');
  assert.match(render, /\['Structure', \[s\.mountMake/, 'and Structure keeps its own row');
  assert.match(js, /\[\/walkway\/, 'walkway'\]/, 'and the icon lookup knows the word');
  assert.match(js, /walkway: '<path/, 'the glyph exists');
  /* The rail is what makes it a walkway and not another module drawing, and the
     deck has to be a deck: two horizontals, not one. */
  assert.match(js, /walkway: '[^']*M5 15V9\.5h14V15/, 'the glyph carries a handrail up from the deck');
  assert.match(js, /walkway: '<path d="M3 15h18M3 21h18"/, 'and a deck with legs under it');
});

t('card 03 carries the owner’s new structure render', () => {
  assert.match(js, /mount: IMG \+ 'equipment\/cards\/mount-structure-callouts\.webp'/,
    'the structure card still points at the card set');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/images/equipment/cards/mount-structure-callouts.webp')),
    'and the file is there');
});

t('card 04 shows the standards render and states what it is', () => {
  assert.match(js, /standards: IMG \+ 'equipment\/cards\/design-is-standards\.webp'/,
    'the design card has its own photograph');
  assert.match(js, /if \(kind === 'design'\) return CARD_PHOTO\.standards;/,
    'and photoFor actually routes the design card to it');
  assert.ok(fs.existsSync(path.join(ROOT, 'assets/images/equipment/cards/design-is-standards.webp')),
    'the file is there');
  /* The badge used to read "Lightning & earthing", which describes card 03's rows
     and not the card of codes it sits on. */
  assert.match(js, /<small>Standards &amp; codes<\/small>/, 'the card says what it is');
  assert.doesNotMatch(js, /Lightning &amp; earthing/, 'the old badge copy is gone');
});

/* --------------------------------------- page 5 overview got its room back */
t('the system overview artwork is taller than it was', () => {
  assert.match(css, /\.pv2 \.pv2-node-art\{height:108px/, 'node artwork 84px -> 108px');
  assert.match(css, /\.pv2-solution\.pv2-fit-2 \.pv2-node-art\{height:92px;\}/,
    'and the tight step keeps most of that gain (was 70px)');
});

t('overview and note share one gap value on page 5', () => {
  /* The row no longer joins this rhythm: it is pulled onto the footer rule, so
     it carries an explicit gap only as a floor and then `auto` overrides it.
     These two are the pair that sits in the flow together. */
  const gaps = [...css.matchAll(/\.pv2-solution (\.pv2-overview|#v_soScopeNote)\{margin-top:(\d+)px;\}/g)]
    .map((m) => Number(m[2]));
  assert.equal(gaps.length, 2, 'both blocks declare their own gap');
  assert.equal(new Set(gaps).size, 1, `both must agree, got ${gaps.join(' / ')} px`);
});

t('the value row still keeps a floor gap for the tight steps', () => {
  const floor = [...css.matchAll(/\.pv2-solution\.pv2-fit-2 #v_soScopeNote,\.pv2-solution\.pv2-fit-2 \.pv2-values-wrap\{margin-top:(\d+)px;\}/g)];
  assert.equal(floor.length, 1, 'the tight step sets the note and the row together');
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
