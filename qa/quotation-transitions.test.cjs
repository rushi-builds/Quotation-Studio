'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright'),pkg=require('@sparticuz/chromium'),bundle=pkg.default||pkg;
(async()=>{
 const browser=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args.filter(a=>a!=='--single-process'),headless:true});
 try {
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';
  await page.goto(base+'/quotation.html');await page.waitForFunction(()=>window.Render?.lastState);
  await page.evaluate(()=>{StateStore.applyForm({custName:'Transition audit',costPerWp:'60',gstPercent:'8.9',stateTopUp:'',subsidyOverride:'',rwaEligibleKwp:'',loanAmt:'100000',loanRate:'0',loanYears:'5'});Render.renderAll();});
  let scenarios=0;
  for(const type of ['residential','commercial','industrial','rwa','residential']) {
   for(const [capacity,watts] of [[1,500],[2.5,500],[8.175,545],[8.175001,545],[100,620],[600,500]]) {
    // Exercise actual form listeners, not only the calculation API.
    await page.evaluate(fields=>{for(const [id,value] of Object.entries(fields)){const e=document.getElementById(id);e.value=String(value);e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));}}, {customerType:type,capacity,moduleWattage:watts});
    await page.waitForFunction(({type,capacity,watts})=>Render.lastState.customerType===type&&+Render.lastState.capacity===capacity&&+Render.lastState.moduleWattage===watts,{type,capacity,watts});
    const n=Math.ceil(capacity*1000/watts-1e-10),dc=n*watts/1000;
    const subsidy=type==='residential'?Math.min(dc,2)*30000+Math.max(0,Math.min(dc-2,1))*18000:type==='rwa'?Math.min(dc,500)*18000:0;
    const expected=capacity*60000*1.089-subsidy;
    const result=await page.evaluate(()=>{const f=Finance.compute(Render.lastState);return {count:f.moduleCount,dc:f.installedKwp,net:f.netInvestment,subsidy:f.subsidy,text:v_inCostNet.textContent,emi:f.financing.emi};});
    assert.equal(result.count,n);assert.ok(Math.abs(result.dc-dc)<1e-8);assert.ok(Math.abs(result.net-expected)<1e-6);assert.equal(result.subsidy,subsidy);assert.ok(Math.abs(result.emi-100000/60)<1e-8);
    const id=await page.evaluate(()=>{Proposals.saveActive(StateStore.collectForm(),CONTENT,PROJECT_IMAGES);return Proposals.activeId();});
    await page.reload();await page.waitForFunction(()=>window.Render?.lastState);
    assert.deepEqual(await page.evaluate(()=>({type:Render.lastState.customerType,capacity:+Render.lastState.capacity,watts:+Render.lastState.moduleWattage,text:v_inCostNet.textContent})),{type,capacity,watts,text:result.text});
    if(capacity===100){
     const builderArea=await page.evaluate(()=>Finance.compute(Render.lastState).requiredArea);
     const customer=await context.newPage();await customer.goto(base+'/share.html?p='+encodeURIComponent(id));await customer.waitForFunction(()=>window.Render?.lastState);
     assert.equal(await customer.locator('#v_inCostNet').textContent(),result.text);assert.equal(await customer.evaluate(()=>Finance.compute(Render.lastState).requiredArea),builderArea,'Customer View uses the same engineering roof area');await customer.close();
    }
    scenarios++;
   }
  }
  assert.deepEqual(errors,[]);console.log(`PASS: ${scenarios} live customer/capacity/module transitions, independent arithmetic, saved reloads and five Customer Views.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
