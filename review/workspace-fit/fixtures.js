/* REVIEW FRAME ONLY. Synthetic records; no production API client, auth tokens,
   credentials, provider access or live network operations. Never app-loaded. */
'use strict';
(() => {
  if (window.parent === window || window.location.href !== 'about:srcdoc') throw Error('Review fixtures require the isolated review frame');
  const now = new Date(), stamp = now.toISOString();
  const day = n => new Date(now.getTime() + n * 86400000).toISOString();
  const user = { id:'review-user', name:'KTM Energy Experts', email:'layout-review@example.test', role:'owner', roleLabel:'Owner', phone:'', title:'', profileCompleted:false };
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
  const read = {
    isAvailable:()=>true, health:()=>({ok:true}), currentUser:()=>user, me:()=>({user}),
    listProposals:()=>({proposals}),listTasks:()=>({tasks}),listActivity:()=>({activity}),
    reportSummary:()=>report,listNotifications:()=>({notifications:[],unread:0}),
    listGallery:()=>({items:[],gallery:[]}),listTeam:()=>({members:[user],users:[user]}),
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
    const badge=document.querySelector('.bi-mode');
    if(badge)badge.prepend(document.createTextNode('REVIEW FIXTURES · '));
  });
})();
