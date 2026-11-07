/* ==========================================================================
   PDF fidelity - the downloaded file must show what the page shows.

   The download is a raster capture of the proposal (html2canvas → JPEG →
   jsPDF), so every shape on the page has to survive that capture. A customer
   PDF once printed with the small icons as specks, the closing page's arrows
   outside their pill and page 6's system diagram cut in half, because
   html2canvas paints an inline <svg> from its own serialisation - without the
   page's stylesheet - at the SVG's intrinsic size, cropped by its CSS box.

   These checks pin the cure so it cannot be dropped by a later edit:
     · every SVG is painted into an <img> at the box the reader sees
     · every canvas (chart, QR) is likewise pinned to its column
     · a shape that fails to load is put back, never left as a hole
     · the capture runs at print resolution (3× ≈ 288 dpi on A4)
     · the legacy document-studio exporter uses the same pass

   Run: node qa/pdf-fidelity.test.js
   ========================================================================== */
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const EXPORT = read('assets/js/export.js');
const STUDIO = read('assets/js/document-studio.js');
const PAGE = read('quotation.html');

let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.error('  ✗ FAIL:', name, '→', e.message); }
};

/* the rungs the capture loop walks, in source order */
const captureLoop = (() => {
  const start = EXPORT.indexOf('for(let i=0;i<pages.length;i++)');
  assert.ok(start > 0, 'the capture loop is present');
  return EXPORT.slice(start, EXPORT.indexOf('const cust=', start));
})();

check('the browser draws the page, html2canvas is only the fallback', () => {
  const fn = EXPORT.slice(EXPORT.indexOf('async function capturePage'), EXPORT.indexOf('async function exportPdf'));
  assert.ok(/root\.html2canvas===vendorCapture/.test(fn), 'a host-supplied capture keeps control');
  assert.ok(/nativeCapture\(page,scale\)/.test(fn), 'otherwise the browser renders the page itself');
  assert.ok(fn.indexOf('nativeCapture(page,scale)') < fn.indexOf('await paintShapes(page)'),
    'the old shape pass runs only when the native render failed');
  assert.ok(/root\.html2canvas\(page,html2canvasOptions\(scale\)\)/.test(fn), 'and the fallback is still wired');
  assert.ok(/trimClone\(doc\)/.test(EXPORT), 'the fallback still trims its clone');
});

check('the capture is made at print resolution, not screen resolution', () => {
  const scale = Number((EXPORT.match(/PDF_SCALE=(\d+)/) || [])[1]);
  assert.ok(Number.isFinite(scale), 'PDF_SCALE is declared');
  assert.ok(scale >= 3, `capture scale is ${scale}: A4 at 3x is ~288 dpi, screen 1x is not printable`);
  const quality = Number((EXPORT.match(/PDF_QUALITY=([\d.]+)/) || [])[1]);
  assert.ok(quality >= 0.9, `Ultra page quality is ${quality}: the print mode must not give anything away`);
  assert.ok(/canvas\.width=Math\.round\(width\*scale\); canvas\.height=Math\.round\(height\*scale\)/.test(EXPORT),
    'the native render rasterises the page at the print scale, not at screen size');
  assert.ok(/const scale=options\.scale\|\|PDF_SCALE/.test(EXPORT), 'the loop drives the scale from one constant');
  assert.ok(!/pdfQuality/.test(EXPORT) && !/pdfQuality/.test(PAGE), 'and offers the reader no thinner choice');
  assert.ok(/toDataURL\('image\/jpeg',quality\)/.test(EXPORT), 'the capture encodes with the chosen quality');
});

check('the page is handed to the browser with its own stylesheets and pictures', () => {
  const fn = EXPORT.slice(EXPORT.indexOf('async function inlinedCss'), EXPORT.indexOf('const html2canvasOptions'));
  assert.ok(/foreignObject/.test(fn), 'the page travels inside an SVG foreignObject');
  assert.ok(/data:image\/svg\+xml;base64,/.test(fn), 'so the browser rasterises it with its own layout engine');
  assert.ok(/document\.styleSheets/.test(fn) && /matchAll\(\/url/.test(fn), 'every stylesheet is inlined, fonts and artwork included');
  assert.ok(!/qs-pdf-capture/.test(fn), 'no print-only override changes how the page is drawn');
  assert.ok(/querySelectorAll\('canvas'\)/.test(fn) && /toDataURL\('image\/png'\)/.test(EXPORT),
    'a chart carries its pixels');
  assert.ok(!/querySelectorAll\('svg'\)/.test(fn), 'a drawing stays vector - it is markup the browser can draw');
});

check('every asset is fetched once for the whole export', () => {
  const fn = EXPORT.slice(EXPORT.indexOf('async function inlineAsset'), EXPORT.indexOf('async function inlinedCss'));
  assert.ok(/assetCache\.has\(url\)/.test(fn), 'a fetched asset is remembered');
  assert.ok(/\/\^data:\/i\.test\(uri\)/.test(fn), 'an inline picture is not fetched at all');
  assert.ok(/credentials:'same-origin'/.test(fn), 'the export never reaches outside the app');
});

check('an inline SVG is painted at the box the reader sees', () => {
  const fn = EXPORT.slice(EXPORT.indexOf('function shapeUrl'), EXPORT.indexOf('function columnWidth'));
  assert.ok(/cloneNode\(true\)/.test(fn), 'the drawing is cloned rather than moved');
  assert.ok(/\/\<svg\[\^>\]\*\\sxmlns=\/\.test\(markup\)/.test(fn) &&
    /markup=markup\.replace\('\<svg','\<svg xmlns=/.test(fn),
    'the serialised drawing carries exactly one namespace declaration, or the image never loads');
  assert.ok(/setAttribute\('width',String\(box\.width\)\)/.test(fn) &&
    /setAttribute\('height',String\(box\.height\)\)/.test(fn),
    'the drawing is serialised at the measured box, which is what html2canvas was getting wrong');
  assert.ok(/setAttribute\('viewBox'/.test(fn), 'a drawing without a viewBox still scales');
  assert.ok(/image\/svg\+xml/.test(fn), 'the replacement is a vector image, so it stays sharp');
});

check('a chart or QR canvas cannot print wider than its column', () => {
  assert.ok(/toDataURL\('image\/png'\)/.test(EXPORT), 'canvas pixels are taken as a lossless image');
  const swap = EXPORT.slice(EXPORT.indexOf('function swapIn'), EXPORT.indexOf('function decoded'));
  assert.ok(/columnWidth\(el,box\.width\)/.test(swap), 'the replacement is clamped to its column');
  assert.ok(/Math\.round\(box\.height\*width\/box\.width\)/.test(swap), 'clamping keeps the aspect ratio');
  assert.ok(/maxWidth='100%'/.test(swap), 'and CSS cannot stretch it past the column either');
});

check('a cover-cropped photo prints the crop, not a squashed stretch', () => {
  const fn = EXPORT.slice(EXPORT.indexOf('function refitImage'), EXPORT.indexOf('async function paintShapes'));
  assert.ok(/objectFit/.test(fn), 'the image element\'s own object-fit is read');
  assert.ok(/fit!=='cover'&&fit!=='contain'/.test(fn), 'only cropped/fitted photos are repainted');
  assert.ok(/Math\.abs\(target-source\)<0\.01/.test(fn), 'a photo that already matches its box is left alone');
  assert.ok(/sw=nh\*target/.test(fn) && /sh=nw\/target/.test(fn), 'cover crops the overflow the way the browser does');
  assert.ok(/canvas\.width=box\.width; canvas\.height=box\.height/.test(fn), 'the crop is painted at the box size');
  assert.ok(/toDataURL\('image\/png'\):canvas\.toDataURL\('image\/jpeg'/.test(fn),
    'thumbnails stay lossless while a full-bleed photo is re-encoded');
  const paint = EXPORT.slice(EXPORT.indexOf('async function paintShapes'), EXPORT.indexOf('async function exportPdf'));
  assert.ok(paint.indexOf("querySelectorAll('img')") < paint.indexOf("querySelectorAll('svg')"),
    'photos are refitted before the drawings become images, so nothing is processed twice');
});

check('a shape that fails to load is put back, never printed as a hole', () => {
  assert.ok(/img\.replaceWith\(original\)/.test(EXPORT), 'the original element is restored on failure');
  assert.ok(/img\.naturalWidth/.test(EXPORT), 'a decoded image is required before it is trusted');
  assert.ok(/setTimeout\(done,4000\)/.test(EXPORT), 'a source that never settles cannot hang the download');
});

check('the editable-document exporter uses the same pass', () => {
  assert.ok(/root\.Exporter\?\.capturePage/.test(STUDIO), 'document-studio captures with the same renderer');
  assert.ok(/capturePage\(page,3\)/.test(STUDIO), 'at the same print scale');
  assert.ok(!/html2canvas\(page,\{scale:2/.test(STUDIO), 'and not at scale 2');
});

check('browsers pick up the new exporter instead of a cached one', () => {
  assert.ok(/assets\/js\/export\.js\?v=vivid-pdf1/.test(PAGE), 'export.js cache key is bumped');
  assert.ok(/assets\/js\/document-studio\.js\?v=vivid-doc1/.test(PAGE), 'document-studio.js cache key is bumped');
});

check('the capture clone drops the live pages instead of repainting them', () => {
  const fn = EXPORT.slice(EXPORT.indexOf('function trimClone'), EXPORT.indexOf('const PDF_SCALE'));
  assert.ok(/querySelector\('\.pdf-snapshot'\)/.test(fn), 'the snapshot that holds the page being painted is located');
  assert.ok(/spare=el=>!keep\|\|!keep\.contains\(el\)/.test(fn), 'nothing inside it is ever removed');
  assert.ok(/page-wrap/.test(fn) && /\[data-builder-only\]/.test(fn), 'the live pages and builder chrome are dropped');
  assert.ok(/onclone:doc=>\{doc\.body\.classList\.add\('qs-pdf-capture'\);trimClone\(doc\);\}/.test(EXPORT),
    'the fallback capture runs the trim before painting');
});

check('the live pages stay mounted while a page is captured', () => {
  assert.ok(!/stage\.appendChild\(el\)/.test(captureLoop), 'no page is reparented mid-export');
  assert.ok(!/bench\.remove\(\)/.test(EXPORT), 'and the snapshot bench stays where the styles expect it');
});

check('the time is attributed, not just totalled', () => {
  assert.ok(/perPage\.push\(\{id:el\.id\|\|\('page'\+\(i\+1\)\),renderer:captured\.renderer,render:/.test(EXPORT),
    'every page reports its own render and encode cost');
  assert.ok(/renderer:perPage\[0\]\?\.renderer\|\|'html2canvas'/.test(EXPORT), 'and which renderer drew it');
  assert.ok(/encode:Math\.round\(encodeTotal\)/.test(EXPORT), 'the encode total reaches Exporter.stats');
});

check('the export reports its own time and weight', () => {
  assert.ok(/root\.Exporter\.stats=stats/.test(EXPORT), 'stats are published for the builder and QA');
  assert.ok(/ms:Math\.round\(clock\(\)-started\)/.test(EXPORT) && /bytes/.test(EXPORT), 'both render time and page bytes are measured');
  assert.ok(/\[PDF\] '\+stats\.pages/.test(EXPORT), 'and logged so a slow download can be diagnosed');
});

check('the trim never removes the page being captured', () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(`<body>
    <main><div class="page-wrap"><section class="page" id="pageCover"></section></div>
      <button data-builder-only id="chrome">x</button><dialog id="dlg"></dialog></main>
    <div class="pdf-snapshot"><section class="page" id="pageTechSpec">
      <span data-builder-only id="inner">kept</span></section></div>
  </body>`, { runScripts: 'outside-only' });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(ROOT, 'assets/js/export.js'), 'utf8'));
  w.Exporter.trimClone(w.document);
  const doc = w.document;
  assert.equal(doc.querySelector('.page-wrap'), null, 'the live copy of the pages is gone');
  assert.equal(doc.getElementById('chrome'), null, 'and so is the builder chrome');
  assert.equal(doc.getElementById('dlg'), null, 'and the dialogs');
  assert.ok(doc.querySelector('.pdf-snapshot #pageTechSpec'), 'the page being painted survives');
  assert.ok(doc.getElementById('inner'), 'including anything the builder hides inside it');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
