/* Public QR destinations, isolated scenarios and both document formats. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require('puppeteer-core'),jsQR=require('jsqr');
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('  ✓ '+name);};
(async()=>{
 const {default:chromium}=await import('@sparticuz/chromium');
 const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
 try{
 const base=process.env.QA_BASE||'http://127.0.0.1:8080',shots=path.join(__dirname,'shots');fs.mkdirSync(shots,{recursive:true});fs.mkdirSync(path.join(shots,'experience'),{recursive:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewport({width:1440,height:1200});await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});await page.evaluate(()=>document.fonts.ready);
 async function edit(fields){await page.evaluate(fields=>{for(const [id,v] of Object.entries(fields)){const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));}},fields);await page.evaluate(()=>Experience.whenReady());}
 check('blank gallery destination never auto-encodes a protected preview URL',await page.evaluate(()=>Experience.galleryUrl({galleryUrl:''})===''&&document.getElementById('closingGallery').hidden));
 check('new PDF selector defaults to the full report',await page.$eval('#pdfFormat',e=>e.value==='full'));
 check('public destination validator rejects local, credentialled and browser-local proposal links',await page.evaluate(()=>['javascript:alert(1)','https://localhost/gallery','https://127.0.0.1/','https://user:pass@example.com/','https://example.com/share.html?p=abc','https://10.0.0.1/gallery'].every(u=>!Experience.publicUrl(u))));
 await edit({galleryUrl:'https://example.com/solar-projects?category=rooftop'});
 check('closing page QR is visible and linked to entered URL',await page.$eval('#closingGallery',e=>!e.hidden && e.href==='https://example.com/solar-projects?category=rooftop'));
 const readQR=async(p,selector)=>{const image=await p.$eval(selector,c=>({width:c.width,height:c.height,data:Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)}));return jsQR(new Uint8ClampedArray(image.data),image.width,image.height)?.data;};
 check('actual QR pixels decode to exactly the supplied public gallery URL',await readQR(page,'#closingGallery canvas')==='https://example.com/solar-projects?category=rooftop');
 check('gallery card and headline do not collide',await page.$eval('#pageClosing',e=>{const a=e.querySelector('.gallery-card').getBoundingClientRect(),b=e.querySelector('.closing-hero h2').getBoundingClientRect();return a.left>b.right && a.bottom<e.querySelector('.closing-card').getBoundingClientRect().top;}));
 await edit({galleryUrl:'javascript:alert(1)'});check('invalid edits hide QR and remove previous destination',await page.$eval('#closingGallery',e=>e.hidden && !e.hasAttribute('href')));
 await edit({galleryUrl:'https://example.com/updated-gallery',capacity:'12.5',moduleWattage:'620',inverterKw:'10',tariff:'8.75'});
 check('QR redraw replaces old destination',await readQR(page,'#closingGallery canvas')==='https://example.com/updated-gallery');
 const expected=await page.evaluate(()=>{const f=Finance.compute(Render.lastState);return {net:Finance.fmtINR(f.netInvestment),annual:Finance.fmtNum(f.annualGen),lifetime:Finance.fmtINRshort(f.lifetimeSaving),module:f.moduleCount};});
 await page.evaluate(()=>window.__power=Experience.buildPowerPages(Render.lastState));
 check('Power Proposal is exactly seven dedicated pages',await page.$$eval('.pdf-snapshot .power-page',els=>els.length===7));
 check('summary reflects energy/equipment while pricing stays on Investment',await page.$eval('#powerPage1',(e,x)=>!e.textContent.includes('₹')&&e.textContent.includes(x.annual)&&e.textContent.includes(x.module+' × 620')&&e.textContent.includes('10 kW inverter'),expected));
 check('investment and cumulative value match the same saved quotation',await page.evaluate(x=>powerPage6.textContent.includes(x.net)&&powerPage5.textContent.includes(x.lifetime),expected));
 check('brief includes subsidy qualification, exclusions and proposal validity',await page.evaluate(()=>powerPage6.textContent.includes('not approved')&&powerPage7.textContent.includes('Additional scope')&&powerPage7.textContent.includes('valid until')&&powerPage7.textContent.includes('not an installation order')));
 /* A power page is a fixed A4 box with overflow hidden whose own bottom
    padding is part of scrollHeight (1123 + padding), so scrollHeight alone
    reads 1130 on a page that is completely inside the sheet. Measure the same
    three things Exporter's guard now measures - deepest painted content
    against the sheet edge, clearance above the footer, no sideways overflow -
    and name the deepest element so a failure says what is sticking out. */
 async function powerLayout(){return page.$$eval('.power-page',els=>els.map(e=>{const r=e.getBoundingClientRect(),foot=e.querySelector('footer'),body=foot.previousElementSibling,f=foot.getBoundingClientRect();let deepest='(none)',low=-Infinity;for(const n of e.querySelectorAll('*')){if(n.closest('footer'))continue;const nb=n.getBoundingClientRect();if(!nb.width&&!nb.height)continue;if(nb.bottom>low){low=nb.bottom;deepest=n.tagName.toLowerCase()+(n.id?'#'+n.id:'')+(typeof n.className==='string'&&n.className.trim()?'.'+n.className.trim().split(/\s+/).join('.'):'');}}return {id:e.id,sheet:e.clientHeight,h:e.scrollHeight,deepest:deepest,deep:Math.round(low-r.top),gap:f.top-body.getBoundingClientRect().bottom,fit:e.scrollWidth<=e.clientWidth};}));}
 let layout=await powerLayout();console.log('Power layout',layout);
 /* Page 3 is page 6 carried whole, so its own footer IS the sheet's footer and sits
    where page 6 puts it. It has no report foot to clear, so the "clearance above my
    footer" rule does not apply to it - what does apply is that the carried sheet must
    not spill past the page, which the deep measurement already covers. Judging it by
    the report's footer rule failed a page that is, by design, identical to the one it
    copies. */
 const fits=x=>x.deep<=x.sheet&&(x.id==='powerPage3'||x.gap>=4)&&x.fit;
 const badPage=layout.filter(x=>!fits(x));
 check('all seven power pages fit A4 without footer overlap'+(badPage.length?' ['+badPage.map(x=>x.id+': deepest='+x.deepest+'@'+x.deep+' of '+x.sheet+' gap='+Math.round(x.gap)+' fit='+x.fit).join(' | ')+']':''),badPage.length===0);
 /* Page 3 prints page 6's card block, and "prints it the same" is a claim about
    pixels, not about markup. Every failure in this area came from copying the right
    markup into the wrong box: a narrower column wrapped the values onto extra lines,
    the cards grew, and the bottom one was clipped. Source-string checks cannot see
    any of that, so this compares the two pages element by element in a real browser.
    If page 3 and page 6 ever disagree about a card's width, height or type size, the
    requirement is broken and this says so. */
 const specParity=await page.evaluate(()=>{
   const read=(host)=>[...host.querySelectorAll('.pv2-card')].map(c=>{
     const b=c.getBoundingClientRect();
     const v=c.querySelector('.pv2-v');
     const cs=v?getComputedStyle(v):null;
     return {w:Math.round(b.width),h:Math.round(b.height),
             font:cs?cs.fontSize:'',pad:cs?cs.paddingTop:''};
   });
   const sheet=document.querySelector('#pageTechSpec');
   const host=Experience.buildPowerPages(Render.lastState);
   const p3=host.querySelector('#powerPage3');
   const sheetCards=read(sheet), pageCards=read(p3);
   const blk=p3.querySelector('.power-spec-sheet');
   const out={sheetCards,pageCards,
     clipped:blk.style.overflow==='hidden',
     scaled:!!blk.style.transform,
     fits:p3.dataset.specFits,
     cards:p3.querySelectorAll('.pv2-card').length,
     badges:p3.querySelectorAll('.pv2-brand').length,
     photos:p3.querySelectorAll('.pv2-photo img').length,
     /* How much of each photograph actually survives the tile. */
     crops:[...sheet.querySelectorAll('.pv2-card')].map(c=>{
       const ph=c.querySelector('.pv2-photo'), im=ph&&ph.querySelector('img');
       if(!ph||!im) return null;
       const b=ph.getBoundingClientRect();
       const natural=im.naturalWidth&&im.naturalHeight?im.naturalWidth/im.naturalHeight:0;
       const tile=b.width/b.height;
       const fit=getComputedStyle(im).objectFit;
       const rows=c.querySelector('.pv2-rows');
       return {kind:(c.className.match(/is-(\w+)/)||[])[1],
         tile:+tile.toFixed(2), natural:+natural.toFixed(2), fit,
         tileH:Math.round(b.height), rowsH:rows?Math.round(rows.getBoundingClientRect().height):0,
         cardH:Math.round(c.getBoundingClientRect().height),
         kept:fit==='contain'?1:(natural&&tile?Math.min(natural/tile,tile/natural):1)};
     }).filter(Boolean),
     footNum:p3.querySelector('.pg-foot-page')?.textContent.trim()||'',
     footHas15:/of 15/.test(p3.querySelector('.pg-foot')?.textContent||'')};
   host.remove();
   return out;
 });
 /* The carried footer is page 6's design, but not its page number: a seven-page
    document that says "Page 6 of 15" is simply lying to the customer. */
 check('the carried footer prints this document\'s page number, not the report\'s ['+specParity.footNum+']',
   specParity.footNum==='Page 3 of 7'&&!specParity.footHas15);
 /* A studio shot squeezed into a tile of a different shape loses its edges. Card 04
    is the one that lost the most: the helmet, the pen and the drawings all sit near
    the frame, so a third of the picture went and it read as a bad crop. Every card
    now keeps at least 85% of its photograph, and card 04 keeps all of it. */
 check('every card photograph keeps its subject ['+specParity.crops.map(c=>c.kind+' '+Math.round(c.kept*100)+'%').join(', ')+']',
   specParity.crops.every(c=>c.kept>=0.85));
 /* Two things must both be true of card 04, and the first two attempts at this each
    satisfied one of them: the card keeps the size the sheet gives it (growing it made
    it taller than its neighbours), and the photograph fills its tile with nothing
    cropped (fitting it inside left a blank band at each side). The tile column is
    shaped like the photograph, so the ratio matches and both hold at once. */
 check('the engineering-design photograph fills its tile with nothing cropped ['+
   JSON.stringify(specParity.crops.find(c=>c.kind==='design'))+']',
   (()=>{const d=specParity.crops.find(c=>c.kind==='design');
     return d && d.kept>=0.99 && Math.abs(d.tile-d.natural)<=0.02;})());
 check('and the card keeps its size - the picture never stretches the sheet',
   (()=>{const d=specParity.crops.find(c=>c.kind==='design');
     return d && Math.abs(d.tileH-d.rowsH)<=2;})());
 check('page 3 carries all four cards, with their badges and photographs',
   specParity.cards===4&&specParity.badges>=3&&specParity.photos===4);
 check('page 3 cards are the same size and type as page 6 ['+
   JSON.stringify(specParity.sheetCards.map(c=>c.w+'x'+c.h+'@'+c.font))+' vs '+
   JSON.stringify(specParity.pageCards.map(c=>c.w+'x'+c.h+'@'+c.font))+']',
   specParity.sheetCards.length===specParity.pageCards.length &&
   specParity.sheetCards.every((s,i)=>{
     const p=specParity.pageCards[i];
     return Math.abs(s.w-p.w)<=1 && Math.abs(s.h-p.h)<=1 && s.font===p.font && s.pad===p.pad;
   }));
 check('page 3 neither clips nor scales the block - it fits, and says so',
   !specParity.clipped&&!specParity.scaled&&specParity.fits==='1');
 check('only three payment milestones are printed and all values are finite',await page.$eval('#powerPage6',e=>e.querySelectorAll('.power-pay .power-metric').length===3&&!/undefined|NaN/.test(e.textContent)));
 const rasterQR=await page.$eval('#powerPage2',async el=>{
   const c=await html2canvas(el,{scale:2,logging:false,backgroundColor:'#fff',onclone:d=>d.body.classList.add('qs-pdf-capture')});
   const jpg=new Image();jpg.src=c.toDataURL('image/jpeg',.92);await jpg.decode();
   const clean=document.createElement('canvas');clean.width=c.width;clean.height=c.height;const ctx=clean.getContext('2d');ctx.drawImage(jpg,0,0);
   const r=el.querySelector('.power-gallery canvas').getBoundingClientRect(),p=el.getBoundingClientRect();
   const crop=ctx.getImageData(Math.round((r.x-p.x)*2),Math.round((r.y-p.y)*2),Math.round(r.width*2),Math.round(r.height*2));
   return {w:crop.width,h:crop.height,data:Array.from(crop.data),white:Array.from(ctx.getImageData(5,500,1,1).data)};
 });
 check('QR survives the exact PDF JPEG compression path',jsQR(new Uint8ClampedArray(rasterQR.data),rasterQR.w,rasterQR.h)?.data==='https://example.com/updated-gallery');
 check('printed sheet background stays white, without screen shadows',rasterQR.white.slice(0,3).every(v=>v>=250));
 check('short PDF QR decodes to the same configured destination',await readQR(page,'.power-gallery canvas')==='https://example.com/updated-gallery');
 const proof=await browser.newPage();await proof.setViewport({width:794,height:1124});
 for(const id of ['powerPage1','powerPage5','powerPage6','powerPage7','pageClosing']){
  // Screenshots of canvas-bearing pages are captured directly to retain QR pixels.
  const data=await page.$eval('#'+id,async e=>{const c=await html2canvas(e,{scale:1,logging:false,useCORS:true,backgroundColor:'#ffffff',onclone:doc=>doc.body.classList.add('qs-pdf-capture')});return c.toDataURL();});fs.writeFileSync(path.join(shots,'experience-'+id+'.png'),Buffer.from(data.split(',')[1],'base64'));
 }
 await proof.close();await page.evaluate(()=>window.__power.remove());
 /* The builder's request shortcut belongs to the retired request hub (d835545)
    and now opens the portal feedback preview, never a share.html tab, so
    waiting for that tab only ever timed out. The read-only Customer View this
    section is about is share.html itself, opened directly with the saved
    proposal - exactly the page a customer receives. */
 const shareId=await page.evaluate(()=>{window.__qsSaveNow&&window.__qsSaveNow();return window.Proposals.activeId();});
 check('the builder has a saved proposal to review as a customer',!!shareId);
 const customer=await browser.newPage();customer.on('pageerror',e=>errors.push(e.message));
 await customer.goto(base+'/share.html?p='+encodeURIComponent(shareId),{waitUntil:'networkidle0'});
 await customer.evaluate(()=>document.fonts.ready);
 await customer.waitForSelector('#scenarioTariff',{timeout:20000}).catch(e=>{throw new Error('Customer View never rendered the savings explorer: '+e.message);});
 check('Customer View loads the exact baseline even outside nominal slider range',await customer.$eval('#scenarioTariff',e=>e.value==='8.75'&&+e.min<=8.75));
 const before=await customer.evaluate(()=>({state:JSON.stringify(Render.lastState),storage:JSON.stringify({...localStorage}),cover:document.getElementById('v_coverCapacity').textContent}));
 await customer.$eval('#scenarioTariff',e=>{e.value='18';e.dispatchEvent(new Event('input',{bubbles:true}));});
 check('scenario figures use the same finance engine',await customer.evaluate(()=>{const f=Finance.compute({...Render.lastState,tariff:'18'});return document.getElementById('scenarioSaving').textContent===Finance.fmtINRshort(f.lifetimeSaving)&&document.getElementById('scenarioPayback').textContent===f.payback.toFixed(1)+' years';}));
 check('scenario never changes stored quotation, live cover or baseline state',await customer.evaluate(b=>JSON.stringify(Render.lastState)===b.state&&JSON.stringify({...localStorage})===b.storage&&document.getElementById('v_coverCapacity').textContent===b.cover,before));
 check('saved gallery URL survives Customer View',await readQR(customer,'#closingGallery canvas')==='https://example.com/updated-gallery');
 await customer.evaluate(()=>{window.__power=Experience.buildPowerPages(Render.lastState);});
 check('Power Proposal ignores the exploratory tariff',await customer.$eval('#powerPage5',(e,x)=>e.textContent.includes('₹8.75 per kWh')&&e.textContent.includes(x.lifetime),expected));await customer.evaluate(()=>window.__power.remove());
 await customer.$eval('#scenarioReset',e=>e.click());check('reset restores exact baseline tariff',await customer.$eval('#scenarioTariff',e=>e.value==='8.75'));
 await customer.emulateMediaType('print');check('scenario tool is excluded from print',await customer.$eval('#savingsExplorer',e=>!e.checkVisibility()));await customer.emulateMediaType('screen');
 await customer.setViewport({width:390,height:844});await customer.$eval('#savingsExplorer',e=>e.scrollIntoView({behavior:'instant'}));
 await customer.waitForFunction(()=>document.getElementById('savingsExplorer').getBoundingClientRect().right<=innerWidth+1);
 check('scenario results and controls fit a mobile screen',await customer.$eval('#savingsExplorer',e=>e.scrollWidth<=e.clientWidth));
 await customer.screenshot({path:path.join(shots,'experience-scenario-mobile.png')});
 check('payback labels match the cumulative-savings method without claiming simple payback',await customer.$eval('#savingsExplorer',e=>e.textContent.includes('Estimated payback')&&!e.textContent.includes('simple payback')));
 // Both formats must reject a failed image even though HTMLImageElement.complete
 // is true. Use a deliberately malformed data URI, not a live network dependency.
 const originalPhoto=await page.$eval('#img_solution',e=>{const src=e.src;e.src='data:image/png;base64,AAAA';return src;});
 await page.waitForFunction(()=>document.getElementById('img_solution').complete && !document.getElementById('img_solution').naturalWidth);
 for(const format of ['power','full']) {
   check(format+': already-failed images abort export and clean up the snapshot',await page.evaluate(async format=>{
     try {await Exporter.exportPdf(()=>{},{format});return false;} catch(e){return e.message.includes('image could not be loaded')&&!document.querySelector('.pdf-snapshot');}
   },format));
 }
 await page.$eval('#img_solution',async(e,src)=>{e.src=src;await e.decode();},originalPhoto);
 // Real jsPDF/html2canvas export, with a copy retained for page-count/link checks.
 await page.evaluate(()=>{const Original=jspdf.jsPDF;jspdf.jsPDF=function(...args){const pdf=new Original(...args),save=pdf.save.bind(pdf);pdf.save=name=>{window.__pdf={name,data:pdf.output('datauristring').split(',')[1]};return save(name);};return pdf;};});
 await page.select('#pdfFormat','power');check('download label follows selected format',await page.$eval('#downloadLabel',e=>e.textContent==='Download Power Proposal (7 Pages)'));
 await page.$eval('#custName',e=>{e.value='QA Customer';e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.click('#downloadBtn');await page.evaluate(()=>{const dialog=document.getElementById('exportCheckDialog');if(dialog?.open){const proceed=[...dialog.querySelectorAll('button')].find(b=>b.textContent==='Download anyway');if(!proceed)throw new Error(dialog.textContent);proceed.click();}});
 /* If the exporter refuses, it says why in the status line; report that
    instead of waiting 90s for a PDF that will never arrive. */
 await page.waitForFunction(()=>window.__pdf&&document.getElementById('statusMsg').textContent.includes('Downloaded'),{timeout:90000}).catch(async e=>{const why=await page.evaluate(()=>document.getElementById('statusMsg').textContent.trim());throw new Error('Power Proposal export produced no PDF: '+why+' ('+e.message+')');});
 const exported=await page.evaluate(()=>window.__pdf),bytes=Buffer.from(exported.data,'base64'),pdf=bytes.toString('latin1');fs.writeFileSync(path.join(shots,'experience','Power_Proposal_test.pdf'),bytes);
 check('actual Power Proposal PDF has seven pages and correct filename',(pdf.match(/\/Type \/Page\b/g)||[]).length===7&&exported.name.startsWith('Power_Proposal_')&&exported.name.includes('12.5kWp'));
 check('actual PDF has clickable gallery destination',pdf.includes('/Subtype /Link')&&pdf.includes('https://example.com/updated-gallery'));
 check('export removes temporary pages and leaves original cover intact',await page.evaluate(()=>!document.querySelector('.pdf-snapshot')&&document.getElementById('v_coverCapacity').textContent==='12.5 kWp'));
 // Hold the first full-document capture, then edit the live proposal. The
 // snapshot and PDF metadata must remain at the values present when clicked.
 const original=await page.evaluate(()=>({ref:Render.lastState.propRef,company:Render.lastState.companyName,duration:Render.lastState.durationText}));
 await page.evaluate(()=>{
  window.__realCanvas=html2canvas;window.__realPDF=jspdf.jsPDF;
  jspdf.jsPDF=class{constructor(){this.internal={pageSize:{getWidth:()=>595,getHeight:()=>842}};}addPage(){}addImage(){}link(){}setProperties(p){window.__metadata=p;}save(name){window.__snapshotName=name;}};
  let first=true;window.html2canvas=async()=>{if(first){first=false;await new Promise(resolve=>window.__resumeCapture=resolve);}return {toDataURL:()=>''};};
  window.__snapshotExport=Exporter.exportPdf(()=>{}, {format:'full'});
 });
 await page.waitForFunction(()=>!!window.__resumeCapture);
 check('concurrent export is blocked',await page.evaluate(async()=>{try{await Exporter.exportPdf();return false;}catch(e){return e.message.includes('already in progress');}}));
 await edit({propRef:'CHANGED-DURING-EXPORT',companyName:'Changed during export'});
 check('live edits cannot rewrite snapshot chrome or figures',await page.evaluate(o=>{const host=document.querySelector('.pdf-snapshot');return host.querySelector('#pageTechSpec .pg-head-meta').textContent.includes(o.ref)&&host.querySelector('#pageTechSpec .pf-left').textContent.includes(o.company)&&!host.textContent.includes('CHANGED-DURING-EXPORT');},original));
 await page.evaluate(async()=>{window.__resumeCapture();await window.__snapshotExport;});
 check('PDF metadata and filename match the captured quotation',await page.evaluate(o=>window.__metadata.author===o.company&&!window.__snapshotName.includes('CHANGED'),original));
 await page.evaluate(()=>{window.html2canvas=async()=>{throw new Error('Controlled capture failure');};});
 check('failed capture cleans up temporary pages and releases export lock',await page.evaluate(async()=>{try{await Exporter.exportPdf();return false;}catch(e){return e.message==='Controlled capture failure'&&!document.querySelector('.pdf-snapshot');}}));
 await edit({durationText:'Long delivery qualification '.repeat(200)});
 check('overlong short proposals fail safely instead of exporting clipped text',await page.evaluate(async()=>{try{await Exporter.exportPdf(()=>{}, {format:'power'});return false;}catch(e){return e.message.includes('too much text')&&!document.querySelector('.pdf-snapshot');}}));
 await page.evaluate(()=>{window.html2canvas=window.__realCanvas;jspdf.jsPDF=window.__realPDF;});
 await edit({propRef:original.ref,companyName:original.company,durationText:original.duration,customerType:'commercial',tariff:'22',payCompletion:'5',loanAmt:'300000',loanRate:'9',loanYears:'5'});
 await page.evaluate(()=>window.__power=Experience.buildPowerPages(Render.lastState));
 check('commercial short proposal uses zero automatic subsidy and flags payment mismatch',await page.$eval('#powerPage6',e=>e.textContent.includes('95%')&&e.textContent.includes('not approved₹0')));
 check('seven-page proposal fits including entered financing',(await powerLayout()).every(x=>x.deep<=x.sheet&&(x.id==='powerPage3'||x.gap>=4)));
 await page.evaluate(()=>window.__power.remove());await page.select('#pdfFormat','full');
 check('full-format label follows optional financing page count',await page.$eval('#downloadLabel',e=>e.textContent.includes('16 Pages')));
 await edit({customerType:'residential',tariff:'8.75',payCompletion:'10',loanAmt:'',loanRate:'',loanYears:''});
 // No shared local storage is needed to browse the published gallery.
 const context=await browser.createBrowserContext(),gallery=await context.newPage();await gallery.setViewport({width:390,height:844});await gallery.goto(base+'/gallery.html',{waitUntil:'networkidle0'});
 /* The published gallery is the real project list (PROJECTS on that page,
     41 entries at the time of writing), not a ten-card sample. */
 check('public gallery works in a fresh browser with no proposal storage',await gallery.evaluate(()=>localStorage.length===0&&document.querySelectorAll('#galleryProjects article').length===PROJECTS.length&&PROJECTS.length>=10));
 /* The gallery no longer carries a videos section at all, so "not advertised"
    means the element is absent (or hidden if it ever returns). */
 check('unsupplied videos are not advertised',await gallery.evaluate(()=>{const v=document.getElementById('videos');return !v||v.hidden;}));
 await gallery.$eval('#galleryFilters button:nth-child(2)',e=>e.click());
 /* The buttons are ['All projects', ...SECTORS], so the second one is
    SECTORS[0]; its count follows the list instead of a fixed four. */
 check('project filters work',await gallery.evaluate(()=>document.querySelectorAll('#galleryProjects article').length===PROJECTS.filter(p=>p.sector===SECTORS[0]).length));
 await gallery.click('.project-photo');check('photographs open in an accessible dialog',await gallery.$eval('#photoViewer',e=>e.open));await gallery.keyboard.press('Escape');check('Escape closes photo viewer',await gallery.$eval('#photoViewer',e=>!e.open));
 check('public gallery has no mobile horizontal overflow',await gallery.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await gallery.screenshot({path:path.join(shots,'experience-gallery-mobile.png'),fullPage:true});await context.close();
 await edit({galleryUrl:'https://example.com/final-gallery'});await page.waitForFunction(()=>Proposals.active().form.galleryUrl==='https://example.com/final-gallery');await page.reload({waitUntil:'networkidle0'});await page.evaluate(()=>Experience.whenReady());check('gallery edit persists after builder reload',await page.$eval('#galleryUrl',e=>e.value==='https://example.com/final-gallery'));
 await customer.select('#pdfFormat','power');
 await customer.evaluate(()=>{Exporter.exportPdf=async(cb,options)=>{window.__chosenFormat=options.format;cb('Downloaded ✓ (5 pages)');};});
 await customer.$eval('#sharePrint',e=>e.click());
 check('Customer View download passes the selected format to the exporter',await customer.evaluate(()=>window.__chosenFormat==='power'));
 check('no runtime errors',errors.length===0);
 /* The petal corner artwork used to run straight through the value band and the
    running footer, so the tagline and page number sat on tinted patches. A soft
    veil now lifts it off that furniture; prove it on every business page. */
 /* Run on a clean sheet: by this point `page` has been driven through the whole
    studio, printed and edited, so its DOM is not the default preview any more. */
 const petalSheet=await browser.newPage();
 try{
   await petalSheet.setViewport({width:1440,height:1200});
   await petalSheet.goto(base+'/quotation.html',{waitUntil:'networkidle0'});
   await petalSheet.evaluate(()=>document.fonts.ready);
   /* The petal artwork grows from the bottom-right corner and used to sit under the
      tagline and page number, printing them on tinted patches. It is now lifted so
      the artwork finishes on the footer rule. The band + footer together are ~80px
      tall, so the lift has to be at least that: a smaller number would put the fan
      back over the type. */
   const petalOverType=await petalSheet.evaluate(()=>{
     /* A lift of at least 46px puts the artwork's own vanishing point (all three
        paths converge at 170/170 of its box) above the footer hairline, so the
        tagline and page number land on plain white. 40 is the floor a shrunken
        or re-pinned fan would fall below. */
     const LIFT_MIN=40;
     return [...document.querySelectorAll('.page:not(#pageCover):not(#pageClosing)')].filter(pg=>{
       const cs=getComputedStyle(pg);
       if(!cs.backgroundImage.includes('proposal-corner-petals'))return true;
       const m=/calc\(100% - (\d+)px\)/.exec(cs.backgroundPosition);
       if(!m)return true;                       /* pinned to the physical corner */
       return parseFloat(m[1])<LIFT_MIN;
     }).map(pg=>pg.id);
   });
   check('petal artwork no longer prints the footer on tinted patches'+(petalOverType.length?' ['+petalOverType.join(', ')+']':''),petalOverType.length===0);
 }finally{await petalSheet.close();}
 console.log(`\n${passed} passed, 0 failed`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
