'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'quotation.html'),'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,'');
const archive={_v:2,modules:[{make:'Archived solar',wp:700},{make:'Waaree',model:'Bi-55-545',wp:999}],inverters:[{make:'Archived inverter',kw:20}],structures:[{label:'Archived structure'}],cables:[{label:'Archived cable'}]};
const cloud={sha:'fixture-sha',syncedAt:'2026-10-25T10:00:00Z',source:'Exact workbook.xlsm',modules:[{make:'Excel solar',model:'Excel-620',wp:620,lengthMm:2300,widthMm:1134,cellType:'HJT'}],inverters:[{make:'Excel inverter',model:'Excel-8',kw:8}],cables:[{make:'Excel cable',size:4}]};
const metadata={ok:true,status:'not-synced',canSync:true,fileId:'exact-fixture-workbook',fileName:'Exact workbook.xlsm',workbookUrl:'https://drive.google.com/file/d/exact-fixture-workbook/view',syncedAt:'',sha:'',counts:{},checkedAt:'2026-10-25T10:05:00Z'};
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('UI did not settle');};
function create(url='http://catalogue.test/quotation.html',preview=false){
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,calls=[];let meta={...metadata},payload=structuredClone(cloud),failure='',failureStatus=0,syncFailure=false,syncHold=null;
 w.Element.prototype.scrollIntoView=function(){};w.localStorage.setItem('qstudio.equipment',JSON.stringify(archive));
 if(preview){w.fetch=async()=>{calls.push('forbidden-fetch');throw new Error('Must never call production from preview');};w.eval(fs.readFileSync(path.join(root,'assets/js/platform-api.js'),'utf8'));}
 else w.PlatformAPI={catalogueStatus:async()=>{calls.push('GET status');if(failure)throw Object.assign(new Error(failure),{code:failure,status:failureStatus});return structuredClone(meta);},equipmentCatalogue:async()=>{calls.push('GET catalogue');return{ok:true,catalogue:structuredClone(payload)};},syncEquipmentCatalogue:async()=>{calls.push('POST sync');if(syncHold)await syncHold;if(syncFailure)throw new Error('Simulated network failure');meta={...meta,status:'up-to-date',sha:payload.sha,syncedAt:payload.syncedAt,counts:{modules:payload.modules.length,inverters:payload.inverters.length,cables:payload.cables.length}};return{ok:true,catalogue:structuredClone(payload)};}};
 for(const file of ['catalogue-data.js','equipment.js','excel-catalogue.js'])w.eval(fs.readFileSync(path.join(root,'assets/js',file),'utf8'));
 d.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {dom,w,d,calls,setMeta:m=>meta={...meta,...m},setPayload:p=>payload=p,setFailure:x=>failure=x,setFailureStatus:x=>failureStatus=x,setSyncFailure:x=>syncFailure=x,setSyncHold:()=>{let release;syncHold=new Promise(r=>{release=r;});return()=>{syncHold=null;release();};}};
}
(async()=>{
 const a=create(),{w,d,calls}=a;try{
 await until(()=>d.getElementById('catalogueStatusLink').dataset.state==='not-synced');
 assert.equal(d.querySelectorAll('#eqCatalog input,#eqCatalog .eq-add,#eqCatalog .eq-del,#eqCatalog .eq-save').length,0);assert.equal(d.querySelectorAll('#syncCatalogueBtn').length,1);assert(d.getElementById('eqCatalog').contains(d.getElementById('syncCatalogueBtn')));assert.equal(w.EquipmentStore.legacyInfo().count,5);assert.equal(w.localStorage.getItem('qstudio.equipment'),JSON.stringify(archive));assert(!w.EquipmentStore.cat().modules.some(r=>r.make==='Archived solar'||r.wp===999));
 const initial=w.EquipmentStore.cat();assert.equal(initial.modules.length,w.CATALOGUE_DATA.modules.length);
 assert.equal(d.getElementById('openCatalogueExcel').href,metadata.workbookUrl);assert(!d.getElementById('syncCatalogueBtn').disabled);
 const requestCount=calls.length;d.getElementById('catalogueStatusLink').click();assert(d.getElementById('advancedWrap').open&&d.getElementById('excelCataloguePanel').open);assert.equal(d.activeElement.id,'eqCatalog');assert.equal(calls.length,requestCount,'arrow navigation never requests or syncs data');
 const values=Object.fromEntries(['moduleMake','moduleModel','moduleTech','moduleWattage','moduleLengthMm','moduleWidthMm','inverterMake','inverterModel','inverterKw'].map(id=>[id,d.getElementById(id).value]));
 await w.ExcelCatalogue.sync();assert.equal(d.getElementById('catalogueStatusLink').dataset.state,'up-to-date');assert.equal(calls.filter(x=>x==='POST sync').length,1);assert.equal(w.EquipmentStore.cat().modules.length,1,'synced Excel replaces the bundled source, not a merge that resurrects deleted rows');assert.equal(w.EquipmentStore.cat().modules[0].wp,620);assert.equal(w.localStorage.getItem('qstudio.equipment'),JSON.stringify(archive));assert.deepEqual(Object.fromEntries(Object.keys(values).map(id=>[id,d.getElementById(id).value])),values,'passive sync preserves quotation controls');
 // A historic partial cache may have the SAME workbook SHA. Counts must be
 // verified too, otherwise another browser could falsely look up to date.
 const gets=calls.filter(x=>x==='GET catalogue').length;
 a.setPayload({...cloud,modules:[...cloud.modules,{...cloud.modules[0],model:'Excel-630',wp:630}]});
 a.setMeta({counts:{modules:2,inverters:1,cables:1}});await w.ExcelCatalogue.refresh();
 assert.equal(w.EquipmentStore.cloudInfo().modules,2);assert.equal(calls.filter(x=>x==='GET catalogue').length,gets+1);
 a.setPayload(cloud);a.setMeta({counts:{modules:1,inverters:1,cables:1}});await w.ExcelCatalogue.refresh();
 a.setMeta({status:'outdated'});await w.ExcelCatalogue.refresh();assert.equal(d.getElementById('catalogueHeaderStatus').textContent,'Excel updated · Sync now');assert.equal(calls.filter(x=>x==='POST sync').length,1,'metadata check never syncs');
 // A disabled Add/edit link must explain the real reason. An owner who is
 // merely syncing, or whose workbook URL is not usable, is NOT a permission
 // failure and must not be told they lack rights.
 const releaseSync=a.setSyncHold(),pendingSync=w.ExcelCatalogue.sync();await until(()=>d.getElementById('openCatalogueExcel').getAttribute('aria-disabled')==='true');
 const busyLink=d.getElementById('openCatalogueExcel');
 assert.equal(busyLink.title,'Wait for the current catalogue sync to finish.');assert.doesNotMatch(busyLink.title,/owner|admin|permission/i);assert(!busyLink.hasAttribute('href'));
 releaseSync();await pendingSync;assert.equal(d.getElementById('openCatalogueExcel').href,metadata.workbookUrl);
 a.setMeta({workbookUrl:null});await w.ExcelCatalogue.refresh();assert.equal(d.getElementById('openCatalogueExcel').title,'The workbook link is not available yet.');assert.doesNotMatch(d.getElementById('openCatalogueExcel').title,/owner|admin|permission/i);
 a.setMeta({workbookUrl:metadata.workbookUrl});await w.ExcelCatalogue.refresh();assert.equal(d.getElementById('openCatalogueExcel').href,metadata.workbookUrl);assert(!d.getElementById('openCatalogueExcel').hasAttribute('title'));
 const stored=w.localStorage.getItem('qsCloudCatalogue');a.setSyncFailure(true);await w.ExcelCatalogue.sync();assert.equal(d.getElementById('catalogueStatusLink').dataset.state,'error');assert.equal(w.localStorage.getItem('qsCloudCatalogue'),stored);assert(!d.getElementById('syncCatalogueBtn').disabled);a.setSyncFailure(false);
 a.setMeta({status:'unknown',reason:'Change checks unavailable.'});await w.ExcelCatalogue.refresh();assert.equal(d.getElementById('catalogueStatusLink').dataset.state,'unknown');assert(d.getElementById('catalogueSyncStatus').title.includes('Change checks unavailable'));
 // Staff without management permission keep the catalogue and status, but
 // neither management action may become actionable.
 a.setMeta({canSync:false});await w.ExcelCatalogue.refresh();const denied=calls.filter(x=>x==='POST sync').length;
 const addLink=d.getElementById('openCatalogueExcel');
 assert.equal(addLink.getAttribute('aria-disabled'),'true');assert(!addLink.hasAttribute('href'));assert.equal(addLink.tabIndex,-1);assert.match(addLink.title,/owner or an elevated admin/i);
 let opened=0;w.open=()=>{opened++;return{};};
 const blockedClick=new w.MouseEvent('click',{bubbles:true,cancelable:true});addLink.dispatchEvent(blockedClick);
 assert(blockedClick.defaultPrevented,'Add/edit click must be cancelled without permission');assert.equal(opened,0);
 d.getElementById('catalogueStatusLink').click();assert(d.getElementById('excelCataloguePanel').open);assert.equal(d.activeElement.id,'eqCatalog','staff can still view catalogue status');
 assert(w.EquipmentStore.cat().modules.length>0&&w.EquipmentStore.cloudInfo().modules>0,'staff still have the Excel catalogue for product selection');assert(!d.getElementById('openCatalogueExcel').hasAttribute('href'));
 await w.ExcelCatalogue.sync();assert(d.getElementById('syncCatalogueBtn').disabled);assert.equal(calls.filter(x=>x==='POST sync').length,denied);
 const staffCatalogue=w.localStorage.getItem('qsCloudCatalogue');
 a.setMeta({workbookUrl:'javascript:alert(1)',fileName:'<img src=x onerror=alert(1)>'});await w.ExcelCatalogue.refresh();assert(!d.getElementById('openCatalogueExcel').hasAttribute('href'));assert(!d.querySelector('#catalogueWorkbook img'));
 a.setFailure('NOT_CONFIGURED');await w.ExcelCatalogue.refresh();assert.equal(d.getElementById('catalogueStatusLink').dataset.state,'unknown');assert.match(d.getElementById('catalogueSyncStatus').title,/not configured/);assert.equal(w.localStorage.getItem('qsCloudCatalogue'),staffCatalogue);a.setFailure('');
 a.setFailureStatus(401);a.setFailure('UNAUTHORIZED');await w.ExcelCatalogue.refresh();assert.equal(d.getElementById('catalogueHeaderStatus').textContent,'Sign in');assert(!d.getElementById('openCatalogueExcel').hasAttribute('href'));assert.equal(d.getElementById('openCatalogueExcel').title,'Catalogue status is not verified yet.');assert(d.getElementById('syncCatalogueBtn').disabled);assert.equal(w.localStorage.getItem('qsCloudCatalogue'),staffCatalogue,'an auth failure never replaces the saved catalogue');a.setFailure('');a.setFailureStatus(0);
 // An old/malformed response must not replace the last valid catalogue.
 assert.throws(()=>w.EquipmentStore.importCloud({modules:[],inverters:[],cables:[]}));assert.equal(w.localStorage.getItem('qsCloudCatalogue'),staffCatalogue);
 a.setMeta({status:'up-to-date',sha:'new-sha',canSync:true,workbookUrl:metadata.workbookUrl});a.setPayload({...cloud,sha:'new-sha'});
 const proto=Object.getPrototypeOf(w.localStorage),setItem=proto.setItem;proto.setItem=()=>{throw new Error('Full');};await w.ExcelCatalogue.refresh();proto.setItem=setItem;assert.equal(d.getElementById('catalogueStatusLink').dataset.state,'unknown');assert.match(d.getElementById('catalogueSyncStatus').title,/storage is unavailable/);assert.equal(w.localStorage.getItem('qstudio.equipment'),JSON.stringify(archive));
 await w.ExcelCatalogue.refresh();assert.equal(d.getElementById('catalogueStatusLink').dataset.state,'up-to-date');assert.equal(JSON.parse(w.localStorage.getItem('qsCloudCatalogue')).sha,'new-sha');
 console.log('PASS: Excel-only UI/source, archived local data, exact safe link, navigation-only arrow, truthful states, explicit sync, cache failure, staff Add/edit+Sync denial with catalogue/status intact, and malformed-payload safety');
 }finally{a.dom.window.close();}
 const preview=create('https://quotation-studio-isolated-fixture.vercel.app/quotation.html',true);try{await until(()=>preview.d.getElementById('catalogueSyncStatus').textContent==='Not verified');assert(!preview.d.body.textContent.includes('Preview only'));assert.equal(preview.d.querySelector('.catalogue-label').textContent,'Excel workbook');await assert.rejects(preview.w.PlatformAPI.catalogueStatus(true),error=>error.code==='PREVIEW_BACKEND_DISABLED');assert.deepEqual(preview.calls,[]);assert(preview.d.getElementById('syncCatalogueBtn').disabled);assert(!preview.d.getElementById('openCatalogueExcel').hasAttribute('href'));assert.equal(preview.d.getElementById('openCatalogueExcel').title,'Catalogue status is not verified yet.','an unverified/unavailable connection must not be described as a permission problem');console.log('PASS: actual PlatformAPI preview guard blocks all production catalogue requests');}finally{preview.dom.window.close();}
 const auth=new JSDOM('',{url:'https://studio.example.test',runScripts:'outside-only'});try{
 const w=auth.window,requests=[];w.fetch=async(url,options)=>{requests.push({url,options});return{ok:true,text:async()=>JSON.stringify({ok:true})};};
 w.eval(fs.readFileSync(path.join(root,'assets/js/platform-api.js'),'utf8'));w.PlatformAPI.setSessionToken('disposable-fixture-session');
 await w.PlatformAPI.catalogueStatus();await w.PlatformAPI.equipmentCatalogue();await w.PlatformAPI.syncEquipmentCatalogue();await w.PlatformAPI.catalogueStatus(true);
 assert.deepEqual(requests.map(r=>[r.url,r.options.method]),[['/api/catalogue/status','GET'],['/api/catalogue','GET'],['/api/catalogue/sync','POST'],['/api/catalogue/status?fresh=1','GET']]);
 assert(requests.every(r=>r.options.headers['X-QS-Session']==='disposable-fixture-session'&&r.options.credentials==='same-origin'));
 console.log('PASS: all catalogue calls use the existing authenticated same-origin API client');
 }finally{auth.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
