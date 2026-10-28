/* Focused editor regression. Serve the repo at QA_BASE (default :8080).
 * All API requests are intercepted; no account, cloud record or Sync is used. */
'use strict';
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const fixture = require('./legacy-proposal-fixture.cjs');
(async () => {
  const {default: chrome} = await import('@sparticuz/chromium');
  const browser = await chromium.launch({executablePath: await chrome.executablePath(), args: chrome.args.filter(a => a !== '--single-process'), headless: true});
  try {
    const context = await browser.newContext({viewport: {width:1440, height:1050}});
    const writes = [], errors = [];
    await context.route('**/api/**', route => {
      if (route.request().method() !== 'GET') writes.push(route.request().url());
      return route.fulfill({status:404, contentType:'application/json', body:JSON.stringify({error:'Offline disposable QA fixture'})});
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
    await page.goto(base + '/quotation.html');
    await page.waitForFunction(() => window.Render?.lastState && document.querySelector('.studio-ready'));
    async function checkRetiredUI() {
      assert.equal(await page.locator('.studio-management').count(), 0);
      assert.equal(await page.locator('#legacyProposalManagement').isVisible(), false);
      assert(await page.evaluate(() => legacyProposalManagement.hidden && legacyProposalManagement.inert));
      assert(await page.locator('#proposalSelect').isVisible());
      assert(await page.locator('.studio-secondary #custViewBtn').isVisible());
      assert.equal(await page.locator('#legacyProposalManagement #custViewBtn').count(), 0);
      for (const id of ['pmNew','pmDup','pmVersion','pmDelete','waShare','pmStatus','pmUpdated','pmMeta','pmTimeline']) {
        assert.equal(await page.locator('#'+id).isVisible(), false, id+' must not be exposed');
      }
      // Inert legacy hooks cannot take focus even through a direct focus call.
      assert(await page.evaluate(() => { studioSearch.focus(); pmNew.focus(); return document.activeElement === studioSearch; }));
      for (const query of ['pmNew', 'pmDup', 'pmVersion', 'pmDelete', 'pmStatus', 'waShare', 'new version']) {
        await page.locator('#studioSearch').fill(query);
        assert.equal(await page.locator('#studioSearchResults [data-search-target="pmNew"],#studioSearchResults [data-search-target="pmDup"],#studioSearchResults [data-search-target="pmVersion"],#studioSearchResults [data-search-target="pmDelete"],#studioSearchResults [data-search-target="pmStatus"],#studioSearchResults [data-search-target="waShare"]').count(), 0);
      }
      // Conditional settings must remain discoverable (do not filter all hidden controls).
      await page.locator('#studioSearch').fill('bess capacity');
      assert(await page.locator('#studioSearchResults [data-search-target="bessCapacity"]').count() > 0);
      await page.locator('#studioSearch').fill('customer view');
      assert.equal(await page.locator('#studioSearchResults [data-search-target="custViewBtn"]').count(), 1);
      await page.locator('#studioSearch').fill('');
    }
    await checkRetiredUI();
    console.log('PASS: retired manager absent from visible UI, focus and search; selector, Customer view and conditional search retained');

    await page.locator('#custName').fill('Original saved proposal');
    await page.waitForFunction(() => Proposals.active().form.custName === 'Original saved proposal');
    const original = await page.evaluate(() => {
      __qsSaveNow();
      const id = Proposals.activeId();
      Proposals.saveAsVersion(id);
      return id;
    });
    await fixture(page, 'pmNew');
    await page.locator('#custName').fill('Autosaved working proposal');
    await page.waitForFunction(() => Proposals.active().form.custName === 'Autosaved working proposal');
    const before = await page.evaluate(() => ({active:Proposals.activeId(), records:Proposals.list().map(p=>Proposals.get(p.id))}));
    const activeForm = before.records.find(p=>p.id===before.active).form;
    await page.reload();
    await page.waitForFunction(() => window.Render?.lastState?.custName === 'Autosaved working proposal' && document.querySelector('.studio-ready'));
    const after = await page.evaluate(() => ({active:Proposals.activeId(), records:Proposals.list().map(p=>Proposals.get(p.id))}));
    assert.equal(after.active, before.active);
    assert.deepEqual(after.records.map(p=>p.id).sort(), before.records.map(p=>p.id).sort());
    for (const saved of before.records.filter(p=>p.id!==before.active)) {
      assert.deepEqual(after.records.find(p=>p.id===saved.id), saved, 'boot must not mutate inactive proposals or versions');
    }
    // Document Studio's transient search/edit helper inputs are regenerated on
    // render; compare persisted quotation source fields, not those DOM helpers.
    const sourceForm = form => Object.fromEntries(Object.entries(form).filter(([key])=>!key.startsWith('docEdit-') && key!=='docTextSearch'));
    assert.deepEqual(sourceForm(after.records.find(p=>p.id===before.active).form), sourceForm(activeForm));
    assert(before.records.some(p=>p.prevId===original), 'saved local version fixture exists');
    await page.selectOption('#proposalSelect', original);
    await page.waitForFunction(() => Render.lastState.custName === 'Original saved proposal');
    assert.equal(await page.locator('#custName').inputValue(), 'Original saved proposal');
    console.log('PASS: autosave/reload, existing records, immutable local versions and proposal switching preserved');

    const opened = context.waitForEvent('page');
    await page.locator('#custViewBtn').click();
    const customer = await opened;
    await customer.waitForFunction(() => window.Render?.lastState?.custName === 'Original saved proposal');
    assert.equal(new URL(customer.url()).searchParams.get('p'), original);
    await customer.close();
    for (const width of [390, 360]) {
      await page.setViewportSize({width, height:900});
      await checkRetiredUI();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, [], 'removing the drawer must not initiate cloud writes');
    console.log('PASS: Customer view works; 390/360px layouts have no overflow or restored drawer; no cloud writes or JS errors');
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode=1;});
