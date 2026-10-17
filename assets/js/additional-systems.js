/* Optional project systems: editable scope, explicit commercial basis, no Finance mutations. */
'use strict';
(function(root){
 const W=typeof module==='object'&&module.exports?require('./rainwater.js'):root.Rainwater;
 const DEFAULTS={...W.DEFAULTS,systemEnabled:false,systemInclude:true,systemTemplate:'custom',systemReason:'requested',systemName:'',systemPurpose:'',systemEquipment:'',systemScope:'',systemNotes:'',systemExclusions:'',systemPrice:'',systemDelivery:'',systemWarranty:'',systemPriceMode:'separate',systemAreaM2:'',systemHeightM:'',systemBays:'',systemWeatherProtection:'pending',systemRoofing:'',systemDrainage:'',systemAcceptance:'',systemBaseReviewed:false,systemScopeReviewed:false,systemAdditions:'',bessAdditions:'',bessAdditionsReviewed:false};
 const templates={
  "zero": {
    "name": "Zero Export Control",
    "purpose": "Control solar export at the point of grid connection, where export is restricted or not intended.",
    "equipment": "Compatible export controller / inverter control function\nBidirectional meter or correctly sized current transformers\nCommunication links and required control interfaces",
    "scope": "Review the point of common coupling and site load profile\nConfirm inverter control compatibility and meter placement\nConfigure the agreed export setpoint and fail-safe behaviour\nTest load changes, communication loss and commissioned settings",
    "notes": "Zero export is not outage backup. Response delays can allow transient export; final limits and acceptance tests must be agreed with the utility. Curtailment can reduce solar generation and savings. Existing solar figures do not include this effect.",
    "exclusions": "Utility approval, switchboard replacement and major cabling unless priced\nGuaranteed elimination of every transient export\nBattery backup or generator integration unless separately included"
  },
  "monitoring": {
    "name": "Energy Monitoring",
    "purpose": "Bring generation, import/export and selected consumption measurements into a clearer view for the project team.",
    "equipment": "Compatible energy meters / current transformers\nData logger or monitoring gateway\nAgreed local or cloud dashboard and communication link",
    "scope": "Agree the measurement points and dashboard requirements\nVerify meter ratings, polarity and communication protocols\nConfigure data logging, access permissions and alerts\nTest readings and hand over user access",
    "notes": "Monitoring measures performance; it does not itself reduce consumption or guarantee savings. Data accuracy depends on metering and installation. Connectivity, subscriptions, retention and data ownership must be agreed.",
    "exclusions": "Recurring data / cloud subscription unless priced\nNetwork infrastructure changes and additional metering points\nAutomated load control unless explicitly included"
  },
  "ev": {
    "name": "EV Charging Integration",
    "purpose": "Add a defined charging point with electrical capacity and optional solar-aware scheduling reviewed for the site.",
    "equipment": "Selected EV charger and compatible connector\nDedicated circuit, appropriate protection and earthing\nOptional meter / load-management interface, if specified",
    "scope": "Confirm vehicle compatibility and requested charging power\nAssess sanctioned load, spare capacity and cable route\nDesign protection and earthing to applicable requirements\nConfigure agreed charging schedules and test operation",
    "notes": "Charging speed depends on the charger, vehicle and available site power. Solar-only charging is not guaranteed. Charging adds consumption; the solar quotation does not model the additional EV load or savings.",
    "exclusions": "Sanctioned-load enhancement and utility charges\nCivil works and long cable routes unless priced\nVehicle battery warranty or guaranteed charging time"
  },
  "pfc": {
    "name": "Power-Factor Correction",
    "purpose": "Review reactive-power compensation for the site, using measured electrical conditions and the applicable utility billing basis.",
    "equipment": "Engineered automatic power-factor controller and capacitor-bank steps\nSuitable switching, protection, discharge and ventilation arrangements\nDetuned reactors or harmonic mitigation only where the study requires",
    "scope": "Measure demand, existing power factor and the harmonic spectrum\nReview solar and generator operating modes and minimum site load\nEngineer the bank rating, step sizes and resonance / protection checks\nCommission step switching and verify agreed operating limits",
    "notes": "This is not a solar-generation or battery-backup upgrade. Capacitor rating cannot be inferred from solar kWp alone. Harmonics, resonance and leading power factor at light load must be assessed. Any billing benefit depends on measured conditions and the utility tariff; no savings or kvar sizing is automatically assumed.",
    "exclusions": "Guaranteed tariff savings, unity power factor or harmonic elimination\nUtility penalties, approvals and switchboard replacement unless priced\nActive harmonic filtering or generator modifications unless specified"
  },
  "dg": {
    "name": "DG–Solar Coordination",
    "purpose": "Review controlled solar operation alongside the existing generator, with interlocks and operating limits engineered for the site.",
    "equipment": "Compatible solar / generator control interface\nRequired metering, reverse-power protection and interlocks\nCommunication hardware and agreed control panel modifications",
    "scope": "Survey the generator, existing changeover and load profile\nConfirm minimum generator loading and inverter control support\nEngineer the coordination sequence and protection settings\nCommission transitions, fault response and operator training",
    "notes": "This is not permission to parallel equipment without engineering. Generator loading, reverse power, synchronisation and changeover behaviour require a project-specific design. No automatic diesel-saving or seamless-transfer claim is made.",
    "exclusions": "Generator supply, overhaul or fuel\nMajor switchgear replacement unless priced\nBattery backup and guaranteed fuel savings"
  },
  "weatherproof": {
    "name": "Leak Proof Solar Roof",
    "purpose": "Create a rain-protected usable rooftop space beneath the solar installation, subject to an engineered roofing and drainage design.",
    "equipment": "Solar support frame and proposed sealed roofing assembly\nEngineered joints, wall flashings, gutters and downpipes\nCompatible fixings and existing-roof interfaces",
    "scope": "Survey the roof, usable area and requested clear height\nAgree the roofing system, drainage route and junction details\nEngineer supports and connections for site conditions\nTest agreed water-ingress criteria and record handover",
    "notes": "Design intent is rain protection, not a blanket leak-free guarantee. Standard PV modules and sealed anchor holes alone do not form a leak-proof roof. Joint movement, wind-driven rain, drainage and existing roof condition require review. Scope-specific warranty must be agreed in writing.",
    "exclusions": "Existing roof repairs and concealed defects unless priced\nUnspecified civil works, drainage extensions or approvals\nLifetime leak-free performance or invented warranty periods"
  },
  "carport": {
    "name": "Solar Carport",
    "purpose": "Provide a defined solar-covered parking area with usable vehicle access and a site-engineered support structure.",
    "equipment": "Selected PV modules and engineered carport structure\nDesigned foundations, baseplates and site connections\nRoofing, drainage and lighting only where specified",
    "scope": "Confirm parking bays, vehicle clearances and movement\nSurvey services, foundation conditions and site constraints\nEngineer the frame, foundations and electrical interfaces\nAgree acceptance checks and hand over the installed scope",
    "notes": "Parking bays, covered area and clear height are project requirements; final structural design is site-specific. Rain protection requires an explicit roofing specification. EV charging, battery backup and associated savings are not included merely by selecting a carport.",
    "exclusions": "EV charger, battery storage or vehicle supply\nUnspecified excavation, paving, utilities or foundations\nLeak-proof roofing and drainage unless explicitly agreed"
  },
  "canopy": {
    "name": "Elevated Solar Canopy",
    "purpose": "Provide usable clear space beneath an elevated solar array on a suitable terrace or site.",
    "equipment": "Selected solar modules and elevated engineered frame\nDesigned roof connections or foundations and corrosion protection\nCable routing, access and fall protection as specified",
    "scope": "Agree clear height, covered footprint and access needs\nAssess the supporting roof and existing waterproofing\nEngineer frame, wind actions, connections and anchoring\nInspect workmanship and record agreed handover checks",
    "notes": "An elevated array does not by itself form a leak-proof roof. Module gaps can admit rain. Post count, spans and foundation sizes cannot be inferred from the illustration or solar kWp. Structural adequacy and site access require competent engineering review.",
    "exclusions": "Leak-proof roof, guttering or enclosed room unless priced\nExisting structural strengthening or roof repairs\nUnspecified civil works, approvals or access alterations"
  },
  "pergola": {
    "name": "Solar Pergola",
    "purpose": "Integrate solar generation with an architectural outdoor seating or dining space, with comfort and weather protection agreed for the site.",
    "equipment": "Selected PV modules and architectural support frame\nAgreed finishes and compatible mounting details\nLighting, roofing and drainage only where specified",
    "scope": "Agree footprint, clear height, aesthetics and intended use\nReview shading, access and requested weather protection\nEngineer the support frame, roof interfaces and electrical work\nInspect finishes and test the explicitly included systems",
    "notes": "A solar pergola provides the agreed outdoor structure, not an enclosed or leak-proof room unless explicitly specified. Decorative furniture, lighting, rain protection and finish samples require explicit scope approval. Rendered appearance does not establish structural dimensions or warranty.",
    "exclusions": "Furniture, landscaping and decorative lighting unless priced\nWeatherproofing, gutters or building alterations unless agreed\nUnverified finish, comfort or leak-free guarantees"
  }
};
 const presentations={
  "weatherproof": {
    "image": "system-weatherproof-roof.jpg",
    "short": "Leak Proof solar roof",
    "flow": [
      "ROOF & RAIN SURVEY",
      "ENGINEERED ROOFING",
      "WATER-INGRESS TEST"
    ],
    "structural": true
  },
  "carport": {
    "image": "system-carport-concept.jpg",
    "short": "Solar carport",
    "flow": [
      "PARKING & SITE SURVEY",
      "STRUCTURE & FOUNDATIONS",
      "ACCESS & HANDOVER"
    ],
    "structural": true
  },
  "canopy": {
    "image": "system-elevated-canopy.jpg",
    "short": "Elevated solar canopy",
    "flow": [
      "CLEARANCE & ROOF REVIEW",
      "ENGINEERED FRAME",
      "SAFE USABLE SPACE"
    ],
    "structural": true
  },
  "pergola": {
    "image": "system-pergola.jpg",
    "short": "Solar pergola",
    "flow": [
      "SPACE & FINISH BRIEF",
      "ENGINEERED PERGOLA",
      "AGREED OUTDOOR USE"
    ],
    "structural": true
  },
  "zero": {
    "image": "system-zero-concept.jpg",
    "short": "Zero export control",
    "flow": [
      "SITE METERING",
      "EXPORT CONTROL",
      "INVERTER LIMIT"
    ]
  },
  "monitoring": {
    "image": "system-monitoring-concept.jpg",
    "short": "Energy monitoring",
    "flow": [
      "ENERGY METERS",
      "DATA GATEWAY",
      "PROJECT DASHBOARD"
    ]
  },
  "ev": {
    "image": "system-ev-concept.jpg",
    "short": "EV charging integration",
    "flow": [
      "SITE CAPACITY",
      "LOAD MANAGEMENT",
      "EV CHARGER"
    ]
  },
  "pfc": {
    "image": "system-pfc-concept.jpg",
    "short": "Power-factor correction",
    "flow": [
      "SITE MEASUREMENTS",
      "ENGINEERED COMPENSATION",
      "VERIFIED POWER FACTOR"
    ]
  },
  "dg": {
    "image": "system-dg-concept.jpg",
    "short": "DG–solar coordination",
    "flow": [
      "GENERATOR & PV",
      "ENGINEERED CONTROL",
      "PROTECTED LOADS"
    ]
  },
  "custom": {
    "image": "energy-controls.jpg",
    "short": "Additional project system",
    "flow": [
      "PROJECT NEED",
      "PROPOSED SYSTEM",
      "AGREED OUTCOME"
    ]
  }
};

 // Proposed scope text, not measured dimensions, a certified design or warranty.
 const siteDefaults={
  weatherproof:{systemRoofing:'Proposed sealed roofing assembly with compatible joints, wall flashings and fixings; final method after site survey.',systemDrainage:'Proposed gutters and downpipes to an agreed discharge point; route and capacity after survey.',systemAcceptance:'Inspect joints, flashings and drainage; complete agreed water-ingress checks before handover.'},
  carport:{systemRoofing:'PV canopy on an engineered frame; rain-protection roofing only where expressly included.',systemDrainage:'Review rainwater discharge, foundations and vehicle access during the site survey.',systemAcceptance:'Inspect frame, fixings and electrical work; verify agreed vehicle clearances and handover checks.'},
  canopy:{systemRoofing:'Elevated PV array on an engineered frame; a sealed roof is not included unless agreed.',systemDrainage:'Review existing roof drainage, penetrations and discharge routes before installation.',systemAcceptance:'Inspect supports, roof interfaces, access and electrical work against the agreed design.'},
  pergola:{systemRoofing:'Architectural PV frame and agreed finishes; sealed roofing and lighting only where specified.',systemDrainage:'Review rainwater discharge and interfaces with the existing terrace or outdoor space.',systemAcceptance:'Inspect structure, finishes and electrical work; test expressly included lighting or rain protection.'}
 };
 function resolve(input={}){
  const s={...input};if(!enabled(s))return s;
  const t=template(s);if(!t)return s;
  for(const [key,value]of Object.entries(t)){
   const id='system'+key[0].toUpperCase()+key.slice(1);
   if(!String(s[id]??'').trim())s[id]=value;
  }
  if(s.systemTemplate==='weatherproof'&&s.systemName==='Weatherproof Solar Roof')s.systemName=t.name;
  for(const [key,value]of Object.entries(siteDefaults[s.systemTemplate]||{}))if(!String(s[key]??'').trim())s[key]=value;
  return s;
 }
 function fillPreset(key){
  const t=template({systemTemplate:key});if(!t)return;
  for(const [name,value]of Object.entries(t))document.getElementById('system'+name[0].toUpperCase()+name.slice(1)).value=value;
  for(const [id,value]of Object.entries(siteDefaults[key]||{}))document.getElementById(id).value=value;
 }

 const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
 const enabled=s=>s?.systemEnabled===true;
 const included=s=>enabled(s)&&(s.systemInclude===undefined||s.systemInclude===true);
 const reason=s=>({requested:'Customer requested',recommended:'Recommended upgrade',alternative:'Optional alternative'}[s?.systemReason]||'Optional alternative');
 const template=s=>own(templates,s?.systemTemplate)?templates[s.systemTemplate]:null;
 const presentation=s=>own(presentations,s?.systemTemplate)?presentations[s.systemTemplate]:presentations.custom;
 let previousTemplate='custom';
 const name=s=>{const value=String(s?.systemName||template(s)?.name||'Additional system').trim();return s?.systemTemplate==='weatherproof'&&value==='Weatherproof Solar Roof'?'Leak Proof Solar Roof':value||'Additional system';};
 const priceMode=s=>s?.systemPriceMode==='included'?'included':'separate';
 const inBase=s=>priceMode(s)==='included';
 function decimal(v){return ['string','number'].includes(typeof v)&&/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(String(v).trim())&&Number.isFinite(Number(v))?Number(v):null;}
 function price(s){if(inBase(s))return null;const v=decimal(s?.systemPrice);return v!==null&&v>=0?v:null;}
 function priceText(s){return inBase(s)?'Included in solar quoted price':price(s)===null?'Price to be confirmed':(root.Finance?.fmtINR||((n)=>'₹'+Math.round(n).toLocaleString('en-IN')))(price(s));}
 function priceNote(s){return inBase(s)?'This scope is included in the quoted solar rate / BOM. No second charge is added. Confirm scope and applicable tax treatment.':'Separate tax-inclusive quotation; excluded from solar totals and payment milestones. Agree upgrade payments separately. Do not duplicate standard EPC scope.';}
 function specifications(s){
  if(!presentation(s).structural)return [];
  const positive=(v,unit,integer=false)=>{if(v===''||v==null)return 'To be confirmed';const n=decimal(v);return n!==null&&n>0&&(!integer||Number.isInteger(n))?n.toLocaleString('en-IN',{maximumFractionDigits:3})+unit:'Invalid entry — review';};
  const rows=[['Covered area',positive(s.systemAreaM2,' m²')],['Clear height',positive(s.systemHeightM,' m')]];
  if(s.systemTemplate==='carport')rows.push(['Parking bays',positive(s.systemBays,'',true)]);
  rows.push(['Weather protection',({__proto__:null,pending:'To be confirmed',open:'Open shade — not rainproof',rain:'Rain protection requested; design to be agreed'})[s.systemWeatherProtection]||'To be confirmed']);
  return rows;
 }
 function equipmentContext(s,f={}){
  if(!included(s)||!presentation(s).structural)return [];
  const amount=(n,unit)=>Number.isFinite(n)&&n>0?n.toLocaleString('en-IN',{maximumFractionDigits:3})+unit:'To be confirmed';
  const modules=[s.moduleMake,s.moduleModel].filter(Boolean).join(' · ');
  const inverter=[s.inverterMake,s.inverterModel].filter(Boolean).join(' · ');
  return [['Solar modules',[modules,Number.isInteger(f.moduleCount)&&f.moduleCount>0?f.moduleCount+' × '+amount(f.moduleWattage,' Wp'):'Quantity to be confirmed'].filter(Boolean).join(' — ')],['Solar inverter',[inverter,amount(f.inverterKw,' kW')].filter(Boolean).join(' — ')]];
 }
 // A preparer review aid, never an engineering certificate or a financial model.
 function review(input={},battery=null){
  const s=resolve(input),rows=[];
  const add=(label,target,pending=false,invalid=false)=>rows.push({label,target,pending,invalid});
  if(enabled(s)){
   if(inBase(s))add(s.systemBaseReviewed===true?'Base rate / BOM inclusion reviewed':'Confirm this upgrade is in the entered base rate / BOM','systemBaseReviewed',s.systemBaseReviewed!==true);
   else {const value=price(s),entered=String(s.systemPrice??'').trim();add(value!==null?'Upgrade price entered; outside solar totals':entered?'Correct the upgrade price':'Upgrade price pending — quote required','systemPrice',value===null,!!entered&&value===null);}
   const complete=['systemName','systemPurpose','systemEquipment','systemScope','systemExclusions','systemNotes'].every(id=>String(s[id]??'').trim());
   add(!complete?'Complete the custom scope and exclusions':s.systemScopeReviewed===true?'Scope and exclusions reviewed':'Review the proposed scope and exclusions',complete?'systemScopeReviewed':'systemPurpose',!complete||s.systemScopeReviewed!==true);
   if(presentation(s).structural){
    const ids=['systemAreaM2','systemHeightM',...(s.systemTemplate==='carport'?['systemBays']:[])];
    const bad=ids.find(id=>String(s[id]??'').trim()&&(decimal(s[id])===null||decimal(s[id])<=0||(id==='systemBays'&&!Number.isInteger(decimal(s[id])))));
    const missing=ids.find(id=>!String(s[id]??'').trim());
    add(bad?'Correct the entered site dimensions':missing?'Site dimensions pending — proposal-stage scope only':'Site requirements entered; final engineering still required',bad||missing||'systemAreaM2',!!bad||!!missing,!!bad);
   }
  }
  if(battery?.enabled){
   if(String(s.bessAdditions||'').trim())add(s.bessAdditionsReviewed===true?'Battery project additions reviewed':'Review custom battery additions for the selected model','bessAdditionsReviewed',s.bessAdditionsReviewed!==true);
   add(battery.cost===null?'Battery installed price pending':'Battery price entered; outside solar totals','bessCost',battery.cost===null);
   const incomplete=(battery.errors?.length||0)+(battery.missing?.length||0);
   add(incomplete?'Review battery specifications and sizing':'Battery specifications entered; verify OEM compatibility','bessModel',!!incomplete,!!battery.errors?.length);
   if((battery.mode||s.bessUseCase||'backup')==='backup')add(battery.backupHours!==null?'Backup inputs entered; commissioning still required':'Outage backup is not yet established','bessBackupReady',battery.backupHours===null);
   else if(battery.annualBenefit===null||(battery.economicErrors?.length||0)>0)add('Complete storage operating assumptions before claiming savings','bessUseCase',true);
  }
  if(W.enabled(s)){
   const water=W.compute(s),ready=water.annual!==null&&!water.errors.length&&String(s.systemWaterRainSource||'').trim();
   add(ready?'Rainwater collection scenario entered; verify site basis':'Complete rainwater area, rainfall reference and collection assumptions','systemWaterRainMm',!ready);
   add(s.systemWaterRoute==='storage'||s.systemWaterRoute==='recharge'?'Collection route proposed; site design required':'Agree the rainwater collection route','systemWaterRoute',!['storage','recharge'].includes(s.systemWaterRoute));
   const storm=water.peak!==null&&water.eventDelivered!==null&&(s.systemWaterRoute!=='storage'||water.tankCapture!==null);
   add(storm?'Storm / collection scenario entered; final hydraulic design required':'Complete storm, first-flush and collection checks','systemWaterIntensity',!storm);
   const checked=s.systemWaterPriceMode==='included'?s.systemWaterPriceReviewed===true:W.price(s)!==null;
   add(checked?'Harvesting commercial basis entered':'Confirm harvesting price / included scope',s.systemWaterPriceMode==='included'?'systemWaterPriceReviewed':'systemWaterPrice',!checked);
  }
  return rows;
 }
 const insights={
  weatherproof:['Rain management','A sealed roofing assembly, flashings and drainage work together; PV modules alone are not a sealed roof.'],
  carport:['Dual-use parking','Solar generation shares the parking footprint. Vehicle access, headroom and foundations remain site-specific.'],
  canopy:['Usable space below','An elevated array can retain access beneath the panels. Roof loading, wind actions and clearances determine the final design.'],
  pergola:['Architectural integration','Solar shading is coordinated with the outdoor layout. Lighting, rain protection and finishes are included only when specified.'],
  zero:['Control, not backup','Export limiting uses site metering and compatible inverter control. Dynamic response and curtailment must be reviewed.'],
  monitoring:['Visibility before decisions','Metering helps identify when energy is produced and consumed. A dashboard alone does not guarantee bill savings.'],
  ev:['A defined charging option','Charging power depends on vehicle limits and site capacity. Solar availability does not guarantee solar-only charging.'],
  pfc:['Measure before sizing','Power-factor correction starts with load and harmonic measurements; solar kWp alone does not size a capacitor bank.'],
  dg:['Coordinated operation','Generator minimum loading, reverse-power protection and the solar control sequence require project-specific commissioning.'],
  custom:['Your project scope','Project-specific equipment, work and exclusions are defined in the editable scope and custom additions.']
 };
 function syncPicker(s){
  const picker=document.getElementById('advancedSystemSelect');if(!picker)return;
  const battery=root.Bess.enabled(s),system=enabled(s),combined=document.getElementById('combinedSystemOption');
  if(combined){combined.hidden=!(battery&&system);combined.disabled=!(battery&&system);}
  picker.value=battery&&system?'combined':battery?'bess':system?(template(s)?s.systemTemplate:'custom'):'none';
  const panel=document.getElementById('selectedSystemCard');panel.hidden=!(battery||system);panel.replaceChildren();
  const batteryPanel=document.getElementById('selectedBatteryFields');if(batteryPanel)batteryPanel.hidden=!battery;
  const backup=document.getElementById('bessBackupInputs');if(backup)backup.hidden=s.bessSizing!=='backup';
  if(!battery&&!system)return;
  const f=root.Finance.compute(s),b=root.Bess.compute(s,f);
  const body=document.createElement('div'),eyebrow=document.createElement('small'),heading=document.createElement('strong'),metrics=document.createElement('div');
  eyebrow.textContent=battery?'BATTERY CONFIGURATION':'SYSTEM SUMMARY';heading.textContent=battery?(s.bessMake||'Battery configuration'):name(s);
  metrics.className='selected-system-metrics';
  const value=(v,unit)=>Number.isFinite(v)?v.toLocaleString('en-IN',{maximumFractionDigits:2})+unit:'Pending';
  const chips=battery?[[value(b.capacity,' kWh'),'Rated bank'],[value(b.usableAc,' kWh'),'Usable AC scenario'],[value(b.power,' kW'),'Design output limit']]:[[f.capacity+' kWp','Solar quotation'],[inBase(s)?'Included':price(s)!==null?root.Finance.fmtINR(price(s)):'To be quoted','Price basis']];
  chips.forEach(([v,label])=>{const el=document.createElement('span'),strong=document.createElement('b'),small=document.createElement('small');strong.textContent=v;small.textContent=label;el.append(strong,small);metrics.append(el);});
  body.append(eyebrow,heading);
  if(battery&&s.bessSpecMode==='auto'){const a=root.Bess.sizing(s,f),configuration=document.createElement('p');configuration.className='selected-system-configuration';configuration.textContent=a.units&&a.model?a.units+' × '+a.model.rated+' kWh battery modules · automatic':'Sizing inputs required';body.append(configuration);if(a.issue){const warning=document.createElement('p');warning.className='selected-system-warning';warning.textContent=a.issue;body.append(warning);}}
  body.append(metrics);
  if(battery){const note=document.createElement('p');note.className='selected-system-note';note.textContent=(root.StorageCatalog.get(s.bessModel)?'Catalogue-based':'Manual-specification')+' scenario · not compatibility approval.';body.append(note);}
  if(battery&&system){const note=document.createElement('p');note.textContent='Saved combined proposal: '+name(s)+' + battery. Both sets of existing values are retained.';body.append(note);}
  panel.append(body);
 }
 function hasEdits(s){
  if(Object.entries(W.DEFAULTS).some(([k,v])=>String(s[k]??v)!==String(v)))return true;
  if(inBase(s)||s.systemScopeReviewed===true||s.systemBaseReviewed===true)return true;
  if(['systemPrice','systemDelivery','systemWarranty','systemAreaM2','systemHeightM','systemBays'].some(id=>String(s[id]??'').trim()))return true;
  const expected={...Object.fromEntries(Object.entries(template(s)||{}).map(([k,v])=>['system'+k[0].toUpperCase()+k.slice(1),v])),...siteDefaults[s.systemTemplate]};
  if(['systemName','systemPurpose','systemEquipment','systemScope','systemNotes','systemExclusions','systemRoofing','systemDrainage','systemAcceptance','systemAdditions'].some(id=>String(s[id]??'').trim()&&String(s[id]).trim()!==String(expected[id]??'').trim()))return true;
  return !!s.systemWeatherProtection&&s.systemWeatherProtection!==(s.systemTemplate==='weatherproof'?'rain':'pending');
 }
 function readForm(templateOverride){
  const s=Object.fromEntries(Object.keys(DEFAULTS).map(k=>{const el=document.getElementById(k);return [k,typeof DEFAULTS[k]==='boolean'?(el?el.checked:DEFAULTS[k]):el?.value??DEFAULTS[k]];}));
  if(typeof templateOverride==='string')s.systemTemplate=templateOverride;
  return resolve(s);
 }

 function sync(s){
  const fields=document.getElementById('systemFields');if(!fields)return;
  fields.hidden=!enabled(s);
  W.sync(s);
  previousTemplate=s.systemTemplate||'custom';
  syncPicker(s);
  if(enabled(s)&&template(s))for(const id of [...Object.keys(template(s)).map(k=>'system'+k[0].toUpperCase()+k.slice(1)),...Object.keys(siteDefaults[s.systemTemplate]||{})]){const el=document.getElementById(id);if(el&&s[id]!=null&&(!el.value.trim()||(id==='systemName'&&s.systemTemplate==='weatherproof'&&el.value==='Weatherproof Solar Roof')))el.value=s[id];}
  document.querySelectorAll('[data-system-choice]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.systemChoice==='yes')===enabled(s))));
  document.getElementById('systemCustomName').hidden=s.systemTemplate!=='custom';
  document.getElementById('systemStatus').hidden=true;
  document.getElementById('systemStatus').textContent='';
  const structure=document.getElementById('systemStructureFields');if(structure)structure.hidden=!presentation(s).structural;
  const bays=document.getElementById('systemBaysField');if(bays)bays.hidden=s.systemTemplate!=='carport';
  const amount=document.getElementById('systemPriceField');if(amount)amount.hidden=inBase(s);
  const customReview=document.getElementById('bessCustomReviewField');if(customReview)customReview.hidden=!String(s.bessAdditions||'').trim();
  const baseReview=document.getElementById('systemBaseReviewField');if(baseReview)baseReview.hidden=!inBase(s);
  const hint=document.getElementById('systemPricingHint');if(hint)hint.textContent=inBase(s)?'Included in entered solar rate / BOM. No second charge.':'Separate from solar totals.';
  const reviewPanel=document.getElementById('systemReview');
  if(reviewPanel){
   const rows=review(s,root.Bess?.compute(s,root.Finance.compute(s))),pending=rows.filter(r=>r.pending).length;
   reviewPanel.hidden=!rows.length;
   document.getElementById('systemReviewSummary').textContent='Before sharing · '+(pending?pending+' '+(pending===1?'item':'items')+' to review':'commercial checks reviewed');
   reviewPanel.dataset.state=pending?'pending':'reviewed';
   const list=document.getElementById('systemReviewItems');list.replaceChildren();
   rows.forEach(r=>{const item=document.createElement('li'),button=document.createElement('button');item.dataset.state=r.invalid?'invalid':r.pending?'pending':'reviewed';button.type='button';button.dataset.systemReviewTarget=r.target;button.textContent=r.label;item.append(button);list.append(item);});
  }
  document.querySelectorAll('[data-export-format^="system"]').forEach(b=>b.disabled=!enabled(s));
 }
 function wire(){
  document.querySelectorAll('[data-system-choice]').forEach(b=>b.addEventListener('click',()=>{
   const el=document.getElementById('systemEnabled');el.checked=b.dataset.systemChoice==='yes';
   if(el.checked&&document.getElementById('systemTemplate').value==='custom'&&document.getElementById('systemPriceMode').value!=='included'&&!['systemName','systemPurpose','systemEquipment','systemScope','systemNotes','systemExclusions','systemPrice','systemAreaM2','systemHeightM','systemBays','systemRoofing','systemDrainage','systemAcceptance','systemDelivery','systemWarranty'].some(id=>document.getElementById(id).value.trim())){
    document.getElementById('systemTemplate').value='weatherproof';fillPreset('weatherproof');
    document.getElementById('systemWeatherProtection').value='rain';document.getElementById('systemScopeReviewed').checked=false;document.getElementById('systemBaseReviewed').checked=false;previousTemplate='weatherproof';
   }
   el.dispatchEvent(new Event('input',{bubbles:true}));
  }));
  const form=document.getElementById('quoteForm');
  const scopeIds=['capacity','roofType','moduleMake','moduleModel','moduleWattage','inverterMake','inverterModel','inverterKw','systemName','systemPurpose','systemEquipment','systemScope','systemNotes','systemExclusions','systemRoofing','systemDrainage','systemAcceptance','systemAdditions','systemAreaM2','systemHeightM','systemBays'];
  const rateIds=['costPerWp','costPerKwp','gstPercent','bomModules','bomInverter','bomStructure','bomBos','bomInstall','bomLiaison','systemPriceMode'];
  const invalidate=e=>{if(scopeIds.includes(e.target.id)||rateIds.includes(e.target.id)||e.target.id==='systemPrice')document.getElementById('systemWaterPriceReviewed').checked=false;if(e.target.id.startsWith('systemWater')&&!['systemWaterPriceReviewed','systemWaterPrice'].includes(e.target.id)){document.getElementById('systemScopeReviewed').checked=false;document.getElementById('systemBaseReviewed').checked=false;document.getElementById('systemWaterPriceReviewed').checked=false;}if(['capacity','inverterKw'].includes(e.target.id)||(e.target.id.startsWith('bess')&&!['bessAdditionsReviewed','bessInclude','bessReason','bessCost'].includes(e.target.id)))document.getElementById('bessAdditionsReviewed').checked=false;if(scopeIds.includes(e.target.id))document.getElementById('systemScopeReviewed').checked=false;if(rateIds.includes(e.target.id)||scopeIds.includes(e.target.id))document.getElementById('systemBaseReviewed').checked=false;};
  form.addEventListener('input',invalidate,true);form.addEventListener('change',invalidate,true);
  const select=document.getElementById('systemTemplate');
  previousTemplate=select.value;
  // A select emits input before change; do not render the new preset until
  // confirmation has preserved or replaced the previous scope.
  select.addEventListener('input',e=>e.stopPropagation());
  select.addEventListener('focus',()=>previousTemplate=select.value);
  select.addEventListener('change',()=>{
   if(select.value===previousTemplate)return;
   const old=hasEdits(readForm(previousTemplate));
   if(old&&select.value!==previousTemplate&&!root.confirm('Change system template? Price, dimensions, delivery and warranty will reset. Presets replace the editable scope; Custom keeps the editable scope as a starting point. Custom additions will reset. Uploaded proposal photos are kept.')){select.value=previousTemplate;return;}
   for(const id of ['systemPrice','systemWarranty','systemDelivery','systemAreaM2','systemHeightM','systemBays','systemRoofing','systemDrainage','systemAcceptance','systemAdditions'])document.getElementById(id).value='';
   for(const [id,value]of Object.entries(W.DEFAULTS)){const el=document.getElementById(id);if(el.type==='checkbox')el.checked=value;else el.value=value;}
   document.getElementById('systemPriceMode').value='separate';
   document.getElementById('systemWeatherProtection').value=select.value==='weatherproof'?'rain':'pending';
   document.getElementById('systemScopeReviewed').checked=false;
   document.getElementById('systemBaseReviewed').checked=false;
   const t=template({systemTemplate:select.value});
   if(t)fillPreset(select.value);
   else document.getElementById('systemName').value='';
   previousTemplate=select.value;
  });
 }
 const api={DEFAULTS,templates,presentations,siteDefaults,resolve,enabled,included,reason,template,presentation,name,priceMode,inBase,decimal,price,priceText,priceNote,specifications,equipmentContext,review,insights,syncPicker,hasEdits,readForm,sync,wire};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.AdditionalSystems=api;
})(typeof self!=='undefined'?self:this);
