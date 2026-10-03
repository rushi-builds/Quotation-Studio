const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('../assets/js/finance.js');
const base={customerType:'rwa',capacity:10,moduleWattage:500,costPerKwp:63600,gstPercent:8.9,genFactor:1460,tariff:10};
test('RWA uses rate per installed kWp, not a flat total or household slab',()=>{
 for(const capacity of [1,3,10,100]){const f=F.compute({...base,capacity});assert.equal(f.subsidy,capacity*18000);assert.equal(f.subsidyAuto,true);assert.equal(f.rwaEligibilityConfirmed,false);assert.equal(f.netInvestment,f.grossTotal-f.subsidy);assert.equal(f.isCommercialOrInd,false);}
 const f=F.compute({...base,capacity:9.5,moduleWattage:545});assert.equal(f.installedKwp,9.81);assert.equal(f.subsidy,9.81*18000);
});
test('RWA eligibility cap, ceiling, zero and invalid inputs are explicit',()=>{
 assert.equal(F.compute({...base,capacity:600}).subsidy,500*18000);
 const f=F.compute({...base,rwaEligibleKwp:'6'});assert.equal(f.subsidy,108000);assert.equal(f.rwaEligibilityConfirmed,true);
 assert.equal(F.compute({...base,rwaEligibleKwp:'0'}).subsidy,0);
 assert.equal(F.compute({...base,rwaEligibleKwp:'20'}).subsidy,180000);
 for(const value of ['bad',-1])assert.equal(F.compute({...base,rwaEligibleKwp:value}).rwaEligibilityConfirmed,false);
 assert.equal(F.compute({...base,stateTopUp:'60000'}).subsidy,180000,'Household state top-up must not apply to RWA');
});
test('explicit amount override remains authoritative for every type, including zero',()=>{
 for(const customerType of ['rwa','residential','commercial','industrial'])for(const subsidyOverride of [0,18000,42000])assert.equal(F.compute({...base,customerType,subsidyOverride}).subsidy,subsidyOverride);
 assert.equal(F.compute({...base,subsidyOverride:''}).subsidy,180000);
 assert.equal(F.compute({...base,customerType:'residential'}).subsidy,78000);
 for(const customerType of ['commercial','industrial'])assert.equal(F.compute({...base,customerType}).subsidy,0);
});
test('AI engine tools accept RWA and expose provisional eligibility',async()=>{
 const {calculateStudio,inspectStudio}=await import('../platform/assistant-knowledge.mjs');
 const c=calculateStudio({capacityKwp:10,basis:'default',customerType:'rwa'},{recentQuotations:[]});
 assert.equal(c.subsidy.customerType,'rwa');assert.equal(c.subsidy.rwaEligibilityConfirmed,false);assert.ok(c.subsidy.estimatedSubsidy>18000);
 const s=inspectStudio({basis:'current',topics:['subsidy']},{recentQuotations:[],currentStudio:{...base,rwaEligibleKwp:6}});assert.equal(s.subsidy.estimate,108000);assert.equal(s.subsidy.rwaEligibilityConfirmed,true);
});
