/* Explicit illustrative selling-price allocations, not purchase costs or market data. */
'use strict';
(() => {
 const labels=['Solar modules','Inverter','Mounting structure','Electrical & protection','Installation','Liaison & commissioning'];
 const material=(modules,inverter)=>[
  {item:'Solar modules',make:'Waaree · sample selection',spec:'500 Wp · mono PERC',quantity:modules+' modules'},
  {item:'Inverter',make:inverter,spec:'On-grid · sample selection',quantity:'1 unit'},
  {item:'Mounting structure',make:'Hot-dip galvanised steel',spec:'Site-specific design pending',quantity:'1 lot'},
  {item:'Electrical & protection',make:'DC / AC cabling, SPD & earthing',spec:'Final ratings per approved design',quantity:'1 set'}
 ];
 const records={
  'demo-patil':{category:'residential',categoryLabel:'Residential',capacity:7,base:425000,tax:51000,gross:476000,allocation:[190000,75000,60000,40000,45000,15000],materials:material(14,'Sungrow · 6 kW'),scope:[{name:'Leak Proof roof',basis:'separate',price:84000},{name:'Rainwater collection',basis:'optional',price:null}],revision:{version:'1.0',capacity:6.3,gross:455000,module:'14 × 450 Wp'}},
  'demo-anand':{category:'industrial',categoryLabel:'Industrial',capacity:100,base:3250000,tax:390000,gross:3640000,allocation:[1600000,600000,450000,250000,275000,75000],materials:material(200,'Sungrow · 100 kW'),scope:[{name:'Energy monitoring',basis:'included',price:null},{name:'DG–solar coordination',basis:'separate',price:125000}]},
  'demo-green':{category:'rwa',categoryLabel:'Housing society',capacity:25,base:950000,tax:114000,gross:1064000,allocation:[410000,180000,145000,90000,95000,30000],materials:material(50,'Growatt · 25 kW'),scope:[{name:'Energy monitoring',basis:'included',price:null}]},
  'demo-shop':{category:'commercial',categoryLabel:'Commercial',capacity:15,base:650000,tax:78000,gross:728000,allocation:[285000,120000,100000,65000,60000,20000],materials:material(30,'Solis · 15 kW'),scope:[{name:'EV charging provision',basis:'optional',price:null}]},
  'demo-villa':{category:'residential',categoryLabel:'Residential',capacity:5,base:330000,tax:39600,gross:369600,allocation:[150000,65000,45000,25000,30000,15000],materials:material(10,'Sungrow · 5 kW'),scope:[{name:'Battery Energy Storage',basis:'separate',price:210000}],revision:{version:'1.0',capacity:5,gross:350000,module:'10 × 500 Wp'}}
 };
 window.DemoQuoteSummaryData={labels:Object.freeze(labels),get(id){const key=String(id).replace(/(?:-copy)+$/,'');return records[key]?JSON.parse(JSON.stringify(records[key])):null;}};
})();
