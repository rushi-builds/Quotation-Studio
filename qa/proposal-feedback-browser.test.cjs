/* End-to-end against a disposable LOCAL platform server, not mocked success.
   Fixtures below never touch production, real accounts, or production tokens. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),data=fs.mkdtempSync(path.join(os.tmpdir(),'qs-feedback-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const base='http://127.0.0.1:'+port;
 let server,browser;
 try{
  server=spawn(process.execPath,['platform/local-server/server.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',QS_DATA_DIR:data,OWNER_EMAIL:'unused@local.invalid',ADMIN_EMAIL:'unused-admin@local.invalid'},stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Local feedback server did not start')),15000);server.stdout.on('data',d=>{if(d.toString().includes('http://')){clearTimeout(timeout);resolve();}});server.once('exit',code=>{clearTimeout(timeout);reject(Error('Local server exited '+code));});});
  const req=async(method,url,body,auth)=>{const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(body?{body:JSON.stringify(body)}:{})});return{status:r.status,json:await r.json()};};
  const owner=await req('POST','/api/auth/register',{name:'Feedback QA Owner',email:'feedback-owner@local.invalid',password:'LocalFixture123!',role:'owner'});
  const other=await req('POST','/api/auth/register',{name:'Feedback QA Other',email:'feedback-other@local.invalid',password:'LocalFixture123!',role:'sales'});
  assert.equal(owner.status,201);assert.equal(owner.json.user.role,'viewer','public signup never grants owner');assert.equal(other.status,201);
  // Trusted offline test fixture, exactly like existing platform-api QA. This
  // is not an application role grant and the entire directory is removed.
  const dbPath=path.join(data,'db.json'),seed=JSON.parse(fs.readFileSync(dbPath));
  seed.users.forEach(u=>{u.role=u.id===owner.json.user.id?'owner':'sales';u.profile_done=1;u.phone='+919000000000';});fs.writeFileSync(dbPath,JSON.stringify(seed));
  const created=await req('POST','/api/proposals',{form:{custName:'Local QA Customer',capacity:'5',propRef:'FEEDBACK-QA-001',companyName:'KTM Energy Experts',companyPhone:'+919000000000'},status:'ready'},owner.json.token);
  assert.equal(created.status,201,JSON.stringify(created));const id=created.json.proposal.id;
  const published=await req('POST','/api/proposals/'+id+'/publish',{label:'Disposable feedback test',expiresInDays:1},owner.json.token);assert.equal(published.status,201,JSON.stringify(published));
  const token=published.json.access.token,portalUrl=base+'/portal.html?t='+token+'#proposalFeedback';
  const {default:c}=await import('@sparticuz/chromium');browser=await chromium.launch({executablePath:await c.executablePath(),args:c.args.filter(a=>a!=='--single-process'),headless:true});
  const customer=await browser.newContext({viewport:{width:1200,height:1050}}),page=await customer.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(portalUrl);await page.waitForFunction(()=>!document.getElementById('feedbackFields').disabled);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#engineeringRequestForm').count(),0);
  assert.equal(await page.locator('#portalGate').isVisible(),false,'loading gate must not cover the ready portal');
  assert((await page.locator('#v_clWhatsApp').getAttribute('href')).startsWith('https://wa.me/'));
  assert((await page.locator('#v_clDiscuss').getAttribute('href')).endsWith('#proposalFeedback'));
  assert.equal(await page.locator('[name=proposalRating]:checked').count(),0);
  const shots=path.join(__dirname,'shots','proposal-feedback');fs.mkdirSync(shots,{recursive:true});
  await page.locator('#shareAcceptWrap').screenshot({path:path.join(shots,'customer-form.png')});
  await page.locator('#feedbackSubmit').click();assert((await page.locator('#feedbackStatus').textContent()).includes('Choose a rating or write a message'));
  assert.equal((JSON.parse(fs.readFileSync(dbPath)).events||[]).filter(e=>e.event_type==='proposal_feedback').length,0);
  await page.locator('#feedbackComment').fill('Please explain the roof layout. I would like to discuss a smaller system.');
  await page.locator('[name=proposalRating][value="2"]').check({force:true});await page.locator('.feedback-option:has(input[value=question])').click();assert.equal(await page.locator('#feedbackNext').inputValue(),'question');await page.locator('#feedbackContact').check();
  // Low scores and messages are accepted identically; no public review gating.
  await page.locator('#shareAcceptWrap').screenshot({path:path.join(shots,'customer-form-filled.png')});
  await page.locator('#feedbackComment').fill('Please explain the roof layout. <img src=x onerror=alert(1)>');
  let dropOnce=true;
  await page.route('**/api/portal/feedback',async route=>{if(dropOnce){dropOnce=false;await route.fetch();await route.abort('failed');}else await route.continue();});
  await page.locator('#feedbackSubmit').click();await page.waitForFunction(()=>document.getElementById('feedbackStatus').classList.contains('is-error'));
  assert.equal(await page.locator('#feedbackSuccess').isVisible(),false,'no success if receipt was lost');
  assert((await page.locator('#feedbackComment').inputValue()).includes('roof layout'));
  let stored=JSON.parse(fs.readFileSync(dbPath));assert.equal(stored.events.filter(e=>e.event_type==='proposal_feedback').length,1,'server saved the dropped-response attempt');
  await page.reload();await page.waitForFunction(()=>!document.getElementById('feedbackFields').disabled);
  assert((await page.locator('#feedbackComment').inputValue()).includes('roof layout'),'session draft survives reload');
  assert(await page.locator('[name=feedbackNextChoice][value=question]').isChecked(),'selected intent card restores with the draft');
  assert.equal(await page.locator('.feedback-stars .is-selected input').inputValue(),'2');
  assert((await page.locator('#feedbackResponseTitle').textContent()).includes('clarity'),'restored rating also restores the matching response');
  await page.locator('#feedbackSubmit').click();await page.waitForFunction(()=>!document.getElementById('feedbackSuccess').hidden);
  stored=JSON.parse(fs.readFileSync(dbPath));const feedback=stored.events.filter(e=>e.event_type==='proposal_feedback');assert.equal(feedback.length,1);assert.equal(stored.notifications.filter(n=>n.kind==='feedback').length,1);
  assert.equal(JSON.parse(feedback[0].meta_json).rating,2);assert.equal(JSON.parse(feedback[0].meta_json).nextStep,'question');assert.equal(feedback[0].owner_id,owner.json.user.id);assert.equal(feedback[0].proposal_id,id);
  const outsider=await req('GET','/api/activity',null,other.json.token);assert(!outsider.json.activity.some(e=>e.id===feedback[0].id),'unrelated staff cannot read the feedback');
  const ownerFeed=await req('GET','/api/activity',null,owner.json.token);assert(ownerFeed.json.activity.some(e=>e.id===feedback[0].id));
  assert.equal((await req('GET','/api/activity')).status,401);
  // Message-only submission is useful feedback too: stars are never mandatory.
  const messageOnly=await req('POST','/api/portal/feedback',{token,submissionId:'message_only_submission_0001',rating:null,comment:'Please call me about a smaller system.',nextStep:'changes',contactRequested:true});assert.equal(messageOnly.status,201);
  const staff=await browser.newContext({viewport:{width:1440,height:1050}});await staff.addInitScript(t=>localStorage.setItem('qs.sessionToken',t),owner.json.token);
  const dashboard=await staff.newPage();dashboard.on('pageerror',e=>errors.push(e.message));await dashboard.goto(base+'/dashboard.html');
  await dashboard.locator('[data-panel="activity"]').first().click();await dashboard.waitForFunction(()=>document.getElementById('activityBody')?.textContent.includes('roof layout'));
  assert.equal(await dashboard.locator('.customer-feedback-detail img').count(),0,'feedback text is escaped in Studio');
  assert((await dashboard.locator('#activityBody').textContent()).includes('Contact requested'));
  assert((await dashboard.locator('#notifBody').textContent()).includes('Customer proposal feedback'));
  await dashboard.locator('#activityBody .timeline-item').filter({hasText:'Please call me about a smaller system.'}).screenshot({path:path.join(shots,'studio-inbox.png')});
  // Small-screen layout and keyboard-usable native radios.
  const mobile=await customer.newPage();await mobile.goto(portalUrl);await mobile.waitForFunction(()=>!document.getElementById('feedbackFields').disabled);
  for(const width of [390,360]){await mobile.setViewportSize({width,height:900});await mobile.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await mobile.locator('[name=proposalRating]').first().focus();await mobile.keyboard.press('ArrowRight');assert.equal(await mobile.locator('[name=proposalRating]:checked').inputValue(),'2');
  // Rolling-release compatibility: no available capability = no fake submit.
  const legacy=await customer.newPage();
  await legacy.route('**/api/portal/proposal?*',async route=>{const r=await route.fetch(),data=await r.json();delete data.access.feedbackAvailable;await route.fulfill({response:r,json:data});});
  await legacy.goto(portalUrl);await legacy.waitForFunction(()=>document.getElementById('feedbackStatus').textContent.includes('not available'));
  assert(await legacy.locator('#feedbackSubmit').isDisabled());assert.equal(await legacy.locator('#feedbackSuccess').isVisible(),false);await legacy.close();
  // A revoked token cannot submit even if a previously opened form is retained.
  await req('POST','/api/links/'+published.json.access.id+'/revoke',{},owner.json.token);
  const denied=await req('POST','/api/portal/feedback',{token,submissionId:'revoked_submission_0001',rating:5,comment:'',nextStep:'',contactRequested:false});assert.equal(denied.status,404);
  assert.deepEqual(errors,[]);
  console.log('PASS: real local publish → customer form → atomic feedback + unread notification → Studio inbox; scoped reads, lost-response retry, restored draft, optional stars, escaped requests, keyboard/mobile and revocation. No production calls.');
 }finally{if(browser)await browser.close();if(server){server.kill('SIGTERM');await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));}fs.rmSync(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
