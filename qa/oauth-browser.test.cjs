'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const {chromium}=require('playwright'),pkg=require('@sparticuz/chromium'),bundle=pkg.default||pkg;
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oauth-browser-')),listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const server=spawn(process.execPath,['platform/local-server/server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',QS_DATA_DIR:dir,GEMINI_ENABLED:'false',OAUTH_PUBLIC_ORIGIN:'',OAUTH_GOOGLE_ENABLED:'false',OAUTH_MICROSOFT_ENABLED:'false',OAUTH_APPLE_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 let browser;try{
  await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Startup timeout')),15000);server.stdout.on('data',b=>{if(b.toString().includes('Quotation Studio platform')){clearTimeout(t);resolve();}});});
  const base=`http://127.0.0.1:${port}`;
  const status=await fetch(base+'/api/auth/oauth/providers');assert.equal(status.status,200);assert.ok((await status.json()).providers.every(p=>!p.configured));
  for(const provider of ['google','microsoft','apple']){const r=await fetch(base+'/api/auth/oauth/'+provider+'/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,503);assert.equal((await r.json()).code,'PROVIDER_NOT_CONFIGURED');}
  browser=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args.filter(a=>a!=='--single-process'),headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/index.html');await page.waitForFunction(()=>!!window.StudioSocial);
  for(const provider of ['google','microsoft','apple']){await page.locator('[data-p='+provider+']').click();await page.waitForFunction(()=>document.getElementById('socialMessage').textContent.includes('not live yet'));assert.match(await page.locator('#socialMessage').innerText(),/administrator configuration/);}
  await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#socialMessage').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
  await page.goto(base+'/index.html?oauth_error=ACCOUNT_EXISTS');await page.waitForFunction(()=>!document.getElementById('socialMessage').hidden);assert.match(await page.locator('#socialMessage').innerText(),/never merged automatically/);assert.ok(!page.url().includes('oauth_error'));
  await page.evaluate(async()=>{const r=await PlatformAPI.register('Original Profile','browser@example.test','BrowserTest123!','Owner');PlatformAPI.setSessionToken(r.token);});
  await page.goto(base+'/dashboard.html');await page.waitForFunction(()=>window.QSDash?.user());
  await page.evaluate(()=>QSDash.show('settings'));await page.waitForFunction(()=>document.getElementById('socialConnections').textContent.includes('Setup required'));
  assert.equal(await page.locator('#socialConnections button:disabled').count(),2);assert.equal(await page.evaluate(()=>QSDash.user().role),'viewer');
  await page.evaluate(()=>PlatformAPI.setSessionToken('invalid-previous-account-token'));
  await page.goto(base+'/oauth-complete.html');await page.waitForURL('**/dashboard.html');await page.waitForFunction(()=>window.QSDash?.user());
  assert.equal(await page.evaluate(()=>localStorage.getItem('qs.sessionToken')),null);assert.equal(await page.evaluate(()=>QSDash.user().email),'browser@example.test');
  assert.deepEqual(errors,[]);
  console.log('PASS: real local routes fail closed without provider setup; both OAuth buttons + phone button give honest status; Apple removed; mobile/error guidance; Profile connections; cookie completion clears stale bearer token and preserves account permissions. No live provider contacted.');
 }finally{if(browser)await browser.close();server.kill();await new Promise(r=>server.exitCode!==null?r():server.once('exit',r));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
