/* Staff vs owner catalogue permissions in a real browser.
   Self-hosts the repo + a disposable mock API; no live account or workbook is contacted.
   Run: NODE_PATH=<qa node_modules> node qa/catalogue-permissions-browser.test.cjs */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const cloud = { sha: 'disposable-permission-sha', syncedAt: '2026-10-25T10:00:00Z', source: 'Software Engine.xlsm',
  modules: [{ make: 'Workbook Solar', model: 'WB-620', wp: 620, cellType: 'HJT', lengthMm: 2300, widthMm: 1134, voc: 50, isc: 15, vmp: 42, imp: 14 }],
  inverters: [{ make: 'Workbook Inverter', model: 'WB-8', kw: 8 }], cables: [{ make: 'Workbook Cable', size: 4 }] };
let mode = 'staff', posts = 0, statusGets = 0;

function metadata(canSync) {
  return { ok: true, status: 'up-to-date', canSync, fileName: 'Software Engine.xlsm',
    workbookUrl: 'https://drive.google.com/file/d/' + (canSync ? 'admin' : 'staff') + '-fixture/view',
    syncedAt: cloud.syncedAt, sha: cloud.sha, checkedAt: cloud.syncedAt,
    counts: { modules: cloud.modules.length, inverters: cloud.inverters.length, cables: cloud.cables.length } };
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const json = (status, body) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)); };
  if (url.pathname === '/__mode') { mode = url.searchParams.get('m') || mode; return json(200, { mode }); }
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/catalogue/status' && request.method === 'GET') {
      statusGets += 1;
      if (mode === 'signin') return json(401, { error: 'Sign in to check the connected Excel workbook.' });
      if (mode === 'fail') return json(502, { error: 'Workbook status could not be checked.', code: 'CATALOGUE_STATUS_UNAVAILABLE' });
      return json(200, metadata(mode === 'admin'));
    }
    if (url.pathname === '/api/catalogue' && request.method === 'GET') return json(200, { ok: true, catalogue: cloud });
    if (url.pathname === '/api/catalogue/sync' && request.method === 'POST') {
      posts += 1;
      if (mode !== 'admin') return json(403, { error: 'Only the owner (or an elevated admin) can sync the equipment catalogue.' });
      return json(200, { ok: true, catalogue: cloud });
    }
    return json(404, { error: 'Disposable QA: endpoint not connected' });
  }
  const relative = url.pathname === '/' ? '/quotation.html' : decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(ROOT, relative));
  if (!file.startsWith(ROOT)) { response.writeHead(403); return response.end(); }
  fs.readFile(file, (error, buffer) => {
    if (error) { response.writeHead(404); return response.end('not found'); }
    response.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(buffer);
  });
});

let pass = 0, fail = 0;
const check = (name, condition, detail) => {
  if (condition) { pass += 1; console.log('  ok', name); }
  else { fail += 1; console.error('  FAIL', name, detail === undefined ? '' : '-> ' + String(detail).slice(0, 240)); }
};

async function routeApi(context, base) {
  await context.route(/\/__mode/, async route => {
    const target = new URL(route.request().url());
    mode = target.searchParams.get('m') || mode;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ mode }) });
  });
  await context.route(/\/api\//, async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    let status = 200, body;
    if (pathname === '/api/catalogue/status') {
      statusGets += 1;
      if (mode === 'signin') { status = 401; body = { error: 'Sign in to check the connected Excel workbook.' }; }
      else if (mode === 'fail') { status = 502; body = { error: 'Workbook status could not be checked.', code: 'CATALOGUE_STATUS_UNAVAILABLE' }; }
      else body = metadata(mode === 'admin');
    } else if (pathname === '/api/catalogue' && request.method() === 'GET') {
      body = { ok: true, catalogue: cloud };
    } else if (pathname === '/api/catalogue/sync' && request.method() === 'POST') {
      posts += 1;
      if (mode !== 'admin') { status = 403; body = { error: 'Only the owner (or an elevated admin) can sync the equipment catalogue.' }; }
      else body = { ok: true, catalogue: cloud };
    } else { status = 404; body = { error: 'Disposable QA: endpoint not connected' }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await context.route('https://drive.google.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Disposable workbook fixture</title>' }));
  return base;
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch(process.env.QA_EXECUTABLE_PATH
    ? { executablePath: process.env.QA_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'], headless: true }
    : { channel: process.env.QA_CHANNEL || 'chrome', headless: true });
  try {
    /* ---------- staff / sales: catalogue + status usable, management inert ---------- */
    mode = 'staff'; posts = 0;
    const staff = await browser.newContext({ viewport: { width: 1440, height: 1100 }, hasTouch: true });
    await routeApi(staff, base);
    const page = await staff.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let staffTabs = 0;
    staff.on('page', () => { staffTabs += 1; });
    await page.goto(base + '/quotation.html');
    await page.waitForFunction(() => window.ExcelCatalogue && Render.lastState && document.querySelector('.studio-ready') && catalogueStatusLink.dataset.state === 'up-to-date');

    check('staff status is truthful and visible', await page.locator('#catalogueHeaderStatus').textContent() === 'System up to date');
    check('staff can still open catalogue status', await page.click('#catalogueStatusLink').then(() => page.evaluate(() => advancedWrap.open && excelCataloguePanel.open && document.activeElement.id === 'eqCatalog')));
    check('staff Add/edit has no destination', await page.locator('#openCatalogueExcel').getAttribute('href') === null);
    check('staff Add/edit is marked disabled', await page.locator('#openCatalogueExcel').getAttribute('aria-disabled') === 'true');
    check('staff Add/edit explanation is keyboard accessible', await page.locator('#openCatalogueExcel').evaluate(el => el.tabIndex) === 0);
    check('staff Add/edit explains why', /owner or an elevated admin/i.test(await page.locator('#openCatalogueExcel').getAttribute('title') || ''));
    // control-panel.css already styles aria-disabled catalogue links; app.css
    // adds nothing, so opacity must stay at its default 1 here.
    check('staff Add/edit looks disabled', await page.locator('#openCatalogueExcel').evaluate(el => {
      const style = getComputedStyle(el);
      return style.pointerEvents === 'auto' && style.cursor === 'not-allowed' && style.color === 'rgb(140, 150, 170)' && Number(style.opacity) === 1;
    }));
    const before = posts;
    const cancelled = await page.evaluate(() => { const link = document.getElementById('openCatalogueExcel'); const event = new MouseEvent('click', { bubbles: true, cancelable: true }); link.dispatchEvent(event); return event.defaultPrevented; });
    check('staff Add/edit click is cancelled', cancelled === true);
    await page.click('#openCatalogueExcel', { force: true });
    check('fixed staff policy is visible inside the card', await page.locator('#cataloguePermissionNotice').isVisible() && await page.locator('#cataloguePermissionNotice').textContent() === 'Only the Owner or an elevated Admin can add/edit or sync the catalogue.');
    check('blocked Add/edit focuses its explanation', await page.locator('#cataloguePermissionNotice').evaluate(el => document.activeElement === el));
    await page.locator('#openCatalogueExcel').press('Enter');
    await page.locator('#openCatalogueExcel').press('Space');
    await page.waitForTimeout(600);
    check('staff Add/edit opens no tab', staffTabs === 0, staffTabs);
    check('staff Add/edit never syncs', posts === before, posts);
    check('staff Sync is soft-disabled for explanation only', await page.locator('#syncCatalogueBtn').getAttribute('aria-disabled') === 'true' && await page.locator('#syncCatalogueBtn').evaluate(el => !el.disabled));
    await page.click('#syncCatalogueBtn', { force: true });
    await page.locator('#syncCatalogueBtn').press('Enter');
    check('blocked Sync focuses its explanation', await page.locator('#cataloguePermissionNotice').evaluate(el => document.activeElement === el));
    await page.waitForTimeout(300);
    check('staff Sync click does nothing', posts === before, posts);
    const denied = await page.evaluate(async () => { try { await PlatformAPI.syncEquipmentCatalogue(); return 'allowed'; } catch (error) { return error.status; } });
    check('backend Sync still denies staff', denied === 403, denied);

    await page.selectOption('#moduleMake', 'Workbook Solar', { force: true });
    await page.selectOption('#inverterMake', 'Workbook Inverter', { force: true });
    await page.selectOption('#cableMake', 'Workbook Cable', { force: true });
    await page.waitForFunction(() => Render.lastState && Render.lastState.moduleMake === 'Workbook Solar' && Render.lastState.inverterMake === 'Workbook Inverter');
    await page.evaluate(() => { StateStore.applyForm({ custName: 'Staff Permission QA' }); Render.renderAll(); __qsSaveNow(); });
    const proposal = await page.evaluate(() => Proposals.activeId());
    check('staff can still save a quotation', !!proposal, proposal);
    await page.reload();
    await page.waitForFunction(() => Render.lastState && Render.lastState.moduleMake === 'Workbook Solar');
    check('staff quotation survives reload', await page.locator('#moduleMake').inputValue() === 'Workbook Solar');

    const postsBeforeTouch = posts;
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      await page.click('#catalogueStatusLink');
      await page.tap('#syncCatalogueBtn', { force: true });
      check('staff card fits mobile ' + width, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && eqCatalog.scrollWidth <= eqCatalog.clientWidth + 2));
    }
    check('mobile taps open no workbook and perform no Sync', staffTabs === 0 && posts === postsBeforeTouch);
    const shots = path.join(__dirname, 'shots', 'catalogue-permissions');
    fs.mkdirSync(shots, { recursive: true });
    await page.locator('#excelCataloguePanel').screenshot({ path: path.join(shots, 'staff-mobile.png') });
    await page.setViewportSize({ width: 1440, height: 1100 });

    mode = 'signin';
    await page.evaluate(() => ExcelCatalogue.refresh());
    await page.waitForFunction(() => catalogueHeaderStatus.textContent === 'Sign in');
    check('auth failure says sign in', await page.locator('#catalogueHeaderStatus').textContent() === 'Sign in');
    check('auth failure leaves Add/edit disabled', await page.locator('#openCatalogueExcel').getAttribute('aria-disabled') === 'true' && await page.locator('#openCatalogueExcel').getAttribute('href') === null);
    check('auth failure leaves Sync disabled', await page.locator('#syncCatalogueBtn').isDisabled());
    check('auth failure hides staff-only policy', !(await page.locator('#cataloguePermissionNotice').isVisible()));
    check('auth failure makes no permission claim', await page.locator('#openCatalogueExcel').getAttribute('title') === 'Catalogue status is not verified yet.');
    check('no uncaught page errors (staff)', errors.length === 0, errors.join(' | '));
    await staff.close();

    /* ---------- owner / elevated admin: both actions available ---------- */
    mode = 'admin'; posts = 0;
    const admin = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await routeApi(admin, base);
    const owner = await admin.newPage();
    await owner.goto(base + '/quotation.html');
    await owner.waitForFunction(() => window.ExcelCatalogue && catalogueStatusLink.dataset.state === 'up-to-date');
    check('admin Add/edit has a destination', await owner.locator('#openCatalogueExcel').getAttribute('href') === 'https://drive.google.com/file/d/admin-fixture/view');
    check('admin Add/edit is enabled', await owner.locator('#openCatalogueExcel').getAttribute('aria-disabled') === 'false');
    check('admin has no staff restriction note', !(await owner.locator('#cataloguePermissionNotice').isVisible()));
    check('admin Sync is enabled', !(await owner.locator('#syncCatalogueBtn').isDisabled()));
    await owner.click('#catalogueStatusLink');
    await owner.locator('#openCatalogueExcel').scrollIntoViewIfNeeded();
    const tab = admin.waitForEvent('page');
    await owner.click('#openCatalogueExcel');
    const workbook = await tab;
    await workbook.waitForLoadState();
    check('admin Add/edit opens the workbook', workbook.url() === 'https://drive.google.com/file/d/admin-fixture/view', workbook.url());
    await workbook.close();
    await owner.bringToFront();
    await owner.click('#syncCatalogueBtn');
    await owner.waitForFunction(() => catalogueStatusLink.dataset.state === 'up-to-date');
    check('admin Sync reaches the backend', posts === 1, posts);
    await admin.close();

    console.log(fail === 0 ? 'PASS: staff Add/edit + Sync denied in a real browser, catalogue/status/quotation intact; admin both actions available; auth failure truthful' : 'FAILED: ' + fail);
  } finally {
    await browser.close();
    server.close();
  }
  if (fail) process.exitCode = 1;
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
