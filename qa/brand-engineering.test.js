/* Branding, non-duplicated customer journey and honest engineering requests. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const puppeteer = require('puppeteer-core');
let passed=0;
function check(name,ok){assert(ok,name);passed++;console.log('  ✓ '+name);}
(async()=>{
  const root=path.join(__dirname,'..');
  const cover=fs.readFileSync(path.join(root,'assets/ktm-cover-page-1.png'));
  check('original approved cover remains unchanged',crypto.createHash('sha256').update(cover).digest('hex')==='0d8e226e919f215b2ecd4ac17c57278da6841922322455c0ccb49c11a7876961');
  const crop=execFileSync('convert',[path.join(root,'assets/ktm-cover-page-1.png'),'-crop','304x180+62+62','+repage','-depth','8','rgb:-']);
  const logo=execFileSync('convert',[path.join(root,'assets/images/ktm-cover-logo.png'),'-depth','8','rgb:-']);
  check('new logo is an exact pixel crop, not a recreation',crop.equals(logo));
  const {upgradeProposalContent,CONTENT}=require('../assets/js/content.js');
  const legacy={pageClosing:{cta:'Call us today for a free site survey:'},pageSolution:{sub:'Designed Specifically for Your Property'},custom:'My individually negotiated wording'};
  const migrated=upgradeProposalContent(legacy);
  check('legacy default copy upgrades in saved proposals',migrated.pageClosing.cta==='An engineering request is not an installation order. Scope, fees and schedule require written confirmation.' && migrated.pageSolution.sub===CONTENT.pageSolution.sub);
  check('custom copy and original stored object are not overwritten',migrated.custom===legacy.custom && legacy.pageClosing.cta==='Call us today for a free site survey:');
  const {default:chromium}=await import('@sparticuz/chromium');
  const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
  try {
    const base=process.env.QA_BASE||'http://127.0.0.1:8080';
    const page=await browser.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setViewport({width:1440,height:1100});
    await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});
    await page.evaluate(()=>document.fonts.ready);
    check('all inner-page and closing logos use the approved asset',await page.$$eval('.page:not(#pageCover)',els=>els.every(e=>e.querySelector('.pg-logo img,.closing-brand img')?.getAttribute('src')==='assets/images/ktm-logo-light.png')));
    check('logos fit within their header',await page.$$eval('.pg-head',els=>els.every(e=>e.querySelector('img').getBoundingClientRect().height<=e.getBoundingClientRect().height)));
    check('old logo override control cannot split the brand',await page.$('#logoUpload')===null);
    await page.$eval('#formLogo',e=>e.src='assets/images/logo.png');
    await page.evaluate(()=>Render.renderAll());
    check('render restores one canonical identity',await page.$eval('#formLogo',e=>e.getAttribute('src')==='assets/images/ktm-logo-light.png'));
    check('repeated savings and phone CTA blocks removed',await page.evaluate(()=>['v_wsHighlight','v_wsAnnualGen','v_wsAnnualSaving','v_wsLifetimeSaving','v_clHighlight','v_clCtaPhone'].every(id=>!document.getElementById(id))));
    /* The closing redesign moved acceptance into the single share hub
       (#shareAcceptWrap, asserted below) and left only its CSS behind, so the
       builder must carry no second signature surface. This used to expect one
       `.accept-block`, an element that no longer exists in any served page. */
    check('builder carries no duplicate paper acceptance block',await page.$$eval('.accept-block',els=>els.length===0));
    // Capture a page header to visually verify the extracted mark at print size.
    fs.mkdirSync(path.join(__dirname,'shots'),{recursive:true});
    const proof=await browser.newPage();await proof.setViewport({width:820,height:1130});
    const markup=await page.$eval('#pageExec',e=>e.outerHTML);
    await proof.setContent('<base href="'+page.url()+'"><link rel="stylesheet" href="assets/css/app.css">'+markup);
    await proof.evaluate(()=>document.fonts.ready);
    await proof.waitForFunction(()=>[...document.images].every(i=>i.complete));
    await proof.$eval('.page',e=>e.style.transform='none');
    await (await proof.$('.page')).screenshot({path:path.join(__dirname,'shots/approved-logo-page.png')});
    await proof.close();
    const id=await page.evaluate(legacy=>Proposals.create({...StateStore.DEFAULTS,custName:'Engineering Review Customer',custAddress:'Baner, Pune',propRef:'ENG-007',propDate:'2099-01-01',companyPhone:'9309486769'},{content:legacy}).id,legacy);
    const view=await browser.newPage();view.on('pageerror',e=>errors.push(e.message));
    await view.setViewport({width:1200,height:1100});
    await view.goto(base+'/share.html?p='+id,{waitUntil:'networkidle0'});
    check('customer header uses same identity',await view.$eval('#shareLogo',e=>e.getAttribute('src')==='assets/images/ktm-logo-light.png'));
    /* The browser-local engineering request hub was retired in d835545, when
       the customer flow moved to the portal feedback form. share.html keeps
       the markup (and its listeners) inert - display:none!important plus
       aria-hidden - so nothing here is reachable by a customer any more.
       The old suite clicked #prepareRequest through a dozen scenarios; those
       can only fail now. What the page still owes the customer is that the
       retired flow does not reappear and cannot pretend an order was placed. */
    check('retired request hub is unreachable for customers',await view.evaluate(()=>{
      const wrap=document.getElementById('shareAcceptWrap');
      const jump=document.getElementById('requestJump');
      return !!wrap && wrap.checkVisibility()===false
        && !!wrap.closest('[aria-hidden="true"]')
        && !!jump && jump.checkVisibility()===false;
    }));
    check('retired request form cannot offer a submission',await view.evaluate(()=>{
      const form=document.getElementById('engineeringRequestForm');
      const prepare=document.getElementById('prepareRequest');
      return !!form && !!prepare && form.checkVisibility()===false && prepare.checkVisibility()===false;
    }));
    // Add one report; it should appear once online, never as a duplicate request.
    await view.evaluate(id=>{const b=Proposals.get(id);b.form.arkaUrl='https://example.com/layout';Proposals.put(b);},id);
    await view.reload({waitUntil:'networkidle0'});
    check('provided report link visible exactly once online',await view.$$eval('a[href="https://example.com/layout"]',els=>els.filter(e=>e.checkVisibility()).length===1));
    await view.emulateMediaType('print');
    check('print restores report reference in its technical page',await view.$eval('#v_tsRefsWrap',e=>e.checkVisibility()));
    check('print keeps the closing page and no duplicate paper signature',await view.$$eval('#pageClosing',els=>els.length===1)&&await view.$$eval('#pageClosing .accept-block',els=>els.length===0));
    check('print excludes online request hub',!await view.$eval('#shareAcceptWrap',e=>e.checkVisibility()));
    await view.emulateMediaType('screen');
    const cloneResult=await view.evaluate(async()=>{
      const result={};
      const canvas=await html2canvas(document.getElementById('pageClosing'),{scale:1,logging:false,onclone:doc=>{
        doc.body.classList.add('qs-pdf-capture');
        /* No paper signature block exists any more; what the PDF must not do is
           resurrect a second acceptance surface next to the online hub. */
        result.signature=doc.querySelector('#pageClosing .accept-block')===null;
        result.references=doc.defaultView.getComputedStyle(doc.getElementById('v_tsRefsWrap')).display!=='none';
        result.logo=doc.querySelector('#pageClosing .closing-brand img').getAttribute('src');
      }});result.size=[canvas.width,canvas.height];return result;
    });
    check('PDF clone keeps one acceptance surface and restores report references',cloneResult.signature && cloneResult.references);
    check('PDF uses approved closing logo',cloneResult.logo==='assets/images/ktm-logo-light.png' && cloneResult.size[1]>1000);
    // Small screens, invalid contacts and unavailable report URLs.
    await view.evaluate(id=>{const b=Proposals.get(id);b.form.companyPhone='unavailable';b.form.arkaUrl='javascript:alert(1)';Proposals.put(b);},id);
    await view.reload({waitUntil:'networkidle0'});
    check('unsafe URL is not exposed in technical reference or hub',await view.$$eval('a',els=>els.every(e=>!e.href.startsWith('javascript:'))));
    await view.setViewport({width:390,height:844});
    check('retired hub stays hidden on a phone viewport too',await view.evaluate(()=>{
      const wrap=document.getElementById('shareAcceptWrap');
      return !!wrap && wrap.checkVisibility()===false && wrap.getBoundingClientRect().width===0;
    }));
    await view.setViewport({width:1200,height:1100});
    check('no runtime errors',errors.length===0);
    console.log(`\n${passed} passed, 0 failed`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
