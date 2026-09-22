/* Regression for user-reported NaN kWp caused by arithmetic on grouped text.
   Check actual displayed rows, not only Finance values or module quantities. */
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('  ✓ '+name);};
(async()=>{
 const {default:chromium}=await import('@sparticuz/chromium');
 const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1440,height:1100});
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';
  await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});await page.evaluate(()=>document.fonts.ready);
  const cases=[
   ['0','545',0,'0 kWp'],['1.5','545',3,'1.635 kWp'],['7','545',13,'7.085 kWp'],
   ['9.81','545',18,'9.81 kWp'],['9.82','545',19,'10.355 kWp'],
   ['10','545',19,'10.355 kWp'],['10','500',20,'10 kWp'],['10','550',19,'10.45 kWp'],
   ['10','620',17,'10.54 kWp'],['12.5','545',23,'12.535 kWp'],['20','545',37,'20.165 kWp'],
   ['25','550',46,'25.3 kWp'],['100','545',184,'100.28 kWp'],['1000','545',1835,'1,000.075 kWp']
  ];
  async function edit(capacity,watts){await page.evaluate(({capacity,watts})=>{
   document.getElementById('capacity').value=capacity;document.getElementById('moduleWattage').value=watts;
   document.getElementById('capacity').dispatchEvent(new Event('input',{bubbles:true}));
  },{capacity,watts});}
  async function row(p,label){return p.$eval('#v_tsTable',(table,label)=>[...table.querySelectorAll('tr')].find(r=>r.querySelector('.spec-k')?.textContent===label)?.querySelector('.spec-v')?.textContent,label);}
  for(const [capacity,watts,count,expected] of cases){
   await edit(capacity,watts);
   check(capacity+' kWp / '+watts+' Wp renders '+count+' modules and '+expected,
    await row(page,'Quantity')===count+' modules'&&await row(page,'Installed Array Size')===expected);
   check(capacity+' kWp / '+watts+' Wp has no NaN or Infinity in rendered proposal pages',await page.$$eval('.page',els=>els.every(e=>!/NaN|Infinity/.test(e.textContent))));
  }
  await edit('10','545');
  check('10 kWp pricing remains unchanged',await page.evaluate(()=>Finance.compute(Render.lastState).netInvestment===902100&&document.getElementById('v_exHeroNet').textContent==='₹9,02,100'));
  await page.evaluate(()=>window.__qsSaveNow());
  await page.reload({waitUntil:'networkidle0'});
  check('reload retains the correct installed array size',await row(page,'Installed Array Size')==='10.355 kWp');
  const id=await page.evaluate(()=>Proposals.activeId()),customer=await browser.newPage();customer.on('pageerror',e=>errors.push(e.message));
  await customer.goto(base+'/share.html?p='+encodeURIComponent(id),{waitUntil:'networkidle0'});
  check('saved Customer View uses the same correct value',await row(customer,'Installed Array Size')==='10.355 kWp');
  await customer.emulateMediaType('print');
  check('print view retains the same technical row',await row(customer,'Installed Array Size')==='10.355 kWp');
  await customer.close();
  const out=path.join(__dirname,'shots','array-size');fs.mkdirSync(out,{recursive:true});
  for(const name of fs.readdirSync(out))if(name.endsWith('.pdf'))fs.unlinkSync(path.join(out,name));
  await page.bringToFront();
  const cdp=await page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out,eventsEnabled:true});
  let downloadTimer;
  const downloadDone=new Promise((resolve,reject)=>{
   downloadTimer=setTimeout(()=>reject(new Error('PDF download did not complete')),120000);
   cdp.on('Browser.downloadProgress',event=>{
    if(event.state==='completed'){clearTimeout(downloadTimer);resolve();}
    if(event.state==='canceled'){clearTimeout(downloadTimer);reject(new Error('PDF download was canceled'));}
   });
  });
  downloadDone.catch(()=>{});
  await page.evaluate(()=>{
   const capture=window.html2canvas;
   window.html2canvas=async(el,options)=>{
    if(el.id==='pageTechSpec'){
     window.__arrayRow=[...el.querySelectorAll('tr')].find(r=>r.querySelector('.spec-k')?.textContent==='Installed Array Size')?.querySelector('.spec-v')?.textContent;
     if(window.__arrayRow!=='10.355 kWp')throw new Error('Incorrect installed array value in actual PDF snapshot');
    }
    const canvas=await capture(el,options);
    if(el.id==='pageTechSpec')window.__arrayCanvas=canvas.toDataURL('image/png');
    return canvas;
   };
   window.__restoreCapture=()=>{window.html2canvas=capture;};
  });
  try {
   await page.click('#downloadBtn');
   await page.waitForFunction(()=>document.getElementById('statusMsg').textContent.includes('Downloaded'),{timeout:120000});
   await downloadDone;
  } finally {clearTimeout(downloadTimer);await page.evaluate(()=>window.__restoreCapture());}
  check('actual PDF export captures 10.355 kWp, never a NaN placeholder',await page.evaluate(()=>__arrayRow==='10.355 kWp'&&document.getElementById('statusMsg').textContent.includes('Downloaded')));
  fs.writeFileSync(path.join(out,'technical-specification-pdf.png'),Buffer.from((await page.evaluate(()=>__arrayCanvas)).split(',')[1],'base64'));
  const pdf=fs.readdirSync(out).find(name=>name.endsWith('.pdf'));
  check('full quotation PDF downloaded with all 15 pages',!!pdf&&(fs.readFileSync(path.join(out,pdf),'latin1').match(/\/Type \/Page\b/g)||[]).length===15);
  check('no browser runtime errors',errors.length===0);
  console.log(`\n${passed} passed, 0 failed`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
