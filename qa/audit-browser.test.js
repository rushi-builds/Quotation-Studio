/* Audit regression for PR #7 integration; run against QA_BASE (default :8080). */
'use strict';
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');
let passed = 0;
function check(name, condition) { assert(condition, name); passed++; console.log('  ✓ ' + name); }
(async () => {
  const {default: chromium} = await import('@sparticuz/chromium');
  const browser = await puppeteer.launch({executablePath: process.env.CHROMIUM_PATH || await chromium.executablePath(), args: chromium.args.filter(arg => arg !== '--single-process'), headless:true});
  const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
  try {
    const page = await browser.newPage();
    const errors=[];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    await page.setViewport({width:1440,height:1100});
    await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});
    await page.evaluate(() => document.fonts.ready);
    async function edit(fields) {
      await page.evaluate(fields => {for(const [id,value] of Object.entries(fields)) {const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}},fields);
    }
    check('bill comparison hidden without customer bill', !await page.$eval('#v_wsBillSlashCard',e=>e.checkVisibility()));
    await edit({monthlyBill:'100'});
    check('low bill never increases to invented ₹650 floor', (await page.$eval('#v_bscAfterVal',e=>e.textContent)).includes('₹0'));
    await edit({monthlyBill:'50000'});
    check('after bar follows real ratio', parseFloat(await page.$eval('#v_bscAfterBar',e=>e.style.width))>50);
    await edit({tariff:'0'});
    check('zero tariff gives no bill savings', (await page.$eval('#v_bscSavedVal',e=>e.textContent)).includes('₹0'));
    await edit({customerType:'commercial',tariff:'15',corpTaxRate:'30',depreciationRate:'20'});
    check('tax assumptions render live', (await page.$eval('#v_inTaxSaved',e=>e.textContent))==='₹37,800');
    check('tax caption reflects actual assumptions', (await page.$eval('#v_inTaxRate',e=>e.textContent))==='30%');
    await edit({corpTaxRate:'0'});
    check('zero tax assumption hides illustration',!await page.$eval('#v_inTaxShieldBanner',e=>e.checkVisibility()));
    await edit({corpTaxRate:'25',depreciationRate:'40'});
    const overflow = await page.evaluate(()=>[...document.querySelectorAll('.page')].filter(p=>p.checkVisibility()).map(p=>{
      const body=p.querySelector('.pg-body');const foot=p.querySelector('.pg-foot');
      const overlap=body && foot ? [...body.children].some(c=>c!==foot && c.checkVisibility() && getComputedStyle(c).position!=='absolute' && c.getBoundingClientRect().bottom > foot.getBoundingClientRect().top+1):false;
      return {id:p.id,overlap,extra:body?body.scrollHeight-body.clientHeight:0};
    }).filter(p=>p.overlap || p.extra>2));
    check('bill + commercial tax pages fit A4 without footer overlap: '+JSON.stringify(overflow),overflow.length===0);
    for(const preset of ['3kw','5kw','25kw','100kw']) {
      await edit({bomModules:'1000',loanAmt:'500000',loanRate:'9',loanYears:'5',subsidyOverride:'123',arkaUrl:'https://example.com/old-arka',pvsystUrl:'https://example.com/old-pv'});
      await page.click('[data-preset="'+preset+'"]');
      const values=await page.evaluate(()=>({s:StateStore.collectForm(),cover:document.getElementById('v_coverCapacity').textContent}));
      check(preset+' keeps valid equipment selections',!!values.s.moduleMake && !!values.s.moduleTech && !!values.s.inverterMake);
      check(preset+' syncs our live cover',values.cover===values.s.capacity+' kWp');
      check(preset+' clears stale design data',!values.s.arkaUrl && !values.s.pvsystUrl && !values.s.bomModules && !values.s.loanAmt && !values.s.subsidyOverride);
      await page.evaluate(()=>window.__qsSaveNow());
      await page.reload({waitUntil:'networkidle0'});
      check(preset+' equipment survives save/reload',await page.$eval('#moduleMake', (e,make)=>e.value===make, values.s.moduleMake));
    }
    // Fixture remains local to this test browser, never touching a user's proposal.
    const fixture=await page.evaluate(()=>({form:{...StateStore.DEFAULTS,propDate:'2099-01-01',custName:'Customer <img src=x onerror=alert(1)>',companyPhone:'9309486769',companyName:'KTM <svg onload=alert(1)>',capacity:'12.5',propRef:'AUDIT/7'}}));
    async function share(overrides={},extras={}) {
      const id=await page.evaluate(({fixture,overrides,extras})=>Proposals.create({...fixture.form,...overrides},extras).id,{fixture,overrides,extras});
      const view=await browser.newPage();view.on('pageerror',e=>errors.push(e.message));
      await view.goto(base+'/share.html?p='+id,{waitUntil:'networkidle0'});
      await view.waitForSelector('#pageCover');
      return {view,id};
    }
    let {view,id}=await share();
    await view.select('#requestStage','interested');
    await view.click('#requestArka'); await view.click('#requestPvsyst');
    await view.click('#prepareRequest');
    check('missing reports get a prepared WhatsApp request after interest',await view.$eval('#requestWhatsApp',e=>e.href.startsWith('https://wa.me/919309486769?text=')));
    check('request includes customer/reference with safe encoding',await view.$eval('#requestWhatsApp',e=>new URL(e.href).searchParams.get('text').includes('AUDIT/7')));
    check('share footer treats company data as text',await view.$eval('#shareFooter',e=>e.children.length===0));
    check('customer share uses our live cover',await view.$eval('#v_coverCapacity',e=>e.checkVisibility() && e.textContent==='12.5 kWp'));
    await view.$eval('#localAcknowledgement',e=>e.open=true);
    await view.click('#sacAcceptBtn');
    check('acceptance requires name and consent',await view.$eval('#sacError',e=>e.textContent.includes('full name')));
    await view.$eval('#localAcknowledgement',e=>e.open=true);
    await view.type('#sacSignerName','Test Signatory');await view.click('#sacConsent');
    await view.$eval('#localAcknowledgement',e=>e.open=true);
    await view.click('#sacAcceptBtn');
    check('acceptance honestly says locally saved',await view.$eval('#sacSuccessMsg',e=>e.textContent.includes('no automatic server notification')));
    check('acknowledgement persists required consent',await view.evaluate(id=>{const b=Proposals.get(id);return b.status==='accepted' && b.signerName==='Test Signatory' && b.consentConfirmed && b.acceptanceMethod==='local-typed-acknowledgement';},id));
    const at=await view.evaluate(id=>Proposals.get(id).acceptedAt,id);
    await view.reload({waitUntil:'networkidle0'});
    check('reload preserves original acceptance time',await view.evaluate(({id,at})=>Proposals.get(id).acceptedAt===at,{id,at}));
    await view.setViewport({width:390,height:844});
    check('mobile action bar fits screen',await view.$eval('#shareSimBar',e=>e.getBoundingClientRect().right<=innerWidth));
    await view.emulateMediaType('print');
    check('customer action cards excluded from print',await view.$$eval('#shareSimBar,#shareAcceptWrap',els=>els.every(e=>!e.checkVisibility())));
    await view.close();
    ({view}=await share({arkaUrl:'https://example.com/arka'}));
    check('partial reports allow only missing PVsyst to be requested',await view.evaluate(()=>document.querySelectorAll('#shareSimActions a').length===1 && document.getElementById('requestArka').disabled && !document.getElementById('requestPvsyst').disabled));
    await view.close();
    ({view}=await share({arkaUrl:'https://example.com/arka',pvsystUrl:'https://example.com/report.pdf'}));
    check('two valid reports get two safe external links',await view.$$eval('#shareSimActions a',els=>els.length===2 && els.every(e=>e.rel.includes('noopener') && e.href.startsWith('https://example.com/'))));
    await view.close();
    for(const malicious of ['javascript:alert(1)','data:text/html,<svg onload=alert(1)>','https://user:password@example.com/file','https://example.com/" onclick="alert(1)']) {
      ({view}=await share({arkaUrl:malicious,pvsystUrl:'javascript:alert(2)'}));
      check('unsafe report input cannot inject handlers: '+malicious.slice(0,30),await view.$$eval('#shareSimActions a',els=>els.every(e=>['https:','http:'].includes(new URL(e.href).protocol) && !e.hasAttribute('onclick'))));
      await view.close();
    }
    ({view}=await share({companyPhone:'not configured'}));
    check('invalid phone never sends to fabricated number',await view.$$eval('a[href^="https://wa.me/"]',els=>els.length===0));
    await view.close();
    ({view}=await share());
    await view.$eval('#localAcknowledgement',e=>e.open=true);
    await view.type('#sacSignerName','Storage Test');await view.click('#sacConsent');
    await view.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError');};});
    await view.$eval('#localAcknowledgement',e=>e.open=true);
    await view.click('#sacAcceptBtn');
    check('storage failure never reports acceptance success',await view.$eval('#sacError',e=>e.textContent.includes('Could not save')));
    await view.close();
    ({view,id}=await share());
    await view.$eval('#localAcknowledgement',e=>e.open=true);
    await view.type('#sacSignerName','Stale Test');await view.click('#sacConsent');
    await view.evaluate(id=>{const b=Proposals.get(id);b.updatedAt='changed';localStorage.setItem('qstudio.proposal.'+id,JSON.stringify(b));},id);
    await view.$eval('#localAcknowledgement',e=>e.open=true);
    await view.click('#sacAcceptBtn');
    check('stale proposal cannot overwrite newer edits',await view.$eval('#sacError',e=>e.textContent.includes('has changed')));
    await view.close();
    ({view}=await share({propDate:'2000-01-01',validityDays:'15'}));
    check('expired proposal cannot be accepted',await view.$eval('#sacAcceptBtn',e=>e.disabled));
    await view.close();
    const clean=await browser.createBrowserContext();view=await clean.newPage();
    await view.goto(base+'/share.html?p='+id,{waitUntil:'networkidle0'});
    check('other browser clearly explains local-only share limitation',await view.$eval('#shareSub',e=>e.textContent.includes('does not transfer')));
    check('missing proposal hides acceptance and disables download',await view.evaluate(()=>!document.getElementById('shareAcceptWrap').checkVisibility() && document.getElementById('sharePrint').disabled));
    await view.goto(base+'/share.html?p=%E0%A4%A',{waitUntil:'networkidle0'});
    check('malformed query handled without crash',await view.$eval('#shareCustomer',e=>e.textContent==='Proposal not found'));
    await clean.close();
    check('no browser runtime errors',errors.length===0);
    console.log(`\n${passed} passed, 0 failed`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
