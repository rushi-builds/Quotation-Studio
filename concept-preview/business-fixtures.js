/* Synthetic business history. Never loaded from a real company/account. */
'use strict';
(() => {
  const E=BusinessEngine,today=E.day(Date.now()),range=E.period('6m',today),leads=[],daily=[],posts=[],acquisition=[];
  const sources=['Website / SEO','Referral','Instagram','Website / SEO','LinkedIn','WhatsApp','Referral','Cold call','Unknown'];
  const services=['Rooftop solar','Leak Proof roof','Solar carport','Battery storage','Energy monitoring','DG coordination'];
  const names=['Aster Components','Meridian Foods','North Court Society','Cedar Engineering','Vertex Logistics','Parkside Retail','Juniper Housing','Orion Manufacturing'];
  let month=range.start.slice(0,7),index=0;
  while(month<=today.slice(0,7)){
    const [y,m]=month.split('-').map(Number),last=E.day(Date.UTC(y,m,0,6)),limit=month===today.slice(0,7)?Math.max(1,Number(today.slice(-2))-1):Number(last.slice(-2)),count=9+index*3;
    for(let i=0;i<count;i++){
      const created=month+'-'+String(1+(i*3)%limit).padStart(2,'0'),q=E.shift(created,2),w=E.shift(created,10),kind=i%7;
      const stage=kind===0&&w<=today?'Won':kind===1?'Lost':kind===2?'Survey':kind===3?'New':kind===4?'Contacted':kind===5?'Quotation':'Negotiation';
      leads.push({id:'biz-'+index+'-'+i,company:names[i%names.length]+' '+(index+1)+'-'+(i+1)+' · Sample',name:'Demo contact '+(index+1)+'-'+(i+1),source:sources[(i+index)%sources.length],service:services[i%services.length],stage,owner:i%3?'Sales':'Rushi · Demo',created,quoteAt:(['Quotation','Negotiation','Won','Lost'].includes(stage)&&q<=today)?q:null,wonAt:stage==='Won'?w:null,notes:['Illustrative CRM record; no live business data.'],email:'',phone:'',consent:'Not recorded'});
    }
    month=E.day(Date.UTC(y,m,1,6)).slice(0,7);index++;
  }
  const current=[['Cedar Foods','Website / SEO','Negotiation'],['Orion Cold Store','Referral','Quotation'],['Juniper Dairy','LinkedIn','Survey'],['Aster Industries','Instagram','New']].map(([company,source,stage],i)=>({id:'biz-focus-'+i,company:company+' · Sample',name:'Demo contact '+(i+1),source,service:services[i],stage,owner:i%2?'Sales':'Rushi · Demo',created:i===3?today:E.shift(today,-4-i),quoteAt:i<2?E.shift(today,-1):null,wonAt:null,notes:['Sample active business conversation.'],email:'',phone:'',consent:'Not recorded'}));
  leads.unshift(...current);
  let i=0;for(let date=range.start;date<today;date=E.shift(date,1),i++){
    const uplift=1+Math.floor(i/30)*.17,base=Math.round((320+(i*37)%440)*uplift);
    if(date>=E.shift(today,-89)&&date<=E.shift(today,-2))daily.push({provider:'Instagram',date,views:base*3,clicks:Math.floor(base/23),interactions:Math.floor(base/8)});
    if(i%43!==8)daily.push({provider:'LinkedIn',date,impressions:base*2,clicks:Math.floor(base/19),interactions:Math.floor(base/11)});
    if(i%47!==9){
      const sessions=Math.floor(base/7),split=[['Google / organic',Math.floor(sessions*.4)],['Instagram / social',Math.floor(sessions*.15)],['LinkedIn / social',Math.floor(sessions*.1)],['Direct / (none)',Math.floor(sessions*.2)]];
      split.push(['Unknown / unassigned',sessions-split.reduce((n,r)=>n+r[1],0)]);
      split.forEach(([source,count])=>acquisition.push({date,source,sessions:count}));
      daily.push({provider:'Website',date,sessions,forms:Math.floor(base/110),clicks:Math.floor(base/25)});
    }
  }
  for(let j=0;j<8;j++)posts.push({id:'tracked-post-'+j,provider:j%2?'LinkedIn':'Instagram',title:['Rooftop planning checklist','A facility energy conversation','Roof drainage: the questions to ask','Carport planning basics'][j%4],format:j%2?'Company post':'Reel',published:E.shift(today,-3-j*8),snapshotAt:E.shift(today,-1),views:820+j*630,interactions:24+j*11,clicks:j*5+8});
  const tasks=current.map((l,i)=>({id:'biz-task-'+i,leadId:l.id,title:['Confirm the project scope','Review the revised offer','Confirm site access','Qualify the new enquiry'][i],type:['Call','Quote revision','Site visit','Discovery'][i],date:today,time:['11:00','14:30','16:00','17:30'][i],owner:l.owner,status:'open'}));
  tasks.push({id:'biz-task-overdue',leadId:leads[8].id,title:'Agree a discovery call window',type:'Call',date:E.shift(today,-2),time:'12:00',owner:'Sales',status:'open'});
  const threads=current.map((l,i)=>({id:'biz-thread-'+i,leadId:l.id,provider:['WhatsApp','Outlook','Gmail','WhatsApp'][i],subject:['Scope clarification','Revised offer discussion','Site access details','New enquiry'][i],owner:l.owner,waiting:i===2?'Customer':'Team',handled:false,receivedAt:E.shift(today,i===0?-2:0)+'T09:10:00+05:30',messages:[{direction:'in',time:E.shift(today,-2)+'T09:10:00+05:30',text:'Sample message: could we discuss the site requirements and next steps?',status:'Received'},{direction:'out',time:E.shift(today,-1)+'T11:30:00+05:30',text:'Sample reply: we can review the project requirements after confirming site details.',status:i%2?'Sent':'Delivered'},{direction:'in',time:E.shift(today,i===0?-2:0)+'T09:10:00+05:30',text:'Sample inbound: please confirm the next discussion window.',status:'Received'}],notes:[]}));
  // Keep example thread ordering internally consistent. Last inbound determines waiting state.
  threads.forEach(t=>{t.messages[0].time=E.shift(today,-4)+'T09:10:00+05:30';t.messages[1].time=E.shift(today,-3)+'T11:30:00+05:30';if(t.waiting==='Customer'){t.messages.pop();t.receivedAt=t.messages[0].time;}});
  const events=[{id:'biz-event-1',date:today,time:'10:30',text:'A new website enquiry was recorded',kind:'Lead',leadId:current[0].id},{id:'biz-event-2',date:E.shift(today,-1),time:'15:20',text:'A quotation issue was recorded in the sample CRM',kind:'Quotation',leadId:current[1].id},{id:'biz-event-3',date:E.shift(today,-1),time:'11:10',text:'A survey follow-up was assigned',kind:'Follow-up',leadId:current[2].id}];
  const calendar=[{id:'cal-1',leadId:current[2].id,title:'Site access discussion',date:today,time:'16:00',owner:'Rushi · Demo'},{id:'cal-2',leadId:current[0].id,title:'Project discovery call',date:E.shift(today,1),time:'11:30',owner:'Sales'},{id:'cal-3',leadId:current[1].id,title:'Scope review',date:E.shift(today,2),time:'14:00',owner:'Sales'}];
  const rules=[{id:'rule-1',name:'Assign every new enquiry',trigger:'New lead',source:'All sources',action:'Create internal follow-up',owner:'Sales',status:'Draft'},{id:'rule-2',name:'Catch overdue conversations',trigger:'Overdue follow-up',source:'All sources',action:'Notify owner',owner:'Sales',status:'Draft'},{id:'rule-3',name:'Unanswered WhatsApp enquiries',trigger:'Awaiting team reply',source:'All sources',channel:'WhatsApp',action:'WhatsApp follow-up',owner:'Sales',status:'Draft'}];
  window.BusinessFixtures=Object.freeze({create:()=>JSON.parse(JSON.stringify({today,range,leads,daily,posts,acquisition,tasks,threads,events,calendar,rules}))});
})();
