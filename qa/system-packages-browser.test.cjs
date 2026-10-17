/* New package workflow: real UI, all categories, price isolation and actual PDF export. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const {default:bundle}=await import('@sparticuz/chromium');
 const browser=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args.filter(a=>a!=='--single-process'),headless:true});
 const shots=path.join(__dirname,'shots','system-packages');fs.mkdirSync(shots,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));let accept=true;page.on('dialog',d=>accept?d.accept():d.dismiss());
  await page.goto((process.env.QA_BASE||'http://127.0.0.1:8080')+'/quotation.html');
  await page.waitForFunction(()=>!!window.Render?.lastState);await page.evaluate(()=>document.fonts.ready);
  const apply=v=>page.evaluate(v=>{StateStore.applyForm(v);Render.renderAll();},v);
  await page.evaluate(()=>{StateStore.applyForm({...StateStore.DEFAULTS,custName:'System package QA',propRef:'KTM-SYSTEM-QA',propDate:'2026-10-17',capacity:'7',systemEnabled:true});Render.renderAll();document.querySelector('[data-section=systemEnabled]').open=true;});
  async function verify(p=page){
   await p.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.system-page img,#img_solution,#img_exec')].map(img=>img.decode()));});
   const result=await p.evaluate(()=>{
    const s=Render.lastState,A=AdditionalSystems,f=Finance.compute(s),expected=Finance.compute({...s,systemEnabled:false,systemPrice:'',systemPriceMode:'separate'});
    const main=Render.lastVisible.map(p=>p.id);
    const bad=main.filter(id=>id!=='pageCover').flatMap(id=>{
     const pg=document.getElementById(id),footer=pg.querySelector('.pg-foot').getBoundingClientRect().top;
     const body=pg.querySelector('.pg-body');if(!body)return [];
     const children=[...body.children].filter(el=>el.getBoundingClientRect().height&&getComputedStyle(el).position!=='absolute');
     const boundary=id==='pageInvestment'?document.getElementById('v_inDisclaimer').getBoundingClientRect().top-2:footer-2;
     return children.filter(el=>el.id!=='v_inDisclaimer'&&el.getBoundingClientRect().bottom>boundary).map(el=>id+': '+(el.id||el.className));
    });
    const power=Experience.buildPowerPages(s);const powerBad=power.checkVisibility()?[...power.querySelectorAll('.power-page')].filter(pg=>pg.querySelector('.power-body').getBoundingClientRect().bottom>pg.querySelector('footer').getBoundingClientRect().top-4).map(pg=>pg.id):[];const powerText=power.textContent;power.remove();
    return {expectedPages:17+(f.financing?1:0),category:s.customerType,bad,powerBad,main,finance:JSON.stringify(f)===JSON.stringify(expected),gross:v_inGrossTotal.textContent,expectedGross:Finance.fmtINR(f.grossTotal),name:A.name(s),price:A.priceText(s),mainText:v_inSub.textContent,detail:systemDetailBody.textContent,cover:v_coverSystem.textContent,photo:img_solution.getAttribute('src'),expectedPhoto:'assets/images/'+A.presentation(s).image,hero:document.querySelector('#systemOverviewBody .sp-hero img').getAttribute('src'),mode:A.priceMode(s),powerText};
   });
   assert(result.finance,'package scope must not mutate Finance');assert.equal(result.gross,result.expectedGross);
   assert.equal(result.main.length,result.expectedPages,'exactly two system pages, with financing only when entered');
   assert.deepEqual(result.bad,[],'A4 clearance: '+result.name+' / '+result.category+' / '+result.mode+' '+JSON.stringify(result.bad));assert.deepEqual(result.powerBad,[],'six-page Power layout');
   assert.equal(result.photo,result.expectedPhoto);assert.equal(result.hero,result.expectedPhoto);
   assert(result.mainText.includes(result.price)&&result.cover.includes(result.name));assert(result.detail.includes(result.price));
   assert(result.powerText.includes(result.name));
   if(result.mode==='included'){assert(!result.powerText.includes('Additional system · separately priced'));assert(!result.detail.includes('99,999'));}
  }
  const kinds=['zero','monitoring','ev','pfc','dg','weatherproof','carport','canopy','pergola'];
  for(const kind of kinds){
   await page.selectOption('#advancedSystemSelect',kind);
   assert(await page.locator('#systemPurpose').inputValue());
   for(const category of ['residential','commercial','industrial','rwa'])for(const mode of ['separate','included']){
    await apply({customerType:category,systemPriceMode:mode,systemPrice:'99999',systemAreaM2:'48',systemHeightM:'2.8',systemBays:'2',systemRoofing:'Agreed roofing and finishes after site design.',systemDrainage:'Gutters to the agreed existing stormwater discharge.',systemAcceptance:'Site inspection and agreed water-ingress checks.',systemWarranty:'Only agreed OEM / contractor terms',systemDelivery:'After site and design approval'});
    await verify();
   }
   console.log('PASS:',kind,'— four categories × both price modes; main, short report and A4; Finance unchanged');
  }
  // Dense commercial offers must retain tax, BOM and financing notes too.
  for(const kind of ['weatherproof','carport','canopy','pergola']){
   await page.selectOption('#advancedSystemSelect',kind);
   for(const mode of ['separate','included']){
    await apply({customerType:'commercial',systemPriceMode:mode,systemPrice:'125000',bomModules:'250000',bomInverter:'70000',bomStructure:'50000',bomBos:'30000',bomInstall:'30000',bomLiaison:'15200',payCompletion:'5',loanAmt:'200000',loanRate:'9',loanYears:'5'});
    await verify();
   }
  }
  await apply({bomModules:'',bomInverter:'',bomStructure:'',bomBos:'',bomInstall:'',bomLiaison:'',payCompletion:'10',loanAmt:'',loanRate:'',loanYears:'',systemPrice:'99999'});
  console.log('PASS: eight dense architectural cases — commercial tax + BOM + payment warning + financing, both price modes');
  // Real confirmation must protect current custom scope when the user cancels.
  accept=false;await page.selectOption('#advancedSystemSelect','carport');accept=true;
  assert.equal(await page.locator('#systemTemplate').inputValue(),'pergola');
  assert.equal(await page.locator('#systemPrice').inputValue(),'99999');
  await page.selectOption('#advancedSystemSelect','carport');
  assert.equal(await page.locator('#systemPrice').inputValue(),'');assert.equal(await page.locator('#systemAreaM2').inputValue(),'');
  assert.equal(await page.locator('#systemPriceMode').inputValue(),'separate');
  await apply({customerType:'residential',systemAreaM2:'48',systemHeightM:'2.8',systemBays:'2',systemPrice:'125000',systemWeatherProtection:'rain'});
  await page.evaluate(()=>{CONTENT.pageSolution.para='Custom approved solution copy.';Render.renderAll();__qsSaveNow();});
  await page.reload();await page.waitForFunction(()=>!!window.Render?.lastState);await verify();
  assert.equal(await page.locator('#v_soPara').textContent(),'Custom approved solution copy.');
  assert.equal(await page.locator('#systemAreaM2').inputValue(),'48');assert.equal(await page.locator('#systemBays').inputValue(),'2');
  const id=await page.evaluate(()=>Proposals.activeId());const shared=await context.newPage();shared.on('pageerror',e=>errors.push(e.message));
  await shared.goto((process.env.QA_BASE||'http://127.0.0.1:8080')+'/share.html?p='+encodeURIComponent(id));await shared.waitForFunction(()=>!!window.Render?.lastState);await verify(shared);await shared.close();
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>Render.fitPages());await verify();
  await page.emulateMedia({media:'print'});await verify();await page.emulateMedia({media:'screen'});await page.setViewportSize({width:1440,height:1100});await page.evaluate(()=>Render.fitPages());
  // Standalone-only is not permission to rewrite the ordinary solar document.
  await apply({systemInclude:false});
  assert.equal(await page.evaluate(()=>Render.lastVisible.length),15);
  assert.equal(await page.locator('#img_solution').getAttribute('src'),'assets/images/page-solution.jpg');assert(await page.locator('#v_coverSystem').evaluate(el=>el.hidden));
  await apply({systemInclude:true});
  // Actual photo upload stays higher priority than package defaults.
  await page.locator('#up_solution').setInputFiles({name:'custom.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=','base64')});
  await page.waitForFunction(()=>!!window.__qsPageImages.img_solution);
  const uploaded=await page.locator('#img_solution').getAttribute('src');
  for(const included of [false,true]){await apply({systemInclude:included});assert.equal(await page.locator('#img_solution').getAttribute('src'),uploaded);}
  await page.evaluate(()=>{delete __qsPageImages.img_solution;img_solution.src='assets/images/page-solution.jpg';Render.renderAll();});
  console.log('PASS: confirmation/cancellation, reset safety, saved custom copy and fields, Customer View, mobile/print, standalone-only and real upload priority');
  // Actual PDFs and independent snapshot metadata; no mocked capture output.
  await page.evaluate(()=>{
   const Original=jspdf.jsPDF,canvas=html2canvas;
   jspdf.jsPDF=function(...args){const doc=new Original(...args);doc.save=()=>{window.__packagePdf=doc.output('datauristring').split(',')[1];};return doc;};
   window.__packageCaptured=[];
   window.html2canvas=async(el,opts)=>{window.__packageCaptured.push({id:el.id,footer:el.querySelector('.pf-right')?.textContent,text:el.textContent,hero:el.querySelector('.sp-hero img')?.getAttribute('src')});return canvas(el,opts);};
  });
  for(const [format,count]of [['system',2],['system-power',1],['power',6],['full',17]]){
   const result=await page.evaluate(async format=>{__packageCaptured=[];await Exporter.exportPdf(()=>{},{format});return {pdf:__packagePdf,captures:__packageCaptured,cleaned:!document.querySelector('.pdf-snapshot')};},format);
   const bytes=Buffer.from(result.pdf,'base64');assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
   assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,count,format+' PDF page count');assert(result.cleaned);
   if(format.startsWith('system'))assert(result.captures.every((c,i)=>c.footer==='Page '+(i+1)+' of '+count));
   fs.writeFileSync(path.join(shots,format+'.pdf'),bytes);console.log('PASS: actual',format,'PDF —',count,'pages, snapshot cleanup, dynamic names/numbering');
  }
  for(const id of ['pageCover','pageSolution','pageInvestment','pageSystemOverview','pageSystemDetail']){
   const png=await page.evaluate(async id=>{const source=document.getElementById(id),copy=source.cloneNode(true);copy.style.transform='none';const canvases=source.querySelectorAll('canvas');copy.querySelectorAll('canvas').forEach((c,i)=>c.getContext('2d').drawImage(canvases[i],0,0));const host=document.createElement('div');host.className='pdf-snapshot';host.append(copy);document.body.append(host);try{return (await html2canvas(copy,{scale:1.2,logging:false,backgroundColor:'#fff'})).toDataURL();}finally{host.remove();}},id);
   fs.writeFileSync(path.join(shots,id+'.png'),Buffer.from(png.split(',')[1],'base64'));
  }
  await apply({systemEnabled:false});assert.equal(await page.evaluate(()=>Render.lastVisible.length),15);assert(await page.locator('#v_coverSystem').evaluate(el=>el.hidden));assert.equal(await page.locator('#img_solution').getAttribute('src'),'assets/images/page-solution.jpg');assert.deepEqual(errors,[]);
  console.log('PASS: disabling restores a normal proposal with no stale package art or labels; no runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
