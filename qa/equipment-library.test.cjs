'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
function boot(saved){const dom=new JSDOM('<div id="eqCatalog"></div>',{url:'http://equipment.test',runScripts:'outside-only'}),w=dom.window;if(saved)w.localStorage.setItem('qstudio.equipment',saved);for(const name of ['catalogue-data.js','equipment.js'])w.eval(fs.readFileSync(path.join(__dirname,'../assets/js',name),'utf8'));const editor=w.document.getElementById('eqCatalog');w.EquipmentStore.refreshSelects();w.EquipmentStore.cat();w.EquipmentStore.renderManager(editor,()=>{});return{dom,w,editor};}
const {dom,w,editor}=boot(),builtin=JSON.stringify(w.CATALOGUE_DATA);
const stored=()=>JSON.parse(w.localStorage.getItem(w.EquipmentStore.KEY));
const rows=kind=>editor.querySelectorAll('.eq-row[data-kind="'+kind+'"]');
function edit(kind,index,field,value){const input=rows(kind)[index].querySelector('[data-f="'+field+'"]');input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));}
for(const [kind,key] of [['module','modules'],['inverter','inverters'],['structure','structures'],['cable','cables']]){
 const field=['module','inverter'].includes(kind)?'make':'label';
 editor.querySelector('[data-kind="'+kind+'"].eq-add').click();assert.equal(rows(kind).length,1,'Add '+kind+' must survive the warm cache');edit(kind,0,field,'First '+kind);
 editor.querySelector('[data-kind="'+kind+'"].eq-add').click();assert.equal(rows(kind).length,2);edit(kind,1,field,'Second '+kind);
 w.EquipmentStore.cat();edit(kind,0,field,'Renamed '+kind);assert.equal(stored()[key][0][field],'Renamed '+kind);
 rows(kind)[1].querySelector('.eq-del').click();assert.equal(rows(kind).length,1,'Delete '+kind+' must not resurrect the cached row');assert.equal(stored()[key].length,1);assert(!w.EquipmentStore.cat()[key].some(r=>(r.make||r.label)==='Second '+kind));
}
edit('module',0,'wp','610');edit('module',0,'lengthMm','2300');edit('module',0,'widthMm','1134');edit('module',0,'tech','Library HJT');edit('inverter',0,'kw','8');
assert.equal(stored().modules[0].wp,'610');assert.equal(stored().inverters[0].kw,'8');assert.equal(editor.querySelector('.eq-save-status').textContent,'Saved in this browser.');
const saved=w.localStorage.getItem(w.EquipmentStore.KEY),reload=boot(saved);assert.equal(reload.editor.querySelectorAll('.eq-row').length,4);assert.equal(reload.w.EquipmentStore.cat().modules.find(r=>r.make==='Renamed module').wp,'610');reload.dom.window.close();
console.log('PASS: all four library categories add/edit/delete across warm caches and survive reload');
// User overrides retain their data/order and never rewrite shipped catalogue objects.
const original=w.CATALOGUE_DATA.modules[0],overrides=boot(JSON.stringify({_v:2,modules:[{...original,id:'local-override',wp:'611'},{id:'second',make:'Second make',wp:'620'}],inverters:[],structures:[],cables:[]}));
const input=overrides.editor.querySelector('[data-kind="module"][data-idx="0"] [data-f="wp"]');input.value='612';input.dispatchEvent(new overrides.w.Event('input',{bubbles:true}));assert.equal(JSON.parse(overrides.w.localStorage.getItem('qstudio.equipment')).modules[0].wp,'612');assert.equal(overrides.editor.querySelector('[data-kind="module"][data-idx="1"] [data-f="make"]').value,'Second make');overrides.dom.window.close();
w.EquipmentStore.importCloud({modules:[{id:'a',make:'Cloud make',model:'Same',wp:400},{id:'b',make:'Cloud make',model:'Same',wp:450}],inverters:[],cables:[]});const cloud=w.EquipmentStore.cat().modules.filter(r=>r.make==='Cloud make');assert.equal(cloud.length,1);assert.equal(cloud[0].wp,450);assert.equal(JSON.stringify(w.CATALOGUE_DATA),builtin);
// Preserve the public legacy cat().push/save integration contract.
w.EquipmentStore.cat().modules.push({id:'external',make:'Public API make',wp:625});assert.equal(w.EquipmentStore.save(),true);assert(stored().modules.some(r=>r.make==='Public API make'));
console.log('PASS: manual overrides, catalogue immutability, duplicate overlay precedence and public save API');
const storageProto=Object.getPrototypeOf(w.localStorage),setItem=storageProto.setItem;storageProto.setItem=()=>{throw new w.DOMException('Full','QuotaExceededError');};edit('module',0,'wp','615');assert.match(editor.querySelector('.eq-save-status').textContent,/Not saved:/);assert.equal(JSON.parse(saved).modules[0].wp,'610');storageProto.setItem=setItem;editor.querySelector('.eq-save').click();assert.equal(stored().modules[0].wp,'615');assert.match(editor.querySelector('.eq-save-status').textContent,/Saved in this browser/);
console.log('PASS: blocked storage reports failure rather than fake success; explicit save retries safely');dom.window.close();
