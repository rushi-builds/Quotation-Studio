/* Disposable, offline UI and real single-page PDF proof. No production calls. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const {default:chrome}=await import('@sparticuz/chromium');
 const browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args.filter(a=>a!=='--single-process'),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1200}}),errors=[],writes=[];
  await context.route('**/api/**',route=>{if(route.request().method()!=='GET')writes.push(route.request().url());return route.fulfill({status:404,contentType:'application/json',body:'{"error":"Offline QA fixture"}'});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';
  await page.goto(base+'/quotation.html');await page.waitForFunction(()=>window.Render?.lastState&&document.querySelector('.studio-ready'));await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#v_tmItems>li').count(),12);
  assert.deepEqual(await page.locator('#v_tmItems .term-num>span').allTextContents(),Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')));
  assert.equal(await page.locator('#v_tmItems .term-icon svg').count(),12);
  assert.equal(await page.locator('#v_tmFooterValues li svg').count(),4);
  assert(await page.locator('#v_tmFooterValues').evaluate(e=>getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(e).boxShadow==='none'));
  assert(await page.locator('.terms-footer-lettering').evaluate(img=>img.complete&&img.naturalWidth===191));
  const finance=await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState)));
  assert(await page.evaluate(()=>{
   const s=Render.lastState,v={validity:s.validityDays+' days',duration:s.durationText,jurisdiction:s.jurisdiction,company:s.companyName};
   return CONTENT.pageTerms.items.every((item,i)=>document.querySelectorAll('#v_tmItems .term-d')[i].textContent===item.desc.replace(/\{(\w+)\}/g,(_,k)=>v[k]??''));
  }),'all authored terms and current project values are unchanged');
  assert(await page.evaluate(()=>{
   const original=CONTENT.pageTerms.items[0].desc,old=CONTENT.pageTerms.footerValues[0].label;
   CONTENT.pageTerms.items[0].desc='<img src=x onerror=alert(1)> {validity}';CONTENT.pageTerms.footerValues[0].label='<b>Reliable</b>';Render.renderAll();
   const safe=!document.querySelector('#v_tmItems img,#v_tmFooterValues b')&&document.querySelector('.term-d').textContent.startsWith('<img')&&document.querySelector('#v_tmFooterValues').textContent.includes('<b>Reliable</b>');
   CONTENT.pageTerms.items[0].desc=original;CONTENT.pageTerms.footerValues[0].label=old;Render.renderAll();return safe;
  }),'terms, template values and footer labels stay escaped');
  assert(await page.evaluate(()=>{
   const items=CONTENT.pageTerms.items,values=CONTENT.pageTerms.footerValues,promise=CONTENT.pageTerms.footerPromise;
   CONTENT.pageTerms.items=items.map(({icon,...item})=>item);delete CONTENT.pageTerms.footerValues;delete CONTENT.pageTerms.footerPromise;Render.renderAll();
   const okay=document.querySelectorAll('#v_tmItems .term-icon svg').length===12&&document.querySelectorAll('#v_tmFooterValues li').length===4&&v_tmFooterPromise.textContent.includes('GREENER FUTURE');
   CONTENT.pageTerms.items=items;CONTENT.pageTerms.footerValues=values;CONTENT.pageTerms.footerPromise=promise;Render.renderAll();return okay;
  }),'older saved quotations have safe icon/footer defaults');
  assert(await page.evaluate(()=>{
   Editor.build();const field=[...document.querySelectorAll('#advContainer .field')].find(e=>e.querySelector('label')?.textContent==='Terms footer value 1').querySelector('textarea'),old=field.value;
   field.value='Carefully\nPlanned';field.dispatchEvent(new Event('input',{bubbles:true}));const okay=document.querySelector('#v_tmFooterValues').textContent.includes('Carefully\nPlanned');field.value=old;field.dispatchEvent(new Event('input',{bubbles:true}));return okay;
  }),'new footer text remains live-editable');
  assert.equal(await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState))),finance);
  const shots=path.join(__dirname,'shots','terms-page');fs.mkdirSync(shots,{recursive:true});
  const markup=await page.locator('#pageTerms').evaluate(e=>e.outerHTML),proof=await context.newPage({viewport:{width:794,height:1123}});
  await proof.setContent('<base href="'+base+'/"><link rel="stylesheet" href="assets/css/app.css"><link rel="stylesheet" href="assets/css/experience.css"><link rel="stylesheet" href="assets/css/document-studio.css"><link rel="stylesheet" href="assets/css/terms.css"><style>body{margin:0;padding:0;}</style>'+markup);
  await proof.evaluate(()=>document.fonts.ready);await proof.waitForFunction(()=>[...document.images].every(i=>i.complete));await proof.locator('.page').evaluate(e=>e.style.transform='none');
  const geometry=await proof.locator('#pageTerms').evaluate(p=>{const foot=p.querySelector('footer').getBoundingClientRect();return {height:p.scrollHeight,width:p.scrollWidth,clientWidth:p.clientWidth,footer:foot.top,children:[...p.querySelector('.pg-body').children].map(n=>({class:n.className,bottom:n.getBoundingClientRect().bottom,top:n.getBoundingClientRect().top}))};});
  await proof.locator('#pageTerms').screenshot({path:path.join(shots,'terms-a4.png')});
  assert(geometry.height<=1124&&geometry.width<=geometry.clientWidth&&geometry.children.every(n=>n.bottom<=geometry.footer-3),JSON.stringify(geometry));
  assert(await proof.locator('.terms-grid').evaluate(grid=>{const a=grid.children[0].getBoundingClientRect(),b=grid.children[1].getBoundingClientRect();return a.top===b.top&&b.left>a.right;}),'odd terms left / even terms right, matching reference');
  // Check normal flow used for edited/continued proposals; no absolute footer art.
  await proof.locator('.page').evaluate(e=>e.classList.add('doc-flow'));
  assert(await proof.locator('#pageTerms').evaluate(p=>{const foot=p.querySelector('footer').getBoundingClientRect();return [...p.querySelector('.pg-body').children].every(n=>!n.getClientRects().length||n.getBoundingClientRect().bottom<=foot.top-3);}), 'edited normal-flow page still fits A4');
  const captured=await page.evaluate(async()=>{
   const Native=jspdf.jsPDF,visible=Render.lastVisible.slice(),capture=html2canvas;let raster='',output='';
   window.html2canvas=async(...args)=>{const c=await capture(...args);raster=c.toDataURL('image/png');return c;};
   jspdf.jsPDF=function(...args){const pdf=new Native(...args);pdf.save=()=>{output=pdf.output();};return pdf;};
   try{Render.lastVisible.splice(0,Render.lastVisible.length,...visible.filter(p=>p.id==='pageTerms'));await Exporter.exportPdf(()=>{},{format:'full'});return {pdf:output,raster};}
   finally{jspdf.jsPDF=Native;window.html2canvas=capture;Render.lastVisible.splice(0,Render.lastVisible.length,...visible);}
  });
  assert.equal((captured.pdf.match(/\/Type \/Page\b/g)||[]).length,1);
  fs.writeFileSync(path.join(shots,'terms-pdf-raster.png'),Buffer.from(captured.raster.split(',')[1],'base64'));fs.writeFileSync(path.join(shots,'terms.pdf'),captured.pdf,'binary');
  const id=await page.evaluate(()=>{__qsSaveNow();return Proposals.activeId();}),customer=await context.newPage();customer.on('pageerror',e=>errors.push(e.message));
  await customer.goto(base+'/share.html?p='+encodeURIComponent(id));await customer.waitForFunction(()=>window.Render?.lastState&&document.querySelectorAll('#v_tmItems>li').length===12);
  assert(await customer.locator('#v_tmItems').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length===2));
  for(const width of [390,360]){await customer.setViewportSize({width,height:900});await customer.waitForFunction(()=>document.querySelector('#pageTerms').getBoundingClientRect().width<=innerWidth);assert(await customer.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));}
  await customer.locator('#pageTerms').screenshot({path:path.join(shots,'terms-mobile.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log('PASS: 12 reference-style terms, two columns, SVG icons, unchanged/escaped legal copy, editable footer + legacy defaults, finance parity, A4/normal-flow/mobile fit, real one-page PDF and customer view. No production calls.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
