/* QR configuration and multilingual narration. The speech engine is mocked:
   checks prove language routing/state safety, not availability or sound quality
   of OS voices. A separate no-voice path verifies honest fallback behaviour. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const puppeteer=require('puppeteer-core');
let passed=0;
const check=(name,ok)=>{assert(ok,name);passed++;console.log('  ✓ '+name);};
async function installSpeech(page) {
  await page.evaluateOnNewDocument(()=>{
    const speech=new EventTarget();
    speech.voices=[{name:'English test voice',lang:'en-IN',localService:true},{name:'Hindi test voice',lang:'hi-IN',localService:true},{name:'Marathi test voice',lang:'mr-IN',localService:true}];
    speech.spoken=[];speech.cancels=0;speech.pauses=0;speech.resumes=0;
    speech.getVoices=()=>speech.voices;
    speech.cancel=()=>{speech.cancels++;};speech.pause=()=>{speech.pauses++;};speech.resume=()=>{speech.resumes++;};
    speech.speak=u=>{speech.spoken.push(u);queueMicrotask(()=>u.onstart?.());};
    Object.defineProperty(window,'speechSynthesis',{value:speech,configurable:true});
    Object.defineProperty(window,'SpeechSynthesisUtterance',{value:class{constructor(text){this.text=text;}},configurable:true});
    window.__speech=speech;
  });
}
(async()=>{
 const {default:chromium}=await import('@sparticuz/chromium');
 const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
 try {
  const base=process.env.QA_BASE||'http://127.0.0.1:8080', page=await browser.newPage(),errors=[];
  await installSpeech(page);page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1440,height:1100});await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});
  await page.evaluate(()=>document.fonts.ready);
  const edit=async fields=>{await page.evaluate(fields=>{for(const [id,value] of Object.entries(fields)){const e=document.getElementById(id);if(e.type==='checkbox')e.checked=value;else e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}},fields);await page.evaluate(()=>Experience.whenReady());};
  check('audio is collapsed and never autoplays on load',await page.evaluate(()=>!document.getElementById('proposalBriefing').open&&__speech.spoken.length===0));
  await page.click('#modeAll');
  await page.click('[data-section="galleryUrl"] > summary');
  check('QR destination and audio toggle are available in Advanced / All settings',await page.$eval('#customerExperienceSettings',e=>e.checkVisibility()&&!!e.querySelector('#galleryUrl')&&!!e.querySelector('#briefingEnabled')));
  check('blank destination shows setup guidance but no customer QR',await page.evaluate(()=>document.getElementById('closingGallery').hidden&&document.getElementById('galleryStatus').textContent.includes('Add a public HTTPS')));
  await edit({qrDestinationType:'video',galleryUrl:'https://example.com/project-videos'});
  check('video destination updates closing card label, accessibility name and exact link',await page.$eval('#closingGallery',e=>e.href==='https://example.com/project-videos'&&e.textContent.includes('Open video / playlist')&&e.getAttribute('aria-label').includes('video')));
  check('short PDF uses the same destination type and link',await page.evaluate(()=>{const h=Experience.buildPowerPages(Render.lastState),a=h.querySelector('.power-gallery');const ok=a.href==='https://example.com/project-videos'&&a.textContent.includes('Open video / playlist');h.remove();return ok;}));
  await edit({qrDestinationType:'website'});
  check('changing destination type with the same URL updates copy immediately',await page.$eval('#closingGallery',e=>e.textContent.includes('Visit our website')&&e.href==='https://example.com/project-videos'));
  await edit({galleryUrl:''});
  check('removing the URL clears the QR in both document formats',await page.evaluate(()=>{const h=Experience.buildPowerPages(Render.lastState),ok=document.getElementById('closingGallery').hidden&&!h.querySelector('.power-gallery');h.remove();return ok;}));
  await page.$eval('#proposalBriefing',e=>{e.open=true;e.scrollIntoView({behavior:'instant'});});
  check('initial English transcript uses exact finance figures without personal customer fields',await page.evaluate(()=>{const f=Finance.compute(Render.lastState),t=document.getElementById('briefingText').textContent;return t.includes(Math.round(f.netInvestment)+' rupees')&&t.includes(Math.round(f.annualGen)+' kilowatt hours')&&t.includes('potential subsidy')&&!t.includes(Render.lastState.custName)&&!t.includes(Render.lastState.custAddress);}));
  await page.click('#briefingPlay');
  check('English Play explicitly selects the matching voice and locale',await page.evaluate(()=>__speech.spoken.at(-1).lang==='en-IN'&&__speech.spoken.at(-1).voice.lang==='en-IN'));
  await page.click('#briefingPause');
  check('Pause suspends speech and offers Resume',await page.evaluate(()=>__speech.pauses===1&&document.getElementById('briefingPause').textContent==='Resume'));
  await page.click('#briefingPause');
  check('Resume resumes the current briefing',await page.evaluate(()=>__speech.resumes>=2&&document.getElementById('briefingPause').textContent==='Pause'));
  await page.evaluate(()=>window.__oldUtterance=__speech.spoken.at(-1));
  await edit({capacity:'12.5'});
  check('live edits stop narration and refresh the written figures',await page.evaluate(()=>document.getElementById('briefingStatus').textContent.includes('Proposal updated')&&document.getElementById('briefingText').textContent.includes('12.5 kilowatts peak')&&!document.getElementById('briefingPlay').disabled));
  check('stale utterance callbacks cannot continue an outdated proposal',await page.evaluate(()=>{const n=__speech.spoken.length;__oldUtterance.onend();return n===__speech.spoken.length;}));
  await edit({moduleWattage:'620',tariff:'11'});
  for(const [language,locale,phrase] of [['hi','hi-IN','अनुमानित'],['mr','mr-IN','अंदाजित']]) {
    await page.click('[data-briefing-language="'+language+'"]');
    check(language+': localized transcript follows current module and finance inputs',await page.evaluate(({language,phrase})=>{const f=Finance.compute(Render.lastState),n=new Intl.NumberFormat(language+'-IN',{useGrouping:false,maximumFractionDigits:0}).format(f.netInvestment),t=document.getElementById('briefingText');return t.lang===language&&t.textContent.includes(phrase)&&t.textContent.includes(n);},{language,phrase}));
    await page.click('#briefingPlay');
    check(language+': correct voice selected without an English fallback',await page.evaluate(locale=>__speech.spoken.at(-1).voice.lang===locale&&__speech.spoken.at(-1).lang===locale,locale));
    await page.click('#briefingStop');
  }
  await page.evaluate(()=>{__speech.voices=__speech.voices.filter(v=>v.lang==='en-IN');__speech.dispatchEvent(new Event('voiceschanged'));});
  check('missing Marathi voice disables playback but keeps its transcript',await page.evaluate(()=>document.getElementById('briefingPlay').disabled&&document.getElementById('briefingStatus').textContent.includes('Marathi voice unavailable')&&document.getElementById('briefingText').textContent.includes('अंदाजित')));
  await page.evaluate(()=>{__speech.voices.push({name:'Marathi added later',lang:'mr-IN',localService:true});__speech.dispatchEvent(new Event('voiceschanged'));});
  check('asynchronously added voices enable Play without autoplay',await page.evaluate(()=>!document.getElementById('briefingPlay').disabled&&document.getElementById('briefingStop').disabled));
  await page.click('#briefingPlay');await page.evaluate(()=>__speech.spoken.at(-1).onerror({error:'network'}));
  check('speech-provider errors leave a usable transcript and retry controls',await page.evaluate(()=>document.getElementById('briefingStatus').textContent.includes('could not play')&&!document.getElementById('briefingPlay').disabled&&document.getElementById('briefingStop').disabled));
  await page.click('[data-briefing-language="en"]');await page.click('#briefingPlay');
  await page.evaluate(async()=>{for(let i=0;i<8;i++){__speech.spoken.at(-1).onend();await Promise.resolve();}});
  check('all briefing sections complete and controls return to idle',await page.$eval('#briefingStatus',e=>e.textContent.includes('Briefing complete')));
  await edit({customerType:'commercial'});
  check('commercial/no-subsidy narration does not imply an approved benefit',await page.$eval('#briefingText',e=>e.textContent.includes('No subsidy is included')&&!e.textContent.includes('potential subsidy')));
  check('unreached payback and empty values never produce NaN or Infinity',await page.evaluate(()=>['en','hi','mr'].every(lang=>{const t=Briefing.scriptFor({...Render.lastState,capacity:0,tariff:0},lang).join(' ');return !/NaN|Infinity|undefined/.test(t);}))); 
  await edit({companyName:'<img src=x onerror=window.briefingInjected=1>'});
  check('custom company copy is text, never executable markup',await page.evaluate(()=>!window.briefingInjected&&!document.getElementById('briefingText').children.length&&document.getElementById('briefingText').textContent.includes('<img')));
  await edit({companyName:'KTM Energy Experts',customerType:'residential',briefingEnabled:false});
  check('Advanced toggle disables the player',await page.$eval('#proposalBriefing',e=>e.hidden&&!e.open));
  await page.waitForFunction(()=>Proposals.active().form.briefingEnabled===false&&Proposals.active().form.qrDestinationType==='website');
  await page.reload({waitUntil:'networkidle0'});
  check('audio preference and QR destination type survive reload',await page.evaluate(()=>document.getElementById('proposalBriefing').hidden&&document.getElementById('qrDestinationType').value==='website'&&Render.lastState.briefingEnabled===false));
  await edit({briefingEnabled:true,qrDestinationType:'video'});
  await page.waitForFunction(()=>Proposals.active().form.briefingEnabled===true&&Proposals.active().form.qrDestinationType==='video');
  const id=await page.evaluate(()=>Proposals.activeId());
  const customer=await browser.newPage();await installSpeech(customer);customer.on('pageerror',e=>errors.push(e.message));
  await customer.setViewport({width:390,height:844});await customer.goto(base+'/share.html?p='+encodeURIComponent(id),{waitUntil:'networkidle0'});
  await customer.waitForSelector('#briefingText');
  check('Customer View inherits saved controls and exact quotation values without autoplay',await customer.evaluate(()=>Render.lastState.qrDestinationType==='video'&&document.getElementById('briefingText').textContent.includes('12.5 kilowatts peak')&&__speech.spoken.length===0));
  const before=await customer.$eval('#briefingText',e=>e.textContent);
  await customer.$eval('#scenarioTariff',e=>{e.value='18';e.dispatchEvent(new Event('input',{bubbles:true}));});
  check('exploratory tariff changes never alter the narrated quotation',await customer.$eval('#briefingText',e=>e.textContent)===before);
  await customer.$eval('#proposalBriefing',e=>{e.open=true;e.scrollIntoView({behavior:'instant'});});
  check('player fits the mobile viewport',await customer.$eval('#proposalBriefing',e=>e.getBoundingClientRect().left>=0&&e.getBoundingClientRect().right<=innerWidth+1&&e.scrollWidth<=e.clientWidth));
  await customer.click('[data-briefing-language="mr"]');await customer.$eval('.briefing-transcript',e=>e.open=true);
  await customer.evaluate(()=>document.fonts.ready);
  const shots=path.join(__dirname,'shots');fs.mkdirSync(shots,{recursive:true});
  await customer.screenshot({path:path.join(shots,'briefing-marathi-mobile.png')});
  await customer.emulateMediaType('print');
  check('audio interface stays out of browser print and both PDF page trees',await customer.evaluate(()=>!document.getElementById('proposalBriefing').checkVisibility()&&![...document.querySelectorAll('.page')].some(e=>e.querySelector('#proposalBriefing'))));
  await customer.emulateMediaType('screen');
  const fallback=await browser.newPage();await fallback.evaluateOnNewDocument(()=>{Object.defineProperty(window,'speechSynthesis',{value:undefined});});
  await fallback.goto(base+'/quotation.html',{waitUntil:'networkidle0'});
  check('unsupported browsers clearly offer the written briefing instead',await fallback.evaluate(()=>document.getElementById('briefingPlay').disabled&&document.getElementById('briefingStatus').textContent.includes('not supported')&&!!document.getElementById('briefingText').textContent));
  check('no runtime errors',errors.length===0);
  console.log(`\n${passed} passed, 0 failed`);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
