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
  assert.equal((await api('team/members',undefined,second.body.token)).status,403);
  assert.equal((await api('team/role',{userId:first.body.user.id,role:'viewer'},second.body.token)).status,403);
  assert.equal((await api('proposals',{title:'Unauthorized draft'},second.body.token)).status,403);
  assert.equal((await api('auth/profile',{role:'owner'},second.body.token)).body.user.role,'viewer');
  const team=await api('team/members',undefined,first.body.token);assert.equal(team.status,200);
  assert.equal(team.body.members.find(m=>m.id===first.body.user.id).role,'owner');
  const quote=await api('proposals',{title:'Preserved quotation',form:{custName:'Audit only',capacity:'7'}},first.body.token);assert.equal(quote.status,201);
  const recovery=await api('auth/forgot-password',{email});assert.equal(recovery.status,403);assert.equal(recovery.body.recoveryCode,undefined);
  const unknown=await api('auth/forgot-password',{email:'unknown@example.test'});assert.deepEqual(unknown,recovery);
  const reset=await api('auth/reset-password',{email,code:oldCode,password:newPassword});assert.equal(reset.status,403);assert.equal(reset.body.token,undefined);
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
  page.on('request',r=>{if(r.url().includes('/api/auth/forgot-password'))recoveryCalls++;});
  await page.goto(base+'/index.html#forgotPassword');
  await page.locator('#recoveryNotice').waitFor({state:'visible'});
  assert.match(await page.locator('#recoveryNotice').innerText(),/No recovery email has been sent/);
  await page.getByRole('button',{name:'Back to sign in'}).click();
  await page.locator('#forgotPassword').click();
  assert.equal(await page.locator('#recoveryNotice').isVisible(),true);
  assert.equal(recoveryCalls,0,'UI must not issue or expose reset secrets');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('#recoveryNotice').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
  console.log('PASS: recovery deep link and button show persistent honest guidance, mobile fit, no secret request.');

 }finally{
  if(browser)await browser.close();server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));fs.rmSync(data,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
