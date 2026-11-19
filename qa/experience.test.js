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
 const expected=await page.evaluate(()=>{const f=Finance.compute(Render.lastState);return {net:Finance.fmtINR(f.netInvestment),annual:Finance.fmtNum(f.annualGen),lifetime:Finance.fmtINRshort(f.lifetimeSaving),module:f.moduleCount,capacity:Render.lastState.capacity};});
 await page.evaluate(()=>window.__power=Experience.buildPowerPages(Render.lastState));
 check('Power Proposal stays seven sheets, with the agreed combined page 4',await page.$$eval('.pdf-snapshot .power-page',els=>els.length===7));
 const sourceOrder=['pageCover','pageSolution','pageTechSpec','pageScope','pageSavings','pageInvestment','pageClosing'];
 check('compact PDF uses the approved Detailed Proposal page order',await page.$$eval('.pdf-snapshot .power-page',els=>JSON.stringify(els.map(e=>e.dataset.sourcePage))===JSON.stringify(['pageCover','pageSolution','pageTechSpec','pageScope','pageSavings','pageInvestment','pageClosing'])));
 check('seven source sheets retain native artwork/chrome and shared pages are renumbered',await page.$$eval('.pdf-snapshot .power-page',els=>els.length===7&&els.every((p,i)=>i===0?!p.querySelector('.pg-head')&&!p.querySelector('.pg-foot'):i===6?!p.querySelector('.pg-head')&&p.querySelector('.pg-foot .pf-right')?.textContent.trim()==='Page 7 of 7':p.querySelector('.pg-head .pg-logo img')&&p.querySelector('.pg-head .pg-head-meta')&&p.querySelector('.pg-foot .pf-left')&&p.querySelector('.pg-foot .pf-mid')&&p.querySelector('.pg-foot .pf-right')?.textContent.trim()==='Page '+(i+1)+' of 7')));
 check('page 3 keeps the Technical Specification body markup exactly',await page.evaluate(()=>document.querySelector('#pageTechSpec .pg-body').innerHTML===document.querySelector('#powerPage3 .pg-body').innerHTML));
 check('compact opening and savings/investment pages reflect the saved quotation',await page.evaluate(x=>powerPage1.textContent.includes(x.annual)&&powerPage1.textContent.includes(x.capacity)&&powerPage5.textContent.includes('₹')&&powerPage6.textContent.includes(x.net),expected));
 check('page 4 combines original EPC scope, warranty terms, delivery milestones and exclusions without replacing the main proposal sheet',await page.$eval('#powerPage4',e=>e.classList.contains('power-scope-warranty')&&e.dataset.sourcePage==='pageScope'&&['TURNKEY EPC SCOPE','WARRANTY COVERAGE','FROM ORDER TO HANDOVER','CUSTOMER INPUTS','BEFORE WE HAND OVER'].every(t=>e.textContent.includes(t))&&e.querySelector('.pg-head')&&e.querySelector('.pg-foot')&&!e.querySelector('.proposal-value-footer')&&e.querySelectorAll('.sw-quality-card').length===3&&!document.querySelector('#pageScope .sw-scope-grid')));
 async function powerLayout(){
  return page.$$eval('.power-page',els=>els.map(e=>{
   const r=e.getBoundingClientRect(),foot=e.querySelector(':scope > footer'),body=e.querySelector('.pg-body')||e,f=foot?.getBoundingClientRect();
   let deepest='(none)',low=r.top;
   for(const n of body.querySelectorAll('*')){
    if(n.closest('footer')||n.matches('style,script'))continue;
    const nb=n.getBoundingClientRect();if(!n.getClientRects().length||!nb.height)continue;
    if(nb.bottom>low){low=nb.bottom;deepest=n.tagName.toLowerCase()+(n.id?'#'+n.id:'')+(typeof n.className==='string'&&n.className.trim()?'.'+n.className.trim().split(/\s+/).join('.'):'');}
   }
   return {id:e.id,sheet:e.clientHeight,deepest,deep:Math.round(low-r.top),gap:f?f.top-low:null,fit:e.scrollWidth<=e.clientWidth};
  }));
 }
 let layout=await powerLayout();console.log('Compact proposal layout',layout);
 const badPage=layout.filter(x=>x.deep>x.sheet||x.gap!==null&&x.gap<3||!x.fit);
 check('all seven Detailed Proposal sheets fit A4 with footer clearance'+(badPage.length?' ['+badPage.map(x=>x.id+': '+x.deepest+'@'+x.deep+'/'+x.sheet+' gap='+Math.round(x.gap)).join(' | ')+']':''),badPage.length===0);
 const specParity=await page.evaluate(()=>{const a=document.querySelector('#pageTechSpec'),b=document.querySelector('#powerPage3');return {body:a.querySelector('.pg-body').innerHTML===b.querySelector('.pg-body').innerHTML,source:b.dataset.sourcePage,foot:b.querySelector('.pf-right')?.textContent.trim(),hasHeader:!!b.querySelector('.pg-head'),hasFooter:!!b.querySelector('.pg-foot'),sameCards:a.querySelectorAll('.pv2-card').length===b.querySelectorAll('.pv2-card').length};});
 check('page 3 is the original technical sheet body, with only its compact page number changed',specParity.body&&specParity.source==='pageTechSpec'&&specParity.foot==='Page 3 of 7'&&specParity.hasHeader&&specParity.hasFooter&&specParity.sameCards);
 const proof=await browser.newPage();await proof.setViewport({width:794,height:1124});
 for(const id of ['powerPage1','powerPage2','powerPage3','powerPage4','powerPage5','powerPage6','powerPage7','pageClosing']){
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
 check('Power Proposal ignores the exploratory tariff',await customer.$eval('#powerPage5',(e)=>e.textContent.includes('₹8.75')));await customer.evaluate(()=>window.__power.remove());
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
 check('actual PDF captures the seven renumbered Detailed Proposal sheets',await page.evaluate(()=>Exporter.stats?.pages===7&&Exporter.stats.perPage.map(p=>p.id).join(',')==='powerPage1,powerPage2,powerPage3,powerPage4,powerPage5,powerPage6,powerPage7'));
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
 check('a selected sheet that exceeds A4 fails safely instead of exporting clipped text',await page.evaluate(async()=>{const build=Experience.buildPowerPages;Experience.buildPowerPages=function(state){const host=build(state);host.querySelector('#powerPage2 .pg-body').style.transform='translateY(1600px)';return host;};try{await Exporter.exportPdf(()=>{}, {format:'power'});return false;}catch(e){return e.message.includes('does not fit its A4 sheet')&&!document.querySelector('.pdf-snapshot');}finally{Experience.buildPowerPages=build;}}));
 await page.evaluate(()=>{window.html2canvas=window.__realCanvas;jspdf.jsPDF=window.__realPDF;});
 await edit({propRef:original.ref,companyName:original.company,durationText:original.duration,customerType:'commercial',tariff:'22',payCompletion:'5',loanAmt:'300000',loanRate:'9',loanYears:'5'});
 await page.evaluate(()=>window.__power=Experience.buildPowerPages(Render.lastState));
 check('commercial short proposal uses zero automatic subsidy and flags payment mismatch',await page.$eval('#powerPage6',e=>e.textContent.includes('− ₹0')&&e.textContent.includes('Payment schedule totals 95%')));
 check('seven-page proposal fits including entered financing',(await powerLayout()).every(x=>x.deep<=x.sheet&&(x.gap===null||x.gap>=3)&&x.fit));
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
 check('no runtime errors',errors.length===0);console.log(`\n${passed} passed, 0 failed`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
