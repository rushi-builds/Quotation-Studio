'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const pkg=require('@sparticuz/chromium'),bundle=pkg.default||pkg;
(async()=>{
 const browser=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args.filter(x=>x!=='--single-process'),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';
  await page.goto(base+'/quotation.html');
  await page.waitForFunction(()=>window.Render?.lastState);
  await page.evaluate(()=>document.fonts.ready);
  const result=await page.evaluate(async()=>{
   StateStore.applyForm({...StateStore.DEFAULTS,custName:'Compact QA',propRef:'QA-COMPACT',capacity:'12.5',moduleWattage:'620',tariff:'8.75'});
   Render.renderAll();
   const state=JSON.stringify(Render.lastState),finance=JSON.stringify(Finance.compute(Render.lastState));
   const digest=node=>node.nodeType===1?['e',node.tagName,[...node.attributes].map(a=>[a.name,a.value]).sort((a,b)=>a[0].localeCompare(b[0])),[...node.childNodes].map(digest)]:node.nodeType===3?['t',node.nodeValue]:['n',node.nodeType];
   const pagesBefore=JSON.stringify([...document.querySelectorAll('.preview-panel .page')].map(digest));
   const host=Experience.buildPowerPages(Render.lastState);
   await Promise.all([...host.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
   const pages=[...host.querySelectorAll(':scope > .power-page')];
   const sourceOrder=['pageCover','pageSolution','pageTechSpec','pageScope','pageSavings','pageInvestment','pageClosing'];
   const parity=pages.map((copy,i)=>{
    const source=document.getElementById(sourceOrder[i]);
    const body=source.querySelector('.pg-body'),copyBody=copy.querySelector('.pg-body');
    const footer=copy.querySelector('.pg-foot'),sourceHead=source.querySelector('.pg-head'),copyHead=copy.querySelector('.pg-head');
    const originalStructure=i===0
      ? source.querySelector('.ktm-cover').innerHTML===copy.querySelector('.ktm-cover').innerHTML
      : i===3
        ? copy.classList.contains('power-scope-warranty')&&['TURNKEY EPC SCOPE','WARRANTY COVERAGE','FROM ORDER TO HANDOVER','CUSTOMER INPUTS','BEFORE WE HAND OVER'].every(t=>copy.textContent.includes(t))
        : i===6
          ? ['.closing-hero','.closing-card','.closing-invitation','.closing-wave'].every(sel=>source.querySelector(sel)?.outerHTML===copy.querySelector(sel)?.outerHTML)
          : body?.innerHTML===copyBody?.innerHTML;
    return {source:copy.dataset.sourcePage,index:copy.dataset.powerIndex,originalStructure,
      number:footer?.querySelector('.pf-right')?.textContent.trim()||null,
      header:!!copy.querySelector('.pg-head .pg-logo img'),footerOK:!!footer?.querySelector('.pf-mid'),
      sourceWidth:source.offsetWidth,copyWidth:copy.offsetWidth,
      sourceHead:sourceHead?.offsetHeight||0,copyHead:copyHead?.offsetHeight||0};
   });
   const footGaps=pages.map(p=>{const foot=p.querySelector(':scope > footer');if(!foot)return null;const body=p.querySelector('.pg-body')||p,content=[...body.querySelectorAll('*')].filter(n=>n.getClientRects().length&&!n.matches('style,script')&&!n.closest('footer'));const bottom=Math.max(...content.map(n=>n.getBoundingClientRect().bottom));return foot.getBoundingClientRect().top-bottom;});
   const third=pages[2],sourceSpec=document.getElementById('pageTechSpec');
   const output={count:pages.length,sourceOrder,parity,footGaps,
    exactSpec:third.querySelector('.pg-body').innerHTML===sourceSpec.querySelector('.pg-body').innerHTML,
    specCards:third.querySelectorAll('.pv2-card').length,
    investment:pages[5].textContent.includes(Finance.fmtINR(Finance.compute(Render.lastState).netInvestment)),
    savings:pages[4].textContent.includes('₹'),
    scopeLayout:(()=>{const p=pages[3],sections=[...p.querySelectorAll('.sw-section')],aside=p.querySelector('.proposal-value-footer'),foot=p.querySelector(':scope>footer'),body=p.querySelector('.pg-body'),bottom=Math.max(...[...body.querySelectorAll('*')].filter(n=>n.getClientRects().length&&!n.matches('style,script')).map(n=>n.getBoundingClientRect().bottom));return {sections:sections.length,ordered:sections.slice(1).every((s,i)=>sections[i].getBoundingClientRect().bottom<=s.getBoundingClientRect().top),footerGap:foot.getBoundingClientRect().top-bottom,noRepeatedBand:!aside,qualityChecks:p.querySelectorAll('.sw-quality-card').length,overflow:p.scrollWidth<=p.clientWidth};})(),
    numbers:pages.map(p=>p.querySelector('.pf-right')?.textContent.trim()||null),
    aliases:host.querySelector('style[data-power-source-aliases]')?.textContent.includes('data-source-page'),
    unchanged:state===JSON.stringify(Render.lastState)&&finance===JSON.stringify(Finance.compute(Render.lastState))&&pagesBefore===JSON.stringify([...document.querySelectorAll('.preview-panel .page')].map(digest))};
   host.remove();return output;
  });
  assert.equal(result.count,7);
  assert.deepEqual(result.parity.map(p=>p.source),result.sourceOrder);
  assert.deepEqual(result.parity.map(p=>p.index),['1','2','3','4','5','6','7']);
  assert(result.parity.every((p,i)=>p.originalStructure&&p.index===String(i+1)&&(i===0?!p.header&&!p.footerOK&&p.number===null:i===6?!p.header&&p.footerOK&&p.number==='Page 7 of 7':p.header&&p.footerOK&&p.number===`Page ${i+1} of 7`)),'selected sheets preserve their native page artwork/chrome and only running pages are renumbered: '+JSON.stringify(result.parity));
  assert(result.parity.every(p=>p.sourceWidth===p.copyWidth&&p.sourceHead===p.copyHead),'A4 sheet and chrome geometry stays identical');
  assert(result.footGaps[0]===null&&result.footGaps.slice(1).every(g=>g>=3),'all selected Detailed Proposal sheets clear their footer: '+JSON.stringify(result.footGaps));
  assert(result.exactSpec&&result.specCards>=1,'page 3 technical sheet body remains unchanged');
  assert(result.scopeLayout.sections===5&&result.scopeLayout.ordered&&result.scopeLayout.footerGap>=8&&result.scopeLayout.noRepeatedBand&&result.scopeLayout.qualityChecks===3&&result.scopeLayout.overflow,'page 4 adds source-backed pre-handover checks, opens up section spacing and clears the footer without repeating the old value band: '+JSON.stringify(result.scopeLayout));
  assert(result.investment&&result.savings,'saved quote values stay in the compact report');
  assert(result.numbers[0]===null&&result.numbers.slice(1).every((n,i)=>n===`Page ${i+2} of 7`));
  assert(result.aliases,'source-ID design rules are carried into the snapshot');
  assert(result.unchanged,'building the compact extract does not mutate the saved proposal');
  assert.deepEqual(errors,[]);
  console.log('PASS: seven-page source order, combined scope/warranty sheet, vertical preview/export, exact page-3 body, shared numbered chrome, saved figures, no mutation.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
