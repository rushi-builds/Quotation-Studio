/* Feedback-first view: opening the shared customer link with #proposalFeedback
   shows the private feedback form on its own instead of the full proposal above
   it, and "View full proposal" restores the complete portal. End-to-end against
   a disposable LOCAL platform server; fixtures never touch production. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'qs-fbfirst-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const base='http://127.0.0.1:'+port;
 let server,browser;
 try{
  server=spawn(process.execPath,['platform/local-server/server.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',QS_DATA_DIR:data,OWNER_EMAIL:'unused@local.invalid',ADMIN_EMAIL:'unused-admin@local.invalid'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Local feedback-first server did not start')),15000);server.stdout.on('data',d=>{if(d.toString().includes('http://')){clearTimeout(timeout);resolve();}});server.once('exit',code=>{clearTimeout(timeout);reject(Error('Local server exited '+code));});});
  const req=async(method,url,body,auth)=>{const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,json:await r.json()};};
  const owner=await req('POST','/api/auth/register',{name:'Feedback First QA Owner',email:'fbfirst-owner@local.invalid',password:'LocalFixture123!',role:'owner'});
  assert.equal(owner.status,201);assert.equal(owner.json.user.role,'viewer','public signup never grants owner');
  const dbPath=path.join(data,'db.json'),seed=JSON.parse(fs.readFileSync(dbPath));
  seed.users.forEach(u=>{u.role=u.id===owner.json.user.id?'owner':'sales';u.profile_done=1;u.phone='+919000000000';});fs.writeFileSync(dbPath,JSON.stringify(seed));
  const created=await req('POST','/api/proposals',{form:{custName:'Local QA Customer',capacity:'5',propRef:'FEEDBACK-FIRST-QA-001',companyName:'KTM Energy Experts',companyPhone:'+919000000000'},status:'ready'},owner.json.token);
  assert.equal(created.status,201,JSON.stringify(created));const id=created.json.proposal.id;
  const published=await req('POST','/api/proposals/'+id+'/publish',{label:'Disposable feedback-first test',expiresInDays:1},owner.json.token);assert.equal(published.status,201,JSON.stringify(published));
  const token=published.json.access.token;
  const {default:c}=await import('@sparticuz/chromium');browser=await chromium.launch(process.platform==='win32'?{headless:true,channel:'chrome'}:{executablePath:await c.executablePath(),args:c.args.filter(a=>a!=='--single-process'),headless:true});
  const customer=await browser.newContext({viewport:{width:1200,height:1050}}),page=await customer.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const shots=path.join(__dirname,'shots','feedback-first');fs.mkdirSync(shots,{recursive:true});

  /* A: opening the shared feedback link lands on the form alone. */
  await page.goto(base+'/portal.html?t='+token+'#proposalFeedback');
  await page.waitForFunction(()=>!document.getElementById('feedbackFields').disabled);
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#portalMain.feedback-first').count(),1,'feedback-first class applied on direct open');
  assert.equal(await page.locator('#sharePages').isVisible(),false,'proposal pages hidden in feedback-first view');
  assert.equal(await page.locator('.share-banner').isVisible(),false,'customer banner hidden in feedback-first view');
  assert.equal(await page.locator('#shareAcceptWrap').isVisible(),true,'feedback card visible');
  assert.equal(await page.locator('.feedback-full-pill').count(),1,'restore pill present');
  await page.locator('#shareAcceptWrap').screenshot({path:path.join(shots,'feedback-first.png')});

  /* A2: the form still submits for real inside this view. */
  await page.locator('#feedbackComment').fill('Looks good — please share the subsidy details.');
  await page.locator('#feedbackSubmit').click();
  await page.waitForFunction(()=>!document.getElementById('feedbackSuccess').hidden);
  assert.equal(await page.locator('#portalMain.feedback-first').count(),1,'view stays feedback-first after a saved receipt');
  const stored=JSON.parse(fs.readFileSync(dbPath));
  assert.equal(stored.events.filter(e=>e.event_type==='proposal_feedback').length,1,'feedback saved once');

  /* B: "View full proposal" restores the complete portal and clears the hash. */
  await page.locator('.feedback-full-pill').click();
  await page.waitForFunction(()=>document.getElementById('sharePages').children.length>0&&document.getElementById('sharePages').offsetParent!==null);
  assert.equal(await page.locator('#portalMain.feedback-first').count(),0,'feedback-first class removed');
  assert.equal(await page.locator('.feedback-full-pill').count(),0,'pill removed with the view');
  assert(!page.url().includes('#proposalFeedback'),'deep-link hash cleared after restore');
  assert.equal(await page.locator('#shareAcceptWrap').isVisible(),true,'feedback section remains available in the full portal');

  /* D: jumping from the closing page keeps the normal scroll behaviour. */
  await page.locator('#v_clDiscuss').click();
  await page.waitForFunction(()=>location.hash==='#proposalFeedback');
  assert.equal(await page.locator('#portalMain.feedback-first').count(),0,'in-portal jump never collapses the portal');

  /* C: a plain open of the customer link never enters feedback-first. */
  const plain=await customer.newPage();plain.on('pageerror',e=>errors.push(e.message));
  await plain.goto(base+'/portal.html?t='+token);
  await plain.waitForFunction(()=>!document.getElementById('portalMain').hidden);
  assert.equal(await plain.locator('#portalMain.feedback-first').count(),0,'no feedback-first without the hash');
  assert.equal(await plain.locator('.feedback-full-pill').count(),0);
  await plain.close();

  /* E: when feedback is unavailable the deep link must not trap the customer. */
  const gated=await customer.newPage();gated.on('pageerror',e=>errors.push(e.message));
  await gated.route('**/api/portal/proposal*',async route=>{const r=await route.fetch();const j=await r.json();j.access={...j.access,feedbackAvailable:false};await route.fulfill({response:r,body:JSON.stringify(j)});});
  await gated.goto(base+'/portal.html?t='+token+'#proposalFeedback');
  await gated.waitForFunction(()=>!document.getElementById('portalMain').hidden);
  assert.equal(await gated.locator('#portalMain.feedback-first').count(),0,'unavailable feedback never triggers feedback-first');
  await gated.close();

  assert.deepEqual(errors,[],'no page errors');
 }finally{
  if(browser)await browser.close();
  if(server)server.kill();
  await new Promise(resolve=>setTimeout(resolve,300));
  fs.rmSync(data,{recursive:true,force:true});
 }
})().catch(e=>{console.error(e);process.exit(1);});
