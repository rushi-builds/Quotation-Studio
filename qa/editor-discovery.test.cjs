/* Isolated editor colour/search QA. Navigation must never execute an action,
 * enable conditional systems, or alter quotation/Finance values. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const {chromium} = require('playwright');
(async () => {
  const {default: chrome} = await import('@sparticuz/chromium');
  const browser = await chromium.launch({executablePath: await chrome.executablePath(), args: chrome.args.filter(a => a !== '--single-process'), headless: true});
  try {
    const page = await browser.newPage({viewport: {width:1440,height:1100}}), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.QA_BASE || 'http://127.0.0.1:8080') + '/quotation.html');
    await page.waitForFunction(() => Render.lastState && document.querySelector('.studio-input-cluster'));
    await page.evaluate(() => document.fonts.ready);
    const originalPdf = await page.evaluate(()=>[...document.querySelectorAll('.page')].map(p=>p.innerHTML));
    const original = await page.evaluate(() => JSON.stringify({form:StateStore.collectForm(), finance:Finance.compute(Render.lastState)}));
    const shots = path.join(__dirname, 'shots', 'editor-discovery'); fs.mkdirSync(shots, {recursive:true});
    async function search(q) {await page.locator('#studioSearch').fill(q);}
    async function result(id) { const r = page.locator('#studioSearchResults [data-search-target="'+id+'"]'); await r.waitFor(); return r; }
    async function jump(q,id) { await search(q); await (await result(id)).click(); }
    const layout = await page.evaluate(() => ({
      sections:[...document.querySelectorAll('.studio-section')].map(e => ({tone:e.dataset.tone,bg:getComputedStyle(e.querySelector(':scope>summary')).backgroundColor})),
      groups:[...document.querySelectorAll('[data-section="moduleMake"] .studio-input-cluster')].map(e=>e.querySelector('h3').textContent),
      inverter:document.querySelector('#inverterKw').closest('.studio-input-cluster').querySelector('h3').textContent,
      module:document.querySelector('#moduleTech').closest('.studio-input-cluster').querySelector('h3').textContent,
      unique:[...document.querySelectorAll('#quoteForm input[id],#quoteForm select[id],#quoteForm textarea[id]')].every(e=>document.querySelectorAll('#'+CSS.escape(e.id)).length===1)
    }));
    assert.equal(layout.sections.length,13); assert(layout.sections.every(e=>e.tone));
    assert(new Set(layout.sections.map(e=>e.bg)).size>=5); assert.equal(layout.groups.length,5);
    assert.equal(layout.inverter,'Inverter'); assert.equal(layout.module,'Modules'); assert(layout.unique,JSON.stringify(await page.evaluate(()=>Object.keys(StateStore.DEFAULTS).filter(id=>document.querySelectorAll('#'+CSS.escape(id)).length!==1))));
    console.log('PASS: 13 softly colour-coded sections; five labelled equipment groups; original IDs and mixed-row fields intact');
    await page.screenshot({path:path.join(shots,'overview.png')});
    await jump('module make','moduleMake'); assert.equal(await page.evaluate(()=>document.activeElement.id),'moduleMake');
    await page.setViewportSize({width:1440,height:1900});
    await page.evaluate(()=>{const p=document.querySelector('.form-panel'),s=document.querySelector('[data-section="moduleMake"]');p.scrollTop+=s.getBoundingClientRect().top-135;});
    await page.screenshot({path:path.join(shots,'equipment.png'),clip:{x:0,y:0,width:438,height:1800}});
    await page.setViewportSize({width:1440,height:1100});
    await jump('Polycab','cableMake'); assert.equal(await page.evaluate(()=>document.activeElement.id),'cableMake');
    await jump('Sungrow','inverterMake');
    await jump('DC cable size','dcCableSizeMm2'); assert.equal(await page.evaluate(()=>document.activeElement.id),'dcCableSizeMm2');
    assert(await page.locator('#advancedWrap').evaluate(e=>e.open));
    await jump('Public destination','galleryUrl');
    await search('₹'); await result('costPerWp');
    await search('GST %'); await result('gstPercent');
    await search('price'); await result('costPerWp');
    await search('wiring'); await result('cableMake');
    await search('SMART'); await result('stateTopUp');
    await search('projects portfolio heading'); await page.locator('#studioSearchResults button').first().click();
    assert(await page.evaluate(()=>!!document.activeElement.closest('#advancedPanel')));
    console.log('PASS: dropdown option brands, tiny engineering fields, QR and nested content editor search');
    await search('module');
    const count = await page.locator('#studioSearchResults li').count(); assert(count>8);
    assert((await page.locator('#studioSearchResults>p').textContent()).startsWith(count+' matching'));
    await page.locator('.studio-search').screenshot({path:path.join(shots,'search-field.png')});
    await page.screenshot({path:path.join(shots,'search-results.png')});
    // Every ID-bearing editable setting, including inactive conditional controls,
    // remains discoverable. Internal type=hidden state and legacy pickers excluded.
    const coverage = await page.evaluate(() => {
      const expected=[...document.querySelectorAll('.form-panel input,.form-panel select,.form-panel textarea')]
        .filter(e=>e.id&&!e.matches('[type="hidden"],#studioSearch,#systemEnabled,#bessEnabled,#systemTemplate'));
      const missing=[];
      for (const e of expected) {
        studioSearch.value=e.id;studioSearch.dispatchEvent(new Event('input',{bubbles:true}));
        if(![...document.querySelectorAll('#studioSearchResults [data-search-target]')].some(b=>b.dataset.searchTarget===e.id))missing.push(e.id);
      }
      return {count:expected.length,missing};
    });
    assert.deepEqual(coverage.missing,[]); console.log('PASS: all '+coverage.count+' ID-bearing controls discoverable, no eight-result cutoff');
    await jump('bessLoad','bessLoad');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'advancedSystemSelect');
    assert(await page.locator('.studio-search-notice').isVisible());
    assert.equal(await page.locator('#advancedSystemSelect').inputValue(),'none');
    await jump('Custom module make','moduleMakeCustom');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'moduleMake');
    assert(await page.locator('#moduleMakeCustom').isDisabled());
    console.log('PASS: hidden BESS/custom settings lead to setup; no auto-enable or unhide');
    await page.evaluate(()=>{window.__resetClicked=false;resetBtn.addEventListener('click',()=>{window.__resetClicked=true;});});
    await jump('Reset current proposal','resetBtn');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'resetBtn');
    assert.equal(await page.evaluate(()=>window.__resetClicked),false);
    await jump('up_cover','up_cover');
    assert(await page.evaluate(()=>document.activeElement.matches('label[for="up_cover"]')));
    console.log('PASS: action and upload searches locate controls without running reset or opening file dialog');
    await page.evaluate(()=>{custName.value='PrivateNeedle903231';});
    await search('PrivateNeedle903231'); assert.equal(await page.locator('#studioSearchResults button').count(),0);
    await page.evaluate(()=>{custName.value=Render.lastState.custName||'';});
    await search('not-a-real-setting-zzz'); assert((await page.locator('#studioSearchResults').textContent()).includes('No matching settings'));
    await page.locator('#studioSearch').press('Escape'); assert.equal(await page.locator('#studioSearch').inputValue(),'');
    await search('module make'); await page.locator('#studioSearch').press('ArrowDown');
    assert(await page.evaluate(()=>document.activeElement.matches('#studioSearchResults button')));
    await page.keyboard.press('ArrowUp'); assert.equal(await page.evaluate(()=>document.activeElement.id),'studioSearch');
    await page.locator('#studioSearch').press('Enter'); assert.equal(await page.evaluate(()=>document.activeElement.id),'moduleMake');
    assert.equal(await page.evaluate(()=>JSON.stringify({form:StateStore.collectForm(),finance:Finance.compute(Render.lastState)})),original);
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.page')].map(p=>p.innerHTML)),originalPdf);
    console.log('PASS: keyboard navigation, Escape/no-result states, no customer-value indexing, unchanged quotation & Finance');
    // Even unlabeled, ID-less library row controls have a metadata label.
    await page.evaluate(()=>{
      EquipmentStore.cat().modules.push({id:'discovery-library-probe',make:'QA library probe',wp:600,lengthMm:2300,widthMm:1134,tech:'QA tech'});
      EquipmentStore.save();
      EquipmentStore.renderManager(document.getElementById('eqCatalog'));
    });
    await search('module library row rating');
    assert(await page.locator('#studioSearchResults button').count()>0);
    // Late-added options are indexed on the next query, not a stale startup cache.
    await page.evaluate(()=>cableMake.add(new Option('QA late option','qa-late')));
    await search('QA late option'); await result('cableMake');
    await page.setViewportSize({width:390,height:844});
    await search('inverter'); assert(await page.locator('#studioSearchResults').isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(shots,'mobile-search.png')});
    assert.equal(await page.locator('.page [data-tone],.page .studio-input-cluster').count(),0);
    assert.deepEqual(errors,[]);console.log('PASS: live option refresh, mobile width and zero browser errors; PDF markup untouched');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
