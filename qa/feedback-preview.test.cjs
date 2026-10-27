'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
 assert.equal(source('feedback-preview.html').match(/<form id="proposalFeedbackForm">[\s\S]*?<\/form>/)[0],source('portal.html').match(/<form id="proposalFeedbackForm">[\s\S]*?<\/form>/)[0],'same customer form, not a separate invented design');
 const {default:chrome}=await import('@sparticuz/chromium');
 const browser=await chromium.launch({executablePath:await chrome.executablePath(),args:chrome.args.filter(a=>a!=='--single-process'),headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),errors=[],previewApi=[];
  await context.route('**/api/**',r=>{if(r.request().frame().url().includes('/feedback-preview.html'))previewApi.push(r.request().url());return r.fulfill({status:404,contentType:'application/json',body:'{}'});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';
  await page.goto(base+'/quotation.html');await page.waitForFunction(()=>window.Render?.lastState&&document.querySelector('.studio-ready'));
  await page.evaluate(()=>{shareUrl.value='';Render.renderAll();});
  assert(await page.locator('#v_clDiscuss').isVisible());assert.equal(await page.locator('#v_clDiscuss').getAttribute('href'),null);
  const popup=context.waitForEvent('page');await page.locator('#v_clDiscuss').focus();await page.keyboard.press('Enter');
  const preview=await popup;await preview.waitForLoadState('load');preview.on('pageerror',e=>errors.push(e.message));
  assert(preview.url().endsWith('/feedback-preview.html'));let apiRequests=0;preview.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiRequests++;});
  assert(await preview.locator('.feedback-preview-banner').isVisible());assert(await preview.locator('#feedbackSubmit').isDisabled());
  assert.equal(await preview.locator('[name=proposalRating]:checked').count(),0);
  await preview.locator('[name=proposalRating][value="3"]').check({force:true});assert.equal(await preview.locator('#feedbackRatingText').textContent(),'3 out of 5');
  assert.equal(await preview.locator('#feedbackMood').textContent(),'🙂');
  await preview.locator('[name=feedbackNextChoice][value=interested]').focus();await preview.keyboard.press('ArrowRight');
  assert.equal(await preview.locator('#feedbackNext').inputValue(),'changes','native keyboard choice updates the saved preference');
  await preview.locator('#feedbackClearNext').click();assert.equal(await preview.locator('[name=feedbackNextChoice]:checked').count(),0);
  await preview.locator('.feedback-option:has(input[value=question])').click();assert.equal(await preview.locator('#feedbackNext').inputValue(),'question');
  await preview.locator('#feedbackClearRating').click();assert.equal(await preview.locator('#feedbackMood').textContent(),'✦');
  for(const [rating,emoji] of [[1,'😕'],[2,'🙁'],[3,'🙂'],[4,'😊'],[5,'🤩']]){await preview.locator('[name=proposalRating][value="'+rating+'"]').check({force:true});assert.equal(await preview.locator('#feedbackMood').textContent(),emoji);}
  await preview.locator('[name=proposalRating][value="4"]').check({force:true});
  await preview.locator('#feedbackComment').fill('Previewing the feedback form.');
  await preview.locator('#proposalFeedbackForm').evaluate(f=>f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(apiRequests,0);assert.deepEqual(previewApi,[]);assert.equal(await preview.locator('#feedbackSuccess').isVisible(),false);
  assert((await preview.locator('#feedbackStatus').textContent()).includes('Nothing has been sent'));
  assert.equal(await preview.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('qs.feedback.draft.')).length),0);
  const shots=path.join(__dirname,'shots','proposal-feedback');fs.mkdirSync(shots,{recursive:true});
  await preview.setViewportSize({width:1200,height:1400});await preview.locator('#feedbackComment').fill('Could you walk me through the roof layout and the system size?');
  await preview.screenshot({path:path.join(shots,'premium-feedback-desktop.png'),fullPage:true});
  await page.evaluate(()=>document.activeElement?.blur());
  await page.locator('#pageClosing .closing-invitation').screenshot({path:path.join(shots,'premium-closing-actions.png')});
  for(const width of [390,360]){await preview.setViewportSize({width,height:900});assert(await preview.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  assert.deepEqual(errors,[]);fs.mkdirSync(path.join(__dirname,'shots','proposal-feedback'),{recursive:true});await preview.screenshot({path:path.join(__dirname,'shots','proposal-feedback','form-preview-mobile.png'),fullPage:true});
  console.log('PASS: visible builder feedback action opens the actual form preview via keyboard; matching fields, optional stars, mobile fit, no API writes/drafts/fake success.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
