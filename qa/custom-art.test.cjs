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

check('the owner can drag the crop and zoom it before saving',
  /pointerdown/.test(customArt) && /offsetX/.test(customArt) && /customArtCropZoom/.test(customArt));

check('"fit without cropping" is offered as an alternative to a crop',
  /customArtCropFit/.test(customArt) && /mode = e\.target\.checked \? 'fit' : 'cover'/.test(customArt));

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

/* ------------------------------------------------------------- 6. persistence */

check('artwork rides the page-image map, which is already saved with every proposal',
  /root\.__qsPageImages\[zoneKey\]/.test(customArt) &&
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
  /zone\.dataset\.wired/.test(customArt) && /panel\.dataset\.wired/.test(customArt));

/* ------------------------------------------------------------- 8. the guard */

check('the new module is allowed by name only - no assets/js wildcard was opened',
  /custom-art/.test(guard) &&
  /assets\\\/js\\\/\(app\|charts\|content\|proposal-values\|equipment\|equipment-calc\|custom-art/.test(guard));

check('the stylesheet went into an already-allowed file instead of widening the guard for a new one',
  /\.custom-art\{/.test(css) && /\.custom-art-crop\{/.test(css));

console.log('\n==== ' + pass + ' passed, ' + fail + ' failed ====');
process.exit(fail ? 1 : 0);
