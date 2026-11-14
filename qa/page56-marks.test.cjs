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
const execFileSync = require('node:child_process').execFileSync;

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
     cascade at equal-or-higher specificity, so that is the one to assert on.
     (Page 5's scope note no longer rides this selector: page 6's note is now a
     pill of its own, so the base layout lives in ONE rule and the fit step adds
     the padding tweak.) */
  const blocks = [...css.matchAll(/#pageTechSpec\.pv2 \.pg-body > \.note-box\{([\s\S]*?)\}/g)];
  assert.ok(blocks.length >= 1, 'the base layout rule exists');
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
  /* The card text must not drop below what the page already shipped at its
     tightest fit step (9.4px / 9.8px).
     The note is the one deliberate exception: the owner sent a reference and asked
     for it "chhota ... neat clean"; it is a footnote pill now, set at 9.4px, which
     is the same size the fit ladder already used for it. */
  /* The compress rule touches padding only - no font declarations in it. */
  const compress = css.match(/\.pv2-tech \.pv2-row \.pv2-k,\.pv2-tech \.pv2-row \.pv2-v\{([^}]*)\}/);
  assert.ok(compress, 'the row-compression rule must exist');
  assert.doesNotMatch(compress[1], /font/, 'it must change padding only, never the type');
  assert.match(compress[1], /padding-top:3px;padding-bottom:3px/, 'row padding 4 -> 3');
  /* The pill sets its type with the `font:` shorthand, so read the size from
     there; fall back to a longhand if one is ever reintroduced. */
  const noteBlock = (css.match(/#pageTechSpec\.pv2 \.pg-body > \.note-box\{([^}]*)\}/) || [])[1] || '';
  const noteSize = Number((noteBlock.match(/font-size:([\d.]+)px/) ||
    noteBlock.match(/font:(?:\d+ )?([\d.]+)px/) || [])[1]);
  const rowSize = Number((css.match(/\.pv2-tech \.pv2-k\{[^}]*font:(?:\d+ )?([\d.]+)px/) || [])[1]);
  assert.ok(noteSize >= 9.4, `note text ${noteSize}px would be smaller than the 9.4px it shipped at`);
  assert.ok(rowSize >= 10, `row text ${rowSize}px would be smaller than the 10.2px it shipped at`);
});

/* ------------------------------- page 5 overview is the owner's own render */
t('the system overview is a live diagram, not a picture of one', () => {
  /* It was his finished render for a while, and that was wrong in a way only he
     caught: the labels and the "13 x 545 Wp" / "7 kW" were painted into it, so
     every quote printed the same numbers, and no raster can stay sharp at every
     zoom. The flow is drawn from the same content the rest of the proposal reads,
     and the links and badges are SVG. */
  assert.match(js, /'<div class="pv2-ov-box">' \+ flowDiagram\(s, f\)/,
    'the overview box draws the flow');
  assert.doesNotMatch(js, /'<div class="pv2-ov-box">' \+ overviewArt\(\)/,
    'and no longer pastes the render into it');

  /* the numbers have to come from the quote, not from the artwork */
  const flowRaw = js.slice(js.indexOf('function flowDiagram('), js.indexOf('function solution('));
  /* comments explain the old bug and quote it; only the code has to be clean */
  const flow = flowRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(flow, /f\.moduleCount/, 'the module count is read from the quote');
  assert.match(flow, /f\.moduleWattage/, 'and the module wattage');
  assert.match(flow, /f\.inverterKw/, 'and the inverter size');
  assert.doesNotMatch(flow, /545|13 ×|7 kW/, 'nothing is hard-coded in the diagram');

  /* every label is one of the editable diagram labels */
  for (const key of ['array', 'dcdb', 'inverter', 'acdb', 'home', 'meter', 'grid']) {
    assert.match(flow, new RegExp('P\\.' + key), `${key} comes from diagramLabels`);
  }
  /* and the links and badges are vector, so they cannot blur */
  assert.match(flow, /arrow\(link\.dir \|\| 'right', link\.tone\)/, 'links are drawn, not cropped');
  assert.match(js, /<svg class="pv2-link-svg"/, 'the link art is SVG');
  assert.match(js, /<span class="pv2-grp is-/, 'the DC / AC badges are markup, not pixels');
});

t('the artwork is not dressed a second time', () => {
  /* The render was cropped down to just the flow box, so the section keeps the
     page's own ribbon - but must not print a second note under it, because the
     render's note is still in the artwork. */
  assert.match(js, /label\(P\.diagramTitle \|\| 'SYSTEM OVERVIEW'\) \+ '<div class="pv2-ov-box">'/,
    'the ribbon is the page’s own again');
  assert.doesNotMatch(js, /pv2-ov-box">' \+ overviewArt\(\) \+ '.*note/i, 'and no second note is printed');
  /* The scope note is suppressed only while it is boilerplate: the renderer puts
     a real scope sentence in that element when a battery or rainwater system is
     quoted, and that one must survive. */
  assert.match(js, /const basic = \/\^The exact equipment ratings are listed in Technical Specification/,
    'boilerplate is recognised by its own opening words');
  assert.match(js, /scopeNote\.hidden = basic\.test/, 'and only that is hidden');
});

t('the overview render is stored at full resolution', () => {
  /* He caught the blur: the first version was downscaled to 1400px and then drawn
     into a 718px box on a sheet that the preview also scaled down. It is now kept
     at the source's own 2144px, so the sheet never has to stretch it. */
  /* Read the dimensions the way a browser does - through the decoder - rather than
     hand-parsing the RIFF chunk, which silently reported 0x0 once the file became
     VP8L (lossless). */
  const file = path.join(ROOT, 'assets/images/proposal/system-overview-flow.webp');
  const [w, h] = execFileSync('identify', ['-format', '%w %h', file], { encoding: 'utf8' })
    .trim().split(/\s+/).map(Number);
  assert.ok(w >= 2000, `the render must stay at source width, got ${w}px`);
  assert.ok(h >= 480, `and its source height, got ${h}px`);
});

t('the DC / AC pills are outlined, in the artwork, and not overlaid twice', () => {
  /* His last note: the pills were solid fills, he wants them outlined in green and
     orange. They are painted into the raster now, so the page must not also emit
     them - that is what put a second pill a few pixels off the painted one. */
  assert.doesNotMatch(js, /class="pv2-pill/, 'no pill is emitted on top of the artwork');
  assert.doesNotMatch(js, /pv2-ov-stack/, 'and no overlay stack is emitted at all');
  assert.doesNotMatch(css, /\.pv2-pill\{/, 'the overlay CSS is gone too');

  const file = path.join(ROOT, 'assets/images/proposal/system-overview-flow.webp');
  const probe = (x, y) => {
    const out = execFileSync('convert', [file, '-format', `%[pixel:p{${x},${y}}]`, 'info:'], { encoding: 'utf8' });
    return out.match(/\d+/g).map(Number);
  };
  /* The pill interiors must be paper-white now (outlined, not filled), while the
     ring around them carries the colour. */
  const dcIn = probe(540, 48), acIn = probe(1440, 48);
  assert.ok(dcIn[0] > 240 && dcIn[1] > 240 && dcIn[2] > 240, 'the DC pill is hollow');
  assert.ok(acIn[0] > 240 && acIn[1] > 240 && acIn[2] > 240, 'the AC pill is hollow');
});

t('the AC badge is navy, outlined, like the DC one is green', () => {
  /* He asked for the badge that carries AC to be navy too, ring and letter alike,
     so it sits with the navy arrows instead of fighting them. DC keeps its green -
     the two halves of the diagram want to be told apart. */
  const file = path.join(ROOT, 'assets/images/proposal/system-overview-flow.webp');
  const probe = (x, y) => {
    const out = execFileSync('convert', [file, '-format', `%[pixel:p{${x},${y}}]`, 'info:'], { encoding: 'utf8' });
    return out.match(/\d+/g).map(Number);
  };
  /* the pill interior stays paper, the ring around it is ink */
  const ringAc = probe(1511, 52), insideAc = probe(1511, 82);
  assert.ok(insideAc[0] > 235 && insideAc[1] > 235 && insideAc[2] > 235, 'the AC pill is hollow');
  assert.ok(ringAc[2] - ringAc[0] > 4 && ringAc[2] < 80 && ringAc[0] < 70,
    `the AC ring is navy, got rgb(${ringAc.slice(0, 3)})`);

  /* no orange outline survives anywhere in the badge area */
  let orange = 0;
  for (let x = 1430; x <= 1590; x += 3) {
    for (let y = 40; y <= 125; y += 3) {
      const p = probe(x, y);
      if (p[0] - p[2] > 90 && p[0] - p[1] > 40 && p[0] > 180) orange++;
    }
  }
  assert.ok(orange < 6, `the old orange AC ring is gone, found ${orange}px`);
});

t('the AC side of the flow runs on navy arrows, not orange', () => {
  /* The two links after the inverter were the only orange left in the row, and he
     wanted them navy - the orange belonged to the AC grouping, and the grouping is
     navy now. */
  const file = path.join(ROOT, 'assets/images/proposal/system-overview-flow.webp');
  const scan = (x0, x1) => {
    let navy = 0, orange = 0;
    const out = execFileSync('convert', [file, '-crop', `${x1 - x0}x70+${x0}+200`, '+repage', 'txt:-'],
      { encoding: 'utf8', maxBuffer: 1 << 24 });
    for (const line of out.split('\n')) {
      const m = line.match(/^(\d+),(\d+):.*?\((\d+),(\d+),(\d+)/);
      if (!m) continue;
      const r = +m[3], g = +m[4], b = +m[5];
      if (b - r > 12 && b < 95 && r < 70 && g < 80) navy++;
      else if (r - b > 90 && r - g > 40 && r > 180) orange++;
    }
    return { navy, orange };
  };
  const a = scan(912, 982);   /* inverter -> ACDB */
  const b = scan(1166, 1234); /* ACDB -> house  */
  for (const [name, r] of [['inverter -> ACDB', a], ['ACDB -> house', b]]) {
    assert.ok(r.navy > 60, `${name}: arrows are navy (${r.navy}px)`);
    assert.ok(r.orange < 20, `${name}: no orange left (${r.orange}px)`);
  }
});

t('both two-way links are his block arrows, green and navy', () => {
  /* Orange beside green read as a flag, not as a diagram. Green and navy keeps two
     clearly different inks - and the green is the page's own green, the same one in
     the DC ring, so the pair still belongs to the page rather than to his file. */
  const file = path.join(ROOT, 'assets/images/proposal/system-overview-flow.webp');
  const box = (x0, x1) => {
    let minX = 1e9, maxX = -1, green = 0, navy = 0, orange = 0;
    const out = execFileSync('convert', [file, '-crop', `${x1 - x0}x100+${x0}+200`, '+repage', 'txt:-'],
      { encoding: 'utf8', maxBuffer: 1 << 26 });
    for (const line of out.split('\n')) {
      const m = line.match(/^(\d+),(\d+):.*?\((\d+),(\d+),(\d+)/);
      if (!m) continue;
      const x = +m[1] + x0, r = +m[3], g = +m[4], b = +m[5];
      const isGreen = g > 100 && g - r > 40 && g - b > 30;
      const isNavy = b - r > 12 && b < 95 && r < 70 && g < 80;
      if (isGreen) { green++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
      else if (isNavy) { navy++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
      else if (r - b > 90 && r - g > 40 && r > 180) orange++;
    }
    return { green, navy, orange, w: maxX - minX + 1 };
  };

  const houseMeter = box(1480, 1595);
  const meterGrid = box(1790, 1890);
  for (const [name, b] of [['house <-> meter', houseMeter], ['meter <-> grid', meterGrid]]) {
    assert.ok(b.green > 60, `${name}: green arrow present (${b.green}px)`);
    assert.ok(b.navy > 60, `${name}: navy arrow present (${b.navy}px)`);
    assert.ok(b.orange < 20, `${name}: no orange left in the arrows (${b.orange}px)`);
    assert.ok(b.w > 60, `${name}: the pair is drawn large, got ${b.w}px wide`);
  }
  assert.ok(Math.abs(houseMeter.w - meterGrid.w) <= 6,
    `both pairs are one width, got ${houseMeter.w} and ${meterGrid.w}`);
});

t('the overview is stored lossless, at full native width', () => {
  /* The blur he kept seeing was this file, not the page: every rebuild had read
     the previous webp and written a new one, so by the last round the artwork had
     been through six lossy encodes and the labels were visibly smeared. The build
     now goes source PNG -> one encode, and the encode is lossless. */
  const file = path.join(ROOT, 'assets/images/proposal/system-overview-flow.webp');
  const buf = fs.readFileSync(file);
  const chunk = buf.slice(buf.indexOf('WEBP') + 4, buf.indexOf('WEBP') + 8).toString();
  /* VP8L is the lossless bitstream, VP8 is lossy, VP8X is the extended container. */
  assert.strictEqual(chunk, 'VP8L',
    `the file is written lossless (got ${chunk}), so no encode softens the labels`);
  const [w, h] = execFileSync('identify', ['-format', '%w %h', file], { encoding: 'utf8' })
    .trim().split(/\s+/).map(Number);
  assert.strictEqual(w, 2144, 'the artwork is still its native width, not scaled down');
  assert.strictEqual(h, 498, 'and its native height');

  /* And sharpness is measured, not assumed: an edge-energy score on a band of
     small type has to match the source PNG the artwork came from. A lossy copy of
     the same crop scores measurably lower. */
  const energy = (f) => {
    const out = execFileSync('convert', [f, '-crop', '420x60+80+385', '+repage',
      '-colorspace', 'Gray', '-depth', '8', 'txt:-'], { encoding: 'utf8', maxBuffer: 1 << 24 });
    const px = new Map();
    for (const line of out.split('\n')) {
      const m = line.match(/^(\d+),(\d+):.*?\((\d+)/);
      if (m) px.set(m[1] + ',' + m[2], +m[3]);
    }
    let tot = 0, n = 0;
    for (const [k, v] of px) {
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const q = px.get((x + dx) + ',' + (y + dy));
        if (q !== undefined) { tot += Math.abs(v - q); n++; }
      }
    }
    return tot / n;
  };
  const bytes = fs.statSync(file).size;
  assert.ok(bytes > 400000, `lossless keeps the detail - file is ${Math.round(bytes / 1024)}KB`);
  const sharp = energy(file);
  assert.ok(sharp > 8.5, `the label band is crisp, scored ${sharp.toFixed(2)} (a re-encoded copy scores under 8.5)`);
});

t('nothing on page 5 is a raster of text any more', () => {
  /* The whole reason for the rebuild: softness was baked in. Anything that carries
     a label, a number, an arrow or a badge is markup now, and the only rasters left
     are the seven equipment photos, which are pictures by nature. */
  const flowRaw = js.slice(js.indexOf('function flowDiagram('), js.indexOf('function solution('));
  const photos = [...flowRaw.matchAll(/flow-[a-z]+\.webp/g)].map((m) => m[0]);
  const allowed = ['flow-panel.webp', 'flow-db.webp', 'flow-inverter.webp',
    'flow-house.webp', 'flow-meter.webp', 'flow-tower.webp'];
  for (const p of new Set(photos)) {
    assert.ok(allowed.includes(p), `${p} is equipment art, not a diagram of text`);
  }
  assert.doesNotMatch(js, /system-overview-flow/, 'the baked diagram is no longer referenced');
  /* and the labels are real text, on the page, in the page's own font */
  assert.match(js, /'<b>' \+ esc\(n\.t\) \+ '<\/b>'/, 'node titles are text');
  assert.match(js, /'<small>' \+ esc\(n\.d\)/, 'node values are text');
  assert.match(css, /\.pv2 \.pv2-node b\{font:700 /, 'and they are set in the page font');
});

t('two nodes that share a class are still counted twice', () => {
  /* The row overflowed and the grid node fell off the sheet because the width
     arithmetic counted CSS rules instead of nodes - DCDB and ACDB both use
     .is-box, so a rule-count found six nodes where the markup emits seven. This
     pins the real count. */
  const flowRaw = js.slice(js.indexOf('function flowDiagram('), js.indexOf('function solution('));
  const classes = [...flowRaw.matchAll(/cls: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(classes.length, 7, 'seven nodes are emitted');
  assert.equal(classes.filter((c) => c === 'is-box').length, 2,
    'two of them share .is-box - the case that broke the arithmetic');
  const widths = {};
  for (const m of css.matchAll(/\.pv2 \.pv2-node\.(is-\w+)\{width:(\d+)px;\}/g)) widths[m[1]] = Number(m[2]);
  const nodeTotal = classes.reduce((n, c) => n + widths[c], 0);
  const link = Number(css.match(/\.pv2 \.pv2-arrow\{flex:0 0 (\d+)px/)[1]);
  assert.equal(nodeTotal + link * (classes.length - 1), 718,
    'the row fills the column exactly, with the repeated class counted twice');
});

t('the link shapes are the ones that were verified on screen', () => {
  /* Both were wrong first time and had to be looked at: the chevrons came out as
     one solid wedge with no notch, and the block pair had its two heads facing
     inwards, which read as arrows colliding. These are the path data that
     rendered correctly, so the shapes cannot silently drift. */
  assert.match(js, /viewBox="0 0 22 18"/, 'the chevron pair uses the 22-wide box');
  assert.match(js, /L' \+ \(ox \+ 3\.68\) \+ ' 9 Z/, 'and keeps its notch');
  assert.match(js, /viewBox="0 0 24 18"/, 'the block pair uses the 24-wide box');
  /* green head on the left pointing left, navy head on the right pointing right */
  assert.match(js, /M0\.93 9 L7 3/, 'the green head starts at the left edge');
  assert.match(js, /M22\.4 9 L16\.33 3/, 'the navy head points out to the right');
  assert.doesNotMatch(js, /M12 9 L6 3[^}]*TONE\.bi/, 'the inward-facing version is gone');
});

t('the overview box adds no frame of its own around that render', () => {
  const box = css.match(/\.pv2-solution \.pv2-ov-box\{([^}]*)\}/)[1];
  assert.match(box, /border:0/, 'the render already has its rounded frame');
  assert.match(box, /padding:0/, 'and its own internal spacing');
  assert.match(css, /\.pv2-solution \.pv2-ov-art\{display:block;width:100%/,
    'the render fills the page width, so its own type stays legible');
});

/* ------------------------------- page 6 cards: number OR icon, not both */
t('the card head carries the number instead of a number and an icon', () => {
  assert.match(js, /<span class="pv2-num">' \+ String\(i \+ 1\)\.padStart\(2, '0'\)/,
    'the ordinal is still emitted');
  assert.doesNotMatch(js, /pv2-hic/, 'the icon circle is gone from the head');
  assert.doesNotMatch(js, /HEAD_ICON/, 'and so is its lookup table');
  /* The number is quiet set type, not a filled orange tile. */
  const num = css.match(/\.pv2-tech \.pv2-num\{([^}]*)\}/)[1];
  assert.match(num, /background:none/, 'no filled tile');
  assert.match(num, /color:#9AA5B4/, 'a muted ink instead of white-on-orange');
});

t('the right-hand column is the one that carries the weight', () => {
  const v = css.match(/\.pv2-tech \.pv2-v\{([^}]*)\}/)[1];
  assert.match(v, /font-weight:600/, 'the value is bold - he could not read it before');
  assert.match(v, /color:#16202C/, 'and darker than the label');
  /* The key column keeps its 600; the value must now match or beat it. */
  const k = css.match(/\.pv2-tech \.pv2-k\{([^}]*)\}/)[1];
  assert.match(k, /font:600 /, 'the key cell has not been lightened below the value');
});

/* --------------------- page 6 note: the owner's reference shape, compact */
t('the note is a single compact pill, not a fifth specification row', () => {
  const block = [...css.matchAll(/#pageTechSpec\.pv2 \.pg-body > \.note-box\{([\s\S]*?)\}/g)].pop()[1];
  /* He sent the target: one short rounded pill with a flag, a divider and a folded
     corner. The 41%/59% grid that made it a grid row is gone. */
  assert.match(block, /border-radius:999px/, 'a pill, not a table row');
  assert.doesNotMatch(block, /grid-template-columns:41% 59%/, 'it no longer copies the card columns');
  assert.match(block, /grid-template-columns:auto minmax\(0,1fr\)/, 'flag, then the sentence');
  assert.match(block, /padding:3px 24px 3px 4px/, 'and it is short - it is a footnote');
});

t('the note keeps the reference details: flag, divider, drawn corner, icon', () => {
  /* The pale-blue flag carrying the icon and the caps word. */
  assert.match(css, /#v_tsNoteLabel\{[^}]*background:#DCE7F5/, 'the flag is pale blue');
  assert.match(css, /#v_tsNoteLabel\{[^}]*text-transform:uppercase/, 'and the word is set in caps');
  assert.match(css, /#v_tsNoteLabel::after\{[^}]*data:image\/svg\+xml/, 'the icon is drawn, not a glyph');
  /* An orange divider between the flag and the sentence. */
  assert.match(css, /#v_tsNote\{[^}]*border-left:1px solid #F2811D/, 'orange divider');
  /* The folded corner. */
  assert.match(css, /#pageTechSpec\.pv2 \.pg-body > \.note-box::after\{[^}]*linear-gradient\(135deg/,
    'the corner is folded, in orange');
  /* The old round info dot must not come back. */
  const before = [...css.matchAll(/#pageTechSpec\.pv2 \.pg-body > \.note-box::before\{([^}]*)\}/g)].pop()[1];
  assert.match(before, /content:none/, 'the circular info dot stays off');
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
  /* 46px body padding - 34px footer - 8px clearance = 4px. The clearance is the
     whole point: the other pages' band is a 42px box with 26px icons centred in
     it, so their icons always sit 8px clear of the rule. Flush looked pinned. */
  assert.match(decl, /margin-bottom:-4px/,
    'and leaves 8px between the icons and the rule, as the other pages do');
  assert.doesNotMatch(decl, /margin-bottom:-12px/, 'flush is what he rejected');
  /* and it must outrank the tighten steps that set an explicit 11px top margin */
  const guards = [...css.matchAll(/\.[^{}]*pv2-values-wrap[^{}]*\{[^}]*margin-top:auto[^}]*\}/g)].pop()[0];
  assert.match(guards, /\.pv2-solution\.pv2-fit-2 \.pv2-values-wrap/,
    'the tight step is re-declared too, or its 11px would win');
});

t('the value row has a definite height, so its clearance is predictable', () => {
  assert.match(css, /\.pv2 \.pv2-values\{[^}]*min-height:26px/, 'one icon tall, like the other pages');
  /* Derive the clearance the same way the browser does, so the number cannot
     drift away from the reason it exists. */
  const pad = 46, foot = 34, mb = -4;
  assert.equal(pad + mb - foot, 8, 'icons clear the rule by exactly the 8px the other pages show');
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
  /* The badge is gone entirely: card 04 has no manufacturer, and the IS / IEC
     badge was read as noise on a card that already states its own name. */
  assert.match(js, /if \(kind === 'design'\) return '';/, 'the design card carries no badge');
  assert.doesNotMatch(js, /Standards &amp; codes/, 'the badge copy is gone');
  assert.doesNotMatch(js, /Lightning &amp; earthing/, 'and so is the one before it');
});

/* --------------------------------------- page 5 overview got its room back */
t('the node artwork has one height, so the equipment sits on one line', () => {
  assert.match(css, /\.pv2 \.pv2-node-art\{height:86px/,
    'one art height for every node - the images line up on a single baseline');
  /* the arrow is the thing that used to drift; it is anchored to that same line */
  /* Nodes and links share one flex row, and their widths are chosen so the seven
     nodes plus six links add up to the column. Positioning the links absolutely
     put them on top of the equipment, which is what broke the diagram; a fixed
     width per item cannot do that. */
  assert.match(css, /\.pv2 \.pv2-flow-row\{display:flex/, 'nodes and links are one row');
  assert.match(css, /\.pv2 \.pv2-arrow\{flex:0 0 \d+px/, 'each link owns a fixed slot');
  assert.doesNotMatch(css, /\.pv2 \.pv2-arrow\{position:absolute/, 'links are not absolutely placed');
  assert.doesNotMatch(js, /style="left:/, 'and nothing is hand-positioned in the markup');

  /* The widths have to add up, or the last node overflows the sheet. They are
     summed over the nodes the markup actually emits, NOT over the CSS rules -
     DCDB and ACDB share .is-box, so counting rules undercounted the row by a whole
     node and the grid fell off the right edge. */
  const widths = {};
  for (const m of css.matchAll(/\.pv2 \.pv2-node\.(is-\w+)(?:,#?[^{]*)?\{width:(\d+)px;\}/g)) {
    widths[m[1]] = Number(m[2]);
  }
  const flowRaw = js.slice(js.indexOf('function flowDiagram('), js.indexOf('function solution('));
  const classes = [...flowRaw.matchAll(/cls: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(classes.length, 7, 'the diagram has seven nodes');
  const nodeTotal = classes.reduce((sum, c) => {
    const w = widths[c];
    assert.ok(w, `every node class has a width - ${c} does not`);
    return sum + w;
  }, 0);
  const links = Number(css.match(/\.pv2 \.pv2-arrow\{flex:0 0 (\d+)px/)[1]) * (classes.length - 1);
  /* they should fill the column - a gap here means the equipment is bunched on
     the left with dead space beside it */
  assert.equal(nodeTotal + links, 718,
    `nodes + links must fill the 718px column exactly, got ${nodeTotal + links}px`);
});

t('the note gets more air than the blocks above it', () => {
  /* The row no longer joins this rhythm: it is pulled onto the footer rule, so
     it carries an explicit gap only as a floor and then `auto` overrides it.
     These two are the pair that sits in the flow together. */
  const gap = (sel) => {
    const m = css.match(new RegExp('\\.pv2-solution ' + sel + '\\{margin-top:(\\d+)px;\\}'));
    return m ? Number(m[1]) : NaN;
  };
  const overview = gap('\\.pv2-overview');
  const note = gap('#v_soScopeNote');
  assert.ok(!Number.isNaN(overview) && !Number.isNaN(note), 'both declare a gap');
  /* He asked for a real gap in all of them, and the note is the one that reads as
     cramped when it crowds the diagram above it. */
  assert.ok(note >= overview + 4, `the note stands clear, got ${note} vs ${overview}px`);
  assert.ok(note >= 20, `the note has real air above it, got ${note}px`);
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
