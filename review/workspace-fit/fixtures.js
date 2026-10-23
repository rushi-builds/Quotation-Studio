/* REVIEW FRAME ONLY. Synthetic records; no production API client, auth tokens,
   credentials, provider access or live network operations. Never app-loaded. */
'use strict';
(() => {
  if (window.parent === window || window.location.href !== 'about:srcdoc') throw Error('Review fixtures require the isolated review frame');
  const now = new Date(), stamp = now.toISOString();
  const reviewParams=new URLSearchParams(window.parent.location.search);
  const reviewRole=['member','pending'].includes(reviewParams.get('role'))?reviewParams.get('role'):'owner';
  const owner=reviewRole==='owner',approved=reviewRole!=='pending';
  const day = n => new Date(now.getTime() + n * 86400000).toISOString();
  const user = { id:'review-user', name:'KTM Energy Experts', email:'layout-review@example.test', role:'owner', roleLabel:'Owner', phone:'', title:'', profileCompleted:false };
  if(!owner)Object.assign(user,{id:'review-member',name:'Riya Sharma',role:'viewer',roleLabel:'Team member',canWrite:false,canManageTeam:false});
  const proposals = [
    {id:'review-1',customer:'Sample Industries',ref:'DEMO-001',capacity:250,status:'sent',createdAt:day(-3),updatedAt:stamp},
    {id:'review-2',customer:'Sample Factory',ref:'DEMO-002',capacity:100,status:'negotiation',createdAt:day(-2),updatedAt:day(-1)},
    {id:'review-3',customer:'Sample Society',ref:'DEMO-003',capacity:40,status:'draft',createdAt:day(-1),updatedAt:day(-1)}
  ];
  const tasks = [
    {id:'review-task-1',proposalId:'review-1',title:'Site survey call',status:'open',dueAt:day(-1),overdue:true},
    {id:'review-task-2',proposalId:'review-2',title:'Discuss proposal',status:'open',dueAt:stamp,overdue:false}
  ];
  const activity = [
    {id:'review-event-1',proposalId:'review-1',proposalTitle:'Sample Industries',type:'version_published',createdAt:stamp},
    {id:'review-event-2',proposalId:'review-2',proposalTitle:'Sample Factory',type:'link_opened',createdAt:day(-1)},
    {id:'review-event-3',proposalId:'review-1',proposalTitle:'Sample Industries',type:'survey_requested',createdAt:day(-3)}
  ];
  const report = {proposals:{total:3,byStatus:{sent:1,negotiation:1,draft:1}},value:{quotedSum:12150000,proposalsWithValue:2},tasks:{open:2,overdue:1,dueToday:1},followUps:{openTasks:2,overdueTasks:1,dueToday:1},engagement:{linkOpens:1,versionsPublished:1,surveyRequests:1,pdfDownloadRequests:0}};
  const workspacePermissions={member:'Company membership','metrics.read':'Company metrics','finance.read':'Company quoted-value reports','pricing.read':'Own quotation pricing and snapshots','followups.read':'Shared company follow-ups'};
  const permissionLabels={...workspacePermissions,'inbox.read':'Read conversations','messages.send':'Send replies','calendar.read':'Read calendar','calendar.write':'Create calendar events','connection.manage':'Manage account preparation'};
  const providers={gmail:['inbox.read','messages.send','connection.manage'],outlook:['inbox.read','messages.send','connection.manage'],whatsapp:['inbox.read','messages.send','connection.manage'],instagram:['metrics.read','connection.manage'],linkedin:['metrics.read','connection.manage'],website:['metrics.read','connection.manage'],'google-calendar':['calendar.read','calendar.write','connection.manage'],'outlook-calendar':['calendar.read','calendar.write','connection.manage']};
  const financeAllowed=owner||approved&&reviewParams.get('finance')==='granted';
  const connections=approved?[
    {id:'sample-outlook',label:'KTM Sales',provider:'outlook',scope:'company'},
    {id:'sample-instagram',label:'KTM Instagram',provider:'instagram',scope:'company'},
    {id:'sample-linkedin',label:'KTM LinkedIn',provider:'linkedin',scope:'company'}
  ].map(c=>({...c,ownerId:'review-user',archived:false,status:'not_connected',canShare:owner,canManage:owner,permissions:Object.fromEntries(providers[c.provider].map(p=>[p,owner||p==='metrics.read']))})):[];
  const access={revision:1,readOnlyReview:true,self:{id:user.id,manager:owner,member:approved},permissions:{member:approved,'metrics.read':approved,'finance.read':financeAllowed,'pricing.read':owner,'followups.read':owner},connections,
    requests:owner?[{id:'sample-request',userId:'review-member',userName:'Riya Sharma',resource:'workspace',resourceLabel:'KTM workspace',permission:'finance.read',reason:'Review company quotation totals for the monthly report. Sample request only.',status:'pending',createdAt:stamp,expiresAt:day(7)}]:[],
    pendingReviews:owner?1:0,grants:[],audit:[],users:[{id:'review-user',name:'KTM Energy Experts'},{id:'review-member',name:'Riya Sharma'}],workspacePermissions,permissionLabels,providers,providerAdaptersReady:false};
  if(!owner){report.value=null;report.pricingRestricted=true;}
  const read = {
    isAvailable:()=>true, health:()=>({ok:true}), currentUser:()=>user, me:()=>({user}),
    listProposals:()=>({proposals}),listTasks:()=>({tasks}),listActivity:()=>({activity}),
    reportSummary:()=>report,listNotifications:()=>({notifications:[],unread:0}),
    listGallery:()=>({items:[],gallery:[]}),listTeam:()=>({members:[user],users:[user]}),
    workspaceAccess:()=>access,workspacePulse:()=>({metrics:{quotations:3,accepted:0,openFollowups:2,overdueFollowups:1},channels:connections.filter(c=>c.provider==='instagram'||c.provider==='linkedin').map(c=>({...c,metrics:null})),financeAllowed,followupsAllowed:owner}),workspaceFinance:()=>({quotedSum:12150000,proposalsWithValue:2,proposalsMissingValue:1}),workspaceFollowups:()=>({tasks,readOnly:true}),
    listConnections:()=>({connections:[]}),assistantStatus:()=>({enabled:false,available:false}),
    listVersions:()=>({versions:[]}),listLinks:()=>({links:[]}),listEvents:()=>({events:[]}),listSends:()=>({sends:[]}),
    sendPreview:id=>({proposal:proposals.find(p=>p.id===id),defaultRecipientName:proposals.find(p=>p.id===id)?.customer||'',defaultEmail:'',defaultWhatsApp:''}),
    getProposal:id=>({proposal:proposals.find(p=>p.id===id)}),summary:()=>report
  };
  const blocked = () => Promise.reject(new Error('Visual review only — saving, sending and account changes are disabled.'));
  window.PlatformAPI = new Proxy({}, {get:(_,key)=>key==='then'?undefined:key in read ? (...args)=>Promise.resolve(structuredClone(read[key](...args))) : blocked});
  // Defence in depth: even a future controller's direct fetch cannot reach a
  // live API from this frame. Static assets remain same-origin GET-only.
  const originalFetch=window.fetch.bind(window);
  window.fetch=(input,init={})=>{
    const url=new URL(typeof input==='string'?input:input.url,document.baseURI);
    const method=String(init.method || input.method || 'GET').toUpperCase();
    if(url.origin!==new URL(document.baseURI).origin || /^\/(api|auth)(\/|$)/.test(url.pathname) || method!=='GET') return blocked();
    return originalFetch(input,init);
  };
  XMLHttpRequest.prototype.open=function(){throw Error('Network workflows disabled in visual review');};
  navigator.sendBeacon=()=>false;
  // Do not let builder / account / download links escape into real workflows.
  document.addEventListener('click',event=>{
    const a=event.target.closest('a');
    if(a && !String(a.getAttribute('href')||'').startsWith('#')){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  window.addEventListener('load',()=>{
    const panel=new URLSearchParams(window.parent.location.search).get('panel');
    if(panel==='sales')window.QSDash?.show('sales');
    if(panel==='access')window.QSDash?.showSettings('connections',true);
    const badge=document.querySelector('.bi-mode');
    if(badge)badge.prepend(document.createTextNode('REVIEW FIXTURES · '));
  });
})();
