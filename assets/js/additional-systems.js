/* Optional project systems: editable scope, explicit commercial basis, no Finance mutations. */
'use strict';
(function(root){
 const DEFAULTS={systemEnabled:false,systemInclude:true,systemTemplate:'custom',systemReason:'requested',systemName:'',systemPurpose:'',systemEquipment:'',systemScope:'',systemNotes:'',systemExclusions:'',systemPrice:'',systemDelivery:'',systemWarranty:'',systemPriceMode:'separate',systemAreaM2:'',systemHeightM:'',systemBays:'',systemWeatherProtection:'pending',systemRoofing:'',systemDrainage:'',systemAcceptance:''};
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
    "name": "Weatherproof Solar Roof",
    "purpose": "Create a rain-protected usable rooftop space beneath the solar installation, subject to an engineered roofing and drainage design.",
    "equipment": "Solar support frame and selected roofing / weatherproofing assembly\nEngineered joints, wall flashings, gutters and downpipes\nCompatible fixings and existing-roof interfaces",
    "scope": "Survey the roof, usable area and requested clear height\nAgree the roofing system, drainage route and junction details\nEngineer supports and connections for site conditions\nTest agreed water-ingress criteria and record handover",
    "notes": "Design intent is rain protection, not a blanket leak-free guarantee. Standard PV modules and sealed anchor holes alone do not form a weatherproof roof. Joint movement, wind-driven rain, drainage and existing roof condition require review. Scope-specific warranty must be agreed in writing.",
    "exclusions": "Existing roof repairs and concealed defects unless priced\nUnspecified civil works, drainage extensions or approvals\nLifetime leak-free performance or invented warranty periods"
  },
  "carport": {
    "name": "Solar Carport",
    "purpose": "Provide a defined solar-covered parking area with usable vehicle access and a site-engineered support structure.",
    "equipment": "Selected PV modules and engineered carport structure\nDesigned foundations, baseplates and site connections\nRoofing, drainage and lighting only where specified",
    "scope": "Confirm parking bays, vehicle clearances and movement\nSurvey services, foundation conditions and site constraints\nEngineer the frame, foundations and electrical interfaces\nAgree acceptance checks and hand over the installed scope",
    "notes": "Parking bays, covered area and clear height are preparer-entered requirements, not automatic structural sizing. Rain protection requires an explicit roofing specification. EV charging, battery backup and associated savings are not included merely by selecting a carport.",
    "exclusions": "EV charger, battery storage or vehicle supply\nUnspecified excavation, paving, utilities or foundations\nWeatherproof roofing and drainage unless explicitly agreed"
  },
  "canopy": {
    "name": "Elevated Solar Canopy",
    "purpose": "Provide usable clear space beneath an elevated solar array on a suitable terrace or site.",
    "equipment": "Selected solar modules and elevated engineered frame\nDesigned roof connections or foundations and corrosion protection\nCable routing, access and fall protection as specified",
    "scope": "Agree clear height, covered footprint and access needs\nAssess the supporting roof and existing waterproofing\nEngineer frame, wind actions, connections and anchoring\nInspect workmanship and record agreed handover checks",
    "notes": "An elevated array is not automatically a weatherproof roof. Module gaps can admit rain. Post count, spans and foundation sizes cannot be inferred from the illustration or solar kWp. Structural adequacy and site access require competent engineering review.",
    "exclusions": "Weatherproof roof, guttering or enclosed room unless priced\nExisting structural strengthening or roof repairs\nUnspecified civil works, approvals or access alterations"
  },
  "pergola": {
    "name": "Solar Pergola",
    "purpose": "Integrate solar generation with an architectural outdoor seating or dining space, with comfort and weather protection agreed for the site.",
    "equipment": "Selected PV modules and architectural support frame\nAgreed finishes and compatible mounting details\nLighting, roofing and drainage only where specified",
    "scope": "Agree footprint, clear height, aesthetics and intended use\nReview shading, access and requested weather protection\nEngineer the support frame, roof interfaces and electrical work\nInspect finishes and test the explicitly included systems",
    "notes": "A solar pergola provides the agreed outdoor structure, not an automatically enclosed or weatherproof room. Decorative furniture, lighting, rain protection and finish samples require explicit scope approval. Rendered appearance does not establish structural dimensions or warranty.",
    "exclusions": "Furniture, landscaping and decorative lighting unless priced\nWeatherproofing, gutters or building alterations unless agreed\nUnverified finish, comfort or leak-free guarantees"
  }
};
 const presentations={
  "weatherproof": {
    "image": "system-weatherproof-roof.jpg",
    "short": "Weatherproof solar roof",
    "flow": [
      "ROOF & RAIN SURVEY",
      "ENGINEERED ROOFING",
      "WATER-INGRESS TEST"
    ],
    "structural": true
  },
  "carport": {
    "image": "system-carport.jpg",
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
    "image": "energy-controls.jpg",
    "short": "Zero export control",
    "flow": [
      "SITE METERING",
      "EXPORT CONTROL",
      "INVERTER LIMIT"
    ]
  },
  "monitoring": {
    "image": "energy-controls.jpg",
    "short": "Energy monitoring",
    "flow": [
      "ENERGY METERS",
      "DATA GATEWAY",
      "PROJECT DASHBOARD"
    ]
  },
  "ev": {
    "image": "summary-carport-ev.jpg",
    "short": "EV charging integration",
    "flow": [
      "SITE CAPACITY",
      "LOAD MANAGEMENT",
      "EV CHARGER"
    ]
  },
  "pfc": {
    "image": "energy-controls.jpg",
    "short": "Power-factor correction",
    "flow": [
      "SITE MEASUREMENTS",
      "ENGINEERED COMPENSATION",
      "VERIFIED POWER FACTOR"
    ]
  },
  "dg": {
    "image": "energy-controls.jpg",
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

 const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
 const enabled=s=>s?.systemEnabled===true;
 const included=s=>enabled(s)&&(s.systemInclude===undefined||s.systemInclude===true);
 const reason=s=>({requested:'Customer requested',recommended:'Recommended upgrade',alternative:'Optional alternative'}[s?.systemReason]||'Optional alternative');
 const template=s=>own(templates,s?.systemTemplate)?templates[s.systemTemplate]:null;
 const presentation=s=>own(presentations,s?.systemTemplate)?presentations[s.systemTemplate]:presentations.custom;
 const name=s=>String(s?.systemName||template(s)?.name||'Additional system').trim()||'Additional system';
 const priceMode=s=>s?.systemPriceMode==='included'?'included':'separate';
 const inBase=s=>priceMode(s)==='included';
 function decimal(v){return ['string','number'].includes(typeof v)&&/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(String(v).trim())&&Number.isFinite(Number(v))?Number(v):null;}
 function price(s){if(inBase(s))return null;const v=decimal(s?.systemPrice);return v!==null&&v>=0?v:null;}
 function priceText(s){return inBase(s)?'Included in solar quoted price':price(s)===null?'Price to be confirmed':(root.Finance?.fmtINR||((n)=>'₹'+Math.round(n).toLocaleString('en-IN')))(price(s));}
 function priceNote(s){return inBase(s)?'Preparer has included this scope in the base solar rate / BOM. No second charge is added. Confirm scope and applicable tax treatment.':'Separate tax-inclusive quotation; excluded from solar totals and payment milestones. Agree upgrade payments separately. Do not duplicate standard EPC scope.';}
 function specifications(s){
  if(!presentation(s).structural)return [];
  const positive=(v,unit,integer=false)=>{if(v===''||v==null)return 'To be confirmed';const n=decimal(v);return n!==null&&n>0&&(!integer||Number.isInteger(n))?n.toLocaleString('en-IN',{maximumFractionDigits:3})+unit:'Invalid entry — review';};
  const rows=[['Covered area',positive(s.systemAreaM2,' m²')],['Clear height',positive(s.systemHeightM,' m')]];
  if(s.systemTemplate==='carport')rows.push(['Parking bays',positive(s.systemBays,'',true)]);
  rows.push(['Weather protection',({__proto__:null,pending:'To be confirmed',open:'Open shade — not rainproof',rain:'Rain protection requested; design to be agreed'})[s.systemWeatherProtection]||'To be confirmed']);
  return rows;
 }
 function readForm(){return Object.fromEntries(Object.keys(DEFAULTS).map(k=>{const el=document.getElementById(k);return [k,typeof DEFAULTS[k]==='boolean'?(el?el.checked:DEFAULTS[k]):el?.value??DEFAULTS[k]];}));}
 function sync(s){
  const fields=document.getElementById('systemFields');if(!fields)return;
  fields.hidden=!enabled(s);
  document.querySelectorAll('[data-system-choice]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.systemChoice==='yes')===enabled(s))));
  document.getElementById('systemCustomName').hidden=s.systemTemplate!=='custom';
  document.getElementById('systemStatus').textContent=!enabled(s)?'Optional project systems. No extra pages added.':included(s)?'Selected system is reflected through the quotation + two scope pages. Separate 1- and 2-page downloads remain available.':'Standalone documents only; the main solar quotation is unchanged.';
  const structure=document.getElementById('systemStructureFields');if(structure)structure.hidden=!presentation(s).structural;
  const bays=document.getElementById('systemBaysField');if(bays)bays.hidden=s.systemTemplate!=='carport';
  const amount=document.getElementById('systemPriceField');if(amount)amount.hidden=inBase(s);
  const hint=document.getElementById('systemPricingHint');if(hint)hint.textContent=priceNote(s)+(inBase(s)?' This selection does not change the solar rate automatically.':'');
  document.querySelectorAll('[data-export-format^="system"]').forEach(b=>b.disabled=!enabled(s));
 }
 function wire(){
  document.querySelectorAll('[data-system-choice]').forEach(b=>b.addEventListener('click',()=>{const el=document.getElementById('systemEnabled');el.checked=b.dataset.systemChoice==='yes';el.dispatchEvent(new Event('input',{bubbles:true}));}));
  const select=document.getElementById('systemTemplate');
  let previous=select.value;
  select.addEventListener('focus',()=>previous=select.value);
  select.addEventListener('change',()=>{
   if(select.value===previous)return;
   const old=['systemName','systemPurpose','systemEquipment','systemScope','systemNotes','systemExclusions','systemPrice','systemDelivery','systemWarranty','systemAreaM2','systemHeightM','systemBays','systemRoofing','systemDrainage','systemAcceptance'].some(id=>document.getElementById(id).value.trim());
   if(old&&select.value!==previous&&!root.confirm('Change system template? Price, dimensions, delivery and warranty will reset. Presets replace the editable scope; Custom keeps it as a starting point. Uploaded proposal photos are kept.')){select.value=previous;return;}
   for(const id of ['systemPrice','systemWarranty','systemDelivery','systemAreaM2','systemHeightM','systemBays','systemRoofing','systemDrainage','systemAcceptance'])document.getElementById(id).value='';
   document.getElementById('systemPriceMode').value='separate';
   document.getElementById('systemWeatherProtection').value=select.value==='weatherproof'?'rain':'pending';
   const t=template({systemTemplate:select.value});
   if(t)for(const [key,value]of Object.entries(t))document.getElementById('system'+key[0].toUpperCase()+key.slice(1)).value=value;
   else document.getElementById('systemName').value='';
   previous=select.value;
  });
 }
 const api={DEFAULTS,templates,presentations,enabled,included,reason,template,presentation,name,priceMode,inBase,decimal,price,priceText,priceNote,specifications,readForm,sync,wire};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.AdditionalSystems=api;
})(typeof self!=='undefined'?self:this);
