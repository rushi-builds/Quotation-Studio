/* Opening pages sell system value; commercial figures stay on Investment. */
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright'),pkg=require('@sparticuz/chromium'),bundle=pkg.default||pkg;
(async()=>{
 const browser=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args.filter(a=>a!=='--single-process'),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1200}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.QA_BASE||'http://127.0.0.1:8080')+'/quotation.html');
  await page.waitForFunction(()=>window.Render?.lastState&&window.Proposals?.active());
  await page.evaluate(()=>document.fonts.ready);
  for(const capacity of ['3','7','9.5','20','100']){
   await page.evaluate(cap=>{StateStore.applyForm({capacity:cap});Render.renderAll();},capacity);
   const result=await page.evaluate(()=>{
    const f=Finance.compute(Render.lastState),txt=id=>document.getElementById(id).textContent;
    return {opening:txt('pageCover')+txt('pageExec'),cover:txt('v_coverBadgeGen'),generation:Finance.fmtNum(f.annualGen)+' kWh',hero:txt('v_exHeroNet'),monthly:Finance.fmtNum(f.annualGen / 12)+' kWh',payback:txt('v_inPayback'),expectedPayback:f.payback.toFixed(1)+' years',installed:txt('v_exHeroSave'),expectedInstalled:f.installedKwp.toLocaleString('en-IN',{maximumFractionDigits:3})+' kWp',net:txt('v_inCostNet'),expectedNet:Finance.fmtINR(f.netInvestment),base:txt('v_inCostBase'),expectedBase:Finance.fmtINR(f.projectCost),subsidy:txt('v_inCostSub'),expectedSubsidy:'− '+Finance.fmtINR(f.subsidy)};
   });
   assert.ok(!/₹|Project Cost|Net Investment|Payback|Estimated IRR|Effective Solar Cost|Estimated Subsidy/.test(result.opening));
   assert.equal(result.cover,result.generation);assert.equal(result.hero,result.monthly);assert.equal(result.payback,result.expectedPayback);assert.equal(result.installed,result.expectedInstalled);assert.equal(result.net,result.expectedNet);assert.equal(result.base,result.expectedBase);assert.equal(result.subsidy,result.expectedSubsidy);
  }
  const before=await page.locator('#pageExec').textContent();
  await page.evaluate(()=>{StateStore.applyForm({costPerWp:'90',gstPercent:'12',subsidyOverride:'12345'});Render.renderAll();});
  assert.equal(await page.locator('#pageExec').textContent(),before,'Price/GST/subsidy edits do not alter the opening');
  // Reopen a legacy saved quotation with the former financial-summary content.
  await page.evaluate(()=>{const content=JSON.parse(JSON.stringify(CONTENT));content.exec.systemHeroLabels.generation='Estimated Year-1 Generation';delete content.exec.systemHeroLabels.monitoring;content.exec.systemHeroLabels.delivery='Design • Supply • Installation';delete content.exec.systemKpis.annualGen;content.exec.systemKpis.monthlyGen='Average Monthly Generation';delete content.exec.systemNote;delete content.pageInvestment.paybackCard;content.exec.sub='Everything you need to know about your rooftop solar investment - on one page.';content.exec.heroLabels={netInvestment:'Your Net Investment'};Proposals.saveActive(StateStore.collectForm(),content,PROJECT_IMAGES);});
  await page.reload();await page.waitForFunction(()=>window.Render?.lastState);
  assert.match(await page.locator('#v_exHeroNetLabel').textContent(),/Monthly Generation/);
  assert.equal(await page.locator('#v_exHeroLifetime').textContent(),'24/7');
  assert.equal(await page.locator('#v_exHeroLifetimeLabel').textContent(),'Remote Monitoring Access');
  assert.match(await page.locator('#v_exTraceNote').textContent(),/compatible equipment, power and internet; not staffed support/);
  assert.ok(!(await page.locator('#pageExec').textContent()).includes('₹'));
  await page.evaluate(()=>{StateStore.applyForm({capacity:'9.5',costPerWp:'63.6',gstPercent:'8.9',subsidyOverride:''});Render.renderAll();});
  assert.equal(await page.locator('#pageInvestment .inv-card').count(),5);
  await page.evaluate(()=>{StateStore.applyForm({tariff:'0'});Render.renderAll();});
  assert.equal(await page.locator('#v_inPayback').textContent(),'Not reached');
  await page.evaluate(()=>{StateStore.applyForm({tariff:'10',costPerWp:'0',subsidyOverride:'0'});Render.renderAll();});
  assert.equal(await page.locator('#v_inPayback').textContent(),'Not applicable');
  await page.evaluate(()=>{StateStore.applyForm({costPerWp:'63.6',subsidyOverride:''});Render.renderAll();});
  fs.mkdirSync(path.join(__dirname,'shots/opening-pages'),{recursive:true});
  // Isolate page shells to avoid nested editor scrolling in screenshot/print captures.
  for(const id of ['pageCover','pageExec','pageInvestment']){
   const html=await page.locator('#'+id).evaluate(e=>{const clone=e.cloneNode(true);const originals=e.querySelectorAll('canvas');clone.querySelectorAll('canvas').forEach((c,i)=>{const img=document.createElement('img');for(const a of c.attributes)img.setAttribute(a.name,a.value);img.src=originals[i].toDataURL();c.replaceWith(img);});return clone.outerHTML;}),proof=await browser.newPage({viewport:{width:794,height:1123}});
   await proof.setContent('<base href="'+page.url()+'"><link rel="stylesheet" href="assets/css/app.css"><style>body{margin:0;padding:0;background:white}.page{margin:0;transform:none!important}</style>'+html);
   await proof.evaluate(()=>document.fonts.ready);await proof.waitForFunction(()=>[...document.images].every(i=>i.complete));
   await proof.screenshot({path:path.join(__dirname,'shots/opening-pages',id+'.png')});
   await proof.emulateMedia({media:'print'});if(id!=='pageInvestment')assert.ok(!(await proof.locator('#'+id).textContent()).includes('₹'));
   else assert.equal(await proof.locator('#v_inPaybackLabel').textContent(),'Estimated Payback');
   await proof.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: non-financial cover/summary, live generation and installed-capacity precision, unchanged Investment amounts, price-edit isolation, legacy saved content, print and screenshots.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
