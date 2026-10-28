/* Quotation-library filtering, sorting and paging: disposable local account + synthetic UI rows. */
'use strict';
const { chromium } = require('playwright');
const bundledPackage = require('@sparticuz/chromium');
const bundled = bundledPackage.default || bundledPackage;
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os'), net = require('net'), assert = require('node:assert/strict');
(async () => {
  const root = path.resolve(__dirname, '..'), data = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-library-'));
  const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['platform/local-server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', QS_DATA_DIR: data, GEMINI_ENABLED: 'false' }, stdio: ['ignore', 'pipe', 'inherit'] });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Server startup timeout')), 15000);
      child.stdout.on('data', chunk => { if (chunk.toString().includes('Quotation Studio platform')) { clearTimeout(timer); resolve(); } }); child.once('error', reject);
    });
    browser = await chromium.launch({ executablePath: await bundled.executablePath(), args: bundled.args.filter(argument => argument !== '--single-process'), headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(), errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/') && !['GET','HEAD'].includes(request.method()) && !request.url().endsWith('/auth/register')) writes.push(request.method() + ' ' + new URL(request.url()).pathname); });
    const origin = `http://127.0.0.1:${port}`;
    await page.goto(origin + '/index.html'); await page.waitForFunction(() => !!window.PlatformAPI);
    const account = await page.evaluate(async () => {
      const result = await PlatformAPI.register('Library QA', 'library@example.test', 'LibraryPass!123', 'owner');
      PlatformAPI.setSessionToken(result.token); return result.user;
    });
    assert(account);
    await page.goto(origin + '/dashboard.html'); await page.waitForFunction(() => !!window.QSDash?.user());
    await page.waitForFunction(() => document.querySelector('#panel-proposals') && document.querySelector('#filterQ'));
    await page.evaluate(() => QSDash.refresh()); // settle the dashboard's first live fetch before injecting synthetic UI rows
    const records = Array.from({ length: 47 }, (_, index) => {
      const i = index + 1, status = ['draft','sent','viewed','accepted','archived','negotiation','ready'][index % 7];
      const customer = i === 1 ? '<img src=x onerror=alert(1)>' : `Solar Customer ${String(i).padStart(2,'0')}`;
      return { id: `qa-${String(i).padStart(3,'0')}`, customer, ref: `REF-${String(i).padStart(3,'0')}`, title: `Rooftop Project ${i}`, capacity: i === 2 ? '' : String((i % 9) + 1), status, version: '1.0', createdAt: new Date(Date.UTC(2026, 0, i)).toISOString(), updatedAt: new Date(Date.UTC(2026, 1, i)).toISOString() };
    });
    await page.evaluate(rows => { QSDash.setProposals(rows); QSDash.show('proposals'); }, records);
    await page.waitForFunction(() => document.querySelectorAll('#propTableBody tr.quotation-row').length === 20);
    const shots = path.join(root, 'qa/shots/quotation-library'); fs.mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, 'library-desktop.png'), fullPage: true });
    const check = async (label, condition) => { assert(condition, label); console.log('PASS:', label); };
    await check('library reports the current visible range and total', await page.locator('#quoteResults').innerText() === '1–20 of 47 quotations');
    await check('large lists are paginated without dropping records', await page.locator('#quotePageInfo').innerText() === 'Page 1 of 3' && await page.locator('#quoteNext').isEnabled());
    await page.click('#quoteNext');
    await check('next page shows the next records and previous page is enabled', await page.locator('#quoteResults').innerText() === '21–40 of 47 quotations' && await page.locator('#quotePrev').isEnabled());
    await page.fill('#filterQ', 'Customer 24 REF-024');
    await check('search combines words across customer and reference', await page.locator('#propTableBody tr.quotation-row').count() === 1 && await page.locator('#propTableBody').innerText().then(text => text.includes('Solar Customer 24')) && await page.locator('#quotePageInfo').innerText() === 'Page 1 of 1');
    await page.fill('#filterQ', '8 kWp');
    await check('capacity and unit are searchable, matching across capacity and reference fields', await page.locator('#quoteResults').innerText() === '1–9 of 9 matching quotations');
    await page.fill('#filterQ', 'no-such-customer');
    await check('no-results state explains how to recover and offers clear filters', await page.locator('#quoteResults').innerText() === 'No matching quotations' && await page.locator('#clearQuoteFilters').isVisible());
    await page.click('#clearQuoteFilters');
    await check('clear filters restores all records and returns focus to search', await page.locator('#quoteResults').innerText() === '1–20 of 47 quotations' && await page.evaluate(() => document.activeElement.id) === 'filterQ');
    await page.fill('#filterQ', 'Solar Customer 24'); await page.press('#filterQ', 'Escape');
    await check('Escape clears search without leaving the library', await page.locator('#filterQ').inputValue() === '' && await page.locator('#quoteResults').innerText() === '1–20 of 47 quotations');
    await page.selectOption('#filterStatus', 'active');
    const activeState = await page.evaluate(() => ({ status: document.querySelector('#filterStatus')?.value, results: document.querySelector('#quoteResults')?.textContent, statuses: [...document.querySelectorAll('#propTableBody .badge')].map(node => node.textContent) }));
    await check('direct Active stage filter returns matching quotations', activeState.status === 'active' && activeState.results?.includes('matching quotations'));
    const activeStatuses = activeState.statuses;
    await check('Active excludes accepted, rejected, expired and archived states', activeStatuses.every(status => !['Accepted','Rejected','Expired','Archived'].includes(status)));
    await page.selectOption('#filterStatus', 'waiting');
    const waitingStatuses = await page.evaluate(() => [...document.querySelectorAll('#propTableBody .badge')].map(node => node.textContent));
    await check('Sent or viewed filter contains only those customer stages', waitingStatuses.length > 0 && waitingStatuses.every(status => ['Sent','Viewed'].includes(status)));
    await page.evaluate(() => document.querySelector('[data-quote-view="active"]').click());
    const quickView = await page.evaluate(() => ({ value: document.querySelector('#filterStatus').value, pressed: document.querySelector('[data-quote-view="active"]').getAttribute('aria-pressed') }));
    await check('quick Active chip applies the stage and announces selection', quickView.value === 'active' && quickView.pressed === 'true');
    await page.selectOption('#filterStatus', ''); await page.selectOption('#quoteSort', 'customer');
    const firstCustomer = await page.locator('#propTableBody .record-link').first().innerText();
    await check('customer A–Z sorting is applied to a copied view', firstCustomer === '<img src=x onerror=alert(1)>');
    await check('customer text is safely escaped, not interpreted as markup', await page.locator('#propTableBody img').count() === 0 && await page.locator('#propTableBody .record-link').first().innerText() === '<img src=x onerror=alert(1)>');
    await page.selectOption('#quoteSort', 'capacity_desc');
    await check('capacity high-to-low sorts missing values last', await page.locator('#propTableBody .record-link').first().innerText() === 'Solar Customer 08');
    await page.selectOption('#quoteSort', 'updated');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#filterQ').evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: path.join(shots, 'library-mobile.png') });
    const mobileMetrics = await page.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth, rowDisplay: getComputedStyle(document.querySelector('.quotation-row')).display }));
    await check('small-screen cards fit the viewport without horizontal page overflow', mobileMetrics.page <= mobileMetrics.width && mobileMetrics.rowDisplay === 'grid');
    const paginationMetrics = await page.locator('#quoteNext').evaluate(button => ({height:button.getBoundingClientRect().height,display:getComputedStyle(button).display,hidden:button.closest('.library-pagination').hidden,results:document.querySelector('#quoteResults').textContent}));
    await check('pagination touch targets are at least 44px high', paginationMetrics.height >= 44);
    await page.locator('#filterQ').fill('Solar Customer 47');
    await check('filtering resets pagination on mobile and keeps search usable', await page.locator('#quoteResults').innerText() === '1–1 of 1 matching quotations' && await page.locator('#filterQ').isVisible());
    await page.locator('#filterQ').fill(''); await page.locator('#quoteSort').selectOption('updated');
    await page.locator('#propTableBody .row-actions [data-act="open"][data-id="qa-047"]').click();
    await check('Open action still hands the exact selected quotation to Studio', page.url().includes('quotation.html?cloud=qa-047') && await page.evaluate(() => sessionStorage.getItem('qs.cloudOpenId')) === 'qa-047');
    await check('no runtime errors or unintended API writes', errors.length === 0 && writes.length === 0);
    console.log('RESULT: 19 passed; local disposable account, synthetic records, no production access.');
  } finally {
    if (browser) await browser.close(); child.kill('SIGTERM');
    try { fs.rmSync(data, { recursive: true, force: true }); } catch (_) {}
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
