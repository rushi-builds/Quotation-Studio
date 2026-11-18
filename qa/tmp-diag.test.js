/* TEMPORARY diagnostic - deleted in the same branch. It prints the real geometry
   of page 3 so the fix can be built on numbers instead of guesses. */
'use strict';
const puppeteer=require('puppeteer-core'),path=require('node:path');
(async()=>{
 const {default:chromium}=await import('@sparticuz/chromium');
 const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),
   args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
 const base=process.env.QA_BASE||'http://127.0.0.1:8080';
 const page=await browser.newPage();
 await page.setViewport({width:1440,height:1200});
 await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});
 await page.evaluate(()=>document.fonts.ready);
 const out=await page.evaluate(()=>{
   const h=Experience.buildPowerPages(Render.lastState);
   const p3=h.querySelector('#powerPage3');
   const body=p3.querySelector('.power-body');
   const foot=p3.querySelector('footer');
   const blk=p3.querySelector('.power-spec-sheet');
   const spec=p3.querySelector('.pv2-spec');
   const cards=[...p3.querySelectorAll('.pv2-card')];
   const g=n=>n?Math.round(n.getBoundingClientRect().height):null;
   const r={
     pageScaleVar:getComputedStyle(p3).getPropertyValue('--page-scale').trim(),
     pageW:p3.clientWidth, pageH:p3.clientHeight,
     bodyClientW:body.clientWidth,
     bodyOffsetTop:body.offsetTop, footOffsetTop:foot.offsetTop,
     bodyRectTop:Math.round(body.getBoundingClientRect().top-p3.getBoundingClientRect().top),
     footRectTop:Math.round(foot.getBoundingClientRect().top-p3.getBoundingClientRect().top),
     blockOffsetW:blk?blk.offsetWidth:null, blockOffsetH:blk?blk.offsetHeight:null,
     blockRectH:g(blk),
     specH:g(spec),
     scaleRecorded:blk&&blk.dataset.powerScale,
     inlineHeight:blk&&blk.style.height, inlineOverflow:blk&&blk.style.overflow,
     cardHeights:cards.map(g),
     // how far the cards actually reach, unscaled, relative to the body
     lastCardBottomUnscaled: cards.length? (cards[cards.length-1].offsetTop + cards[cards.length-1].offsetHeight) : null,
     specOffsetTop: spec?spec.offsetTop:null,
     bodyScrollH: body.scrollHeight,
   };
   h.remove(); return r;
 });
 console.log('DIAG '+JSON.stringify(out,null,1));
 await browser.close();
})().catch(e=>{console.error('DIAG FAIL',e.message);process.exit(1);});
