/* Cover accent + complete footer website regression. Requires scripts/serve.js.
   LD_LIBRARY_PATH=/tmp/al2023/lib node qa/footer-website.test.cjs */
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
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
    const website = 'www.ktmenergyexperts.com';
    await page.goto(base + '/quotation.html');
    await page.waitForFunction(() => !!window.Render?.lastState);
    await page.evaluate(() => document.fonts.ready);

    async function checkFooters(view, selector, expected) {
      const footers = await view.evaluate(selector => [...document.querySelectorAll(selector)].map(footer => {
        const url = footer.querySelector('.pf-website, .power-foot-website');
        const box = footer.getBoundingClientRect();
        if (!box.width) return null;
        const range = document.createRange();
        range.selectNodeContents(url);
        const text = range.getBoundingClientRect();
        const others = [...footer.children].filter(el => el !== url && !el.contains(url)).map(el => el.getBoundingClientRect());
        return {
          page: footer.closest('.page').id, text: url.textContent,
          contained: text.left >= box.left && text.right <= box.right && text.top >= box.top && text.bottom <= box.bottom,
          fits: url.scrollWidth <= url.clientWidth + 1,
          separated: others.every(other => text.right <= other.left + 1 || text.left >= other.right - 1 || text.bottom <= other.top + 1 || text.top >= other.bottom - 1)
        };
      }).filter(Boolean), selector);
      assert(footers.length >= 6, 'all visible proposal footers checked');
      for (const footer of footers) {
        assert.equal(footer.text, expected, footer.page);
        assert(footer.contained && footer.fits && footer.separated, JSON.stringify(footer));
      }
      return footers.length;
    }

    for (const category of ['residential', 'commercial', 'industrial', 'rwa']) {
      await page.evaluate(category => {
        StateStore.applyForm({ ...StateStore.DEFAULTS, custName: 'Footer QA', customerType: category, companyWebsite: 'www.ktmenergyexperts.com', loanAmt: '100000', loanRate: '9', loanYears: '5' });
        Render.renderAll();
      }, category);
      await page.evaluate(() => document.getElementById('coverArtwork').decode());
      const accentPixels = await page.evaluate(() => {
        const img = document.getElementById('coverArtwork');
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        const s = img.naturalWidth / 1588;
        const pixels = ctx.getImageData(Math.round(1400 * s), Math.round(170 * s), Math.round(130 * s), Math.round(30 * s)).data;
        let orange = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 190 && pixels[i + 1] > 85 && pixels[i + 1] < 195 && pixels[i + 2] < 95) orange++;
        return orange;
      });
      assert.equal(accentPixels, 0, category + ': small orange tagline accent removed from artwork');
      await checkFooters(page, '.preview-panel .pg-foot', website);
      // Shared footer renderer also populates currently hidden optional pages.
      assert(await page.evaluate(expected => [...document.querySelectorAll('[data-foot-company]')].every(el => el.querySelector('.pf-website')?.textContent === expected), website));
      await page.evaluate(() => { window.__footerPower = Experience.buildPowerPages(Render.lastState); });
      assert.equal(await checkFooters(page, '.pdf-snapshot .power-foot', website), 6);
      await page.evaluate(() => { window.__footerPower.remove(); });
    }

    await page.emulateMedia({ media: 'print' });
    await checkFooters(page, '.preview-panel .pg-foot', website);
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => Render.fitPages());
    await checkFooters(page, '.preview-panel .pg-foot', website);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => Render.fitPages());

    // Preserve the configurable company website, including after a saved reload.
    const customWebsite = 'www.example.com';
    await page.evaluate(value => {
      const el = document.getElementById('companyWebsite'); el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, customWebsite);
    await checkFooters(page, '.preview-panel .pg-foot', customWebsite);
    await page.evaluate(() => window.__qsSaveNow());
    await page.reload();
    await page.waitForFunction(() => !!window.Render?.lastState);
    await checkFooters(page, '.preview-panel .pg-foot', customWebsite);
    await page.evaluate(() => { StateStore.applyForm({ companyWebsite: 'www.ktmenergyexperts.com' }); Render.renderAll(); window.__qsSaveNow(); });
    const id = await page.evaluate(() => Proposals.activeId());
    const shared = await context.newPage();
    shared.on('pageerror', error => errors.push(error.message));
    await shared.goto(base + '/share.html?p=' + encodeURIComponent(id));
    await shared.waitForFunction(() => !!window.Render?.lastState);
    await checkFooters(shared, '.pg-foot', website);
    await shared.close();

    // Render the real canvas path used by PDF export for visual review.
    const dir = path.join(__dirname, 'shots', 'footer-website');
    fs.mkdirSync(dir, { recursive: true });
    const data = await page.evaluate(async () => {
      const footer = document.querySelector('#pageExec .pg-foot');
      return (await html2canvas(footer, { scale: 2, logging: false, backgroundColor: '#fff' })).toDataURL();
    });
    fs.writeFileSync(path.join(dir, 'detailed-footer.png'), Buffer.from(data.split(',')[1], 'base64'));
    await page.locator('#pageCover').screenshot({ path: path.join(dir, 'cover.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: accent absent in all four cover images; full website fits detailed/conditional and six-page footers, print, mobile, saved reload and custom company website; real html2canvas footer captured.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
