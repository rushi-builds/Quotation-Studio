/* Alert/connection governance only. No provider, credential or network operations. */
'use strict';
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./pulse-operations.js'):root.PulseOperations);if(typeof module==='object'&&module.exports)module.exports=api;else root.PulseGovernance=api;})(typeof window!=='undefined'?window:globalThis,function(O){
  const catalog=Object.freeze(['Instagram','LinkedIn','Website','WhatsApp','Gmail','Outlook','Google Calendar','Outlook Calendar','Google Sheets','Google Drive','Microsoft Teams','Slack','Telegram Business','Custom integration']);
  const roles=Object.freeze(['Owner','Admin','Member','Viewer']);
  const empty=()=>({connections:[],alerts:[],requests:[],audit:[],nextId:1});
  const state=data=>data.governance||empty();
  const manage=actor=>!!actor?.id&&['Owner','Admin'].includes(actor.role);
  function actorCheck(actor){if(!actor?.id||!roles.includes(actor.role))throw Error('Unrecognised access context');}
  const reason=text=>{text=String(text||'').trim();if(text.length<5||text.length>500)throw Error('Add a reason between 5 and 500 characters');return text;};
  function signature(data,row){
    const lead=data.leads.find(l=>l.id===row.leadId);
    // Do not include age-in-hours text: clocks advancing alone must not undo a dismissal.
    return JSON.stringify([row.id,row.kind,row.due,lead?.stage,lead?.stageChangedAt||null,lead?.owner||null,
      (data.tasks||[]).filter(t=>t.leadId===row.leadId).map(t=>[t.id,t.date,t.time,t.status,t.completedAt||null]).sort(),
      (data.calendar||[]).filter(c=>c.leadId===row.leadId).map(c=>[c.id,c.date,c.time]).sort()]);
  }
  function activeRecord(data,row,now){return [...state(data).alerts].reverse().find(a=>a.rowId===row.id&&a.signature===signature(data,row)&&a.status==='Hidden'&&(a.mode==='Dismissed'||Date.parse(a.until)>now));}
  function visible(data,now){return O.desk(data,now).filter(row=>!activeRecord(data,row,now));}
  function status(data,record,now){if(record.status==='Restored')return 'Restored';if(record.mode==='Snoozed'&&Date.parse(record.until)<=now)return 'Expired';const row=O.desk(data,now).find(r=>r.id===record.rowId);return !row?'Condition resolved':signature(data,row)!==record.signature?'Context changed':'Hidden';}
  function execute(data,actor,command,now=Date.now()){
    actorCheck(actor);if(!Number.isFinite(now))throw Error('Invalid operation time');
    const gov=JSON.parse(JSON.stringify(state(data))),iso=new Date(now).toISOString();
    const next=prefix=>prefix+'-'+gov.nextId++;
    const log=(action,detail,leadId=null)=>gov.audit.unshift({id:next('ga'),action,detail,leadId,actorId:actor.id,actor:actor.name||actor.id,role:actor.role,at:iso});
    const requireManager=()=>{if(!manage(actor))throw Error('Owner or Admin access required');};
    const signal=(id)=>{const row=O.desk(data,now).find(r=>r.id===id);if(!row)throw Error('This alert is no longer active; refresh before acting');return row;};
    const own=row=>actor.role==='Member'&&row.owner===actor.ownerName;
    const record=(row,mode,why,until)=>{const item={id:next('alert'),rowId:row.id,leadId:row.leadId,signature:signature(data,row),company:row.company,kind:row.kind,detail:row.detail,mode,reason:why,until:until||null,status:'Hidden',actor:actor.name||actor.id,role:actor.role,at:iso};gov.alerts.push(item);log('Alert '+mode.toLowerCase(),row.kind+' · '+why,row.leadId);return item;};
    let result;
    switch(command.type){
      case 'connections.add':{
        requireManager();if(!Array.isArray(command.items)||!command.items.length||command.items.length>12)throw Error('Choose 1–12 account preparations');
        if(gov.connections.filter(c=>!c.archived).length+command.items.length>40)throw Error('Maximum 40 additional active preparations');
        result=[];for(const input of command.items){
          const label=String(input.label||'').trim(),provider=input.provider;
          if(!catalog.includes(provider)||!label||label.length>100)throw Error('Choose a supported service and account label (up to 100 characters)');
          if(gov.connections.some(c=>!c.archived&&c.provider===provider&&c.label.toLowerCase()===label.toLowerCase()))throw Error('This service/account label is already prepared');
          const item={id:next('connection'),provider,label,cadence:'Manual',historyStart:'',purpose:'',archived:false,createdAt:iso,createdBy:actor.id};gov.connections.push(item);result.push(item);log('Connection preparation added',provider+' · '+label);
        }break;
      }
      case 'connections.edit':{
        requireManager();const item=gov.connections.find(c=>c.id===command.id&&!c.archived);if(!item)throw Error('Preparation unavailable');
        const label=String(command.label||'').trim(),purpose=String(command.purpose||'').trim(),cadence=command.cadence;
        if(!label||label.length>100||purpose.length>500||!['Manual','Hourly','Daily'].includes(cadence))throw Error('Invalid setup preferences');
        if(gov.connections.some(c=>c.id!==item.id&&!c.archived&&c.provider===item.provider&&c.label.toLowerCase()===label.toLowerCase()))throw Error('Duplicate account label');
        item.label=label;item.purpose=purpose;item.cadence=cadence;item.updatedAt=iso;log('Connection preferences updated',item.provider+' · '+label);result=item;break;
      }
      case 'connections.archive':case 'connections.restore':{
        requireManager();const item=gov.connections.find(c=>c.id===command.id);if(!item)throw Error('Preparation unavailable');
        const why=reason(command.reason),archived=command.type==='connections.archive';
        if(item.archived===archived)throw Error('Preparation already in that state');
        if(!archived&&gov.connections.some(c=>c.id!==item.id&&!c.archived&&c.provider===item.provider&&c.label.toLowerCase()===item.label.toLowerCase()))throw Error('An active preparation already uses this label');
        if(!archived&&gov.connections.filter(c=>!c.archived).length>=40)throw Error('Active preparation limit reached');
        item.archived=archived;log(archived?'Connection preparation archived':'Connection preparation restored',item.provider+' · '+why);result=item;break;
      }
      case 'alerts.dismiss':case 'alerts.snooze':case 'alerts.request':{
        const row=signal(command.rowId);if(command.signature!==signature(data,row))throw Error('Alert context changed; review the current occurrence');
        if(!manage(actor)&&!own(row))throw Error('Only your assigned alerts can be snoozed or submitted for review');
        if(command.type==='alerts.dismiss')requireManager();
        const why=reason(command.reason);if(activeRecord({...data,governance:gov},row,now))throw Error('This occurrence is already managed');
        if(command.type==='alerts.request'){
          if(!own(row))throw Error('Assigned team members submit review requests; Owner/Admin can dismiss directly');
          if(gov.requests.some(r=>r.status==='Pending'&&r.rowId===row.id&&r.signature===signature(data,row)))throw Error('A review request already exists for this occurrence');
          result={id:next('request'),rowId:row.id,leadId:row.leadId,signature:signature(data,row),company:row.company,kind:row.kind,reason:why,status:'Pending',actorId:actor.id,actor:actor.name||actor.id,at:iso};gov.requests.push(result);log('Dismissal review requested',row.kind+' · '+why,row.leadId);
        }else if(command.type==='alerts.snooze'){
          const until=Date.parse(command.until),limit=manage(actor)?30:1;
          if(!Number.isFinite(until)||until<=now||until>now+limit*86400000)throw Error('Snooze must be future and within '+limit+' day(s)');
          result=record(row,'Snoozed',why,new Date(until).toISOString());
        }else result=record(row,'Dismissed',why);
        break;
      }
      case 'alerts.restore':{
        requireManager();const item=gov.alerts.find(a=>a.id===command.id&&a.status==='Hidden');if(!item)throw Error('Managed alert unavailable');
        const why=reason(command.reason);item.status='Restored';item.restoredAt=iso;item.restoredBy=actor.id;log('Alert restored',item.kind+' · '+why,item.leadId);result=item;break;
      }
      case 'requests.approve':case 'requests.reject':{
        requireManager();const request=gov.requests.find(r=>r.id===command.id&&r.status==='Pending');if(!request)throw Error('Pending request unavailable');
        const why=reason(command.reason);
        if(command.type==='requests.approve'){const row=signal(request.rowId);if(signature(data,row)!==request.signature)throw Error('Requested occurrence changed; reject and review the fresh alert');if(activeRecord({...data,governance:gov},row,now))throw Error('Occurrence already managed');record(row,'Dismissed',why);}
        request.status=command.type==='requests.approve'?'Approved':'Rejected';request.reviewedAt=iso;request.reviewedBy=actor.id;request.reviewReason=why;log('Dismissal request '+request.status.toLowerCase(),request.kind+' · '+why,request.leadId);result=request;break;
      }
      default:throw Error('Unsupported governance operation');
    }
    // Atomic even in static mode: failures do not partially add a batch or append audit.
    data.governance=gov;return result;
  }
  return Object.freeze({catalog,roles,empty,state,manage,signature,activeRecord,visible,status,execute});
});
