/* Independent panel-count boundary checks: exact totals plus/minus one watt. */
'use strict';
const assert=require('node:assert/strict'), F=require('../assets/js/finance');
let passed=0;
function check(name,fn){fn();passed++;console.log('  ✓ '+name);}
for(const deltaWatts of [-1,0,1]){
 check('18,200 sizing cases at '+deltaWatts+' W from an exact module boundary',()=>{
  for(let watts=300;watts<=750;watts+=5)for(let count=1;count<=200;count++){
   const capacity=(count*watts+deltaWatts)/1000;
   const actual=F.compute({capacity,moduleWattage:watts});
   assert.equal(actual.moduleCount,count+(deltaWatts>0?1:0),JSON.stringify({capacity,watts,count,deltaWatts}));
  }
 });
}
check('545 Wp exact boundary needs 15 modules, not 16',()=>{
 const f=F.compute({capacity:'8.175',moduleWattage:'545',moduleLengthMm:2278,moduleWidthMm:1134});
 assert.equal(f.moduleCount,15);assert.equal(f.installedKwp,8.175);
 assert(Math.abs(f.arrayArea-38.749)<.001);assert.equal(f.dcAcRatio,1);
});
check('a genuine 0.001 W shortfall still requires another panel',()=>{
 assert.equal(F.compute({capacity:8.175001,moduleWattage:545}).moduleCount,16);
 assert.equal(F.compute({capacity:8.174999,moduleWattage:545}).moduleCount,15);
});
check('10 kWp with automatic 10 kW inverter uses installed DC power',()=>{
 const f=F.compute({capacity:10,moduleWattage:545});
 assert.equal(f.inverterKw,10);assert.equal(f.installedKwp,10.355);
 assert(Math.abs(f.dcAcRatio-1.0355)<1e-12);
});
check('custom inverter ratings use the same actual array total',()=>{
 assert(Math.abs(F.compute({capacity:10,moduleWattage:545,inverterKw:8}).dcAcRatio-1.294375)<1e-12);
 assert(Math.abs(F.compute({capacity:10,moduleWattage:545,inverterKw:20}).dcAcRatio-.51775)<1e-12);
});
check('zero capacity is safe and has no defined ratio',()=>{
 const f=F.compute({capacity:0,moduleWattage:545});
 assert.equal(f.moduleCount,0);assert.equal(f.installedKwp,0);assert.equal(f.dcAcRatio,0);
});
check('module choice never moves the quoted investment',()=>{
 /* The ₹/kWp rate is the agreed price, so the quotation must stay put when a
    different module is selected. Only physics may follow the real array. */
 const state={capacity:10,costPerKwp:90000,gstPercent:8.9,genFactor:1460,tariff:15,escalation:6,degradation:.5};
 const price=f=>({projectCost:f.projectCost,gstAmount:f.gstAmount,grossTotal:f.grossTotal,subsidy:f.subsidy,netInvestment:f.netInvestment,costPerWp:f.costPerWp});
 const baseline=price(F.compute({...state,moduleWattage:545}));
 assert.equal(baseline.netInvestment,902100);assert.equal(baseline.costPerWp,90);
 for(const watts of [500,545,550,620])assert.deepEqual(price(F.compute({...state,moduleWattage:watts,inverterKw:8})),baseline);
});
check('generation follows the installed array, not the contracted figure',()=>{
 const state={capacity:10,costPerKwp:90000,gstPercent:8.9,genFactor:1460,tariff:15,escalation:6,degradation:.5};
 for(const watts of [500,545,550,620]){
  const f=F.compute({...state,moduleWattage:watts});
  assert(f.installedKwp>=10,JSON.stringify({watts,installedKwp:f.installedKwp}));
  assert.equal(f.annualGen,f.installedKwp*1460);
  assert.equal(f.annualSaving,f.annualGen*15);
 }
 assert.equal(F.compute({...state,moduleWattage:545}).annualGen,10.355*1460);
 assert.equal(F.compute({...state,moduleWattage:500}).annualGen,10*1460);
});
check('subsidy is assessed on installed DC capacity at the slab boundary',()=>{
 /* 2 kWp contracted at 545 Wp is 4 modules = 2.18 kWp, which earns ₹63,240 —
    the ₹60,000 a contracted-basis calculation would have reported. */
 assert.equal(F.compute({capacity:2,moduleWattage:545}).subsidy,63240);
 assert.equal(F.compute({capacity:2.5,moduleWattage:545}).subsidy,73050);
 /* At and above the 3 kW slab the cap absorbs the difference either way. */
 assert.equal(F.compute({capacity:3,moduleWattage:545}).subsidy,78000);
 assert.equal(F.compute({capacity:10,moduleWattage:545}).subsidy,78000);
});
check('roof clearance is applied and clamped at bare module area',()=>{
 const dims={moduleLengthMm:2278,moduleWidthMm:1134};
 const a=F.compute({capacity:10,moduleWattage:545,...dims,roofClearanceFactor:1.4});
 assert(Math.abs(a.requiredArea-a.arrayArea*1.4)<1e-9);
 const b=F.compute({capacity:10,moduleWattage:545,...dims,roofClearanceFactor:0});
 assert.equal(b.requiredArea,b.arrayArea);
 const c=F.compute({capacity:10,moduleWattage:545,...dims});
 assert.equal(c.roofClearanceFactor,1.4);
});
check('environmental defaults are the current published figures',()=>{
 const f=F.compute({capacity:7,genFactor:1460,moduleWattage:545});
 assert.equal(f.co2Factor,0.71); /* CEA v21.0, FY2024-25 weighted average */
 assert.equal(f.treeFactor,22);  /* mature tree, 20-25 kg CO2/yr */
});
console.log(`\n${passed} passed, 0 failed (including 54,600 sizing scenarios)`);
