/* Workspace access workflows: real authenticated local Dashboard, disposable JSON store.
   No production credentials, provider requests, live sends or migrations.
   NODE_PATH=<qa deps> node qa/connections-ui.test.cjs
   CHROMIUM_PATH is optional; serverless Chromium uses a multi-process launch. */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const assert = require('assert/strict');
const root = path.resolve(__dirname, '..');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-connections-ui-'));
const shots = path.join(__dirname, 'shots/workspace-access');
fs.mkdirSync(shots, { recursive: true });
let child, browser, passed = 0;
const errors = [];
function check(name, condition, detail = '') {
  assert.ok(condition, `${name}: ${detail}`); passed++; console.log('  ok - ' + name);
}
(async () => {
  const reserve = net.createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise(resolve => reserve.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const api = async (method, route, body) => {
    const response = await fetch(origin + route, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    assert.ok(response.ok, `fixture API ${route}: ${response.status}`);
    return response.json();
  };
  try {
    child = spawn(process.execPath, ['platform/local-server/server.js'], {
      cwd: root, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', QS_DATA_DIR: data, GEMINI_ENABLED: 'false', OWNER_EMAIL: '', ADMIN_EMAIL: '' }, stdio: ['ignore', 'pipe', 'pipe']
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Local platform startup timeout')), 15000);
      child.stdout.on('data', text => { if (String(text).includes('platform')) { clearTimeout(timeout); resolve(); } });
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.once('exit', code => { clearTimeout(timeout); reject(Error('Local platform exited: ' + code)); });
    });
    const sessions = {};
    for (const role of ['owner', 'sales', 'viewer']) {
      const email = `connections-${role}@example.test`;
      const password = 'Disposable-Review!123';
      const reg = await api('POST', '/api/auth/register', { name: 'Connections review ' + role, email, password, role: 'Sales' });
      const dbPath = path.join(data, 'db.json');
      const store = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      store.users.find(user => user.id === reg.user.id).role = role;
      fs.writeFileSync(dbPath, JSON.stringify(store));
      sessions[role] = (await api('POST', '/api/auth/login', { email, password })).token;
    }
    let launch = { headless: true };
    if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
    else if (process.platform === 'win32') launch.channel = 'chrome';
    else {
      const bundled = require('@sparticuz/chromium');
      const c = bundled.default || bundled;
      launch = { ...launch, executablePath: await c.executablePath(), args: c.args.filter(arg => arg !== '--single-process') };
    }
    browser = await chromium.launch(launch);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    await ctx.addInitScript(token => { localStorage.setItem('qs.sessionToken', token); localStorage.setItem('qs.dashboard.theme', 'light'); }, sessions.owner);
    const p = await ctx.newPage();
    p.on('pageerror', error => errors.push(error.message));
    const mutations = [], providerRequests = [];
    let record = false;
    p.on('request', request => {
      if (record && request.url().startsWith(origin + '/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) mutations.push(request.method() + ' ' + request.url());
      if (!request.url().startsWith(origin) && /^https?:/.test(request.url())) providerRequests.push(request.url());
    });
    await p.goto(origin + '/dashboard.html?panel=settings&section=connections');
    await p.waitForSelector('#panel-settings.on #settingsConnections:not([hidden])');
    await p.waitForFunction(() => window.__businessPulseReady === true);
    record = true;
    const authed=async(role,route,method='GET',body)=>{
      const r=await fetch(origin+'/api/'+route,{method,headers:{Authorization:'Bearer '+sessions[role],'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:r.status,data:await r.json()};
    };
    const view=async role=>(await authed(role,'workspace')).data;
    const cmd=async(role,command,body)=>authed(role,'workspace/'+command,'POST',{...body,revision:(await view(role)).revision});
    const db=JSON.parse(fs.readFileSync(path.join(data,'db.json'))),viewerId=db.users.find(u=>u.email==='connections-viewer@example.test').id;
    await authed('owner','proposals','POST',{form:{custName:'ACL fixture customer',totalInvestment:246813},status:'draft'});
    const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=','base64');
    const upload=await fetch(origin+'/api/gallery',{method:'POST',headers:{Authorization:'Bearer '+sessions.owner,'X-Filename':'acl-photo.png','Content-Type':'application/octet-stream'},body:image});
    assert.equal(upload.status,201);
    await p.evaluate(()=>QSDash.show('gallery'));
    await p.waitForFunction(()=>{const img=document.querySelector('#galleryGrid img');return img&&img.complete&&img.naturalWidth>0;});
    check('protected image tags work with restored same-origin cookie authentication',true);
    await p.evaluate(()=>QSDash.showSettings('connections'));
    await p.waitForSelector('#workspaceAccess [data-wa="prepare"]');
    const form=p.locator('#workspaceAccessDialog');
    check('account preparations available, while actual provider Connect stays disabled',await p.locator('#connectionsAdd button').isEnabled()&&await p.locator('.sc-connect[disabled]').count()===8);
    await p.click('#workspaceAccess [data-wa="prepare"]');
    await form.locator('[name="provider"]').selectOption('outlook');
    await form.locator('[name="label"]').fill('Company sales Outlook');
    await form.locator('[name="scope"]').selectOption('company');
    await form.locator('button[type="submit"]').click();
    await form.waitFor({state:'hidden'});
    check('company account preparation saves through the real API without pretending to connect',/Company sales Outlook/.test(await p.locator('#workspaceAccess').innerText())&&(await view('owner')).connections[0].status==='not_connected');
    const inbox=(await view('owner')).connections[0].id;
    await cmd('owner','connections',{provider:'instagram',label:'Company Instagram',scope:'company'});
    const rolePage=async role=>{
      const context=await browser.newContext({viewport:{width:1440,height:1050}});
      await context.addInitScript(token=>{localStorage.setItem('qs.sessionToken',token);localStorage.setItem('qs.dashboard.theme','light');},sessions[role]);
      const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/dashboard.html?panel=settings&section=connections');
      await page.waitForSelector('#workspaceAccess [data-wa="prepare"]');
      return page;
    };
    const sales=await rolePage('sales'),viewer=await rolePage('viewer');
    check('member sees common company preparation, but read and reply are restricted',/Company sales Outlook/.test(await sales.locator('#workspaceAccess').innerText())&&!(await view('sales')).connections.find(c=>c.id===inbox).permissions['inbox.read']);
    await sales.click('#workspaceAccess [data-wa="prepare"]');
    const sf=sales.locator('#workspaceAccessDialog');
    check('ordinary member cannot select company ownership',await sf.locator('[name="scope"] option[value="company"]').count()===0);
    await sf.locator('[name="label"]').fill('Private <img src=x onerror="window.bad=true">');
    await sf.locator('button[type="submit"]').click();await sf.waitFor({state:'hidden'});
    check('account nickname is escaped, not executable markup',!await sales.evaluate(()=>window.bad===true)&&await sales.locator('#workspaceAccess .wa-account img').count()===0);
    await p.click('#workspaceAccess [data-wa="refresh"]');await p.waitForSelector('#workspaceAccess [data-wa="prepare"]');
    check('company Owner does not see personal account preparation',!/Private/.test(await p.locator('#workspaceAccess').innerText()));
    check('new viewer cannot see company account metadata before approval',!/Company sales Outlook/.test(await viewer.locator('#workspaceAccess').innerText()));
    await viewer.click('#workspaceAccess [data-wa="request"][data-resource="workspace"][data-permission="member"]');
    const vf=viewer.locator('#workspaceAccessDialog');
    await vf.locator('[name="reason"]').fill('Please add me to company metrics');
    await vf.locator('button[type="submit"]').click();await vf.waitFor({state:'hidden'});
    check('membership request is persisted and pending, not silently approved',!(await view('viewer')).self.member&&(await view('viewer')).requests[0].status==='pending');
    await p.click('#btnBell');
    await p.waitForSelector('#bellDrop [data-workspace-access]');
    check('owner notification names the requester and requested scope',/Company membership/.test(await p.locator('#bellDrop [data-workspace-access]').innerText()));
    await p.click('#bellDrop [data-workspace-access]');
    await p.waitForSelector('#workspaceAccess [data-wa="review"]');
    await p.click('#workspaceAccess [data-wa="review"]');
    await form.locator('[name="reason"]').fill('Approved membership, no sensitive access');
    await form.locator('button[type="submit"]').click();await form.waitFor({state:'hidden'});
    await viewer.click('#workspaceAccess [data-wa="refresh"]');await viewer.waitForSelector('#workspaceAccess [data-wa="prepare"]');
    check('owner approval activates company metrics only',(await view('viewer')).self.member&&!(await view('viewer')).permissions['finance.read']);
    await viewer.evaluate(()=>QSDash.show('sales'));
    await viewer.waitForSelector('#workspacePulse .wa-company-metrics');
    check('Pulse shows safe company counts while company money stays restricted',await viewer.locator('#workspacePulse [data-permission="finance.read"]').count()===1&&!/2,46,813/.test(await viewer.locator('#workspacePulse').innerText()));
    await viewer.click('#workspacePulse [data-permission="finance.read"]');
    await vf.locator('[name="reason"]').fill('Need company quotation value report');
    await vf.locator('button[type="submit"]').click();await vf.waitFor({state:'hidden'});
    await p.click('#workspaceAccess [data-wa="refresh"]');await p.waitForSelector('#workspaceAccess [data-wa="review"]');
    await p.click('#workspaceAccess [data-wa="review"]');await form.locator('[name="reason"]').fill('Approved report only for thirty days');
    await form.locator('button[type="submit"]').click();await form.waitFor({state:'hidden'});
    await viewer.evaluate(()=>StudioWorkspaceAccess.refresh());
    await viewer.waitForSelector('#waCompanyFinance strong');
    check('approved finance value is shown only after server approval',/2,46,813/.test(await viewer.locator('#waCompanyFinance').innerText()));
    check('company finance grant does not also open personal quotation snapshots',(await authed('viewer','proposals/any-quotation')).status===403);
    await viewer.screenshot({path:path.join(shots,'member-approved-finance.png'),fullPage:true,timeout:90000});
    await p.click('#workspaceAccess [data-wa="share"][data-resource="workspace"]');
    await form.locator('[name="userId"]').selectOption(viewerId);
    await form.locator('[name="permission"]').selectOption('finance.read');
    await form.locator('[name="decision"]').selectOption('deny');
    await form.locator('[name="reason"]').fill('Report access no longer needed');
    await form.locator('button[type="submit"]').click();await form.waitFor({state:'hidden'});
    await viewer.evaluate(()=>StudioWorkspaceAccess.refresh());
    await viewer.waitForSelector('#workspacePulse [data-permission="finance.read"]');
    check('revocation clears rendered amounts and backend denies future reads',!/2,46,813/.test(await viewer.locator('#workspacePulse').innerText())&&(await authed('viewer','workspace/finance')).status===403);
    // Keep an old decision open while a different owner-side command commits.
    await p.click('#workspaceAccess [data-wa="share"][data-resource="workspace"]');
    await form.locator('[name="userId"]').selectOption(viewerId);await form.locator('[name="permission"]').selectOption('finance.read');
    await form.locator('[name="reason"]').fill('Stale grant must never be retried');
    await cmd('owner','grant',{userId:viewerId,resource:'workspace',permission:'followups.read',decision:'allow',days:7,reason:'Concurrent approval for follow-ups'});
    // Force a background refresh while this old decision remains open.
    await p.evaluate(()=>StudioWorkspaceAccess.refresh());
    await form.locator('button[type="submit"]').click();await form.waitFor({state:'hidden'});
    check('stale grant refreshes instead of overwriting a later decision',(await authed('viewer','workspace/finance')).status===403);
    // Account archive/restore uses the real endpoint and a recorded reason.
    await p.waitForSelector('#workspaceAccess [data-wa="archive"]');
    await p.click(`#workspaceAccess [data-wa="archive"][data-resource="${inbox}"]`);
    await form.locator('[name="reason"]').fill('Archive this prepared shared mailbox');await form.locator('button[type="submit"]').click();await form.waitFor({state:'hidden'});
    check('archive and restore are genuine reversible backend controls',(await view('owner')).connections.find(c=>c.id===inbox).archived);
    await p.click(`#workspaceAccess [data-wa="archive"][data-resource="${inbox}"]`);await form.locator('[name="reason"]').fill('Restore with fresh access decisions');await form.locator('button[type="submit"]').click();await form.waitFor({state:'hidden'});
    check('restore does not manufacture a provider connection',!(await view('owner')).connections.find(c=>c.id===inbox).archived&&(await view('owner')).connections.find(c=>c.id===inbox).status==='not_connected');
    await p.screenshot({path:path.join(shots,'owner-accounts-access.png'),fullPage:true,timeout:90000});
    for(const [theme,width,height] of [['light',390,844],['dark',1440,1050],['system',1440,1050]]){
      await p.setViewportSize({width,height});await p.selectOption('#dashboardTheme',theme);
      check(theme+' access controls fit without page overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    await p.setViewportSize({width:390,height:844});await p.screenshot({path:path.join(shots,'mobile-accounts-access.png'),fullPage:true,timeout:90000});
    check('no external providers were contacted',providerRequests.length===0,providerRequests);
    check('no runtime errors',errors.length===0,errors);
    console.log('RESULT: ALL PASS ('+passed+' checks)');
  } finally {
    if(browser)await browser.close();
    if(child){child.kill('SIGTERM');await new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));}
    fs.rmSync(data,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
