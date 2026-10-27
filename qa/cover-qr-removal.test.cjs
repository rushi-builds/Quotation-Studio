/* Cover-only QR removal: links and later-page QR codes must survive.
   Run against a local fixture server: QA_BASE=http://127.0.0.1:8080 node qa/cover-qr-removal.test.cjs */
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const jsQR = require('jsqr');

(async () => {
  const { default: bundle } = await import('@sparticuz/chromium');
  const browser = await chromium.launch({ executablePath: await bundle.executablePath(), args: bundle.args.filter(a => a !== '--single-process'), headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
    const customerUrl = 'https://example.com/portal.html?t=abababababababababababababababababababababababab';
    const galleryUrl = 'https://example.com/projects';
    const cleanCover = async view => {
      assert.equal(await view.locator('#coverQrWrap, #qrCover, #pageCover .cover-qr, #pageCover canvas').count(), 0, 'no cover QR, including hidden/exportable markup');
      assert.equal(await view.locator('#coverArtwork').count(), 1, 'original cover artwork is retained');
    };
    await page.goto(base + '/quotation.html');
    await page.waitForFunction(() => !!window.Render?.lastState);
    await page.evaluate(() => document.fonts.ready);
    await cleanCover(page);

    // Saved/auto-filled URLs and category changes must never restore the QR.
    for (const category of ['residential', 'commercial', 'industrial', 'rwa']) {
      await page.evaluate(({ category, customerUrl, galleryUrl }) => {
        StateStore.applyForm({ custName: 'Cover QA', customerType: category, shareUrl: customerUrl, galleryUrl });
        Render.renderAll();
      }, { category, customerUrl, galleryUrl });
      await cleanCover(page);
      assert.equal(await page.evaluate(() => Render.lastState.shareUrl), customerUrl);
    }
    await page.evaluate(() => {
      StateStore.applyForm({ customerType: 'residential' });
      Render.renderAll();
      window.__qsSaveNow();
    });
    await page.reload();
    await page.waitForFunction(url => window.Render?.lastState?.shareUrl === url, customerUrl);
    await cleanCover(page);

    // Decode real later-page QR pixels, not merely check that a canvas exists.
    await page.evaluate(async () => {
      let pending;
      do { pending = Experience.whenReady(); await pending; } while (pending !== Experience.whenReady());
    });
    for (const selector of ['#projectsPortfolio canvas', '#closingGallery canvas']) {
      const image = await page.locator(selector).evaluate(canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
        return { width: canvas.width, height: canvas.height, data: Array.from(pixels.data) };
      });
      assert.equal(jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data, galleryUrl);
    }
    assert.equal(await page.evaluate(() => Render.requestFormUrl()), customerUrl + '#proposalFeedback', 'published feedback destination survives cover QR removal');

    await page.emulateMedia({ media: 'print' });
    await cleanCover(page);
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 });
    await cleanCover(page);

    // Exercise the actual detailed export snapshot, mocking only raster/PDF IO.
    const exported = await page.evaluate(async () => {
      const NativePDF = jspdf.jsPDF, capture = html2canvas, pages = [];
      jspdf.jsPDF = class {
        constructor() { this.internal = { pageSize: { getWidth: () => 595, getHeight: () => 842 } }; }
        addPage() {} addImage() {} link() {} setProperties() {} save() {}
      };
      window.html2canvas = async element => {
        pages.push({ id: element.id, qr: !!element.querySelector('#qrCover, .cover-qr, #coverQrWrap') });
        return { toDataURL: () => '' };
      };
      try { await Exporter.exportPdf(() => {}, { format: 'full' }); return { pages, clean: !document.querySelector('.pdf-snapshot') }; }
      finally { jspdf.jsPDF = NativePDF; window.html2canvas = capture; }
    });
    assert.deepEqual(exported.pages[0], { id: 'pageCover', qr: false });
    assert.ok(exported.pages.length >= 15);
    assert.equal(exported.clean, true);

    const id = await page.evaluate(() => Proposals.activeId());
    const shared = await context.newPage();
    shared.on('pageerror', error => errors.push(error.message));
    await shared.goto(base + '/share.html?p=' + encodeURIComponent(id));
    await shared.waitForFunction(() => !!window.Render?.lastState);
    await cleanCover(shared);
    assert.equal(await shared.evaluate(() => Render.lastState.shareUrl), customerUrl);
    assert.deepEqual(errors, []);
    console.log('PASS: cover QR absent for all 4 categories, saved URL/reload, print, mobile, detailed export snapshot and Customer View; portfolio/contact QR codes decode correctly and customer request link is preserved.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
