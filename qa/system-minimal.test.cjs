/* Real minimal-input workflow and full, unobscured system imagery. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const {default:c}=await import('@sparticuz/chromium');
 const browser=await chromium.launch({executablePath:await c.executablePath(),args:c.args.filter(a=>a!=='--single-process'),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';
  await page.goto(base+'/quotation.html');await page.waitForFunction(()=>!!window.Render?.lastState);
  assert(await page.evaluate(()=>document.querySelector('[data-section="systemEnabled"] summary strong').textContent==='Advanced Systems'&&document.querySelector('[data-section="bessEnabled"]').closest('[data-section="systemEnabled"]')&&!document.querySelector('.supplement-downloads')));
  await page.locator('[data-section="systemEnabled"] > summary').click();
  await page.selectOption('#advancedSystemSelect','weatherproof');
  await page.waitForFunction(()=>Render.lastState.systemName==='Leak Proof Solar Roof');
  assert.equal(await page.locator('#systemTemplate').inputValue(),'weatherproof');
  assert.equal(await page.locator('#systemEditDetails').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#systemFields input:visible,#systemFields select:visible,#systemFields textarea:visible').count(),3);
  console.log('PASS: unified selector auto-fills Leak Proof; two pricing inputs plus optional collection switch, no duplicate downloads or separate BESS group');
  const folder=path.join(__dirname,'shots','system-minimal');fs.mkdirSync(folder,{recursive:true});
  for(const kind of ['weatherproof','carport','canopy','pergola']){
   await page.selectOption('#advancedSystemSelect',kind);await page.waitForFunction(key=>Render.lastState.systemTemplate===key,kind);
   const check=await page.evaluate(async()=>{
    await document.fonts.ready;const img=document.querySelector('#systemOverviewBody .sp-hero img');await img.decode();
    const s=Render.lastState,title=document.querySelector('#systemOverviewBody .sp-hero-copy'),body=systemOverviewBody;
    const ir=img.closest('.sp-hero').getBoundingClientRect(),tr=title.getBoundingClientRect(),footer=pageSystemOverview.querySelector('footer').getBoundingClientRect().top;
    return {name:AdditionalSystems.name(s),fit:getComputedStyle(img).objectFit,clear:tr.left>=ir.left&&tr.bottom<=ir.bottom+1&&tr.right<=img.getBoundingClientRect().left+1,blankFacts:!s.systemAreaM2&&!s.systemHeightM&&!s.systemBays&&!s.systemPrice,filled:['systemPurpose','systemEquipment','systemScope','systemExclusions','systemNotes','systemRoofing','systemDrainage','systemAcceptance'].every(id=>!!s[id]),fits:[...body.children].every(el=>el.getBoundingClientRect().bottom<footer-2),detailFits:[...systemDetailBody.children].every(el=>el.getBoundingClientRect().bottom<pageSystemDetail.querySelector('footer').getBoundingClientRect().top-2),noOldName:!body.textContent.includes('Weatherproof Solar Roof')};
   });
   assert.equal(check.fit,'contain');assert(check.clear&&check.blankFacts&&check.filled&&check.fits&&check.detailFits&&check.noOldName,JSON.stringify(check));
   const png=await page.evaluate(async()=>{const copy=pageSystemOverview.cloneNode(true);copy.style.transform='none';const host=document.createElement('div');host.className='pdf-snapshot';host.append(copy);document.body.append(host);try{return(await html2canvas(copy,{scale:1.2,logging:false,backgroundColor:'#fff'})).toDataURL();}finally{host.remove();}});
   fs.writeFileSync(path.join(folder,kind+'.png'),Buffer.from(png.split(',')[1],'base64'));
   console.log('PASS:',check.name,'— auto-filled scope/site proposals, full uncropped BESS-height photo with separate title, both pages fit; no invented dimensions or price');
  }
  await page.evaluate(()=>{StateStore.applyForm({...StateStore.DEFAULTS,systemEnabled:true,systemTemplate:'weatherproof',systemName:'Weatherproof Solar Roof'});Render.renderAll();__qsSaveNow();});
  await page.reload();await page.waitForFunction(()=>Render.lastState?.systemName==='Leak Proof Solar Roof');
  assert(await page.evaluate(()=>systemName.value==='Leak Proof Solar Roof'&&systemRoofing.value.length>0&&systemScope.value.length>0&&!pdfFormat.textContent.includes('Weatherproof Solar Roof')));
  const id=await page.evaluate(()=>Proposals.activeId()),share=await page.context().newPage();
  await share.goto(base+'/share.html?p='+encodeURIComponent(id));await share.waitForFunction(()=>Render.lastState?.systemName==='Leak Proof Solar Roof');
  assert(await share.evaluate(()=>systemDetailBody.textContent.includes('Inspect joints')&&!systemOverviewBody.textContent.includes('Weatherproof Solar Roof')));await share.close();
  await page.evaluate(()=>{document.querySelector('[data-section="systemEnabled"]').open=true;document.querySelector('[data-section="bessEnabled"]').open=true;});
  await page.selectOption('#advancedSystemSelect','bess');await page.selectOption('#bessModel','pylon-us5000');
  await page.waitForFunction(()=>Render.lastState.bessSpecMode==='auto'&&Number(Render.lastState.bessCapacity)>0);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>Render.fitPages());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&bessModel.closest('[data-section="systemEnabled"]')&&document.querySelector('[data-section="systemEnabled"] summary small').textContent.includes('Battery storage')));
  await page.evaluate(()=>{document.querySelector('[data-section="bessEnabled"]').open=false;document.querySelector('[data-section="systemEnabled"]').scrollIntoView({behavior:'instant',block:'start'});});
  await page.locator('[data-section="systemEnabled"]').screenshot({path:path.join(folder,'controls-mobile.png')});assert.deepEqual(errors,[]);
  console.log('PASS: legacy naming migration, incomplete saved preset auto-fill, reload, Customer View, unified BESS catalogue auto-sizing and mobile layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
