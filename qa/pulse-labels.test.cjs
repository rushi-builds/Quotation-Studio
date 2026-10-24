/* Action desk display labels and selected-filter readability.
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
    await page.setViewportSize({width:1536,height:900});
    await page.goto(origin+'/review/workspace-fit/index.html?panel=sales');
    const frame=page.frames().find(f=>f.parentFrame());
    await frame.waitForSelector('#biBody .pulse-visual-metrics',{state:'attached'});
    await frame.evaluate(()=>window.QSDash.show('sales'));
    await frame.click('[data-bi-tab="desk"]');
    const labels=await frame.locator('.pulse-filters button').allTextContents();
    check('professional filter labels replace the three rejected names',labels.map(s=>s.trim()).join('|')==='All|Overdue|Unanswered|Unassigned|Follow-up needed|Needs review',labels);
    check('assignment filter is not confused with account-owner role',await frame.locator('#pulseDeskOwner').getAttribute('aria-label')==='Assigned to');
    for(const [key,label] of [['No owner','Unassigned'],['No next step','Follow-up needed'],['Stalled','Needs review']]){
      await frame.locator('[data-pulse-action="desk-filter"]').filter({hasText:new RegExp('^'+label+'$')}).click();
      check(label+' retains original filter key and selection',await frame.locator('.pulse-filters [aria-pressed=true]').getAttribute('data-id')===key);
    }
    await frame.locator('[data-pulse-action="desk-filter"][data-id="All"]').click();
    for(const appearance of ['system','light','dark']){
      await frame.selectOption('#dashboardTheme',appearance);
      // Poll computed style: an off-screen iframe may defer starting its
      // existing background transition until the first style read.
      await frame.waitForFunction(()=>{
        const el=document.querySelector('.pulse-filters [aria-pressed=true]');
        return getComputedStyle(el).backgroundColor===(document.documentElement.dataset.theme==='dark'?'rgb(237, 199, 135)':'rgb(32, 48, 71)');
      });
      const colours=await frame.locator('.pulse-filters [aria-pressed=true]').evaluate(el=>({text:el.textContent.trim(),fg:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundColor}));
      const lum=colour=>{const rgb=colour.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
      const a=lum(colours.fg),b=lum(colours.bg),contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      check(appearance+' selected All filter stays readable (WCAG AA)',colours.text==='All'&&contrast>=4.5,{...colours,contrast});
    }
    await frame.selectOption('#dashboardTheme','system');
    fs.mkdirSync(path.join(root,'qa/shots/pulse'),{recursive:true});
    await page.screenshot({path:path.join(root,'qa/shots/pulse/professional-action-filters.png')});
    await page.setViewportSize({width:390,height:844});
    check('renamed filters wrap without horizontal page overflow',await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    check('review made zero API/auth requests',apiRequests.length===0,apiRequests);
    check('no runtime errors',errors.length===0,errors);

    // Renderer-only fixture verifies row text and CSVs, not just empty controls.
    const vm=require('vm'),body={innerHTML:''},handlers={},exported=[];
    const rows=['No owner','No next step','Stalled'].map((kind,i)=>({id:'signal-'+i,leadId:'lead-'+i,company:'Renderer fixture '+i,kind,detail:'Recorded signal',owner:'Team member',priority:2,due:null}));
    const sandbox={document:{getElementById:()=>body,addEventListener:(name,fn)=>handlers[name]=fn},PulseOperations:{ensure:()=>{},desk:()=>rows},BusinessEngine:{csv:rows=>JSON.stringify(rows)},PulseGovernance:{visible:()=>rows},PulseGovernanceUI:{rowControls:()=>'',lockLegacy:()=>{}},PulseAccess:{allowLegacy:()=>true},PulseBrand:{buttonLabel:(action,label)=>label},window:null};
    sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'assets/js/pulse/pulse-ui.js'),'utf8'),sandbox);
    const context={state:{mode:'live'},render:()=>sandbox.PulseUI.desk(),download:(name,csv)=>exported.push(csv)};
    sandbox.PulseUI.mount(context);sandbox.PulseUI.desk();
    const visible=body.innerHTML.replace(/<[^>]*>/g,'');
    check('signal rows use the same professional vocabulary as their filters',!/(No owner|No next step|Stalled)/.test(visible)&&/Unassigned/.test(visible)&&/Follow-up needed/.test(visible)&&/Needs review/.test(visible));
    for(const [i,row] of rows.entries()){
      const filter={disabled:false,dataset:{pulseAction:'desk-filter',id:row.kind},closest:()=>({})};
      await handlers.click({target:{closest:()=>filter}});
      check('renderer filter selects only the original '+row.kind+' signal',rows.every((r,j)=>body.innerHTML.includes(r.company)===(i===j)));
    }
    const all={disabled:false,dataset:{pulseAction:'desk-filter',id:'All'},closest:()=>({})};
    await handlers.click({target:{closest:()=>all}});
    const node={disabled:false,dataset:{pulseAction:'desk-export'},closest:()=>({})};
    await handlers.click({target:{closest:()=>node}});
    check('CSV uses display labels without changing underlying signal kinds',exported.length===1&&!/(No owner|No next step|Stalled)/.test(exported[0])&&rows[0].kind==='No owner'&&rows[1].kind==='No next step'&&rows[2].kind==='Stalled');
    const dialogs=[];
    context.dialog=(title,sub,html)=>dialogs.push({title,html});
    context.state.governance={requests:rows.map(r=>({...r,status:'Pending'})),alerts:rows.map(r=>({...r,status:'Hidden'})),audit:[]};
    Object.assign(sandbox.PulseGovernance,{manage:()=>false,signature:()=> 'renderer-fixture',state:()=>context.state.governance,status:()=> 'Hidden'});
    sandbox.setInterval=()=>0;
    vm.runInContext(fs.readFileSync(path.join(root,'assets/js/pulse/pulse-governance-ui.js'),'utf8'),sandbox);
    sandbox.PulseGovernanceUI.mount(context);
    for(const [i,label] of ['Unassigned','Follow-up needed','Needs review'].entries()){
      const alert={disabled:false,dataset:{govAction:'alert',id:rows[i].id}};
      handlers.click({target:{closest:()=>alert}});
      check('existing alert dialog uses '+label,dialogs.at(-1).title==='Manage '+label+' alert');
    }
    sandbox.PulseGovernanceUI.history('alerts');
    check('existing alert/request history uses professional labels, retaining raw stored kinds',!/(No owner|No next step|Stalled)/.test(dialogs.at(-1).html)&&rows[0].kind==='No owner');
    console.log('RESULT: ALL PASS ('+count+' checks)');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
