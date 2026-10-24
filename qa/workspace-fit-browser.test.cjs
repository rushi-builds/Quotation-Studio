/* Restored original-layout regression (compact/no-scroll experiment rejected). Serves the real dashboard through its isolated,
   read-only review frame. No API backend, session or customer data involved. */
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
    for(const [width,height] of [[1366,600],[1536,864],[390,844]]){
      await page.setViewportSize({width,height});
      await page.goto(origin+'/review/workspace-fit/index.html');
      const frame=page.frames().find(f=>f.parentFrame());
      await frame.waitForSelector('#homeBody .hgrid');
      await frame.waitForSelector('#biBody .pulse-section-label',{state:'attached'});
      for(const panel of ['home','sales']){
        await frame.evaluate(p=>window.QSDash.show(p),panel);
        await frame.waitForSelector('#panel-'+panel+'.on');
        await frame.waitForTimeout(400);
        const result=await frame.evaluate(()=>{
          const header=getComputedStyle(document.querySelector('.gbar'));
          const active=document.querySelector('.panel.on');
          return {width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,radius:header.borderRadius,border:header.borderTopWidth,controls:['workspaceHome','currentPage','gSearch','dashboardTheme','btnBell','btnUserChip'].every(id=>!!document.getElementById(id)?.getBoundingClientRect().width),cards:[...active.querySelectorAll('.hc,.pulse-calendar,.pulse-overview-bottom>.gh-card')].map(el=>({width:el.getBoundingClientRect().width})),overflow:getComputedStyle(document.body).overflowY};
        });
        check(width+' '+panel+' rounded top strip and all six controls retained',result.radius==='22px'&&result.border==='1px'&&result.controls,result);
        check(width+' '+panel+' original natural page scrolling restored',result.scrollHeight>result.height&&!['hidden','clip'].includes(result.overflow),result);
        check(width+' '+panel+' no horizontal page overflow or missing sections',result.scrollWidth<=result.width+1&&result.cards.length===4&&result.cards.every(c=>c.width>0),result);
        if(width>=1000&&panel==='home')check('original full-width lower Home sections restored',await frame.locator('#homeBody .hc.w2').first().evaluate(e=>Math.abs(e.getBoundingClientRect().width-e.parentElement.getBoundingClientRect().width)<2));
        if(width>=1000&&panel==='sales')check('original separate analytical rows restored',await frame.locator('.pulse-overview-grid').evaluate(e=>getComputedStyle(e).display==='grid'));
        fs.mkdirSync(path.join(root,'qa/shots/workspace-restored'),{recursive:true});
        await page.screenshot({path:path.join(root,'qa/shots/workspace-restored',panel+'-'+width+'.png'),fullPage:true});
      }
      if(width===1536){
        await frame.locator('[data-bi-action="report-options"]').click();
        check('existing report controls still open',await frame.locator('#pulseReportOptions').evaluate(e=>e.open));
        for(const appearance of ['dark','light','system']){
          await frame.locator('#dashboardTheme').selectOption(appearance);
          check(appearance+' preserves rounded top strip',await frame.locator('.gbar').evaluate(e=>getComputedStyle(e).borderRadius==='22px'&&getComputedStyle(e).borderTopWidth==='1px'));
        }
      }
    }
    check('review made zero API/auth requests',apiRequests.length===0,apiRequests);
    check('no browser page errors',errors.length===0,errors);
    console.log('RESULT: ALL PASS ('+count+' checks)');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
