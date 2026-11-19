/* Live system-flow diagram: proposal, compact PDF, Customer View and mobile. */
'use strict';
const assert=require('node:assert/strict');
const puppeteer=require('puppeteer-core');
const {upgradeProposalContent}=require('../assets/js/content.js');
let passed=0;
const check=(name,ok)=>{assert.ok(ok,name);passed++;console.log('  ✓ '+name);};
(async()=>{
  const migrated=upgradeProposalContent({pageTechSpec:{diagramLabels:{array:'Solar Array',grid:'DISCOM Grid',home:'My workshop'}}});
  check('old default labels migrate without overwriting custom copy',migrated.pageTechSpec.diagramLabels.array==='Rooftop Solar'&&migrated.pageTechSpec.diagramLabels.grid==='MSEDCL (MSEB)'&&migrated.pageTechSpec.diagramLabels.home==='My workshop');
  const {default:chromium}=await import('@sparticuz/chromium');
  const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH||await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const base=process.env.QA_BASE||'http://127.0.0.1:8080';
    await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});await page.evaluate(()=>document.fonts.ready);
    const flow='#pageSolution .pv2-overview .pv2-flow';
    const label=(p,cls)=>p.$eval(flow,(el,key)=>[...el.querySelectorAll('.pv2-node.'+key+' b')].map(x=>x.textContent).join(' '),cls);
    const initial=await page.$eval(flow,e=>({nodes:e.querySelectorAll('.pv2-node').length,arrows:e.querySelectorAll('.pv2-arrow').length,width:e.getBoundingClientRect().width,visible:e.checkVisibility(),labels:[...e.querySelectorAll('.pv2-node b')].map(x=>x.textContent),values:[...e.querySelectorAll('.pv2-node small')].map(x=>x.textContent),images:[...e.querySelectorAll('.pv2-node-art img')].map(x=>({complete:x.complete,width:x.naturalWidth}))}));
    check('live flow renders seven equipment and grid nodes',initial.nodes===7);
    check('six links connect the seven flow nodes',initial.arrows===6);
    check('proposal flow is visible and fills its solution column',initial.visible&&initial.width>500);
    check('module and inverter values follow the current proposal',initial.values.some(x=>x.includes('13 × 545 Wp'))&&initial.values.some(x=>x==='7 kW'));
    check('equipment illustrations load without broken image requests',initial.images.length===7&&initial.images.every(x=>x.complete&&x.width>0));
    await page.evaluate(()=>{StateStore.applyForm({capacity:'15.6',moduleWattage:'620',inverterKw:'12'});Render.renderAll();});
    const changed=await page.$eval(flow,e=>[...e.querySelectorAll('.pv2-node small')].map(x=>x.textContent).join('|'));
    check('diagram updates module count, wattage and inverter rating',changed.includes('26 × 620 Wp')&&changed.includes('12 kW'));
    await page.evaluate(()=>{CONTENT.pageTechSpec.diagramLabels.array='Solar Array';CONTENT.pageTechSpec.diagramLabels.grid='Utility Connection';Render.renderAll();});
    check('custom diagram labels update on the live proposal',/Solar Array/.test(await label(page,'is-panel'))&&/Utility Connection/.test(await label(page,'is-grid')));
    await page.evaluate(()=>{CONTENT.pageTechSpec.diagramLabels.array='<image href="x" onerror="window.diagramInjected=1"/>';Render.renderAll();});
    check('custom labels remain text and cannot inject markup',await page.$eval(flow,e=>!e.querySelector('image,script,foreignObject')&&!window.diagramInjected&&e.querySelector('.is-panel b').textContent.includes('<image')));
    const compact=await page.evaluate(()=>{const h=Experience.buildPowerPages(Render.lastState);try{const f=h.querySelector('#powerPage2 .pv2-overview .pv2-flow');return {nodes:f?.querySelectorAll('.pv2-node').length||0,label:f?.querySelector('.is-panel b')?.textContent||'',values:[...h.querySelectorAll('#powerPage2 .pv2-node small')].map(x=>x.textContent)};}finally{h.remove();}});
    check('compact PDF keeps all seven live flow nodes and current labels',compact.nodes===7&&compact.label.includes('<image'));
    check('compact PDF flow carries edited system values',compact.values.some(x=>x.includes('26 × 620 Wp'))&&compact.values.some(x=>x==='12 kW'));
    check('retired technical-spec diagram stays hidden, not duplicated',await page.$eval('#v_tsDiagram',e=>getComputedStyle(e.closest('.diagram-box')).display==='none'));
    await page.emulateMediaType('print');
    check('the system flow remains visible in print',await page.$eval(flow,e=>e.checkVisibility()));
    await page.emulateMediaType('screen');
    await page.setViewport({width:390,height:844});
    await page.waitForFunction(()=>{const r=document.querySelector('#pageSolution .pv2-overview .pv2-flow').getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1;},{timeout:10000});
    check('mobile flow fits the viewport without horizontal clipping',await page.$eval(flow,e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;}));
    check('no browser runtime errors',errors.length===0);
    console.log(`\n${passed} passed, 0 failed`);
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
