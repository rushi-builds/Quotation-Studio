'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),pkg=require('@sparticuz/chromium'),bundle=pkg.default||pkg;
(async()=>{
 const browser=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args.filter(x=>x!=='--single-process'),headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';await page.goto(base+'/quotation.html');await page.waitForFunction(()=>window.Render?.lastState);await page.evaluate(()=>document.fonts.ready);
  const out=path.join(__dirname,'shots','category-covers');fs.mkdirSync(out,{recursive:true});
  const others=()=>page.evaluate(()=>[...document.querySelectorAll('.page:not(#pageCover) img')].map(i=>i.getAttribute('src')));
  const originalImages=await others();
  const originalFile=fs.readFileSync(path.join(__dirname,'../assets/images/cover-editable-background.png'));
  const results={};
  for(const type of ['residential','commercial','industrial','rwa']) {
   await page.selectOption('#customerType',type);
   await page.evaluate(async()=>{await coverArtwork.decode();await document.fonts.ready;});
   const result=await page.evaluate(()=>({src:coverArtwork.getAttribute('src'),height:coverArtwork.naturalHeight,rect:[coverArtwork.width,coverArtwork.height],overlay:v_coverBadgeGen.textContent,expected:Finance.fmtNum(Finance.compute(Render.lastState).annualGen)+' kWh',count:document.querySelectorAll('#coverArtwork').length}));
   assert.equal(result.count,1);assert.equal(result.overlay,result.expected);
   assert.equal(result.src,type==='residential'?'assets/images/cover-editable-background.png':`assets/images/cover-${type}-background.webp`);
   assert.equal(result.height,type==='residential'?2223:4096);
   assert.deepEqual(await others(),originalImages,'no images on other pages change');
   await page.emulateMedia({media:'print'});assert.equal(await page.locator('#coverArtwork').getAttribute('src'),result.src);await page.emulateMedia({media:'screen'});
   const raster=await page.evaluate(async()=>{const c=await html2canvas(pageCover,{scale:2,useCORS:true,logging:false,backgroundColor:'#ffffff'});return c.toDataURL('image/png');});
   fs.writeFileSync(path.join(out,type+'.png'),Buffer.from(raster.split(',')[1],'base64'));results[type]=result;
  }
  // Save/reload and read-only Customer View must derive the same cover from category.
  const id=await page.evaluate(()=>{Proposals.saveActive(StateStore.collectForm(),CONTENT,PROJECT_IMAGES);return Proposals.activeId();});
  await page.reload();await page.waitForFunction(()=>window.Render?.lastState);await page.evaluate(()=>coverArtwork.decode());
  assert.equal(await page.locator('#coverArtwork').getAttribute('src'),results.rwa.src);
  const customer=await context.newPage();customer.on('pageerror',e=>errors.push(e.message));await customer.goto(base+'/share.html?p='+encodeURIComponent(id));await customer.waitForFunction(()=>window.Render?.lastState);await customer.evaluate(()=>coverArtwork.decode());
  assert.equal(await customer.locator('#coverArtwork').getAttribute('src'),results.rwa.src);
  const pdf=await customer.evaluate(async()=>{
   const Native=jspdf.jsPDF,capture=html2canvas,result={};
   jspdf.jsPDF=function(...args){const pdf=new Native(...args);pdf.save=()=>{result.pages=pdf.getNumberOfPages();result.bytes=pdf.output('arraybuffer').byteLength;};return pdf;};
   window.html2canvas=async(el,options)=>{if(el.id==='pageCover')result.cover=el.querySelector('#coverArtwork').getAttribute('src');return capture(el,options);};
   try {await Exporter.exportPdf(()=>{},{format:'full'});return result;}finally{jspdf.jsPDF=Native;window.html2canvas=capture;}
  });
  assert.equal(pdf.cover,results.rwa.src);assert.equal(pdf.pages,15);assert.ok(pdf.bytes>10000);
  await page.selectOption('#customerType','residential');await page.evaluate(()=>coverArtwork.decode());assert.equal(await page.locator('#coverArtwork').getAttribute('src'),results.residential.src);
  await page.evaluate(()=>Render.renderAll({...Render.lastState,customerType:'legacy-unknown'}));assert.equal(await page.locator('#coverArtwork').getAttribute('src'),results.residential.src);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(fs.readFileSync(path.join(__dirname,'../assets/images/cover-editable-background.png')),originalFile);
  assert.deepEqual(errors,[]);console.log('PASS: four category covers, original residential retained, other page images unchanged, live fields, print/raster captures, save/reload, Customer View, actual 15-page PDF, fallback and mobile.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
