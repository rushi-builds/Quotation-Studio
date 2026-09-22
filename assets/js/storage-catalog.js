/* Versioned starter data, not an availability/compatibility endorsement.
   OEM documents and edition caveats are recorded in docs/storage-catalogue.md.
   AC conversion/round-trip efficiencies and prices are NOT OEM battery specs. */
'use strict';
(function(root){
 const legacy='https://www.pluginsolar.co.uk/wp-content/uploads/2022/05/us5000-datasheet.pdf';
 const models=[
  {id:'pylon-us5000',name:'Pylontech US5000',rated:4.8,usable:4.56,voltage:48,current:100,maxUnits:16,chemistry:'LFP',source:'https://en.pylontech.com.cn/products/us5000',edition:'OEM product page, reviewed 22 Sep 2026; confirm supplied revision',note:'48 V rack module · IP20 · normal current, not a surge rating'},
  {id:'deye-seg51',name:'Deye SE-G5.1 Pro-B',rated:5.12,usable:4.6,voltage:51.2,current:50,maxUnits:32,chemistry:'LFP',source:'https://deyeess.com/product/se-g5-1-pro-b/',edition:'OEM product page + EU manual Issue 06 (2026-05-26)',note:'51.2 V · IP20 · 50 A recommended current. Uses conservative 4.6 kWh operating energy, not 100% test discharge.'},
  {id:'dyness-dl50c',name:'Dyness DL5.0C',rated:5.12,usable:4.608,voltage:51.2,current:50,maxUnits:50,chemistry:'LFP',source:'https://www.dyness.com/Public/Uploads/uploadfile/files/20241023/DynessDL5.0CdatasheetEN.pdf',edition:'OEM datasheet V1.0-20241011; not the Pro / other revisions',note:'51.2 V · IP20 · 90% DoD · 50 A recommended current'},
  {id:'pylon-us3000c',name:'Pylontech US3000C',rated:3.552,usable:3.374,voltage:48,current:37,maxUnits:16,chemistry:'LFP',source:legacy,edition:'Manufacturer residential BESS sheet, distributor-hosted 2022 edition',note:'48 V rack module · IP20 · 37 A continuous. Usable energy follows the rounded datasheet value.'},
  {id:'pylon-us2000c',name:'Pylontech US2000C',rated:2.4,usable:2.28,voltage:48,current:25,maxUnits:16,chemistry:'LFP',source:legacy,edition:'Manufacturer residential BESS sheet, distributor-hosted 2022 edition',note:'48 V rack module · IP20 · 25 A continuous. Confirm current model availability.'}
 ];
 const api={version:'2026-09-22.1',models,get:id=>models.find(m=>m.id===id)||null};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.StorageCatalog=api;
})(typeof self!=='undefined'?self:this);
