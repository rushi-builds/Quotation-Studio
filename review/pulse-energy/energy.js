/* Isolated, session-only design prototype. All records and charts are explicitly demo data.
   No APIs, authentication, storage, provider actions, or production code are used. */
'use strict';
(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const paths = {
    home:'<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',
    file:'<path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8M8 16h6"/>',
    check:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>',
    activity:'<path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/>',
    send:'<path d="m3 10 18-7-7 18-3-8zM11 13 21 3"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="2"/><path d="m3 18 5-5 4 3 4-7 5 9"/>',
    pulse:'<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    bell:'<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4"/>',
    chevron:'<path d="m9 5 7 7-7 7"/>', chevronLeft:'<path d="m15 5-7 7 7 7"/>', chevronDown:'<path d="m5 9 7 7 7-7"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    money:'<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.1m11.8 0h.1"/>',
    trophy:'<path d="M7 3h10v8a5 5 0 0 1-10 0zM7 5H3v4a4 4 0 0 0 4 4m10-8h4v4a4 4 0 0 1-4 4M12 16v5m-4 0h8"/>',
    chart:'<path d="M3 3v18h18M7 15l5-7 4 4 5-8"/>',
    pie:'<path d="M12 3a9 9 0 1 0 9 9h-9zM15 3.5V9h5.5A9 9 0 0 0 15 3.5Z"/>',
    inbox:'<path d="M5 4h14l3 12v5H2v-5zM2 15h6l2 3h4l2-3h6"/>',
    bolt:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
    channels:'<rect x="3" y="3" width="14" height="14" rx="3"/><path d="M7 21h14V7M7 8h6M7 12h4"/>',
    flag:'<path d="M5 21V3c5-4 9 4 14 0v11c-5 4-9-4-14 0"/>',
    list:'<path d="M9 6h12M9 12h12M9 18h12M3 6h.1M3 12h.1M3 18h.1"/>',
    shield:'<path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7z"/><path d="m8 12 3 3 5-5"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>', plus:'<path d="M12 4v16M4 12h16"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>',
    message:'<path d="M4 3h16v13H10l-6 5zM8 8h8M8 12h5"/>',
    layers:'<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.layers}</svg>`;
  $$('[data-icon]').forEach(el => {el.innerHTML = icon(el.dataset.icon);});
  const tabs = [
    ['overview','Overview','home','Your business at a glance'],
    ['desk','Action desk','list','Focus on your next move'],
    ['leads','Leads & pipeline','send','Good relationships start here'],
    ['performance','Performance','activity','The bigger picture, made clear'],
    ['communications','Communications','message','Every conversation, in context'],
    ['automations','Automations','bolt','A little less busywork'],
    ['channels','Channel status','channels','Your channels, at a glance']
  ];
  const query = new URLSearchParams(location.search);
  const initialMonth = /^202[5-7]-(0[1-9]|1[0-2])$/.test(query.get('month') || '') ? query.get('month') : '2026-10';
  const [initialYear, initialIndex] = initialMonth.split('-').map(Number);
  const state = {view:tabs.some(t => t[0] === query.get('view')) ? query.get('view') : 'overview', year:initialYear, month:initialIndex-1, day:23, chart:'quotes', filter:'All', inbox:'Gmail'};
  const colours = ['#8eaddb','#e9b35c','#82b7a7','#b7a2d6'];
  const number = new Intl.NumberFormat('en-IN');
  const money = value => value >= 10000000 ? `₹${(value/10000000).toFixed(2)} Cr` : value >= 100000 ? `₹${(value/100000).toFixed(1)} L` : `₹${number.format(value)}`;
  const monthTitle = () => new Date(state.year,state.month,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
  const monthKey = () => `${state.year}-${String(state.month+1).padStart(2,'0')}`;
  const dateTitle = day => new Date(state.year,state.month,day).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
  const daysInMonth = () => new Date(state.year,state.month+1,0).getDate();
  // Deterministic sample series: shared by calendar, metrics, and charts. Never real business measurements.
  function dailyData() {
    return Array.from({length:daysInMonth()}, (_,i) => {
      const day = i+1;
      const sunday = new Date(state.year,state.month,day).getDay() === 0;
      const rhythm=[0,1,1,1,0,1,0,1,1,1,0,1,1,0,1,2,2,2,2,2,0,2,2,1,2,2,2,0,3,3,2];
      const quotes = sunday ? 0 : rhythm[i] + (state.month%3 === 2 && day%6===0 ? 1 : 0);
      return {day,quotes,leads:sunday ? 1 : 2+(day+state.month)%5,won:quotes && day%5 === 0 ? 1 : 0,value:quotes * [84000,126000,198000][(day+state.month)%3]};
    });
  }
  function totals() {return dailyData().reduce((a,d) => ({quotes:a.quotes+d.quotes,leads:a.leads+d.leads,won:a.won+d.won,value:a.value+d.value}),{quotes:0,leads:0,won:0,value:0});}
  const tasks = [
    {id:1,title:'Share the revised quotation',context:'Residential rooftop · 6 kW',filter:'Overdue',type:'Quotation',tone:'amber',day:21,done:false},
    {id:2,title:'Confirm the site survey',context:'Commercial enquiry · 25 kW',filter:'No next step',type:'Site visit',tone:'green',day:23,done:false},
    {id:3,title:'Follow up on the proposal',context:'Housing society · 40 kW',filter:'Unanswered',type:'Follow-up',tone:'purple',day:23,done:false},
    {id:4,title:'Assign an enquiry owner',context:'Residential rooftop · 8 kW',filter:'No owner',type:'New lead',tone:'gray',day:24,done:false},
    {id:5,title:'Review the open opportunity',context:'Industrial rooftop · 60 kW',filter:'Stalled',type:'Review',tone:'amber',day:26,done:false}
  ];
  function eventsForDay(day) {
    const data = dailyData()[day-1];
    if (!data) return [];
    const sunday = new Date(state.year,state.month,day).getDay() === 0;
    const items = sunday ? [] : [
      {title:data.quotes ? 'Quotation prepared' : 'Site survey scheduled',context:data.quotes ? 'Residential rooftop · 6 kW' : 'Commercial enquiry · 25 kW',time:'10:30',icon:data.quotes ? 'file' : 'calendar',color:colours[0]},
      {title:'Customer follow-up',context:'Proposal review · next steps',time:'14:00',icon:'message',color:colours[2]}
    ];
    if (data.won) items.push({title:'Quotation marked won',context:'Demo quotation · status update',time:'16:15',icon:'trophy',color:colours[1]});
    if (!sunday && day%4 === 0) items.push({title:'New enquiry recorded',context:'Website enquiry · rooftop solar',time:'16:45',icon:'users',color:colours[3]});
    tasks.filter(t => t.custom && t.day === day && t.month === monthKey()).forEach(t => items.push({title:t.title,context:'Session-only demo action',time:'17:00',icon:'check',color:colours[2]}));
    return items;
  }
  const panelHead = (title, name, action = '') => `<div class="panel-head"><h2><i>${icon(name)}</i>${title}</h2>${action}</div>`;
  const viewLink = (view,label='View all') => `<button class="text-link" data-view="${view}">${label}${icon('arrow')}</button>`;
  const tag = (text,tone='gray') => `<span class="tag ${tone}">${escape(text)}</span>`;
  const empty = title => `<div class="quiet-empty">${icon('check')}${escape(title)}</div>`;
  const sourceData = () => {
    const total=totals().leads, one=Math.round(total*.39),two=Math.round(total*.28),three=Math.round(total*.20);
    return [['Website',one,colours[0]],['Referrals',two,colours[1]],['Instagram',three,colours[2]],['Other',total-one-two-three,colours[3]]];
  };
  function spark(values) {
    const max=Math.max(...values,1);
    return `<svg viewBox="0 0 60 24" fill="none" aria-hidden="true"><path d="${values.map((v,i)=>`${i?'L':'M'}${i*60/(values.length-1)} ${22-v/max*18}`).join(' ')}" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  function renderMetrics() {
    const metricRoot=$('#metricCards');
    metricRoot.hidden=['communications','automations','channels'].includes(state.view);
    if(metricRoot.hidden){metricRoot.innerHTML='';return;}
    const total=totals(),daily=dailyData();
    let cards=[['Quotations',number.format(total.quotes),'Prepared this month','file','quotes',colours[0],'#eaf1fc','leads'],['Quoted value',money(total.value),'Not booked revenue','money','value',colours[1],'#fdf2e1','performance'],['Open follow-ups',tasks.filter(t=>!t.done&&(!t.custom||t.month===monthKey())).length,'Demo action queue','clock','leads',colours[2],'#e9f5f0','desk'],['Won quotations',total.won,'Recorded demo status','trophy','won',colours[3],'#f0ebf8','performance']];
    if(state.view==='desk') {
      const pending=tasks.filter(t=>!t.done&&(!t.custom||t.month===monthKey()));
      const count=filter=>pending.filter(t=>t.filter===filter).length;
      cards=[['Open actions',pending.length,'A clear next move','list',null,colours[0],'#eaf1fc','desk','All'],['Overdue',count('Overdue'),'Needs your attention','flag',null,colours[1],'#fdf2e1','desk','Overdue'],['Unassigned',count('No owner'),'A little ownership','users',null,colours[3],'#f0ebf8','desk','No owner'],['No next step',count('No next step'),'Keep it moving','check',null,colours[2],'#e9f5f0','desk','No next step']];
    }
    if(state.view==='leads') {
      const fresh=Math.round(total.leads*.34),qualified=Math.round(total.leads*.28);
      cards=[['New leads',fresh,'First conversations','users','leads',colours[0],'#eaf1fc','leads'],['Qualified',qualified,'A little more clarity','check','quotes',colours[3],'#f0ebf8','leads'],['Proposal stage',total.leads-fresh-qualified-total.won,'Ready for the next step','file','value',colours[1],'#fdf2e1','leads'],['Won',total.won,'Demo pipeline status','trophy','won',colours[2],'#e9f5f0','leads']];
    }
    $('#metricCards').innerHTML=cards.map(([label,value,note,name,key,color,tint,view,filter])=>`<button class="metric-card" data-view="${view}" ${filter?`data-metric-filter="${filter}"`:''} style="--color:${color};--tint:${tint}" aria-label="${label}: ${value}. ${note}. Open ${tabs.find(t=>t[0]===view)[1]}"><span class="metric-icon">${icon(name)}</span><span class="metric-body"><span>${label}</span><strong>${value}</strong><small>${note}</small></span>${key?`<span class="metric-mini">${spark(daily.filter((_,i)=>i%4===0).map(d=>d[key]))}</span>`:''}</button>`).join('');
  }
  function chartPanel(valueOnly=false) {
    const key=valueOnly || state.chart==='value' ? 'value' : 'quotes';
    const daily=dailyData();
    const series=Array.from({length:Math.ceil(daily.length/7)},(_,i)=>{
      const week=daily.slice(i*7,(i+1)*7);
      return {day:week.at(-1).day,start:week[0].day,quotes:week.reduce((n,d)=>n+d.quotes,0),value:week.reduce((n,d)=>n+d.value,0)};
    });
    const max=Math.max(...series.map(d=>d[key]),1);
    const scale=key==='value' ? Math.ceil(max/300000)*300000 : Math.max(3,Math.ceil(max/3)*3);
    const x=i=>40+i/(series.length-1)*560;
    const y=v=>165-v/scale*140;
    const points=series.map((d,i)=>[x(i),y(d[key])]);
    const path=points.reduce((result,[px,py],i)=>{
      if(!i)return `M${px} ${py}`;
      const [prevX,prevY]=points[i-1],mid=(prevX+px)/2;
      return result+` C${mid} ${prevY},${mid} ${py},${px} ${py}`;
    },'');
    const total=totals()[key];
    const grid=Array.from({length:4},(_,i)=>{const v=scale*i/3;return `<line x1="40" x2="607" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="28" y="${y(v)+3}" text-anchor="end">${key==='value'?`${Math.round(v/100000)}L`:v}</text>`;}).join('');
    const shortMonth=new Date(state.year,state.month,1).toLocaleDateString('en-GB',{month:'short'});
    const labels=series.map((d,i)=>`<text x="${x(i)}" y="192" text-anchor="middle">${String(d.start).padStart(2,'0')}–${String(d.day).padStart(2,'0')}</text>`).join('');
    return `<article class="panel trend-panel">${panelHead(valueOnly?'Quoted value trend':'Business momentum','chart',`<span class="sub-label">Weekly view · ${shortMonth}</span>`)}<div class="chart-top"><div class="chart-stat"><strong>${key==='value'?money(total):number.format(total)}</strong><span>${key==='value'?'quoted this month':'quotations this month'}</span></div>${valueOnly?'':`<div class="segmented" aria-label="Chart measure"><button data-chart="quotes" aria-pressed="${key==='quotes'}">Quotations</button><button data-chart="value" aria-pressed="${key==='value'}">Value</button></div>`}</div><div class="chart-wrap"><svg class="line-chart" viewBox="0 0 630 200" preserveAspectRatio="none" role="group" aria-label="Demo ${key==='value'?'quoted value':'quotation count'} by week. Select a point for week-ending date activity."><defs><linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#edb45f" stop-opacity=".24"/><stop offset="1" stop-color="#edb45f" stop-opacity="0"/></linearGradient></defs>${grid}<path class="chart-area" d="${path} L600 165 L40 165Z" fill="url(#areaFill)"/><path class="chart-line" d="${path}"/>${labels}${series.map((d,i)=>`<circle class="chart-point" cx="${x(i)}" cy="${y(d[key])}" r="3" tabindex="0" role="button" data-chart-day="${d.day}" data-tip="${d.start}–${d.day} ${shortMonth} · ${key==='value'?money(d[key]):`${d[key]} quotations`}" aria-label="${d.start} to ${d.day} ${shortMonth}: ${key==='value'?money(d[key]):`${d[key]} quotations`}. View activity on ${dateTitle(d.day)}."/>`).join('')}</svg><span class="chart-tooltip" hidden></span></div><div class="chart-foot"><span><i class="legend-dot"></i>${key==='value'?'Weekly quoted value · not revenue':'Weekly quotations prepared'}</span><button data-explain="chart">Sample series ${icon('info')}</button></div></article>`;
  }
  function calendarContent() {
    const first=(new Date(state.year,state.month,1).getDay()+6)%7;
    const count=daysInMonth(); state.day=Math.min(state.day,count);
    const items=eventsForDay(state.day);
    return `${panelHead('Your calendar','calendar',`<div class="icon-pair"><button class="icon-button" data-month-step="-1" aria-label="Previous month" ${state.year===2025&&state.month===0?'disabled':''}>${icon('chevronLeft')}</button><button class="icon-button" data-month-step="1" aria-label="Next month" ${state.year===2027&&state.month===11?'disabled':''}>${icon('chevron')}</button></div>`)}<div class="calendar-week" aria-hidden="true">${['M','T','W','T','F','S','S'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-days" role="group" aria-label="${monthTitle()} activity calendar">${'<span class="calendar-empty" aria-hidden="true"></span>'.repeat(first)}${Array.from({length:count},(_,i)=>{const d=i+1,events=eventsForDay(d);return `<button class="calendar-day ${events.length?'has-activity':''} ${d===state.day?'selected':''} ${d===23&&state.month===9&&state.year===2026?'is-today':''}" data-date="${d}" aria-pressed="${d===state.day}" aria-label="${dateTitle(d)}, ${events.length} demo activities" ${d===23&&state.month===9&&state.year===2026?'aria-current="date"':''}>${d}</button>`;}).join('')}</div><div class="agenda" aria-live="polite"><div class="agenda-label"><strong>${dateTitle(state.day)}</strong><span>${items.length} ${items.length===1?'activity':'activities'}</span></div>${items.length?items.slice(0,2).map((item,i)=>`<button class="agenda-item" data-event="${i}"><span class="event-dot" style="--event-color:${item.color}"></span><span class="event-time">${item.time}</span><span class="event-title">${escape(item.title)}</span>${icon('chevron')}</button>`).join('') : '<p class="agenda-empty">A little breathing room. No demo activity.</p>'}${items.length>2?`<button class="agenda-more" data-all-events>+ ${items.length-2} more ${items.length===3?'activity':'activities'}</button>`:''}</div>`;
  }
  const calendarPanel=()=>`<article class="panel calendar-panel">${calendarContent()}</article>`;
  function donutPanel(title='Lead sources') {
    const data=sourceData(),total=totals().leads,circ=2*Math.PI*49;
    let start=0;
    const segments=data.map(([label,count,color])=>{const length=count/total*circ;const markup=`<circle class="donut-segment" cx="70" cy="70" r="49" stroke="${color}" stroke-dasharray="${Math.max(0,length-4)} ${circ-Math.max(0,length-4)}" stroke-dashoffset="${-start}" role="button" tabindex="0" data-source="${label}" aria-label="${label}: ${count} demo leads, ${Math.round(count/total*100)} percent"/>`;start+=length;return markup;}).join('');
    return `<article class="panel source-panel">${panelHead(title,'pie',`<span class="sub-label">${total} leads</span>`)}<div class="donut-body"><div class="donut"><svg viewBox="0 0 140 140" role="group" aria-label="Demo lead sources donut chart">${segments}</svg><div class="donut-center"><strong>${total}</strong><span>Total leads</span></div></div><div class="donut-legend">${data.map(([label,count,color])=>`<button data-source="${label}" aria-label="${label}, ${count} demo leads"><i style="background:${color}"></i>${label}<strong>${Math.round(count/total*100)}%</strong></button>`).join('')}</div></div><p class="panel-foot">Where new conversations begin.</p></article>`;
  }
  function pipelinePanel() {
    const total=totals(),a=Math.round(total.leads*.34),b=Math.round(total.leads*.28),c=total.leads-a-b-total.won;
    const rows=[['New',a,colours[0]],['Qualified',b,colours[3]],['Proposal',c,colours[1]],['Won',total.won,colours[2]]];
    return `<article class="panel pipeline-panel">${panelHead('Pipeline snapshot','layers',viewLink('leads','Explore'))}<div class="pipeline-bars">${rows.map(([label,value,color])=>`<div class="pipeline-row"><span>${label}</span><div class="pipeline-track" role="img" aria-label="${label}: ${value} demo leads"><div class="pipeline-fill" style="width:${Math.round(value/Math.max(...rows.map(r=>r[1]))*100)}%;--bar-color:${color}"></div></div><strong>${value}</strong></div>`).join('')}</div><p class="panel-foot">One stage. One clear next step.</p></article>`;
  }
  function activityPanel() {
    const items=eventsForDay(state.day);
    return `<article class="panel activity-panel">${panelHead('A little momentum','pulse',viewLink('desk','Action desk'))}<div class="activity-list">${items.length?items.slice(0,3).map((item,i)=>`<button class="activity-row" data-event="${i}"><span class="activity-symbol" style="--color:${item.color};--tint:${item.color}17">${icon(item.icon)}</span><span class="activity-copy"><strong>${escape(item.title)}</strong><p>${escape(item.context)}</p></span><time>${item.time}</time></button>`).join(''):empty('No activity on this date.')}</div></article>`;
  }
  function overview() {return `<div class="overview-grid">${chartPanel()}${calendarPanel()}</div><div class="below-grid">${donutPanel()}${pipelinePanel()}${activityPanel()}</div>`;}
  function actionDesk() {
    const filters=['All','Overdue','Unanswered','No owner','No next step','Stalled'];
    const visible=tasks.filter(t=>(state.filter==='All'||t.filter===state.filter)&&(!t.custom||t.month===monthKey()));
    return `<div class="action-layout"><article class="panel action-panel">${panelHead('A clearer action desk','list',`<button class="primary" data-add-action>${icon('plus')}Demo action</button>`)}<div class="filter-row" role="group" aria-label="Demo action filters">${filters.map(f=>`<button data-filter="${f}" aria-pressed="${state.filter===f}">${f}</button>`).join('')}</div><div class="action-list">${visible.length?visible.map(t=>`<button class="action-item" data-task="${t.id}"><span class="action-check ${t.done?'done':''}">${t.done?icon('check'):''}</span><div><strong>${escape(t.title)}</strong><small>${escape(t.context)} · ${dateTitle(t.day)}</small></div>${tag(t.done?'Done':t.filter,t.done?'green':t.tone)}</button>`).join(''):empty('All clear in this demo view.')}</div></article><div class="action-side">${calendarPanel()}<div class="small-status">${icon('bolt')}<div><h3>A calmer way to move forward.</h3><p>Right task. Right moment. Less noise.</p></div></div></div></div>`;
  }
  const demoLeads=[
    {title:'Residential rooftop',detail:'6 kW · Website enquiry',value:'₹3.2 L',source:'Website',tone:'gray',stage:'New'},
    {title:'Commercial solar',detail:'25 kW · Incoming referral',value:'₹11.8 L',source:'Referral',tone:'amber',stage:'New'},
    {title:'Housing society',detail:'40 kW · Site assessment',value:'₹18.6 L',source:'Website',tone:'gray',stage:'Qualified'},
    {title:'Industrial rooftop',detail:'60 kW · Scope confirmed',value:'₹26.4 L',source:'Referral',tone:'amber',stage:'Qualified'},
    {title:'Residential upgrade',detail:'8 kW · Proposal shared',value:'₹4.1 L',source:'Instagram',tone:'green',stage:'Proposal'},
    {title:'Commercial expansion',detail:'35 kW · Proposal review',value:'₹16.8 L',source:'Website',tone:'gray',stage:'Proposal'}
  ];
  function leadsView() {
    return `<div class="lead-layout"><article class="panel">${panelHead('A healthy pipeline','layers',`<span class="sub-label">Illustrative opportunities</span>`)}<div class="kanban">${['New','Qualified','Proposal'].map(stage=>`<section class="kanban-column"><h3 class="kanban-header">${stage}<span>2</span></h3>${demoLeads.filter(l=>l.stage===stage).map(l=>`<button class="lead-tile" data-lead="${demoLeads.indexOf(l)}"><strong>${l.title}</strong><p>${l.detail}</p><div><b>${l.value}</b>${tag(l.source,l.tone)}</div></button>`).join('')}</section>`).join('')}</div></article><div class="lead-side">${donutPanel()}${pipelinePanel()}</div></div>`;
  }
  function weeklyChart() {
    const series=dailyData();
    const weeks=Array.from({length:5},(_,i)=>series.slice(i*7,(i+1)*7).reduce((a,d)=>a+d.quotes,0));
    const max=Math.max(...weeks,1);
    return `<article class="panel">${panelHead('Quotation rhythm','activity',`<span class="sub-label">By week</span>`)}<div class="mini-bars" role="img" aria-label="Demo quotations per week: ${weeks.join(', ')}">${weeks.map((n,i)=>`<div class="mini-bar-group"><div style="height:${n/max*100}%" title="Week ${i+1}: ${n} quotations"></div><span>W${i+1} · ${n}</span></div>`).join('')}</div><p class="panel-foot">Monthly volume, in smaller steps.</p></article>`;
  }
  function performance() {return `<div class="performance-grid">${chartPanel(true)}${weeklyChart()}</div><div class="performance-bottom">${donutPanel('Lead source mix')}${pipelinePanel()}</div><div class="performance-note">${icon('info')}Quoted value is not revenue. All figures here are illustrative demo data.</div>`;}
  const channels=[['Gmail','gmail','mail'],['Outlook','outlook','mail'],['WhatsApp','whatsapp','message'],['Instagram','instagram','image'],['LinkedIn','linkedin','users'],['Google Calendar','google_calendar','calendar'],['Outlook Calendar','outlook','calendar'],['Website','website','layers']];
  const brandIcon=channel=>channel[1]?`<img src="/assets/js/pulse/brand-icons/${channel[1]}.svg" alt="">`:icon(channel[2]);
  function communications() {
    const inboxes=channels.slice(0,3);
    const messages=[['Site survey confirmation','Can we schedule the rooftop assessment this week?','10:30'],['Proposal follow-up','A quick update on the shared system proposal.','09:45'],['New rooftop enquiry','Interested in a solar system for a residential property.','Yesterday']];
    return `<article class="panel"><div class="comms-layout"><aside class="inbox-sidebar"><h3>Conversations</h3>${inboxes.map(c=>`<button class="inbox-channel" data-inbox="${c[0]}" aria-pressed="${state.inbox===c[0]}">${brandIcon(c)}${c[0]}<b>Demo</b></button>`).join('')}</aside><div class="inbox-content">${panelHead(`${state.inbox} preview`,'inbox',`<span class="sub-label">Sample conversations</span>`)}${messages.map(([title,text,time],i)=>`<button class="message-row" data-message="${i}"><span class="message-avatar">${['S','P','N'][i]}</span><div><strong>${title}</strong><p>${text}</p></div><time>${time}</time></button>`).join('')}</div></div></article><div class="management-note"><p>Just conversations here. Account management stays in Settings.</p><button class="text-link" data-shell="Settings">Manage in Settings ${icon('arrow')}</button></div>`;
  }
  function automations() {
    const rules=[['Follow-up, without the chase.','A gentle reminder after a quotation is shared.','file','clock','mail'],['Every enquiry, a next step.','Keep new conversations moving with a clear task.','users','bolt','check'],['A little clarity, every day.','A compact daily summary of business activity.','calendar','chart','inbox']];
    return `<div class="workflow-header"><p>Thoughtful workflows. Human approval stays in control.</p><span class="tag gray">No active automations</span></div><div class="workflow-grid">${rules.map(([title,description,...names],i)=>`<article class="panel workflow-card"><div class="workflow-title"><span class="activity-symbol" style="--color:${colours[i]};--tint:${colours[i]}19">${icon('bolt')}</span>${tag('Concept only','gray')}</div><h3>${title}</h3><p>${description}</p><div class="workflow-flow">${names.map((n,j)=>`${j?icon('arrow'):''}<span>${icon(n)}</span>`).join('')}</div><button class="text-link" data-rule="${i}">Explore workflow ${icon('arrow')}</button></article>`).join('')}</div>`;
  }
  function channelsView() {
    return `<div class="channel-grid">${channels.map(c=>`<article class="panel channel-card"><span class="channel-brand">${brandIcon(c)}</span><h3>${c[0]}</h3><div><small>${c[0]==='Website'?'Website analytics':'Business channel'}</small>${tag('Preview only','gray')}</div></article>`).join('')}</div><div class="management-note"><p>Status belongs in Pulse. Linking and account controls belong in Settings.</p><button class="text-link" data-shell="Settings">Manage in Settings ${icon('arrow')}</button></div>`;
  }
  const renderers={overview,desk:actionDesk,leads:leadsView,performance,communications,automations,channels:channelsView};
  function updateURL() {window.history.replaceState(null,'',`${location.pathname}?view=${state.view}&month=${monthKey()}`);}
  function renderContent() {
    $('#viewContent').innerHTML=`<div class="view-enter">${renderers[state.view]()}</div>`;
    $('#viewContent').setAttribute('aria-labelledby',`tab-${state.view}`);
  }
  function render() {
    state.day=Math.min(state.day,daysInMonth());
    $('.pulse-tabs').innerHTML=tabs.map(([key,label,name])=>`<button id="tab-${key}" data-view="${key}" role="tab" aria-selected="${state.view===key}" aria-controls="viewContent" tabindex="${state.view===key?'0':'-1'}">${icon(name)}${label}</button>`).join('');
    $('#viewHeading').textContent=tabs.find(t=>t[0]===state.view)[3];
    $('#periodLabel').textContent=monthTitle();
    $('#monthSelect').value=monthKey();
    renderMetrics();renderContent();updateURL();
  }
  function selectDate(day,focus=false) {
    state.day=day;
    $$('.calendar-panel').forEach(el=>{el.innerHTML=calendarContent();});
    const activity=$('.activity-panel');if(activity)activity.outerHTML=activityPanel();
    if(focus)$(`[data-date="${day}"]`)?.focus();
  }
  function changeMonth(step) {
    const next=new Date(state.year,state.month+step,1);
    if(next.getFullYear()<2025||next.getFullYear()>2027)return;
    state.year=next.getFullYear();state.month=next.getMonth();render();
  }
  const dialog=$('#detailDialog');
  function openDialog(eyebrow,title,body,button='Got it') {
    $('#dialogContent').innerHTML=`<span class="dialog-eyebrow">${escape(eyebrow)}</span><h2 id="dialogTitle">${escape(title)}</h2>${body}<button class="primary" data-close-dialog>${escape(button)}</button>`;
    if(!dialog.open)dialog.showModal();
  }
  function previewInfo() {openDialog('A NEW PERSPECTIVE','A design you can explore.','<p>This is a visual prototype, not your live dashboard. Every number, opportunity, conversation and calendar event is sample data.</p><p>Try the charts, dates and different views. Demo actions exist only in this browser tab and disappear on reload. No accounts, API calls, saved changes or provider sending are involved.</p>');}
  function eventDetail(index) {
    const item=eventsForDay(state.day)[index];if(!item)return;
    openDialog('DEMO CALENDAR ACTIVITY',item.title,`<div class="detail-meta">${tag(dateTitle(state.day))}${tag(item.time,'amber')}</div><p>${escape(item.context)}</p><p>Illustrative activity only. This is not a customer record or a connected calendar event.</p>`);
  }
  let toastTimer;
  function toast(message) {clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').hidden=false;toastTimer=setTimeout(()=>{$('#toast').hidden=true;},3500);}
  function taskDetail(id) {
    const task=tasks.find(t=>t.id===id);if(!task)return;
    openDialog('DEMO ACTION',task.title,`<p>${escape(task.context)}</p><div class="detail-meta">${tag(dateTitle(task.day),'amber')}${tag(task.done?'Done':task.filter,task.tone)}</div><p>Preview the completed state. This changes only the sample action in this tab.</p><button class="primary" data-toggle-task="${id}">${task.done?'Reopen demo action':'Mark demo action done'}</button>`,'Close');
  }
  function addAction() {
    $('#dialogContent').innerHTML=`<span class="dialog-eyebrow">SESSION-ONLY DEMO</span><h2 id="dialogTitle">A little next step.</h2><form class="demo-form" id="demoActionForm"><label>Action title<input name="title" required maxlength="80" placeholder="e.g. Review the proposal" autocomplete="off"></label><label>Day in ${escape(monthTitle())}<input name="day" type="number" min="1" max="${daysInMonth()}" value="${state.day}" required></label><button class="primary" type="submit">${icon('plus')}Add demo action</button></form><p>Only in this tab. Nothing is saved or sent.</p>`;
    dialog.showModal();
  }
  function sourceDetail(name) {
    const entry=sourceData().find(s=>s[0]===name);if(!entry)return;
    openDialog('DEMO LEAD SOURCE',name,`<div class="detail-meta">${tag(`${entry[1]} leads`,'green')}${tag(monthTitle())}</div><p>A sample of how source attribution could look. No tracking platform or customer source is connected in this preview.</p>`);
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,[data-chart-day],[data-source]');if(!target)return;
    if(target.dataset.view){state.view=target.dataset.view;state.filter=target.dataset.metricFilter||'All';render();$(`#tab-${state.view}`).focus();}
    else if(target.dataset.date)selectDate(Number(target.dataset.date),true);
    else if(target.dataset.monthStep)changeMonth(Number(target.dataset.monthStep));
    else if(target.dataset.chart){state.chart=target.dataset.chart;renderContent();$(`[data-chart="${state.chart}"]`)?.focus();}
    else if(target.dataset.chartDay){selectDate(Number(target.dataset.chartDay));if(!$('.calendar-panel'))openDialog('DEMO DAILY ACTIVITY',dateTitle(state.day),`<p>${eventsForDay(state.day).map(e=>`${e.time} · ${escape(e.title)}`).join('<br>')||'No demo activity on this date.'}</p>`);}
    else if(target.dataset.filter){state.filter=target.dataset.filter;renderContent();$(`[data-filter="${state.filter}"]`)?.focus();}
    else if(target.dataset.event!==undefined)eventDetail(Number(target.dataset.event));
    else if(target.hasAttribute('data-all-events'))openDialog('DEMO DAILY ACTIVITY',dateTitle(state.day),`<p>${eventsForDay(state.day).map(e=>`${e.time} · ${escape(e.title)}`).join('<br>')}</p>`);
    else if(target.dataset.task)taskDetail(Number(target.dataset.task));
    else if(target.dataset.toggleTask){const t=tasks.find(t=>t.id===Number(target.dataset.toggleTask));if(t){t.done=!t.done;dialog.close();renderMetrics();renderContent();toast(t.done?'Demo action completed — this tab only.':'Demo action reopened — this tab only.');}}
    else if(target.hasAttribute('data-add-action'))addAction();
    else if(target.dataset.source)sourceDetail(target.dataset.source);
    else if(target.dataset.lead!==undefined){const l=demoLeads[Number(target.dataset.lead)];if(l)openDialog('ILLUSTRATIVE OPPORTUNITY',l.title,`<p>${l.detail}</p><div class="detail-meta">${tag(l.stage,'green')}${tag(l.value,'amber')}</div><p>A sample pipeline tile, not a real contact or saved quotation. These six examples illustrate the board layout, not the monthly totals.</p>`);}
    else if(target.dataset.inbox){state.inbox=target.dataset.inbox;renderContent();$(`[data-inbox="${state.inbox}"]`)?.focus();}
    else if(target.dataset.message!==undefined)openDialog('DEMO CONVERSATION',state.inbox,'<p>A sample business conversation would open here with its customer and quotation context.</p><p>No private mailbox content has been read, imported or sent.</p>');
    else if(target.dataset.rule!==undefined)openDialog('WORKFLOW CONCEPT','A flow, not an active rule.','<p>Trigger → human review → approved next step.</p><p>This is a visual concept only. No automation is created, enabled or scheduled, and no provider can send from this preview.</p>');
    else if(target.dataset.shell)openDialog('DESIGN PREVIEW',target.dataset.shell,'<p>This prototype focuses on Studio Pulse. Your existing dashboard navigation and Settings remain unchanged.</p><p>It does not navigate to a live account or duplicate connection management.</p>');
    else if(target.dataset.explain)openDialog('CHART DEFINITIONS','Clear numbers. Honest context.','<p>Deterministic sample counts illustrate a monthly series, grouped by week. Values, summary cards and daily calendar activity use the same demo model. Select a point to explore its week-ending date.</p><p>Quoted value means prepared quotation amounts, not revenue or cash received. Real integration must preserve unavailable states and actual record permissions.</p>');
    else if(target.hasAttribute('data-close-dialog')||target.closest('.dialog-close'))dialog.close();
  });
  document.addEventListener('submit',event=>{
    if(event.target.id!=='demoActionForm')return;event.preventDefault();
    if(!event.target.reportValidity())return;
    const form=new FormData(event.target),title=String(form.get('title')||'').trim(),day=Number(form.get('day'));
    if(!title||!Number.isInteger(day)||day<1||day>daysInMonth())return;
    tasks.push({id:Math.max(...tasks.map(t=>t.id))+1,title,day,context:'Session-only demo action',filter:'No next step',type:'Demo action',tone:'green',done:false,custom:true,month:monthKey()});
    state.day=day;state.filter='All';dialog.close();renderMetrics();renderContent();toast('Demo action added — nothing saved or sent.');
  });
  $('#monthSelect').innerHTML=Array.from({length:36},(_,i)=>{const date=new Date(2025, i,1),value=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;return `<option value="${value}">${date.toLocaleDateString('en-GB',{month:'short',year:'numeric'})}</option>`;}).join('');
  $('#monthSelect').addEventListener('change',event=>{const [year,month]=event.target.value.split('-').map(Number);state.year=year;state.month=month-1;render();});
  $('#aboutPreview').addEventListener('click',previewInfo);$('#workspaceInfo').addEventListener('click',previewInfo);
  $('.dialog-close').addEventListener('click',()=>dialog.close());
  function hideNotifications(){$('#notificationPopover').hidden=true;$('#notificationButton').setAttribute('aria-expanded','false');}
  $('#notificationButton').addEventListener('click',()=>{
    const box=$('#notificationPopover');box.hidden=!box.hidden;$('#notificationButton').setAttribute('aria-expanded',String(!box.hidden));
    box.innerHTML=`<h3>Sample activity · ${dateTitle(state.day)}</h3>${eventsForDay(state.day).slice(0,3).map((item,i)=>`<button class="search-result" data-event="${i}">${icon(item.icon)}${escape(item.title)}</button>`).join('')||'<p>No demo activity on this date.</p>'}<p>Illustrative activity, not live notifications.</p>`;
  });
  const search=$('#globalSearch'),results=$('#searchResults');
  function hideSearch(){results.hidden=true;search.setAttribute('aria-expanded','false');}
  search.addEventListener('input',()=>{
    const term=search.value.trim().toLowerCase();if(!term){hideSearch();return;}
    const views=tabs.filter(t=>t[1].toLowerCase().includes(term));const found=tasks.filter(t=>`${t.title} ${t.context}`.toLowerCase().includes(term));
    results.innerHTML=views.map(([view,label,name])=>`<button class="search-result" data-view="${view}">${icon(name)}${label}</button>`).join('')+found.map(t=>`<button class="search-result" data-task="${t.id}">${icon('check')}${escape(t.title)}</button>`).join('')||'<p>No matching demo actions or views.</p>';
    results.hidden=false;search.setAttribute('aria-expanded','true');
  });
  results.addEventListener('click',()=>{hideSearch();search.value='';});
  document.addEventListener('click',event=>{if(!event.target.closest('.search-wrap'))hideSearch();if(!event.target.closest('#notificationButton,#notificationPopover'))hideNotifications();});
  document.addEventListener('keydown',event=>{
    if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search.focus();}
    if(event.key==='Escape'){hideSearch();hideNotifications();}
    const tab=event.target.closest('.pulse-tabs [role="tab"]');
    if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();const index=tabs.findIndex(t=>t[0]===state.view);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      state.view=tabs[next][0];render();$(`#tab-${state.view}`).focus();
    }
    const date=event.target.closest('[data-date]');
    if(date&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      event.preventDefault();const next=Number(date.dataset.date)+({ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key]);if(next>=1&&next<=daysInMonth())selectDate(next,true);
    }
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('circle[role="button"]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
    if(event.target===search&&event.key==='ArrowDown'&&!results.hidden){event.preventDefault();$('button',results)?.focus();}
  });
  document.addEventListener('pointerover',event=>{
    const point=event.target.closest('[data-tip]');if(!point)return;
    const wrap=point.closest('.chart-wrap'),tip=$('.chart-tooltip',wrap),rect=point.getBoundingClientRect(),parent=wrap.getBoundingClientRect();
    tip.textContent=point.dataset.tip;tip.hidden=false;tip.style.left=`${Math.max(65,Math.min(parent.width-65,rect.x-parent.x))}px`;tip.style.top=`${rect.y-parent.y}px`;
  });
  document.addEventListener('pointerout',event=>{if(event.target.matches('[data-tip]')){const tip=$('.chart-tooltip',event.target.closest('.chart-wrap'));if(tip)tip.hidden=true;}});
  render();
})();
