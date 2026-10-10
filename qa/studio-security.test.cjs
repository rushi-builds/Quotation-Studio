'use strict';
// Security acceptance tests against an isolated local server, never production.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright'),pkg=require('@sparticuz/chromium'),bundle=pkg.default||pkg;
(async()=>{
 const data=fs.mkdtempSync(path.join(os.tmpdir(),'qs-studio-discovery-'));
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const server=spawn(process.execPath,['platform/local-server/server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',QS_DATA_DIR:data,GEMINI_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let browser;
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),15000);server.stdout.on('data',b=>{if(b.toString().includes('Quotation Studio platform')){clearTimeout(timer);resolve();}});server.on('error',reject);});
  const base=`http://127.0.0.1:${port}`;
  const api=async(route,body,token)=>{const r=await fetch(base+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,body:await r.json()};};
  const email='owner-'+randomUUID()+'@example.test',password=randomUUID()+'Aa1!',newPassword=randomUUID()+'Bb2!';
  const first=await api('auth/register',{email,name:'Existing owner fixture',password,role:'owner'});
  assert.equal(first.body.user.role,'viewer','even first public signup cannot bootstrap admin');
  // Simulate a pre-existing trusted owner and an unexpired previously exposed reset code.
  // This is offline test-fixture setup, never an application endpoint.
  const dbPath=path.join(data,'db.json'),db=JSON.parse(fs.readFileSync(dbPath,'utf8'));
  db.users.find(u=>u.id===first.body.user.id).role='owner';
  const oldCode=randomUUID();
  db.password_resets.push({id:'legacy-reset',user_id:first.body.user.id,code_hash:require('node:crypto').createHash('sha256').update(oldCode).digest('hex'),expires_at:new Date(Date.now()+1800000).toISOString(),used_at:null});
  fs.writeFileSync(dbPath,JSON.stringify(db));
  const second=await api('auth/register',{email:'new-'+randomUUID()+'@example.test',name:'New signup',password:randomUUID()+'Cc3!',role:'Owner',roleCustom:'owner',permissionRole:'owner'});
  assert.equal(second.body.user.role,'viewer');assert.equal(second.body.user.roleCustom,'Owner');
  /* Read is open to every signed-in member (see worker.js on GET /team/members,
     and platform-api / team-profile asserting 200 view-only) — so this signup
     that asked for permissionRole:'owner' proves least privilege by being able
     to READ below while the three WRITES after it stay 403. This asserted 403
     before viewer read-only shipped, and has been stale since. */
  assert.equal((await api('team/members',undefined,second.body.token)).status,200);
  assert.equal((await api('team/role',{userId:first.body.user.id,role:'viewer'},second.body.token)).status,403);
  assert.equal((await api('proposals',{title:'Unauthorized draft'},second.body.token)).status,403);
  assert.equal((await api('auth/profile',{role:'owner'},second.body.token)).body.user.role,'viewer');
  const team=await api('team/members',undefined,first.body.token);assert.equal(team.status,200);
  assert.equal(team.body.members.find(m=>m.id===first.body.user.id).role,'owner');
  const quote=await api('proposals',{title:'Preserved quotation',form:{custName:'Audit only',capacity:'7'}},first.body.token);assert.equal(quote.status,201);
  const recovery=await api('auth/forgot-password',{email});assert.equal(recovery.status,503);assert.equal(recovery.body.code,'RECOVERY_UNAVAILABLE');assert.equal(recovery.body.recoveryCode,undefined);
  const unknown=await api('auth/forgot-password',{email:'unknown@example.test'});assert.deepEqual(unknown,recovery);
  const reset=await api('auth/reset-password',{email,code:oldCode,password:newPassword});assert.equal(reset.status,503);assert.equal(reset.body.token,undefined);
  assert.equal((await api('auth/login',{email,password})).status,200);
  assert.equal((await api('proposals/'+quote.body.proposal.id,undefined,first.body.token)).status,200);
  assert.equal((await api('auth/change-password',{currentPassword:'wrong-password',newPassword},first.body.token)).status,400);
  assert.equal((await api('auth/change-password',{currentPassword:password,newPassword},first.body.token)).status,200);
  assert.equal((await api('auth/login',{email,password:newPassword})).status,200);
  assert.equal((await api('team/role',{userId:second.body.user.id,role:'sales'},first.body.token)).status,200);
  assert.equal((await api('proposals',{title:'Owner approved draft'},second.body.token)).status,201);
  console.log('PASS: least-privilege signup, forged-role denial, existing owner/session/data preserved, explicit owner promotion, password change and legacy reset rejection.');
  browser=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args.filter(a=>a!=='--single-process'),headless:true});
  const page=await browser.newPage();let recoveryCalls=0;
  page.on('request',r=>{if(/\/api\/auth\/(forgot-password|verify-code|reset-password)/.test(r.url()))recoveryCalls++;});
  await page.goto(base+'/index.html#forgotPassword');
  await page.locator('#f-rp').waitFor({state:'visible'});
  /* Three steps share the sign-in panel (owner decision, 2026-10-10): the email,
     then the code with its resend counter, then a new password. All three stand
     on the card so the shape of the task reads at a glance — steps 2 and 3 are
     dimmed, inert and disabled until the step before them has done its job, so
     a code box cannot be typed into before any code exists. Opening it must ask
     the server nothing at all: merely arriving cannot confirm an account exists. */
  assert.ok(await page.locator('#r-e').isVisible());
  assert.equal(await page.evaluate(()=>document.querySelector('[data-rstep="2"]').hasAttribute('data-locked')),true);
  assert.equal(await page.evaluate(()=>document.querySelector('[data-rstep="3"]').hasAttribute('data-locked')),true);
  assert.ok(await page.evaluate(()=>Array.from(document.querySelectorAll('[data-rstep="2"] input,[data-rstep="2"] button,[data-rstep="3"] input,[data-rstep="3"] button')).every(el=>el.disabled)),'a locked step must not be typeable or submittable');
  assert.ok(await page.evaluate(()=>{const m=document.querySelector('#f-rp .rmeta');return !!document.getElementById('rp-resend')&&!!document.getElementById('rp-timer')&&!!document.getElementById('rp-attempts')&&/resend/i.test(document.getElementById('rp-resend').textContent)&&!!m;}));
  assert.ok(await page.evaluate(()=>!/\b\d{6}\b/.test(document.getElementById('f-rp').textContent)),'no code may be rendered in the panel');
  /* Two controls now answer to that name — the header arrow and the footer
     link — so the arrow is named directly rather than left ambiguous. */
  await page.locator('#f-rp .rpback').click();
  await page.locator('#forgotPassword').click();
  assert.equal(await page.locator('#f-rp').isVisible(),true);
  assert.equal(recoveryCalls,0,'UI must not issue or expose reset secrets');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('#f-rp').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
  console.log('PASS: recovery deep link opens the reset panel with its resend counter, no secret request, mobile fit.');

 }finally{
  if(browser)await browser.close();server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));fs.rmSync(data,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
