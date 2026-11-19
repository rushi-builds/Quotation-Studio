/* Custom equipment artwork - the contract for a make the brand sheet does not carry.

   The owner asked for exactly this: choose "Custom…" for module make or inverter
   make, and then be able to give the app the pictures instead of typing a name
   and living with a text-only badge and a generic product photo.

   Two pictures with opposite jobs, so two separate zones rather than one:
     - a module needs only its LOGO;
     - an inverter needs its LOGO and, separately, a PHOTO of the product.
   The app crops; the owner never has to pre-crop. A logo is trimmed and fitted and
   is never cut. A photo is cropped to the tile and the crop is theirs to choose.

   These checks pin the parts that can break silently:
     1. the zones exist in the document at all;
     2. they exist only while the make is actually custom;
     3. a stored logo/photo reaches the page-6 card;
     4. a make the brand sheet already carries keeps its own artwork;
     5. a document with no artwork renders exactly as it does today;
     6. the saved proposal carries the artwork back into the input panel.

   Geometry and canvas work need a real browser, so they stay in the Chromium
   suites. This file reads the shipped strings and the real DOM contract.

   Run: node custom-art.test.cjs
*/
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' → ' + detail : '')); }
}

const html = read('quotation.html');
const customArt = read('assets/js/custom-art.js');
const pv2 = read('assets/js/proposal-v2.js');
const app = read('assets/js/app.js');
const eq = read('assets/js/equipment.js');
const css = read('assets/css/app.css');
const pv2css = read('assets/css/proposal-v2.css');
const guard = read('qa/pr-scope-guard.cjs');
const expCss = read('assets/css/experience.css');
const experience = read('assets/js/experience.js');

console.log('\nCustom equipment artwork\n');

/* ---------------------------------------------------------------- 1. zones */

check('the module zone exists and asks for a logo',
  /id="customArtModuleLogo"[\s\S]{0,400}module logo/i.test(html));

check('the inverter zone asks for BOTH pictures, in two separate zones',
  /id="customArtInverterLogo"/.test(html) &&
  /id="customArtInverterPhoto"/.test(html) &&
  /* Two zones, not one: an inverter logo is a transparent mark, the photo is a
     product shot. One zone could not do both jobs. */
  html.indexOf('id="customArtInverterLogo"') < html.indexOf('id="customArtInverterPhoto"'));

check('a module is never asked for a product photo (it has no tile of its own)',
  !/id="customArtModulePhoto"/.test(html));

check('each zone lives inside the existing custom-make wrapper, so it appears exactly when "Custom…" is chosen',
  /id="moduleMakeCustomWrap"[\s\S]*?id="customArtModuleLogo"/.test(html) &&
  /id="inverterMakeCustomWrap"[\s\S]*?id="customArtInverterLogo"/.test(html));

check('all three zones live inside a data-equipment-custom wrapper, so collectForm() never scrapes them into a text field',
  /* collectForm() skips any element carrying data-equipment-custom, and the zones
     are nested inside those wrappers - which is exactly why the artwork is stored
     on the page-image map instead of being read back out of the form. */
  (html.match(/id="customArt(ModuleLogo|InverterLogo|InverterPhoto)"/g) || []).length === 3 &&
  /id="moduleMakeCustomWrap" class="equipment-custom" data-equipment-custom/.test(html) &&
  /id="inverterMakeCustomWrap" class="equipment-custom" data-equipment-custom/.test(html));

/* ------------------------------------------------------- 2. all three inputs */

check('drop, browse and paste are each offered (the owner asked for all three)',
  /addEventListener\('drop'/.test(customArt) &&
  /input\?\.click\(\)/.test(customArt) &&
  /addEventListener\('paste'/.test(customArt));

check('paste only fires for the zone the owner last touched, so Ctrl+V elsewhere is not hijacked',
  /__pasteZone/.test(customArt) && /zone\.addEventListener\('focusin'/.test(customArt));

check('a file over 5 MB is refused with a sentence, not a stack trace',
  /5 \* 1024 \* 1024/.test(customArt) && /Please use one under 5 MB/.test(customArt));

check('only image types are accepted, including SVG for a supplied logo',
  /image\/png,image\/webp,image\/jpeg,image\/svg\+xml/.test(html));

/* --------------------------------------------------------- 3. logo cropping */

check('a logo is trimmed of its empty margin before it is fitted',
  /function isMargin/.test(customArt) && /minX/.test(customArt) && /maxX/.test(customArt));

check('a logo is fitted inside the real badge box (30px tall, 132px wide from proposal-v2.css:244)',
  /boxH: 30, boxW: 132/.test(customArt) &&
  /height:30px;max-width:132px/.test(pv2css));

check('a logo is never cropped - it is scaled to fit both constraints',
  /Math\.min\(boxW \/ cw, boxH \/ ch/.test(customArt));

check('a logo keeps its transparency (WebP/PNG, never JPEG)',
  /toDataURL\('image\/webp'/.test(customArt) && !/logoFrom[\s\S]{0,4000}image\/jpeg/.test(customArt));

/* -------------------------------------------------------- 4. photo cropping */

check('a photo is cropped to the tile shape it will print in',
  /aspect: 1\.45/.test(customArt) && /frameH = Math\.round\(frameW \/ PHOTO\.aspect\)/.test(customArt));

/* The owner was explicit: no dragging, no zooming, no confirming. The app applies
   the crop and the picture is done. */
check('the photo is cropped and stored in one step - no panel, no confirm, no slider',
  /function cropPlan/.test(customArt) &&
  /function photoFrom/.test(customArt) &&
  /* Nothing interactive survives anywhere in the file. */
  !/pointerdown|onpointermove|addEventListener\('input'/.test(customArt));

check('REGRESSION: the crop controls the owner rejected are gone from the markup too',
  !/customArtCrop/.test(html) && !/custom-art-zoom/.test(css) && !/custom-art-crop/.test(css));

check('a cover crop that would eat more than half the picture falls back to fit, so the product is never sliced',
  /CROP_KEEP = 0\.5/.test(customArt) && /kept >= CROP_KEEP \? 'cover' : 'fit'/.test(customArt));

check('the automatic crop is centred, because the product sits in the middle of a studio frame',
  /offsetX: 0\.5, offsetY: 0\.5/.test(customArt));

check('a stored photo is capped so it can live in the proposal blob',
  /maxEdge: 1200/.test(customArt) && /budget: 400000/.test(customArt));

/* -------------------------------------------------- 5. page-6 card rendering */

check('a supplied logo reaches the card badge for a make the brand sheet does not carry',
  /customModuleLogo/.test(pv2) && /customInverterLogo/.test(pv2) &&
  /is-logo is-custom/.test(pv2));

check('a supplied photo reaches the inverter card',
  /customInverterPhoto/.test(pv2));

check('a make the brand sheet DOES carry keeps its own artwork - the owner picks Sungrow and still sees Sungrow',
  /const known = brand \? INVERTER_PHOTO\[slug\(brand\)\.split\('-'\)\[0\]\] : ''/.test(pv2) &&
  /kind === 'inverter' && !known/.test(pv2));

check('a supplied photo is not cut a second time by the tile',
  /isSupplied/.test(pv2) && /pv2-photo\.is-custom img\{object-fit:contain/.test(pv2css));

check('with no artwork uploaded, nothing changes - the existing markup path is untouched',
  /customArt\('customModuleLogo'\)/.test(pv2) &&
  /* The fallbacks are still exactly what they were before this feature. */
  /return '<div class="pv2-brand is-plain"><b>' \+ esc\(brand\) \+ '<\/b><\/div>';/.test(pv2) &&
  /return CARD_PHOTO\[kind\] \|\| IMG \+ 'equipment\/cards\/earthing-safety-3pit\.webp';/.test(pv2));

/* ---------------------------- 5b. page 3 IS page 6, not a lookalike of it */

/* The owner's requirement was never "the same cards" - it was "the same page".
   Copying the cards into a report wrapper left the running head, the title, the sub,
   the intro paragraph, the note box and the footer as the report's own, and that is
   the difference they kept seeing. The whole section travels now. */

check('the sheet is cloned whole, and page 3 draws no chrome of its own',
  /\$\('pageTechSpec'\)/.test(experience) &&
  /const copy=sheet\.cloneNode\(true\)/.test(experience) &&
  /copy\.classList\.add\('power-spec-sheet','pv2'\)/.test(experience) &&
  /* No kicker, title or foot in the page wrapper: the sheet brings them. */
  /page\(3,null,null,null,powerSpecSheet\(\),true\)/.test(experience));

check('REGRESSION: ids are made unique, never stripped - the sheet is styled by them',
  /* Stripping ids is what produced the raw specification table on page 3: the
     .v_tsTable{display:none} and .pv2-sheet layout rules stopped applying, so the
     table appeared beside the cards and the notes fell back to app.css defaults. */
  /node\.id='pw3-'\+node\.id/.test(experience) &&
  !/querySelectorAll\('\[id\]'\)\.forEach\(node=>node\.removeAttribute\('id'\)\)/.test(experience));

check('the sheet styles itself through classes, so a carried copy needs no unique ids',
  /\.pv2-sheet/.test(css) && /\.v_tsTable/.test(pv2css) &&
  /* Nothing may go back to depending on the ids the clone renames. */
  !/#v_ts[A-Za-z]/.test(css + pv2css) && !/#pageTechSpec/.test(css + pv2css));

check('page 3 is not padded twice, and does not inherit the report Arial',
  /#powerPage3\.is-carried\{[\s\S]{0,140}?padding:0;/.test(expCss) &&
  /#powerPage3\.is-carried\{[\s\S]{0,240}?font-family:'Inter'/.test(expCss));

check('the carried sheet is not a page inside a page - no shadow, no second transform',
  /#powerPage3 \.power-spec-sheet\{[\s\S]{0,220}?box-shadow:none/.test(expCss) &&
  /#powerPage3 \.power-spec-sheet\{[\s\S]{0,220}?transform:none/.test(expCss));

check('REGRESSION: nothing clips or scales page 3 to make it fit',
  /* A height bound cut the fourth card; a transform made the cards a different size
     from page 6. Both are gone. The browser suite compares page 3 to page 6 element
     by element and would fail either way; this stops them coming back quietly. */
  !/style\.overflow='hidden'/.test(experience.split('powerSpecSheet')[1]||'') &&
  !/\.style\.transform='scale/.test(experience));

check('page 3 records its own geometry, so an overrun is visible rather than hidden',
  /carried\.dataset\.specAvail=availW\+'x'\+availH;/.test(experience) &&
  /carried\.dataset\.specBlock=W\+'x'\+H;/.test(experience) &&
  /carried\.dataset\.specFits=\(W<=availW\+1&&H<=availH\+1\)\?'1':'0';/.test(experience));

/* ------------------------------------------------------------- 6. persistence */

/* REGRESSION: the store key and the read key must be the same string.
   This shipped broken once: the zones wrote `moduleLogo`, the card renderer read
   `customModuleLogo`, and `app.js` restored `customModuleLogo`. A logo was uploaded,
   trimmed and saved correctly - and never appeared on the card. Every source-string
   check still passed, because both names existed in the source, just not as the
   same name. That is why this check compares the two sides instead of looking for
   either one. */
{
  const writer = customArt;
  const reader = pv2;
  const restore = app;
  const stored = /const mapKey = \(zone\) => 'custom' \+ zone\[0\]\.toUpperCase\(\) \+ zone\.slice\(1\)/.test(writer);
  check('REGRESSION: the zone key is translated to the name the card reads (custom<Zone>)',
    stored &&
    /__qsPageImages\[mapKey\(zoneKey\)\]/.test(writer) &&
    /map\[mapKey\(spec\.zone\)\]/.test(writer));

  const reads = ['customModuleLogo', 'customInverterLogo', 'customInverterPhoto']
    .every((k) => reader.includes(k));
  check('REGRESSION: every key the renderer reads is one the uploader writes', reads);

  check('REGRESSION: the reopen path restores the same three keys the uploader writes',
    /custom\(ModuleLogo\|InverterLogo\|InverterPhoto\)/.test(restore));

  /* The short names must not reach the map: that is the bug itself. */
  check('REGRESSION: the bare zone name is never used as a map key',
    !/__qsPageImages\[zoneKey\]/.test(writer) && !/__qsPageImages\[spec\.zone\]/.test(writer));
}

check('artwork rides the page-image map, which is already saved with every proposal',
  /root\.__qsPageImages\[mapKey\(zoneKey\)\]/.test(customArt) &&
  /* saveActive(...) receives the page-image map as its last argument, so anything
     put in that map is persisted - the nested collectForm() call is why this is
     matched line-wise rather than with a single-argument regex. */
  /saveActive\([\s\S]{0,200}?__qsPageImages/.test(app));

check('artwork survives reopening a proposal, even though it is not a page element',
  /custom\(ModuleLogo\|InverterLogo\|InverterPhoto\)/.test(app));

check('only real image data URLs are restored from a saved proposal',
  /\^data:image\\\//.test(app));

/* ---------------------------------------------- 7. the zones appear only when custom */

check('the zones are wired when "Custom…" is chosen, not at boot for every visitor',
  /root\.CustomArt\) root\.CustomArt\.wire\(\)/.test(eq));

check('wiring is idempotent - a second call cannot double-bind a drop handler',
  /zone\.dataset\.wired/.test(customArt));

/* REGRESSION: `document.dataset` does not exist.
   Reading it throws TypeError: Cannot read properties of undefined. wire() runs
   from app.js at boot on every page, so one such line took the whole editor down
   and the browser suite collapsed from 19/25 to 1/25 - while every offline suite
   stayed green, because none of them execute this file. Pinned here so the
   pattern cannot come back. */
check('REGRESSION: the paste guard hangs off <html>, not document (document.dataset is undefined and throws)',
  /* Comments are stripped first: the fix's own comment names the broken
     expression, and a naive grep would fail on the explanation rather than on
     any real code. */
  !/document\.dataset/.test(customArt.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')) &&
  /document\.documentElement/.test(customArt));

check('REGRESSION: no boot-time code path can throw - every top-level dataset read has an element to read it from',
  /* wire() must survive being called with no zones present: the document studio
     and the share view have none, and both load app.js. */
  /function wire\(\) \{[\s\S]{0,120}ZONES\.forEach\(wireZone\)/.test(customArt));


/* ------------------------------------------------------------- 8. the guard */

check('the new module is allowed by name only - no assets/js wildcard was opened',
  /custom-art/.test(guard) &&
  /assets\\\/js\\\/\(app\|charts\|content\|proposal-values\|equipment\|equipment-calc\|custom-art/.test(guard));

/* The owner asked for a quiet plate: two words, not a paragraph, and no hatched
   placeholder block. Both are design decisions that a later "helpful" edit would
   undo by adding another line of instructions, so they are pinned. */
check('each drop plate says two words and stops - no paragraph of instructions',
  (html.match(/<div class="custom-art-empty"[^>]*>([\s\S]*?)<\/div>/g) || []).every((block) => {
    const text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.length <= 60;
  }));

check('REGRESSION: no placeholder art at all - not the hatched block, and not an empty outlined box either',
  /* An empty outlined box inside a dashed plate is two boxes saying nothing, and
     it reads as a second drop target. Both are gone; the tile's shape is shown on
     the chip after a file is dropped, where it means something. */
  !/repeating-linear-gradient/.test(css) && !/custom-art\.is-photo::after/.test(css));

check('each plate names its own target, so two plates never read the same',
  /<b>Drop module logo<\/b>/.test(html) &&
  /<b>Drop inverter logo<\/b>/.test(html) &&
  /<b>Drop inverter image<\/b>/.test(html));

check('the empty plate carries a drawn glyph rather than a bare box',
  /\.custom-art-empty::before\{/.test(css) && /data:image\/svg\+xml/.test(css));

check('the stylesheet went into an already-allowed file instead of widening the guard for a new one',
  /\.custom-art\{/.test(css) && /\.custom-art-status\{/.test(css));

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
