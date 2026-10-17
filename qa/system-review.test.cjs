'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const {default:c}=await import('@sparticuz/chromium');
 const browser=await chromium.launch({executablePath:await c.executablePath(),args:c.args.filter(a=>a!=='--single-process'),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
  let accept=true,dialogs=0;page.on('dialog',d=>{dialogs++;accept?d.accept():d.dismiss();});page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';await page.goto(base+'/quotation.html');await page.waitForFunction(()=>!!window.Render?.lastState);
  await page.locator('[data-section=systemEnabled]>summary').click();await page.locator('[data-system-choice=yes]').click();
  await page.waitForFunction(()=>Render.lastState.systemTemplate==='weatherproof');
  assert.equal(await page.locator('#systemReview').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#systemReviewItems li[data-state=pending]').count(),3);
  await page.selectOption('#systemTemplate','carport');await page.waitForFunction(()=>Render.lastState.systemTemplate==='carport');assert.equal(dialogs,0,'untouched generated scope must switch without a confirmation');
  const equipment=await page.evaluate(()=>{const s=Render.lastState,f=Finance.compute(s);return {text:systemOverviewBody.querySelector('.sp-linked-equipment').textContent,qty:f.moduleCount,w:f.moduleWattage,inverter:s.inverterMake};});
  assert(equipment.text.includes(equipment.qty+' × '+equipment.w+' Wp')&&equipment.text.includes(equipment.inverter));
  await page.locator('#systemReview>summary').click();await page.locator('[data-system-review-target=systemScopeReviewed]').click();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'systemScopeReviewed');assert(await page.locator('#systemEditDetails').evaluate(el=>el.open));
  await page.locator('#systemAreaM2').fill('48');await page.locator('#systemHeightM').fill('2.8');await page.locator('#systemBays').fill('2');await page.locator('#systemScopeReviewed').check();
  await page.locator('#systemPrice').fill('125000');await page.waitForFunction(()=>document.getElementById('systemReview').dataset.state==='reviewed');
  const finance=await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState)));
  await page.selectOption('#systemPriceMode','included');await page.waitForFunction(()=>document.getElementById('systemBaseReviewField').checkVisibility());
  assert.equal(await page.locator('#systemBaseReviewed').isChecked(),false);await page.locator('#systemBaseReviewed').check();
  await page.waitForFunction(()=>document.getElementById('systemReview').dataset.state==='reviewed');
  assert.equal(await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState))),finance,'review/price mode must not add costs');
  accept=false;await page.selectOption('#systemTemplate','pergola');accept=true;await page.waitForFunction(()=>document.getElementById('systemTemplate').value==='carport');
  assert(await page.locator('#systemBaseReviewed').isChecked());assert(await page.locator('#systemScopeReviewed').isChecked());
  await page.locator('#systemScope').fill('Customer agreed parking scope');await page.waitForFunction(()=>!Render.lastState.systemScopeReviewed&&!Render.lastState.systemBaseReviewed);
  assert(await page.locator('#systemReviewItems li[data-state=pending]').count()>=2);
  await page.locator('#systemScopeReviewed').check();await page.locator('#systemBaseReviewed').check();
  await page.evaluate(()=>__qsSaveNow());await page.reload();await page.waitForFunction(()=>Render.lastState?.systemBaseReviewed===true&&Render.lastState.systemScopeReviewed===true);
  await page.evaluate(()=>{StateStore.applyForm({systemBaseReviewed:'false',systemScopeReviewed:'true'});Render.renderAll();});
  assert(!(await page.locator('#systemBaseReviewed').isChecked())&&!(await page.locator('#systemScopeReviewed').isChecked()));
  console.log('PASS: linked equipment, three-field minimal view, actionable review, no auto approvals, strict imported flags, cancel safety, scope invalidation, save/reload and Finance isolation');
  await page.evaluate(()=>{document.querySelector('[data-section=systemEnabled]').open=true;document.querySelector('[data-section=bessEnabled]').open=true;});
  await page.locator('[data-system-choice=no]').click();await page.locator('[data-bess-choice=yes]').click();await page.selectOption('#bessModel','pylon-us5000');
  await page.waitForFunction(()=>Render.lastState.bessSpecMode==='auto'&&Number(Render.lastState.bessCapacity)>0);
  assert(await page.locator('#systemReviewItems').textContent().then(t=>t.includes('Battery installed price pending')&&t.includes('Outage backup is not yet established')));
  assert.equal(await page.locator('#systemFields').evaluate(el=>el.hidden),true);
  await page.locator('#systemReview').evaluate(el=>el.open=true);
  await page.locator('#systemReview [data-system-review-target=bessCost]').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'bessCost');
  await page.locator('#bessCost').fill('150000');await page.waitForFunction(()=>Render.lastState.bessCost==='150000');
  await page.selectOption('#bessModel','pylon-us2000c');await page.waitForFunction(()=>Render.lastState.bessCost==='');
  assert((await page.locator('#systemReviewItems').textContent()).includes('Battery installed price pending'));
  console.log('PASS: independent battery-only selection, catalogue auto-sizing, pending backup/price review, action links and model-change price reset');
  // Capture an ordinary combined proposal without asserting engineering approval.
  await page.evaluate(()=>{StateStore.applyForm({...StateStore.DEFAULTS,custName:'Sample solar project',propRef:'KTM-SAMPLE-001',propDate:'2026-10-17',systemEnabled:true,systemTemplate:'carport',systemPrice:'125000'});Render.renderAll();document.querySelector('[data-section=systemEnabled]').open=true;document.querySelector('[data-section=bessEnabled]').open=false;document.getElementById('systemReview').open=false;});
  const folder=path.join(__dirname,'shots','system-review');fs.mkdirSync(folder,{recursive:true});
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>Render.fitPages());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('[data-section=systemEnabled]').screenshot({path:path.join(folder,'controls-minimal.png')});
  await page.locator('#systemReview>summary').click();assert(!(await page.locator('#pdfFab').isVisible()));await page.locator('[data-section=systemEnabled]>summary').click();assert(await page.locator('#pdfFab').isVisible());await page.locator('[data-section=systemEnabled]>summary').click();await page.locator('[data-section=systemEnabled]').screenshot({path:path.join(folder,'controls-review.png')});
  await page.setViewportSize({width:1440,height:1100});await page.evaluate(()=>Render.fitPages());
  for(const id of ['pageSystemOverview','pageSystemDetail']){
   const png=await page.evaluate(async id=>{await document.fonts.ready;await Promise.all([...document.getElementById(id).querySelectorAll('img')].map(im=>im.decode()));const copy=document.getElementById(id).cloneNode(true);copy.style.transform='none';const host=document.createElement('div');host.className='pdf-snapshot';host.append(copy);document.body.append(host);try{return(await html2canvas(copy,{scale:1.2,logging:false,backgroundColor:'#fff'})).toDataURL();}finally{host.remove();}},id);
   fs.writeFileSync(path.join(folder,id+'.png'),Buffer.from(png.split(',')[1],'base64'));
  }
  await page.evaluate(()=>__qsSaveNow());const id=await page.evaluate(()=>Proposals.activeId()),share=await context.newPage();
  await share.goto(base+'/share.html?p='+encodeURIComponent(id));await share.waitForFunction(()=>!!window.Render?.lastState);
  assert(await share.evaluate(()=>document.getElementById('systemOverviewBody').textContent.includes('Solar modules')&&(!document.getElementById('systemReview')||!document.getElementById('systemReview').checkVisibility())));await share.close();
  const download=page.waitForEvent('download');await page.evaluate(()=>Exporter.exportPdf(()=>{},{format:'system'}));const file=await download;const report=path.join(folder,'carport-report.pdf');await file.saveAs(report);assert.equal((fs.readFileSync(report,'latin1').match(/\/Type \/Page\b/g)||[]).length,2);
  assert.deepEqual(errors,[]);console.log('PASS: clean mobile controls/review and customer report screenshots; linked equipment survives Customer View; preparer checklist stays private');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
