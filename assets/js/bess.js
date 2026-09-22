/* Optional battery supplement. Separate from the approved solar-only Finance engine.
   No missing rating, tariff, efficiency or cost is replaced by an invented value. */
'use strict';
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.Bess=api;})(typeof self!=='undefined'?self:this,function(root){
 const Catalog=root.StorageCatalog||(typeof require==='function'?require('./storage-catalog.js'):null);
 const DEFAULTS={bessInclude:true,bessReason:'alternative',bessModel:'',bessSpecMode:'manual',bessSizing:'solar',bessTargetHours:'',bessShiftShare:'30',bessUnitsOverride:'',bessUnits:'',bessPcsKw:'',bessPowerDerate:'15',bessAutoEconomics:false,bessEnabled:false,bessMake:'',bessChemistry:'Unspecified',bessCoupling:'pending',bessInverter:'',bessCapacity:'',bessDod:'',bessDischargeEff:'',bessPower:'',bessLoad:'',bessBackupReady:'pending',bessCost:'',bessUseCase:'backup',bessReserve:'',bessRte:'',bessCycles:'',bessDays:'',bessSourceEnergy:'',bessDemand:'',bessChargePower:'',bessChargeHours:'',bessDischargeHours:'',bessImportRate:'',bessSourceRate:'',bessOm:'',bessLife:'',bessWarranty:''};
 const enabled=s=>s?.bessEnabled===true||s?.bessEnabled==='yes';
 const numeric=(s,k)=>{const v=s[k];if(!['number','string'].includes(typeof v)||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(String(v).trim()))return null;return Number.isFinite(Number(v))?Number(v):null;};
 const supplied=v=>v!==null&&v!==undefined&&!(typeof v==='string'&&v.trim()==='');
 const included=s=>enabled(s)&&(s.bessInclude===undefined||s.bessInclude===true);
 const reason=s=>({requested:'Customer requested',recommended:'Recommended upgrade',alternative:'Optional alternative'}[s.bessReason]||'Optional alternative');
 function sizing(s,solar={}){
  const model=Catalog.get(s.bessModel),eff=numeric(s,'bessDischargeEff'),load=numeric(s,'bessLoad'),hours=numeric(s,'bessTargetHours'),share=numeric(s,'bessShiftShare'),derate=numeric(s,'bessPowerDerate');
  const daily=Number.isFinite(solar.annualGen)?Math.max(0,solar.annualGen)/365:null;
  const target=s.bessSizing==='backup'?(load>0&&hours>0&&hours<=168?load*hours:null):(daily!==null&&share>0&&share<=100?daily*share/100:null);
  const good=!!model&&eff>0&&eff<=100&&derate!==null&&derate>=0&&derate<100;
  const perUnit=good?model.usable*eff/100:null,unitPower=good?model.voltage*model.current/1000*(1-derate/100)*eff/100:null;
  const recommended=good&&target>0?Math.max(1,Math.ceil(target/perUnit-1e-10),s.bessSizing==='backup'&&load>0?Math.ceil(load/unitPower-1e-10):1):null;
  const override=numeric(s,'bessUnitsOverride'),units=supplied(s.bessUnitsOverride)?(Number.isInteger(override)&&override>=1&&override<=model?.maxUnits?override:null):(recommended!==null&&recommended<=model.maxUnits?recommended:null);
  const pcs=numeric(s,'bessPcsKw'),pcsLimit=supplied(s.bessPcsKw)?pcs:(Number.isFinite(solar.inverterKw)?solar.inverterKw:null);
  const power=units&&pcsLimit>0?Math.min(units*unitPower,pcsLimit):null;
  const issue=!model?'Select a battery model or enter Custom specifications.':!good?'Enter valid conversion efficiency and power derating assumptions.':pcsLimit===null||pcsLimit<=0?'Enter a positive converter limit or a valid solar inverter size.':target===null||target<=0?'Enter the essential load and backup hours, or choose a solar-linked sizing scenario.':recommended>model.maxUnits&&!supplied(s.bessUnitsOverride)?'Required module count exceeds this catalogue configuration. An engineered larger system is required.':units===null?'Enter a whole module quantity within the catalogue limit.':s.bessSizing==='backup'&&load>power?'The proposed converter output is below the selected backup load.':units*perUnit+1e-8<target?'Selected quantity is below the energy target.':'';
  return {model,daily,target,perUnit,unitPower,recommended,units,pcsLimit,power,issue};
 }
 function resolve(input,solar={}){
  const s={...input};if(!enabled(s))return s;
  const a=sizing(s,solar);
  if(s.bessSpecMode==='auto'&&a.model){
   const priorCapacity=numeric(s,'bessCapacity'),priorPower=numeric(s,'bessPower');
   const changed=(priorCapacity!==null&&(a.units===null||Math.abs(priorCapacity-a.model.rated*a.units)>1e-5))||(priorPower!==null&&(a.power===null||Math.abs(priorPower-a.power)>1e-5));
   if(changed){s.bessBackupReady='pending';s.bessCost='';}
   s.bessMake=a.model.name;s.bessChemistry=a.model.chemistry;s.bessUnits=a.units===null?'':String(a.units);
   s.bessCapacity=a.units===null?'':String(Number((a.model.rated*a.units).toFixed(6)));
   s.bessDod=String(a.model.usable/a.model.rated*100);
   s.bessPower=a.power===null?'':String(Number(a.power.toFixed(6)));
  }
  if(s.bessAutoEconomics===true&&a.target!==null){
   s.bessSourceEnergy=String(Number((a.daily*(numeric(s,'bessShiftShare')||0)/100).toFixed(4)));
   s.bessDemand=String(Number(a.target.toFixed(4)));
   s.bessImportRate=String(solar.tariff??input.tariff??'');
  }
  return s;
 }
 function applyDerived(s){
  for(const k of ['bessCost','bessBackupReady','bessMake','bessChemistry','bessUnits','bessCapacity','bessDod','bessPower','bessSourceEnergy','bessDemand','bessImportRate']){const el=document.getElementById(k);if(el&&s[k]!=null)el.value=s[k];}
 }
 function compute(s={},solar={}){
  s=resolve(s,solar);
  const errors=[],missing=[];
  if(!enabled(s))return {enabled:false,mode:'backup',errors,missing,economicsMissing:[],economicErrors:[],capacity:null,usableDc:null,usableAc:null,power:null,load:null,overloaded:false,designReady:false,backupHours:null,potentialHours:null,cost:null,combined:null,dailyDelivered:null,annualDelivered:null,annualValue:null,annualChargingCost:null,annualBenefit:null,payback:null,life:null,reserveHours:null};
  const get=(k,label,min,max,strict=false)=>{const n=numeric(s,k);if(n===null){missing.push(label);return null;}if((strict?n<=min:n<min)||(max!=null&&n>max)){errors.push(label+' is outside the valid range.');return null;}return n;};
  const capacity=get('bessCapacity','Rated battery capacity',0,1000000,true),dod=get('bessDod','Usable depth of discharge',0,100,true),eff=get('bessDischargeEff','Discharge efficiency',0,100,true),power=get('bessPower','Continuous AC output',0,1000000,true);
  const usableDc=capacity!==null&&dod!==null?capacity*dod/100:null;
  const usableAc=usableDc!==null&&eff!==null?usableDc*eff/100:null;
  const load=numeric(s,'bessLoad');
  if(load!==null&&load<=0)errors.push('Selected backup load must be greater than zero.');
  const overloaded=load!==null&&power!==null&&load>power;
  if(overloaded)errors.push('Selected load exceeds the battery system’s continuous AC output.');
  const potentialHours=usableAc!==null&&power!==null&&load>0&&!overloaded?usableAc/load:null;
  const designReady=s.bessBackupReady==='yes'&&['ac','dc'].includes(s.bessCoupling)&&!!String(s.bessInverter||'').trim();
  const backupHours=designReady?potentialHours:null;
  const rawCost=numeric(s,'bessCost'),cost=rawCost!==null&&rawCost>=0?rawCost:null;
  if(rawCost!==null&&rawCost<0)errors.push('Installed storage cost cannot be negative.');
  const combined=cost!==null&&Number.isFinite(solar.netInvestment)?solar.netInvestment+cost:null;
  let annualBenefit=null,dailyDelivered=null,annualDelivered=null,annualValue=null,annualChargingCost=null,payback=null,reserveHours=null;
  const mode=['self','tou'].includes(s.bessUseCase)?s.bessUseCase:'backup';
  const economicsMissing=[],economicErrors=[];
  if(mode!=='backup'){
   const initialMissing=missing.length,initialErrors=errors.length;
   const reserve=get('bessReserve','Backup reserve',0,100),rte=get('bessRte','Round-trip efficiency',0,100,true),cycles=get('bessCycles','Cycles per operating day',0,4),days=get('bessDays','Operating days per year',1,366),source=get('bessSourceEnergy','Available charging energy',0,null),demand=get('bessDemand','Battery-served demand',0,null),chargePower=get('bessChargePower','Charging input power',0,null,true),chargeHours=get('bessChargeHours','Daily charging window',0,24,true),dischargeHours=get('bessDischargeHours','Daily discharge window',0,24,true),importRate=get('bessImportRate','Avoided import tariff',0,null),sourceRate=get('bessSourceRate','Charging / export value',0,null),om=get('bessOm','Annual storage maintenance',0,null),life=get('bessLife','Assumed service life',1,30);
   reserveHours=reserve!==null&&potentialHours!==null&&designReady?potentialHours*reserve/100:null;
   if(rte!==null&&eff!==null&&rte>eff)errors.push('Round-trip efficiency cannot exceed the entered discharge efficiency.');
   if(chargeHours!==null&&dischargeHours!==null&&chargeHours+dischargeHours>24)errors.push('Charging and discharge windows must total no more than 24 hours per day.');
   economicsMissing.push(...missing.slice(initialMissing));economicErrors.push(...errors.slice(initialErrors));
   const vals=[usableAc,power,reserve,rte,cycles,days,source,demand,chargePower,chargeHours,dischargeHours,importRate,sourceRate,om,life];
   if(vals.every(n=>n!==null)&&errors.length===0){
    // Daily AC delivery is bounded by storage, charging source, demand and both power windows.
    const sourceLimit=mode==='self'?(Number.isFinite(solar.annualGen)?Math.max(0,solar.annualGen)/days:0):Infinity;
    dailyDelivered=Math.min(usableAc*(1-reserve/100)*cycles,source*rte/100,sourceLimit*rte/100,demand,power*dischargeHours,chargePower*chargeHours*rte/100);
    annualDelivered=dailyDelivered*days;annualValue=annualDelivered*importRate;annualChargingCost=annualDelivered/(rte/100)*sourceRate;
    annualBenefit=annualValue-annualChargingCost-om;
    payback=cost!==null&&annualBenefit>0?cost/annualBenefit:null;
   }
  }
  const life=numeric(s,'bessLife');
  const result={enabled:enabled(s),capacity,usableDc,usableAc,power,load,overloaded,designReady,backupHours,potentialHours,cost,combined,mode,dailyDelivered,annualDelivered,annualValue,annualChargingCost,annualBenefit,payback,life,reserveHours,errors,missing,economicsMissing,economicErrors};
  // Reject arithmetic overflow rather than letting a non-finite result reach a chart or PDF.
  if(Object.values(result).some(v=>typeof v==='number'&&!Number.isFinite(v))){for(const k of ['usableDc','usableAc','backupHours','potentialHours','combined','dailyDelivered','annualDelivered','annualValue','annualChargingCost','annualBenefit','payback','reserveHours'])result[k]=null;errors.push('The entered values are too large to calculate safely.');}
  return result;
 }
 function overview(s,f){root.SupplementDesign.bessOverview(s,f);}
 function assessment(s,f){root.SupplementDesign.bessAssessment(s,f);}
 function readForm(){return Object.fromEntries(Object.keys(DEFAULTS).map(k=>{const el=document.getElementById(k);return [k,['bessEnabled','bessInclude','bessAutoEconomics'].includes(k)?(el?!!el.checked:DEFAULTS[k]):el?.value??DEFAULTS[k]];}));}
 function syncControls(s){
  const panel=document.getElementById('bessFields');if(!panel)return;
  panel.hidden=!enabled(s);document.querySelectorAll('[data-bess-choice]').forEach(el=>el.setAttribute('aria-pressed',String((el.dataset.bessChoice==='yes')===enabled(s))));
  document.getElementById('bessEconomics').hidden=!['self','tou'].includes(s.bessUseCase);
  const auto=s.bessSpecMode==='auto'&&!!Catalog.get(s.bessModel);
  document.querySelector('label[for="bessPower"]').textContent=auto?'Calculated design AC output (kW)':'Continuous AC output (kW)';
  for(const id of ['bessCapacity','bessDod','bessPower'])document.getElementById(id).readOnly=auto;
  document.getElementById('bessCustomIdentity').hidden=!!Catalog.get(s.bessModel);
  document.getElementById('bessAutoSetup').hidden=!Catalog.get(s.bessModel);
  document.getElementById('bessSolarSizing').hidden=s.bessSizing==='backup';
  const a=sizing(s,root.Finance.compute(s)),b=compute(s,root.Finance.compute(s));
  document.getElementById('bessInputStatus').textContent=!enabled(s)?'Not included. Your solar-only proposal is unchanged.':(included(s)?'Two pages in the proposal + separate report.':'Standalone report only; excluded from the main proposal.');
  document.getElementById('bessSizingStatus').textContent=a.model?(a.issue||'Suggested '+a.recommended+' modules · selected '+a.units+' · '+Number(s.bessCapacity||0).toLocaleString('en-IN',{maximumFractionDigits:3})+' kWh. '+(auto?'Linked to quotation.':'Manual specifications override catalogue values.')):'Choose a model for automatic sizing, or use Custom.';
  document.getElementById('bessValidation').textContent=b.errors.join(' ');
  document.querySelector('label[for="bessSourceRate"]').textContent=b.mode==='self'?'Foregone export credit (₹/kWh)':'Off-peak charging tariff (₹/kWh)';
  const source=document.getElementById('bessCatalogueSource');source.textContent=a.model?a.model.edition+' · '+a.model.note:'';
  document.querySelectorAll('[data-export-format="bess"]').forEach(el=>el.disabled=!enabled(s));
 }
 function wire(){
  const select=document.getElementById('bessModel');
  Catalog.models.forEach(m=>select.add(new Option(m.name+' · '+m.rated+' kWh',m.id),select.querySelector('option[value="custom"]')));
  select.addEventListener('change',()=>{
   const m=Catalog.get(select.value);document.getElementById('bessSpecMode').value=m?'auto':'manual';
   document.getElementById('bessBackupReady').value='pending';
   document.getElementById('bessCost').value='';
   document.getElementById('bessWarranty').value='';
   if(m){
    const defaults={bessDischargeEff:'96',bessPowerDerate:'15',bessUnitsOverride:'',bessBackupReady:'pending',bessCost:'',bessWarranty:''};
    Object.entries(defaults).forEach(([k,v])=>document.getElementById(k).value=v);
   }
  });
  document.querySelectorAll('[data-bess-choice]').forEach(el=>el.addEventListener('click',()=>{const input=document.getElementById('bessEnabled');input.checked=el.dataset.bessChoice==='yes';input.dispatchEvent(new Event('input',{bubbles:true}));}));
  for(const id of ['bessInverter','bessCoupling'])document.getElementById(id).addEventListener('input',()=>{document.getElementById('bessBackupReady').value='pending';});
  document.getElementById('bessUseQuote').addEventListener('click',()=>{
   for(const [k,v] of Object.entries({bessAutoEconomics:true,bessRte:'88',bessReserve:'20',bessCycles:'1',bessDays:'365',bessChargeHours:'4',bessDischargeHours:'4',bessLife:'10'})){const e=document.getElementById(k);if(e.type==='checkbox')e.checked=v;else e.value=v;}
   const s=root.Render.lastState,b=compute(s,root.Finance.compute(s));document.getElementById('bessChargePower').value=b.power??'';
   document.getElementById('bessAutoEconomics').dispatchEvent(new Event('input',{bubbles:true}));
  });
 }
 return {DEFAULTS,enabled,included,reason,compute,resolve,sizing,applyDerived,readForm,syncControls,wire,overview,assessment};
});
