/* Focused Essentials / All settings presentation checks. Serve repo at QA_BASE.
 * API requests are intercepted; no production account or cloud data is used. */
'use strict';
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
  const {default: chrome} = await import('@sparticuz/chromium');
  const browser = await chromium.launch({executablePath:await chrome.executablePath(), args:chrome.args.filter(a=>a!=='--single-process'), headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1050}});
    const errors = [], writes = [];
    await context.route('**/api/**', route => {
      if (route.request().method() !== 'GET') writes.push(route.request().url());
      return route.fulfill({status:404, contentType:'application/json', body:'{"error":"Offline QA fixture"}'});
    });
    const page = await context.newPage(); page.on('pageerror', e=>errors.push(e.message));
    await page.goto((process.env.QA_BASE || 'http://127.0.0.1:8080')+'/quotation.html');
    await page.waitForFunction(()=>window.Render?.lastState && document.querySelector('.studio-input-cluster'));
    const snapshot = () => page.evaluate(()=>JSON.stringify({
      form:Object.fromEntries(Object.entries(StateStore.collectForm()).filter(([id])=>!id.startsWith('docEdit-')&&id!=='docTextSearch')),
      finance:Finance.compute(Render.lastState),
      pages:[...document.querySelectorAll('.page')].map(p=>p.innerHTML),
      inputs:Object.keys(StateStore.DEFAULTS).map(id=>[id,document.querySelectorAll('#'+CSS.escape(id)).length])
    }));
    const before = await snapshot();
    const visibleSections = () => page.evaluate(()=>[...document.querySelectorAll('.studio-section')].filter(d=>d.querySelector(':scope>summary').checkVisibility()).map(d=>d.dataset.section));
    const essential = await visibleSections();
    assert.equal(await page.locator('#modeEss').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#advancedWrap').evaluate(d=>d.open),false);
    assert(await page.locator('#advancedWrap>summary').isVisible());
    assert(essential.includes('moduleMake') && essential.includes('payAdvance'));
    assert(!essential.includes('companyName') && !essential.includes('tiltDeg'));

    await page.locator('#modeAll').focus(); await page.keyboard.press('Enter');
    const all = await visibleSections();
    assert.equal(await page.locator('#modeAll').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#modeEss').getAttribute('aria-pressed'),'false');
    assert(all.length>essential.length);
    for (const id of ['optName','bomModules','pvsystUrl','durationText','companyName','up_cover','tiltDeg']) assert(all.includes(id),id+' must be listed in All settings');
    assert(await page.locator('#advancedWrap').evaluate(d=>d.open));
    assert.equal(await page.locator('#advancedWrap>summary').isVisible(),false,'All settings is not another collapsed drawer');
    assert(await page.locator('#excelCataloguePanel>summary').isVisible());
    assert((await page.locator('#studioModeHint').textContent()).includes('Every settings section'));
    assert.equal(await snapshot(),before,'mode changes must not alter quotation fields, Finance, report or input identity');
    console.log(`PASS: Essentials lists ${essential.length} routine sections; keyboard-selected All settings lists ${all.length} sections plus catalogue inline`);

    // Switching modes never expands/resets every individual section.
    await page.evaluate(()=>{document.querySelector('[data-section="moduleMake"]').open=true;});
    await page.locator('#modeEss').click();
    assert.deepEqual(await visibleSections(),essential);
    assert(await page.locator('[data-section="moduleMake"]').evaluate(d=>d.open));
    // Essentials retains an explicit route to advanced setup and the catalogue.
    await page.locator('#advancedWrap>summary').click();
    assert(await page.locator('#excelCataloguePanel>summary').isVisible());
    await page.locator('#modeAll').click();
    await page.reload();
    await page.waitForFunction(()=>window.Render?.lastState && document.querySelector('.studio-input-cluster'));
    assert.equal(await page.locator('#modeAll').getAttribute('aria-pressed'),'true');
    assert.deepEqual(await visibleSections(),all);
    console.log('PASS: individual disclosure states survive toggles; advanced access remains in Essentials; saved All settings restores on reload');

    for (const width of [390,360]) {
      await page.setViewportSize({width,height:900});
      await page.locator('#modeEss').click(); assert.deepEqual(await visibleSections(),essential);
      await page.locator('#modeAll').click(); assert.deepEqual(await visibleSections(),all);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    // Search still reveals advanced fields without executing an action.
    await page.locator('#modeEss').click();
    await page.locator('#studioSearch').fill('company name');
    await page.locator('#studioSearchResults [data-search-target="companyName"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement.id),'companyName');
    assert.equal(await page.locator('#modeAll').getAttribute('aria-pressed'),'true');
    assert.deepEqual(await visibleSections(),all);
    assert.deepEqual(errors,[]); assert.deepEqual(writes,[]);
    console.log('PASS: 390/360px layouts, advanced search navigation and no cloud writes or runtime errors');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
