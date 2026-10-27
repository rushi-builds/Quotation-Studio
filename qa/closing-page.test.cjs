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
  assert.equal(await page.locator('#v_clThankNote').textContent(),'For considering us for your solar journey.');
  assert.equal(await page.locator('#v_clThankMessage').textContent(),'');
  assert.equal(await page.locator('#v_clThankMessage').evaluate(e=>getComputedStyle(e).display),'none');
  assert.equal(await page.locator('.closing-wave-caption').count(),0,'remove the extra footer slogan, not the wave artwork');

  assert.equal(await page.locator('#v_clNext .next-item').count(),4);
  assert((await page.locator('#v_clThankNote').textContent()).includes('For considering us for your solar journey.'));
  assert.equal(await page.locator('#v_clNext .closing-input-icon svg').count(),4);
  assert.equal(await page.locator('.closing-company-heading #v_clCompanyName').count(),1);
  assert(await page.locator('#v_clCompanyName').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=16));
  assert(await page.locator('#v_clDiscuss').evaluate(e=>getComputedStyle(e).backgroundImage.includes('linear-gradient')),'reference orange feedback pill');
  assert.equal(await page.locator('#v_clWhatsApp').evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(32, 165, 114)','reference green WhatsApp outline');
  assert.equal(await page.locator('.closing-action-arrow').count(),2);
  assert(await page.locator('.closing-actions').evaluate(row=>{const [a,b]=[...row.querySelectorAll('a')].map(e=>e.getBoundingClientRect());return a.width===b.width&&a.height===b.height&&a.width===256&&a.height===48;}),'both CTA boxes have exactly the same size');
  const badges=await page.locator('.closing-input-number').evaluateAll(nodes=>nodes.map(e=>({color:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundImage})));
  assert.equal(badges[1].color,'rgb(120, 100, 155)');assert.equal(badges[3].color,badges[1].color);assert.equal(badges[0].color,badges[2].color);assert.notEqual(badges[0].bg,badges[1].bg);
  await page.waitForFunction(()=>document.getElementById('img_closing').complete&&document.getElementById('img_closing').naturalWidth>0);
  assert(await page.locator('#img_closing').evaluate(img=>img.src.includes('closing-solar-cinematic-4k.jpg')&&img.naturalWidth===4096&&img.naturalHeight===2304),'dedicated 4K-size illustrative closing image');
  assert.equal(await page.locator('#v_clNext a,#v_clNext button').count(),0,'static input rows have no fake actions');
  assert.equal(await page.locator('#closingWaveNavy stop').first().getAttribute('stop-color'),'#18495a');
  assert.equal(await page.locator('#v_clFooterValues li svg').count(),4);
  assert.equal(await page.locator('.closing-wave-leaf path').count(),4,'restore the original flowing footer with leaf line-art');
  assert.equal(await page.locator('.closing-wave-sun').count(),0);
  assert(await page.locator('.closing-wave-lettering').evaluate(image=>{
   const r=image.getBoundingClientRect(),wave=image.closest('.closing-wave').getBoundingClientRect(),icons=document.getElementById('v_clFooterValues').getBoundingClientRect();
   return image.complete&&image.naturalWidth===191&&image.naturalHeight===74&&r.top>=wave.top&&r.bottom<=icons.top&&r.left>=wave.left&&r.right<wave.left+180;
  }),'the supplied transparent lettering fits the left wave without covering the icons');

  assert(await page.locator('#v_clFooterValues').evaluate(e=>{
   const s=getComputedStyle(e);return s.backgroundImage==='none'&&s.backgroundColor==='rgba(0, 0, 0, 0)'&&s.borderTopWidth==='0px'&&s.borderRadius==='0px'&&s.boxShadow==='none'&&getComputedStyle(e.firstElementChild).borderRightWidth==='0px';
  }),'icons must be free-standing: no square/card background, border, rounded panel or shadow');

  assert(await page.locator('#v_clThankHeading').evaluate(e=>{const s=getComputedStyle(e);return s.fontStyle==='normal'&&parseFloat(s.fontSize)>=32&&s.fontFamily.includes('Inter');}),'thank-you is larger and uses the readable body typeface, not a third italic style');
  assert(await page.locator('#v_clThankNote').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=12));
  const footerFallback=await page.evaluate(()=>{
   const keys=['footerReliable','footerTeam','footerQuality','footerValue'],saved=keys.map(k=>CONTENT.pageClosing[k]);
   keys.forEach(k=>delete CONTENT.pageClosing[k]);Render.renderAll();
   const labels=[...document.querySelectorAll('.closing-footer-value-text')].map(e=>e.textContent);
   keys.forEach((k,i)=>CONTENT.pageClosing[k]=saved[i]);Render.renderAll();return labels;
  });
  assert.deepEqual(footerFallback,['Reliability','Experience','Quality','Long-term value'],'older saved quotations receive safe defaults');
  assert(await page.evaluate(()=>{
   Editor.build();
   const field=[...document.querySelectorAll('#advContainer .field')].find(e=>e.querySelector('label')?.textContent==='Footer value 1').querySelector('textarea');
   const original=field.value;field.value='<b>Carefully</b>\nPlanned';field.dispatchEvent(new Event('input',{bubbles:true}));
   const rendered=document.querySelector('.closing-footer-value-text');
   const safe=CONTENT.pageClosing.footerReliable===field.value&&rendered.textContent===field.value&&!rendered.querySelector('b');
   field.value=original;field.dispatchEvent(new Event('input',{bubbles:true}));return safe;
  }),'footer labels stay live-editable and user text is escaped');

  assert.equal(await page.locator('#pageClosing .closing-steps li,#pageClosing .icon-chip').count(),0);
  assert(await page.locator('#pageClosing').evaluate(p=>{
   const title=p.querySelector('#v_clHeading'),style=getComputedStyle(p);
   return style.backgroundColor==='rgb(252, 250, 246)' && getComputedStyle(title).fontFamily.includes('Georgia') && title.querySelector('em')?.textContent==='Greener' && p.querySelector('.closing-brand img').getAttribute('src')==='assets/images/ktm-logo-light.png' && p.querySelectorAll('.closing-values>div').length===3 && !!p.querySelector('.closing-wave svg');
  }),'approved reference direction: ivory, navy serif, orange emphasis, original light-surface logo and quiet wave');
  assert(await page.locator('.closing-banner').evaluate(b=>getComputedStyle(b).backgroundSize==='cover' && b.style.backgroundImage.includes(document.getElementById('img_closing').src)),'PDF and browser must use an undistorted cover background from the selected closing photo');
  assert.equal(await page.locator('.closing-banner').evaluate(b=>getComputedStyle(b).borderBottomLeftRadius),'0px','remove the unwanted circular photo edge');
  assert(await page.locator('.closing-wave').evaluate(w=>getComputedStyle(w).backgroundImage==='none' && !w.querySelector('image,img:not(.closing-wave-lettering)') && !w.style.backgroundImage),'abstract footer must not repeat the panel photograph');
  assert(await page.locator('.closing-card').evaluate(c=>getComputedStyle(c).backgroundImage.includes('linear-gradient') && getComputedStyle(c).borderTopWidth==='1px'),'glass panel must retain a PDF-safe surface, not depend on backdrop blur');

  assert((await page.locator('#v_clPhone').getAttribute('href')).startsWith('tel:+91'));
  assert((await page.locator('#v_clEmail').getAttribute('href')).startsWith('mailto:enquiry@'));
  assert.equal(await page.locator('#v_clWebsite').getAttribute('href'),'https://www.ktmenergyexperts.com/');
  assert.equal(await page.locator('#v_clDiscuss').getAttribute('href'),null,'unpublished drafts cannot collect feedback');
  await page.evaluate(()=>{window.open=url=>{window.__feedbackOpened=url;};});
  assert(await page.locator('#v_clDiscuss').isVisible(),'unpublished builder still exposes form preview');
  await page.locator('#v_clDiscuss').click();
  assert.equal(await page.evaluate(()=>window.__feedbackOpened),'feedback-preview.html');
  await page.locator('#engineeringViewBtn').click();
  assert.equal(await page.evaluate(()=>window.__feedbackOpened),'feedback-preview.html');
  assert((await page.locator('#statusMsg').textContent()).includes('Publish a secure customer link'));
  assert(await page.locator('#v_clWhatsApp').evaluate(e=>e.href.startsWith('https://wa.me/')));
  const finance=await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState)));
  const publicUrl='https://example.com/portal.html?t=abababababababababababababababababababababababab';
  await page.evaluate(url=>{shareUrl.value=url;Render.renderAll();__qsSaveNow();},publicUrl);
  assert.equal(await page.locator('#v_clDiscuss').getAttribute('href'),publicUrl+'#proposalFeedback');
  assert.equal(await page.locator('#closingLinkHint').count(),0,'removed instruction line stays removed');
  await page.locator('#engineeringViewBtn').click();
  assert.equal(await page.evaluate(()=>window.__feedbackOpened),publicUrl+'#proposalFeedback','builder shortcut uses the same real portal, not the retired local request');
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
  assert(await proof.locator('#v_clFooterValues').evaluate(strip=>{
   const box=strip.getBoundingClientRect(),wave=strip.closest('.closing-wave').getBoundingClientRect();
   return box.top>=wave.top&&box.bottom<=wave.bottom&&[...strip.querySelectorAll('li svg')].every(icon=>{const r=icon.getBoundingClientRect();return r.width===25&&r.height===25&&r.left>=box.left&&r.right<=box.right&&r.top>=box.top&&r.bottom<=box.bottom;});
  }),'the free-standing icons fit the restored wave and retain their own SVG geometry');
  const shots=path.join(__dirname,'shots','closing-page');fs.mkdirSync(shots,{recursive:true});
  await proof.locator('#pageClosing').screenshot({path:path.join(shots,'closing-a4.png')});await proof.screenshot({path:path.join(shots,'closing-footer.png'),clip:{x:0,y:945,width:794,height:178}});await proof.close();
  console.log('PASS: larger readable thank-you, editable free-standing icons on the original wave, ivory/navy reference, original logo + 4K-size closing image, live contact + engineering blocks and A4 fit');

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
  for(const url of [publicUrl+'#proposalFeedback','https://wa.me/','https://www.ktmenergyexperts.com/'])assert(pdf.includes(url),'real PDF link annotation missing: '+url);
  assert(pdf.includes('/Subtype /Link'));
  fs.writeFileSync(path.join(shots,'closing-links.pdf'),pdf,'binary');
  console.log('PASS: real single-page PDF has website, WhatsApp and secure feedback link annotations; export engine unchanged');

  // Local customer view preserves the PDF markup and uses transferable feedback links.
  const id=await page.evaluate(()=>Proposals.activeId()),customer=await context.newPage();customer.on('pageerror',e=>errors.push(e.message));
  await customer.goto(base+'/share.html?p='+encodeURIComponent(id));await customer.waitForFunction(()=>window.Render?.lastState&&document.querySelector('#v_clDiscuss[href]'));
  assert.equal(await customer.locator('#v_clDiscuss').getAttribute('href'),publicUrl+'#proposalFeedback','download from local viewer also uses a transferable public URL');
  assert.equal(await customer.locator('#engineeringRequestForm').isVisible(),false,'local-only service request is retired');
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
  await portal.route('**/api/**',route=>route.fulfill({status:new URL(route.request().url()).pathname==='/api/portal/proposal'?200:404,contentType:'application/json',body:JSON.stringify({snapshot,access:{feedbackAvailable:true}})}));
  await portal.goto(base+'/portal.html?t=abababababababababababababababababababababababab');
  await portal.waitForFunction(()=>window.Render?.lastState&&!document.querySelector('#portalMain').hidden);
  assert.equal(await portal.locator('#pageClosing').evaluate(e=>getComputedStyle(e).display),'flex');
  assert.equal(await portal.locator('#pageClosing .sign-box').count(),0);
  assert.equal(await portal.locator('#v_clDiscuss').getAttribute('href'),portal.url()+'#proposalFeedback');
  await portal.locator('#v_clDiscuss').click();await portal.waitForFunction(()=>location.hash==='#proposalFeedback');
  assert.equal(await portal.locator('#engineeringRequestForm').count(),0);
  assert.equal(await portal.locator('[name=proposalRating]').count(),5);await portal.close();

  // QR/gallery, unsafe input handling and automatic Advanced Edit continuation.
  await page.evaluate(()=>{galleryUrl.value='https://example.com/projects';Render.renderAll();});
  await page.evaluate(async()=>{let p;do{p=Experience.whenReady();await p;}while(p!==Experience.whenReady());});
  assert(await page.locator('#closingGallery').isVisible());
  assert(await page.locator('#pageClosing').evaluate(p=>{const qr=p.querySelector('#closingGallery').getBoundingClientRect(),h=p.querySelector('.closing-hero h2').getBoundingClientRect(),card=p.querySelector('.closing-card').getBoundingClientRect();return qr.left>h.right&&qr.bottom<card.top;}));
  await page.evaluate(()=>{companyWebsite.value='javascript:alert(1)';companyEmail.value='bad\naddress';companyPhone.value='not a phone';Render.renderAll();});
  for(const id of ['v_clWebsite','v_clEmail','v_clPhone'])assert.equal(await page.locator('#'+id).getAttribute('href'),null);
  assert.equal(await page.locator('#v_clWhatsApp').isVisible(),false);
  assert.equal(await page.locator('#v_clDiscuss').getAttribute('href'),publicUrl+'#proposalFeedback');
  await page.evaluate(()=>{companyWebsite.value='www.ktmenergyexperts.com';companyEmail.value='enquiry@ktmenergyexperts.com';companyPhone.value='+91 93094 86769';galleryUrl.value='';Render.renderAll();DocumentStudio.addTextBlock('pageClosing','Additional project discussion','Project-specific review notes. '.repeat(160));});
  assert(await page.locator('[id^="pageClosing-continuation-"]').count()>0);
  assert.deepEqual(await page.evaluate(()=>DocumentStudio.errors('full')),[]);
  assert.equal(await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState))),finance);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log('PASS: local/published feedback-link routing, mobile widths, retained gallery, unsafe URL rejection and automatic A4 continuation; no cloud writes/runtime errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
