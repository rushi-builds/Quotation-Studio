/* Pure reporting/readiness logic. No network, credentials, storage or delivery. */
'use strict';
(function(root, factory) {
  const engine=factory();
  if(typeof module==='object'&&module.exports)module.exports=engine;
  else root.BusinessEngine=engine;
})(typeof window!=='undefined'?window:globalThis, function() {
  const DAY=86400000;
  const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const shift=(date,n)=>day(Date.parse(date+'T12:00:00+05:30')+n*DAY);
  const inside=(date,range)=>!!date&&String(date).slice(0,10)>=range.start&&String(date).slice(0,10)<=range.end;
  function dates(range){const out=[];for(let d=range.start;d<=range.end;d=shift(d,1)){out.push(d);if(out.length>3700)throw Error('Range too long');}return out;}
  function period(key,today){
    const [y,m]=today.split('-').map(Number),month=n=>day(Date.UTC(y,m-1+n,1,6));
    if(key==='today')return {start:today,end:today};
    if(key==='7d')return {start:shift(today,-6),end:today};
    if(key==='30d')return {start:shift(today,-29),end:today};
    if(key==='month')return {start:month(0),end:today};
    if(key==='lastmonth')return {start:month(-1),end:shift(month(0),-1)};
    return {start:month(-5),end:today};
  }
  function previous(range){const length=dates(range).length;return {start:shift(range.start,-length),end:shift(range.start,-1)};}
  function aggregate(leads, range, grain='month',source='all'){
    const selected=leads.filter(l=>source==='all'||l.source===source),map=new Map();
    dates(range).forEach(d=>{const key=grain==='day'?d:grain==='year'?d.slice(0,4):d.slice(0,7);if(!map.has(key))map.set(key,{key,leads:0,quotes:0,won:0});});
    for(const l of selected)for(const [field,metric] of [['created','leads'],['quoteAt','quotes'],['wonAt','won']])if(inside(l[field],range))map.get(grain==='day'?l[field].slice(0,10):grain==='year'?l[field].slice(0,4):l[field].slice(0,7))[metric]++;
    return [...map.values()];
  }
  function summary(leads,range){return aggregate(leads,range).reduce((a,b)=>({leads:a.leads+b.leads,quotes:a.quotes+b.quotes,won:a.won+b.won}),{leads:0,quotes:0,won:0});}
  function sources(leads,range){const map=new Map();for(const l of leads.filter(l=>inside(l.created,range)))map.set(l.source,(map.get(l.source)||0)+1);return [...map].map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);}
  function metric(rows,provider,key,range,grain='day'){
    const points=dates(range).map(date=>{const row=rows.find(r=>r.provider===provider&&r.date===date);return {date,value:Number.isFinite(row?.[key])?row[key]:null};});
    const groups=new Map();for(const p of points){const bucket=grain==='day'?p.date:grain==='year'?p.date.slice(0,4):p.date.slice(0,7);if(!groups.has(bucket))groups.set(bucket,{key:bucket,value:0,covered:0,expected:0});const g=groups.get(bucket);g.expected++;if(p.value!==null){g.value+=p.value;g.covered++;}}
    const series=[...groups.values()].map(g=>({...g,value:g.covered?g.value:null})),covered=points.filter(p=>p.value!==null).length;
    return {value:covered?points.reduce((n,p)=>n+(p.value??0),0):null,covered,expected:points.length,series};
  }
  function followups(tasks,today){return tasks.filter(t=>t.status==='open'&&t.date<=today).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));}
  function pending(threads){return threads.filter(t=>t.waiting==='Team'&&!t.handled);}
  function csvCell(value){let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
  function csv(rows){return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');}
  function dryRun(rule,leads,tasks,threads,today,now=Date.now()){
    if(!['New lead','Overdue follow-up','Awaiting team reply'].includes(rule.trigger))throw Error('Unsupported rule trigger');
    if(!['Create internal follow-up','Notify owner','WhatsApp follow-up','Email follow-up'].includes(rule.action))throw Error('Unsupported rule action');
    let ids=rule.trigger==='New lead'?leads.filter(l=>l.created===today).map(l=>l.id):rule.trigger==='Overdue follow-up'?tasks.filter(t=>t.status==='open'&&(t.date<today||(t.date===today&&Date.parse(t.date+'T'+(t.time||'23:59')+':00+05:30')<now))).map(t=>t.leadId):pending(threads).filter(t=>!rule.channel||rule.channel==='Any channel'||t.provider===rule.channel).map(t=>t.leadId);
    return [...new Set(ids)].map(id=>leads.find(l=>l.id===id)).filter(l=>l&&(rule.source==='All sources'||l.source===rule.source)).map(l=>({leadId:l.id,company:l.company,action:rule.action,key:rule.id+':'+l.id+':'+today,blockedBy:/WhatsApp|Email/.test(rule.action)?['Sender not connected','Outreach permission not verified']:['Draft rule; no executor installed']}));
  }
  // Provider snapshots: idempotent upsert; late revisions replace, stale retries do not.
  function ingest(existing,incoming){const map=new Map(existing.map(r=>[r.provider+'|'+r.account+'|'+r.date+'|'+r.metric,r]));let changed=0,ignored=0;
    for(const row of incoming){if(!row.provider||!row.account||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(Date.parse(row.date+'T12:00:00+05:30'))||day(row.date+'T12:00:00+05:30')!==row.date||!row.metric||!(row.value===null||(Number.isFinite(row.value)&&row.value>=0))||!Number.isFinite(Date.parse(row.observedAt)))throw Error('Invalid snapshot');
      const key=row.provider+'|'+row.account+'|'+row.date+'|'+row.metric,old=map.get(key);if(old&&Date.parse(old.observedAt)>=Date.parse(row.observedAt)){ignored++;continue;}map.set(key,{...row});changed++;}
    return {rows:[...map.values()],changed,ignored};
  }
  function receipt(current,next){const rank={accepted:0,sent:1,delivered:2,read:3};if(next==='failed')return current==='delivered'||current==='read'?current:'failed';if(!(next in rank))return current;if(current==='failed')return current;return (rank[next]??-1)>(rank[current]??-1)?next:current;}
  return Object.freeze({day,shift,inside,dates,period,previous,aggregate,summary,sources,metric,followups,pending,csv,dryRun,ingest,receipt});
});
