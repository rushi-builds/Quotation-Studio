'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),pkg=require('@sparticuz/chromium'),bundle=pkg.default||pkg;
const battery=require('./bess-fixture.js');
(async()=>{
 const b=await chromium.launch({executablePath:await bundle.executablePath(),args:bundle.args.filter(x=>x!=='--single-process'),headless:true});
 try {
  const context=await b.newContext({viewport:{width:1440,height:1100}}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));const base=process.env.QA_BASE||'http://127.0.0.1:8080';
  await p.goto(base+'/quotation.html');await p.waitForFunction(()=>window.Render?.lastState);await p.evaluate(()=>document.fonts.ready);
  // The reported ₹83.33k label must sit outside the plotting area, never under a bar.
  const ticks=await p.evaluate(()=>{
   const canvas=document.createElement('canvas');canvas.width=680;canvas.height=180;document.body.append(canvas);
   const ctx=canvas.getContext('2d'),draw=ctx.fillText.bind(ctx),move=ctx.moveTo.bind(ctx),labels=[],grid=[];
   ctx.fillText=function(text,x,y,...rest){if(this.font.includes('10.5px'))labels.push({text,left:x-this.measureText(text).width,right:x,align:this.textAlign});draw(text,x,y,...rest);};
   ctx.moveTo=function(x,y){grid.push(x);move(x,y);};
   Charts.bridge(canvas,Finance.compute({...StateStore.DEFAULTS,capacity:'3',moduleWattage:'500',costPerKwp:'63600'}));canvas.remove();return {labels,gridStart:grid[0]};
  });
  assert.ok(ticks.labels.some(t=>t.text==='₹83.33k'));
  assert.ok(ticks.labels.every(t=>t.left>=0&&t.right<=ticks.gridStart-8&&t.align==='right'),'all currency suffixes have a dedicated gutter');
  const fixtures=[
   ['residential',{}],['commercial',{customerType:'commercial',capacity:'100',loanAmt:'3000000',loanRate:'9',loanYears:'10'}],
   ['industrial zero-interest',{customerType:'industrial',capacity:'25',loanAmt:'500000',loanRate:'0',loanYears:'10'}],
   ['RWA provisional',{customerType:'rwa',capacity:'100',loanAmt:'3000000',loanRate:'9',loanYears:'10'}],
   ['RWA confirmed',{customerType:'rwa',capacity:'100',rwaEligibleKwp:'60'}],
   ['zero tariff',{tariff:'0'}],['decreasing value',{escalation:'0',degradation:'1'}],
   ['zero override',{subsidyOverride:'0'}],['negative investment',{subsidyOverride:'99999999'}],
   ['custom equipment',{moduleMake:'Custom & Sons <review>',inverterMake:'Custom three-phase inverter, reviewed to site electrical requirements',custName:'Customer with a moderately long organisation name',custAddress:'Industrial Area, Pune, Maharashtra — project site under review'}],
   ['battery plus additional system',{...battery,bessSpecMode:'manual',bessInclude:true,systemEnabled:true,systemInclude:true,systemTemplate:'custom',systemName:'Solar-aware EV charging integration',systemPrice:'150000'}]
  ];
  for(const [name,fields] of fixtures){
   const result=await p.evaluate(async fields=>{
    StateStore.applyForm({...StateStore.DEFAULTS,custName:'Six-page QA',propRef:'QA-POWER-SIX',galleryUrl:'https://example.com/solar',arkaUrl:'https://example.com/arka-report',pvsystUrl:'https://example.com/pvsyst-report',costPerWp:'60',moduleWattage:'500',capacity:'10',...fields});Render.renderAll();
    const before={state:JSON.stringify(Render.lastState),finance:JSON.stringify(Finance.compute(Render.lastState)),pages:[...document.querySelectorAll('.preview-panel .page')].map(e=>e.outerHTML).join('')};
    const h=Experience.buildPowerPages(Render.lastState);await Promise.all([...h.querySelectorAll('img')].map(i=>i.decode()));
    const f=Finance.compute(Render.lastState),pages=[...h.children];
    const data={count:pages.length,geometry:pages.map(el=>({id:el.id,height:el.scrollHeight,gap:el.querySelector('footer').getBoundingClientRect().top-el.querySelector('.power-body').getBoundingClientRect().bottom,width:el.scrollWidth})),hasCharts:h.querySelectorAll('.power-series-chart').length===1&&h.querySelector('#powerCostChart').getContext('2d').getImageData(0,0,680,180).data.some(v=>v!==0),series:[...h.querySelectorAll('[data-series]')].map(e=>e.dataset.series.split(',').map(Number)),expectedSeries:[f.series.cumSaving],milestones:[...h.querySelectorAll('[data-energy-mwh]')].map(e=>Number(e.dataset.energyMwh)),expectedMilestones:[0,9,24].map(i=>f.series.gen.slice(0,i+1).reduce((sum,n)=>sum+n,0)/1000),investment:h.querySelector('#powerPage5').textContent.includes(Finance.fmtINR(f.netInvestment)),page1:h.querySelector('#powerPage1').textContent,photo:h.querySelector('.power-hero img').getAttribute('src'),last:h.querySelector('#powerPage6').textContent,links:[...h.querySelectorAll('.power-report-links a')].map(a=>({href:a.href,page:a.closest('.power-page').id})),projects:h.querySelectorAll('#powerPage2 .power-projects article').length,text:h.textContent,changed:JSON.stringify(Render.lastState)!==before.state||JSON.stringify(Finance.compute(Render.lastState))!==before.finance||[...document.querySelectorAll('.preview-panel .page')].map(e=>e.outerHTML).join('')!==before.pages};
    if(fields.customerType===undefined&&!Object.keys(fields).length){window.__powerReview=h;}else h.remove();return data;
   },fields);
   assert.equal(result.count,6,name);assert.deepEqual(result.milestones,result.expectedMilestones); assert.equal(result.projects,3);assert.deepEqual(result.links,[{href:'https://example.com/pvsyst-report',page:'powerPage6'},{href:'https://example.com/arka-report',page:'powerPage6'}]);assert.ok(!result.text.includes('Review → discuss')); assert.equal(result.changed,false,name+' must not mutate main proposal');assert.ok(result.hasCharts,name+' savings and cost charts');assert.deepEqual(result.series,result.expectedSeries,name+' chart data uses Finance exactly');assert.ok(result.investment,name+' actual net investment');assert.ok(!/₹|Payback|Net investment/.test(result.page1),name+' benefits-first opening');assert.ok(!/NaN|undefined|Infinity/.test(result.text),name+' finite output');
   for(const g of result.geometry)assert.ok(g.height<=1124&&g.gap>=4&&g.width<=794,name+' '+JSON.stringify(g));
   if(fields.customerType&&['commercial','industrial','rwa'].includes(fields.customerType))assert.ok(result.photo.includes('cover-'+fields.customerType+'-scene'));
   if(name==='battery plus additional system')assert.ok(result.last.includes('3,00,000')&&result.last.includes('1,50,000')&&result.last.includes('Solar totals, charts and payment milestones exclude'));
   if(name==='RWA provisional')assert.match(result.text,/Provisional estimate/);
   if(name==='RWA confirmed')assert.match(result.text,/Entered eligible capacity: 60 kWp/);
   if(name==='negative investment')assert.match(result.text,/Negative net investment is not a promised payout/);
   if(name==='custom equipment')assert.ok(result.text.includes('Custom & Sons <review>')&&!result.text.includes('&amp;'));
   if(name==='residential'){
    fs.mkdirSync(path.join(__dirname,'shots','power-six'),{recursive:true});
    for(const id of ['powerPage2','powerPage4','powerPage5','powerPage6']){
     const data=await p.evaluate(async id=>{const c=await html2canvas(window.__powerReview.querySelector('#'+id),{scale:1,useCORS:true,logging:false,backgroundColor:'#fff'});return c.toDataURL();},id);
     fs.writeFileSync(path.join(__dirname,'shots','power-six',id+'.png'),Buffer.from(data.split(',')[1],'base64'));
    }
    await p.evaluate(()=>{window.__powerReview.remove();window.__powerReview=null;});
   }
   console.log('PASS:',name,'— six pages, consistent values/charts, A4 geometry, unchanged detailed proposal');
  }
  await p.evaluate(()=>{StateStore.applyForm({...StateStore.DEFAULTS,custName:'Power Proposal QA',propRef:'QA-SIX-PAGES',galleryUrl:'https://example.com/solar',arkaUrl:'https://example.com/arka-report',pvsystUrl:'https://example.com/pvsyst-report'});Render.renderAll();});
  const id=await p.evaluate(()=>{Proposals.saveActive(StateStore.collectForm(),CONTENT,PROJECT_IMAGES);return Proposals.activeId();});
  const q=await context.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto(base+'/share.html?p='+encodeURIComponent(id));await q.waitForFunction(()=>window.Render?.lastState);
  await q.selectOption('#pdfFormat','power');assert.match(await q.locator('#pdfFormat option:checked').textContent(),/6-page/);
  // Real rasterisation + PDF save from a persisted Customer View; keep a review copy.
  const pdf=await q.evaluate(async()=>{
   const Native=jspdf.jsPDF,capture=html2canvas,result={pages:[],ink:{}};
   jspdf.jsPDF=function(...args){const pdf=new Native(...args);pdf.save=name=>{result.name=name;result.bytes=pdf.output('datauristring').split(',')[1];};return pdf;};
   window.html2canvas=async(el,opts)=>{
    result.pages.push(el.id);const c=await capture(el,opts);
    if(el.id==='powerPage4'){
     const image=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let orange=0,navy=0;
     for(let i=0;i<image.length;i+=4){if(image[i]>180&&image[i+1]>70&&image[i+1]<190&&image[i+2]<90)orange++;if(image[i]<60&&image[i+1]<90&&image[i+2]>40&&image[i+2]<140)navy++;}
     result.ink={orange,navy};
    }
    return c;
   };
   try{await Exporter.exportPdf(()=>{},{format:'power'});return result;}finally{jspdf.jsPDF=Native;window.html2canvas=capture;}
  });
  assert.deepEqual(pdf.pages,['powerPage1','powerPage2','powerPage3','powerPage4','powerPage5','powerPage6']);
  const bytes=Buffer.from(pdf.bytes,'base64'),text=bytes.toString('latin1');assert.equal((text.match(/\/Type \/Page\b/g)||[]).length,6);assert.ok(text.includes('https://example.com/solar'));assert.ok(text.includes('https://example.com/arka-report'));assert.ok(text.includes('https://example.com/pvsyst-report'));assert.ok(pdf.ink.orange>1000&&pdf.ink.navy>1000,'charts visible in actual raster, not only DOM');
  fs.mkdirSync(path.join(__dirname,'shots','power-six'),{recursive:true});fs.writeFileSync(path.join(__dirname,'shots','power-six','Power-Proposal-6-Pages.pdf'),bytes);
  assert.equal(await q.locator('.pdf-snapshot').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS: saved Customer View, actual six-page PDF, chart pixels, clickable gallery link and cleanup.');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
