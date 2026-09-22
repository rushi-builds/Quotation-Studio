/* Real typing into equipment suggestions; persistence and actual PDF capture. */
'use strict';
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),puppeteer=require('puppeteer-core');
let passed=0;const check=(name,ok)=>{assert(ok,name);passed++;console.log('  ✓ '+name);};
(async()=>{
 const {default:chromium}=await import('@sparticuz/chromium');
 const browser=await puppeteer.launch({executablePath:await chromium.executablePath(),args:chromium.args.filter(a=>a!=='--single-process'),headless:true});
 const custom={moduleMake:'Custom Solar & Partners',moduleTech:'Custom HJT technology',inverterMake:'Custom Inverter "A"',mountMake:'Custom galvanized structure',cableMake:'Custom cable <series>',roofType:'Custom industrial roof'};
 const out=path.join(__dirname,'shots','equipment-entry');fs.mkdirSync(out,{recursive:true});
 try {
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.QA_BASE||'http://127.0.0.1:8080';
  await page.setViewport({width:1440,height:1100});await page.goto(base+'/quotation.html',{waitUntil:'networkidle0'});await page.evaluate(()=>document.fonts.ready);
  await page.click('[data-section="moduleMake"] > summary');
  async function type(id,value){await page.focus('#'+id);await page.keyboard.down('Control');await page.keyboard.press('A');await page.keyboard.up('Control');await page.keyboard.press('Backspace');await page.type('#'+id,value);await page.keyboard.press('Tab');}
  async function matchingForm(){return page.evaluate(values=>Object.entries(values).every(([id,v])=>document.getElementById(id).value===v&&Render.lastState[id]===v),custom);}
  async function matchingSpec(target){return target.$eval('#v_tsTable',(el,values)=>Object.values(values).every(v=>[...el.querySelectorAll('.spec-v')].some(cell=>cell.textContent===v)),custom);}
  check('all six equipment fields are labelled editable inputs with existing suggestions',await page.evaluate(ids=>ids.every(id=>{const el=document.getElementById(id);return el.type==='text'&&!el.readOnly&&el.list?.options.length>0&&document.querySelector('label[for="'+id+'"]')&&document.getElementById(el.getAttribute('aria-describedby'));}),Object.keys(custom)));
  await page.evaluate(()=>{
   EquipmentStore.cat().modules.push({id:'qa-module',make:'Catalog module 620',wp:620,tech:'Catalog HJT custom',lengthMm:2300,widthMm:1134});
   EquipmentStore.cat().inverters.push({id:'qa-inverter',make:'Catalog inverter 8',kw:8});
   EquipmentStore.save();EquipmentStore.refreshSelects();
  });
  await type('moduleMake','Catalog module 620');
  check('choosing a catalog make still fills real rating, dimensions and custom technology',await page.evaluate(()=>moduleWattage.value==='620'&&moduleLengthMm.value==='2300'&&moduleWidthMm.value==='1134'&&moduleTech.value==='Catalog HJT custom'));
  await type('inverterMake','Catalog inverter 8');
  check('known inverter rating still autofills',await page.$eval('#inverterKw',el=>el.value==='8'));
  for(const [id,value] of Object.entries(custom)){
   await type(id,value);
   check(id+' accepts custom keyboard input and updates the preview immediately',await page.evaluate(({id,value})=>Render.lastState[id]===value&&document.getElementById('v_tsTable').textContent.includes(value),{id,value}));
  }
  check('unknown names do not invent or overwrite technical ratings',await page.evaluate(()=>moduleWattage.value==='620'&&moduleLengthMm.value==='2300'&&inverterKw.value==='8'));
  check('markup-like brand text is rendered literally, not as elements',await page.$eval('#v_tsTable',el=>!el.querySelector('series')&&el.textContent.includes('Custom cable <series>')));
  check('pricing is unchanged by custom makes',await page.evaluate(()=>Finance.compute(Render.lastState).netInvestment===608070));
  await page.evaluate(()=>EquipmentStore.refreshSelects());
  check('catalog refresh does not discard custom values',await matchingForm());
  await type('moduleMake','');await page.evaluate(()=>EquipmentStore.refreshSelects());
  check('clearing a make is not silently replaced with a default',await page.$eval('#moduleMake',el=>el.value===''));
  await type('moduleMake',custom.moduleMake);
  await page.evaluate(()=>window.__qsSaveNow());
  check('all six custom values persist in the proposal',await page.evaluate(values=>Object.entries(values).every(([id,v])=>Proposals.active().form[id]===v),custom));
  check('proposal-specific names do not silently change the shared catalog',await page.evaluate(values=>!EquipmentStore.cat().modules.some(x=>x.make===values.moduleMake)&&!EquipmentStore.cat().cables.some(x=>x.label===values.cableMake),custom));
  const original=await page.evaluate(()=>Proposals.activeId());
  await page.reload({waitUntil:'networkidle0'});
  check('reload preserves custom values and rendered specification',await matchingForm()&&await matchingSpec(page));
  await page.evaluate(()=>document.querySelector('.studio-management').open=true);await page.click('#pmNew');
  check('new quotation retains original template equipment, not previous custom entries',await page.evaluate(()=>moduleMake.value===StateStore.DEFAULTS.moduleMake&&roofType.value===StateStore.DEFAULTS.roofType));
  await page.select('#proposalSelect',original);
  check('switching back restores all custom entries',await matchingForm());
  await page.click('#pmDup');const duplicate=await page.evaluate(()=>Proposals.activeId());
  check('duplicate retains all custom entries',duplicate!==original&&await matchingForm());
  await page.evaluate(()=>document.querySelector('.studio-tools').open=true);
  page.once('dialog',dialog=>dialog.accept());await page.click('#resetBtn');
  check('reset restores equipment defaults on only the active duplicate',await page.evaluate(id=>moduleMake.value===StateStore.DEFAULTS.moduleMake&&Proposals.get(id).form.moduleMake==='Custom Solar & Partners',original));
  await page.select('#proposalSelect',original);
  // Saved option fields remain plain strings; applying an option must not require a catalog entry.
  await page.click('#modeAll');await page.evaluate(()=>document.querySelector('[data-section="optName"]').open=true);
  await page.type('#optName','Custom equipment design');await page.click('#optSave');
  await page.evaluate(()=>{moduleMake.value='Temporary make';moduleMake.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.click('#optList button[data-act="apply"]');
  check('saved system option restores custom module/inverter/technology',await matchingForm());
  await page.evaluate(()=>{window.__realCreate=URL.createObjectURL;URL.createObjectURL=blob=>{window.__equipmentBackup=blob;return window.__realCreate(blob);};StateStore.exportFile();});
  const backup=await page.evaluate(async()=>{const text=await window.__equipmentBackup.text();URL.createObjectURL=window.__realCreate;return text;});
  check('JSON backup preserves every custom string',Object.entries(custom).every(([id,value])=>JSON.parse(backup).proposal.form[id]===value));
  const file=path.join(out,'custom-equipment.json');fs.writeFileSync(file,backup);
  await (await page.$('#importFile')).uploadFile(file);await page.waitForFunction(id=>Proposals.activeId()!==id,original);
  check('JSON import restores custom makes without requiring the equipment catalog',await matchingForm()&&await matchingSpec(page));
  await page.evaluate(()=>window.__qsSaveNow());const imported=await page.evaluate(()=>Proposals.activeId());
  const customer=await browser.newPage();customer.on('pageerror',e=>errors.push(e.message));
  await customer.goto(base+'/share.html?p='+encodeURIComponent(imported),{waitUntil:'networkidle0'});
  check('Customer View displays all custom values',await matchingSpec(customer));
  await customer.emulateMediaType('print');check('print view retains literal custom values',await matchingSpec(customer));await customer.close();
  await page.setViewport({width:390,height:844});await page.click('#modeEss');await page.evaluate(()=>document.querySelector('[data-section="moduleMake"]').open=true);
  await type('cableMake','Mobile cable entry');
  check('custom typing works at mobile width',await page.$eval('#v_tsTable',el=>el.textContent.includes('Mobile cable entry')));
  await type('cableMake',custom.cableMake);
  check('equipment inputs fit the mobile viewport',await page.evaluate(ids=>document.documentElement.scrollWidth<=innerWidth&&ids.every(id=>document.getElementById(id).getBoundingClientRect().right<=innerWidth),Object.keys(custom)));
  await page.screenshot({path:path.join(out,'mobile.png')});
  await page.setViewport({width:1440,height:1100});await page.screenshot({path:path.join(out,'desktop.png')});await page.bringToFront();
  for(const name of fs.readdirSync(out))if(name.endsWith('.pdf'))fs.unlinkSync(path.join(out,name));
  const cdp=await page.createCDPSession();await cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out,eventsEnabled:true});
  let timer;const downloadDone=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('PDF download timed out')),120000);cdp.on('Browser.downloadProgress',event=>{if(event.state==='completed'){clearTimeout(timer);resolve();}if(event.state==='canceled'){clearTimeout(timer);reject(new Error('PDF download canceled'));}});});downloadDone.catch(()=>{});
  await page.evaluate(values=>{
   const native=window.html2canvas;window.__restoreCapture=()=>{window.html2canvas=native;};
   window.html2canvas=async(el,options)=>{
    if(el.id==='pageTechSpec'){
     window.__customCaptured=Object.values(values).every(v=>[...el.querySelectorAll('.spec-v')].some(cell=>cell.textContent===v));
     if(!window.__customCaptured)throw new Error('Custom equipment lost in PDF snapshot');
    }
    const canvas=await native(el,options);if(el.id==='pageTechSpec')window.__customCanvas=canvas.toDataURL('image/png');return canvas;
   };
  },custom);
  try{await page.click('#downloadBtn');await page.waitForFunction(()=>statusMsg.textContent.includes('Downloaded'),{timeout:120000});await downloadDone;}finally{clearTimeout(timer);await page.evaluate(()=>window.__restoreCapture());}
  check('real PDF capture contains every custom equipment value',await page.evaluate(()=>window.__customCaptured));
  fs.writeFileSync(path.join(out,'technical-specification-pdf.png'),Buffer.from((await page.evaluate(()=>window.__customCanvas)).split(',')[1],'base64'));
  const pdf=fs.readdirSync(out).find(name=>name.endsWith('.pdf'));
  check('actual detailed PDF downloads with all 15 pages',!!pdf&&(fs.readFileSync(path.join(out,pdf),'latin1').match(/\/Type \/Page\b/g)||[]).length===15);
  check('no browser runtime errors',errors.length===0);
  console.log(`\n${passed} passed, 0 failed`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
