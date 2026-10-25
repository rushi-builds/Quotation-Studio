import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { memDb } from './catalogue-db-fixture.mjs';
import { catalogueStatus, extractCatalogue, storeCatalogue, readCatalogue } from '../platform/cloudflare/src/catalogue.mjs';
import worker from '../platform/cloudflare/src/worker.js';

const fixture=readFileSync(new URL('./fixtures/catalogue-fixture.xlsm',import.meta.url));
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const account={client_email:'catalogue@example.test',private_key:pair.privateKey.export({type:'pkcs8',format:'pem'})};
const id='exact-fixture-workbook',env={GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON:JSON.stringify(account),GOOGLE_DRIVE_PRODUCT_CATALOG_FILE_ID:id,GDRIVE_FILE_ID:'must-not-be-selected'};
const db=memDb();env.DB=db;
const originalFetch=globalThis.fetch,originalNow=Date.now;let clock=originalNow(),bytes=fixture,modified='2026-10-25T09:00:00Z',version='1',requests=[],race=false,fail=false;
Date.now=()=>clock;
const md5=()=>createHash('md5').update(bytes).digest('hex');
const call=(route,method='GET',token='owner-token')=>worker.fetch(new Request('https://workspace.test/api/'+route,{method,headers:token?{'X-QS-Session':token}:{}}),env);
globalThis.fetch=async(url,options={})=>{
 const u=new URL(String(url));requests.push({url:u.href,method:options.method||'GET'});
 if(u.hostname==='oauth2.googleapis.com'){
  const payload=JSON.parse(Buffer.from(new URLSearchParams(options.body).get('assertion').split('.')[1],'base64url'));
  assert.equal(payload.scope,'https://www.googleapis.com/auth/drive.readonly');return Response.json({access_token:'disposable-test-token'});
 }
 assert.equal(u.pathname,'/drive/v3/files/'+id,'metadata and download must use the exact configured product workbook');
 assert.equal(options.headers.Authorization,'Bearer disposable-test-token');
 if(fail)return new Response('',{status:503});
 if(u.searchParams.get('alt')==='media'){
  const content=bytes;if(race)bytes=Buffer.concat([bytes,Buffer.from('changed during download')]);
  return new Response(content);
 }
 return Response.json({id,name:'Exact catalogue.xlsm',mimeType:'application/vnd.ms-excel.sheet.macroEnabled.12',md5Checksum:md5(),modifiedTime:modified,version,size:bytes.length});
};
try {
 let response=await call('catalogue/status','GET',null);assert.equal(response.status,401);assert.equal(requests.length,0);
 response=await call('catalogue/status');let status=await response.json();assert.equal(status.status,'not-synced');assert.equal(status.canSync,true);assert.equal(status.workbookUrl,'https://drive.google.com/file/d/'+id+'/view');assert.equal(db.batches.length,0);assert(!requests.some(r=>r.url.includes('alt=media')));
 db.meta.set('syncedAt','2026-10-13T10:00:00Z');db.meta.set('sha','legacy-snapshot');response=await call('catalogue/status');const legacy=await response.json();assert.equal(legacy.status,'unknown','missing historic revision is not evidence that Excel changed');assert.match(legacy.reason,/Sync once to verify/);db.meta.clear();
 response=await call('catalogue/status','GET','viewer-token');assert.equal((await response.json()).canSync,false);
 for(const token of [null,'viewer-token']){response=await call('catalogue/sync','POST',token);assert.equal(response.status,403);}assert.equal(db.batches.length,0);
 response=await call('catalogue/sync','POST','owner-token');assert.equal(response.status,200);const synced=await response.json();assert.equal(synced.catalogue.modules.length,2);assert.equal(db.rows.length,5);assert.equal(db.batches.length,1);assert.equal(db.meta.get('fileId'),id);assert.equal(db.meta.get('sourceRevision'),md5());
 response=await call('catalogue/status');status=await response.json();assert.equal(status.status,'up-to-date');assert.equal(status.sha,synced.sha);const count=requests.length;await call('catalogue/status');assert.equal(requests.length,count,'one-minute metadata cache avoids repeated Drive reads');
 const before=JSON.stringify({rows:db.rows,meta:[...db.meta]});bytes=Buffer.concat([fixture,Buffer.from('new saved revision')]);version='2';modified='2026-10-25T10:00:00Z';clock+=60001;
 response=await call('catalogue/status');assert.equal((await response.json()).status,'outdated');assert.equal(JSON.stringify({rows:db.rows,meta:[...db.meta]}),before,'metadata check never writes catalogue data');
 response=await call('catalogue/sync','POST','admin-token');assert.equal(response.status,200,'existing elevated-admin sync authority is preserved');assert.equal(db.rows.length,5,'second sync replaces rather than duplicates rows');
 response=await call('catalogue/status');assert.equal((await response.json()).status,'up-to-date');
 const good=JSON.stringify({rows:db.rows,meta:[...db.meta]});race=true;response=await call('catalogue/sync','POST');assert.equal(response.status,502);assert.equal(JSON.stringify({rows:db.rows,meta:[...db.meta]}),good,'a workbook changing during sync never replaces the last good snapshot');race=false;
 clock+=60001;fail=true;response=await call('catalogue/status');assert.equal(response.status,502);assert.equal((await response.json()).code,'CATALOGUE_STATUS_UNAVAILABLE');assert.equal(JSON.stringify({rows:db.rows,meta:[...db.meta]}),good);fail=false;
 const broken=await worker.fetch(new Request('https://workspace.test/api/catalogue/status',{headers:{'X-QS-Session':'owner-token'}}),{DB:memDb()});assert.equal(broken.status,503);assert.equal((await broken.json()).code,'NOT_CONFIGURED');
 const publicStatus=await catalogueStatus({GDRIVE_MODE:'public',GDRIVE_FILE_ID:'public-test'},db);assert.equal(publicStatus.status,'unknown','public mode must not invent freshness');
 console.log('PASS: exact file, read-only metadata, first-sync/outdated/up-to-date, cache, owner/admin authority, no auto-sync, changing-file race and connection failures');
} finally {globalThis.fetch=originalFetch;Date.now=originalNow;}

// Exercise D1's actual immutable bind contract, row chunking, cable variants,
// delete/replacement semantics and rollback; no destructive external operations.
const many={modules:Array.from({length:130},(_,i)=>({make:'Fixture solar',model:'M'+i,wp:500+i})),inverters:[{make:'Fixture inverter',model:'I1',kw:7}],cables:[{make:'Fixture cable',category:'DC',size:4},{make:'Fixture cable',category:'DC',size:6}],sha:'test-sha'};
const storage=memDb();await storeCatalogue(storage,many,{syncedAt:'2026-10-25T10:00:00Z'});assert.equal(storage.rows.length,133);assert(storage.batches[0].every(s=>s.params.length<=100));assert.equal((await readCatalogue(storage)).cables.length,2);
const kept=JSON.stringify({rows:storage.rows,meta:[...storage.meta]});storage.failBatch=true;await assert.rejects(()=>storeCatalogue(storage,{...many,modules:many.modules.slice(0,1)},{source:'must not commit'}));assert.equal(JSON.stringify({rows:storage.rows,meta:[...storage.meta]}),kept);storage.failBatch=false;
await storeCatalogue(storage,{...many,modules:[many.modules[0],{...many.modules[0],wp:750},many.modules[0]]},{});assert.equal(storage.rows.length,6,'same-name rating bins and identical Excel rows are preserved');
console.log('PASS: every D1 row retained, 100-parameter chunk limit, distinct cable variants, atomic rollback and same-model rating-bin preservation');
const shipped={};runInNewContext(readFileSync(new URL('../assets/js/catalogue-data.js',import.meta.url),'utf8'),{self:shipped});const full=memDb();await storeCatalogue(full,{...shipped.CATALOGUE_DATA,sha:'public-bundled-fixture'},{});assert.equal(full.rows.length,531);assert(full.batches[0].length<50);console.log('PASS: all 531 shipped module/inverter/cable rows retained, including duplicate rating-bin names, in fewer than 50 D1 statements');

// Store-only ZIP builder for an expanded named-table fixture, not a real workbook.
function zipStore(entries){const parts=[],central=[];let offset=0;const crc32=b=>{let c=0xffffffff;for(const x of b){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};for(const [name,data]of entries){const n=Buffer.from(name),b=Buffer.from(data),local=Buffer.alloc(30+n.length),cd=Buffer.alloc(46+n.length),crc=crc32(b);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(b.length,18);local.writeUInt32LE(b.length,22);local.writeUInt16LE(n.length,26);n.copy(local,30);cd.writeUInt32LE(0x02014b50);cd.writeUInt16LE(20,4);cd.writeUInt16LE(20,6);cd.writeUInt32LE(crc,16);cd.writeUInt32LE(b.length,20);cd.writeUInt32LE(b.length,24);cd.writeUInt16LE(n.length,28);cd.writeUInt32LE(offset,42);n.copy(cd,46);parts.push(local,b);central.push(cd);offset+=local.length+b.length;}const tail=Buffer.alloc(22);tail.writeUInt32LE(0x06054b50);tail.writeUInt16LE(entries.length,8);tail.writeUInt16LE(entries.length,10);tail.writeUInt32LE(central.reduce((n,b)=>n+b.length,0),12);tail.writeUInt32LE(offset,16);return Buffer.concat([...parts,...central,tail]);}
const folder=new URL('./fixtures/catalogue-xlsm/',import.meta.url),entries=readdirSync(folder,{recursive:true,withFileTypes:true}).filter(f=>f.isFile()).map(f=>{const parent=f.parentPath||f.path;const absolute=parent+'/'+f.name;return[absolute.slice(new URL(folder).pathname.length),readFileSync(absolute,'utf8')];});
const moduleEntry=entries.find(([name])=>name==='xl/worksheets/sheet1.xml');assert(moduleEntry);moduleEntry[1]=moduleEntry[1].replace('</sheetData>','<row r="330"><c r="A330" t="inlineStr"><is><t>Added solar</t></is></c><c r="C330" t="inlineStr"><is><t>Added-620</t></is></c><c r="F330"><v>620</v></c></row></sheetData>');entries.push(['xl/tables/table-new.xml','<table name="tblModule" displayName="tblModule" ref="A4:V330"></table>']);
const extended=await extractCatalogue(zipStore(entries),'expanded-fixture.xlsm');assert(extended.modules.some(m=>m.model==='Added-620'&&m.wp===620));assert.equal(extended.cables.length,1,'unrelated cable-factor rows remain excluded');console.log('PASS: appended Excel table rows beyond the former row ceiling are included; unrelated tables stay excluded');
