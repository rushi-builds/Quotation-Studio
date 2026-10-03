const assert=require('node:assert/strict'),{chromium}=require('playwright'),mod=require('@sparticuz/chromium'),c=mod.default||mod;
(async()=>{const b=await chromium.launch({executablePath:await c.executablePath(),args:c.args.filter(x=>x!=='--single-process'),headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto((process.env.QA_BASE||'http://127.0.0.1:8080')+'/quotation.html');await p.waitForFunction(()=>window.Render?.lastState);
 await p.selectOption('#customerType','rwa');
 await p.evaluate(()=>{StateStore.applyForm({capacity:'10',moduleWattage:'500',subsidyOverride:'',rwaEligibleKwp:'',stateTopUp:'60000'});Render.renderAll();});
 assert.equal(await p.locator('#rwaEligibilityField').getAttribute('hidden'),null);
 assert.equal(await p.locator('#v_inCostSub').textContent(),'− ₹1,80,000');assert.match(await p.locator('#v_inCostSubCap').textContent(),/provisional/);
 await p.evaluate(()=>{let e=document.getElementById('rwaEligibleKwp');e.value='6';e.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await p.locator('#v_inCostSub').textContent(),'− ₹1,08,000');assert.match(await p.locator('#v_inDisclaimer').textContent(),/3 kW per house/);
 for(const [value,expected] of [['42000','− ₹42,000'],['0','− ₹0'],['','− ₹1,08,000']]){
  await p.evaluate(value=>{let e=document.getElementById('subsidyOverride');e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));},value);
  assert.equal(await p.locator('#v_inCostSub').textContent(),expected);
 }
 await p.evaluate(()=>Proposals.saveActive(StateStore.collectForm(),CONTENT,PROJECT_IMAGES));await p.reload();await p.waitForFunction(()=>window.Render?.lastState);
 assert.equal(await p.inputValue('#customerType'),'rwa');assert.equal(await p.inputValue('#rwaEligibleKwp'),'6');assert.equal(await p.locator('#v_inCostSub').textContent(),'− ₹1,08,000');
 await p.emulateMedia({media:'print'});assert.match(await p.locator('#v_inDisclaimer').textContent(),/RWA\/GHS/);assert.equal(await p.locator('#v_inCostSub').textContent(),'− ₹1,08,000');await p.emulateMedia({media:'screen'});
 await p.selectOption('#customerType','commercial');assert.equal(await p.locator('#v_inCostSub').textContent(),'− ₹0');assert.equal(await p.locator('#rwaEligibilityField').getAttribute('hidden'),'');
 await p.selectOption('#customerType','residential');assert.equal(await p.locator('#v_inCostSub').textContent(),'− ₹1,38,000'); // Existing household slab + entered state top-up preserved.
 await p.evaluate(()=>{StateStore.applyForm({subsidyOverride:'18000'});Render.renderAll();});assert.equal(await p.locator('#v_inCostSub').textContent(),'− ₹18,000');
 assert.deepEqual(errors,[]);console.log('PASS: RWA dropdown, rate/caps/eligible capacity, override including zero, persisted reload, print disclosure, switch-back and non-RWA manual override.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
