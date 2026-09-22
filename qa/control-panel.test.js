/* Real workspace interactions: no duplicate state, live summaries, search,
   disclosure navigation, proposal isolation, backups and responsive layouts. */
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const puppeteer=require('puppeteer-core');
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('  ✓ '+name);};
(async()=>{
 const {default:chromium}=await import('@sparticuz/chromium');
 const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';
  await page.setViewport({width:1440,height:1050});await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});await page.evaluate(()=>document.fonts.ready);
  check('workspace loads with fourteen collapsible input sections',await page.$$eval('.studio-section',e=>e.length===14));
  check('only the customer section starts open',await page.$$eval('.studio-section',els=>els.filter(e=>e.open).length===1&&els[0].open));
  check('original quotation controls remain unique',await page.evaluate(()=>Object.keys(StateStore.DEFAULTS).every(id=>document.querySelectorAll('#'+id).length===1)));
  check('search is not a quotation input',await page.evaluate(()=>!('studioSearch' in StateStore.collectForm())));
  check('Essentials mode has accessible state and equipment access',await page.evaluate(()=>document.getElementById('modeEss').getAttribute('aria-pressed')==='true'&&document.querySelector('[data-section="moduleMake"]').checkVisibility()&&!document.querySelector('[data-section="companyName"]').checkVisibility()));
  check('live summary matches the existing Finance engine',await page.evaluate(()=>{const f=Finance.compute(Render.lastState);return document.querySelector('[data-metric="investment"]').textContent===Finance.fmtINR(f.netInvestment)&&document.querySelector('[data-metric="energy"]').textContent===Finance.fmtNum(f.annualGen)+' kWh';}));
  check('local save is persistent and honestly labelled',await page.$eval('#saveIndicator',e=>e.textContent==='Saved locally'&&e.dataset.state==='saved'));
  const shots=path.join(__dirname,'shots');fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'control-panel-desktop.png')});
  async function edit(id,value){await page.$eval('#'+id,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},value);}
  async function search(query){await page.$eval('#studioSearch',(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},query);}
  await edit('custName','Workspace Test Customer');await edit('capacity','10');
  check('customer and capacity edits update the visible cover and summary',await page.evaluate(()=>document.getElementById('v_coverCustName').textContent==='Workspace Test Customer'&&document.getElementById('v_coverCapacity').textContent==='10 kWp'&&document.querySelector('[data-metric="capacity"]').textContent==='10 kWp'&&document.querySelector('[data-section="custName"] summary small').textContent==='Workspace Test Customer'));
  check('proposal selector reflects the current customer without reload',await page.$eval('#proposalSelect',e=>e.selectedOptions[0].textContent.includes('Workspace Test Customer')));
  await page.waitForFunction(()=>document.getElementById('saveIndicator').dataset.state==='saved');
  check('edits persist to the active proposal',await page.evaluate(()=>Proposals.active().form.capacity==='10'&&Proposals.active().form.custName==='Workspace Test Customer'));
  const original=await page.evaluate(()=>Proposals.activeId());
  await search('module make');check('search finds collapsed fields',await page.$eval('#studioSearchResults',e=>!e.hidden&&e.textContent.includes('Module make')));
  await page.click('#studioSearchResults button');
  check('search result opens its section and focuses the existing input',await page.evaluate(()=>document.activeElement.id==='moduleMake'&&document.querySelector('[data-section="moduleMake"]').open&&document.getElementById('studioSearchResults').hidden));
  await search('public destination');await page.click('#studioSearchResults button');
  check('search reveals advanced settings and switches modes without changing values',await page.evaluate(()=>document.activeElement.id==='galleryUrl'&&document.getElementById('modeAll').getAttribute('aria-pressed')==='true'&&document.getElementById('capacity').value==='10'));
  await edit('galleryUrl','https://example.com/gallery');await page.waitForFunction(()=>document.getElementById('galleryStatus').textContent.length>0);
  check('QR controls still feed the existing experience renderer',await page.evaluate(()=>Render.lastState.galleryUrl==='https://example.com/gallery'&&document.querySelector('[data-section="galleryUrl"] summary small').textContent.includes('Link entered')));
  await search('zzzzdoesnotexist');check('empty search provides useful feedback',await page.$eval('#studioSearchResults',e=>e.textContent.includes('No matching settings')));
  await page.focus('#studioSearch');await page.keyboard.press('Escape');check('Escape clears search',await page.$eval('#studioSearch',e=>e.value===''));
  await search('projects portfolio heading');check('search indexes nested Advanced Edit fields',await page.$eval('#studioSearchResults',e=>e.querySelectorAll('button').length>0));
  await page.click('#studioSearchResults button');
  check('nested content search opens all ancestor disclosures',await page.evaluate(()=>document.activeElement.closest('#advancedPanel')&&document.getElementById('advancedPanel').open));
  await page.evaluate(()=>document.getElementById('advancedPanel').open=false);
  await page.click('#advToggle');check('content disclosure opens with one click',await page.$eval('#advancedPanel',e=>e.open));
  await page.click('#advToggle');check('content disclosure closes with one click',await page.$eval('#advancedPanel',e=>!e.open));
  await edit('payAdvance','60');check('payment validation appears without changing financial inputs',await page.evaluate(()=>!document.querySelector('.studio-feedback').hidden&&document.querySelector('.studio-feedback').textContent.includes('100%')&&document.getElementById('payAdvance').value==='60'));
  await page.click('.studio-feedback button');check('validation action opens and focuses the relevant field',await page.evaluate(()=>document.activeElement.id==='payAdvance'&&document.querySelector('[data-section="payAdvance"]').open));
  await edit('payAdvance','50');await edit('loanAmt','300000');check('incomplete financing gets a clear warning',await page.$eval('.studio-feedback',e=>!e.hidden&&e.textContent.includes('interest rate')));
  await edit('loanRate','9');await edit('loanYears','5');
  check('financing summary and page count use the current engine and visible pages',await page.evaluate(()=>document.querySelector('[data-section="payAdvance"] summary small').textContent.includes('Financing included')&&document.querySelector('.studio-page-count').textContent===Render.lastVisible.length+' pages'&&Render.lastVisible.some(p=>p.id==='pageFinance')));
  await edit('loanAmt','');await edit('loanRate','');await edit('loanYears','');
  check('warnings clear after corrections',await page.$eval('.studio-feedback',e=>e.hidden));
  await page.evaluate(()=>document.querySelector('[data-section="moduleMake"]').open=true);
  await page.click('[data-section="moduleMake"] .studio-view-page');
  check('related-page action navigates to Technical Specification',await page.$eval('#pageTechSpec',e=>e.getBoundingClientRect().top<innerHeight&&e.getBoundingClientRect().bottom>0));
  // Save current inputs, then duplicate through the actual manager action.
  await page.evaluate(()=>document.querySelector('.studio-management').open=true);await page.click('#pmDup');
  const duplicate=await page.evaluate(()=>Proposals.activeId());check('duplicate creates another proposal',duplicate!==original);
  await edit('custName','Separate Proposal');await page.waitForFunction(()=>Proposals.active().form.custName==='Separate Proposal');
  await page.select('#proposalSelect',original);
  check('switching proposals restores matching summary, inputs and preview',await page.evaluate(()=>document.getElementById('custName').value==='Workspace Test Customer'&&document.querySelector('[data-section="custName"] summary small').textContent==='Workspace Test Customer'&&document.getElementById('v_coverCustName').textContent==='Workspace Test Customer'));
  await search('projects portfolio heading');await page.click('#studioSearchResults button');
  await page.evaluate(()=>{document.activeElement.value='Portfolio edited in current proposal';document.activeElement.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>Proposals.active().content.pageProjects.heading==='Portfolio edited in current proposal');
  check('content edits after proposal switching remain isolated',await page.evaluate(id=>Proposals.get(id).content.pageProjects.heading!=='Portfolio edited in current proposal',duplicate));
  await page.reload({waitUntil:'networkidle0'});
  check('reload restores saved data and saved mode preference',await page.evaluate(()=>document.getElementById('capacity').value==='10'&&document.getElementById('custName').value==='Workspace Test Customer'&&document.getElementById('modeAll').getAttribute('aria-pressed')==='true'));
  await page.evaluate(()=>document.querySelectorAll('.studio-section').forEach(e=>e.open=false));
  await page.screenshot({path:path.join(shots,'control-panel-all-settings.png')});
  // Storage failure must be visible, and file export must still contain edits.
  await page.evaluate(()=>{window.__realSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new DOMException('Quota','QuotaExceededError');};});
  await edit('custName','Unsaved but recoverable');await page.waitForFunction(()=>document.getElementById('saveIndicator').dataset.state==='error');
  check('storage failure never claims the change was saved',await page.$eval('#saveIndicator',e=>e.textContent==='Not saved'));
  await page.select('#proposalSelect',duplicate);
  check('failed save prevents proposal switching and restores the correct selector',await page.evaluate(id=>Proposals.activeId()===id&&document.getElementById('proposalSelect').value===id&&document.getElementById('custName').value==='Unsaved but recoverable',original));
  await page.evaluate(()=>{window.__realOpen=window.open;window.__opened=false;window.open=()=>{window.__opened=true;};});
  await page.click('#custViewBtn');check('failed save cannot open a stale Customer View',await page.evaluate(()=>!window.__opened));
  await page.evaluate(()=>window.open=window.__realOpen);
  await page.evaluate(()=>{window.__realCreate=URL.createObjectURL;URL.createObjectURL=b=>{window.__backupBlob=b;return window.__realCreate(b);};StateStore.exportFile();});
  check('backup includes unsaved form and content after storage failure',await page.evaluate(async()=>{const b=JSON.parse(await window.__backupBlob.text());return b.proposal.form.custName==='Unsaved but recoverable'&&b.proposal.content.pageProjects.heading==='Portfolio edited in current proposal';}));
  await page.evaluate(()=>{Storage.prototype.setItem=window.__realSetItem;URL.createObjectURL=window.__realCreate;window.__qsSaveNow();});
  check('saving recovers after storage becomes available',await page.$eval('#saveIndicator',e=>e.dataset.state==='saved'));
  const customer=await browser.newPage();customer.on('pageerror',e=>errors.push(e.message));await customer.goto(base+'/share.html?p='+original,{waitUntil:'networkidle0'});
  check('Customer View has current saved values and no workspace controls',await customer.evaluate(()=>document.getElementById('v_coverCustName').textContent==='Unsaved but recoverable'&&!document.querySelector('.studio-overview')));await customer.close();
  await page.emulateMediaType('print');check('workspace is excluded from print',await page.$eval('.form-panel',e=>!e.checkVisibility()));await page.emulateMediaType('screen');
  await page.setViewport({width:390,height:844});await page.click('#modeEss');
  await page.evaluate(()=>{document.querySelector('[data-section="custName"]').open=false;window.scrollTo(0,0);});
  check('mobile has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check('mobile summary and controls fit the viewport',await page.$$eval('.studio-overview,.studio-section:not([data-adv]),.form-actions',els=>els.every(e=>e.getBoundingClientRect().right<=innerWidth&&e.getBoundingClientRect().left>=0)));
  await page.screenshot({path:path.join(shots,'control-panel-mobile.png')});
  await search('inverter make');await page.click('#studioSearchResults button');check('mobile search still reveals the selected control',await page.evaluate(()=>document.activeElement.id==='inverterMake'&&document.activeElement.checkVisibility()));
  check('no runtime errors',errors.length===0);
  console.log(`\n${passed} passed, 0 failed`);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
