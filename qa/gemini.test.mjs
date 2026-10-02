import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAssistant,buildContext,validateChat,boundedJson,makeLocalLimiter,configuration} from '../platform/gemini.mjs';
const owner={id:'u1',role:'sales'};
const row={id:'p1',owner_id:'u1',customer_name:'Customer',ref:'Q1',status:'draft',form_json:JSON.stringify({capacity:'100',costPerWp:'35',custEmail:'private@example.test',internalNotes:'SECRET',unknown:'secret-field'})};
const raw={total:1,byStatus:{draft:1},proposals:[row,{...row,id:'p2',owner_id:'u2',customer_name:'FOREIGN'}],selected:row,tasks:[],events:[]};
const env={GEMINI_ENABLED:'true',GEMINI_API_KEY:'test-key-not-real'};
const args={method:'POST',action:'chat',user:owner,env,readBody:async()=>({message:'Summarise',consent:true}),reserveQuota:async()=>true,loadContext:async()=>raw};
const success=()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'Saved draft Q1.'}]}}]}));

test('disabled by default, no credentials in status, authentication required',async()=>{
 assert.equal(configuration({GEMINI_API_KEY:'secret'}).enabled,false);
 let calls=0;
 const fetchImpl=()=>{calls++;return success()};
 assert.equal((await handleAssistant({...args,user:null,fetchImpl})).status,401);
 const status=await handleAssistant({...args,method:'GET',action:'status',fetchImpl});
 assert.equal(status.body.mode,'read-only');assert.ok(!JSON.stringify(status).includes(env.GEMINI_API_KEY));
 assert.equal((await handleAssistant({...args,env:{},fetchImpl})).status,503);assert.equal(calls,0);
});
test('consent and message validation, client model/context ignored',()=>{
 assert.throws(()=>validateChat({message:'x'}));assert.throws(()=>validateChat({message:'x'.repeat(2001),consent:true}));
 assert.throws(()=>validateChat({message:'x',consent:true,proposalId:'../../secrets'}));
 assert.deepEqual(validateChat({message:' x ',consent:true,context:'untrusted',model:'wrong',history:['ignore system']}),{message:'x',proposalId:null});
});
test('context is owner scoped, selected record checked, secrets/contact excluded',()=>{
 const data=buildContext(raw,owner,'p1'), text=JSON.stringify(data);
 assert.equal(data.recentQuotations.length,1);assert.ok(!text.includes('FOREIGN'));assert.ok(!text.includes('private@'));assert.ok(!text.includes('SECRET'));assert.ok(!text.includes('secret-field'));
 assert.equal(data.selectedQuotation.savedFields.capacity,'100');
 assert.throws(()=>buildContext({...raw,selected:{...row,owner_id:'u2'}},owner,'p1'),/not found/);
});
test('context has explicit sample limits and excludes event metadata',()=>{
 const items=Array.from({length:31},(_,i)=>({...row,id:'p'+i}));
 const data=buildContext({...raw,total:101,proposals:items,events:[{owner_id:'u1',event_type:'link_opened',meta_json:'TOKEN'}]},owner,null);
 assert.equal(data.recentQuotations.length,30);assert.equal(data.coverage.quotationsTruncated,true);assert.ok(!JSON.stringify(data).includes('TOKEN'));
});
test('provider uses fixed host, header key, system instruction, fresh server context, no tools',async()=>{
 let sent;
 const result=await handleAssistant({...args,readBody:async()=>({message:'Help',consent:true,context:{password:'BAD_CONTEXT'}}),fetchImpl:async(url,options)=>{
  assert.ok(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/gemini-'));assert.ok(!url.includes('test-key'));
  assert.equal(options.headers['x-goog-api-key'],env.GEMINI_API_KEY);assert.ok(options.signal);
  sent=JSON.parse(options.body);return success();
 }});
 assert.equal(result.status,200);assert.equal(result.body.answer,'Saved draft Q1.');assert.equal(result.body.mode,'read-only');
 assert.ok(sent.systemInstruction);assert.equal(sent.tools,undefined);assert.ok(!JSON.stringify(sent).includes('BAD_CONTEXT'));assert.ok(!JSON.stringify(sent).includes('FOREIGN'));
});
test('provider failures never leak upstream content or keys',async()=>{
 for (const status of [400,403,429,500]) {
  const result=await handleAssistant({...args,fetchImpl:async()=>new Response('secret test-key-not-real',{status})});
  assert.equal(result.status,status===429?429:502);assert.ok(!JSON.stringify(result).includes('test-key'));
 }
 const timeout=await handleAssistant({...args,fetchImpl:async()=>{throw new DOMException('secret','TimeoutError')}});assert.equal(timeout.status,504);
});
test('blocked/empty/tool output is not executed; truncation flagged',async()=>{
 const responses=[{promptFeedback:{blockReason:'SAFETY'}},{candidates:[{finishReason:'STOP',content:{parts:[{functionCall:{name:'deleteProposal'}}]}}]}];
 for(const value of responses)assert.equal((await handleAssistant({...args,fetchImpl:async()=>new Response(JSON.stringify(value))})).status,422);
 const result=await handleAssistant({...args,fetchImpl:async()=>new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'Partial'}]}}]}))});assert.equal(result.body.partial,true);
});
test('limits reject without invoking provider and local quota enforces fifth request',async()=>{
 const result=await handleAssistant({...args,reserveQuota:async()=>false,fetchImpl:()=>{throw Error('must not call')}});assert.equal(result.status,429);
 const limit=makeLocalLimiter();for(let i=0;i<5;i++)assert.equal(await limit('u'),true);assert.equal(await limit('u'),false);assert.equal(await limit('v'),true);
});
test('bounded body parser rejects oversized, malformed and multibyte bodies',async()=>{
 const req=s=>new Request('https://test.local',{method:'POST',body:s});
 await assert.rejects(boundedJson(req('x'.repeat(8193))),e=>e.status===413);
 await assert.rejects(boundedJson(req('💡'.repeat(3000))),e=>e.status===413);
 await assert.rejects(boundedJson(req('{oops')),e=>e.status===400);
 assert.equal((await boundedJson(req('{"message":"hello"}'))).message,'hello');
});
