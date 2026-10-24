/* Shared-control visual regression: eight workspace pages plus reports/publish, three themes, touch and dialogs. Serves the real dashboard through its isolated,
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
    const audit=[];
    const panels=['home','proposals','tasks','activity','send','gallery','sales','settings','reports','publish'];
    const styles=el=>el.evaluate(e=>{const c=getComputedStyle(e);return {color:c.color,bg:c.backgroundColor,image:c.backgroundImage,radius:c.borderRadius,gap:c.columnGap,opacity:c.opacity,filter:c.filter,transform:c.transform,shadow:c.boxShadow};});
    const rgb=value=>value.match(/[\d.]+/g).map(Number);
    const blend=(top,bottom)=>{const alpha=top[3]??1;return top.slice(0,3).map((n,i)=>n*alpha+bottom[i]*(1-alpha));};
    const luminance=rgb=>rgb.slice(0,3).map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
    const ratio=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
    const contrast=style=>{const stops=style.image&&style.image!=='none'?(style.image.match(/rgba?\([^)]*\)/g)||[style.bg]):[style.bg];return Math.min(...stops.flatMap(stop=>[[0,0,0],[255,255,255]].map(back=>{const background=blend(rgb(stop),back);return ratio(blend(rgb(style.color),background),background);})));};
    await page.setViewportSize({width:1536,height:1000});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(origin+'/review/workspace-fit/index.html');
    const frame=page.frames().find(f=>f.parentFrame());await frame.waitForSelector('#homeBody .hgrid');
    fs.mkdirSync(path.join(root,'qa/shots/visual-consistency'),{recursive:true});
    for(const theme of ['light','system','dark']){
      await frame.selectOption('#dashboardTheme',theme);
      for(const panel of panels){
        await frame.evaluate(p=>QSDash.show(p),panel);
        if(panel==='settings')await frame.evaluate(()=>QSDash.showSettings('connections'));
        await frame.waitForSelector('#panel-'+panel+'.on');
        const rows=await frame.locator('.main .btn,.main .gh-primary,.main .gh-secondary,.main .sc-connect').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>{const s=getComputedStyle(e);return {text:e.textContent.trim(),disabled:e.disabled,opacity:s.opacity,color:s.color,bg:s.backgroundColor,image:s.backgroundImage,radius:s.borderRadius,gap:s.columnGap,cls:e.className,svg:[...e.querySelectorAll(':scope > svg')].map(x=>[getComputedStyle(x).width,getComputedStyle(x).height])};}));
        audit.push({theme,panel,controls:rows});
        check(theme+' '+panel+' action radius, gap and square icons follow shared tokens',rows.every(r=>(!r.cls.includes('sc-connect')?r.radius==='9px'&&r.gap==='8px':r.radius==='9px')&&r.svg.every(size=>size[0]==='16px'&&size[1]==='16px')),rows);
        const disabled=rows.filter(r=>r.disabled);
        check(theme+' '+panel+' disabled labels are not faded and meet the 4.5 contrast target',disabled.every(r=>r.opacity==='1'&&contrast(r)>=4.5),disabled.map(r=>({text:r.text,contrast:contrast(r),opacity:r.opacity})));
        const standard=rows.filter(r=>!r.disabled&&/btn-secondary|btn-primary|gh-primary|gh-secondary/.test(r.cls));
        check(theme+' '+panel+' standard action text meets 4.5 contrast even over extreme backdrops',standard.every(r=>contrast(r)>=4.5),standard.map(r=>({text:r.text,contrast:contrast(r)})));
        check(theme+' '+panel+' preserved page width and rounded header',await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&getComputedStyle(document.querySelector('.gbar')).borderRadius==='22px'));
      }
      await frame.evaluate(()=>QSDash.show('sales'));
      const tabs=await frame.locator('#ghTabs [data-bi-tab]').evaluateAll(els=>els.map(e=>e.dataset.biTab));
      for(const tab of tabs){
        await frame.click('#ghTabs [data-bi-tab="'+tab+'"]');
        const rows=await frame.locator('#panel-sales .gh-primary,#panel-sales .gh-secondary,#panel-sales .gh-text').evaluateAll(els=>els.filter(e=>e.getClientRects().length).map(e=>{const c=getComputedStyle(e);return {text:e.textContent.trim(),disabled:e.disabled,opacity:c.opacity,color:c.color,bg:c.backgroundColor,image:c.backgroundImage,radius:c.borderRadius,gap:c.columnGap,font:c.fontSize};}));
        audit.push({theme,panel:'sales/'+tab,controls:rows});
        check(theme+' Pulse '+tab+' action type, radius and gap are consistent',rows.every(r=>r.font==='11px'&&r.radius==='9px'&&r.gap==='8px'),rows);
        check(theme+' Pulse '+tab+' standard and disabled action contrast is readable',rows.filter(r=>r.disabled||r.bg!=='rgba(0, 0, 0, 0)').every(r=>contrast(r)>=4.5&&(!r.disabled||r.opacity==='1')),rows);
      }
      for(const section of ['profile','security','team']){
        await frame.evaluate(s=>QSDash.showSettings(s),section);
        check(theme+' Settings '+section+' buttons keep shared corners',await frame.locator('#panel-settings .btn').evaluateAll(els=>els.filter(e=>e.getClientRects().length).every(e=>getComputedStyle(e).borderRadius==='9px')));
      }
      await frame.evaluate(()=>QSDash.showSettings('connections'));
      const enabled=frame.locator('.wa-card-actions [data-wa="account-details"]').first(),disabled=frame.locator('#workspaceAccess [data-wa="prepare"]');
      await page.mouse.move(0,0);const before=await styles(enabled);await enabled.hover();const after=await styles(enabled);
      check(theme+' enabled hover gives restrained feedback without movement',before.bg!==after.bg&&after.transform==='none'&&contrast(after)>=4.5,{before,after});
      await page.mouse.move(0,0);const disabledBefore=await styles(disabled);await disabled.hover();const disabledAfter=await styles(disabled);
      check(theme+' disabled hover never brightens, moves or mimics an active action',JSON.stringify(disabledBefore)===JSON.stringify(disabledAfter));
      await frame.locator('#gSearch').focus();await frame.press('#gSearch','Tab');
      check(theme+' keyboard focus has a visible two-pixel outline',await frame.locator('#dashboardTheme').evaluate(e=>e===document.activeElement&&getComputedStyle(e).outlineWidth==='2px'&&getComputedStyle(e).outlineStyle==='solid'));
      if(theme==='system')check(theme+' glass transparency remains the same shared material as lower cards',await frame.evaluate(()=>getComputedStyle(document.querySelector('#workspaceAccess')).backgroundImage===getComputedStyle(document.querySelector('.sc-service')).backgroundImage));
      await frame.locator('#workspaceAccess').screenshot({path:path.join(root,'qa/shots/visual-consistency','accounts-'+theme+'.png'),animations:'disabled',timeout:90000});
      await frame.locator('.sc-details').first().click();await frame.waitForSelector('#connectionDetails[open]');
      check(theme+' dialog actions share the same control radius',await frame.locator('#connectionDetails .btn').evaluateAll(els=>els.every(e=>getComputedStyle(e).borderRadius==='9px')));
      const inactive=await styles(frame.locator('#connectionDetails .btn:disabled'));
      check(theme+' dialog disabled action remains legible',inactive.opacity==='1'&&contrast(inactive)>=4.5);
      await page.keyboard.press('Escape');
      // Probe danger variants inside the real dialog stylesheet scope; no action handlers.
      const danger=await frame.evaluate(()=>{const host=document.querySelector('#confirmBox'),probe=document.createElement('button');probe.className='btn btn-danger';probe.textContent='Test only';host.append(probe);const s=getComputedStyle(probe),data={color:s.color,bg:s.backgroundColor};probe.remove();return data;});
      check(theme+' destructive actions have readable foregrounds too',contrast(danger)>=4.5,danger);
    }
    fs.writeFileSync(path.join(root,'qa/shots/visual-consistency/control-inventory.json'),JSON.stringify(audit,null,2));
    const touch=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
    touch.on('pageerror',e=>errors.push(e.message));touch.on('request',r=>{if(/\/(api|auth)\//.test(new URL(r.url()).pathname))apiRequests.push(r.url());});
    await touch.goto(origin+'/review/workspace-fit/index.html');const tf=touch.frames().find(f=>f.parentFrame());await tf.waitForSelector('#homeBody .hgrid');
    for(const panel of panels){
      await tf.evaluate(p=>QSDash.show(p),panel);if(panel==='settings')await tf.evaluate(()=>QSDash.showSettings('connections'));
      check('touch '+panel+' action targets are at least 44 pixels tall',await tf.locator('.main .btn,.main .gh-primary,.main .gh-secondary,.main .sc-details,.main .sc-connect').evaluateAll(els=>els.filter(e=>e.getClientRects().length).every(e=>e.getBoundingClientRect().height>=44)));
      check('touch '+panel+' keeps natural scrolling without horizontal overflow',await tf.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&!['hidden','clip'].includes(getComputedStyle(document.body).overflowY)));
    }
    await tf.evaluate(()=>QSDash.showSettings('connections'));await tf.waitForSelector('#workspaceAccess [data-wa=prepare]');
    await tf.locator('#workspaceAccess').scrollIntoViewIfNeeded();await touch.screenshot({path:path.join(root,'qa/shots/visual-consistency/mobile-settings.png'),animations:'disabled',timeout:90000});await touch.close();
    check('review made zero API/auth requests',apiRequests.length===0,apiRequests);
    check('no browser page errors',errors.length===0,errors);
    console.log('RESULT: ALL PASS ('+count+' checks)');
  }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
