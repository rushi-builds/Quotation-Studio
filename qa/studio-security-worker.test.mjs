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

/* A 502 from this worker is never an application status — it is Cloudflare
   reporting that an exception escaped entirely ("Error 1101: Worker threw
   exception"), and it reaches the dashboard as "Request failed (502)" with no
   status, no body and nothing to act on. Three defences already cover the
   paths that were actually hit: the awaited OAuth and phone calls route their
   rejections into handleApi's catch, the clamped status keeps a bad err.status
   from turning that catch into a RangeError, and the literal-body fallback
   keeps JSON.stringify from doing the same. Those are fixes for known bugs.
   What follows proves the property instead — serve() must never be able to
   reject, whatever it is handed, so an unknown bug degrades to a readable 500
   rather than a silent 502. */
{
  const escaped = [
    { label: 'an unparseable URL', req: { url: 'not-a-url', method: 'GET' }, api: false },
    { label: 'a request whose method getter throws',
      req: { url: 'https://audit.example/api/health', get method() { throw new Error('boom'); } }, api: true }
  ];
  for (const c of escaped) {
    let res;
    try {
      res = await worker.fetch(c.req, {}, undefined);
    } catch (e) {
      assert.fail(c.label + ' must not reject — a rejection is a Cloudflare 502, not a 500 (' + e.message + ')');
    }
    assert.equal(res.status, 500, c.label + ' must degrade to 500, got ' + res.status);
    assert.equal(res.headers.get('Cache-Control'), 'no-store', c.label + ' must not be cacheable');
    const body = await res.text();
    if (c.api) {
      assert.match(body, /"code":"WORKER_ERROR"/, c.label + ' must hand an API caller JSON carrying a code');
      assert.match(res.headers.get('Content-Type') || '', /application\/json/, c.label + ' must be JSON on an /api path');
    } else {
      assert.match(body, /Something went wrong/, c.label + ' must hand a browser HTML it can render');
    }
  }
  /* The wrapper must be transparent: where serve() does not throw, its own
     answer comes through untouched — the guard never rewrites a real reply. */
  const pass = await worker.fetch(new Request('https://audit.example/api/health'), {}, undefined);
  assert.equal(pass.status, 500, 'a non-throwing path must keep its own status');
  assert.match((await pass.json()).error, /D1 database binding is missing/,
    'the wrapper must not intercept handleApi\'s own error responses');
}
console.log('PASS: Worker never rejects — every escape becomes a 500, API callers get JSON with a code, browsers get HTML, and the guard stays transparent to replies that did not throw.');
