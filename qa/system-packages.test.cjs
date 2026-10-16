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
 assert.match(A.templates.carport.exclusions,/EV charger/);assert.match(A.templates.carport.exclusions,/Weatherproof/);
 assert.match(A.templates.weatherproof.notes,/sealed anchor holes alone do not/);
 assert.match(A.templates.canopy.notes,/not automatically a weatherproof roof/);
});
check('neither price mode changes the frozen solar computation',()=>{
 const base={capacity:'7',costPerKwp:'62500',gstPercent:'8.9',genFactor:'1460',customerType:'residential'};
 const expected=JSON.stringify(F.compute(base));
 for(const kind of Object.keys(A.templates))for(const mode of ['separate','included'])assert.equal(JSON.stringify(F.compute({...base,systemEnabled:true,systemTemplate:kind,systemPriceMode:mode,systemPrice:'125000',systemAreaM2:'50',systemHeightM:'3',systemBays:'2'})),expected);
});
console.log(`${checks} package checks passed.`);
