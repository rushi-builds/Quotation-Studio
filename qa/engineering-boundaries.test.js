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
check('module and inverter edits do not change quoted-capacity financial projections',()=>{
 const state={capacity:10,costPerKwp:90000,gstPercent:8.9,genFactor:1460,tariff:15,escalation:6,degradation:.5};
 const financial=f=>Object.fromEntries(Object.entries(f).filter(([key])=>!['moduleWattage','moduleCount','installedKwp','arrayArea','inverterKw','dcAcRatio'].includes(key)));
 const baseline=financial(F.compute({...state,moduleWattage:545}));
 assert.equal(baseline.netInvestment,902100);assert.equal(baseline.annualGen,14600);assert.equal(baseline.annualSaving,219000);
 for(const watts of [500,550,620])assert.deepEqual(financial(F.compute({...state,moduleWattage:watts,inverterKw:8})),baseline);
});
console.log(`\n${passed} passed, 0 failed (including 54,600 sizing scenarios)`);
