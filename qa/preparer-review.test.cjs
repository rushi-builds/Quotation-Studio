'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const {default:chrome}=await import('@sparticuz/chromium');const b=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args.filter(a=>a!=='--single-process'),headless:true});try{
 const c=await b.newContext({viewport:{width:1440,height:1200}}),p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 const base=process.env.QA_BASE||'http://127.0.0.1:8080';await p.goto(base+'/quotation.html');await p.waitForFunction(()=>window.DocumentStudio&&Render.lastState);await p.evaluate(()=>document.fonts.ready);
 const original=await p.evaluate(()=>({finance:JSON.stringify(Finance.compute(Render.lastState)),image:coverArtwork.src}));
 for(const value of ['', '   ']){await p.evaluate(value=>{prepName.value=value;Render.renderAll();},value);assert.equal(await p.locator('#v_coverPrepRow').isVisible(),false);assert(!(await p.locator('#pageCover').innerText()).includes('Prepared By'));}
 for(const type of ['residential','commercial','industrial','rwa']){
  await p.evaluate(type=>{customerType.value=type;prepName.value='  Rushi Patil  ';Render.renderAll();},type);
  assert(await p.locator('#v_coverPrepRow').isVisible());assert.equal(await p.locator('#v_coverPrepBy').textContent(),'Rushi Patil');assert.equal(await p.locator('#v_coverPrepRow #v_coverPrepLabel').count(),1);
  const bounds=await p.evaluate(()=>{const r=v_coverPrepRow.getBoundingClientRect(),a=coverArtwork.getBoundingClientRect();return {inside:r.left>=a.left&&r.right<=a.right&&r.bottom<a.bottom,fit:v_coverPrepBy.scrollHeight<=v_coverPrepBy.clientHeight+1&&v_coverPrepBy.scrollWidth<=v_coverPrepBy.clientWidth+1};});assert(bounds.inside&&bounds.fit,JSON.stringify(bounds));
 }
 await p.evaluate(()=>{customerType.value='residential';prepName.value='Rushi Patil — KTM Energy Experts project engineering and proposal coordination';Render.renderAll();});
 assert(await p.evaluate(()=>v_coverPrepBy.scrollHeight<=v_coverPrepBy.clientHeight+1));
 await p.evaluate(()=>{prepName.value='Rushi Patil';Render.renderAll();});assert.equal(await p.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState))),original.finance);assert.equal(await p.evaluate(()=>coverArtwork.src),original.image);
 // Real warning controls reveal/focus original inputs; clicking must not fill anything.
 await p.evaluate(()=>{for(const id of ['dcCableLengthM','dcCableSizeMm2','acCableLengthM','acCableSizeMm2','soilResistivity'])document.getElementById(id).value='';Render.renderAll();__qsPreflight.run();for(let n=engineeringReview;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;});
 for(const id of ['dcCableLengthM','acCableLengthM','soilResistivity']){
  const button=p.locator('[data-review-input="'+id+'"]');assert(await button.count());const before=await p.evaluate(()=>JSON.stringify(StateStore.collectForm()));await button.click();assert.equal(await p.evaluate(()=>document.activeElement.id),id);assert.equal(await p.evaluate(()=>JSON.stringify(StateStore.collectForm())),before);
 }
 await p.locator('#dcCableLengthM').fill('10');await p.locator('#dcCableSizeMm2').fill('6');await p.locator('#acCableLengthM').fill('10');await p.locator('#acCableSizeMm2').fill('10');await p.locator('#soilResistivity').fill('100');
 await p.evaluate(()=>{Render.renderAll();__qsPreflight.run();});const review=await p.locator('#engineeringReview').textContent();assert(!review.includes('DC voltage drop is not checked'));assert(!review.includes('AC voltage drop is not checked'));assert(!review.includes('earthing design needs'));
 assert(!await p.evaluate(()=>[...document.querySelectorAll('.page')].some(page=>/DATA REQUIRED|Internal engineering review|Edit DC inputs/.test(page.textContent))));
 await p.locator('#dcCableSizeMm2').fill('0');await p.evaluate(()=>{Render.renderAll();__qsPreflight.run();});assert((await p.locator('#engineeringReview').textContent()).includes('DC voltage drop is not checked'));await p.locator('#dcCableSizeMm2').fill('6');await p.evaluate(()=>Render.renderAll());
 // The pristine public exporter must also include the optional author row.
 assert.equal(await p.evaluate(()=>DocumentStudio.hasEdits()),false);
 await p.evaluate(()=>{window.__realCanvas=html2canvas;window.__pristineCover=null;window.html2canvas=async node=>{if(node.id==='pageCover')__pristineCover={name:node.querySelector('#v_coverPrepBy')?.textContent,visible:node.querySelector('#v_coverPrepRow')?.getBoundingClientRect().height>0};const canvas=document.createElement('canvas');canvas.width=100;canvas.height=140;return canvas;};});
 const pristine=p.waitForEvent('download',{timeout:30000});pristine.catch(()=>{});await p.evaluate(()=>Exporter.exportPdf(()=>{},{format:'full'}));await pristine;assert.deepEqual(await p.evaluate(()=>__pristineCover),{name:'Rushi Patil',visible:true});await p.evaluate(()=>window.html2canvas=__realCanvas);
 console.log('PASS: generated warnings have source-edit actions; real inputs clear checks, navigation does not mutate inputs, review stays outside customer pages');
 const id=await p.evaluate(()=>{__qsSaveNow();return Proposals.activeId();});await p.reload();await p.waitForFunction(()=>Render.lastState&&document.querySelector('#v_coverPrepBy')?.textContent==='Rushi Patil');assert(await p.locator('#v_coverPrepRow').isVisible());
 const customer=await c.newPage();customer.on('pageerror',e=>errors.push(e.message));await customer.goto(base+'/share.html?p='+id);await customer.waitForFunction(()=>Render.lastState&&document.querySelector('#v_coverPrepBy')?.textContent==='Rushi Patil');assert(await customer.locator('#v_coverPrepRow').isVisible());
 await p.evaluate(()=>{prepName.value='   ';Render.renderAll();__qsSaveNow();});await customer.reload();await customer.waitForFunction(()=>Render.lastState?.prepName==='   ');assert.equal(await customer.locator('#v_coverPrepRow').isVisible(),false);assert(!(await customer.locator('#pageCover').innerText()).includes('Prepared By'));
 await p.evaluate(()=>{prepName.value='Rushi Patil';Render.renderAll();__qsSaveNow();});
 await p.selectOption('#advancedSystemSelect','dg',{force:true});assert(await p.evaluate(()=>{const a=v_coverPrepRow.getBoundingClientRect(),b=v_coverSystem.getBoundingClientRect();return a.bottom<=b.top||b.bottom<=a.top;}));
 await p.setViewportSize({width:390,height:844});assert(await p.locator('#v_coverPrepRow').isVisible());assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 const folder=path.join(__dirname,'shots','preparer-review');fs.mkdirSync(folder,{recursive:true});await p.setViewportSize({width:1440,height:1200});await p.locator('#pageCover').screenshot({path:path.join(folder,'cover.png')});
 // Capture a real cover PDF through the normal public exporter.
 await p.evaluate(()=>{for(const page of Render.PAGES.filter(p=>!p.id.includes('continuation')))DocumentStudio.excludePage(page.id,page.id!=='pageCover');window.__preparerCapture=[];const render=html2canvas;window.html2canvas=(node,options)=>{__preparerCapture.push({name:node.querySelector('#v_coverPrepBy')?.textContent,visible:node.querySelector('#v_coverPrepRow')?.getBoundingClientRect().height>0,internal:!!node.querySelector('#engineeringReview')});return render(node,options);};});
 const wait=p.waitForEvent('download',{timeout:120000});wait.catch(()=>{});await p.evaluate(()=>Exporter.exportPdf(()=>{},{format:'full'}));const pdf=await wait;await pdf.saveAs(path.join(folder,'prepared-cover.pdf'));assert.deepEqual(await p.evaluate(()=>__preparerCapture),[{name:'Rushi Patil',visible:true,internal:false}]);
 assert.deepEqual(errors,[]);console.log('PASS: optional/whitespace-safe preparer on all four covers; long-name fit, scope separation, mobile, reload, Customer View and actual cover PDF; artwork/calculations unchanged');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
