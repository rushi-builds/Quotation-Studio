/* Owner-requested uncropped Additional Systems images; no live backend needed.
   Run against an isolated static QA_BASE, never a live/customer session. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const {default:chrome}=await import('@sparticuz/chromium');
 const browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args.filter(x=>x!=='--single-process'),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept()); // Accept fixture-only preset replacement confirmation.
  await page.goto((process.env.QA_BASE||'http://127.0.0.1:8080')+'/quotation.html');
  await page.waitForFunction(()=>!!window.Render?.lastState);
  await page.locator('[data-section="systemEnabled"]>summary').click();
  const original=await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState)));
  const folder=path.join(__dirname,'shots','system-full-image');fs.mkdirSync(folder,{recursive:true});
  // This same measurement runs in the screen and real export clone.
  function geometry(host){
   const hero=host.querySelector('.sp-system-hero,.bess-hero'),img=hero.querySelector('img'),copy=hero.querySelector('.sp-hero-copy');
   const h=hero.getBoundingClientRect(),i=img.getBoundingClientRect(),c=copy.getBoundingClientRect(),s=getComputedStyle(img);
   const scale=Math.min(i.width/img.naturalWidth,i.height/img.naturalHeight);
   const rendered={width:img.naturalWidth*scale,height:img.naturalHeight*scale};
   const footer=host.querySelector('footer').getBoundingClientRect().top;
   const luminance=values=>values.map(v=>{const n=v/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;}).reduce((sum,n,index)=>sum+n*[.2126,.7152,.0722][index],0);
   const readable=[...copy.querySelectorAll('h2,p,small,span')].every(el=>{
    const values=getComputedStyle(el).color.match(/[\d.]+/g).slice(0,3).map(Number);
    return 1.05/(luminance(values)+.05)>=4.5;
   });
   return {fit:s.objectFit,loaded:img.complete&&img.naturalWidth>0,frame:getComputedStyle(hero).height,
    blended:getComputedStyle(hero).backgroundColor==='rgba(0, 0, 0, 0)'&&getComputedStyle(hero).borderRadius==='0px',
    noPhotoFrame:s.borderTopWidth==='0px'&&s.boxShadow==='none',readableCopy:readable,
    imageInside:i.left>=h.left-1&&i.top>=h.top-1&&i.right<=h.right+1&&i.bottom<=h.bottom+1,
    copySeparate:c.right<=i.left+1,copyInside:c.top>=h.top&&c.bottom<=h.bottom-9*h.height/303,
    noShade:getComputedStyle(hero.querySelector('.sp-hero-shade')).display==='none',
    nativeAspect:Math.abs(i.width/i.height-img.naturalWidth/img.naturalHeight)<.01,
    noSourceCrop:rendered.width<=i.width+.1&&rendered.height<=i.height+.1,
    pageFits:[...host.querySelector('.pg-body').children].every(e=>e.getBoundingClientRect().bottom<footer-2)};
  }
  function verify(r,label){
   assert.equal(r.fit,'contain',label);assert.equal(r.frame,'303px',label);
   for(const key of ['loaded','blended','noPhotoFrame','readableCopy','imageInside','copySeparate','copyInside','noShade','nativeAspect','noSourceCrop','pageFits'])assert(r[key],label+' '+key+' '+JSON.stringify(r));
  }
  const inspect=async()=>page.evaluate(fn=>{const measure=eval('('+fn+')');return measure(Render.lastState.bessEnabled?pageBessOverview:pageSystemOverview);},geometry.toString());
  const kinds=['bess','weatherproof','carport','monitoring','dg','zero','ev','pfc','canopy','pergola','custom'];
  for(const kind of kinds){
   await page.selectOption('#advancedSystemSelect',kind);
   await page.waitForFunction(key=>key==='bess'?Render.lastState.bessEnabled:Render.lastState.systemEnabled&&Render.lastState.systemTemplate===key,kind);
   await page.evaluate(async()=>{await document.fonts.ready;await document.querySelector(Render.lastState.bessEnabled?'#bessOverviewBody .sp-hero>img':'#systemOverviewBody .sp-hero>img').decode();SupplementDesign.fit();});
   verify(await inspect(),kind+' desktop');
   assert.equal(await page.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState))),original);
   const capture=await page.evaluate(async fn=>{
    const clone=(Render.lastState.bessEnabled?pageBessOverview:pageSystemOverview).cloneNode(true);clone.style.transform='none';
    const host=document.createElement('div');host.className='pdf-snapshot';host.append(clone);document.body.append(host);
    try{await Promise.all([...clone.querySelectorAll('img')].map(i=>i.decode()));SupplementDesign.fit(host);
     return {geometry:eval('('+fn+')')(clone),png:(await html2canvas(clone.querySelector('.sp-system-hero,.bess-hero'),{scale:1.5,logging:false,backgroundColor:'#fff'})).toDataURL()};
    }finally{host.remove();}
   },geometry.toString());
   verify(capture.geometry,kind+' export clone');fs.writeFileSync(path.join(folder,kind+'.png'),Buffer.from(capture.png.split(',')[1],'base64'));
   await page.emulateMedia({media:'print'});verify(await inspect(),kind+' print');await page.emulateMedia({media:'screen'});
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>Render.fitPages());verify(await inspect(),kind+' mobile');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.setViewportSize({width:1440,height:1100});await page.evaluate(()=>Render.fitPages());
   console.log('PASS:',kind,'— full source, separate copy, screen/export/print/mobile, A4 and Finance');
  }
  // Future portrait uploads also fit; do not silently assume every photo is landscape.
  await page.evaluate(async()=>{const i=systemOverviewBody.querySelector('img');i.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="orange"/></svg>');await i.decode();});
  verify(await inspect(),'portrait image');console.log('PASS: portrait source remains fully contained too');
  // Actual exporter, real canvases, real two-page PDFs; inspect its DOM snapshots.
  for(const kind of ['bess','canopy','monitoring']){
   await page.selectOption('#advancedSystemSelect',kind);
   await page.waitForFunction(key=>key==='bess'?Render.lastState.bessEnabled:Render.lastState.systemEnabled&&Render.lastState.systemTemplate===key,kind);
   await page.evaluate(fn=>{window.__fullImageGeometry=fn;window.__fullImageMeasures=[];window.__fullImageCapture=html2canvas;window.html2canvas=async(el,opts)=>{if(el.id==='pageSystemOverview'||el.id==='pageBessOverview')__fullImageMeasures.push(eval('('+__fullImageGeometry+')')(el));return __fullImageCapture(el,opts);};},geometry.toString());
   try{
    const waiting=page.waitForEvent('download',{timeout:120000});waiting.catch(()=>{});await page.evaluate(kind=>Exporter.exportPdf(()=>{},{format:kind==='bess'?'bess':'system'}),kind);
    const download=await waiting,file=path.join(folder,kind+'.pdf');await download.saveAs(file);
    assert.equal((fs.readFileSync(file,'latin1').match(/\/Type \/Page\b/g)||[]).length,2);
    const measures=await page.evaluate(()=>__fullImageMeasures);assert(measures.length>0);measures.forEach(r=>verify(r,kind+' actual PDF'));
   }finally{await page.evaluate(()=>{window.html2canvas=__fullImageCapture;});}
   console.log('PASS:',kind,'— actual two-page PDF with uncropped geometry');
  }
  assert.deepEqual(errors,[]);console.log('PASS: zero browser errors; original image files and frozen logic unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
