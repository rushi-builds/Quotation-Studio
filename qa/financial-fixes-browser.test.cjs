'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright'),pkg=require('@sparticuz/chromium'),bundle=pkg.default||pkg;
(async()=>{
 const browser=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args.filter(a=>a!=='--single-process'),headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';
  await page.goto(base+'/quotation.html');await page.waitForFunction(()=>window.Render?.lastState);
  const apply=fields=>page.evaluate(fields=>{StateStore.applyForm(fields);Render.renderAll();},fields);
  await apply({custName:'Financial QA',capacity:'10',moduleWattage:'500',costPerWp:'60',gstPercent:'8.9',customerType:'residential',subsidyOverride:'',stateTopUp:'',loanAmt:'100000',loanRate:'0',loanYears:'5'});
  const expected={base:'₹6,00,000',gst:'+ ₹53,400',net:'₹5,75,400'};
  const amounts=p=>p.evaluate(()=>({base:v_inCostBase.textContent,gst:v_inCostGst.textContent,net:v_inCostNet.textContent}));
  assert.deepEqual(await amounts(page),expected);
  assert.ok(await page.evaluate(()=>Math.abs(Finance.compute(Render.lastState).financing.emi-100000/60)<1e-8&&Finance.compute(Render.lastState).financing.totalInterest===0));
  assert.ok(await page.evaluate(()=>!__qsPreflight.run().blocking.some(x=>x.id==='loanAmt')),'0% passes real export preflight');
  await apply({loanRate:''});assert.equal(await page.evaluate(()=>Finance.compute(Render.lastState).financing),null);
  await apply({loanRate:'0'});
  const id=await page.evaluate(()=>{Proposals.saveActive(StateStore.collectForm(),CONTENT,PROJECT_IMAGES);return Proposals.activeId();});
  await page.reload();await page.waitForFunction(()=>window.Render?.lastState);assert.deepEqual(await amounts(page),expected);
  const customer=await context.newPage();await customer.goto(base+'/share.html?p='+encodeURIComponent(id));await customer.waitForFunction(()=>window.Render?.lastState);
  assert.deepEqual(await amounts(customer),expected,'saved Customer View uses the same independent expected totals');
  assert.ok(await customer.evaluate(()=>Math.abs(Finance.compute(Render.lastState).financing.emi-100000/60)<1e-8));
  await customer.emulateMedia({media:'print'});assert.deepEqual(await amounts(customer),expected);await customer.emulateMedia({media:'screen'});
  // Actual html2canvas/jsPDF generation from the saved Customer View, not a mocked export.
  const pdf=await customer.evaluate(async()=>{
   const Native=jspdf.jsPDF,originalCapture=html2canvas,records={};
   jspdf.jsPDF=function(...args){const p=new Native(...args);p.save=name=>{records.name=name;records.pages=p.getNumberOfPages();records.bytes=p.output('arraybuffer').byteLength;};return p;};
   window.html2canvas=async(el,opts)=>{if(el.id==='pageInvestment')records.investment=el.textContent;if(el.id==='powerPage5')records.power=el.textContent;return originalCapture(el,opts);};
   try {await Exporter.exportPdf(()=>{},{format:'power'});const power={...records};await Exporter.exportPdf(()=>{},{format:'full'});return {power,full:records};}
   finally {jspdf.jsPDF=Native;window.html2canvas=originalCapture;}
  });
  assert.equal(pdf.power.pages,6);assert.equal(pdf.full.pages,16);assert.ok(pdf.full.bytes>10000&&pdf.power.bytes>10000);
  for(const text of [pdf.power.power,pdf.full.investment]) {assert.ok(text.includes('₹6,00,000'));assert.ok(text.includes('₹5,75,400'));assert.ok(!text.includes('₹-78,000'));}
  console.log('PASS: persisted builder/Customer View/print/real detailed and power PDFs agree; 0% EMI and export preflight supported.');
  for(const value of ['0','653400','99999999']) {
   await apply({subsidyOverride:value});
   const result=await page.evaluate(()=>{const f=Finance.compute(Render.lastState);return {subsidy:f.subsidy,net:f.netInvestment,payback:v_inPayback.textContent,pixels:chartBridge.getContext('2d').getImageData(0,0,chartBridge.width,chartBridge.height).data.some(v=>v!==0),warning:__qsPreflight.run().advisory.some(x=>x.id==='subsidyOverride')};});
   assert.equal(result.subsidy,Number(value));assert.equal(result.net,653400-Number(value));assert.ok(result.pixels);
   if(Number(value)>=653400) assert.match(result.payback,/Not applicable/);
   if(Number(value)>653400) assert.ok(result.warning,'oversized override remains unchanged but is warned about');
  }
  await apply({subsidyOverride:'',customerType:'rwa',rwaEligibleKwp:'6'});assert.equal(await page.evaluate(()=>Finance.compute(Render.lastState).subsidy),108000);
  await apply({subsidyOverride:'0'});assert.equal(await page.evaluate(()=>Finance.compute(Render.lastState).subsidy),0);
  await apply({subsidyOverride:'',customerType:'residential'});assert.deepEqual(await amounts(page),expected);
  assert.deepEqual(errors,[]);
  console.log('PASS: zero, exact-gross and excessive subsidy overrides render safely; warning retained; clearing and RWA overrides preserved; no runtime errors.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
