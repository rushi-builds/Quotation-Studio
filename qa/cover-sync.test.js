/* Real-browser regression: control-panel edits must change VISIBLE cover values.
   Run: node qa/cover-sync.test.js (QA_BASE defaults to the live preview server). */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const puppeteer = require('puppeteer-core');

(async () => {
  const { default: chromium } = await import('@sparticuz/chromium');
  const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.QA_BASE || 'http://127.0.0.1:8080') + '/quotation.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    const ids = ['v_coverCustName', 'v_coverCustAddress', 'v_coverCapacity', 'v_coverRef', 'v_coverDate', 'v_coverBadgeKwp', 'v_coverBadgeGen'];
    async function checkVisible() {
      const values = await page.evaluate(ids => ids.map(id => {
        const el = document.getElementById(id);
        return { id, count: document.querySelectorAll('#' + id).length, visible: el.checkVisibility(), text: el.textContent, fits: el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1 };
      }), ids);
      values.forEach(v => {
        assert.equal(v.count, 1, v.id + ' must be unique');
        assert(v.visible, v.id + ' must be visible, not hidden metadata');
        assert(v.fits, v.id + ' must fit its area');
      });
      return Object.fromEntries(values.map(v => [v.id, v.text]));
    }
    async function edit(fields) {
      await page.evaluate(fields => {
        for (const [id, value] of Object.entries(fields)) {
          const input = document.getElementById(id); input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }, fields);
    }
    let values = await checkVisible();
    assert.equal(values.v_coverCustName, 'Customer Name');
    const oldSavings = values.v_coverBadgeGen;
    await edit({ custName: 'Mr. Rahul Sharma', custAddress: 'Baner, Pune', capacity: '12.5', propRef: 'KTM-2026-099', propDate: '2026-10-15' });
    values = await checkVisible();
    assert.equal(values.v_coverCustName, 'Mr. Rahul Sharma');
    assert.equal(values.v_coverCustAddress, 'Baner, Pune');
    assert.equal(values.v_coverCapacity, '12.5 kWp');
    assert.equal(values.v_coverBadgeKwp, '12.5 kWp');
    assert.equal(values.v_coverRef, 'KTM-2026-099');
    assert.match(values.v_coverDate, /15.*Oct.*2026/);
    assert.notEqual(values.v_coverBadgeGen, oldSavings);
    const exactSavings = await page.evaluate(() => Finance.fmtINRshort(Finance.compute(Render.lastState).lifetimeSaving));
    assert.equal(values.v_coverBadgeGen, exactSavings);
    await edit({ tariff: '20' });
    const afterTariff = await checkVisible();
    assert.notEqual(afterTariff.v_coverBadgeGen, values.v_coverBadgeGen);
    fs.mkdirSync(__dirname + '/shots', { recursive: true });
    await page.$eval('#pageCover', e => { e.style.transform = 'none'; });
    const artwork = await page.$eval('#pageCover', e => e.outerHTML);
    const proof = await browser.newPage();
    await proof.setViewport({width: 800, height: 1130});
    await proof.setContent('<base href="' + page.url() + '"><link rel="stylesheet" href="assets/css/app.css">' + artwork);
    await proof.evaluate(() => document.fonts.ready);
    await proof.waitForFunction(() => [...document.images].every(img => img.complete));
    await (await proof.$('#pageCover')).screenshot({ path: __dirname + '/shots/cover-live.png' });
    await proof.close();
    await edit({ custName: 'Mr. & Mrs. A Very Long Customer Name With Multiple Family Names', custAddress: 'Apartment 1204, Long Residential Society, Baner Road, Pune, Maharashtra 411045', propRef: 'KTM/COMMERCIAL/2026/SOLAR/0123456789' });
    await checkVisible();
    await edit({ custName: '<img src=x onerror=alert(1)>', custAddress: '', propRef: '' });
    assert.equal(await page.$eval('#v_coverCustName', e => e.children.length), 0, 'text must not execute HTML');
    await checkVisible();
    await edit({ custName: 'Mr. Rahul Sharma', custAddress: 'Baner, Pune', propRef: 'KTM-2026-099' });
    await page.waitForFunction(() => !document.querySelector('#saveState')?.textContent?.includes('Saving'));
    // Check the same DOM in print and in the canvas path used by PDF export.
    await page.emulateMediaType('print');
    await checkVisible();
    await page.emulateMediaType('screen');
    const canvasSize = await page.evaluate(async () => {
      const canvas = await html2canvas(document.getElementById('pageCover'), {scale: 1, logging: false});
      return [canvas.width, canvas.height];
    });
    assert(canvasSize[0] > 700 && canvasSize[1] > 1000);
    await new Promise(resolve => setTimeout(resolve, 800));
    await page.reload({waitUntil:'networkidle0'});
    await page.evaluate(() => document.fonts.ready);
    assert.equal((await checkVisible()).v_coverCustName, 'Mr. Rahul Sharma', 'saved proposal must restore visible cover');
    await page.setViewport({width:390,height:844});
    await checkVisible();
    assert.deepEqual(errors, []);
    console.log('PASS: visible cover sync, capacity in both places, calculated savings, long/empty/HTML text, print, PDF canvas, reload, mobile.');
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
