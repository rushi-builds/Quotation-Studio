'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'quotation.html'),'utf8').replace(/<script[^>]*src=[^>]*><\/script>/g,'');
const archive={_v:2,modules:[{make:'Archived solar',wp:700},{make:'Waaree',model:'Bi-55-545',wp:999}],inverters:[{make:'Archived inverter',kw:20}],structures:[{label:'Archived structure'}],cables:[{label:'Archived cable'}]};
const cloud={sha:'fixture-sha',syncedAt:'2026-10-25T10:00:00Z',source:'Exact workbook.xlsm',modules:[{make:'Excel solar',model:'Excel-620',wp:620,lengthMm:2300,widthMm:1134,cellType:'HJT'}],inverters:[{make:'Excel inverter',model:'Excel-8',kw:8}],cables:[{make:'Excel cable',size:4}]};
const metadata={ok:true,status:'not-synced',canSync:true,fileId:'exact-fixture-workbook',fileName:'Exact workbook.xlsm',workbookUrl:'https://drive.google.com/file/d/exact-fixture-workbook/view',syncedAt:'',sha:'',counts:{},checkedAt:'2026-10-25T10:05:00Z'};
const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('UI did not settle');};
function create(url='http://catalogue.test/quotation.html',preview=false){
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,d=w.document,calls=[];let meta={...metadata},payload=structuredClone(cloud),failure='',syncFailure=false;
 w.Element.prototype.scrollIntoView=function(){};w.localStorage.setItem('qstudio.equipment',JSON.stringify(archive));
 if(preview){w.fetch=async()=>{calls.push('forbidden-fetch');throw new Error('Must never call production from preview');};w.eval(fs.readFileSync(path.join(root,'assets/js/platform-api.js'),'utf8'));}
 else w.PlatformAPI={catalogueStatus:async()=>{calls.push('GET status');if(failure)throw Object.assign(new Error(failure),{code:failure});return structuredClone(meta);},equipmentCatalogue:async()=>{calls.push('GET catalogue');return{ok:true,catalogue:structuredClone(payload)};},syncEquipmentCatalogue:async()=>{calls.push('POST sync');if(syncFailure)throw new Error('Simulated network failure');meta={...meta,status:'up-to-date',sha:payload.sha,syncedAt:payload.syncedAt,counts:{modules:payload.modules.length,inverters:payload.inverters.length,cables:payload.cables.length}};return{ok:true,catalogue:structuredClone(payload)};}};
 for(const file of ['catalogue-data.js','equipment.js','excel-catalogue.js'])w.eval(fs.readFileSync(path.join(root,'assets/js',file),'utf8'));
 d.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {dom,w,d,calls,setMeta:m=>meta={...meta,...m},setPayload:p=>payload=p,setFailure:x=>failure=x,setSyncFailure:x=>syncFailure=x};
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
 a.setMeta({status:'outdated'});await w.ExcelCatalogue.refresh();assert.equal(d.getElementById('catalogueHeaderStatus').textContent,'Please sync');assert.equal(calls.filter(x=>x==='POST sync').length,1,'metadata check never syncs');
 const stored=w.localStorage.getItem('qsCloudCatalogue');a.setSyncFailure(true);await w.ExcelCatalogue.sync();assert.equal(d.getElementById('catalogueStatusLink').dataset.state,'error');assert.equal(w.localStorage.getItem('qsCloudCatalogue'),stored);assert(!d.getElementById('syncCatalogueBtn').disabled);a.setSyncFailure(false);
 a.setMeta({status:'unknown',reason:'Change checks unavailable.'});await w.ExcelCatalogue.refresh();assert.equal(d.getElementById('catalogueStatusLink').dataset.state,'unknown');assert(d.getElementById('catalogueSyncStatus').title.includes('Change checks unavailable'));
 a.setMeta({canSync:false});await w.ExcelCatalogue.refresh();const denied=calls.filter(x=>x==='POST sync').length;await w.ExcelCatalogue.sync();assert(d.getElementById('syncCatalogueBtn').disabled);assert.equal(calls.filter(x=>x==='POST sync').length,denied);
 a.setMeta({workbookUrl:'javascript:alert(1)',fileName:'<img src=x onerror=alert(1)>'});await w.ExcelCatalogue.refresh();assert(!d.getElementById('openCatalogueExcel').hasAttribute('href'));assert(!d.querySelector('#catalogueWorkbook img'));
 a.setFailure('NOT_CONFIGURED');await w.ExcelCatalogue.refresh();assert.equal(d.getElementById('catalogueStatusLink').dataset.state,'unknown');assert.match(d.getElementById('catalogueSyncStatus').title,/not configured/);assert.equal(w.localStorage.getItem('qsCloudCatalogue'),stored);a.setFailure('');
 // An old/malformed response must not replace the last valid catalogue.
 assert.throws(()=>w.EquipmentStore.importCloud({modules:[],inverters:[],cables:[]}));assert.equal(w.localStorage.getItem('qsCloudCatalogue'),stored);
 a.setMeta({status:'up-to-date',sha:'new-sha',canSync:true,workbookUrl:metadata.workbookUrl});a.setPayload({...cloud,sha:'new-sha'});
 const proto=Object.getPrototypeOf(w.localStorage),setItem=proto.setItem;proto.setItem=()=>{throw new Error('Full');};await w.ExcelCatalogue.refresh();proto.setItem=setItem;assert.equal(d.getElementById('catalogueStatusLink').dataset.state,'unknown');assert.match(d.getElementById('catalogueSyncStatus').title,/storage is unavailable/);assert.equal(w.localStorage.getItem('qstudio.equipment'),JSON.stringify(archive));
 await w.ExcelCatalogue.refresh();assert.equal(d.getElementById('catalogueStatusLink').dataset.state,'up-to-date');assert.equal(JSON.parse(w.localStorage.getItem('qsCloudCatalogue')).sha,'new-sha');
 console.log('PASS: Excel-only UI/source, archived local data, exact safe link, navigation-only arrow, truthful states, explicit sync, cache failure, permission and malformed-payload safety');
 }finally{a.dom.window.close();}
 const preview=create('https://quotation-studio-isolated-fixture.vercel.app/quotation.html',true);try{await until(()=>preview.d.getElementById('catalogueSyncStatus').textContent.includes('Preview only'));assert.deepEqual(preview.calls,[]);assert(preview.d.getElementById('syncCatalogueBtn').disabled);assert(!preview.d.getElementById('openCatalogueExcel').hasAttribute('href'));console.log('PASS: actual PlatformAPI preview guard blocks all production catalogue requests');}finally{preview.dom.window.close();}
 const auth=new JSDOM('',{url:'https://studio.example.test',runScripts:'outside-only'});try{
 const w=auth.window,requests=[];w.fetch=async(url,options)=>{requests.push({url,options});return{ok:true,text:async()=>JSON.stringify({ok:true})};};
 w.eval(fs.readFileSync(path.join(root,'assets/js/platform-api.js'),'utf8'));w.PlatformAPI.setSessionToken('disposable-fixture-session');
 await w.PlatformAPI.catalogueStatus();await w.PlatformAPI.equipmentCatalogue();await w.PlatformAPI.syncEquipmentCatalogue();
 assert.deepEqual(requests.map(r=>[r.url,r.options.method]),[['/api/catalogue/status','GET'],['/api/catalogue','GET'],['/api/catalogue/sync','POST']]);
 assert(requests.every(r=>r.options.headers['X-QS-Session']==='disposable-fixture-session'&&r.options.credentials==='same-origin'));
 console.log('PASS: all catalogue calls use the existing authenticated same-origin API client');
 }finally{auth.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
