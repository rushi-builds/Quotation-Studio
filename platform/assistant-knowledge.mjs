import studio from './studio-knowledge.mjs';
import Finance from '../assets/js/finance.js';
import Engineering from '../assets/js/engineering.js';
import Bess from '../assets/js/bess.js';
export const appGuide = {
  pages: {Overview:'Workspace overview, real KPIs, recent quotations and priorities',Quotations:'Search, create, open/edit, duplicate, delete and staff-mark quotation status',Followups:'Create, complete, reopen or cancel tasks and reminders',Activity:'Customer activity and notifications; opening a shared link is not proof of delivery',Sharing:'Prepare WhatsApp/email sharing for manual review and final send; published versions and links',Gallery:'Upload, filter and view project photos',Analytics:'Saved workspace reports, not booked revenue',Settings:'Profile, password/security and owner team controls'},
  studio:'Quotation editor: customer/branding, quick presets, system sizing, modules/inverter, structure, electrical/roof/wind checks, solar finance, subsidy assumptions, financing, battery and additional systems, BOM, options comparison, project references, proposal pages, preview and PDF export. Save to cloud persists changes; export does not save. Shared links and PDF are not the same as cloud Save.',
  navigation:'Top search can find pages, actions, quotations/customers, tasks, AI, logout, forgot/change password, appearance and gallery. Workspace returns to Overview; sidebar switches pages. Theme: Light, Dark, System (custom glass theme).',
  permissions:'Viewers cannot write. Owner manages team. AI answers do not execute writes or send messages. Explicit Studio save/open/share commands use guarded application controls.',
  contactPolicy:'Answer pricing, calculations and app questions directly from supplied sources. Do not replace an available answer with contact sales. Give the supplied company contact only if asked for contact/site visit/final commercial confirmation or a service needs human approval. Never invent contacts.',
  limits:'No live market tariff, subsidy approval, site survey, OEM certification, payment confirmation or unseen records. Explain missing inputs specifically. General solar explanations are allowed but distinguish them from project-specific facts.'
};
export const knowledge = { ...studio, guide: appGuide, pricingPolicy:'Repository presets/defaults are editable indicative assumptions, not live market offers or a binding quotation. For generic exact preset sizes use the matching preset. Otherwise calculate using the general default and label it; never interpolate a new rate. For a named quotation use its saved inputs. For current Studio use supplied unsaved inputs and label them. State basis, rate, GST and exclusions. Do not silently mix sources.' };
export function safeForm(form){
 if(!form || typeof form!=='object' || Array.isArray(form))return {};
 const out={};
 for(const k of Object.keys(studio.defaults)){
  // Only calculation/equipment fields from private records; never contact/branding/URLs/free text.
  if(/^(company|stat)|^(systemNotes|systemScope|systemExclusions|systemEquipment|systemPurpose)$/.test(k))continue;
  const v=form[k];
  if(typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=160)out[k]=v;
 }
 if(form.costPerKwp!=null && Number.isFinite(Number(form.costPerKwp)))out.costPerKwp=Number(form.costPerKwp);
 return out;
}
function resolveStudio(args,context){
 const requestedCapacity=args.capacityKwp==null?null:Number(args.capacityKwp);
 const capacity=requestedCapacity==null?Number(studio.defaults.capacity):requestedCapacity;
 let form,basis;
 if(args.basis==='quotation'){
  const q=[context.selectedQuotation,...(context.recentQuotations||[])].find(q=>q && q.id===args.quotationId);
  if(!q)return {error:'Quotation not in authorized context. Ask for the correct reference or open it first.'};
  form=q.savedFields;basis='Saved quotation '+(q.reference||q.customer||q.id);
 }else if(args.basis==='current'){
  if(!context.currentStudio)return {error:'Current Studio inputs unavailable. Do not substitute a saved quotation.'};
  form=context.currentStudio;basis='Current unsaved Studio inputs (client supplied)';
 }else if(args.basis==='default'){
  form=studio.defaults;basis='General Studio defaults — assets/js/state.js';
 }else if(args.basis==='preset'||args.basis==='auto'||!args.basis){
  const preset=studio.presets[capacity+'kw'];
  if(!preset&&args.basis==='preset')return {error:'No matching capacity preset. Use the labeled general default or ask for a rate basis.'};
  form=preset?{...studio.defaults,...studio.presetReset,...preset}:studio.defaults;
  basis=preset?capacity+' kW quick preset — assets/js/app.js':'General Studio defaults — assets/js/state.js (no matching capacity preset)';
 }else return {error:'Unsupported calculation basis.'};
 const actualCapacity=requestedCapacity==null?Number(form.capacity):requestedCapacity;
 if(!Number.isFinite(actualCapacity)||actualCapacity<=0||actualCapacity>1000000)return {error:'Provide a capacity above 0 and at most 1,000,000 kWp.'};
 if(args.customerType && !['residential','commercial','industrial'].includes(args.customerType))return {error:'Unsupported customer type.'};
 form={...form,capacity:actualCapacity,...(args.customerType?{customerType:args.customerType}:{})};
 if(args.customerType)basis+='; customer-type scenario: '+args.customerType;
 return {form,basis};
}
export function calculateStudio(args,context){
 const resolved=resolveStudio(args,context);
 if(resolved.error)return resolved;
 const {form,basis}=resolved,capacity=Number(form.capacity);
 const num=v=>v==null||String(v).trim()===''?NaN:Number(v);
 const rate=form.costPerWp!=null?num(form.costPerWp)*1000:num(form.costPerKwp),gst=num(form.gstPercent);
 if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(gst)||gst<0||gst>100)return {error:'The chosen inputs have no valid rate/GST. Ask for those inputs; do not silently use defaults.'};
 const f=Finance.compute({...form,capacity,costPerKwp:rate,gstPercent:gst});
 if(![f.projectCost,f.gstAmount,f.grossTotal].every(Number.isFinite))return {error:'Inputs could not produce finite prices.'};
 const projections={};
 if(num(form.genFactor)>0 && num(form.moduleWattage)>0){
  projections.installedKwp=f.installedKwp;projections.moduleCount=f.moduleCount;projections.moduleWattage=f.moduleWattage;
  projections.basis='Generation uses rounded-up module count / installed kWp, not only contracted capacity.';
  projections.annualGenerationKwh=f.annualGen;projections.generationFactorKwhPerKwpYear=num(form.genFactor);
  if(num(form.tariff)>0){projections.annualSaving=f.annualSaving;projections.tariffPerKwh=num(form.tariff);}
  if(num(form.tariff)>0 && Number.isFinite(num(form.escalation)) && Number.isFinite(num(form.degradation))){
   for(const key of ['lifetimeGen','lifetimeSaving','payback','irr','effectivePerUnit'])projections[key]=f[key];
   projections.escalationPercent=num(form.escalation);projections.degradationPercent=num(form.degradation);
  }
 }
 const subsidy=['residential','commercial','industrial'].includes(form.customerType)?{customerType:form.customerType,estimatedSubsidy:f.subsidy,estimatedStateTopUp:f.stateTopUp,netInvestment:f.netInvestment,warning:'Engine assumption only; eligibility, approval and disbursement are NOT guaranteed.'}:null;

 return {basis,projections,subsidy,engine:'assets/js/finance.js Finance.compute',capacityKwp:capacity,ratePerWp:rate/1000,gstPercent:gst,base:f.projectCost,gstAmount:f.gstAmount,totalIncludingGST:f.grossTotal,scope:'Indicative solar EPC only. Battery/EV/add-ons excluded. Subsidy not deducted; eligibility and final design are not guaranteed. Capacity changes do not redesign equipment.'};
}
export const calculationTool={functionDeclarations:[{name:'calculateStudio',description:'Calculate solar EPC pricing, generation, savings and subsidy assumptions using the real Studio Finance engine. Always call for requested numeric prices; never do mental pricing or demand a saved quotation for generic rates. auto selects exact repo preset else labeled default; quotation uses authorized saved record; current uses unsaved Studio fields.',parameters:{type:'OBJECT',properties:{capacityKwp:{type:'NUMBER'},basis:{type:'STRING',enum:['auto','preset','default','quotation','current']},quotationId:{type:'STRING'},customerType:{type:'STRING',enum:['residential','commercial','industrial']}},required:['capacityKwp','basis']}}]};


// Tool selection is Gemini's decision, not a question/keyword router.
// Data and calculations are read-only; missing design inputs stay missing.
export function inspectStudio(args,context){
 const resolved=resolveStudio(args,context);
 if(resolved.error)return resolved;
 const {form,basis}=resolved;
 const topics=Array.isArray(args.topics)?args.topics:['equipment','subsidy','financial'];
 const has=t=>topics.includes('all')||topics.includes(t);
 const pick=keys=>Object.fromEntries(keys.filter(k=>form[k]!=null).map(k=>[k,form[k]]));
 const supplied=v=>v!==''&&v!=null&&Number.isFinite(Number(v));
 const rate=supplied(form.costPerWp)?Number(form.costPerWp)*1000:Number(form.costPerKwp);
 const state={...form,costPerKwp:Number.isFinite(rate)?rate:0};
 const f=Finance.compute(state);
 const out={basis,capacityKwp:Number(form.capacity),warning:'Read-only illustration using the chosen inputs. Repository assumptions / preliminary engineering checks are not current-law, OEM compatibility, eligibility or site certification.'};
 if(has('equipment'))out.equipment={selected:pick(['moduleMake','moduleWattage','moduleTech','moduleLengthMm','moduleWidthMm','moduleVoc','moduleIsc','moduleVmp','moduleImp','inverterMake','inverterKw','inverterVmaxDc','mpptMinV','mpptMaxV','inverterMaxCurrentA','mountMake','cableMake','roofType']),moduleCount:supplied(form.moduleWattage)&&Number(form.moduleWattage)>0?f.moduleCount:null,installedKwp:supplied(form.moduleWattage)&&Number(form.moduleWattage)>0?f.installedKwp:null,catalogue:context.equipmentCatalog||studio.equipment,catalogueBasis:context.equipmentCatalog?'Current browser equipment catalogue (client supplied)':'Repository starter catalogue, not stock availability',limits:'Blank model, efficiency, Voc/Isc, MPPT or rating means not specified. Never infer OEM details from brand names. Presets, starter catalogue and the selected quotation may differ.'};
 if(has('tax'))out.tax={gstPercent:form.gstPercent??null,source:'Editable quotation GST assumption, not live statutory tax verification',depreciationRatePercent:form.depreciationRate??null,corporateTaxRatePercent:form.corpTaxRate??null,warning:'Tax eligibility, asset basis, commissioning date and regime require confirmation; tax shield is not deducted from solar investment/payback.'};
 if(has('subsidy'))out.subsidy={customerType:form.customerType??null,installedKwp:supplied(form.moduleWattage)&&Number(form.moduleWattage)>0?f.installedKwp:null,estimate:form.customerType&&supplied(form.moduleWattage)&&Number(form.moduleWattage)>0?f.subsidy:null,stateTopUpEntered:form.stateTopUp??null,overrideEntered:form.subsidyOverride??null,calculationBasis:'Engine uses installed DC capacity after module rounding. Explicit subsidy override wins; otherwise residential central slab plus entered state top-up. Commercial/industrial auto subsidy is zero.',scheme:{source:'assets/js/finance.js calcSubsidy',method:studio.methods.subsidy,centralCap:Finance.SUBSIDY_MAX,centralExamples:[1,2,3].map(kwp=>({installedKwp:kwp,amount:Finance.calcSubsidy(kwp)})),stateRule:'No invented state per-kW slab; only entered top-up.'},warning:'Estimate only. DCR/ALMM, category, DISCOM, registration and current scheme eligibility must be independently verified; a brand name or preset is not approval.'};
 if(has('generation')){
  const missing=['moduleWattage','genFactor'].filter(k=>!supplied(form[k])||Number(form[k])<=0);
  out.generation=missing.length?{missing,warning:'Supply these inputs; no price is needed for generation.'}:{installedKwp:f.installedKwp,moduleCount:f.moduleCount,moduleWattage:f.moduleWattage,annualGenerationKwh:f.annualGen,generationFactor:form.genFactor,annualSaving:supplied(form.tariff)&&Number(form.tariff)>0?f.annualSaving:null,tariff:form.tariff??null,warning:'Installed DC module capacity × annual generation factor. Illustration, not guaranteed production or bill savings.'};
 }
 if(has('financial')){
  out.solar=calculateStudio(args,context);
  if(!out.solar.error){
   out.solar.payments=['payAdvance','payDispatch','payCompletion'].every(k=>supplied(form[k]))?f.pay:null;
   out.solar.financing=['loanAmt','loanRate','loanYears'].every(k=>supplied(form[k]))?f.financing:null;
   out.solar.bom={items:f.bomItems,sum:f.bomSum,unallocatedBaseCost:f.bomDelta,note:'Entered item breakdown only; not OEM component prices. Blank BOM is not a free component.'};
   out.solar.taxIllustration={taxDepreciationYear1:f.taxDepreciationYear1,taxShield:f.taxShield,notDeductedFromInvestment:true};
  }
 }
 const batterySolar={...f};
 if(!Number.isFinite(rate)||rate<=0||!supplied(form.gstPercent))delete batterySolar.netInvestment;
 if(!supplied(form.genFactor)||Number(form.genFactor)<=0||!supplied(form.moduleWattage))delete batterySolar.annualGen;
 if(has('battery'))out.battery={inputs:pick(Object.keys(form).filter(k=>k.startsWith('bess'))),assessment:Bess.compute(state,batterySolar),catalogue:studio.storage,warning:'Battery price, OEM compatibility and backup readiness must be supplied. Conversion/round-trip efficiencies are design assumptions, not OEM facts. Never add storage savings to solar savings without interval modelling.'};
 if(has('engineering'))out.engineering={inputs:pick(Object.keys(form).filter(k=>!k.startsWith('bess')&&!k.startsWith('system'))),report:Engineering.report(state,f),warning:'Report missing/blocking/advisory lists faithfully. Preliminary arithmetic, not an installation approval or structural/electrical certification. Roof suitability and protections require site review.'};
 if(has('scope')||has('warranty'))out.document={scopeTemplate:studio.content.pageScope,warrantyTemplate:studio.content.pageWarranty,termsTemplate:studio.content.pageTerms,selectedTerms:pick(['durationText','jurisdiction','validityDays']),additionalSystemInputs:pick(Object.keys(form).filter(k=>k.startsWith('system'))),additionalSystemTemplates:studio.additionalSystems,warning:'These are shipped proposal templates, not a promise for every OEM model or evidence of modified/signed quotation terms. Use verified selected OEM/agreed terms for final commitments.'};
 return out;
}
export function safeEquipmentCatalog(value){
 if(!value || typeof value!=='object' || Array.isArray(value))return undefined;
 const out={};
 const fields=['id','make','model','wp','tech','lengthMm','widthMm','efficiency','voc','isc','vmp','imp','kw','mppt','label','vmaxDc','mpptMin','mpptMax','maxCurrent'];
 for(const group of ['modules','inverters','structures','cables'])if(Array.isArray(value[group]))out[group]=value[group].slice(0,10).map(row=>Object.fromEntries(fields.filter(k=>row&&['string','number'].includes(typeof row[k])).map(k=>[k,String(row[k]).slice(0,100)])));
 if(!Object.keys(out).length)return undefined;
 out.coverage={perCategoryLimit:10,mayBeTruncated:Object.values(out).some(rows=>rows.length>=10)};
 return out;
}
calculationTool.functionDeclarations.push({name:'inspectStudio',description:'Inspect selected/current/preset Studio equipment, brands, module sizing, GST, subsidy, payments/BOM/loan, solar generation/savings, battery runtime, engineering missing-input checks, scope and warranty templates. Uses existing Finance, Bess and Engineering engines. No edits or writes. For explicit commercial/industrial/residential scenario pass customerType; otherwise preserve chosen source. Non-price questions like equipment/subsidy do not require a saved price.',parameters:{type:'OBJECT',properties:{capacityKwp:{type:'NUMBER'},basis:{type:'STRING',enum:['auto','preset','default','quotation','current']},quotationId:{type:'STRING'},customerType:{type:'STRING',enum:['residential','commercial','industrial']},topics:{type:'ARRAY',items:{type:'STRING',enum:['equipment','tax','subsidy','financial','generation','battery','engineering','scope','warranty','all']}}},required:['basis','topics']}});
