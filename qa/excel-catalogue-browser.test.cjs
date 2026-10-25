'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const base=process.env.QA_BASE||'http://127.0.0.1:8080';
const archived={_v:2,modules:[{make:'Legacy solar',model:'Legacy-625',wp:625},{make:'Waaree',model:'Bi-55-545',wp:999}],inverters:[{make:'Legacy inverter',model:'Legacy-9',kw:9}],structures:[{label:'Legacy structure'}],cables:[{label:'Legacy cable'}]};
const makeCloud=(sha,wp)=>({sha,syncedAt:'2026-10-25T10:00:00Z',source:'Original workbook.xlsm',modules:[{make:'Workbook Solar',model:'Workbook-'+wp,wp,cellType:'Fixture HJT',lengthMm:2300,widthMm:1134,voc:50,isc:15,vmp:42,imp:14}],inverters:[{make:'Workbook Inverter',model:'Workbook-8',kw:8}],cables:[{make:'Workbook Cable',size:4}]});
(async()=>{
 const{default:chrome}=await import('@sparticuz/chromium'),browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args.filter(a=>a!=='--single-process'),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),errors=[],posts=[],statusRequests=[];
  let saved=null,next=makeCloud('revision-a',620),syncFail=false;
  let meta={ok:true,status:'not-synced',canSync:true,fileName:'Original workbook.xlsm',workbookUrl:'https://drive.google.com/file/d/exact-fixture-workbook/view',syncedAt:'',sha:'',counts:{},checkedAt:'2026-10-25T10:05:00Z'};
  await context.addInitScript(archive=>{if(!localStorage.getItem('qstudio.equipment'))localStorage.setItem('qstudio.equipment',JSON.stringify(archive));},archived);
  await context.route('https://drive.google.com/file/d/exact-fixture-workbook/view',route=>route.fulfill({contentType:'text/html',body:'<title>Original workbook fixture</title>Original workbook; disposable QA tab.'}));
  await context.route('**/api/**',async route=>{
   const request=route.request(),pathname=new URL(request.url()).pathname;let body,status=200;
   if(pathname==='/api/catalogue/status'){statusRequests.push(request.url());body=meta;}
   else if(pathname==='/api/catalogue'&&request.method()==='GET')body={ok:true,catalogue:saved};
   else if(pathname==='/api/catalogue/sync'&&request.method()==='POST'){
    posts.push(pathname);if(syncFail){status=502;body={error:'Simulated connection failure',code:'CATALOGUE_SYNC_FAILED'};}
    else{saved=structuredClone(next);meta={...meta,status:'up-to-date',sha:saved.sha,syncedAt:saved.syncedAt,counts:{modules:1,inverters:1,cables:1}};body={ok:true,catalogue:saved};}
   }else{status=404;body={error:'Disposable QA: endpoint not connected'};}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(base+'/quotation.html');await page.waitForFunction(()=>Render.lastState&&document.querySelector('.studio-ready')&&catalogueStatusLink.dataset.state==='not-synced');await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.eq-add,.eq-del,.eq-save,#eqCatalog input').count(),0);assert.equal(await page.locator('#moduleWattage').inputValue(),'545','archived override must not replace Excel defaults');assert.equal(posts.length,0);
  assert.equal(await page.locator('#catalogueHeaderStatus').textContent(),'Sync needed');
  assert.equal(await page.locator('#eqCatalog p:not([hidden])').count(),2);
  assert.equal(await page.locator('#syncCatalogueBtn').textContent(),'Sync');
  assert.equal((await page.locator('#openCatalogueExcel').textContent()).replace(/\s+/g,' ').trim(),'Add / edit ↗');
  assert.equal(await page.locator('#catalogueLegacyNotice').isVisible(),false);
  // A previously saved custom/local proposal must remain a stable snapshot.
  await page.evaluate(()=>{StateStore.applyForm({custName:'Excel Catalogue QA',moduleMake:'Legacy solar',moduleModel:'Legacy-625',moduleWattage:'625',moduleTech:'Legacy HJT',moduleLengthMm:'2280',moduleWidthMm:'1130',inverterMake:'Legacy inverter',inverterModel:'Legacy-9',inverterKw:'9',cableMake:'Legacy cable',mountMake:'Legacy structure'});Render.renderAll();__qsSaveNow();});
  const snapshot=()=>page.evaluate(()=>({form:JSON.stringify(Object.fromEntries(Object.entries(StateStore.collectForm()).filter(([key])=>!key.startsWith('docEdit-')&&key!=='docTextSearch'))),finance:JSON.stringify(Finance.compute(Render.lastState)),archive:localStorage.getItem('qstudio.equipment'),builtin:JSON.stringify(CATALOGUE_DATA)}));
  const before=await snapshot();
  await page.click('#catalogueStatusLink');assert(await page.evaluate(()=>advancedWrap.open&&excelCataloguePanel.open&&document.activeElement.id==='eqCatalog'));assert.equal(posts.length,0);assert.deepEqual(await snapshot(),before);
  assert.equal(await page.locator('#openCatalogueExcel').getAttribute('href'),meta.workbookUrl);
  const tabOpened=context.waitForEvent('page');await page.click('#openCatalogueExcel');const workbook=await tabOpened;await workbook.waitForLoadState();assert.equal(workbook.url(),meta.workbookUrl);assert.equal(await workbook.evaluate(()=>window.opener),null);await workbook.close();await page.bringToFront();await page.evaluate(()=>ExcelCatalogue.refresh());await page.waitForFunction(()=>!syncCatalogueBtn.disabled);assert(statusRequests.some(url=>url.endsWith('?fresh=1')),'return from Excel must check fresh metadata, not the previous minute cache');
  await page.click('#syncCatalogueBtn');await page.waitForFunction(()=>catalogueStatusLink.dataset.state==='up-to-date');assert.equal(posts.length,1);assert.deepEqual(await snapshot(),before,'sync must not rewrite the current quotation, Finance, archive or built-in source');
  assert.equal(await page.evaluate(()=>EquipmentStore.cat().modules.length),1);assert.equal(await page.evaluate(()=>EquipmentStore.cat().modules[0].wp),620);
  // Another browser's completed sync refreshes the local catalogue using GET only.
  saved=makeCloud('revision-b',650);meta={...meta,sha:saved.sha,syncedAt:saved.syncedAt};await page.evaluate(()=>ExcelCatalogue.refresh());await page.waitForFunction(()=>EquipmentStore.cloudInfo().sha==='revision-b');assert.equal(posts.length,1);assert.deepEqual(await snapshot(),before);
  meta.status='outdated';await page.evaluate(()=>ExcelCatalogue.refresh());assert.equal(await page.locator('#catalogueHeaderStatus').textContent(),'Excel updated · Sync now');assert.equal(await page.locator('#catalogueSyncStatus').textContent(),'Excel updated · Sync now');assert.equal(await page.locator('#catalogueSyncStatus').evaluate(el=>getComputedStyle(el).animationIterationCount),'3');assert.equal(posts.length,1);
  const folder=path.join(__dirname,'shots','excel-catalogue');fs.mkdirSync(folder,{recursive:true});
  await page.locator('.studio-heading').screenshot({path:path.join(folder,'header-sync-needed.png')});
  for(const width of [390,360]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&eqCatalog.scrollWidth<=eqCatalog.clientWidth+2),'changed-file message must fit the mobile header and card');}
  await page.locator('#excelCataloguePanel').screenshot({path:path.join(folder,'catalogue-mobile-updated.png')});
  await page.setViewportSize({width:1440,height:1100});
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('#catalogueHeaderStatus').evaluate(el=>getComputedStyle(el).animationName),'none');assert.equal(await page.locator('#catalogueSyncStatus').evaluate(el=>getComputedStyle(el).animationName),'none');
  syncFail=true;const previous=await page.evaluate(()=>localStorage.getItem('qsCloudCatalogue'));await page.click('#syncCatalogueBtn');await page.waitForFunction(()=>catalogueStatusLink.dataset.state==='error');assert.equal(await page.evaluate(()=>localStorage.getItem('qsCloudCatalogue')),previous);assert.deepEqual(await snapshot(),before);
  syncFail=false;next=makeCloud('revision-c',630);await page.click('#syncCatalogueBtn');await page.waitForFunction(()=>catalogueStatusLink.dataset.state==='up-to-date');assert.equal(posts.length,3);assert.deepEqual(await snapshot(),before);
  // Apply a product only through the original source controls.
  await page.selectOption('#moduleMake','Workbook Solar',{force:true});await page.selectOption('#inverterMake','Workbook Inverter',{force:true});await page.selectOption('#cableMake','Workbook Cable',{force:true});await page.waitForFunction(()=>Render.lastState.moduleWattage==='630'&&Render.lastState.inverterKw==='8');
  assert.equal(await page.locator('#moduleLengthMm').inputValue(),'2300');assert.equal(await page.locator('#moduleTech').inputValue(),'Fixture HJT');assert(!await page.evaluate(()=>EquipmentStore.cat().modules.some(r=>r.make==='Waaree')),'deleted/missing Excel rows must not resurrect from bundled or local catalogues');
  const original=await page.evaluate(()=>{__qsSaveNow();return Proposals.activeId();});await page.reload();await page.waitForFunction(()=>Render.lastState?.moduleMake==='Workbook Solar'&&catalogueStatusLink.dataset.state==='up-to-date');assert.equal(await page.locator('#moduleWattage').inputValue(),'630');assert.equal(await page.evaluate(()=>localStorage.getItem('qstudio.equipment')),JSON.stringify(archived));
  await page.evaluate(()=>document.querySelector('.studio-management').open=true);await page.click('#pmNew');await page.waitForFunction(id=>Proposals.activeId()!==id,original);await page.selectOption('#proposalSelect',original);await page.waitForFunction(()=>Render.lastState?.moduleMake==='Workbook Solar');assert.equal(await page.locator('#moduleWattage').inputValue(),'630');
  for(const width of [390,360]){await page.setViewportSize({width,height:900});await page.click('#catalogueStatusLink');assert((await page.locator('#excelCataloguePanel').boundingBox()).height<240,'compact card must not become a text-heavy panel');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&eqCatalog.scrollWidth<=eqCatalog.clientWidth+2));}
  await page.locator('#excelCataloguePanel').screenshot({path:path.join(folder,'catalogue-mobile.png')});
  await page.setViewportSize({width:1440,height:1100});await page.locator('#excelCataloguePanel').screenshot({path:path.join(folder,'catalogue-desktop.png')});
  const customer=await context.newPage();customer.on('pageerror',e=>errors.push(e.message));await customer.goto(base+'/share.html?p='+original);await customer.waitForFunction(()=>Render.lastState?.moduleMake==='Workbook Solar');assert(await customer.evaluate(()=>v_tsTable.textContent.includes('Workbook Solar')&&v_tsTable.textContent.includes('Workbook Inverter')));assert.equal(await customer.locator('#catalogueStatusLink').count(),0);
  await page.evaluate(()=>{for(const record of Render.PAGES.filter(p=>!p.id.includes('continuation')))DocumentStudio.excludePage(record.id,record.id!=='pageTechSpec');window.__cataloguePdf=[];const capture=html2canvas;window.html2canvas=(sheet,options)=>{__cataloguePdf.push(sheet.textContent);return capture(sheet,options);};});
  const downloading=page.waitForEvent('download',{timeout:120000});downloading.catch(()=>{});await page.evaluate(()=>Exporter.exportPdf(()=>{},{format:'full'}));const pdf=await downloading;await pdf.saveAs(path.join(folder,'selected-equipment.pdf'));assert(await page.evaluate(()=>__cataloguePdf.join('\n').includes('Workbook Solar')&&__cataloguePdf.join('\n').includes('Workbook Inverter')));
  assert.deepEqual(errors,[]);console.log('PASS: real Excel-only UI, original-workbook link, navigation, all sync states/retry, GET-only cache refresh, archived proposal/Finance preservation, explicit selection, reload/New-switch, mobile/reduced-motion, Customer View and actual PDF');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
