/* Layout-only regression. Serves the real dashboard through its isolated,
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
    for(const [width,height] of [[1536,864],[1366,768],[1920,1080],[1280,800],[900,650],[390,844],[320,740]]){
      await page.setViewportSize({width,height});
      await page.goto(origin+'/review/workspace-fit/index.html');
      const frame=page.frames().find(f=>f.parentFrame());
      await frame.waitForSelector('#homeBody .hgrid');
      await frame.waitForSelector('#biBody .pulse-section-label',{state:'attached'});
      for(const panel of ['home','sales']){
        await frame.evaluate(p=>window.QSDash.show(p),panel);
        await frame.waitForSelector('#panel-'+panel+'.on');
        await frame.waitForTimeout(250);
        const result=await frame.evaluate(()=>{
          const header=getComputedStyle(document.querySelector('.gbar'));
          const active=document.querySelector('.panel.on');
          return {width:innerWidth,height:innerHeight,scrollHeight:document.documentElement.scrollHeight,scrollWidth:document.documentElement.scrollWidth,radius:header.borderRadius,background:header.backgroundColor,border:header.borderTopWidth,controls:['workspaceHome','currentPage','gSearch','dashboardTheme','btnBell','btnUserChip'].every(id=>!!document.getElementById(id)?.getBoundingClientRect().width),cards:[...active.querySelectorAll('.hc,.pulse-calendar,.pulse-overview-bottom>.gh-card')].map(el=>({bottom:el.getBoundingClientRect().bottom,width:el.getBoundingClientRect().width})),overflow:getComputedStyle(document.body).overflowY};
        });
        console.log('  layout',width,height,panel,JSON.stringify(result));
        check(width+' '+panel+' header has no capsule, all six controls retained',result.radius==='0px'&&result.background==='rgba(0, 0, 0, 0)'&&result.border==='0px'&&result.controls,result);
        check(width+' '+panel+' no horizontal page overflow',result.scrollWidth<=result.width+1,result);
        check(width+' '+panel+' no document scroll lock or missing sections',!['hidden','clip'].includes(result.overflow)&&result.cards.length===4&&result.cards.every(c=>c.width>0),result);
        if(width>=1500)check(width+' '+panel+' fits one desktop screen including profile nudge',result.scrollHeight<=result.height+1,result);
        if(width<=900)check(width+' '+panel+' small screen keeps necessary scrolling',result.scrollHeight>result.height,result);
        if(width<=390)check(width+' '+panel+' wrapped search stays inside header and above content',await frame.evaluate(()=>{
          const header=document.querySelector('.gbar').getBoundingClientRect(), search=document.querySelector('.gsearch').getBoundingClientRect(),content=document.querySelector('.workspace-content').getBoundingClientRect();
          return search.bottom<=header.bottom+1&&header.bottom<=content.top+1;
        }));
        if([1536,1366,390].includes(width)){
          fs.mkdirSync(path.join(root,'qa/shots/workspace-fit'),{recursive:true});
          await page.screenshot({path:path.join(root,'qa/shots/workspace-fit',panel+'-'+width+'.png'),fullPage:true});
        }
      }
      if(width===1536){
        await frame.locator('[data-bi-action="report-options"]').click();
        check('report options remain openable',await frame.locator('#pulseReportOptions').evaluate(e=>e.open));
        await frame.locator('[data-bi-action="report-options"]').click();
        await frame.locator('.pulse-followup-details summary').click();
        check('expanded follow-ups remain accessible (natural overflow allowed)',await frame.locator('.pulse-followup-details').evaluate(e=>e.open&&e.scrollHeight>30));
        await frame.locator('.pulse-followup-details summary').click();
        await frame.evaluate(()=>{const first=document.querySelector('#homeBody .hc');for(let i=0;i<12;i++)first.append(first.querySelector('.prow').cloneNode(true));window.QSDash.show('home');});
        check('busy Overview section scrolls internally without hiding its records',await frame.locator('#homeBody .hc').first().evaluate(e=>getComputedStyle(e).overflowY==='auto'&&e.scrollHeight>e.clientHeight));
        await frame.locator('#gSearch').fill('settings');
        check('search remains usable in unboxed header',await frame.locator('#gSearch').inputValue()==='settings');
        for(const appearance of ['dark','light','system']){
          await frame.locator('#dashboardTheme').selectOption(appearance);
          check(appearance+' theme keeps header unboxed',await frame.locator('.gbar').evaluate(e=>getComputedStyle(e).borderRadius==='0px'&&getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)'));
        }
      }
    }
    check('review made zero API/auth requests',apiRequests.length===0,apiRequests);
    check('no browser page errors',errors.length===0,errors);
    console.log('RESULT: ALL PASS ('+count+' checks)');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
