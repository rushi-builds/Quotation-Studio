import assert from 'node:assert/strict';
import worker from '../platform/cloudflare/src/worker.js';
const queries=[];
const DB={prepare(sql){return{bind(...params){queries.push({sql,params});return{
 async first(){if(sql.includes('FROM sessions'))return{user_id:'u1'};if(sql.includes('FROM users'))return{id:'u1',role:'sales'};if(sql.includes('INSERT INTO assistant_usage'))return{count:1};if(sql.includes('FROM proposals WHERE id'))return null;
  /* Workspace-access gate (workspace-access-store.mjs): the assistant route
     now asks the shared access service for pricing.read before it does any
     work. A fresh workspace has no workspace_access row yet, and a sales
     writer keeps pricing access in that state, so "no row" is the correct
     fixture - returning nothing (or throwing) here used to turn the whole
     route into a 403 PRICING_ACCESS_REQUIRED unrelated to what this test
     checks. */
  if(sql.includes('FROM workspace_access'))return null;
  throw Error('Unexpected first SQL '+sql)},
 async all(){if(sql.includes('GROUP BY status'))return{results:[{status:'draft',count:1}]};return{results:[]}},async run(){return{success:true}}
 }}}}};
const env={DB,GEMINI_ENABLED:'true',GEMINI_API_KEY:'fake-never-sent'};
const status=await worker.fetch(new Request('https://workspace.test/api/assistant/status',{headers:{'X-QS-Session':'test-token'}}),env);
assert.equal(status.status,200);assert.equal((await status.json()).enabled,true);
const response=await worker.fetch(new Request('https://workspace.test/api/assistant/chat',{method:'POST',headers:{'Content-Type':'application/json','X-QS-Session':'test-token'},body:JSON.stringify({message:'Summarise',consent:true,proposalId:'p-foreign'})}),env);
assert.equal(response.status,404);
const contextQueries=queries.filter(q=>/FROM (proposals|tasks|portal_events)/.test(q.sql));assert.ok(contextQueries.length>=5);
for(const q of contextQueries){assert.match(q.sql,/owner_id = \?/);assert.ok(q.params.includes('u1'))}
assert.equal(queries.filter(q=>q.sql.includes('INSERT INTO assistant_usage')).length,4);
assert.ok(queries.some(q=>q.sql.includes('CREATE TABLE IF NOT EXISTS assistant_usage')));
assert.ok(queries.filter(q=>q.sql.includes('INSERT INTO assistant_usage')).every(q=>q.sql.includes('WHERE count < ? RETURNING count')));
console.log('PASS: Worker auth adapter, owner-scoped SQL, foreign record denied, persistent atomic global/user quotas. Provider not called.');
