/* Controller-only race/error regression in jsdom. Not an API authority test.
   All records and deferred responses are disposable synthetic fixtures. */
'use strict';
const {JSDOM}=require('jsdom'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const dom=new JSDOM(fs.readFileSync(path.join(root,'dashboard.html'),'utf8'),{url:'http://fixture.test/dashboard.html',runScripts:'outside-only'});
const w=dom.window,d=w.document;let count=0,actor={id:'unit-one',name:'First member'},taskFails=false,reportFails=false;
const tick=()=>new Promise(r=>setImmediate(r));
const check=(name,value)=>{assert.ok(value,name);count++;console.log('  ok - '+name);};
const task=title=>({id:title,title,status:'open',dueAt:new Date().toISOString()});
const api={
  listTasks:async()=>{if(taskFails)throw Error('Unavailable');return {tasks:[task('Private old task')]};},
  listActivity:async()=>({activity:[]}),listNotifications:async()=>({notifications:[],unread:0}),
  reportSummary:async()=>{if(reportFails)throw Error('Unavailable');return {value:{quotedSum:9876,proposalsWithValue:1}};},
  markAllNotificationsRead:async()=>{}
};
w.PlatformAPI=api;
w.QSDash={user:()=>actor,proposals:()=>[],orderedActivity:rows=>rows,canEdit:()=>true,canManage:()=>false,show(){},showTasks(){},filterStatus(){},toast(){},refresh:()=>w.QSDashHome.refresh()};
w.eval(fs.readFileSync(path.join(root,'assets/js/dashboard-home.js'),'utf8'));
(async()=>{
 try{
  await w.QSDashHome.refresh();
  check('healthy Home renders genuine fixture data',/Private old task/.test(d.querySelector('#homeBody').textContent)&&/9,876/.test(d.querySelector('#homeBody').textContent));
  taskFails=true;reportFails=true;await w.QSDashHome.refresh();
  check('failed feeds remove old task content and money rather than keeping stale values',!/Private old task|9,876/.test(d.querySelector('#homeBody').textContent)&&!!d.querySelector('#homeBody [data-retry]'));
  const search=d.querySelector('#gSearch');search.value='Private old task';search.dispatchEvent(new w.Event('input'));
  check('failed task feed cannot remain discoverable in global search',!d.querySelector('#gResults [role=option]'));
  taskFails=false;reportFails=false;await w.QSDashHome.refresh();
  check('Home retry recovers and clears busy state',/Private old task/.test(d.querySelector('#homeBody').textContent)&&d.querySelector('#homeBody').getAttribute('aria-busy')==='false');
  let release,calls=0;
  api.listTasks=()=>++calls===1?new Promise(r=>release=r):Promise.resolve({tasks:[task('New session task')]});
  const old=w.QSDashHome.refresh();
  check('Home exposes loading state while requests are pending',d.querySelector('#homeBody').getAttribute('aria-busy')==='true');
  actor={id:'unit-two',name:'Second member'};d.dispatchEvent(new w.CustomEvent('qs:session'));
  check('session change immediately clears prior Home and search results',!/Private old task|9,876/.test(d.querySelector('#homeBody').textContent)&&!d.querySelector('#gResults [role=option]'));
  const fresh=w.QSDashHome.refresh();release({tasks:[task('Cross account stale task')]});await old;await fresh;
  check('late old-session response is discarded and new-session refresh still runs',!/Cross account stale task/.test(d.querySelector('#homeBody').textContent)&&/New session task/.test(d.querySelector('#homeBody').textContent));
  api.listNotifications=async()=>{throw Error('Offline');};
  const bell=d.querySelector('#btnBell');bell.click();await tick();
  check('notification failure offers an accessible inline Retry',!!d.querySelector('[data-bell-retry]')&&bell.getAttribute('aria-expanded')==='true'&&d.querySelector('#bellDrop').getAttribute('aria-busy')==='false');
  api.listNotifications=async()=>({notifications:[{id:'unit-note',title:'Fixture alert',createdAt:new Date().toISOString(),unread:true}],unread:1});
  d.querySelector('[data-bell-retry]').click();await tick();
  check('notification Retry replaces error with current records',/Fixture alert/.test(d.querySelector('#bellDrop').textContent)&&!d.querySelector('[data-bell-retry]'));
  let saves=0,finishSave;api.markAllNotificationsRead=()=>{saves++;return new Promise(r=>finishSave=r);};
  const mark=d.querySelector('#bellAll');mark.click();mark.click();
  check('mark-all-read prevents duplicate submits while saving',mark.disabled&&saves===1);
  finishSave();await tick();
  check('successful notification action collapses the panel with correct accessibility state',bell.getAttribute('aria-expanded')==='false'&&!d.querySelector('#bellDrop').classList.contains('on'));
  bell.click();await tick();d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  check('Escape dismisses notifications and returns keyboard focus',d.activeElement===bell&&bell.getAttribute('aria-expanded')==='false');
  bell.click();await tick();d.querySelector('#homeBody [data-task-focus]').click();
  check('navigating from a Home shortcut also dismisses notifications',bell.getAttribute('aria-expanded')==='false');
  let late;api.listNotifications=()=>new Promise(r=>late=r);bell.click();bell.click();late({notifications:[{title:'Stale bell response'}],unread:1});await tick();
  check('late closed-panel response cannot reopen or overwrite notifications',!/Stale bell response/.test(d.querySelector('#bellDrop').textContent)&&bell.getAttribute('aria-expanded')==='false');
  console.log('RESULT: ALL PASS ('+count+' checks)');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
