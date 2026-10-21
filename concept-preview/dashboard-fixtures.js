/* Original Dashboard controller, safe in-memory API fixtures. No network/auth. */
'use strict';
(() => {
 const clone=x=>JSON.parse(JSON.stringify(x)), now=Date.now(), iso=(hours=0)=>new Date(now+hours*3600000).toISOString();
 const user={id:'demo-user',name:'Rushi Demo',email:'demo@example.invalid',role:'sales',roleLabel:'Sales',canWrite:true,canManageTeam:false,profileDone:true,createdAt:iso(-720)};
 let proposals=[
  {id:'demo-patil',customer:'Patil Residence · Sample',title:'Residential solar proposal',capacity:7,version:'2.0',status:'negotiation',ref:'DEMO/026/001',updatedAt:iso(-1),createdAt:iso(-72)},
  {id:'demo-anand',customer:'Anand Industries · Sample',title:'Industrial rooftop',capacity:100,version:'1.1',status:'sent',ref:'DEMO/026/002',updatedAt:iso(-3),createdAt:iso(-144)},
  {id:'demo-green',customer:'Green Meadows RWA · Sample',title:'Housing society solar',capacity:25,version:'1.0',status:'internal_review',ref:'DEMO/026/003',updatedAt:iso(-5),createdAt:iso(-120)},
  {id:'demo-shop',customer:'Westside Commercial · Sample',title:'Commercial rooftop',capacity:15,version:'1.0',status:'draft',ref:'DEMO/026/004',updatedAt:iso(-10),createdAt:iso(-48)},
  {id:'demo-villa',customer:'Hillview Home · Sample',title:'Residential solar',capacity:5,version:'2.0',status:'accepted',ref:'DEMO/026/005',updatedAt:iso(-24),createdAt:iso(-200)}
 ];
 let tasks=[
  {id:'task-1',proposalId:'demo-patil',title:'Discuss customer-requested scope changes · v2.0',notes:'Sample customer response: requested changes. Confirm roofing scope before issuing v2.1.',status:'open',dueAt:iso(-24),overdue:true,createdAt:iso(-48)},
  {id:'task-2',proposalId:'demo-anand',title:'Follow up on the shared industrial offer',notes:'Sample link-open event is not proof the full quotation was read.',status:'open',dueAt:iso(1),overdue:false,createdAt:iso(-48)},
  {id:'task-3',proposalId:'demo-green',title:'Confirm survey measurements and roof access',notes:'Site information remains customer-provided until measured.',status:'open',dueAt:iso(24),overdue:false,createdAt:iso(-24)}
 ];
 let notes=[{id:'note-1',proposalId:'demo-patil',title:'Sample customer requested scope changes · Revision 2.0',body:'Demo response only. Review scope and prepare a new revision; latest offer is not automatically accepted.',unread:true,createdAt:iso(-1)},{id:'note-2',proposalId:'demo-anand',title:'Sample quotation link opened',body:'An open is not proof of reading, acceptance or payment.',unread:true,createdAt:iso(-3)}];
 const activity=[{id:'event-1',proposalId:'demo-patil',proposalTitle:'Patil Residence · Sample response: changes requested on v2.0',type:'Customer requested changes · sample',createdAt:iso(-1)},{id:'event-2',proposalId:'demo-anand',proposalTitle:'Anand Industries · Sample',type:'link_opened',createdAt:iso(-3)},{id:'event-3',proposalId:'demo-green',proposalTitle:'Green Meadows RWA · Sample',type:'survey_requested',createdAt:iso(-5)},{id:'event-4',proposalId:'demo-patil',proposalTitle:'Patil Residence · Sample',type:'version_published',createdAt:iso(-24)}];
 const report=()=>{const byStatus={};proposals.forEach(p=>byStatus[p.status]=(byStatus[p.status]||0)+1);return {proposals:{total:proposals.length,accepted:byStatus.accepted||0,byStatus},value:{quotedSum:7250000,proposalsWithValue:5,proposalsMissingValue:0},engagement:{versionsPublished:7,activeCustomerLinks:3,linkOpens:2,surveyRequests:1,pdfDownloadRequests:0,suspectedPrefetches:0},honesty:['All records and values are illustrative sample data.','Quoted value is not revenue or collected payment.','Sample customer responses do not prove identity or authorise an order.']};};
 const api={
  isAvailable:async()=>true,currentUser:async()=>clone(user),me:async()=>({user:clone(user)}),
  listProposals:async()=>({proposals:clone(proposals)}),
  listTasks:async()=>({tasks:clone(tasks)}),
  listActivity:async()=>({activity:clone(activity)}),
  listNotifications:async()=>({notifications:clone(notes),unread:notes.filter(n=>n.unread).length}),
  reportSummary:async()=>clone(report()),
  updateTask:async(id,data)=>{const task=tasks.find(t=>t.id===id);if(!task)throw Error('Sample task not found');Object.assign(task,data);return {task:clone(task)};},
  createTask:async data=>{const task={...clone(data),id:'task-'+Date.now(),status:'open',overdue:false,createdAt:iso()};tasks.push(task);return {task:clone(task)};},
  deleteTask:async id=>{tasks=tasks.filter(t=>t.id!==id);return {ok:true};},
  markNotificationRead:async id=>{const n=notes.find(n=>n.id===id);if(n)n.unread=false;return {ok:true};},
  markAllNotificationsRead:async()=>{notes.forEach(n=>n.unread=false);return {ok:true};},
  updateProposal:async(id,data)=>{const p=proposals.find(p=>p.id===id);if(p)Object.assign(p,data);return {proposal:clone(p)};},
  deleteProposal:async id=>{proposals=proposals.filter(p=>p.id!==id);return {ok:true};},
  duplicateProposal:async id=>{const p=clone(proposals.find(p=>p.id===id));p.id+='-copy';p.customer+=' (copy)';p.status='draft';proposals.push(p);return {proposal:p};},
  listVersions:async()=>({versions:[{id:'sample-version',versionLabel:'2.0',createdAt:iso(-24),note:'Illustrative published revision'}]}),
  listLinks:async()=>({links:[]}),listEvents:async()=>({events:clone(activity)}),
  listSends:async()=>({sends:[]}),sendPreview:async()=>({proposal:clone(proposals[0]),warnings:['Sample preview only; sending is disabled.']}),
  listGallery:async()=>({items:[]}),listTeam:async()=>({members:[clone(user)]}),
  health:async()=>({ok:true,storage:'preview-memory',codeVersion:'dashboard-demo'}),
  summary:async()=>({}),logout:async()=>({ok:true})
 };
 window.PlatformAPI=new Proxy(api,{get:(target,key)=>key in target?target[key]:async()=>{throw Error('This action is not enabled in the sample Dashboard. No live changes were made.');}});
 window.__dashboardDemo=true;
 document.addEventListener('click',e=>{
  const target=e.target.closest('[data-act="open"],[data-open],[data-open-activity],#btnNewFromHome,#btnNewProposal,a.studio-link');
  if(target){e.preventDefault();e.stopImmediatePropagation();location.href=new URL('concept-preview/studio.html',document.baseURI).href;return;}
  if(e.target.closest('#btnLogout')){e.preventDefault();e.stopImmediatePropagation();window.QSDash?.toast('Sample workspace—no real login session to sign out.');}
  if(e.target.closest('#dashboardDemoReset'))location.reload();
 },true);
 document.addEventListener('DOMContentLoaded',()=>{
  const parent=document.querySelector('#panel-home .solar-hero');
  if(parent){const note=document.createElement('div');note.className='dashboard-preview-summary';note.innerHTML='<strong>Sample customer response:</strong> Patil Residence requested changes to Revision 2.0.<small>Next action: review the roofing scope → prepare a revised offer. A follow-up is already listed below. This is an illustrative record, not a real customer response.</small>';parent.after(note);}
 });
})();
