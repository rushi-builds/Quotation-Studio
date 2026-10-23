/* Read-only workspace access preview regression.
   Review frame only: no production API, permissions changes or live data. */
'use strict';
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const server=http.createServer((req,res)=>{
    let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
    if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
    const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
    if(!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  let browser;const errors=[],apiRequests=[];let count=0;
  const check=(name,value,detail)=>{assert.ok(value,name+(detail?' :: '+JSON.stringify(detail):''));console.log('  ok - '+name);count++;};
  try{
    const c=require('@sparticuz/chromium');const chrome=c.default||c;
    browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args.filter(a=>a!=='--single-process'),headless:true});
    const page=await browser.newPage({viewport:{width:1536,height:1100}});
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/\/(api|auth)\//.test(new URL(r.url()).pathname))apiRequests.push(r.url());});
    for(const role of ['owner','member','pending']){
      await page.goto(origin+'/review/workspace-fit/index.html?panel=access&role='+role);
      const f=page.frames().find(f=>f.parentFrame());
      await f.waitForSelector('#workspaceAccess [data-wa="prepare"]');
      check(role+' preview is clearly read only',/Read-only sample preview/.test(await f.locator('#workspaceAccess').innerText()));
      check(role+' preview cannot prepare or connect accounts',await f.locator('#workspaceAccess [data-wa="prepare"]').isDisabled()&&await f.locator('.sc-connect[disabled]').count()===8);
      check(role+' fixture rejects direct access mutations',await f.evaluate(async()=>{try{await PlatformAPI.workspaceCommand('grant',{userId:'someone'});return false;}catch{return true;}}));
      check(role+' membership presentation is correct',await f.evaluate(()=>PlatformAPI.workspaceAccess().then(s=>s.self.member))===(role!=='pending'));
      if(role==='owner'){
        check('default view is accounts, not a wall of permissions or request reasons',await f.locator('#wa-tab-accounts').getAttribute('aria-selected')==='true'&&!await f.locator('.wa-workspace').isVisible()&&!/Review company quotation totals/.test(await f.locator('#workspaceAccess').innerText()));
        check('each account has a locally loaded recognisable provider logo',await f.locator('.wa-account-card .wa-provider-icon img').evaluateAll(imgs=>imgs.length===3&&imgs.every(img=>img.complete&&img.naturalWidth>0&&new URL(img.src).origin===new URL(document.baseURI).origin)));
        await f.click('#wa-tab-requests');
        check('requests are in their own panel with reasons collapsed',await f.locator('#wa-panel-requests').isVisible()&&!await f.locator('.wa-request-context').evaluate(e=>e.open));
        await f.click('#workspaceAccess [data-wa="review"]');
        check('sample request can be inspected but approval cannot be submitted',await f.locator('#workspaceAccessDialog').isVisible()&&await f.locator('#workspaceAccessDialog button[type=submit]').isDisabled());
        check('all preview decision fields are read only',await f.locator('#workspaceAccessDialog input,#workspaceAccessDialog select,#workspaceAccessDialog textarea').evaluateAll(fields=>fields.length>0&&fields.every(field=>field.disabled)));
        await f.locator('#workspaceAccessDialog button[type=submit]').evaluate(b=>{b.disabled=false;b.click();});
        check('forced preview submit cannot fabricate a saved decision',await f.locator('#workspaceAccessDialog').isVisible()&&await f.evaluate(()=>PlatformAPI.workspaceAccess().then(s=>s.requests[0].status))==='pending');
        await f.click('#workspaceAccessDialog [data-wa="close"]');
        await f.locator('#wa-tab-requests').focus();await f.press('#wa-tab-requests','End');
        check('tab keyboard End navigates to History with focus',await f.locator('#wa-tab-history').evaluate(e=>e===document.activeElement&&e.getAttribute('aria-selected')==='true'));
        await f.press('#wa-tab-history','Home');
        check('tab keyboard Home returns to Accounts',await f.locator('#wa-tab-accounts').getAttribute('aria-selected')==='true');
        await f.click('#workspaceAccess [data-wa="account-details"] >> nth=0');
        check('individual account permissions use a read-only detail dialog',await f.locator('#workspaceAccessDialog .wa-detail-row').count()===3);
        await f.click('#workspaceAccessDialog [data-wa="close"]');
        await f.click('[data-wa="filter"][data-filter="personal"]');
        check('ownership filters show an honest empty state',await f.locator('.wa-account-card:visible').count()===0&&/No accounts in this view/.test(await f.locator('#wa-panel-accounts').innerText()));
        await f.click('[data-wa="filter"][data-filter="all"]');
        for(const theme of ['light','dark','system']){
          await f.selectOption('#dashboardTheme',theme);
          check(theme+' access tabs remain visible and selected',await f.locator('#wa-panel-accounts').isVisible()&&await f.locator('#wa-tab-accounts').getAttribute('aria-selected')==='true');
          check(theme+' accounts have no horizontal document overflow',await f.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          if(theme==='dark'){
            check('dark mode applies dark glass and a light foreground to account cards',await f.locator('#workspaceAccess').evaluate(root=>{const css=getComputedStyle(root);return document.documentElement.dataset.theme==='dark'&&!css.backgroundImage.includes('255, 255, 255')&&css.color.match(/[\d.]+/g).slice(0,3).every(n=>Number(n)>100);}));
            await f.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
            await f.locator('#workspaceAccess').screenshot({path:path.join(root,'qa/shots/workspace-access/preview-owner-dark.png'),animations:'disabled',timeout:90000});
          }
        }
        fs.mkdirSync(path.join(root,'qa/shots/workspace-access'),{recursive:true});
        await f.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
        await f.locator('#workspaceAccess').screenshot({path:path.join(root,'qa/shots/workspace-access/preview-owner.png'),animations:'disabled',timeout:90000});
        await f.click('#wa-tab-requests');
        await f.locator('#workspaceAccess').screenshot({path:path.join(root,'qa/shots/workspace-access/preview-requests.png'),animations:'disabled',timeout:90000});
        await f.click('#wa-tab-accounts');
        await page.setViewportSize({width:390,height:844});
        check('mobile tabs and account cards fit without horizontal overflow',await f.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        await f.evaluate(()=>document.querySelector('#workspaceAccess').scrollIntoView({block:'start'}));
        await page.screenshot({path:path.join(root,'qa/shots/workspace-access/preview-owner-mobile.png'),animations:'disabled',timeout:90000});
        await f.click('#wa-tab-permissions');
        check('mobile My access remains usable without a long default list',await f.locator('#wa-panel-permissions').isVisible());
        await page.setViewportSize({width:1536,height:1100});
      }
    }
    await page.goto(origin+'/review/workspace-fit/index.html?panel=sales&role=member');
    let f=page.frames().find(f=>f.parentFrame());
    await f.waitForSelector('#workspacePulse .wa-company-metrics');
    check('member sees common metrics with money restricted',await f.locator('#workspacePulse [data-permission="finance.read"]:disabled').count()===1&&await f.locator('#waCompanyFinance').count()===0);
    await page.goto(origin+'/review/workspace-fit/index.html?panel=sales&role=member&finance=granted');
    f=page.frames().find(f=>f.parentFrame());await f.waitForSelector('#waCompanyFinance strong');
    check('explicit sample finance variant renders only fictional authorised value',/1,21,50,000/.test(await f.locator('#waCompanyFinance').innerText()));
    check('preview never contacted API/auth',apiRequests.length===0,apiRequests);
    check('preview has no runtime errors',errors.length===0,errors);
    console.log('RESULT: ALL PASS ('+count+' checks)');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
