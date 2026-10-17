/* About-page imagery follows customer type; saved uploads retain priority. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
(async () => {
  const { default: bundle } = await import('@sparticuz/chromium');
  const browser = await chromium.launch({ executablePath: await bundle.executablePath(), args: bundle.args.filter(a => a !== '--single-process'), headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
    const sources = {
      residential: 'assets/images/about-residential-solar.jpg', commercial: 'assets/images/about-commercial-solar.jpg',
      industrial: 'assets/images/page-about.jpg', rwa: 'assets/images/about-rwa-solar.jpg'
    };
    const shots = path.join(__dirname, 'shots', 'about-category'); fs.mkdirSync(shots, { recursive: true });
    await page.goto(base + '/quotation.html');
    await page.waitForFunction(() => !!window.Render?.lastState);
    await page.evaluate(() => document.fonts.ready);
    const copy = await page.locator('#pageAbout .pg-body').textContent();
    async function check(view, expected) {
      await view.locator('#img_about').evaluate(img => img.decode());
      const image = await view.locator('#img_about').evaluate(img => ({
        src: img.getAttribute('src'), width: img.naturalWidth, visible: img.checkVisibility(),
        fit: getComputedStyle(img).objectFit, pageHeight: img.closest('.page').scrollHeight,
        fullFrame: img.closest('.page').classList.contains('about-full-photo'),
        ratioDifference: Math.abs(img.clientWidth / img.clientHeight - img.naturalWidth / img.naturalHeight),
        statsClear: img.closest('.photo-top').getBoundingClientRect().bottom + 10 <= document.getElementById('v_abStats').getBoundingClientRect().top
      }));
      assert.equal(image.src, expected); assert(image.width && image.visible && image.pageHeight <= 1124);
      const fullFrame = expected === sources.residential;
      assert.equal(image.fit, fullFrame ? 'contain' : 'cover');
      assert.equal(image.fullFrame, fullFrame, 'full framing only for automatic Residential artwork');
      if (fullFrame) {
        assert(image.ratioDifference < .01, 'complete portrait uses its native aspect ratio');
        assert(image.statsClear, 'full portrait stays clear of company statistics');
      }
      assert.equal(await view.locator('#pageAbout .pg-body').textContent(), copy, 'photo changes do not rewrite company copy');
    }
    async function snapshot(expected) {
      const printSrc = await page.locator('#img_about').getAttribute('data-print-src');
      const expectedPrint = printSrc || expected;
      const captured = await page.evaluate(async expected => {
        const real = html2canvas; let result;
        window.html2canvas = async () => {
          const image = document.querySelector('.pdf-snapshot #img_about');
          result = { src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight };
          // Inspect the real exporter snapshot, but do not create a mocked PDF.
          throw new Error('ABOUT_SNAPSHOT_CHECK');
        };
        try { await Exporter.exportPdf(() => {}, { format: 'full' }); throw new Error('Expected controlled capture stop'); }
        catch (error) { if (error.message !== 'ABOUT_SNAPSHOT_CHECK') throw error; }
        finally { window.html2canvas = real; }
        return { ...result, cleaned: !document.querySelector('.pdf-snapshot') };
      }, expected);
      assert.equal(captured.src, expectedPrint); assert(captured.loaded && captured.cleaned);
      if (printSrc) assert.equal(Math.max(captured.width, captured.height), 4096, '4K-size export master');
    }
    for (const [category, src] of Object.entries(sources)) {
      await page.evaluate(category => { StateStore.applyForm({ customerType: category, custName: 'About photo QA' }); Render.renderAll(); window.__qsSaveNow(); }, category);
      await check(page, src);
      if (category !== 'industrial') {
        assert(await page.evaluate(src => [...document.querySelectorAll('.page img:not(#img_about)')].every(img => img.getAttribute('src') !== src), src), 'new About art is not reused on another proposal page');
      }
      await page.reload(); await page.waitForFunction(() => !!window.Render?.lastState);
      await check(page, src); await snapshot(src);
      const id = await page.evaluate(() => Proposals.activeId());
      const shared = await context.newPage(); shared.on('pageerror', error => errors.push(error.message));
      await shared.goto(base + '/share.html?p=' + encodeURIComponent(id));
      await shared.waitForFunction(() => !!window.Render?.lastState); await check(shared, src); await shared.close();
      await page.emulateMedia({ media: 'print' }); await check(page, src);
      await page.emulateMedia({ media: 'screen' });
      await page.setViewportSize({ width: 390, height: 844 }); await check(page, src);
      await page.setViewportSize({ width: 1440, height: 1100 });
      const png = await page.evaluate(async () => {
        const source = document.querySelector('#pageAbout .photo-top');
        const photo = source.cloneNode(true);
        photo.style.height = getComputedStyle(source).height;
        photo.style.width = getComputedStyle(source).width;
        photo.style.position = 'relative'; photo.style.top = '0'; photo.style.right = '0';
        photo.querySelector('img').style.objectFit = getComputedStyle(source.querySelector('img')).objectFit;
        document.body.append(photo);
        try { return (await html2canvas(photo, { scale: 1, logging: false })).toDataURL(); }
        finally { photo.remove(); }
      });
      fs.writeFileSync(path.join(shots, category + '.png'), Buffer.from(png.split(',')[1], 'base64'));
      console.log('PASS:', category, '— About image, reload, Customer View, export snapshot, print/mobile');
    }
    // Repeated switching must not turn an automatic source into a saved override.
    await page.evaluate(() => { StateStore.applyForm({ customerType: 'residential' }); Render.renderAll(); });
    await check(page, sources.residential);
    assert.equal(await page.evaluate(() => window.__qsPageImages.img_about), undefined);
    await page.evaluate(() => Render.renderAll({ ...Render.lastState, customerType: 'unknown-type' }));
    await check(page, sources.residential);

    // Exercise the actual upload handler, not a hand-built override object.
    await page.locator('#up_about').setInputFiles({ name: 'custom.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=', 'base64') });
    await page.waitForFunction(() => !!window.__qsPageImages.img_about);
    const uploaded = await page.evaluate(() => window.__qsPageImages.img_about);
    for (const customerType of Object.keys(sources)) {
      await page.evaluate(customerType => { StateStore.applyForm({ customerType }); Render.renderAll(); }, customerType);
      await check(page, uploaded);
      assert.equal(await page.locator('#img_about').getAttribute('data-print-src'), null, 'uploaded photo never replaced by a default 4K master');
    }
    await page.evaluate(() => window.__qsSaveNow());
    await page.reload(); await page.waitForFunction(() => !!window.Render?.lastState); await check(page, uploaded);
    const id = await page.evaluate(() => Proposals.activeId());
    const shared = await context.newPage();
    await shared.goto(base + '/share.html?p=' + encodeURIComponent(id));
    await shared.waitForFunction(() => !!window.Render?.lastState); await check(shared, uploaded); await shared.close();
    await snapshot(uploaded);
    assert.deepEqual(errors, []);
    console.log('PASS: category return/fallback and manual upload priority across categories, saved reload, Customer View and export snapshot.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
