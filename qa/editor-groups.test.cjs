/* Inner-card/layout regression: no live backend; no calculation/export changes. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{
 const {default:chrome}=await import('@sparticuz/chromium');
 const browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args.filter(a=>a!=='--single-process'),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1200}}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto((process.env.QA_BASE||'http://127.0.0.1:8080')+'/quotation.html');
  await p.waitForFunction(()=>Render.lastState&&document.querySelectorAll('.studio-arranged-cluster').length>20);
  await p.evaluate(()=>document.fonts.ready);
  await p.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));await p.evaluate(()=>ProposalValueFooters.sync());
  // Attribute insertion order is not a PDF/content change; retain all values and visibility.
  const capture=()=>({form:JSON.stringify(StateStore.collectForm()),finance:JSON.stringify(Finance.compute(Render.lastState)),pages:(()=>[...document.querySelectorAll('.page')].map(page=>{const clone=page.cloneNode(true);for(const n of clone.querySelectorAll('*')){const attrs=[...n.attributes].map(a=>[a.name,a.value]).sort((a,b)=>a[0].localeCompare(b[0]));for(const a of [...n.attributes])n.removeAttribute(a.name);for(const [name,value]of attrs)n.setAttribute(name,value);}return clone.innerHTML;}))()});
  const original=await p.evaluate(capture);
  const folder=path.join(__dirname,'shots','editor-groups');fs.mkdirSync(folder,{recursive:true});
  const sections=['custName','moduleMake','costPerWp','payAdvance','optName','bomModules','pvsystUrl','durationText','companyName','up_cover','galleryUrl','systemEnabled','tiltDeg'];
  const relationships={custName:'Customer details',capacity:'Site & system',propRef:'Proposal details',shareUrl:'Sharing & audio',costPerWp:'Project pricing',degradation:'Savings assumptions',subsidyOverride:'Subsidy & support',loanAmt:'Loan (optional)',companyEmail:'Contact & office',bomBos:'Structure & balance of system',galleryUrl:'QR destination'};
  assert(await p.evaluate(map=>Object.entries(map).every(([id,title])=>document.getElementById(id).closest('.studio-input-cluster')?.querySelector('h3').textContent===title),relationships));
  for(const width of [1440,390,360]){
   await p.setViewportSize({width,height:1200});
   await p.evaluate(()=>{modeAll.click();document.querySelectorAll('.form-panel details').forEach(e=>e.open=true);});
   for(const id of sections){
    const data=await p.evaluate(id=>{
     const section=document.querySelector('.studio-section[data-section="'+id+'"]'),fieldSet=section.querySelector(':scope>fieldset');
     const cards=[...section.querySelectorAll('.studio-input-cluster,.system-input-group,[data-input-tone],.studio-tinted-disclosure')];
     const visible=[...section.querySelectorAll('input:not([type=hidden]):not([type=file]),select,textarea')].filter(e=>!e.hidden&&!e.closest('[hidden]')&&e.getClientRects().length);
     const outside=visible.filter(e=>!e.closest('.studio-input-cluster,.system-input-group,[data-input-tone],.studio-tinted-disclosure')).map(e=>e.id);
     const overflow=visible.filter(e=>{const r=e.getBoundingClientRect(),s=fieldSet.getBoundingClientRect();return r.left<s.left-2||r.right>s.right+2||(!e.matches('[type=checkbox],[type=radio]')&&e.clientWidth<65);}).map(e=>e.id);
     const tint=cards.some(e=>{const bg=getComputedStyle(e).backgroundColor;return bg!=='rgb(255, 255, 255)'&&bg!=='rgba(0, 0, 0, 0)';});
     const grids=[...section.querySelectorAll('.studio-field-grid')].map(grid=>{
      const fields=[...grid.children].filter(e=>!e.hidden&&e.getClientRects().length),r=grid.getBoundingClientRect();
      return fields.every(e=>{const f=e.getBoundingClientRect();return f.left>=r.left-1&&f.right<=r.right+1;});
     });
     return {outside,overflow,tint,grids};
    },id);
    assert.deepEqual(data.outside,[],id+' controls outside a coloured group');assert.deepEqual(data.overflow,[],id+' overflow at '+width);
    assert(data.tint,id+' no inner tint');assert(data.grids.every(Boolean),id+' grid fit at '+width);
   }
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  console.log('PASS: all 13 sections have tinted inner groups; visible fields belong to a card; aligned grids at 1440/390/360px');
  await p.setViewportSize({width:1440,height:1600});
  await p.evaluate(()=>{document.querySelector('.studio-tools').open=false;document.querySelectorAll('.studio-setting-help').forEach(e=>e.open=false);});
  for(const id of ['custName','costPerWp','payAdvance','companyName']){
   await p.evaluate(id=>{const panel=document.querySelector('.form-panel'),section=document.querySelector('[data-section="'+id+'"]');panel.scrollTop+=section.getBoundingClientRect().top-135;},id);
   await p.screenshot({path:path.join(folder,id+'.png'),clip:{x:0,y:0,width:438,height:1500}});
  }
  // Opening/rearranging sections is presentation only, including every A4 page.
  assert.deepEqual(await p.evaluate(capture),original);
  assert.equal(await p.locator('#genFactor').inputValue(),'1460');
  assert(await p.locator('#rwaEligibilityField').evaluate(e=>e.hidden));
  // Conditional package/battery fields keep their original containers and rules.
  for(const kind of ['weatherproof','carport','bess','custom']){
   await p.selectOption('#advancedSystemSelect',kind);
   await p.waitForFunction(k=>k==='bess'?Render.lastState.bessEnabled:Render.lastState.systemEnabled&&Render.lastState.systemTemplate===k,kind);
   assert(await p.evaluate(()=>{
    const select=advancedSystemSelect.getBoundingClientRect(),scope=document.querySelector('[data-section="systemEnabled"]');
    return [...scope.querySelectorAll('input,select,textarea')].filter(e=>!e.hidden&&!e.closest('[hidden]')&&e.getClientRects().length).every(e=>e.getBoundingClientRect().top>=select.top-1);
   }));
  }
  await p.selectOption('#advancedSystemSelect','none');
  await p.waitForFunction(()=>!Render.lastState.bessEnabled&&!Render.lastState.systemEnabled);
  // Real edits still flow through the original controls and survive local reload.
  await p.locator('#custName').fill('Layout QA');await p.locator('#companyEmail').fill('layout@example.test');
  await p.evaluate(()=>{__qsSaveNow();});
  await p.reload();await p.waitForFunction(()=>Render.lastState?.custName==='Layout QA');
  assert.equal(await p.locator('#companyEmail').inputValue(),'layout@example.test');
  assert.deepEqual(errors,[]);console.log('PASS: no form/Finance/PDF changes from layout; conditional systems, saved edits, search-compatible IDs and zero browser errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
