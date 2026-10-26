/* Closing-page UI + one-page real PDF proof. Local intercepted API only.
 * Serve repo at QA_BASE (default :8080); no production account or message sent. */
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
  assert.equal(await page.locator('#pageClosing .accept-block,#pageClosing .sign-box,#pageClosing .engineering-steps').count(),0);
  assert.equal(await page.locator('#v_clHeading').textContent(),'Together for a Greener Tomorrow.');
  assert.equal(await page.locator('#v_clThankHeading').textContent(),'Thank you.');
  assert.equal(await page.locator('#v_clNext .next-item').count(),4);
  assert((await page.locator('#v_clThankNote').textContent()).includes('For considering us for your solar journey.'));
  assert.equal(await page.locator('#v_clNext .closing-input-icon svg').count(),4);
  assert.equal(await page.locator('#closingWaveNavy stop').first().getAttribute('stop-color'),'#18495a');
  assert.equal(await page.locator('.closing-wave-leaf path').count(),4,'footer keeps the delicate three-leaf line-art and veins');

  assert.equal(await page.locator('#pageClosing .closing-steps li,#pageClosing .icon-chip').count(),0);
  assert(await page.locator('#pageClosing').evaluate(p=>{
   const title=p.querySelector('#v_clHeading'),style=getComputedStyle(p);
   return style.backgroundColor==='rgb(252, 250, 246)' && getComputedStyle(title).fontFamily.includes('Georgia') && title.querySelector('em')?.textContent==='Greener' && p.querySelector('.closing-brand img').getAttribute('src')==='assets/images/ktm-logo-light.png' && p.querySelectorAll('.closing-values>div').length===3 && !!p.querySelector('.closing-wave svg');
  }),'approved reference direction: ivory, navy serif, orange emphasis, original light-surface logo and quiet wave');
  assert(await page.locator('.closing-banner').evaluate(b=>getComputedStyle(b).backgroundSize==='cover' && b.style.backgroundImage.includes(document.getElementById('img_closing').src)),'PDF and browser must use an undistorted cover background from the original photo');
  assert.equal(await page.locator('.closing-banner').evaluate(b=>getComputedStyle(b).borderBottomLeftRadius),'0px','remove the unwanted circular photo edge');
  assert(await page.locator('.closing-wave').evaluate(w=>getComputedStyle(w).backgroundImage==='none' && !w.querySelector('image,img') && !w.style.backgroundImage),'abstract footer must not repeat the panel photograph');
  assert(await page.locator('.closing-card').evaluate(c=>getComputedStyle(c).backgroundImage.includes('linear-gradient') && getComputedStyle(c).borderTopWidth==='1px'),'glass panel must retain a PDF-safe surface, not depend on backdrop blur');

  assert((await page.locator('#v_clPhone').getAttribute('href')).startsWith('tel:+91'));
  assert((await page.locator('#v_clEmail').getAttribute('href')).startsWith('mailto:enquiry@'));
  assert.equal(await page.locator('#v_clWebsite').getAttribute('href'),'https://www.ktmenergyexperts.com/');
  assert((await page.locator('#v_clDiscuss').getAttribute('href')).startsWith('https://wa.me/'),'unpublished PDF must not point at a browser-only draft');
  const finance=await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState)));
  const publicUrl='https://example.com/portal.html?t=closing-fixture';
  await page.evaluate(url=>{shareUrl.value=url;Render.renderAll();__qsSaveNow();},publicUrl);
  assert.equal(await page.locator('#v_clDiscuss').getAttribute('href'),publicUrl+'#shareAcceptWrap');
  assert.equal(await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState))),finance);

  // Existing saved paragraphs remain authored, not migrated or silently cut.
  const legacyFit=await page.evaluate(()=>{
   const current=CONTENT.pageClosing.thankMessage;
   const old='We appreciate the opportunity to be part of your solar journey. At {company}, we look forward to planning a reliable, efficient solution for your property.';
   CONTENT.pageClosing.thankMessage=old;Render.renderAll();
   const p=pageClosing,foot=p.querySelector('footer').getBoundingClientRect(),fits=p.scrollHeight<=1124&&[...p.children].filter(n=>!n.matches('footer,.closing-banner')).every(n=>n.getBoundingClientRect().bottom<=foot.top-2);
   CONTENT.pageClosing.thankMessage=current;Render.renderAll();return fits;
  });
  assert(legacyFit,'the larger thank-you note must still fit with the older saved paragraph');

  // Check intrinsic A4 geometry, not just a scaled browser screenshot.
  const markup=await page.locator('#pageClosing').evaluate(e=>e.outerHTML),proof=await context.newPage({viewport:{width:794,height:1123}});
  await proof.setContent('<base href="'+base+'/"><link rel="stylesheet" href="assets/css/app.css"><link rel="stylesheet" href="assets/css/experience.css"><link rel="stylesheet" href="assets/css/document-studio.css"><link rel="stylesheet" href="assets/css/closing.css">'+markup);
  await proof.evaluate(()=>document.fonts.ready);await proof.waitForFunction(()=>[...document.images].every(i=>i.complete));await proof.locator('.page').evaluate(e=>e.style.transform='none');
  assert(await proof.locator('#pageClosing').evaluate(p=>{const foot=p.querySelector('footer').getBoundingClientRect(),children=[...p.children].filter(n=>!n.matches('footer,.closing-banner'));return p.scrollHeight<=1124&&p.scrollWidth<=p.clientWidth&&children.every(n=>n.getBoundingClientRect().bottom<=foot.top-2);}));
  const shots=path.join(__dirname,'shots','closing-page');fs.mkdirSync(shots,{recursive:true});
  await proof.locator('#pageClosing').screenshot({path:path.join(shots,'closing-a4.png')});await proof.close();
  console.log('PASS: ivory reference layout, navy/orange serif heading, original logo/photo, live contact + engineering blocks, no signatures, working contact URLs and A4 fit');

  // Actual html2canvas + jsPDF, with only the save-to-disk replaced. Limit the
  // fixture to this page; do not claim to have re-exported the entire report.
  const captured=await page.evaluate(async()=>{
   const Native=jspdf.jsPDF,visible=Render.lastVisible.slice(),capture=html2canvas;
   let raster='';window.html2canvas=async(...args)=>{const canvas=await capture(...args);raster=canvas.toDataURL('image/png');return canvas;};
   let output='';jspdf.jsPDF=function(...args){const pdf=new Native(...args);pdf.save=()=>{output=pdf.output();};return pdf;};
   try{Render.lastVisible.splice(0,Render.lastVisible.length,...visible.filter(p=>p.id==='pageClosing'));await Exporter.exportPdf(()=>{},{format:'full'});return {pdf:output,raster};}
   finally{jspdf.jsPDF=Native;window.html2canvas=capture;Render.lastVisible.splice(0,Render.lastVisible.length,...visible);}
  });
  const pdf=captured.pdf;
  fs.writeFileSync(path.join(shots,'closing-pdf-raster.png'),Buffer.from(captured.raster.split(',')[1],'base64'));
  assert.equal((pdf.match(/\/Type \/Page\b/g)||[]).length,1);
  for(const url of [publicUrl+'#shareAcceptWrap','https://wa.me/','https://www.ktmenergyexperts.com/'])assert(pdf.includes(url),'real PDF link annotation missing: '+url);
  assert(pdf.includes('/Subtype /Link'));
  fs.writeFileSync(path.join(shots,'closing-links.pdf'),pdf,'binary');
  console.log('PASS: real single-page PDF has website, WhatsApp and public request-form link annotations; export engine unchanged');

  // Local customer view uses the same markup and jumps to its real request hub.
  const id=await page.evaluate(()=>Proposals.activeId()),customer=await context.newPage();customer.on('pageerror',e=>errors.push(e.message));
  await customer.goto(base+'/share.html?p='+encodeURIComponent(id));await customer.waitForFunction(()=>window.Render?.lastState&&document.querySelector('#v_clDiscuss[href]'));
  assert.equal(await customer.locator('#v_clDiscuss').getAttribute('href'),publicUrl+'#shareAcceptWrap','download from local viewer also uses a transferable public URL');
  await customer.locator('#v_clDiscuss').click();await customer.waitForFunction(()=>location.hash==='#shareAcceptWrap'&&document.activeElement.id==='requestStage');
  assert.equal(await customer.locator('#engineeringRequestForm').count(),1);
  assert.equal(await customer.locator('#pageClosing .sign-box').count(),0);
  for(const width of [390,360]){
   await customer.setViewportSize({width,height:900});
   await customer.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const layout=await customer.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+2&&e.getClientRects().length).slice(0,8).map(e=>[e.id,e.className,e.getBoundingClientRect().right])}));
   assert(layout.scroll<=layout.width,JSON.stringify(layout));
  }
  await customer.close();
  // Frozen published snapshots use portal.html, not the browser-only viewer.
  const snapshot=await page.evaluate(()=>({form:StateStore.collectForm(),content:CONTENT}));
  const portal=await context.newPage();portal.on('pageerror',e=>errors.push(e.message));
  await portal.route('**/api/**',route=>route.fulfill({status:new URL(route.request().url()).pathname==='/api/portal/proposal'?200:404,contentType:'application/json',body:JSON.stringify({snapshot})}));
  await portal.goto(base+'/portal.html?t=closing-fixture');
  await portal.waitForFunction(()=>window.Render?.lastState&&!document.querySelector('#portalMain').hidden);
  assert.equal(await portal.locator('#pageClosing').evaluate(e=>getComputedStyle(e).display),'flex');
  assert.equal(await portal.locator('#pageClosing .sign-box').count(),0);
  assert.equal(await portal.locator('#v_clDiscuss').getAttribute('href'),portal.url()+'#shareAcceptWrap');
  await portal.locator('#v_clDiscuss').click();await portal.waitForFunction(()=>location.hash==='#shareAcceptWrap');
  assert(await portal.locator('#engineeringRequestForm').isVisible());await portal.close();

  // QR/gallery, unsafe input handling and automatic Advanced Edit continuation.
  await page.evaluate(()=>{galleryUrl.value='https://example.com/projects';Render.renderAll();});
  await page.evaluate(async()=>{let p;do{p=Experience.whenReady();await p;}while(p!==Experience.whenReady());});
  assert(await page.locator('#closingGallery').isVisible());
  assert(await page.locator('#pageClosing').evaluate(p=>{const qr=p.querySelector('#closingGallery').getBoundingClientRect(),h=p.querySelector('.closing-hero h2').getBoundingClientRect(),card=p.querySelector('.closing-card').getBoundingClientRect();return qr.left>h.right&&qr.bottom<card.top;}));
  await page.evaluate(()=>{companyWebsite.value='javascript:alert(1)';companyEmail.value='bad\naddress';companyPhone.value='not a phone';Render.renderAll();});
  for(const id of ['v_clWebsite','v_clEmail','v_clPhone'])assert.equal(await page.locator('#'+id).getAttribute('href'),null);
  assert.equal(await page.locator('#v_clWhatsApp').isVisible(),false);
  assert.equal(await page.locator('#v_clDiscuss').getAttribute('href'),publicUrl+'#shareAcceptWrap');
  await page.evaluate(()=>{companyWebsite.value='www.ktmenergyexperts.com';companyEmail.value='enquiry@ktmenergyexperts.com';companyPhone.value='+91 93094 86769';galleryUrl.value='';Render.renderAll();DocumentStudio.addTextBlock('pageClosing','Additional project discussion','Project-specific review notes. '.repeat(160));});
  assert(await page.locator('[id^="pageClosing-continuation-"]').count()>0);
  assert.deepEqual(await page.evaluate(()=>DocumentStudio.errors('full')),[]);
  assert.equal(await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState))),finance);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log('PASS: local/published Customer view request jumps, mobile widths, retained gallery, unsafe URL rejection and automatic A4 continuation; no cloud writes/runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
