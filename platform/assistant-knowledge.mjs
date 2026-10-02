import studio from './studio-knowledge.mjs';
import Finance from '../assets/js/finance.js';
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
  if(/^(company|stat|duration|jurisdiction)/.test(k))continue;
  const v=form[k];
  if(typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=160)out[k]=v;
 }
 if(form.costPerKwp!=null && Number.isFinite(Number(form.costPerKwp)))out.costPerKwp=Number(form.costPerKwp);
 return out;
}
export function calculateStudio(args,context){
 const capacity=Number(args.capacityKwp);
 if(!Number.isFinite(capacity)||capacity<=0||capacity>1000000)return {error:'Provide a capacity above 0 and at most 1,000,000 kWp.'};
 let form,basis;
 if(args.basis==='quotation'){
  const q=[context.selectedQuotation,...context.recentQuotations].find(q=>q && q.id===args.quotationId);
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
export const calculationTool={functionDeclarations:[{name:'calculateStudio',description:'Calculate solar EPC pricing, generation, savings and subsidy assumptions using the real Studio Finance engine. Always call for requested numeric prices; never do mental pricing or demand a saved quotation for generic rates. auto selects exact repo preset else labeled default; quotation uses authorized saved record; current uses unsaved Studio fields.',parameters:{type:'OBJECT',properties:{capacityKwp:{type:'NUMBER'},basis:{type:'STRING',enum:['auto','preset','default','quotation','current']},quotationId:{type:'STRING'}},required:['capacityKwp','basis']}}]};
