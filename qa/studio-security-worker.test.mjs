import assert from 'node:assert/strict';
import worker from '../platform/cloudflare/src/worker.js';
import indexWorker from '../platform/cloudflare/src/index.js';
// Worker route/SQL contract test; D1 is a labelled in-memory adapter, not production.
for (const [name, app] of [['worker',worker],['index',indexWorker]]) {
 const statements=[];let user=null;
 const DB={prepare(sql){return {bind(...params){return {
  async first(){statements.push({sql,params});if(sql.includes('FROM sessions'))return {user_id:user.id};if(sql.includes('FROM users WHERE id'))return user;return null;},
  async run(){statements.push({sql,params});if(sql.includes('INSERT INTO users'))user={id:params[0],email:params[1],name:params[2],password_hash:params[3],role:params[4],role_custom:params[5]};return {success:true};},
  async all(){statements.push({sql,params});return {results:[]};}
 }}}}};
 const call=async(route,body,token)=>app.fetch(new Request('https://audit.example/api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{'X-QS-Session':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),{DB});
 /* Recovery fails CLOSED when the delivery channel is not configured, and it
    must do so before touching storage at all: the throttle itself writes a
    counter row, so "503 here, 429 there" would leak whether an address has
    anything stored against it. All three routes therefore share one gate, one
    status and one body — for a known address and an unknown one alike — and
    none of them issues a code or queries an account. */
 for(const route of ['auth/forgot-password','auth/verify-code','auth/reset-password']) {
  let previous;
  for(const email of ['existing@example.test','absent@example.test']) {
   const result=await call(route,{email,code:'formerly-exposed-code',password:'NotApplied123!'});
   assert.equal(result.status,503);const body=await result.json();assert.equal(body.code,'RECOVERY_UNAVAILABLE');assert.equal(body.recoveryCode,undefined);assert.equal(body.token,undefined);
   if(previous)assert.deepEqual(body,previous);previous=body;
  }
 }
 assert.equal(statements.length,0,'recovery must not query accounts, issue codes or update passwords');
 /* The recovery send is scheduled with ctx.waitUntil so the reply can leave
    before the network round-trip — which needs ctx to actually REACH the API
    handler. When the parameter was missing, forgot-password answered 500, and
    only once a mailbox was configured: the config gate sits in front of the
    send, so every un-configured run sailed straight past the bug. This drives
    the configured path for real and requires both a clean 200 and a task
    actually handed to ctx. */
 {
  const scheduled=[];const logs=[];const realLog=console.log;
  console.log=(...a)=>{logs.push(a.join(' '));};
  const recoveryUser={id:'u-recovery',email:'owner@example.test',name:'Owner',password_hash:'x',role:'owner',role_custom:''};
  const recoveryDb={prepare(sql){return {bind(...params){return {
   async first(){return sql.includes('FROM users WHERE email')?recoveryUser:null;},
   async run(){return {success:true};},
   async all(){return {results:[]};}
  }}}}};
  try {
   const res=await app.fetch(
    new Request('https://audit.example/api/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'owner@example.test'})}),
    {DB:recoveryDb,SMTP_PASSWORD:'0123 4567 89ab cdef'},
    {waitUntil(p){scheduled.push(p);}});
   assert.equal(res.status,200,name+' forgot-password must answer 200 once a mailbox is configured');
   assert.equal(scheduled.length,1,name+' must hand the send to ctx.waitUntil rather than await it in the response path');
  } finally { console.log=realLog; }
  await Promise.allSettled(scheduled);
  assert.ok(logs.some(l=>l.startsWith('recovery.send_failed')||l.startsWith('recovery.sent')),name+' must report the settled send');
 }
 for(const role of ['owner','Owner','sales','Project lead']) {
  const result=await call('auth/register',{email:'test@example.test',password:'TestOnly123!',name:'Test',role,permissionRole:'owner'});
  assert.equal(result.status,201);const body=await result.json();assert.equal(body.user.role,'viewer');assert.equal(user.role,'viewer');assert.equal(user.role_custom,role);
  /* Reading the team panel is open to EVERY signed-in member — worker.js says
     so on its GET /team/members route, and platform-api + team-profile both
     assert 200 view-only for a viewer. So a signup that asked for
     permissionRole:'owner' proves least privilege the other way round: the read
     below works, the WRITE after it does not. (This line asserted 403 before
     viewer read-only shipped, and has been stale ever since.) */
  assert.equal((await call('team/members',undefined,body.token)).status,200);
  assert.equal((await call('team/role',{userId:'existing-owner',role:'viewer'},body.token)).status,403);
 }
 assert.ok(statements.filter(s=>s.sql.includes('INSERT INTO users')).every(s=>s.params[4]==='viewer'));
 console.log(`PASS: ${name} Worker rejects recovery without DB operations and persists least-privilege signup; Team access denied.`);
}
