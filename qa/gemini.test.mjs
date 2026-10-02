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
test('provider uses fixed host, header key, system instruction, fresh server context, read-only calculation tool',async()=>{
 let sent;
 const result=await handleAssistant({...args,readBody:async()=>({message:'Help',consent:true,context:{password:'BAD_CONTEXT'}}),fetchImpl:async(url,options)=>{
  assert.ok(url.startsWith('https://generativelanguage.googleapis.com/v1beta/models/gemini-'));assert.ok(!url.includes('test-key'));
  assert.equal(options.headers['x-goog-api-key'],env.GEMINI_API_KEY);assert.ok(options.signal);
  sent=JSON.parse(options.body);return success();
 }});
 assert.equal(result.status,200);assert.equal(result.body.answer,'Saved draft Q1.');assert.equal(result.body.mode,'read-only');
 assert.ok(sent.systemInstruction);assert.deepEqual(sent.tools[0].functionDeclarations.map(t=>t.name),['calculateStudio','inspectStudio']);assert.ok(!JSON.stringify(sent).includes('BAD_CONTEXT'));assert.ok(!JSON.stringify(sent).includes('FOREIGN'));
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
 await assert.rejects(boundedJson(req('x'.repeat(32769))),e=>e.status===413);
 await assert.rejects(boundedJson(req('💡'.repeat(9000))),e=>e.status===413);
 await assert.rejects(boundedJson(req('{oops')),e=>e.status===400);
 assert.equal((await boundedJson(req('{"message":"hello"}'))).message,'hello');
});

test('connection diagnostics distinguish configuration and sanitized provider failures',async()=>{
 for (const [config,reason] of [[{},'disabled'],[{GEMINI_ENABLED:'true'},'missing_key'],[{...env,GEMINI_MODEL:'invalid model'},'invalid_model'],[env,null]]) {
  const r=await handleAssistant({...args,env:config,method:'GET',action:'status'});
  assert.equal(r.body.reason,reason);assert.equal(r.body.build,'workspace-5');
 }
 for(const [status,pattern] of [[400,/configuration/],[401,/authentication/],[403,/permissions/],[404,/GEMINI_MODEL/],[429,/quota/]]){
  const r=await handleAssistant({...args,fetchImpl:async()=>new Response('SECRET_PROVIDER_BODY',{status})});
  assert.match(r.body.error,pattern);assert.ok(!JSON.stringify(r).includes('SECRET_PROVIDER_BODY'));
 }
});

test('assistant identity comes only from authenticated profile, preserves spelling, and follows updates',async()=>{
 const profile={...owner,name:'रुशिकेश Dhumal',email:'private@example.test',password_hash:'SECRET_HASH'};
 const context=buildContext(raw,profile,null);
 assert.equal(context.signedInUser.name,'रुशिकेश Dhumal');
 assert.equal(buildContext(raw,{...profile,name:'Updated Profile'},null).signedInUser.name,'Updated Profile');
 assert.equal(buildContext(raw,{id:owner.id},null).signedInUser.name,null);
 assert.equal(JSON.stringify(context).includes('private@example.test'),false);
 assert.equal(JSON.stringify(context).includes('SECRET_HASH'),false);
 const r=await handleAssistant({...args,user:profile,readBody:async()=>({message:'What is my name?',consent:true,signedInUser:{name:'Spoofed Name'},name:'Spoofed Name'}),fetchImpl:async(url,options)=>{
  const sent=JSON.parse(options.body),text=JSON.stringify(sent);
  assert.ok(text.includes('रुशिकेश Dhumal'));assert.ok(!text.includes('Spoofed Name'));assert.match(sent.systemInstruction.parts[0].text,/Never confuse customer names/);
  return success();
 }});assert.equal(r.status,200);
});

test('greetings use profile first name; full identity retained and nickname never guessed',async()=>{
 for(const [name,firstName] of [['Rushikesh Dhumal','Rushikesh'],['  Rushi   Dhumal  ','Rushi'],['रुशिकेश धुमाळ','रुशिकेश'],['Rushi','Rushi'],['   ',null]]){
  const c=buildContext(raw,{...owner,name},null);
  assert.equal(c.signedInUser.firstName,firstName);
  assert.equal(c.signedInUser.name,name);
 }
 assert.equal(buildContext(raw,owner,null).signedInUser.firstName,null);
 const r=await handleAssistant({...args,user:{...owner,name:'Rushikesh Dhumal'},fetchImpl:async(url,options)=>{
  const sent=JSON.parse(options.body),instruction=sent.systemInstruction.parts[0].text;
  assert.match(instruction,/use signedInUser.firstName, not their full name/);
  assert.match(instruction,/explicitly requests a nickname/);
  assert.match(instruction,/Do not invent nicknames/);
  assert.match(instruction,/short, clean, direct answers/);
  assert.match(instruction,/Respond in professional English/);
  assert.match(instruction,/do not mirror its language or slang/);
  assert.ok(!instruction.includes("Reply in the user's language"));
  assert.match(instruction,/Do not append/);
  return success();
 }});assert.equal(r.status,200);
});
