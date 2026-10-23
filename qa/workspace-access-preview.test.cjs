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
    const page=await browser.newPage();
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
        check('owner sees sample company request with disabled approval',await f.locator('#workspaceAccess [data-wa="review"]:disabled').count()===1);
        fs.mkdirSync(path.join(root,'qa/shots/workspace-access'),{recursive:true});
        await page.screenshot({path:path.join(root,'qa/shots/workspace-access/preview-owner.png'),fullPage:true,timeout:90000});
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
