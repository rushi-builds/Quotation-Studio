/* Disposable SQLite + JSON-store tests, including the actual Worker route.
   No live API, credentials, migrations or production customer data. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { submitFeedback, validateFeedback, d1FeedbackStore, localFeedbackStore } from '../platform/proposal-feedback.mjs';
import worker from '../platform/cloudflare/src/worker.js';
const raw = 'a1'.repeat(24), now = new Date().toISOString();
const h = text => createHash('sha256').update(text).digest('hex');
function fixture() {
 const sql = new DatabaseSync(':memory:'); sql.exec(readFileSync(new URL('../platform/schema.sql',import.meta.url),'utf8'));
 sql.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('owner','owner@fixture.invalid','Test owner','not-a-login','sales',now,now);
 sql.prepare('INSERT INTO proposals(id,owner_id,ref,customer_name,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('p1','owner','TEST-001','Local test customer',now,now);
 sql.prepare('INSERT INTO proposal_versions(id,proposal_id,owner_id,version_label,snapshot_json,created_at) VALUES(?,?,?,?,?,?)').run('v1','p1','owner','2.0','{}',now);
 sql.prepare('INSERT INTO access_tokens(id,token_hash,version_id,proposal_id,owner_id,created_at) VALUES(?,?,?,?,?,?)').run('t1',h(raw),'v1','p1','owner',now);
 const db = { prepare(query) { return {bind(...args) {return {first:async()=>sql.prepare(query).get(...args),all:async()=>({results:sql.prepare(query).all(...args)}),run:async()=>({success:true,meta:sql.prepare(query).run(...args)}),query,args};}};},async batch(statements){sql.exec('BEGIN');try{const result=statements.map(s=>sql.prepare(s.query).run(...s.args));sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}} };
 return {sql,db,store:d1FeedbackStore(db)};
}
const body = (extra={})=>({token:raw,submissionId:'feedback_submission_00001',rating:4,comment:'Please explain the roof layout.',nextStep:'question',contactRequested:true,...extra});
test('strict optional-rating validation; no blank/spoofed/coerced feedback',()=>{
 for(const value of [0,6,2.5,'5',true]) assert.throws(()=>validateFeedback(body({rating:value})),{status:400});
 assert.throws(()=>validateFeedback(body({rating:null,comment:'  '})),{status:400});
 assert.throws(()=>validateFeedback(body({comment:'x'.repeat(1501)})),{status:400});
 assert.throws(()=>validateFeedback(body({nextStep:'free_pvsyst'})),{status:400});
 assert.throws(()=>validateFeedback(body({contactRequested:'yes'})),{status:400});
 assert.equal(validateFeedback(body({rating:null,comment:'Need a call'})).rating,null);
 assert.equal(validateFeedback(body({comment:'अ'.repeat(1500)})).comment.length,1500,'Unicode feedback fits the advertised character budget');
 assert.equal(validateFeedback(body({comment:'<img src=x onerror=alert(1)>'})).comment,'<img src=x onerror=alert(1)>');
});
test('atomic SQLite save, server-owned association, one notification, retry-safe receipt',async()=>{
 const {sql,store}=fixture();try{
 const first=await submitFeedback(store,body({owner_id:'attacker',proposal_id:'other'}));assert.equal(first.ok,true);
 assert.equal(first.feedback.duplicate,false);
 const retries=await Promise.all(Array.from({length:5},()=>submitFeedback(store,body())));assert(retries.every(r=>r.feedback.id===first.feedback.id));
 assert.equal(sql.prepare('SELECT COUNT(*) c FROM portal_events').get().c,1);assert.equal(sql.prepare('SELECT COUNT(*) c FROM notifications').get().c,1);
 const event=sql.prepare('SELECT * FROM portal_events').get();assert.equal(event.owner_id,'owner');assert.equal(event.proposal_id,'p1');assert.equal(event.version_id,'v1');
 const meta=JSON.parse(event.meta_json);assert.equal(meta.rating,4);assert.equal(meta.contactRequested,true);assert.equal(meta.versionLabel,'2.0');assert.equal(meta.customerName,'Local test customer');assert(!event.meta_json.includes(raw));
 await assert.rejects(submitFeedback(store,body({rating:1})),{status:409});
 }finally{sql.close();}
});
test('expired/revoked/mismatched/deleted links cannot submit, even on duplicate retry',async()=>{
 const {sql,store}=fixture();try{
 await submitFeedback(store,body());sql.prepare('UPDATE access_tokens SET revoked_at=?').run(now);
 await assert.rejects(submitFeedback(store,body()),{status:404});
 sql.prepare('UPDATE access_tokens SET revoked_at=NULL,expires_at=?').run('2000-01-01T00:00:00Z');await assert.rejects(submitFeedback(store,body()),{status:404});
 sql.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('another','another@fixture.invalid','Other','no-login','sales',now,now);
 sql.prepare('INSERT INTO proposals(id,owner_id,ref,created_at,updated_at) VALUES(?,?,?,?,?)').run('p2','another','OTHER',now,now);
 sql.prepare('UPDATE access_tokens SET expires_at=NULL,proposal_id=?').run('p2');await assert.rejects(submitFeedback(store,body()),{status:404});
 }finally{sql.close();}
});
test('atomic rate gate, duplicate retry stays safe at the cap',async()=>{
 const {sql,store}=fixture();try{
 const results=await Promise.allSettled(Array.from({length:12},(_,i)=>submitFeedback(store,body({submissionId:'feedback_submission_'+String(i).padStart(5,'0')}))));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,6);assert.equal(sql.prepare('SELECT COUNT(*) c FROM notifications').get().c,6);
 assert(results.filter(r=>r.status==='rejected').every(r=>r.reason.status===429));
 assert.equal((await submitFeedback(store,body({submissionId:'feedback_submission_00000'}))).feedback.duplicate,true);
 }finally{sql.close();}
});
test('local adapter uses the same data/receipt contract without duplicate writes',async()=>{
 let json={tokens:[{id:'t1',token_hash:h(raw),proposal_id:'p1',version_id:'v1',owner_id:'owner'}],versions:[{id:'v1',proposal_id:'p1',owner_id:'owner',version_label:'2.0'}],proposals:[{id:'p1',owner_id:'owner',ref:'TEST-001'}],events:[],notifications:[]};
 const store=localFeedbackStore(()=>structuredClone(json),d=>{json=d;});
 await Promise.all([submitFeedback(store,body()),submitFeedback(store,body())]);assert.equal(json.events.length,1);assert.equal(json.notifications.length,1);
});
test('actual Worker HTTP route: validated receipt, no public readback, CSRF rejection, generic-event bypass rejected',async()=>{
 const {sql,db}=fixture();try{
 const send=(data,origin='https://feedback.test')=>worker.fetch(new Request('https://feedback.test/api/portal/feedback',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)}),{DB:db,APP_URL:'https://feedback.test'},{});
 const saved=await send(body());assert.equal(saved.status,201);assert((await saved.json()).feedback.id.startsWith('fb_'));
 assert.equal((await send(body())).status,200);assert.equal((await send(body(),'https://attacker.invalid')).status,403);
 assert.equal((await send(body({submissionId:'unicode_submission_00001',comment:'अ'.repeat(1500)}))).status,201,'Unicode feedback fits the HTTP byte bound');
 assert.equal((await send(body({rating:9}))).status,400);assert.equal((await send({...body(),junk:'x'.repeat(9000)})).status,413);
 const read=await worker.fetch(new Request('https://feedback.test/api/activity'),{DB:db},{});assert.equal(read.status,401);
 const bypass=await worker.fetch(new Request('https://feedback.test/api/portal/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:raw,type:'proposal_feedback',meta:{rating:5}})}),{DB:db},{});assert.equal(bypass.status,400);
 }finally{sql.close();}
});

test('a notification persistence failure rolls the feedback back (no false receipt)',async()=>{
 const {sql,store}=fixture();try{
 sql.exec("CREATE TRIGGER fail_notification BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT, 'temporary write failure'); END;");
 await assert.rejects(submitFeedback(store,body()));
 assert.equal(sql.prepare('SELECT COUNT(*) c FROM portal_events').get().c,0);
 assert.equal(sql.prepare('SELECT COUNT(*) c FROM notifications').get().c,0);
 }finally{sql.close();}
});

test('feedback belongs to the assigned proposal owner, not an admin who published its link',async()=>{
 const {sql,store}=fixture();try{
 sql.prepare('INSERT INTO users(id,email,name,password_hash,role,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('publisher','publisher@fixture.invalid','Publisher','no-login','owner',now,now);
 sql.prepare('UPDATE access_tokens SET owner_id=?').run('publisher');
 sql.prepare('UPDATE proposal_versions SET owner_id=?').run('publisher');
 await submitFeedback(store,body());
 assert.equal(sql.prepare('SELECT owner_id FROM portal_events').get().owner_id,'owner');
 assert.equal(sql.prepare('SELECT owner_id FROM notifications').get().owner_id,'owner');
 }finally{sql.close();}
});
