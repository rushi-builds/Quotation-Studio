/* Empty people/site defaults, muted hints and saved-proposal preservation. */
'use strict';
const assert=require('node:assert/strict'),puppeteer=require('puppeteer-core');
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('  ✓ '+name);};
(async()=>{
 const {default:chromium}=await import('@sparticuz/chromium');
 const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.setViewport({width:1440,height:1000});
  await page.goto((process.env.QA_BASE||'http://127.0.0.1:8080')+'/quotation.html',{waitUntil:'networkidle0'});
  check('all personal defaults are empty in HTML, StateStore and the active form',await page.evaluate(()=>['custName','custAddress','prepName'].every(id=>document.getElementById(id).value===''&&StateStore.DEFAULTS[id]===''&&Proposals.active().form[id]==='')));
  check('customer fields use hints rather than real names or addresses',await page.evaluate(()=>document.getElementById('custName').placeholder==='Enter customer name'&&document.getElementById('custAddress').placeholder==='Enter site address'));
  check('Prepared by stays in the control panel with a faint prompt',await page.$eval('#prepName',e=>!!e.closest('.form-panel')&&e.checkVisibility()&&e.placeholder==='Enter preparer name'&&getComputedStyle(e,'::placeholder').color==='rgb(152, 163, 179)'));
  check('blank cover uses neutral placeholders',await page.evaluate(()=>document.getElementById('v_coverCustName').textContent==='Customer Name'&&document.getElementById('v_coverCustAddress').textContent==='Site Address'));
  check('blank Prepared by does not print an empty preparer row',await page.$eval('#v_coverPrepRow',e=>!e.checkVisibility()));
  check('placeholder text is not saved as customer data',await page.evaluate(()=>!JSON.stringify(Proposals.active().form).includes('Enter preparer name')&&!JSON.stringify(Proposals.active().form).includes('Customer Name')));
  const old=await page.evaluate(()=>{
   for(const [id,value] of Object.entries({custName:'Existing Customer',custAddress:'Existing Site',prepName:'Existing Engineer'})){
    const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));
   }
   window.__qsSaveNow();return Proposals.activeId();
  });
  await page.$eval('.studio-management',e=>e.open=true);await page.click('#pmNew');
  check('New starts all three identity fields empty',await page.evaluate(()=>['custName','custAddress','prepName'].every(id=>document.getElementById(id).value==='')));
  check('New keeps earlier saved customer and preparer details intact',await page.evaluate(id=>{const f=Proposals.get(id).form;return f.custName==='Existing Customer'&&f.custAddress==='Existing Site'&&f.prepName==='Existing Engineer';},old));
  await page.$eval('#prepName',e=>{e.value='Temporary draft';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.$eval('.studio-tools',e=>e.open=true);await page.click('#resetBtn');
  check('Reset returns to blank defaults, not a sample person',await page.evaluate(()=>['custName','custAddress','prepName'].every(id=>document.getElementById(id).value==='')));
  await page.select('#proposalSelect',old);await page.reload({waitUntil:'networkidle0'});
  check('saved details survive switching and reload without migration or replacement',await page.evaluate(()=>document.getElementById('custName').value==='Existing Customer'&&document.getElementById('custAddress').value==='Existing Site'&&document.getElementById('prepName').value==='Existing Engineer'));
  check('entered details remain synchronized with the cover',await page.evaluate(()=>document.getElementById('v_coverCustName').textContent==='Existing Customer'&&document.getElementById('v_coverPrepBy').textContent==='Existing Engineer'));
  check('no browser runtime errors',errors.length===0);
  console.log(`\n${passed} passed, 0 failed`);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
