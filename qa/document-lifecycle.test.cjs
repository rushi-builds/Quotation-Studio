'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
(async()=>{const {default:chrome}=await import('@sparticuz/chromium');const b=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args.filter(a=>a!=='--single-process'),headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto((process.env.QA_BASE||'http://127.0.0.1:8080')+'/quotation.html');await p.waitForFunction(()=>window.DocumentStudio&&Render.lastState&&document.querySelector('#documentStudio'));
 const source=await p.evaluate(()=>({finance:JSON.stringify(Finance.compute(Render.lastState)),cover:pageCover.innerHTML,proposal:Proposals.activeId()}));
 // Enlarging original paragraph text must preserve every character, not only new blocks.
 const native=await p.evaluate(()=>{const t=DocumentStudio.inventory('pageAbout').texts.find(t=>!t.locked&&t.node.parentElement.matches('p')&&t.from.length>100);t.node.parentElement.dataset.qaNativeText='true';const value='Native paragraph words and spacing stay intact. '.repeat(160);DocumentStudio.setText('pageAbout',t.key,value);return value;});
 assert.equal(await p.evaluate(()=>[...document.querySelectorAll('[data-qa-native-text]')].map(p=>p.textContent).join('')),native);
 assert.deepEqual(await p.evaluate(()=>DocumentStudio.errors()),[]);await p.evaluate(()=>DocumentStudio.restorePage('pageAbout'));
 console.log('PASS: enlarged original paragraph flows with exact character preservation');
 const tableText=await p.evaluate(()=>{const t=DocumentStudio.inventory('pageTechSpec').texts.find(t=>!t.locked&&t.node.parentElement.matches('td')&&t.from.length>3);if(!t)throw new Error('No technical table label');t.node.parentElement.dataset.qaTableText='true';const value='Readable technical explanation preserves every word. '.repeat(130);DocumentStudio.setText('pageTechSpec',t.key,value);return value;});
 assert.deepEqual(await p.evaluate(()=>DocumentStudio.errors()),[]);assert.equal(await p.evaluate(()=>[...document.querySelectorAll('[id^=pageTechSpec] td')].filter(n=>n.textContent.includes('Readable technical')).map(n=>n.textContent).join('')),tableText);await p.evaluate(()=>DocumentStudio.restorePage('pageTechSpec'));
 console.log('PASS: oversized native table text continues by row/cell without losing characters');
 // Long additions on every type of page, including the bespoke cover/closing.
 for(const id of ['pageCover','pageClosing','pageScope','pageInvestment']){
  const result=await p.evaluate(id=>{DocumentStudio.addTextBlock(id,'Lifecycle content','Keep every character and word. '.repeat(100));return {errors:DocumentStudio.errors(),pages:Render.lastVisible.filter(p=>p.id.startsWith(id)).length};},id);
  assert.deepEqual(result.errors,[],id+JSON.stringify(result));assert(result.pages>1,id);
 }
 assert.equal(await p.evaluate(()=>pageCover.innerHTML),source.cover);
 assert.equal(await p.evaluate(()=>JSON.stringify(Finance.compute(Render.lastState))),source.finance);
 console.log('PASS: additions on cover, closing, scope and investment paginate without changing artwork/calculations');
 await p.evaluate(()=>{for(const id of ['pageCover','pageClosing','pageScope','pageInvestment'])DocumentStudio.restorePage(id);});
 // Create a native custom page through the actual control, then exercise undo.
 await p.locator('#advancedPanel>summary').click();
 await p.locator('[aria-label="Page to edit"]').selectOption('pageTerms');
 await p.getByRole('button',{name:'Add a page after this',exact:true}).click();
 const custom=await p.locator('[aria-label="Page to edit"]').inputValue();assert(custom.startsWith('studioPage-'));
 await p.getByLabel('New page title',{exact:true}).fill('<img src=x onerror=alert(1)> Safe title');
 await p.getByLabel('New page title',{exact:true}).blur();
 assert.equal(await p.locator('#pageNav img').count(),0);
 assert((await p.locator('#pageNav').textContent()).includes('<img src=x onerror=alert(1)>'));
 await p.getByRole('button',{name:'Undo',exact:true}).click();assert.equal(await p.getByLabel('New page title').inputValue(),'New page');
 await p.getByRole('button',{name:'Redo',exact:true}).click();assert((await p.getByLabel('New page title').inputValue()).includes('Safe title'));
 await p.evaluate(id=>DocumentStudio.addTextBlock(id,'Literal section','<script>window.pwned=true</script> plus ordinary text.'),custom);
 assert.equal(await p.evaluate(()=>window.pwned),undefined);
 assert((await p.locator('#'+custom).textContent()).includes('<script>window.pwned=true</script>'));
 // New list and uploaded image section through the real UI.
 await p.getByRole('button',{name:'+ Bullet list',exact:true}).click();await p.getByLabel('One bullet per line',{exact:true}).fill('First complete bullet\nSecond complete bullet');
 await p.getByLabel('Add a photograph section',{exact:true}).setInputFiles(path.join(__dirname,'../assets/images/ktm-logo-dark.png'));
 await p.waitForFunction(id=>document.querySelector('#'+id+' .doc-user-block img'),custom);
 assert.equal(await p.locator('#'+custom+' li').count(),2);assert.deepEqual(await p.evaluate(()=>DocumentStudio.errors()),[]);
 // Preserve advisory review/consent, and never create a PDF on Close or a blocker.
 await p.evaluate(()=>{window.__realPreflight=__qsPreflight.run;__qsPreflight.run=()=>({blocking:[],advisory:[{id:'custName',message:'Disposable test advisory: review this value.'}]});});
 await p.click('#downloadBtn');await p.locator('#docExportReview').waitFor();assert(await p.getByRole('button',{name:'Download anyway',exact:true}).isVisible());await p.getByRole('button',{name:'Close',exact:true}).click();
 await p.evaluate(()=>__qsPreflight.run=()=>({blocking:[{id:'custName',message:'Disposable blocking issue'}],advisory:[]}));await p.click('#downloadBtn');await p.locator('#docExportReview').waitFor();assert.equal(await p.getByRole('button',{name:'Download anyway',exact:true}).count(),0);await p.getByRole('button',{name:'Close',exact:true}).click();await p.evaluate(()=>__qsPreflight.run=__realPreflight);
 console.log('PASS: native list/image actions and unchanged advisory/blocked-download gate');
 // Selected preset wording must not leak between different system variants.
 await p.selectOption('#advancedSystemSelect','dg',{force:true});await p.waitForFunction(()=>Render.lastState.systemTemplate==='dg');
 await p.evaluate(()=>{const item=DocumentStudio.inventory('pageSystemOverview').texts.find(t=>!t.locked&&t.label.includes('One considered'));if(!item)throw new Error('DG heading unavailable');DocumentStudio.setText('pageSystemOverview',item.key,'A scoped DG heading.');});
 assert((await p.locator('#pageSystemOverview').textContent()).includes('A scoped DG heading.'));
 await p.selectOption('#advancedSystemSelect','monitoring',{force:true});await p.waitForFunction(()=>Render.lastState.systemTemplate==='monitoring');assert(!(await p.locator('#pageSystemOverview').textContent()).includes('A scoped DG heading.'));
 await p.selectOption('#advancedSystemSelect','dg',{force:true});await p.waitForFunction(()=>Render.lastState.systemTemplate==='dg');assert((await p.locator('#pageSystemOverview').textContent()).includes('A scoped DG heading.'));
 console.log('PASS: added pages, Undo/Redo, literal XSS-like text and scoped system wording');
 // Power-only custom sections and pages use the independent Power inventory.
 await p.locator('[aria-label="Document format to edit"]').selectOption('power');
 await p.locator('[aria-label="Page to edit"]').selectOption('power2');
 await p.evaluate(()=>DocumentStudio.addTextBlock('power2','Extra Power details','Power details preserve every word. '.repeat(80)));
 await p.getByRole('button',{name:'View page ↗',exact:true}).click();
 assert(await p.locator('.doc-preview-dialog').isVisible());
 assert(await p.locator('.doc-power-preview>.page').count()>6);
 await p.getByRole('button',{name:'Close preview',exact:true}).click();
 await p.getByRole('button',{name:'Add a page after this',exact:true}).click();
 const powerCustom=await p.locator('[aria-label="Page to edit"]').inputValue();assert(powerCustom.startsWith('studioPage-'));
 assert(!await p.evaluate(id=>Render.PAGES.some(p=>p.id===id),powerCustom));
 await p.evaluate(id=>DocumentStudio.addTextBlock(id,'Power-only page','This page belongs only to the Power report.'),powerCustom);
 // Export uses a detached snapshot: a mid-capture source edit must not delete it.
 const folder=path.join(__dirname,'shots','document-studio');fs.mkdirSync(folder,{recursive:true});
 await p.evaluate(()=>{window.__canvasOriginal=html2canvas;window.__captureTexts=[];window.__editedDuringCapture=false;window.html2canvas=async(page,opts)=>{__captureTexts.push(page.textContent);if(!__editedDuringCapture){__editedDuringCapture=true;custName.value='Changed during capture';custName.dispatchEvent(new Event('input',{bubbles:true}));}return __canvasOriginal(page,opts);};});
 const waiting=p.waitForEvent('download',{timeout:180000});waiting.catch(()=>{});await p.evaluate(()=>DocumentStudio.exportPdf('power'));const download=await waiting;await download.saveAs(path.join(folder,'power-custom.pdf'));
 assert((await p.evaluate(()=>__captureTexts.join('\n'))).includes('This page belongs only to the Power report.'));
 assert(!(await p.evaluate(()=>__captureTexts.join('\n'))).includes('Changed during capture'));
 await p.evaluate(()=>window.html2canvas=__canvasOriginal);
 // Owner-bound data persists without spilling into a newly created quotation.
 const id=await p.evaluate(()=>{__qsSaveNow();return Proposals.activeId();});
 await require('./legacy-proposal-fixture.cjs')(p, 'pmNew');
 await p.waitForFunction(id=>Proposals.activeId()!==id,id);assert.equal(await p.evaluate(()=>DocumentStudio.hasEdits()),false);
 await p.selectOption('#proposalSelect',id);await p.waitForFunction(id=>Proposals.activeId()===id,id);assert(await p.evaluate(()=>DocumentStudio.hasEdits()));
 assert.deepEqual(errors,[]);console.log('PASS: Power continuations/custom page, snapshot isolation during source edits, new-proposal isolation and switch restore');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
