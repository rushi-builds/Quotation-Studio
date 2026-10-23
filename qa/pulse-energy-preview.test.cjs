/* Usage: QS_ENERGY_PREVIEW_URL=http://127.0.0.1:8091/review/pulse-energy/index.html node qa/pulse-energy-preview.test.cjs
   Serve only the isolated preview and its allowlisted local assets. No login or production API needed. */
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const base = process.env.QS_ENERGY_PREVIEW_URL || 'http://127.0.0.1:8091/review/pulse-energy/index.html';
(async () => {
  let chrome = require('@sparticuz/chromium'); chrome = chrome.default || chrome;
  const browser = await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args.filter(a=>a!=='--single-process'),headless:true});
  let passed=0; const errors=[],failed=[],api=[],mutations=[];
  const check=(name,value)=>{if(!value)throw new Error(name);console.log('PASS '+name);passed++;};
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)failed.push(`${r.status()} ${r.url()}`);});
    page.on('request',r=>{if(r.url().includes('/api/'))api.push(r.url());if(r.method()!=='GET')mutations.push(r.method()+' '+r.url());});
    await page.goto(base); await page.locator('.calendar-days').waitFor();await page.evaluate(()=>document.fonts.ready);
    check('persistent demo disclosure',await page.locator('#aboutPreview').innerText()==='Demo data');
    check('seven visual views',await page.locator('.pulse-tabs [role=tab]').count()===7);
    check('October 2026 has 31 selectable dates',await page.locator('[data-date]').count()===31);
    check('Thursday correctly starts October',await page.locator('.calendar-days > .calendar-empty').count()===3);
    check('default Friday 23 October',(await page.locator('.agenda-label strong').innerText()).replace(',','')==='Fri 23 Oct');
    check('three independent visual chart panels',await page.locator('.trend-panel,.source-panel,.pipeline-panel').count()===3);
    const points=await page.locator('[data-chart-day]').evaluateAll(els=>els.map(e=>Number(e.dataset.tip.match(/· (\d+)/)[1])));
    check('quotation summary matches plotted demo counts',points.reduce((a,b)=>a+b,0)===Number(await page.locator('.metric-body strong').first().innerText()));
    check('five weekly plot points',points.length===5);
    await page.locator('[data-date="18"]').click();
    check('date click changes agenda to correct Sunday',(await page.locator('.agenda-label strong').innerText()).replace(',','')==='Sun 18 Oct');
    check('empty date not invented activity',await page.locator('.agenda-empty').count()===1);
    await page.locator('[data-date="20"]').click();
    check('busy date exposes additional activity',await page.locator('[data-all-events]').count()===1);
    await page.locator('[data-all-events]').click();
    check('day detail includes won update',await page.locator('#detailDialog').innerText().then(t=>t.includes('Quotation marked won')));
    await page.keyboard.press('Escape');
    await page.locator('[data-chart-day="14"]').click();
    check('plot point selects its calendar date',await page.locator('.calendar-day.selected').getAttribute('data-date')==='14');
    await page.locator('[data-chart="value"]').click();
    check('value graph retains honest value definition',await page.locator('.chart-foot').innerText().then(t=>t.includes('not revenue')));
    await page.locator('[data-chart="quotes"]').click();
    await page.locator('#monthSelect').selectOption('2026-02');
    check('February correctly has 28 dates',await page.locator('[data-date]').count()===28);
    check('global period updates with calendar',await page.locator('#periodLabel').innerText()==='February 2026');
    await page.locator('[data-month-step="1"]').click();
    check('calendar arrow updates global month and URL',await page.locator('#monthSelect').inputValue()==='2026-03'&&page.url().includes('month=2026-03'));
    await page.locator('#monthSelect').selectOption('2026-10');
    await page.locator('[data-date="23"]').click();
    const shots=path.join(__dirname,'shots','pulse-energy');fs.mkdirSync(shots,{recursive:true});
    await page.screenshot({path:path.join(shots,'overview-desktop.png'),fullPage:true,animations:'disabled'});
    for(const view of ['desk','leads','performance','communications','automations','channels','overview']){
      await page.locator('.pulse-tabs [data-view="'+view+'"]').click();
      check(view+' opens with correct selected tab',await page.locator('#tab-'+view).getAttribute('aria-selected')==='true');
      check(view+' desktop no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.locator('.pulse-tabs [data-view="desk"]').click();
    await page.locator('[data-filter="Overdue"]').click();
    check('action filters show only matching sample',await page.locator('.action-item').count()===1);
    await page.locator('.action-item').click();await page.locator('[data-toggle-task]').click();
    check('demo completed state works',await page.locator('.action-check.done').count()===1);
    await page.locator('[data-add-action]').click();
    await page.locator('[name=title]').fill('<img src=/api/not-a-request>');await page.locator('[name=day]').fill('23');
    await page.locator('#demoActionForm [type=submit]').click();
    check('demo action is safely escaped text',await page.locator('.action-item').last().innerText().then(t=>t.includes('<img src=/api/not-a-request>')));
    check('no HTML injected by demo form',await page.locator('img[src="/api/not-a-request"]').count()===0);
    await page.reload();
    check('demo edits never persist',!await page.locator('body').innerText().then(t=>t.includes('<img src=/api/not-a-request>')));
    await page.keyboard.press('Control+k');await page.locator('#globalSearch').fill('survey');
    check('search finds sample actions',await page.locator('#searchResults').innerText().then(t=>t.includes('Confirm the site survey')));
    await page.keyboard.press('Escape');
    await page.locator('.pulse-tabs [data-view="overview"]').click();await page.locator('#tab-overview').focus();await page.keyboard.press('ArrowRight');
    check('keyboard tab navigation',await page.locator('#tab-desk').getAttribute('aria-selected')==='true');
    await page.locator('[data-date="23"]').focus();await page.keyboard.press('ArrowLeft');
    check('keyboard calendar navigation',await page.locator('.calendar-day.selected').getAttribute('data-date')==='22');
    await page.screenshot({path:path.join(shots,'desk-desktop.png'),fullPage:true,animations:'disabled'});
    for(const width of [390,768,1024]){
      await page.setViewportSize({width,height:844});
      for(const view of ['overview','desk','leads','performance','communications','automations','channels']){
        await page.goto(base+'?view='+view+'&month=2026-10');
        check(view+' '+width+'px no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        if(width===390&&view==='overview')await page.screenshot({path:path.join(shots,'overview-mobile.png'),fullPage:true,animations:'disabled'});
      }
    }
    await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base);
    check('reduced motion disables decorative animation',await page.locator('.hero-light').evaluate(e=>getComputedStyle(e).animationName)==='none');
    await page.locator('#aboutPreview').click();
    check('preview explanation is accessible',await page.locator('#detailDialog').isVisible());await page.keyboard.press('Escape');
    check('no runtime errors',errors.length===0);
    check('no failed images, fonts, scripts or styles',failed.length===0);
    check('no API access',api.length===0);
    check('no network mutations',mutations.length===0);
    check('no browser persistence',await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0));
    console.log(`${passed} checks passed`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
