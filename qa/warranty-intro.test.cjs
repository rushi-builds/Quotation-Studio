/* Warranty introduction: readable beside the image, including saved proposals. */
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
    page.on('pageerror', e => errors.push(e.message));
    const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
    await page.goto(base + '/quotation.html');
    await page.waitForFunction(() => !!window.Render?.lastState);
    await page.evaluate(() => document.fonts.ready);
    const expected = await page.evaluate(() => CONTENT.pageWarranty.intro);
    const warranties = await page.locator('#v_wrWarranties').textContent();
    const steps = await page.locator('#v_wrJourney').textContent();
    async function check(view, text = expected) {
      const result = await view.evaluate(() => {
        const page = document.getElementById('pageWarranty'), intro = page.querySelector('#v_wrIntro');
        const rect = intro.getBoundingClientRect(), image = page.querySelector('.photo-top').getBoundingClientRect();
        const foot = page.querySelector('.pg-foot').getBoundingClientRect(), closing = page.querySelector('#v_wrClosing').getBoundingClientRect();
        const journey = page.querySelector('#v_wrJourney').getBoundingClientRect();
        return { text: intro.textContent, visible: intro.checkVisibility(), leftOfImage: rect.right <= image.left - 1,
          belowSubtitle: rect.top >= page.querySelector('#v_wrSub').getBoundingClientRect().bottom,
          beforeCards: rect.bottom <= page.querySelector('#v_wrWarrLabel').getBoundingClientRect().top - 1,
          height: page.scrollHeight, footerClear: closing.bottom <= foot.top && journey.bottom <= closing.top - 1 };
      });
      assert.equal(result.text, text); assert(result.visible && result.leftOfImage && result.belowSubtitle && result.beforeCards && result.footerClear && result.height <= 1124, JSON.stringify(result));
      assert.equal(await view.locator('#v_wrWarranties').textContent(), warranties);
      assert.equal(await view.locator('#v_wrJourney').textContent(), steps);
    }
    for (const customerType of ['residential', 'commercial', 'industrial', 'rwa']) {
      await page.evaluate(customerType => { StateStore.applyForm({ customerType }); Render.renderAll(); }, customerType);
      await check(page);
    }
    await page.emulateMedia({ media: 'print' }); await check(page);
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 }); await check(page);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => window.__qsSaveNow());
    // Old saved content has no intro field; clean defaults should supply it.
    await page.evaluate(() => { const blob = Proposals.active(); delete blob.content.pageWarranty.intro; Proposals.put(blob); });
    await page.reload(); await page.waitForFunction(() => !!window.Render?.lastState); await check(page);
    const id = await page.evaluate(() => Proposals.activeId());
    const shared = await context.newPage(); shared.on('pageerror', e => errors.push(e.message));
    await shared.goto(base + '/share.html?p=' + encodeURIComponent(id));
    await shared.waitForFunction(() => !!window.Render?.lastState); await check(shared); await shared.close();
    const png = await page.evaluate(async () => {
      const copy = document.getElementById('pageWarranty').cloneNode(true); copy.style.transform = 'none';
      const host = document.createElement('div'); host.className = 'pdf-snapshot'; host.append(copy); document.body.append(host);
      try { await Promise.all([...copy.querySelectorAll('img')].map(img => img.decode())); return (await html2canvas(copy, { scale: 1, logging: false, backgroundColor: '#fff' })).toDataURL(); }
      finally { host.remove(); }
    });
    const dir = path.join(__dirname, 'shots', 'warranty-intro'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'warranty-page.png'), Buffer.from(png.split(',')[1], 'base64'));
    const custom = 'Project-specific installation and warranty introduction.';
    await page.evaluate(custom => { CONTENT.pageWarranty.intro = custom; Render.renderAll(); window.__qsSaveNow(); }, custom);
    await page.reload(); await page.waitForFunction(() => !!window.Render?.lastState); await check(page, custom);
    assert.deepEqual(errors, []);
    console.log('PASS: professional Warranty introduction, four categories, image/card/footer clearance, print/mobile, legacy reload, Customer View, custom copy persistence and real PDF canvas. Warranty cards and journey unchanged.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
