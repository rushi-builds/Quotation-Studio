/* Final-release edge cases found by inspection, independently of normal-path QA. */
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),F=require('../assets/js/finance'),puppeteer=require('puppeteer-core');
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('  ✓ '+name);};
const base={capacity:7,genFactor:1460,tariff:15,costPerKwp:90000,gstPercent:8.9,escalation:6,degradation:.5,customerType:'residential',moduleWattage:545,payAdvance:50,payDispatch:40,payCompletion:10};
const f=F.compute(base);
check('independent cost/GST/subsidy reconciliation',f.projectCost===630000&&Math.abs(f.gstAmount-56070)<1e-8&&f.grossTotal===686070&&f.subsidy===78000&&f.netInvestment===608070);
check('independent generation, savings and module count',f.annualGen===10220&&f.annualSaving===153300&&f.moduleCount===13);
check('payment amounts reconcile against gross, not net investment',Math.abs(f.pay.advance.amount+f.pay.dispatch.amount+f.pay.completion.amount-f.grossTotal)<1e-8);
let saving=0;for(let y=0;y<25;y++)saving+=10220*Math.pow(.995,y)*15*Math.pow(1.06,y);
check('25-year savings match an independent geometric projection',Math.abs(f.lifetimeSaving-saving)<.001);
const year=Math.floor(f.payback),cum=year?f.series.cumSaving[year-1]:0;
check('payback interpolates the same cumulative-savings series',Math.abs(cum+(f.payback-year)*f.series.saving[year]-f.netInvestment)<1e-6);
const npv=-f.netInvestment+f.series.saving.reduce((sum,v,i)=>sum+v/Math.pow(1+f.irr/100,i+1),0);
check('normal IRR satisfies discounted cash-flow equation',Math.abs(npv)<1);
for(const cf of [[0,0],[-100,0,0],[0,100,200],[100,200],[-100,200,-100],[NaN,2]])check('undefined or ambiguous IRR is not fabricated: '+JSON.stringify(cf),Number.isNaN(F.calcIRR(cf)));
check('valid zero-percent IRR remains valid',Math.abs(F.calcIRR([-100,100]))<1);
check('high IRR is solved rather than clamped at 1000%',Math.abs(F.calcIRR([-100,2100])-2000)<1);
check('empty system does not display a 452.5% IRR',Number.isNaN(F.compute({}).irr));
check('zero tariff has no finite IRR',Number.isNaN(F.compute({...base,tariff:0}).irr));
check('explicit zero CO2 factor is respected',F.compute({...base,co2Factor:0}).co2Annual===0&&F.compute({...base,co2Factor:0}).treesAnnual===0);
check('zero tree absorption does not silently use an invented divisor',Number.isNaN(F.compute({...base,treeFactor:0}).treesAnnual));
const loan=F.compute({...base,loanAmt:500000,loanRate:9,loanYears:10}).financing;
const r=.09/12,n=120,emi=500000*r/(1-Math.pow(1+r,-n));
check('EMI independently reconciles to reducing-balance formula',Math.abs(loan.emi-emi)<1e-7&&Math.abs(loan.totalInterest-(emi*n-500000))<1e-6);
(async()=>{
 const {default:chromium}=await import('@sparticuz/chromium');
 const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=process.env.QA_BASE||'http://127.0.0.1:8080',shots=path.join(__dirname,'shots');fs.mkdirSync(shots,{recursive:true});
  const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO2sAAAAASUVORK5CYII=';
  const file=path.join(shots,'audit-upload.png');fs.writeFileSync(file,Buffer.from(photo.split(',')[1],'base64'));
  await page.goto(url+'/quotation.html',{waitUntil:'networkidle0'});
  const canonical=await page.evaluate(()=>({heading:CONTENT.pageProjects.heading,project:PROJECT_IMAGES.PROJ_1_1,page:document.getElementById('img_about').getAttribute('src')}));
  const original=await page.evaluate(photo=>{
   CONTENT.pageProjects.heading='Private customer portfolio';PROJECT_IMAGES.PROJ_1_1=photo;
   document.getElementById('custName').value='Original Customer';Render.renderAll();window.__qsSaveNow();return Proposals.activeId();
  },photo);
  await (await page.$('#up_about')).uploadFile(file);
  await page.waitForFunction(()=>Proposals.active().pageImages?.img_about?.startsWith('data:image/png'));
  check('page photograph upload is actually saved, not just painted',await page.$eval('#img_about',e=>e.naturalWidth===1));
  await page.$eval('#pmNew',e=>e.click());
  check('New cannot inherit another proposal’s custom text',await page.evaluate(c=>CONTENT.pageProjects.heading===c,canonical.heading));
  check('New cannot inherit another proposal’s project photo',await page.evaluate(c=>PROJECT_IMAGES.PROJ_1_1===c,canonical.project));
  check('New cannot inherit another proposal’s page photograph',await page.$eval('#img_about',(e,c)=>e.getAttribute('src')===c,canonical.page));
  const partial=await page.evaluate(()=>{
   const p=Proposals.create({...StateStore.DEFAULTS,custName:'Legacy customer'},{content:{pageProjects:{heading:'Legacy heading'}}});
   const select=document.getElementById('proposalSelect');select.add(new Option('Legacy',p.id));return p.id;
  });
  await page.select('#proposalSelect',original);await page.select('#proposalSelect',partial);
  check('partial legacy content uses canonical siblings, never private previous values',await page.evaluate(c=>CONTENT.pageProjects.heading==='Legacy heading'&&PROJECT_IMAGES.PROJ_1_1===c,canonical.project));
  await page.select('#proposalSelect',original);await page.reload({waitUntil:'networkidle0'});
  check('returning to original restores its own text and both photo types',await page.evaluate(()=>CONTENT.pageProjects.heading==='Private customer portfolio'&&PROJECT_IMAGES.PROJ_1_1.startsWith('data:image/png')&&document.getElementById('img_about').getAttribute('src').startsWith('data:image/png')));
  const customer=await browser.newPage();customer.on('pageerror',e=>errors.push(e.message));await customer.goto(url+'/share.html?p='+original,{waitUntil:'networkidle0'});
  check('Customer View loads the saved page photograph',await customer.$eval('#img_about',e=>e.naturalWidth===1&&e.getAttribute('src').startsWith('data:image/png')));await customer.close();
  await page.evaluate(()=>{const create=URL.createObjectURL;URL.createObjectURL=b=>{window.__backup=b;return create(b);};StateStore.exportFile();});
  const backup=await page.evaluate(async()=>JSON.parse(await window.__backup.text()));
  check('portable backup includes page-image overrides',backup.proposal.pageImages.img_about===photo);
  const backupPath=path.join(shots,'audit-backup.json');fs.writeFileSync(backupPath,JSON.stringify(backup));
  await page.$eval('#custName',e=>{e.value='Edited immediately before import';e.dispatchEvent(new Event('input',{bubbles:true}));});
  await (await page.$('#importFile')).uploadFile(backupPath);
  await page.waitForFunction(id=>Proposals.activeId()!==id,{},original);
  check('import flushes the previous proposal’s pending edits',await page.evaluate(id=>Proposals.get(id).form.custName==='Edited immediately before import',original));
  check('import restores current proposal text and page photos',await page.evaluate(()=>document.getElementById('custName').value==='Original Customer'&&CONTENT.pageProjects.heading==='Private customer portfolio'&&document.getElementById('img_about').getAttribute('src').startsWith('data:image/png')));
  const acceptance=await page.evaluate(()=>{
   const id=Proposals.activeId(),b=Proposals.active();Object.assign(b,{status:'accepted',sentAt:'2026-01-01',acceptedAt:'2026-01-02',signerName:'Previous Signer',acceptanceMethod:'local-typed-acknowledgement',consentConfirmed:true});Proposals.put(b);
   const copies=[Proposals.duplicate(id),Proposals.saveAsVersion(id)];
   return {clean:copies.every(c=>c.status==='draft'&&!c.sentAt&&!c.acceptedAt&&!c.signerName&&!c.consentConfirmed&&!c.acceptanceMethod),original:Proposals.get(id).acceptedAt,version:copies[1].prevId===id};
  });
  check('duplicates and new versions do not inherit acceptance or sent milestones',acceptance.clean);
  check('original acknowledgement remains intact and version lineage is preserved',acceptance.original==='2026-01-02'&&acceptance.version);
  // A delayed file read must not modify a different proposal after switching.
  await page.evaluate(()=>{window.__Reader=FileReader;window.FileReader=class{readAsDataURL(){window.__pendingReader=this;}};});
  await (await page.$('#up_closing')).uploadFile(file);
  await page.$eval('#pmNew',e=>e.click());
  const closing=await page.$eval('#img_closing',e=>e.getAttribute('src'));
  await page.evaluate(photo=>window.__pendingReader.onload({target:{result:photo}}),photo);
  check('delayed uploads cannot cross proposal boundaries',await page.$eval('#img_closing',(e,src)=>e.getAttribute('src')===src,closing));
  await page.evaluate(()=>window.FileReader=window.__Reader);
  await page.evaluate(()=>{document.getElementById('capacity').value='0';Render.renderAll();});
  check('undefined IRR renders as a dash, not NaN or a fabricated percentage',await page.$eval('#v_exKpis',e=>!e.textContent.includes('NaN')&&!e.textContent.includes('452.5%')&&e.textContent.includes('—')));
  await page.evaluate(()=>window.__qsSaveNow());
  const quota=await page.evaluate(()=>{
    const originalId=Proposals.activeId(),index=Proposals.list().map(p=>p.id).sort().join(','),set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key.startsWith('qstudio.proposal.')&&key!=='qstudio.proposal.'+originalId)throw new DOMException('Quota','QuotaExceededError');return set.call(this,key,value);};
    document.getElementById('pmDup').click();
    const retained=Proposals.activeId()===originalId&&document.getElementById('proposalSelect').value===originalId;
    const noGhost=Proposals.list().map(p=>p.id).sort().join(',')===index;
    Storage.prototype.setItem=set;
    return {retained,noGhost};
  });
  check('quota failure creating a copy keeps the current proposal active',quota.retained);
  check('failed copy does not leave a ghost entry in the proposal index',quota.noGhost);
  check('index-write failure rolls back a new proposal without losing the original',await page.evaluate(()=>{
    const id=Proposals.activeId(),count=Proposals.list().length,set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==='qstudio.proposals.index')throw new DOMException('Quota','QuotaExceededError');return set.call(this,key,value);};
    const created=Proposals.create({custName:'Must not become an orphan'});
    Storage.prototype.setItem=set;
    return !Proposals.get(created.id)&&Proposals.list().length===count&&!!Proposals.get(id);
  }));
  check('out-of-range numeric entries are highlighted without silently rewriting them',await page.evaluate(()=>{
    for(const [id,value] of Object.entries({tariff:'-5',degradation:'101',treeFactor:'0',subsidyOverride:'9999999'})){
      const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
    }
    return ['tariff','degradation','treeFactor','subsidyOverride'].every(id=>document.getElementById(id).getAttribute('aria-invalid')==='true')&&document.getElementById('tariff').value==='-5';
  }));
  const midnight=await browser.newPage();await midnight.emulateTimezone('Asia/Calcutta');
  await midnight.evaluateOnNewDocument(()=>{
    const RealDate=Date,instant=RealDate.parse('2026-09-21T20:00:00Z');
    window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
    localStorage.clear();
  });
  await midnight.goto(url+'/quotation.html',{waitUntil:'networkidle0'});
  check('proposal date follows local India date after midnight, not UTC yesterday',await midnight.$eval('#propDate',e=>e.value==='2026-09-22'));
  await midnight.$eval('#pmNew',e=>e.click());
  check('New uses the same local calendar date',await midnight.$eval('#propDate',e=>e.value==='2026-09-22'));
  await midnight.close();
  check('no runtime errors',errors.length===0);
  console.log(`\n${passed} passed, 0 failed`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
