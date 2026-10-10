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
 for(const route of ['auth/forgot-password','auth/reset-password']) {
  let previous;
  for(const email of ['existing@example.test','absent@example.test']) {
   const result=await call(route,{email,code:'formerly-exposed-code',password:'NotApplied123!'});
   assert.equal(result.status,403);const body=await result.json();assert.equal(body.code,'RECOVERY_UNAVAILABLE');assert.equal(body.recoveryCode,undefined);assert.equal(body.token,undefined);
   if(previous)assert.deepEqual(body,previous);previous=body;
  }
 }
 assert.equal(statements.length,0,'recovery must not query accounts, issue codes or update passwords');
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
