'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const {default:c}=await import('@sparticuz/chromium');
 const browser=await chromium.launch({executablePath:await c.executablePath(),args:c.args.filter(a=>a!=='--single-process'),headless:true});
 try{
  const page=await browser.newPage({acceptDownloads:true}),errors=[];
  page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.QA_BASE||'http://127.0.0.1:8080')+'/quotation.html');
  await page.waitForFunction(()=>!!window.Render?.lastState);
  const fields={systemEnabled:true,systemInclude:true,systemTemplate:'carport',systemName:'Solar Carport',systemPriceMode:'included',systemPrice:'125000',systemAreaM2:'48',systemHeightM:'2.8',systemBays:'2',systemWeatherProtection:'rain',systemRoofing:'Project-specific roofing',systemDrainage:'Agreed drain connection',systemAcceptance:'Agreed ingress inspection'};
  await page.evaluate(fields=>{StateStore.applyForm({...StateStore.DEFAULTS,...fields});Render.renderAll();__qsSaveNow();},fields);
  const check=(actual,label)=>{for(const[k,v]of Object.entries(fields))assert.equal(actual[k],v,label+' '+k);};
  let id=await page.evaluate(()=>Proposals.activeId());
  // Invoke the real button handlers; the proposal-manager drawer starts closed.
  await page.evaluate(()=>document.getElementById('pmDup').click());
  await page.waitForFunction(id=>Proposals.activeId()!==id,id);
  check(await page.evaluate(()=>Proposals.active().form),'Duplicate');
  const pending=page.waitForEvent('download');await page.evaluate(()=>document.getElementById('exportBtn').click());
  const download=await pending,folder=path.join(__dirname,'shots','system-packages');fs.mkdirSync(folder,{recursive:true});
  const file=path.join(folder,'lifecycle.json');await download.saveAs(file);
  check(JSON.parse(fs.readFileSync(file)).proposal.form,'JSON backup');
  id=await page.evaluate(()=>Proposals.activeId());await page.evaluate(()=>document.getElementById('pmNew').click());
  await page.waitForFunction(id=>Proposals.activeId()!==id,id);
  id=await page.evaluate(()=>Proposals.activeId());await page.locator('#importFile').setInputFiles(file);
  await page.waitForFunction(id=>Proposals.activeId()!==id,id);
  check(await page.evaluate(()=>Render.lastState),'JSON import');assert.deepEqual(errors,[]);
  console.log('PASS: actual Duplicate → JSON backup → New → file import retains all '+Object.keys(fields).length+' structural, pricing and include fields.');
  await page.evaluate(()=>{StateStore.applyForm({capacity:'7',customerType:'commercial',bomModules:'250000',bomInverter:'70000',bomStructure:'50000',bomBos:'30000',bomInstall:'30000',bomLiaison:'15200',payCompletion:'5',loanAmt:'200000',loanRate:'9',loanYears:'5'});Render.renderAll();});
  const png=await page.evaluate(async()=>{const src=document.getElementById('pageInvestment'),copy=src.cloneNode(true);copy.style.transform='none';copy.querySelectorAll('canvas').forEach((c,i)=>c.getContext('2d').drawImage(src.querySelectorAll('canvas')[i],0,0));const host=document.createElement('div');host.className='pdf-snapshot';host.append(copy);document.body.append(host);try{return(await html2canvas(copy,{scale:1.2,logging:false,backgroundColor:'#fff'})).toDataURL();}finally{host.remove();}});
  fs.writeFileSync(path.join(folder,'investment-dense.png'),Buffer.from(png.split(',')[1],'base64'));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
