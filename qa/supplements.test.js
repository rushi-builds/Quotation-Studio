'use strict';
const assert=require('node:assert/strict'),F=require('../assets/js/finance.js'),B=require('../assets/js/bess.js'),C=require('../assets/js/storage-catalog.js'),A=require('../assets/js/additional-systems.js');
let passed=0;const check=(n,c)=>{assert(c,n);passed++;console.log('  ✓ '+n);};
const base={...B.DEFAULTS,capacity:'7',genFactor:'1460',inverterKw:'',tariff:'15',costPerKwp:'90000',bessEnabled:true,bessModel:'pylon-us5000',bessSpecMode:'auto',bessDischargeEff:'96',bessPowerDerate:'15'};
const solar=F.compute(base),state=patch=>({...base,...patch}),size=patch=>B.sizing(state(patch),solar),calc=patch=>B.compute(state(patch),solar),close=(a,b)=>Math.abs(a-b)<1e-7;
check('five versioned models, distinct stable IDs and source references',C.models.length===5&&new Set(C.models.map(m=>m.id)).size===5&&C.models.every(m=>m.source.startsWith('https://')&&m.edition));
for(const m of C.models){check(m.name+' has consistent capacity and continuous/recommended current',m.usable>0&&m.usable<=m.rated&&m.current>0&&m.maxUnits>=1);check(m.name+' auto energy is catalogue-based',close(calc({bessModel:m.id}).usableDc,m.usable*size({bessModel:m.id}).units));}
check('no model invents an OEM system efficiency or a price',C.models.every(m=>m.efficiency===undefined&&m.price===undefined));
check('daily generation follows actual solar quotation',close(size({}).daily,28));
check('default labelled 30 percent scenario yields 8.4 kWh target',close(size({}).target,8.4));
check('automatic module count rounds up usable AC energy, not nominal capacity',size({}).units===2&&close(calc({}).capacity,9.6)&&close(calc({}).usableAc,8.7552));
check('converter candidate limits AC output',close(calc({}).power,7));
check('manual converter limit caps auto output',close(calc({bessPcsKw:'3'}).power,3));
check('essential-load mode requires load, not solar capacity as proxy',size({bessSizing:'backup'}).target===null&&calc({bessSizing:'backup'}).capacity===null);
check('backup sizing uses kW × hours',close(size({bessSizing:'backup',bessLoad:'5',bessTargetHours:'4'}).target,20)&&size({bessSizing:'backup',bessLoad:'5',bessTargetHours:'4'}).units===5);
check('short backup includes module power requirement, not only kWh',size({bessModel:'pylon-us2000c',bessSizing:'backup',bessLoad:'2',bessTargetHours:'.25'}).units===3);
check('missing duration does not assume requested backup',size({bessSizing:'backup',bessLoad:'2',bessTargetHours:''}).units===null);
check('exact boundary does not spuriously add a module',size({bessSizing:'backup',bessLoad:'1',bessTargetHours:'4.3776'}).units===1);
check('automatic sizing never exceeds the supported configuration ceiling',size({bessSizing:'backup',bessLoad:'100',bessTargetHours:'24'}).units===null&&size({bessSizing:'backup',bessLoad:'100',bessTargetHours:'24'}).issue.includes('exceeds'));
check('explicit low quantity is retained and flagged undersized',size({bessUnitsOverride:'1'}).units===1&&size({bessUnitsOverride:'1'}).issue.includes('below'));
check('fractional or oversized quantity overrides are rejected',size({bessUnitsOverride:'1.5'}).units===null&&size({bessUnitsOverride:'99'}).units===null);
check('a whole explicit quantity remains fixed',size({bessUnitsOverride:'4'}).units===4&&calc({bessUnitsOverride:'4'}).capacity===19.2);
check('invalid efficiency cannot generate an automatic bank',size({bessDischargeEff:'101'}).units===null);
check('invalid storage share is not silently accepted',size({bessShiftShare:'101'}).target===null);
check('invalid derating and converter power are identified',size({bessPowerDerate:'100'}).issue.length>0&&size({bessPcsKw:'-1'}).issue.includes('positive'));
check('auto model selection does not establish backup compatibility',calc({bessLoad:'2'}).backupHours===null);
const resolved=B.resolve({...base,bessLoad:'2'},solar);const confirmed={...resolved,bessBackupReady:'yes',bessInverter:'Reviewed inverter',bessCoupling:'dc'};
check('explicit confirmed configuration can establish conditional runtime',B.compute(confirmed,solar).backupHours>0);
check('changed automatic configuration invalidates old confirmation',B.resolve({...confirmed,bessUnitsOverride:'3'},solar).bessBackupReady==='pending');
check('changed automatic configuration also clears stale manually priced scope',B.resolve({...confirmed,bessCost:'300000',bessUnitsOverride:'3'},solar).bessCost==='');
check('unchanged automatic configuration keeps confirmation across reload',B.resolve(confirmed,solar).bessBackupReady==='yes');
check('manual ratings are not overwritten by a catalogue selection',B.resolve({...base,bessSpecMode:'manual',bessCapacity:'42',bessPower:'8'},solar).bessCapacity==='42');
check('custom model keeps entered capacity',calc({bessModel:'custom',bessSpecMode:'manual',bessCapacity:'20',bessDod:'90',bessPower:'5'}).capacity===20);
const econ=B.resolve({...base,bessAutoEconomics:true},solar);
check('explicit quote-linked economics follows tariff and scenario without inventing source price',econ.bessImportRate==='15'&&econ.bessSourceEnergy==='8.4'&&econ.bessDemand==='8.4'&&econ.bessSourceRate==='');
check('missing charging cost still withholds auto financial benefit',B.compute({...econ,bessUseCase:'self'},solar).annualBenefit===null);
check('standalone battery enabled does not imply inclusion in the solar report',B.enabled({...base,bessInclude:false})&&!B.included({...base,bessInclude:false}));
check('malformed inclusion flags never become truthy in Customer View',!B.included({...base,bessInclude:'false'})&&!A.included({systemEnabled:true,systemInclude:'false'}));
check('battery off emits no stored calculations',!calc({bessEnabled:false}).enabled&&calc({bessEnabled:false}).capacity===null);
check('five additional-system templates plus independent Custom state',Object.keys(A.templates).length===5&&A.DEFAULTS.systemTemplate==='custom');
check('all presets include purpose, equipment, scope, notes and exclusions',Object.values(A.templates).every(t=>['name','purpose','equipment','scope','notes','exclusions'].every(k=>t[k])));
check('Zero Export explicitly acknowledges curtailment and transient export',A.templates.zero.notes.includes('transient')&&A.templates.zero.notes.includes('reduce'));
check('no automatic additional-system price or savings',A.DEFAULTS.systemPrice===''&&A.price({systemPrice:''})===null&&A.price({systemPrice:' '})===null);
check('additional price rejects non-finite and negative values, accepts explicit zero',A.price({systemPrice:'Infinity'})===null&&A.price({systemPrice:'-1'})===null&&A.price({systemPrice:'0'})===0);
check('additional-system standalone/inclusion states are independent',A.enabled({systemEnabled:true,systemInclude:false})&&!A.included({systemEnabled:true,systemInclude:false}));
check('solar Finance is unchanged by either supplement',JSON.stringify(F.compute(base))===JSON.stringify(F.compute({...base,systemEnabled:true,systemPrice:'100000',bessCost:'300000'})));
check('malformed imported quantities never fall back to automatic sizing', ['invalid','0x2',false,{},Infinity].every(v=>size({bessUnitsOverride:v}).units===null));
check('malformed imported converter limits never fall back to solar output', ['invalid','0x7',false,{},Infinity].every(v=>size({bessPcsKw:v}).power===null&&size({bessPcsKw:v}).issue.includes('positive')));
check('empty override fields still use automatic defaults', size({bessUnitsOverride:' ',bessPcsKw:' '}).units===2&&size({bessUnitsOverride:null,bessPcsKw:null}).power===7);
check('invalidated automatic configuration clears price and engineering status', B.resolve({...confirmed,bessCost:'300000',bessPcsKw:'invalid'},solar).bessCost===''&&B.resolve({...confirmed,bessPcsKw:'invalid'},solar).bessBackupReady==='pending');
check('additional prices reject nondecimal syntax and booleans', ['0x20','0b10',false,true,{}].every(v=>A.price({systemPrice:v})===null));
check('legacy battery data does not invent a requested backup target or recommendation', B.DEFAULTS.bessTargetHours===''&&B.reason(B.DEFAULTS)==='Optional alternative');
check('daily-shift sizing increases the bank to retain the entered backup reserve',size({bessUseCase:'self',bessReserve:'20'}).units===3&&close(size({bessUseCase:'self',bessReserve:'20'}).shiftPerUnit,4.3776*.8));
check('backup duration sizing uses the full usable charge, not the daily-shift reserve',size({bessUseCase:'self',bessReserve:'20',bessSizing:'backup',bessLoad:'1',bessTargetHours:'4'}).units===1);
check('unknown or full reserve cannot claim a daily-shift target was sized',size({bessUseCase:'self',bessReserve:''}).units===null&&size({bessUseCase:'self',bessReserve:'100'}).units===null);
check('an explicit undersized quantity is flagged after reserve deduction',size({bessUseCase:'self',bessReserve:'20',bessUnitsOverride:'2'}).issue.includes('after operating reserve'));
const invalidLinked=B.resolve({...base,bessSpecMode:'manual',bessAutoEconomics:true,bessShiftShare:'101',bessSourceEnergy:'8.4',bessDemand:'8.4'},solar);
check('invalid linked sizing clears stale charge and demand instead of preserving previous savings assumptions',invalidLinked.bessSourceEnergy===''&&invalidLinked.bessDemand==='');
check('PFC template never invents a capacitor rating or a guaranteed saving',A.templates.pfc.notes.includes('cannot be inferred from solar kWp')&&A.templates.pfc.notes.includes('no savings or kvar sizing'));
check('catalogue usable-energy changes invalidate old confirmation even at unchanged kWh and kW',B.resolve({...confirmed,bessDod:'90',bessCost:'300000'},solar).bessBackupReady==='pending'&&B.resolve({...confirmed,bessDod:'90',bessCost:'300000'},solar).bessCost==='');
check('changing the selected identity cannot retain a prior same-rated price',B.resolve({...confirmed,bessMake:'Different same-rated model',bessCost:'300000'},solar).bessCost==='');
let scenarios=0;
for(const model of C.models)for(const capacity of [1,3,7,10,25,50,100])for(const share of [10,30,50,100])for(const eff of [85,90,96,100])for(const reserve of [0,20,50,99]){
 const input={...base,capacity:String(capacity),bessModel:model.id,bessUseCase:'self',bessShiftShare:String(share),bessDischargeEff:String(eff),bessReserve:String(reserve)};
 const a=B.sizing(input,F.compute(input));scenarios++;
 if(a.units!==null){assert(Number.isInteger(a.units)&&a.units<=model.maxUnits);assert(a.units*a.shiftPerUnit+1e-8>=a.target);assert(a.units===1||(a.units-1)*a.shiftPerUnit<a.target+1e-8);assert(a.power<=a.pcsLimit+1e-8);}
 else assert(a.recommended>model.maxUnits);
}
for(const model of C.models)for(const load of [.5,2,5,10,50])for(const hours of [.5,1,4,12,24,168])for(const eff of [90,96]){
 const input={...base,bessModel:model.id,bessSizing:'backup',bessLoad:String(load),bessTargetHours:String(hours),bessDischargeEff:String(eff)};
 const a=B.sizing(input,solar);scenarios++;
 if(a.units!==null){assert(a.units*a.perUnit+1e-8>=load*hours);assert(a.units*a.unitPower+1e-8>=load);if(load>a.pcsLimit)assert(a.issue.includes('below'));}
 else assert(a.recommended>model.maxUnits);
}
check(scenarios+' model/solar/reserve/backup scenarios preserve energy, power and configuration bounds',scenarios===2540);
console.log(`\n${passed} passed, 0 failed`);
