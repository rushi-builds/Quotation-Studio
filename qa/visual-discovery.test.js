/* Surface-aware branding, photo composition, and request-flow discoverability. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const puppeteer = require('puppeteer-core');
let passed = 0;
const check = (name, ok) => {assert(ok, name);passed++;console.log('  ✓ '+name);};
(async()=>{
  const root=path.join(__dirname,'..');
  const readRgba=name=>execFileSync('convert',[path.join(root,'assets/images/'+name),'-depth','8','rgba:-']);
  const light=readRgba('ktm-logo-light.png'),dark=readRgba('ktm-logo-dark.png');
  check('both logo lockups share the same dimensions',light.length===304*180*4 && dark.length===light.length);
  let transparent=0, navy=0, white=0, matchingAlpha=true, matchingOrange=true;
  for(let i=0;i<light.length;i+=4){
    if(light[i+3]===0)transparent++;
    if(light[i]===17 && light[i+1]===42 && light[i+2]===62 && light[i+3]>200)navy++;
    if(dark[i]===248 && dark[i+1]===250 && dark[i+2]===252 && dark[i+3]>200)white++;
    if(light[i+3]!==dark[i+3])matchingAlpha=false;
    if(light[i]>light[i+1] && light[i+3]>200 && !light.subarray(i,i+4).equals(dark.subarray(i,i+4)))matchingOrange=false;
  }
  check('navy rectangular matte is absent (mostly transparent canvas)',transparent>light.length/4*.5 && light[3]===0 && light.at(-1)===0);
  check('light variant has navy lettering; dark variant has white lettering',navy>3000 && white===navy);
  check('both variants retain identical shapes and orange artwork',matchingAlpha && matchingOrange);
  const {default:chromium}=await import('@sparticuz/chromium');
  const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||await chromium.executablePath(),args:chromium.args,headless:true});
  try{
    const base=process.env.QA_BASE||'http://127.0.0.1:8080';
    const page=await browser.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:1440,height:1100});
    await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});
    await page.evaluate(()=>document.fonts.ready);
    const shots=path.join(__dirname,'shots');fs.mkdirSync(shots,{recursive:true});
    await page.screenshot({path:path.join(shots,'request-entry-desktop.png')});
    check('About heading renders an actual line break, not literal HTML',await page.$eval('#v_abHeading',e=>!!e.querySelector('br') && !e.textContent.includes('<br>')));
    check('initial PDF label matches visible page count',await page.$eval('#downloadLabel',e=>e.textContent.includes('15 Pages')));
    check('initial proposal manager metadata matches the displayed customer',await page.$eval('#proposalSelect',e=>e.selectedOptions[0].textContent.includes('Bhooshan')));
    check('request shortcut is visible above the fold',await page.$eval('#engineeringViewBtn',e=>e.checkVisibility() && e.getBoundingClientRect().bottom<innerHeight));
    check('all white page headers use transparent light lockup',await page.$$eval('.pg-logo img',els=>els.every(e=>e.getAttribute('src')==='assets/images/ktm-logo-light.png' && getComputedStyle(e).backgroundColor==='rgba(0, 0, 0, 0)')));
    check('dark closing photograph uses transparent white lockup',await page.$eval('.closing-brand img',e=>e.getAttribute('src')==='assets/images/ktm-logo-dark.png'));
    check('normal proposal closing page explains four-step request flow',await page.$$eval('#pageClosing .engineering-steps li',els=>els.length===4 && els.every(e=>e.checkVisibility())));
    async function layout(label){
      const result=await page.evaluate(()=>[...document.querySelectorAll('.page')].filter(p=>p.checkVisibility()).flatMap(p=>{
        const issues=[];const foot=p.querySelector('.pg-foot');const body=p.querySelector('.pg-body');
        if(body && foot && [...body.children].some(e=>e.checkVisibility() && e.getBoundingClientRect().bottom>foot.getBoundingClientRect().top+1))issues.push(p.id+':footer overlap');
        const pic=p.querySelector('.photo-top'),intro=p.querySelector('.intro-col');
        if(pic && intro){const a=pic.getBoundingClientRect(),b=intro.getBoundingClientRect();if(a.left<b.right-1 && a.bottom>b.top && a.top<b.bottom)issues.push(p.id+':photo/text overlap');
          const after=intro.nextElementSibling;if(after && after.getBoundingClientRect().top<a.bottom-1)issues.push(p.id+':photo below intro');}
        const logo=p.querySelector('.pg-logo img'),head=p.querySelector('.pg-head');
        if(logo && head && logo.getBoundingClientRect().bottom>head.getBoundingClientRect().bottom)issues.push(p.id+':logo too tall');
        return issues;
      }));
      check(label+' pages have no logo/photo/text/footer collisions: '+result.join(', '),result.length===0);
    }
    await layout('Default');
    await page.evaluate(()=>{for(const [id,value] of Object.entries({customerType:'commercial',monthlyBill:'50000',arkaUrl:'https://example.com/layout',pvsystUrl:'https://example.com/report'})){const e=document.getElementById(id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}});
    await layout('Commercial with reports and bill');
    check('selected story photos enlarged only where space allows',await page.evaluate(()=>document.querySelector('#pageAbout .photo-top').offsetHeight===292 && document.querySelector('#pageSolution .photo-top').offsetHeight===230 && document.querySelector('#pageScope .photo-top').offsetHeight===180));
    check('portfolio shows ten consistent actual site photos, no duplicate stock header',await page.$$eval('#pageProjects .pc-photo',els=>els.length===10 && els.every(e=>e.offsetHeight===132)) && !await page.$('#pageProjects .photo-top'));
    // Isolated A4 proofs avoid screenshots being obscured by sticky editor chrome.
    const proof=await browser.newPage();await proof.setViewport({width:794,height:1124});
    for(const id of ['pageExec','pageAbout','pageWhySolar','pageSolution','pageScope','pageQuality','pageWhyKtm','pageProjects','pageWarranty','pageClosing']){
      const markup=await page.$eval('#'+id,e=>e.outerHTML);
      await proof.setContent('<base href="'+page.url()+'"><link rel="stylesheet" href="assets/css/app.css">'+markup);
      await proof.evaluate(()=>document.fonts.ready);await proof.waitForFunction(()=>[...document.images].every(i=>i.complete));
      await proof.$eval('.page',e=>e.style.transform='none');
      await (await proof.$('.page')).screenshot({path:path.join(shots,'visual-'+id+'.png')});
    }
    await proof.close();
    const targetPromise=browser.waitForTarget(t=>t.url().includes('/share.html?') && t.url().includes('#shareAcceptWrap'));
    await page.click('#engineeringViewBtn');
    const target=await targetPromise;const customer=await target.page();
    customer.on('pageerror',e=>errors.push(e.message));await customer.setViewport({width:1200,height:1000});
    await customer.waitForFunction(()=>document.activeElement?.id==='requestStage' && document.activeElement.getBoundingClientRect().bottom<innerHeight);
    check('builder shortcut opens the active proposal directly at requests',customer.url().includes('#shareAcceptWrap') && await customer.$eval('#requestStage',e=>e.getBoundingClientRect().top>=0 && e.getBoundingClientRect().bottom<innerHeight));
    check('shortcut saves latest proposal inputs',await customer.$eval('#shareSimActions',e=>e.querySelectorAll('a').length===2));
    check('hub title is not hidden under the sticky bar',await customer.evaluate(()=>document.querySelector('.sac-title').getBoundingClientRect().top>=document.querySelector('.share-topbar').getBoundingClientRect().bottom));
    check('builder-only shortcut is not duplicated inside customer toolbar',!await customer.$('#engineeringViewBtn'));
    check('customer header has one direct request jump',await customer.$$eval('#requestJump',els=>els.length===1 && !els[0].disabled));
    await customer.evaluate(()=>scrollTo(0,0));await customer.click('#requestJump');
    check('customer header jump reaches the real form',await customer.$eval('#requestStage',e=>e.getBoundingClientRect().bottom<innerHeight && document.activeElement===e));
    await customer.$eval('#pageClosing [data-engineering-open]',e=>e.click());
    check('closing-page action reaches the same single form',await customer.$$eval('#engineeringRequestForm',els=>els.length===1 && document.activeElement.id==='requestStage'));
    await customer.emulateMediaType('print');
    check('paper/PDF explanation remains visible while interactive button is hidden',await customer.evaluate(()=>document.querySelector('.engineering-overview').checkVisibility() && !document.querySelector('#pageClosing [data-engineering-open]').checkVisibility()));
    await customer.emulateMediaType('screen');await customer.setViewport({width:390,height:844});
    await customer.evaluate(()=>scrollTo(0,0));await customer.click('#requestJump');
    check('mobile jump puts request selector in view',await customer.$eval('#requestStage',e=>e.getBoundingClientRect().top>=0 && e.getBoundingClientRect().bottom<=innerHeight));
    await customer.screenshot({path:path.join(shots,'request-jump-mobile.png')});
    await page.setViewport({width:390,height:844});await page.$eval('#engineeringViewBtn',e=>e.scrollIntoView());
    check('mobile builder shortcut stays within viewport width',await page.$eval('#engineeringViewBtn',e=>e.getBoundingClientRect().left>=0 && e.getBoundingClientRect().right<=innerWidth));
    await customer.goto(base+'/share.html?p=missing',{waitUntil:'networkidle0'});
    check('missing proposal cannot jump to a nonexistent request form',await customer.$eval('#requestJump',e=>e.disabled));
    check('no runtime errors',errors.length===0);
    console.log(`\n${passed} passed, 0 failed`);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
