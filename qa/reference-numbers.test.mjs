import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../platform/cloudflare/src/worker.js';
import {reserveCloudReference,referenceYear} from '../platform/reference-numbers.mjs';

function database() {
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(fs.readFileSync(new URL('../platform/schema.sql',import.meta.url),'utf8'));
 const DB = {
   prepare(sql) {
     let params=[];
     const statement=sqlite.prepare(sql);
     return {
       bind(...p) { params=p; return this; },
       async first() { return statement.get(...params)||null; },
       async all() { return {results:statement.all(...params)}; },
       async run() { return {success:true,meta:{changes:Number(statement.run(...params).changes)}}; }
     };
   }
 };
 return {sqlite,DB};
}
test('atomic cloud allocation seeds from existing refs, survives deletions and starts a new year',async()=>{
 const {sqlite,DB}=database();try{
  sqlite.prepare('INSERT INTO users(id,email,name,password_hash,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('u','seed@example.test','Seed','unused','','');
  sqlite.prepare('INSERT INTO proposals (id,owner_id,ref,created_at,updated_at) VALUES (?,?,?,?,?)').run('old','u','KTM/2026/Solar/013','','');
  const date=new Date('2026-10-03T10:00:00Z');
  const refs=await Promise.all(Array.from({length:40},()=>reserveCloudReference(DB,date)));
  assert.equal(new Set(refs).size,40);assert.equal(refs[0],'KTM/2026/Solar/014');assert.equal(refs.at(-1),'KTM/2026/Solar/053');
  sqlite.exec('DELETE FROM proposals');assert.equal(await reserveCloudReference(DB,date),'KTM/2026/Solar/054');
  assert.equal(await reserveCloudReference(DB,new Date('2026-12-31T20:00:00Z')),'KTM/2027/Solar/001');
 }finally{sqlite.close()}
});

test('Worker create/duplicate/update keep metadata and form refs aligned; manual refs preserved; permissions enforced',async()=>{
 const {sqlite,DB}=database();try{
  for(const role of ['sales','viewer']){sqlite.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(role,role+'@example.test',role,'unused',role,'','');sqlite.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(role+'-token',role,'2099-01-01','');}
  const call=async(method,path,body={},role='sales')=>{const response=await worker.fetch(new Request('https://studio.test/api/'+path,{method,headers:{'Content-Type':'application/json','X-QS-Session':role+'-token'},...(method==='GET'?{}:{body:JSON.stringify(body)})}),{DB});return {status:response.status,data:await response.json()};};
  const one=await call('POST','proposals',{form:{}});assert.equal(one.status,201);const ref=one.data.proposal.ref;assert.match(ref,/^KTM\/\d{4}\/Solar\/\d+$/);assert.equal(one.data.proposal.form.propRef,ref);
  const two=await call('POST','proposals',{form:{}});assert.notEqual(two.data.proposal.ref,ref);
  const copy=await call('POST','proposals/'+one.data.proposal.id+'/duplicate');assert.equal(copy.status,201);assert.notEqual(copy.data.proposal.ref,ref);assert.equal(copy.data.proposal.ref,copy.data.proposal.form.propRef);
  const manual=await call('POST','proposals',{form:{propRef:'CUSTOM-KEEP-042'}});assert.equal(manual.data.proposal.ref,'CUSTOM-KEEP-042');
  const updated=await call('PUT','proposals/'+one.data.proposal.id,{form:{...one.data.proposal.form,custName:'Updated customer'},baseRevision:1});assert.equal(updated.status,200);assert.equal(updated.data.proposal.ref,ref);
  const blocked=await call('POST','proposals/reference',{},'viewer');assert.equal(blocked.status,403);
  const reserved=await call('POST','proposals/reference');assert.equal(reserved.status,200);assert.notEqual(reserved.data.reference,copy.data.proposal.ref);
  await call('DELETE','proposals/'+copy.data.proposal.id);const after=await call('POST','proposals',{form:{}});assert.ok(Number(after.data.proposal.ref.split('/').at(-1))>Number(reserved.data.reference.split('/').at(-1)));
 }finally{sqlite.close()}
});

test('offline store assigns refs on first boot/new/duplicate, retains versions and advances above imports',()=>{
 const store=new Map(),session=new Map(),storage=m=>({getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)});
 const ctx={localStorage:storage(store),sessionStorage:storage(session),Date,console};ctx.self=ctx;vm.runInNewContext(fs.readFileSync(new URL('../assets/js/model.js',import.meta.url),'utf8'),ctx);
 const P=ctx.Proposals;P.init();const first=P.active();assert.match(first.form.propRef,/\/001$/);
 const second=P.create({});assert.notEqual(second.form.propRef,first.form.propRef);
 const copy=P.duplicate(first.id);assert.notEqual(copy.form.propRef,first.form.propRef);
 const version=P.saveAsVersion(first.id);assert.equal(version.form.propRef,first.form.propRef);assert.equal(version.form.propVersion,'1.1');
 const year=new Date().getFullYear();P.create({propRef:`KTM/${year}/Solar/15000`});assert.equal(P.nextRef(),`KTM/${year}/Solar/15001`);
 for(const item of P.list())P.remove(item.id);assert.equal(P.activeId(),null);assert.equal(P.create({}).form.propRef,`KTM/${year}/Solar/15002`);
 assert.equal(referenceYear(new Date('2026-12-31T20:00:00Z')),2027);
});
