'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const {default:c}=await import('@sparticuz/chromium');
 const browser=await chromium.launch({executablePath:await c.executablePath(),args:c.args.filter(a=>a!=='--single-process'),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];let accept=true;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept():d.dismiss());
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';await page.goto(base+'/quotation.html');await page.waitForFunction(()=>!!window.Render?.lastState);
  await page.locator('[data-section=systemEnabled]>summary').click();
  assert.equal(await page.locator('label[for=advancedSystemSelect]').textContent(),'Select system');
  assert.equal(await page.locator('#advancedSystemSelect').inputValue(),'none');
  assert.equal(await page.locator('.studio-system-storage').count(),0);
  assert(!(await page.locator('#selectedBatteryFields').isVisible()));
  const finance=await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState)));
  const folder=path.join(__dirname,'shots','unified-systems');fs.mkdirSync(folder,{recursive:true});
  const select=async key=>{await page.selectOption('#advancedSystemSelect',key);await page.waitForFunction(key=>document.getElementById('advancedSystemSelect').value===key,key);};
  const fit=async()=>{
   const bad=await page.evaluate(()=>[...document.querySelectorAll('.bess-page,.system-page')].filter(p=>p.checkVisibility()).flatMap(p=>{const foot=p.querySelector('footer').getBoundingClientRect().top;return [...p.querySelector('.pg-body').children].filter(el=>el.getBoundingClientRect().bottom>foot-3).map(el=>p.id+': '+el.className);}));assert.deepEqual(bad,[],'all visible report content fits');
  };
  async function pdf(format,name,count){const pending=page.waitForEvent('download',{timeout:120000});await page.evaluate(format=>Exporter.exportPdf(()=>{},{format}),format);const dl=await pending,file=path.join(folder,name);await dl.saveAs(file);assert.equal((fs.readFileSync(file,'latin1').match(/\/Type \/Page\b/g)||[]).length,count);}
  await select('bess');await page.waitForFunction(()=>Render.lastState.bessSpecMode==='auto'&&Number(Render.lastState.bessCapacity)>0);
  assert(!(await page.locator('#systemFields').isVisible()));assert(await page.locator('#bessModel').isVisible());
  let values=await page.evaluate(()=>{const s=Render.lastState,f=Finance.compute(s),a=Bess.sizing(s,f),b=Bess.compute(s,f);return {s,a,b,card:selectedSystemCard.textContent,stored:StateStore.collectForm()};});
  assert.equal(Number(values.s.bessCapacity),values.a.units*values.a.model.rated);assert.equal(values.b.backupHours,null);assert.equal(values.b.cost,null);
  assert(values.card.includes('battery modules · automatic'));assert(values.card.includes('Catalogue-based')&&values.card.includes('Usable AC scenario'));assert(!('advancedSystemSelect' in values.stored));
  assert.equal(await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState))),finance);
  await page.locator('#bessAdditions').evaluate(el=>el.closest('details').open=true);
  const batteryNote='Project accessories and cable route to be agreed. <review> '+('Include customer-specific commissioning and handover notes. '.repeat(7)).slice(0,370);
  await page.locator('#bessAdditions').fill(batteryNote);await page.waitForFunction(note=>Render.lastState.bessAdditions===note,batteryNote);await fit();
  assert(await page.evaluate(note=>bessAssessmentBody.textContent.includes(note)&&!bessAssessmentBody.querySelector('review'),batteryNote));
  await page.locator('#bessAdditionsReviewed').check();await page.locator('#bessCost').fill('150000');await page.waitForFunction(()=>Render.lastState.bessCost==='150000');
  await pdf('bess','battery-custom.pdf',2);
  await page.selectOption('#bessSizing','backup');assert(await page.locator('#bessLoad').isVisible());
  await page.locator('#bessLoad').fill('2');await page.locator('#bessTargetHours').fill('4');await page.waitForFunction(()=>Number(Render.lastState.bessCapacity)>0);
  values=await page.evaluate(()=>{const s=Render.lastState,f=Finance.compute(s);return {s,a:Bess.sizing(s,f),b:Bess.compute(s,f)};});assert.equal(values.a.target,8);assert.equal(values.b.backupHours,null);
  await page.selectOption('#bessSizing','solar');await page.waitForFunction(()=>Render.lastState.bessSizing==='solar');
  await page.locator('#bessCost').fill('150000');await page.evaluate(()=>{capacity.value='10';capacity.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>Render.lastState.bessCost==='');assert.equal(await page.locator('#bessAdditionsReviewed').isChecked(),false);assert(await page.evaluate(()=>Math.abs(Number(Render.lastState.bessCapacity)-Bess.sizing(Render.lastState,Finance.compute(Render.lastState)).units*StorageCatalog.get(Render.lastState.bessModel).rated)<1e-9));
  await page.selectOption('#bessModel','custom');assert(await page.locator('#bessCapacity').isVisible());assert((await page.locator('#selectedSystemCard').textContent()).includes('Manual-specification'));
  await page.selectOption('#bessModel','pylon-us5000');await page.waitForFunction(()=>Render.lastState.bessSpecMode==='auto');
  console.log('PASS: one selector with BESS, proposed catalogue configuration, exact energy/module maths, backup target sizing, quote-linked recalculation/price reset, custom battery/manual controls and real two-page export');
  const note=('Client additions: coordinate access and accessories; verify the agreed interfaces before installation. '.repeat(6)).slice(0,450);
  for(const kind of ['zero','monitoring','ev','pfc','dg','weatherproof','carport','canopy','pergola']){
   await select(kind);await page.locator('#systemAdditions').evaluate(el=>el.closest('details').open=true);await page.locator('#systemAdditions').fill(note);
   await page.waitForFunction(note=>Render.lastState.systemAdditions===note,note);await fit();
   assert(await page.evaluate(({kind,note})=>systemOverviewBody.textContent.includes(note)&&systemOverviewBody.textContent.includes(AdditionalSystems.insights[kind][0])&&!bessEnabled.checked&&systemEnabled.checked,{kind,note}));
  }
  await select('carport');await page.locator('#systemAdditions').evaluate(el=>el.closest('details').open=true);await page.locator('#systemAdditions').fill(note);await page.locator('#systemPrice').fill('125000');await page.waitForFunction(()=>Render.lastState.systemPrice==='125000');
  accept=false;await page.selectOption('#advancedSystemSelect','pergola');accept=true;assert.equal(await page.locator('#advancedSystemSelect').inputValue(),'carport');assert.equal(await page.locator('#systemAdditions').inputValue(),note);
  await pdf('system','carport-custom.pdf',2);await pdf('system-power','carport-custom-short.pdf',1);
  await page.evaluate(()=>{custName.value='Unified systems sample';propRef.value='KTM-SAMPLE-UNIFIED';propDate.value='2026-10-17';Render.renderAll();__qsSaveNow();});
  await page.reload();await page.waitForFunction(()=>Render.lastState?.systemAdditions?.length===450);assert.equal(await page.locator('#advancedSystemSelect').inputValue(),'carport');
  const id=await page.evaluate(()=>Proposals.activeId()),shared=await context.newPage();await shared.goto(base+'/share.html?p='+encodeURIComponent(id));await shared.waitForFunction(()=>Render.lastState?.systemAdditions?.length===450);assert(await shared.evaluate(note=>systemOverviewBody.textContent.includes(note),note));await shared.close();
  await page.evaluate(()=>{StateStore.applyForm({bessEnabled:true,systemEnabled:true});Render.renderAll();});assert.equal(await page.locator('#advancedSystemSelect').inputValue(),'combined');
  assert(await page.evaluate(()=>Render.lastVisible.some(p=>p.id==='pageBessOverview')&&Render.lastVisible.some(p=>p.id==='pageSystemOverview')));
  await page.locator('[data-section=systemEnabled]').evaluate(el=>el.open=true);await select('bess');assert.equal(await page.locator('#bessAdditions').inputValue(),batteryNote);
  await select('carport');assert.equal(await page.locator('#systemAdditions').inputValue(),note);await select('none');assert.equal(await page.evaluate(()=>Render.lastVisible.length),15);
  console.log('PASS: nine useful package explanations + 450-character custom scope fit; cancellation, source escaping, real 2/1-page PDFs, reload/Customer View, protected dormant data and legacy combined proposals');
  await select('bess');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>Render.fitPages());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('[data-section=systemEnabled]').screenshot({path:path.join(folder,'battery-input.png')});
  await select('carport');await page.locator('#systemAdditions').evaluate(el=>el.closest('details').open=false);await page.locator('[data-section=systemEnabled]').screenshot({path:path.join(folder,'carport-input.png')});
  await page.setViewportSize({width:1440,height:1100});await page.evaluate(()=>Render.fitPages());
  for(const id of ['pageSystemOverview','pageSystemDetail']){const data=await page.evaluate(async id=>{const copy=document.getElementById(id).cloneNode(true);copy.style.transform='none';const host=document.createElement('div');host.className='pdf-snapshot';host.append(copy);document.body.append(host);try{await Promise.all([...copy.querySelectorAll('img')].map(im=>im.decode()));SupplementDesign.fit(host);return(await html2canvas(copy,{scale:1.2,logging:false,backgroundColor:'#fff'})).toDataURL();}finally{host.remove();}},id);fs.writeFileSync(path.join(folder,id+'.png'),Buffer.from(data.split(',')[1],'base64'));}
  assert.deepEqual(errors,[]);console.log('PASS: selected-system cards, minimal mobile inputs, private workflow state, diagrams/illustrations and no runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
