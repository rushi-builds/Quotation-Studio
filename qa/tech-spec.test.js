/* Real-browser regression for Tech Spec reference layout.
   Run: node qa/tech-spec.test.js
   Optional: QA_BASE, CHROMIUM_PATH, QA_SHOTS; LD_LIBRARY_PATH for Lambda libraries. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE = process.env.QA_BASE || 'http://localhost:8020';
const OUT = process.env.QA_SHOTS || path.join(__dirname, 'shots');
let passed = 0;
const t = (name, condition) => {
  assert(condition, name);
  console.log('  ✓ ' + name);
  passed++;
};

(async () => {
  const executablePath = process.env.CHROMIUM_PATH ||
    await (await import('@sparticuz/chromium')).default.executablePath();
  const browser = await puppeteer.launch({
    executablePath,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 1400, deviceScaleFactor: 1 }
  });
  try {
    fs.mkdirSync(OUT, { recursive: true });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + '/quotation.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    // Instant scrolling only in this capture harness; no application style changes.
    await page.addStyleTag({ content: '*{scroll-behavior:auto!important}' });

    const setLinks = (pvsyst, arka) => page.evaluate(([p, a]) => {
      document.getElementById('pvsystUrl').value = p;
      document.getElementById('arkaUrl').value = a;
      document.getElementById('arkaUrl').dispatchEvent(new Event('input', { bubbles: true }));
    }, [pvsyst, arka]);

    const measure = () => page.$eval('#pageTechSpec', (el) => {
      const rect = el.getBoundingClientRect();
      const note = el.querySelector('.note-box');
      const n = note.getBoundingClientRect();
      const f = el.querySelector('.pg-foot').getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(note);
      const text = range.getBoundingClientRect();
      return {
        scrollHeight: el.scrollHeight,
        noteTop: n.top - rect.top,
        noteBottom: n.bottom - rect.top,
        footerTop: f.top - rect.top,
        footerGap: f.top - n.bottom,
        noteFontSize: parseFloat(getComputedStyle(note).fontSize),
        noteFits: note.scrollHeight <= note.clientHeight && text.top >= n.top &&
          text.bottom <= n.bottom && text.right <= n.right && text.left >= n.left,
        refsHidden: getComputedStyle(document.getElementById('v_tsRefsWrap')).display === 'none',
        refsCount: document.querySelectorAll('#v_tsRefs .ts-ref').length,
        pillsFit: [...document.querySelectorAll('#v_tsRefs .ts-ref')].every((pill) =>
          pill.scrollWidth <= pill.clientWidth && pill.getBoundingClientRect().height <= 27)
      };
    });

    const pvsyst = 'https://www.example.com/reports/site-pvsyst.pdf';
    const arka = 'https://design.example.org/site/arka';
    const results = {};
    for (const [name, p, a, count] of [
      ['no-links', '', '', 0],
      ['pvsyst-only', pvsyst, '', 1],
      ['both-links', pvsyst, arka, 2]
    ]) {
      await setLinks(p, a);
      await page.$eval('#pageTechSpec', (el) => el.scrollIntoView({ behavior: 'instant', block: 'center' }));
      const m = await measure();
      results[name] = m;
      t(name + ': scrollHeight <= 1124px', m.scrollHeight <= 1124);
      t(name + ': whole note above footer', m.noteBottom <= m.footerTop && m.footerGap > 0);
      t(name + ': note text not clipped or reduced below 8px', m.noteFits && m.noteFontSize >= 8);
      t(name + ': correct reference visibility/count', count ? !m.refsHidden && m.refsCount === count : m.refsHidden);
      t(name + ': compact pills fit', m.pillsFit);
      const clip = await page.$eval('#pageTechSpec', (el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      });
      // Avoid captureBeyondViewport's viewport resize resetting the nested preview scroll.
      await page.screenshot({ path: path.join(OUT, 'tech-spec-' + name + '.png'), captureBeyondViewport: false, clip });
    }
    await setLinks('', '');
    const cleared = await measure();
    t('clearing links restores original note position', cleared.refsHidden &&
      cleared.noteTop === results['no-links'].noteTop && cleared.noteBottom === results['no-links'].noteBottom);

    t('7 kWp hero unchanged', await page.$eval('#v_exHeroNet', (el) => el.textContent === '₹6,08,070'));
    await page.$eval('#capacity', (el) => {
      el.value = '20';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    t('20 kWp hero unchanged', await page.$eval('#v_exHeroNet', (el) => el.textContent === '₹18,82,200'));
    t('20 kWp lifetime savings unchanged', await page.$eval('#v_coverBadgeGen', (el) => el.textContent.includes('₹2.23')));
    t('20 kWp installed array displays a finite 20.165 kWp', await page.$eval('#v_tsTable', el => [...el.querySelectorAll('tr')].some(row => row.querySelector('.spec-k')?.textContent === 'Installed Array Size' && row.querySelector('.spec-v')?.textContent === '20.165 kWp')));
    t('20 kWp module count unchanged', await page.$eval('#v_tsTable', (el) => el.textContent.includes('37 modules')));
    t('no browser runtime errors', errors.length === 0);
    fs.writeFileSync(path.join(OUT, 'tech-spec-metrics.json'), JSON.stringify(results, null, 2) + '\n');
    console.log(JSON.stringify(results, null, 2));
    console.log(`\n${passed} passed, 0 failed`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
