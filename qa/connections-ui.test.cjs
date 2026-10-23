/* Settings Connections: real authenticated local Dashboard, disposable JSON store.
   No production credentials, provider requests, live sends or migrations.
   NODE_PATH=<qa deps> node qa/connections-ui.test.cjs
   CHROMIUM_PATH is optional; serverless Chromium uses a multi-process launch. */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-connections-ui-'));
const shots = path.join(__dirname, 'shots/connections');
fs.mkdirSync(shots, { recursive: true });
let child, browser, passed = 0;
const errors = [];
function check(name, condition, detail = '') {
  assert.ok(condition, `${name}: ${detail}`); passed++; console.log('  ok - ' + name);
}
(async () => {
  const reserve = net.createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const api = async (method, route, body) => {
    const response = await fetch(origin + route, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    assert.ok(response.ok, `fixture API ${route}: ${response.status}`);
    return response.json();
  };
  try {
    child = spawn(process.execPath, ['platform/local-server/server.js'], {
      cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', QS_DATA_DIR: data, GEMINI_ENABLED: 'false', OWNER_EMAIL: '', ADMIN_EMAIL: '' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Local platform startup timeout')), 15000);
      child.stdout.on('data', text => { if (String(text).includes('platform')) { clearTimeout(timeout); resolve(); } });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(Error('Local platform exited: ' + code)); });
    });
    const sessions = {};
    for (const role of ['owner', 'sales', 'viewer']) {
      const email = `connections-${role}@example.test`;
      const password = 'Disposable-Review!123';
      const reg = await api('POST', '/api/auth/register', { name: 'Connections review ' + role, email, password, role: 'Sales' });
      const dbPath = path.join(data, 'db.json');
      const store = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      store.users.find(user => user.id === reg.user.id).role = role;
      fs.writeFileSync(dbPath, JSON.stringify(store));
      sessions[role] = (await api('POST', '/api/auth/login', { email, password })).token;
    }
    let launch = { headless: true };
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (process.platform === 'win32') launch.channel = 'chrome';
    else {
      const bundled = require('@sparticuz/chromium');
      const c = bundled.default || bundled;
      launch = { ...launch, executablePath: await c.executablePath(), args: c.args.filter(arg => arg !== '--single-process') };
    }
    browser = await chromium.launch(launch);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    await ctx.addInitScript(token => { localStorage.setItem('qs.sessionToken', token); localStorage.setItem('qs.dashboard.theme', 'light'); }, sessions.owner);
    const p = await ctx.newPage();
    p.on('pageerror', error => errors.push(error.message));
    const mutations = [], providerRequests = [];
    let record = false;
    p.on('request', request => {
      if (record && request.url().startsWith(origin + '/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(request.method() + ' ' + request.url());
      if (!request.url().startsWith(origin) && /^https?:/.test(request.url())) providerRequests.push(request.url());
    });
    await p.goto(origin + '/dashboard.html?panel=settings&section=connections');
    await p.waitForSelector('#panel-settings.on #settingsConnections:not([hidden])');
    await p.waitForFunction(() => window.__businessPulseReady === true);
    record = true;
    const nav = await p.locator('.settings-nav [data-settings]').allTextContents();
    check('Connections is directly below Team & roles', nav.map(text => text.replace('→', '').trim()).join('|') === 'Profile|Security|Team & roles|Connections');
    check('one and only one Connections section exists', await p.locator('[data-settings-section="connections"]').count() === 1);
    check('deep link selects accessible Settings navigation state', await p.locator('[data-settings="connections"]').getAttribute('aria-current') === 'page');
    check('eight service cards, not fabricated account records', await p.locator('.sc-service').count() === 8);
    check('all services truthfully show Not connected', (await p.locator('.sc-service .sc-status').allTextContents()).every(text => text === 'Not connected'));
    check('all connect buttons disabled', await p.locator('.sc-connect[disabled]').count() === 8);
    check('additional accounts disabled without persistence', await p.locator('#connectionsAdd button').isDisabled());
    check('blank Add card is inside the grid immediately after Outlook Calendar', await p.locator('#connectionsAdd').evaluate(element => element.parentElement.id === 'connectionsGrid' && element.previousElementSibling.dataset.service === 'outlook-calendar'));
    const outlookBox = await p.locator('[data-service="outlook-calendar"]').boundingBox();
    const addBox = await p.locator('#connectionsAdd').boundingBox();
    check('desktop Add card sits to the right of Outlook Calendar in the same row', Math.abs(addBox.y - outlookBox.y) < 2 && addBox.x > outlookBox.x);
    check('old full-width account banner is gone', !/More than one account|Additional services and accounts will be managed here/.test(await p.locator('#settingsConnections').textContent()));
    check('no credential or fake preference forms in hub', await p.locator('#settingsConnections input:not([type="search"]),#settingsConnections form').count() === 0);
    check('no provider-management dropdown added to main app sidebar', await p.locator('.side-nav [data-panel="connections"]').count() === 0);
    check('unavailable account-linking note is visible', await p.locator('.sc-availability').isVisible());
    check('all brand icons load locally', await p.locator('.sc-logo img').evaluateAll(images => images.length === 8 && images.every(image => image.complete && image.naturalWidth > 0 && new URL(image.src).origin === location.origin)));
    await p.screenshot({ animations: 'disabled', timeout: 60000, path: path.join(shots, 'connections-desktop-light.png'), fullPage: true });

    for (const [category, expected] of [['Email', 2], ['Messaging', 1], ['Social', 2], ['Calendars', 2], ['Analytics', 1]]) {
      await p.click(`[data-connection-category="${category}"]`);
      check(`${category} filter returns only its services`, await p.locator('.sc-service').count() === expected);
    }
    await p.click('[data-connection-category="All services"]');
    await p.fill('#connectionsSearch', '  outlook  ');
    check('search ignores case and edge whitespace', await p.locator('.sc-service').count() === 2);
    check('additional account CTA is hidden in filtered results', !await p.locator('#connectionsAdd').isVisible());
    await p.fill('#connectionsSearch', 'no matching provider');
    check('empty results are explicit', await p.locator('.sc-no-results').isVisible());
    await p.click('[data-connections-reset]');
    check('clear filters restores full catalogue', await p.locator('.sc-service').count() === 8 && await p.locator('#connectionsSearch').inputValue() === '');
    check('clear filters returns keyboard focus to search', await p.locator('#connectionsSearch').evaluate(element => element === document.activeElement));
    await p.fill('#connectionsSearch', '<img src=x onerror=alert(1)>');
    check('search text cannot inject HTML', await p.locator('#connectionsGrid img').count() === 0 && await p.locator('.sc-no-results').isVisible());
    await p.click('[data-connections-reset]');

    for (const id of ['gmail', 'outlook', 'whatsapp', 'instagram', 'linkedin', 'website', 'google-calendar', 'outlook-calendar']) {
      await p.click(`[data-connection-details="${id}"]`);
      await p.waitForSelector('#connectionDetails[open]');
      check(`${id} details explain real prerequisites without requesting credentials`, await p.locator('.sc-requirement').isVisible() && await p.locator('#connectionDetails input,#connectionDetails form').count() === 0);
      await p.keyboard.press('Escape');
      check(`${id} dialog closes and restores focus`, !await p.locator('#connectionDetails').isVisible() && await p.locator(`[data-connection-details="${id}"]`).evaluate(element => element === document.activeElement));
    }
    await p.click('[data-connection-details="gmail"]');
    check('Gmail information distinguishes recovery SMTP from inbox integration', /Password-recovery email delivery is separate/.test(await p.locator('.sc-requirement').textContent()));
    await p.screenshot({ animations: 'disabled', timeout: 60000, path: path.join(shots, 'connections-details.png') });
    await p.click('#connectionDetails [data-close-connection]');
    await p.locator('.sc-access summary').click();
    check('privacy rules labelled future requirements, not granted permissions', /requirements for future connections/.test(await p.locator('.sc-access-body').textContent()));

    for (const name of ['profile', 'security', 'team', 'connections']) {
      await p.click(`[data-settings="${name}"]`);
      check(`${name} navigation shows only one Settings section`, await p.locator('[data-settings-section]:visible').count() === 1 && await p.locator(`[data-settings-section="${name}"]`).isVisible());
    }
    await p.click('.side-nav .nav-group > summary');
    await p.click('.side-nav [data-panel="sales"]');
    await p.click('#ghTabs [data-bi-tab="connections"]');
    check('Pulse exposes read-only channel status', await p.locator('.sc-pulse-status').isVisible());
    check('Pulse has no duplicate management cards, storage form or setup controls', await p.locator('#panel-sales .bi-connections,#panel-sales .pg-add-card,#panel-sales .pulse-storage-card,#biConnectionForm').count() === 0);
    await p.click('#panel-sales [data-open-connections]');
    check('Pulse shortcut opens Settings and focuses Connections heading', await p.locator('#settingsConnections').isVisible() && await p.locator('#connectionsTitle').evaluate(element => element === document.activeElement));
    // Removing a disabled attribute must still not create a network write.
    await p.locator('.sc-connect').first().evaluate(button => { button.disabled = false; button.click(); button.disabled = true; });
    check('connection UI emits no mutation requests, even if a disabled button is forced', mutations.length === 0, mutations.join(', '));
    check('no external provider requests or remote brand assets', providerRequests.length === 0, providerRequests.join(', '));
    await p.reload();
    await p.waitForSelector('#panel-settings.on #settingsConnections:not([hidden])');
    check('reload preserves deep-link route and honest connection states', await p.locator('.sc-connect[disabled]').count() === 8);
    await p.goto(origin + '/dashboard.html?panel=settings&section=invalid');
    await p.waitForSelector('#panel-settings.on');
    check('unknown Settings section fails safely to Profile', await p.locator('[data-settings-section="profile"]').isVisible());

    for (const [appearance, width, height] of [['light', 390, 844], ['dark', 1440, 1050], ['system', 1440, 1050]]) {
      await p.setViewportSize({ width, height });
      await p.goto(origin + '/dashboard.html?panel=settings&section=connections');
      await p.waitForSelector('#settingsConnections .sc-service');
      await p.selectOption('#dashboardTheme', appearance);
      check(`${appearance} appearance is respected`, await p.locator('html').getAttribute('data-appearance') === appearance);
      const overflow = await p.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, offenders: [...document.querySelectorAll('#panel-settings *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1 && element.getBoundingClientRect().width > 0).slice(0, 8).map(element => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right })) }));
      check(`${appearance} layout has no horizontal overflow`, overflow.scroll <= overflow.width, JSON.stringify(overflow));
      check(`${appearance} cards do not overflow their container`, await p.locator('.sc-service').evaluateAll(cards => cards.every(card => card.scrollWidth <= card.clientWidth + 1)));
      await p.screenshot({ animations: 'disabled', timeout: 60000, path: path.join(shots, `connections-${appearance}-${width}.png`), fullPage: true });
    }
    for (const role of ['sales', 'viewer']) {
      const roleCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await roleCtx.addInitScript(token => localStorage.setItem('qs.sessionToken', token), sessions[role]);
      const page = await roleCtx.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin + '/dashboard.html?panel=settings&section=connections');
      await page.waitForSelector('#settingsConnections .sc-service');
      check(`${role} can view catalogue but cannot connect or grant permissions`, await page.locator('.sc-connect[disabled]').count() === 8 && await page.locator('#settingsConnections select').count() === 0);
      await roleCtx.close();
    }
    const expired = await browser.newContext();
    await expired.addInitScript(() => localStorage.setItem('qs.sessionToken', 'invalid-session'));
    const page = await expired.newPage();
    await page.goto(origin + '/dashboard.html?panel=settings&section=connections');
    await page.waitForURL('**/index.html');
    check('expired session cannot bypass auth via Settings deep link', /index\.html/.test(page.url()));
    await expired.close();
    check('zero browser runtime errors', errors.length === 0, errors.join(' | '));
    console.log(`RESULT: ${passed} passed, 0 failed`);
  } finally {
    if (browser) await browser.close();
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await exited;
    }
    fs.rmSync(data, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
