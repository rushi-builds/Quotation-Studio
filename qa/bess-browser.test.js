/* BESS end-to-end: real controls, storage lifecycle, Customer View and actual PDFs. */
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core'),fixture=require('./bess-fixture');
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('  ✓ '+name);};
(async()=>{
 const {default:chromium}=await import('@sparticuz/chromium');
 const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('dialog',d=>d.accept());
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';await page.setViewport({width:1440,height:1200});await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});await page.evaluate(()=>document.fonts.ready);
  const original=await page.evaluate(()=>({form:StateStore.collectForm(),finance:JSON.stringify(Finance.compute(Render.lastState)),diagram:document.getElementById('v_tsDiagram').innerHTML}));
  check('No is default; fifteen solar pages and no battery input exposure',await page.evaluate(()=>!bessEnabled.checked&&bessFields.hidden&&Render.lastVisible.length===15&&!document.getElementById('pageBessOverview').checkVisibility()));
  check('new BESS section is visible in Essentials',await page.$eval('[data-section=bessEnabled]',e=>e.checkVisibility()&&!e.hasAttribute('data-adv')));
  await page.type('#studioSearch','battery');await page.click('#studioSearchResults li button');
  check('search reveals the BESS choice without enabling it',await page.evaluate(()=>document.querySelector('[data-section=bessEnabled]').open&&!bessEnabled.checked&&document.activeElement.dataset.bessChoice==='yes'));
  await page.$eval('[data-section=bessEnabled]',e=>e.open=true);await page.click('[data-bess-choice=yes]');await page.waitForFunction(()=>Render.lastVisible.length===17);
  check('Yes reveals battery inputs and two navigable pages',await page.evaluate(()=>!bessFields.hidden&&document.querySelectorAll('#pageNav .nav-chip').length===17&&document.querySelector('[data-bess-choice=yes]').getAttribute('aria-pressed')==='true'));
  check('blank battery does not invent runtime or savings',await page.$eval('#bessAssessmentBody',e=>e.textContent.includes('Not established')&&e.textContent.includes('Resilience first')));
  async function apply(values){await page.evaluate(v=>{StateStore.applyForm(v);Render.renderAll();},values);}
  async function geometry(label,target=page){
   const bad=await target.evaluate(()=>[...document.querySelectorAll('.page')].filter(p=>p.checkVisibility()).flatMap(p=>{
    const box=p.getBoundingClientRect(),body=p.querySelector('.pg-body'),foot=p.querySelector('.pg-foot'),issues=[];
    if(p.scrollHeight>1124)issues.push(p.id+' scroll '+p.scrollHeight);
    if(body&&foot)for(const e of body.children){if(!e.checkVisibility())continue;const r=e.getBoundingClientRect();if(r.bottom>foot.getBoundingClientRect().top+1||r.left<box.left-1||r.right>box.right+1)issues.push(p.id+': '+e.className);}
    for(const el of p.querySelectorAll('.bess-metric,.bess-panel,.bess-mode-grid>div'))if(el.scrollWidth>el.clientWidth+1)issues.push(p.id+' card overflow');
    return issues;
   }));check(label+' stays inside A4 and above footers: '+bad.join(', '),bad.length===0);
  }
  await geometry('Blank battery pages');await apply(fixture);
  check('all BESS inputs are in both canonical form and live state',await page.evaluate(v=>Object.keys(v).every(k=>StateStore.collectForm()[k]===v[k]&&Render.lastState[k]===v[k]),fixture));
  check('capacity, backup and storage-only benefit synchronize',await page.evaluate(()=>bessOverviewBody.textContent.includes('10 kWh')&&bessOverviewBody.textContent.includes('4.28 hours')&&bessAssessmentBody.textContent.includes('21,940')));
  check('storage payback beyond assumed life is clearly flagged',await page.$eval('#bessAssessmentBody',e=>e.textContent.includes('Beyond entered service life')));
  check('solar finance and approved small-house diagram remain unchanged',await page.evaluate(v=>JSON.stringify(Finance.compute(Render.lastState))===v.finance&&document.getElementById('v_tsDiagram').innerHTML===v.diagram,original));
  check('solar-only scope is explicit in executive, investment, savings and terms',await page.evaluate(()=>['v_exSub','v_inSub','v_svSub'].every(id=>document.getElementById(id).textContent.includes('Solar-only'))&&v_tmSub.textContent.includes('separate written agreement')));
  check('new image is loaded and honestly captioned as a concept',await page.$eval('.bess-hero img',e=>e.complete&&e.naturalWidth>0&&e.parentElement.textContent.includes('not a manufacturer')));
  check('printed assumptions include efficiencies, charging limit and reserve',await page.$eval('#bessAssessmentBody',e=>['90% / 95%','3 kW','20% reserve','300','12 years'].every(x=>e.textContent.includes(x))));
  check('all three audio briefings disclose separately priced storage',await page.evaluate(()=>Briefing.scriptFor(Render.lastState,'en').join(' ').includes('solar-only')&&Briefing.scriptFor(Render.lastState,'hi').join(' ').includes('बैटरी स्टोरेज')&&Briefing.scriptFor(Render.lastState,'mr').join(' ').includes('बॅटरी स्टोरेज')));
  await geometry('Completed battery pages');
  await page.$eval('#bessCapacity',e=>e.closest('details').open=true);
  await page.focus('#bessCapacity');await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.type('20');await page.waitForFunction(()=>Render.lastState.bessCapacity==='20'&&bessOverviewBody.textContent.includes('20 kWh'));
  check('typing a battery rating updates saved capacity and requires renewed backup/price review',await page.evaluate(()=>{__qsSaveNow();return Proposals.active().form.bessCapacity==='20'&&Proposals.active().form.bessBackupReady==='pending'&&bessCost.value===''&&bessOverviewBody.textContent.includes('Design pending');}));
  await apply({bessBackupReady:'yes',bessCost:'300000'});check('explicit reconfirmation publishes runtime for the new capacity',await page.$eval('#bessOverviewBody',e=>e.textContent.includes('8.55 hours')));
  await apply({...fixture,bessSourceRate:''});check('a missing charging tariff removes the savings figure',await page.$eval('#bessAssessmentBody',e=>e.textContent.includes('Inputs pending')&&!e.textContent.includes('21,940')));
  await apply({...fixture,bessMake:'QA <img src=x onerror=alert(1)> model'});check('battery identity is literal text, not executable HTML',await page.$eval('.bess-specname',e=>!e.querySelector('img')&&e.textContent.includes('<img')));await apply(fixture);

  await apply({bessLoad:'6'});check('overloaded backup does not claim hours',await page.evaluate(()=>Bess.compute(Render.lastState,Finance.compute(Render.lastState)).backupHours===null&&bessValidation.textContent.includes('exceeds')));
  await apply({...fixture,bessBackupReady:'pending'});check('unconfirmed backup stays pending despite complete capacity',await page.$eval('#bessOverviewBody',e=>e.textContent.includes('Design pending')));
  await apply({...fixture,bessCoupling:'ac'});check('AC architecture updates the concept diagram',await page.$eval('.bess-flow',e=>e.textContent.includes('AC-coupled concept')));
  await apply({...fixture,bessSourceRate:'15'});check('unfavourable export credit yields no positive payback',await page.$eval('#bessAssessmentBody',e=>e.textContent.includes('No positive payback')));
  await apply({...fixture,bessUseCase:'tou'});check('TOU tariff field and assessment label synchronize',await page.evaluate(()=>document.querySelector('label[for=bessSourceRate]').textContent.includes('Off-peak')&&bessAssessmentBody.textContent.includes('Time-of-use shifting')));
  await apply({...fixture,bessUseCase:'backup'});check('backup-first hides economics inputs and drops savings claims',await page.evaluate(()=>bessEconomics.hidden&&!bessAssessmentBody.textContent.includes('21,940')&&bessAssessmentBody.textContent.includes('not represented as bill savings')));
  await apply(fixture);await page.click('[data-bess-choice=no]');await page.waitForFunction(()=>Render.lastVisible.length===15);
  check('No preserves the entered draft but removes all BESS pages',await page.evaluate(()=>bessFields.hidden&&bessCapacity.value==='10'&&Render.lastState.bessEnabled===false));
  check('No restores the original solar summary wording and briefing',await page.evaluate(()=>!v_exSub.textContent.includes('battery')&&!Briefing.scriptFor(Render.lastState,'en').join(' ').includes('Optional battery')));
  await page.click('[data-bess-choice=yes]');await page.waitForFunction(()=>Render.lastVisible.length===17);await page.evaluate(()=>__qsSaveNow());
  const savedId=await page.evaluate(()=>Proposals.activeId());await page.reload({waitUntil:'networkidle0'});
  check('reload restores BESS including hidden operating assumptions',await page.evaluate(()=>bessEnabled.checked&&bessReserve.value==='20'&&Render.lastVisible.length===17));
  await page.evaluate(()=>document.getElementById('pmDup').click());await page.waitForFunction(id=>Proposals.activeId()!==id,{},savedId);
  check('duplicate keeps all battery fields',await page.evaluate(v=>Object.keys(v).every(k=>Proposals.active().form[k]===v[k]),fixture));
  await page.evaluate(()=>document.getElementById('pmVersion').click());check('new version preserves battery supplement',await page.evaluate(()=>Proposals.active().form.bessEnabled&&Proposals.active().form.bessCapacity==='10'));
  const output=path.join(__dirname,'shots','bess');fs.mkdirSync(output,{recursive:true});for(const f of fs.readdirSync(output))if(/\.(json|pdf)$/.test(f))fs.unlinkSync(path.join(output,f));
  const cdp=await page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:output,eventsEnabled:true});
  async function download(action){let timer,name;const done=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Download timeout')),150000);cdp.once('Browser.downloadWillBegin',e=>name=e.suggestedFilename);const onProgress=e=>{if(e.state==='completed'||e.state==='canceled'){cdp.off('Browser.downloadProgress',onProgress);clearTimeout(timer);e.state==='completed'?resolve():reject(new Error('Canceled'));}};cdp.on('Browser.downloadProgress',onProgress);});done.catch(()=>{});try{await action();await done;return path.join(output,name);}finally{clearTimeout(timer);}}
  const json=await download(()=>page.evaluate(()=>document.getElementById('exportBtn').click()));const payload=JSON.parse(fs.readFileSync(json,'utf8'));
  check('actual JSON export retains every battery field',Object.keys(fixture).every(k=>payload.proposal.form[k]===fixture[k]));
  await page.evaluate(()=>document.getElementById('pmNew').click());check('New starts with BESS off and no inherited ratings',await page.evaluate(()=>!bessEnabled.checked&&bessCapacity.value===''&&Render.lastVisible.length===15));
  const newId=await page.evaluate(()=>Proposals.activeId());await(await page.$('#importFile')).uploadFile(json);await page.waitForFunction(id=>Proposals.activeId()!==id,{},newId);
  check('actual JSON import restores visible BESS and its assumptions',await page.evaluate(()=>bessEnabled.checked&&bessRte.value==='90'&&Render.lastVisible.length===17));
  await page.evaluate(()=>{const old=Proposals.create({capacity:'7',custName:'Legacy solar proposal'});document.getElementById('proposalSelect').add(new Option('Legacy',old.id));proposalSelect.value=old.id;proposalSelect.dispatchEvent(new Event('change',{bubbles:true}));});
  check('loading an old proposal clears prior BESS state',await page.evaluate(()=>!bessEnabled.checked&&bessMake.value===''&&bessCapacity.value===''&&Render.lastVisible.length===15));
  await apply({...original.form,...fixture});
  await page.evaluate(()=>{optName.value='Solar design A';optSave.click();StateStore.applyForm({capacity:'10'});Render.renderAll();document.querySelector('#optList button[data-act=apply]').click();});
  check('applying a saved solar option retains the proposal-level battery supplement',await page.evaluate(()=>Render.lastState.capacity==='7'&&bessCapacity.value==='10'&&bessEnabled.checked));
  await page.evaluate(()=>{window.__qsOptions=[];Render.renderAll();__qsSaveNow();});const customerId=await page.evaluate(()=>Proposals.activeId());
  const customer=await browser.newPage();customer.on('pageerror',e=>errors.push(e.message));await customer.setViewport({width:1200,height:1000});await customer.goto(base+'/share.html?p='+encodeURIComponent(customerId),{waitUntil:'networkidle0'});await customer.evaluate(()=>document.fonts.ready);
  check('Customer View shows both live battery pages with matching values',await customer.evaluate(()=>Render.lastVisible.length===17&&bessAssessmentBody.textContent.includes('21,940')&&bessOverviewBody.textContent.includes('4.28 hours')));await geometry('Customer View',customer);
  await page.setViewport({width:390,height:844});await page.$eval('[data-section=bessEnabled]',e=>e.open=true);await geometry('Mobile-scaled A4');check('mobile has no document horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewport({width:1440,height:1200});
  await apply({bessMake:'Long battery equipment identification — '.repeat(3).slice(0,120),bessInverter:'Long compatible inverter reference — '.repeat(3).slice(0,120),bessWarranty:'OEM warranty and cycle limits require confirmation — '.repeat(3).slice(0,120)});await geometry('Long battery names and warranty');
  await apply({...fixture,bessDod:'101',bessReserve:'-1',bessDays:'999',bessRte:'0',bessOm:'-100'});await geometry('Invalid-input warnings');check('invalid assumptions suppress financial output',await page.$eval('#bessAssessmentBody',e=>e.textContent.includes('Inputs pending')&&!e.textContent.includes('21,940')));
  await apply({...fixture,capacity:'25',customerType:'commercial',monthlyBill:'50000',loanAmt:'500000',loanRate:'9',loanYears:'10',bomModules:'600000',bomInverter:'150000',bomStructure:'150000',bomBos:'100000',bomInstall:'100000',bomLiaison:'50000',availableArea:'200',arkaUrl:'https://example.com/layout',pvsystUrl:'https://example.com/report'});
  await page.evaluate(()=>{window.__qsOptions=[{id:'a',name:'Option A',fields:{capacity:'25'}},{id:'b',name:'Option B',fields:{capacity:'30'}}];Render.renderAll();});
  check('BESS + options + financing produces nineteen pages',await page.evaluate(()=>Render.lastVisible.length===19&&downloadLabel.textContent.includes('19')));
  check('system comparison explicitly excludes proposal-level battery upgrade',await page.$eval('#v_opSub',e=>e.textContent.includes('proposal-level')&&e.textContent.includes('Solar-only')));
  await geometry('Full optional-content stress case');await page.emulateMediaType('print');await geometry('Print with BESS and all optional pages');await page.emulateMediaType('screen');
  const counts=await page.evaluate(()=>{const h=Experience.buildPowerPages(Render.lastState),ok=[...h.children].every(p=>p.lastElementChild.previousElementSibling.getBoundingClientRect().bottom<p.querySelector('footer').getBoundingClientRect().top-4&&p.scrollHeight<=1124),text=h.textContent;h.remove();return {ok,scope:text.includes('Solar prices, savings and milestones below exclude storage'),price:text.includes('3,00,000')};});check('two-page Power Proposal fits storage disclosure with optional refs',counts.ok&&counts.scope&&counts.price);
  await page.evaluate(()=>{window.__bessNativeCapture=html2canvas;window.__bessCaptures=[];window.__bessProofs={};window.html2canvas=async(el,options)=>{const body=el.querySelector('.pg-body'),foot=el.querySelector('.pg-foot');if(body&&foot&&[...body.children].some(c=>c.checkVisibility()&&c.getBoundingClientRect().bottom>foot.getBoundingClientRect().top+1))throw new Error('PDF footer collision '+el.id);const c=await __bessNativeCapture(el,options);__bessCaptures.push(el.id);if(el.classList.contains('bess-page')||el.id==='powerPage2')__bessProofs[el.id]=c.toDataURL('image/png');return c;};});
  const full=await download(()=>page.evaluate(()=>Exporter.exportPdf(()=>{}, {format:'full'})));
  check('actual full PDF contains all nineteen pages', (fs.readFileSync(full,'latin1').match(/\/Type \/Page\b/g)||[]).length===19);
  check('actual PDF captures both BESS pages without footer collision',await page.evaluate(()=>__bessCaptures.includes('pageBessOverview')&&__bessCaptures.includes('pageBessAssessment')));
  const power=await download(()=>page.evaluate(()=>Exporter.exportPdf(()=>{}, {format:'power'})));
  check('actual Power Proposal remains two pages with storage scope notice',(fs.readFileSync(power,'latin1').match(/\/Type \/Page\b/g)||[]).length===2);
  const proofs=await page.evaluate(()=>__bessProofs);for(const [id,data] of Object.entries(proofs))fs.writeFileSync(path.join(output,id+'.png'),Buffer.from(data.split(',')[1],'base64'));
  await page.evaluate(()=>{window.html2canvas=__bessNativeCapture;window.__qsOptions=[];document.getElementById('resetBtn').click();});
  check('reset clears BESS ratings and returns to fifteen pages',await page.evaluate(()=>!bessEnabled.checked&&bessCapacity.value===''&&bessCost.value===''&&Render.lastVisible.length===15));
  await page.evaluate(()=>__qsSaveNow());await customer.reload({waitUntil:'networkidle0'});check('Customer View removes BESS after the proposal is reset',await customer.evaluate(()=>Render.lastVisible.length===15&&!document.getElementById('pageBessOverview').checkVisibility()));
  check('no runtime or console errors: '+errors.join('; '),errors.length===0);
  console.log(`\n${passed} passed, 0 failed`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
