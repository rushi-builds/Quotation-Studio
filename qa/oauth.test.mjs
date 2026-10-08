import test from 'node:test';
import assert from 'node:assert/strict';
import {handleOAuth,verifiedIdentity,configuration,providerStatus,digest} from '../platform/cloudflare/src/oauth.mjs';
import {localOAuthStore,d1OAuthStore} from '../platform/oauth-store.mjs';
import {generateKeyPair,SignJWT,exportJWK} from '../platform/vendor/jose.mjs';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const origin='https://studio.example.test';
const pair=await generateKeyPair('RS256');
const fakeSecret='e30.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test-only';
const env={OAUTH_PUBLIC_ORIGIN:origin,OAUTH_GOOGLE_ENABLED:'true',GOOGLE_CLIENT_ID:'google-test',GOOGLE_CLIENT_SECRET:'not-real',OAUTH_MICROSOFT_ENABLED:'true',MICROSOFT_CLIENT_ID:'microsoft-test',MICROSOFT_CLIENT_SECRET:'not-real',OAUTH_APPLE_ENABLED:'true',APPLE_CLIENT_ID:'apple-test',APPLE_CLIENT_SECRET:fakeSecret};
const claims=(provider,nonce,extra={})=>({iss:provider==='google'?'https://accounts.google.com':provider==='apple'?'https://appleid.apple.com':'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0',exp:Math.floor(Date.now()/1000)+300,sub:'subject-1',aud:provider+'-test',nonce,email:'person@example.test',email_verified:true,name:'Provider Name',...(provider==='microsoft'?{tid:'11111111-2222-3333-4444-555555555555'}:{}),...extra});
const signed=p=>new SignJWT(p).setProtectedHeader({alg:'RS256',kid:'test-key'}).setIssuedAt().setExpirationTime('5m').sign(pair.privateKey);
function local(){let db={users:[],sessions:[]};return {store:localOAuthStore(()=>structuredClone(db),value=>{db=value;}),db:()=>db};}
function harness(store,user=null){
 const sessions=[];
 const auth={canLink:async()=>true,user:async()=>user,token:()=>user?'existing-session':null,userByToken:async token=>token==='existing-session'?user:null,session:async u=>{sessions.push(u);return {token:'new-session'};},cookie:t=>'qs_session='+t+'; Path=/; HttpOnly; Secure; SameSite=None',rateKey:'test-ip'};
 return {auth,sessions};
}
const request=(route,method='GET',body,headers={})=>new Request(origin+'/api/auth/oauth/'+route,{method,headers:{Origin:origin,...headers},...(body===undefined?{}:{body})});
async function begin(store,auth,provider='google',link=false){
 const r=await handleOAuth(request(provider+'/start','POST',JSON.stringify({link})),env,store,auth);assert.equal(r.status,200);const b=await r.json(),u=new URL(b.url);
 return {state:u.searchParams.get('state'),nonce:u.searchParams.get('nonce'),cookie:r.headers.get('set-cookie').split(';')[0],url:u};
}
async function finish(store,auth,start,provider='google',extra={},overrides={}){
 const token=await signed(claims(provider,start.nonce,extra));
 const p=new URLSearchParams({state:start.state,code:'provider-code',...(provider==='apple'?{user:JSON.stringify({name:{firstName:'Apple',lastName:'Name'}})}:{})});
 let exchanges=0;
 const deps={keyResolver:pair.publicKey,fetch:async(url,options)=>{exchanges++;assert.equal(options.redirect,'manual');const form=options.body;assert.equal(form.get('redirect_uri'),origin+'/api/auth/oauth/'+provider+'/callback');if(provider!=='apple')assert.ok(form.get('code_verifier'));return Response.json({id_token:token,access_token:'discard-this'});},...overrides};
 const r=await handleOAuth(request(provider+'/callback'+(provider==='apple'?'':'?'+p),provider==='apple'?'POST':'GET',provider==='apple'?p.toString():undefined,{Cookie:start.cookie}),env,store,auth,deps);
 return {r,exchanges};
}
test('unconfigured/malformed provider setup fails closed without secrets or state writes',async()=>{
 assert.ok(providerStatus({}).every(p=>!p.configured));assert.ok(providerStatus({...env,OAUTH_PUBLIC_ORIGIN:'https://attacker.test/path'}).every(p=>!p.configured));
 const {store}=local(),{auth}=harness(store);
 const r=await handleOAuth(request('google/start','POST','{}'),{},store,auth);assert.equal(r.status,503);assert.ok(!JSON.stringify(await r.json()).includes('not-real'));
 assert.equal((await handleOAuth(request('google/start','POST','{}',{Origin:'https://other.test'}),env,store,auth)).status,403);
 assert.equal((await handleOAuth(request('google/start'),env,store,auth)).status,405);
});
test('all three signed code flows create read-only accounts and use secure cookies, not URL tokens',async()=>{
 for(const provider of ['google','microsoft','apple']){
  const {store,db}=local(),{auth,sessions}=harness(store),a=await begin(store,auth,provider);
  assert.ok(a.state&&a.nonce);if(provider!=='apple'){assert.equal(a.url.searchParams.get('code_challenge_method'),'S256');assert.ok(a.url.searchParams.get('code_challenge'));}else assert.equal(a.url.searchParams.get('response_mode'),'form_post');
  const {r}=await finish(store,auth,a,provider);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/oauth-complete.html');assert.match(r.headers.get('set-cookie'),/HttpOnly/);
  assert.equal(sessions.length,1);assert.equal(sessions[0].role,'viewer');assert.equal(db().users.length,1);assert.equal(db().oauthIdentities.length,1);assert.match(db().users[0].password_hash,/^oauth-only\$/);
  assert.equal(db().users[0].name,provider==='apple'?'Apple Name':'Provider Name');
  const replay=await finish(store,auth,a,provider);assert.equal(replay.exchanges,0);assert.match(replay.r.headers.get('location'),/SIGNIN_EXPIRED/);
 }
});
test('wrong browser binding, provider and expired state cannot authenticate; cancellation consumes state',async()=>{
 const {store}=local(),{auth}=harness(store),a=await begin(store,auth);
 const wrong=await finish(store,auth,{...a,cookie:'__Host-qs-oauth-google=wrong'});assert.equal(wrong.exchanges,0);
 const cross=await finish(store,auth,a,'microsoft');assert.equal(cross.exchanges,0);
 const cancel=await handleOAuth(request('google/callback?'+new URLSearchParams({state:a.state,error:'access_denied'}),'GET',undefined,{Cookie:a.cookie}),env,store,auth);assert.match(cancel.headers.get('location'),/SIGNIN_CANCELLED/);
 assert.equal((await finish(store,auth,a)).exchanges,0);
 await store.put({stateHash:'s',bindingHash:'b',provider:'google',expires:Date.now()-1,payload:{}});assert.equal(await store.take('s','b','google',Date.now()),null);
});
test('JWT signature, audience, issuer, nonce and expiry checks reject tampering',async()=>{
 const c=configuration(env,'google');
 for(const patch of [{aud:'other-client'},{iss:'https://evil.test'},{nonce:'other'},{exp:1},{azp:'other'}]){
  const token=await new SignJWT(claims('google','nonce',patch)).setProtectedHeader({alg:'RS256'}).setIssuedAt().sign(pair.privateKey);
  await assert.rejects(()=>verifiedIdentity(c,token,'nonce',pair.publicKey));
 }
 const p2=await generateKeyPair('RS256');const bad=await new SignJWT(claims('google','nonce')).setProtectedHeader({alg:'RS256'}).setIssuedAt().setExpirationTime('5m').sign(p2.privateKey);
 await assert.rejects(()=>verifiedIdentity(c,bad,'nonce',pair.publicKey));
 const ms=configuration(env,'microsoft');const wrongTenant=await signed(claims('microsoft','nonce',{tid:'wrong'}));await assert.rejects(()=>verifiedIdentity(ms,wrongTenant,'nonce',pair.publicKey));
 const alias=await verifiedIdentity(c,await signed(claims('google','nonce',{iss:'accounts.google.com'})),'nonce',pair.publicKey);const canonical=await verifiedIdentity(c,await signed(claims('google','nonce')),'nonce',pair.publicKey);assert.equal(alias.subject,canonical.subject);
 const falseEmail=await verifiedIdentity(c,await signed(claims('google','nonce',{email_verified:false})),'nonce',pair.publicKey);assert.equal(falseEmail.email,'');
});
test('existing email never auto-links; explicit live-session link preserves owner and edited name',async()=>{
 const {store,db}=local();const owner={id:'existing',email:'person@example.test',name:'Edited Name',role:'owner',password_hash:'existing-hash'};
 db().users.push(owner);const anonymous=harness(store);const a=await begin(store,anonymous.auth);
 assert.match((await finish(store,anonymous.auth,a)).r.headers.get('location'),/ACCOUNT_EXISTS/);assert.equal(db().users.length,1);assert.equal(db().oauthIdentities.length,0);
 const h=harness(store,owner),b=await begin(store,h.auth,'google',true);assert.equal((await finish(store,h.auth,b)).r.headers.get('location'),'/oauth-complete.html');assert.equal(h.sessions[0].role,'owner');assert.equal(h.sessions[0].name,'Edited Name');
 const c=await begin(store,anonymous.auth);assert.equal((await finish(store,anonymous.auth,c)).r.headers.get('location'),'/oauth-complete.html');assert.equal(anonymous.sessions.at(-1).id,owner.id);
 h.auth.canLink=async()=>false;const denied=await handleOAuth(request('apple/start','POST',JSON.stringify({link:true})),env,store,h.auth);assert.equal(denied.status,401);h.auth.canLink=async()=>true;
 const d=await begin(store,h.auth,'microsoft',true);h.auth.userByToken=async()=>null;assert.match((await finish(store,h.auth,d,'microsoft')).r.headers.get('location'),/LINK_SESSION_EXPIRED/);
});
test('start throttling remains effective after consumed attempts',async()=>{const {store}=local();for(let i=0;i<30;i++)assert.equal(await store.allowStart('ip'),true);assert.equal(await store.allowStart('ip'),false);assert.equal(await store.allowStart('other-ip'),true);});
// Execute actual SQLite SQL through Python, emulating D1 prepare/batch contracts.
function sqliteStore(file){
 const py=`import sqlite3,json,sys\np=json.load(sys.stdin);c=sqlite3.connect(p['file']);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON')\nout=[]\ntry:\n for q in p['queries']:\n  r=c.execute(q['sql'],q['args']);out.append([dict(x) for x in r.fetchall()])\n c.commit();print(json.dumps(out))\nexcept Exception:\n c.rollback();raise\n`;
 const execute=queries=>{const r=spawnSync('python3',['-c',py],{input:JSON.stringify({file,queries}),encoding:'utf8'});if(r.status)throw Error(r.stderr);return JSON.parse(r.stdout);};
 execute([{sql:'CREATE TABLE users (id TEXT PRIMARY KEY,email TEXT UNIQUE COLLATE NOCASE,name TEXT,password_hash TEXT,role TEXT,role_custom TEXT,created_at TEXT,updated_at TEXT)',args:[]}]);
 execute([{sql:'CREATE TABLE sessions (token TEXT PRIMARY KEY,user_id TEXT,expires_at TEXT,created_at TEXT)',args:[]}]);
 return {prepare(sql){const q={sql,args:[]};return {q,bind(...args){q.args=args;return this;},async run(){execute([q]);return {success:true};},async first(){return execute([q])[0][0]||null;},async all(){return {results:execute([q])[0]};}};},async batch(stmts){return execute(stmts.map(s=>s.q));}};
}
test('D1 adapter SQL preserves identities, avoids email merge, and atomically consumes state',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oauth-sql-'));
 try{const db=sqliteStore(path.join(dir,'test.db')),s=d1OAuthStore(db),identity={provider:'google',subject:'subject',email:'new@example.test',name:'New'};
  const u=await s.resolve(identity,null);assert.equal(u.role,'viewer');assert.equal((await s.resolve(identity,null)).id,u.id);
  await assert.rejects(()=>s.resolve({...identity,subject:'different'},null),e=>e.oauthCode==='ACCOUNT_EXISTS');
  assert.equal((await s.resolve({provider:'apple',subject:'apple-sub'},u.id)).id,u.id);
  await assert.rejects(()=>s.resolve({provider:'apple',subject:'other-sub'},u.id),e=>e.oauthCode==='IDENTITY_IN_USE');
  assert.deepEqual((await s.linked(u.id)).sort(),['apple','google']);
  await s.put({stateHash:'s',bindingHash:'b',provider:'google',expires:Date.now()+10000,payload:{nonce:'n'}});
  assert.equal(await s.take('s','wrong','google',Date.now()),null);assert.deepEqual(await s.take('s','b','google',Date.now()),{nonce:'n'});assert.equal(await s.take('s','b','google',Date.now()),null);
  for(let i=0;i<30;i++)assert.equal(await s.allowStart('ip'),true);assert.equal(await s.allowStart('ip'),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('real Worker routes complete signed Google flow into D1 and existing cookie session API',async()=>{
 const {default:worker}=await import('../platform/cloudflare/src/worker.js');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oauth-worker-')),realFetch=globalThis.fetch;
 try {
  const DB=sqliteStore(path.join(dir,'db.sqlite'));
  const environment={...env,DB};
  const r=await worker.fetch(request('google/start','POST','{}'),environment);assert.equal(r.status,200);
  const authorization=new URL((await r.json()).url),binding=r.headers.get('set-cookie').split(';')[0];
  const idToken=await signed(claims('google',authorization.searchParams.get('nonce')));
  const jwk=await exportJWK(pair.publicKey);jwk.kid='test-key';jwk.alg='RS256';jwk.use='sig';
  globalThis.fetch=async(input)=>{const url=String(input);if(url==='https://oauth2.googleapis.com/token')return Response.json({id_token:idToken});if(url==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[jwk]});throw Error('Unexpected network request');};
  const callback=request('google/callback?'+new URLSearchParams({code:'test-code',state:authorization.searchParams.get('state')}),'GET',undefined,{Cookie:binding});
  const result=await worker.fetch(callback,environment);assert.equal(result.headers.get('location'),'/oauth-complete.html');
  const session=result.headers.getSetCookie().find(c=>c.startsWith('qs_session=')).split(';')[0];
  const me=await worker.fetch(new Request(origin+'/api/auth/me',{headers:{Cookie:session}}),environment);assert.equal(me.status,200);const user=(await me.json()).user;assert.equal(user.email,'person@example.test');assert.equal(user.role,'viewer');
  const team=await worker.fetch(new Request(origin+'/api/team/members',{headers:{Cookie:session}}),environment);assert.equal(team.status,403);
 }finally{globalThis.fetch=realFetch;fs.rmSync(dir,{recursive:true,force:true});}
});
