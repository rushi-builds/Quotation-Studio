'use strict';
const assert=require('node:assert/strict');
const A=require('../assets/js/additional-systems.js');
const F=require('../assets/js/finance.js');
let checks=0;
const check=(name,fn)=>{fn();checks++;console.log('PASS:',name);};
check('nine presets retain the existing five and four distinct architectural packages',()=>{
 assert.equal(Object.keys(A.templates).length,9);
 for(const key of ['zero','monitoring','ev','pfc','dg','weatherproof','carport','canopy','pergola'])assert(A.templates[key]);
 assert.equal(new Set(['weatherproof','carport','canopy','pergola'].map(key=>A.presentation({systemTemplate:key}).image)).size,4);
});
check('old saved proposals default to separate pricing',()=>{assert.equal(A.priceMode({}),'separate');assert.equal(A.price({systemPrice:'25000'}),25000);});
check('included scope cannot add or display a stale second price',()=>{
 const s={systemPriceMode:'included',systemPrice:'999999'};
 assert.equal(A.price(s),null);assert.match(A.priceText(s),/Included/);assert(!A.priceText(s).includes('999'));
 assert.match(A.priceNote(s),/No second charge/);
});
check('numeric parser does not turn malformed data into money',()=>{
 for(const bad of ['', ' ', 'Infinity', 'NaN', '0x20', '0b10', true, false, {}, [], '25 lakh', '-1','1e309'])assert.equal(A.price({systemPrice:bad}),null,String(bad));
 for(const [input,amount] of [['0',0],['25000',25000],['12500.50',12500.5],['2.5e4',25000]])assert.equal(A.price({systemPrice:input}),amount);
});
check('unknown or inherited template keys cannot access object prototypes',()=>{
 for(const key of ['toString','constructor','__proto__','unknown']){assert.equal(A.template({systemTemplate:key}),null);assert.equal(A.presentation({systemTemplate:key}).image,'energy-controls.jpg');}
});
check('inclusion and enable flags remain strict, not truthy strings',()=>{
 for(const v of ['true','false',1,{},[]])assert(!A.included({systemEnabled:v}));
 assert(!A.included({systemEnabled:true,systemInclude:'true'}));
 assert(A.enabled({systemEnabled:true,systemInclude:false}));assert(!A.included({systemEnabled:true,systemInclude:false}));
});
check('requirements do not imply sizing or an invented footprint',()=>{
 const rows=A.specifications({systemTemplate:'carport'});
 assert(rows.every(([,value])=>value==='To be confirmed'));
 assert.equal(A.specifications({systemTemplate:'zero',systemAreaM2:'200'}).length,0);
 const invalid=A.specifications({systemTemplate:'carport',systemAreaM2:'-1',systemHeightM:'Infinity',systemBays:'2.5'});
 assert(invalid.slice(0,3).every(([,value])=>value==='Invalid entry — review'));
});
check('carport is not silently an EV charger or a weatherproof roof',()=>{
 assert.match(A.templates.carport.exclusions,/EV charger/);assert.match(A.templates.carport.exclusions,/Leak-proof/);
 assert.match(A.templates.weatherproof.notes,/sealed anchor holes alone do not/);
 assert.match(A.templates.canopy.notes,/does not by itself form a leak-proof roof/);
});
check('known packages auto-fill narrative and proposed site scope without inventing measured facts',()=>{
 for(const key of Object.keys(A.templates)){
  const s=A.resolve({systemEnabled:true,systemTemplate:key});
  for(const field of ['systemName','systemPurpose','systemEquipment','systemScope','systemNotes','systemExclusions'])assert(s[field]);
  assert.equal(s.systemPrice,undefined);assert.equal(s.systemAreaM2,undefined);assert.equal(s.systemHeightM,undefined);
 }
 const custom=A.resolve({systemEnabled:true,systemTemplate:'carport',systemScope:'My agreed scope',systemRoofing:'My roofing'});
 assert.equal(custom.systemScope,'My agreed scope');assert.equal(custom.systemRoofing,'My roofing');
 assert.equal(A.name({systemTemplate:'weatherproof',systemName:'Weatherproof Solar Roof'}),'Leak Proof Solar Roof');
 assert.equal(A.resolve({systemEnabled:true,systemTemplate:'weatherproof',systemName:'Weatherproof Solar Roof'}).systemName,'Leak Proof Solar Roof');
 assert.equal(A.resolve({systemEnabled:true,systemTemplate:'custom'}).systemPurpose,undefined);
});
check('neither price mode changes the frozen solar computation',()=>{
 const base={capacity:'7',costPerKwp:'62500',gstPercent:'8.9',genFactor:'1460',customerType:'residential'};
 const expected=JSON.stringify(F.compute(base));
 for(const kind of Object.keys(A.templates))for(const mode of ['separate','included'])assert.equal(JSON.stringify(F.compute({...base,systemEnabled:true,systemTemplate:kind,systemPriceMode:mode,systemPrice:'125000',systemAreaM2:'50',systemHeightM:'3',systemBays:'2'})),expected);
});
check('review never auto-approves missing prices, proposed scope or dimensions',()=>{
 const rows=A.review({systemEnabled:true,systemTemplate:'carport'});
 assert.equal(rows.length,3);assert(rows.every(r=>r.pending));
 assert.match(rows[2].label,/proposal-stage/);
 assert(A.review({systemEnabled:true,systemTemplate:'carport',systemAreaM2:'-1'})[2].invalid);
 assert(A.review({systemEnabled:true,systemTemplate:'carport',systemBays:'1.5'})[2].invalid);
 assert.equal(A.review({}).length,0);
});
check('included mode needs explicit, strict base-cost review, never a stale second price',()=>{
 for(const value of [false,undefined,'true','false',1])assert(A.review({systemEnabled:true,systemTemplate:'zero',systemPriceMode:'included',systemBaseReviewed:value,systemPrice:'999999'})[0].pending);
 assert(!A.review({systemEnabled:true,systemTemplate:'zero',systemPriceMode:'included',systemBaseReviewed:true})[0].pending);
});
check('completed commercial checks do not certify a structure',()=>{
 const rows=A.review({systemEnabled:true,systemTemplate:'carport',systemPrice:'125000',systemScopeReviewed:true,systemAreaM2:'48',systemHeightM:'2.8',systemBays:'2'});
 assert(rows.every(r=>!r.pending));assert.match(rows[2].label,/engineering still required/);
});
check('battery checks retain pending backup and operating assumptions',()=>{
 const b={enabled:true,cost:null,missing:['Rated capacity'],errors:[],backupHours:null,annualBenefit:null,economicErrors:[]};
 assert(A.review({bessUseCase:'backup'},b).every(r=>r.pending));
 assert(A.review({bessUseCase:'self'},b).some(r=>/operating assumptions/.test(r.label)));
 assert(!A.review({bessUseCase:'self'},{...b,cost:50000,missing:[],annualBenefit:-100}).some(r=>/operating assumptions/.test(r.label)));
});
check('solar equipment context follows the frozen calculation, not a second sizing rule',()=>{
 const s={capacity:'7',systemEnabled:true,systemTemplate:'carport',moduleMake:'Waaree',moduleModel:'Test module',moduleWattage:'545',inverterMake:'Sungrow',inverterModel:'Test inverter'};
 const f=F.compute(s),rows=A.equipmentContext(s,f);assert.equal(rows.length,2);
 assert(rows[0][1].includes(f.moduleCount+' × 545 Wp'));assert(rows[1][1].includes('Sungrow'));
 assert.equal(A.equipmentContext({...s,systemEnabled:false},f).length,0);
 assert.equal(A.equipmentContext({...s,systemTemplate:'zero'},f).length,0);
});
check('unmodified generated templates switch freely; actual edits require confirmation',()=>{
 const base=A.resolve({systemEnabled:true,systemTemplate:'carport',systemWeatherProtection:'pending'});
 assert(!A.hasEdits(base));assert(A.hasEdits({...base,systemScope:'My changed scope'}));
 assert(A.hasEdits({...base,systemPrice:'0'}));assert(A.hasEdits({...base,systemScopeReviewed:true}));
 assert(A.hasEdits({...base,systemPriceMode:'included'}));
});
console.log(`${checks} package checks passed.`);
