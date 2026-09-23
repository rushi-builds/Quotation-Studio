/* A4 whitespace refinement: content remains legible and inside page/footers. */
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('  ✓ '+name);};
(async()=>{
 const {default:chromium}=await import('@sparticuz/chromium');
 const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';
  await page.setViewport({width:1440,height:1200});await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{
   const ctx=document.getElementById('chartBridge').getContext('2d'),native=ctx.fillText;
   window.__bridgeLabels=[];ctx.fillText=function(text,...args){window.__bridgeLabels.push(String(text));return native.call(this,text,...args);};Render.renderAll();
  });
  check('cost chart draws the actual GST rate, never undefined text',await page.evaluate(()=>__bridgeLabels.includes('8.9%')&&!__bridgeLabels.some(v=>/undefined|NaN|Infinity/.test(v))));
  const originals=await page.evaluate(()=>({form:StateStore.collectForm(),finance:JSON.stringify(Finance.compute(Render.lastState)),cover:document.getElementById('pageCover').outerHTML,diagram:document.getElementById('v_tsDiagram').innerHTML}));
  async function geometry(label){
   const issues=await page.evaluate(()=>[...document.querySelectorAll('.page')].filter(p=>p.checkVisibility()).flatMap(p=>{
    const bad=[],box=p.getBoundingClientRect(),scale=box.width/794,body=p.querySelector('.pg-body'),foot=p.querySelector('.pg-foot');
    if(p.scrollHeight>1124)bad.push(p.id+': page overflow');
    if(body&&foot){
     const children=[...body.children].filter(c=>c.checkVisibility()),limit=foot.getBoundingClientRect().top;
     for(const c of children){const r=c.getBoundingClientRect();if(r.bottom>limit+.8||r.left<box.left-.8||r.right>box.right+.8)bad.push(p.id+': outside page/footer '+(c.id||c.className)+' ('+Math.round((r.bottom-limit)/scale)+'px)');}
     const note=body.querySelector('.footer-note');if(note){const n=note.getBoundingClientRect();for(const c of children.filter(c=>c!==note))if(c.getBoundingClientRect().bottom>n.top+.8)bad.push(p.id+': overlaps footer note');}
    }
    const photo=p.querySelector('.photo-top'),intro=p.querySelector('.intro-col');
    if(photo&&intro){const a=photo.getBoundingClientRect(),b=intro.getBoundingClientRect();if(a.left<b.right-.8||a.bottom>b.bottom+.8)bad.push(p.id+': photo overlaps text or next section');}
    for(const c of p.querySelectorAll('.card,.kpi-tile,.commit-card,.term-item')){
     if(!c.checkVisibility())continue;
     if(c.scrollWidth>c.clientWidth+1)bad.push(p.id+': text horizontally overflows card');
     const r=c.getBoundingClientRect();for(const child of c.children){if(!child.checkVisibility())continue;const q=child.getBoundingClientRect();if(q.bottom>r.bottom+scale||q.right>r.right+scale)bad.push(p.id+': text outside card');}
    }
    return bad;
   }));check(label+' fits A4 with no card/photo/footer collisions: '+issues.join(', '),issues.length===0);
  }
  await geometry('Default 7 kWp');
  check('summary ends with a loaded original solar illustration, not another text block',await page.evaluate(()=>{const e=document.querySelector('#pageExec .exec-artwork'),img=e.querySelector('img');return img.complete&&img.naturalWidth===718&&e.offsetHeight>120&&e.textContent.includes('not a site layout');}));
  await page.evaluate(()=>{StateStore.applyForm({custName:'Customer with a moderately long organisation name',custAddress:'Industrial Area, Pune, Maharashtra — project site under review'});Render.renderAll();});
  await geometry('Summary with customer and site details');
  check('summary artwork yields space to customer content and stays above the footer',await page.evaluate(()=>{const e=document.querySelector('#pageExec .exec-artwork');return e.offsetHeight>60&&e.getBoundingClientRect().bottom<pageExec.querySelector('footer').getBoundingClientRect().top;}));
  await page.evaluate(f=>{StateStore.applyForm(f);Render.renderAll();},originals.form);
  check('benefits and solution use wider two-column cards',await page.evaluate(()=>['v_wsBenefits','v_soSpecs','v_quStandards','v_quChecklist'].every(id=>getComputedStyle(document.getElementById(id)).gridTemplateColumns.split(' ').length===2)));
  check('body and card text enlarged moderately, not globally',await page.evaluate(()=>getComputedStyle(document.getElementById('v_wsPara')).fontSize==='12.2px'&&getComputedStyle(document.querySelector('#pageWhySolar .card-desc')).fontSize==='11.5px'&&getComputedStyle(document.getElementById('v_tsPara')).fontSize==='11.4px'));
  check('large unused areas reduced on summary, benefits, solution and quality',await page.evaluate(()=>[
   ['pageExec','.exec-artwork',880],['pageWhySolar','#v_wsBenefits',900],['pageSolution','.highlight-bar',980],['pageQuality','#v_quChecklist',930]
  ].every(([id,selector,min])=>{const p=document.getElementById(id),r=p.getBoundingClientRect();return (p.querySelector(selector).getBoundingClientRect().bottom-r.top)/(r.width/794)>=min;})));
  check('summary page is filled down to the footer with no pale band beside the render',await page.evaluate(()=>{
   const p=document.getElementById('pageExec'),f=p.querySelector('.exec-artwork'),img=f.querySelector('img'),foot=p.querySelector('.pg-foot');
   const scale=p.getBoundingClientRect().width/794, fr=f.getBoundingClientRect(), ir=img.getBoundingClientRect();
   return (foot.getBoundingClientRect().top-fr.bottom)/scale<60 && Math.abs(ir.width/ir.height-718/359)<0.02 && ir.width>=700;
  }));
  check('portfolio keeps ten normal cards at the approved size',await page.$$eval('#pageProjects .pc-photo',els=>els.length===10&&els.every(e=>e.offsetHeight===132)));
  for(const capacity of ['10','20','100']){await page.evaluate(cap=>{StateStore.applyForm({capacity:cap});Render.renderAll();},capacity);await geometry(capacity+' kWp');}
  await page.evaluate(()=>{
   StateStore.applyForm({capacity:'25',customerType:'commercial',monthlyBill:'50000',loanAmt:'500000',loanRate:'9',loanYears:'10',bomModules:'600000',bomInverter:'150000',bomStructure:'150000',bomBos:'100000',bomInstall:'100000',bomLiaison:'50000',availableArea:'200',arkaUrl:'https://example.com/layout',pvsystUrl:'https://example.com/report'});
   window.__qsOptions=[{id:'a',name:'Option A',fields:{capacity:'25'}},{id:'b',name:'Option B',fields:{capacity:'30'}}];Render.renderAll();
  });
  await geometry('Commercial: bill, BOM, loan, options and technical reports');
  check('dense cost charts retain full width and redraw at compact height',await page.evaluate(()=>chartBridge.clientWidth===718&&chartBridge.clientHeight===180&&chartDonut.clientWidth===150&&!!document.querySelector('#v_inTaxIcon svg')));
  check('all seventeen optional pages are present for stress review',await page.evaluate(()=>Render.lastVisible.length===17));
  await page.emulateMediaType('print');await geometry('Print with optional content');await page.emulateMediaType('screen');
  const output=path.join(__dirname,'shots','page-spacing');fs.mkdirSync(output,{recursive:true});
  for(const name of fs.readdirSync(output))if(name.endsWith('.pdf'))fs.unlinkSync(path.join(output,name));
  const cdp=await page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:output,eventsEnabled:true});
  let timer;const done=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('PDF download timed out')),120000);cdp.on('Browser.downloadProgress',event=>{if(event.state==='completed'){clearTimeout(timer);resolve();}if(event.state==='canceled'){clearTimeout(timer);reject(new Error('Download canceled'));}});});done.catch(()=>{});
  await page.evaluate(()=>{
   const native=html2canvas;window.__layoutProofs={};window.__layoutCaptureCount=0;
   window.__restoreCapture=()=>{window.html2canvas=native;};
   window.html2canvas=async(el,options)=>{
    const body=el.querySelector('.pg-body'),foot=el.querySelector('.pg-foot');
    if(body&&foot&&[...body.children].some(c=>c.checkVisibility()&&c.getBoundingClientRect().bottom>foot.getBoundingClientRect().top+1))throw new Error('PDF footer collision: '+el.id);
    const canvas=await native(el,options);window.__layoutCaptureCount++;
    if(el.id==='pageExec'){
     const p=el.getBoundingClientRect(),r=el.querySelector('.exec-artwork img').getBoundingClientRect(),scale=canvas.width/p.width;
     const d=canvas.getContext('2d').getImageData(Math.round((r.left-p.left)*scale),Math.round((r.top-p.top)*scale),Math.round(r.width*scale),Math.round(r.height*scale)).data;
     window.__summaryArtInk=0;for(let i=0;i<d.length;i+=4)if(d[i]<120&&d[i+1]>60&&d[i+1]<160&&d[i+2]>70&&d[i+2]<170)window.__summaryArtInk++;
    }
    if(el.id==='pageWhySolar'){
     const page=el.getBoundingClientRect(),chip=el.querySelector('.icon-chip').getBoundingClientRect(),scale=canvas.width/page.width;
     const pixels=canvas.getContext('2d').getImageData(Math.round((chip.left-page.left+9)*scale),Math.round((chip.top-page.top+9)*scale),Math.round(12*scale),Math.round(12*scale)).data;
     window.__layoutIconInk=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>240&&pixels[i+1]>240&&pixels[i+2]>240)window.__layoutIconInk++;
     if(window.__layoutIconInk<5)throw new Error('White icon is missing from full-page PDF capture');
    }
    if(['pageExec','pageWhySolar','pageQuality','pageTechSpec','pageInvestment','pageProjects'].includes(el.id))window.__layoutProofs[el.id]=canvas.toDataURL('image/png');
    return canvas;
   };
  });
  try{await page.click('#downloadBtn');await page.waitForFunction(()=>statusMsg.textContent.includes('Downloaded'),{timeout:120000});await done;}finally{clearTimeout(timer);await page.evaluate(()=>__restoreCapture());}
  check('actual PDF capture fits all 17 pages including optional details',await page.evaluate(()=>__layoutCaptureCount===17));
  check('solar landscape is visibly rendered in the actual PDF raster',await page.evaluate(()=>__summaryArtInk>1000));
  const pdf=fs.readdirSync(output).find(name=>name.endsWith('.pdf'));
  check('actual PDF keeps white pictograms visible above orange icon backgrounds',await page.evaluate(()=>__layoutIconInk>=5));
  check('17-page stress-case PDF downloaded',!!pdf&&(fs.readFileSync(path.join(output,pdf),'latin1').match(/\/Type \/Page\b/g)||[]).length===17);
  const proofs=await page.evaluate(()=>__layoutProofs);for(const [id,data] of Object.entries(proofs))fs.writeFileSync(path.join(output,id+'.png'),Buffer.from(data.split(',')[1],'base64'));
  await page.evaluate(form=>{StateStore.applyForm({...form,moduleMake:'Custom high-efficiency photovoltaic modules — reviewed equipment make',inverterMake:'Custom three-phase grid-connected inverter'});window.__qsOptions=[];Render.renderAll();},originals.form);
  await geometry('Long custom equipment names');
  await page.evaluate(form=>{StateStore.applyForm(form);Render.renderAll();window.__qsSaveNow();},originals.form);
  check('clearing BOM restores the original full-size cost chart',await page.evaluate(()=>chartBridge.clientWidth===718&&chartBridge.clientHeight===252&&!document.getElementById('pageTechSpec').classList.contains('has-site-area')));
  check('layout changes do not alter financial output',await page.evaluate(fin=>JSON.stringify(Finance.compute(Render.lastState))===fin,originals.finance));
  await page.setViewport({width:390,height:844});await geometry('Mobile-scaled A4');
  check('mobile document has no horizontal scrolling',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const id=await page.evaluate(()=>Proposals.activeId()),customer=await browser.newPage();
  customer.on('pageerror',e=>errors.push(e.message));await customer.goto(base+'/share.html?p='+encodeURIComponent(id),{waitUntil:'networkidle0'});
  check('Customer View uses the same card layout and enlarged photography',await customer.evaluate(()=>document.querySelector('#pageSolution .photo-top').offsetHeight===260&&getComputedStyle(document.getElementById('v_soSpecs')).gridTemplateColumns.split(' ').length===2));
  check('Customer View carries the same loaded summary artwork',await customer.$eval('#pageExec .exec-artwork img',e=>e.complete&&e.naturalWidth===718));
  check('no runtime errors',errors.length===0);console.log(`\n${passed} passed, 0 failed`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
