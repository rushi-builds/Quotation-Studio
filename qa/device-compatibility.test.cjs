/* Offline Chromium device emulation, NOT physical Android/iOS or Safari certification.
 * Real app markup/listeners/storage; dashboard uses its existing read-only fixture.
 * All API/auth and off-origin requests blocked. QA_BASE may target a static preview.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');
const bundle = require('@sparticuz/chromium');
const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
const output = path.join(__dirname, 'shots/device-compatibility');
const profiles = [
  ['laptop-1366', { viewport: { width: 1366, height: 768 } }],
  ['laptop-1536', { viewport: { width: 1536, height: 864 } }],
  ['android-small', { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } }],
  ['android-pixel', devices['Pixel 7']],
  ['iphone-se', devices['iPhone SE']],
  ['iphone-13', devices['iPhone 13']],
  ['iphone-landscape', devices['iPhone 13 landscape']],
  ['ipad-portrait', devices['iPad (gen 7)']],
  ['ipad-landscape', devices['iPad (gen 7) landscape']]
];
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const c = bundle.default || bundle;
  const browser = await chromium.launch({ executablePath: await c.executablePath(), args: c.args.filter(a => a !== '--single-process'), headless: true });
  const results = [], failures = [];
  try {
    for (const [name, options] of profiles) {
      const context = await browser.newContext({ ...options, reducedMotion: 'reduce' });
      const errors = [], blocked = [];
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== new URL(base).origin || /^\/(api|auth)\//.test(url.pathname)) {
          blocked.push({ path: url.pathname, method: route.request().method() });
          return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', e => errors.push(e.message));
      const result = { name, viewport: options.viewport, touch: !!options.hasTouch, engine: 'Chromium (emulation)', checks: [] };
      const check = (label, value, detail) => {
        result.checks.push({ label, pass: !!value, ...(value ? {} : { detail }) });
        if (!value) failures.push(name + ': ' + label + ' ' + JSON.stringify(detail));
      };
      const activate = async locator => {
        await locator.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        if (options.hasTouch) await locator.tap(); else await locator.click();
      };
      const widthFits = () => page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      try {
        await page.goto(base + '/quotation.html');
        await page.waitForFunction(() => window.Render?.lastState && document.querySelector('.studio-ready'));
        await page.evaluate(() => document.fonts.ready);
        let fit = await widthFits();
        check('builder has no horizontal page scrolling', fit.scroll <= fit.width + 1, fit);
        await activate(page.locator('#modeAll'));
        check('All mode responds to real click/tap', await page.locator('#modeAll').getAttribute('aria-pressed') === 'true');
        await page.evaluate(() => document.querySelectorAll('.form-panel details').forEach(d => d.open = true));
        const fields = await page.locator('.form-panel input:not([type=hidden]):not([type=file]),.form-panel select,.form-panel textarea').evaluateAll(ns => ns.filter(n => n.getClientRects().length && !['checkbox', 'radio', 'range', 'color'].includes(n.type)).map(n => {
          const r = n.getBoundingClientRect(), p = n.closest('.form-panel').getBoundingClientRect();
          return { id: n.id, font: parseFloat(getComputedStyle(n).fontSize), height: r.height, fits: r.left >= p.left - 1 && r.right <= p.right + 1 };
        }));
        check('all expanded fields stay inside their panel', fields.length > 50 && fields.every(f => f.fits), fields.filter(f => !f.fits));
        if (options.hasTouch) {
          check('touch editing fields are at least 44px high', fields.every(f => f.height >= 44), fields.filter(f => f.height < 44));
          check('touch text fields use 16px to avoid iOS focus zoom', fields.every(f => f.font >= 16), fields.filter(f => f.font < 16));
        }
        // Real focus and text entry exercise live listeners, not StateStore shortcuts.
        await activate(page.locator('#custName'));
        await page.locator('#custName').fill('Shree Ganesh Cooperative Housing Society Limited');
        await page.locator('#custAddress').fill('Survey No. 123, Baner–Pashan Link Road, Pune, Maharashtra 411045');
        await page.locator('#capacity').fill('12.5');
        await page.waitForFunction(() => Render.lastState.capacity === '12.5' && v_coverCustName.textContent.includes('Shree Ganesh'));
        check('real typing updates customer and capacity preview', await page.locator('#v_coverCapacity').textContent() === '12.5 kWp');
        await page.waitForFunction(() => saveIndicator.dataset.state === 'saved');
        const id = await page.evaluate(() => Proposals.activeId());
        await page.reload();
        await page.waitForFunction(() => window.Render?.lastState && document.querySelector('.studio-ready'));
        check('browser reload restores saved edits', await page.locator('#custName').inputValue() === 'Shree Ganesh Cooperative Housing Society Limited' && await page.locator('#capacity').inputValue() === '12.5');
        await page.locator('#studioSearch').fill('module make');
        await activate(page.locator('#studioSearchResults [data-search-target="moduleMake"]'));
        check('search opens and focuses the actual equipment field', await page.evaluate(() => document.activeElement.id === 'moduleMake'));
        await page.screenshot({ path: path.join(output, name + '-builder.png') });
        await page.goto(base + '/share.html?p=' + encodeURIComponent(id));
        await page.waitForFunction(() => window.Render?.lastState);
        await page.evaluate(() => document.fonts.ready);
        fit = await widthFits();
        check('Customer View fits device width', fit.scroll <= fit.width + 1, fit);
        check('Customer View uses saved customer and pricing', await page.evaluate(() => v_coverCustName.textContent.includes('Shree Ganesh') && Render.lastState.capacity === '12.5' && !document.querySelector('.form-panel')));
        const overflow = await page.evaluate(() => [...document.querySelectorAll('.page')].filter(q => q.getClientRects().length).flatMap(q => {
          const bad = [];
          if (q.scrollWidth > 795 || q.scrollHeight > 1124) bad.push(q.id + ': canvas overflow');
          if (['pageCover', 'pageClosing'].includes(q.id)) return bad;
          const r = q.getBoundingClientRect(), scale = r.width / 794, footer = q.querySelector('footer').getBoundingClientRect();
          for (const n of q.querySelector('.pg-body').children) {
            if (!n.getClientRects().length || n.matches('.spacer')) continue;
            const z = n.getBoundingClientRect();
            if (z.bottom > footer.top + scale || z.left < r.left - scale || z.right > r.right + scale) bad.push(q.id + ': ' + (n.id || n.className));
          }
          return bad;
        }));
        check('long real-world customer text and all visible pages fit A4', !overflow.length, overflow);
        await page.screenshot({ path: path.join(output, name + '-customer.png') });
        if (!options.hasTouch) {
          await page.emulateMedia({ media: 'print' });
          await page.pdf({ path: path.join(output, name + '.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
          check('actual Chromium PDF file generated', fs.statSync(path.join(output, name + '.pdf')).size > 10000);
          await page.emulateMedia({ media: 'screen' });
        }
        await page.goto(base + '/feedback-preview.html');
        await page.waitForSelector('#feedbackComment');
        await activate(page.locator('.feedback-stars label').last());
        await page.locator('#feedbackComment').fill('Device audit: please explain the roof layout.');
        check('touch/click rating works without losing typed feedback', await page.locator('[name=proposalRating]:checked').inputValue() === '5' && (await page.locator('#feedbackComment').inputValue()).includes('roof layout'));
        check('unpublished preview never enables a fake save', await page.locator('#feedbackSubmit').isDisabled() && !await page.locator('#feedbackSuccess').isVisible());
        fit = await widthFits();
        check('feedback fits device width', fit.scroll <= fit.width + 1, fit);
        if (options.hasTouch) check('feedback typing uses 16px to avoid focus zoom', await page.locator('#feedbackComment').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16));
        await page.screenshot({ path: path.join(output, name + '-feedback.png') });
        // Existing read-only fixture: production auth/permissions are never overridden.
        await page.goto(base + '/review/workspace-fit/index.html');
        const frame = page.frames().find(f => f.parentFrame());
        await frame.waitForSelector('#homeBody .hgrid');
        for (const panel of ['home', 'proposals', 'tasks', 'activity', 'send', 'gallery', 'sales', 'settings', 'reports', 'publish']) {
          await frame.evaluate(p => QSDash.show(p), panel);
          await frame.waitForSelector('#panel-' + panel + '.on');
          const layout = await frame.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, active: document.querySelector('.panel.on').getBoundingClientRect().width }));
          check('dashboard ' + panel + ' fits device width', layout.scroll <= layout.width + 1 && layout.active > 0, layout);
          if (options.hasTouch) {
            const small = await frame.locator('.main input,.main select,.main textarea').evaluateAll(ns => ns.filter(n => n.getClientRects().length && !['checkbox','radio','range','color','hidden','file'].includes(n.type)).filter(n => parseFloat(getComputedStyle(n).fontSize) < 16 || n.getBoundingClientRect().height < 44).map(n => ({ id: n.id, font: getComputedStyle(n).fontSize, height: n.getBoundingClientRect().height })));
            check('dashboard ' + panel + ' touch fields avoid small-text zoom', !small.length, small);
          }
        }
        await page.screenshot({ path: path.join(output, name + '-dashboard.png') });
        check('no JavaScript runtime errors', !errors.length, errors);
        check('zero attempted API/auth writes', !blocked.some(r => r.method !== 'GET'), blocked);
      } catch (e) { check('scenario completes', false, e.message); }
      results.push(result);
      console.log(name + ': ' + result.checks.filter(c => c.pass).length + '/' + result.checks.length + ' PASS');
      await context.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ engine: 'Chromium', physicalDevices: false, webkit: 'not run; browser download blocked in sandbox', results, failures }, null, 2));
  assert.equal(failures.length, 0, failures.map(f => f.slice(0, 400)).join('\n') + '\nFull evidence: qa/shots/device-compatibility/results.json');
  console.log('PASS: nine laptop/Android/iPhone/iPad profiles, real input/tap/storage/customer/feedback flows, ten dashboard panels each, offline only. Safari and physical-device checks remain pending.');
})().catch(e => { console.error(e); process.exitCode = 1; });
