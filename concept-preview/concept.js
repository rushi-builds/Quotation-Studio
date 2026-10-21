/* Concept only: memory-local state, no auth/storage/API/production imports. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = n => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:0}).format(n);
  const clone = value => JSON.parse(JSON.stringify(value));
  const paths = {
    layers:'M12 3 2 8l10 5 10-5-10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
    history:'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2',
    eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    clipboard:'M9 5H5v16h14V5h-4M9 3h6v5H9V3ZM8 13h8M8 17h5',
    calendar:'M4 5h16v16H4V5ZM8 3v4M16 3v4M4 10h16M8 14h2M14 14h2',
    download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
    shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3ZM8 12l3 3 5-6',
    roof:'M2 11 12 3l10 8M5 10v11h14V10M9 21v-7h6v7',
    water:'M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12ZM9 16c0 2 1 3 3 3',
    battery:'M5 7h14v14H5V7ZM9 3h6v4M13 10l-3 5h4l-3 4',
    check:'M5 12l4 4L19 6',
    arrow:'M4 12h16m-6-6 6 6-6 6',
    file:'M5 3h9l5 5v13H5V3ZM14 3v6h5M8 13h8M8 17h8',
    lock:'M5 10h14v11H5V10ZM8 10V7a4 4 0 0 1 8 0v3M12 14v3'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.layers}"/></svg>`;
  function hydrateIcons() { document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML=icon(el.dataset.icon); }); }
  const titles = {
    scope:['Scope & pricing','One clear offer. Every inclusion and optional scope accounted for.'],
    revisions:['Revisions','Know what changed—and which offer your customer responded to.'],
    customer:['Customer view','Explore a pinned offer and a simple, version-linked response.'],
    survey:['Site survey','Measured facts, customer inputs and open questions—in one place.'],
    followups:['Follow-ups','The right conversation, with the right person, at the right time.'],
    export:['Excel export','A clean customer copy. The same offer, in a familiar format.']
  };
  const initialScopes = () => [
    {id:'roof',name:'Leak Proof',detail:'Roofing scope · subject to site and structural review',amount:84000,mode:'separate',requested:true,confirmed:false},
    {id:'water',name:'Rainwater collection',detail:'Collection & storage scope · design inputs pending',amount:null,mode:'optional',requested:false,confirmed:false},
    {id:'battery',name:'Battery storage',detail:'Capacity & equipment to follow a load assessment',amount:null,mode:'optional',requested:false,confirmed:false}
  ];
  let s;
  function resetState() {
    const current = {number:2,date:'21 Oct 2026',solar:540000,scopes:initialScopes()};
    const previous = clone(current); previous.number=1; previous.date='20 Oct 2026'; previous.solar=520000; previous.scopes[0].amount=72000;
    s={view:'scope',draft:clone(current),versions:[previous,current],viewedVersion:1,selectedRevision:2,responses:[],filter:'open',suggestion:'',dirty:false,
      survey:{area:'120',unit:'m²',source:'Customer-provided',roof:'RCC terrace',shading:'Pending site check',notes:'Confirm usable roof area and access before final layout.'},
      tasks:[{id:1,title:'Confirm roof access and measurements',note:'Site survey · usable area remains customer-provided.',owner:'KTM Demo',due:'Today · sample',done:false},
        {id:2,title:'Review additional roofing scope',note:'Scope review · discuss Leak Proof pricing and exclusions.',owner:'KTM Demo',due:'Tomorrow · sample',done:false},
        {id:3,title:'Share the revised solar offer',note:'Revision 2 · sample sharing task completed manually.',owner:'KTM Demo',due:'Completed · sample',done:true}]};
  }
  resetState();
  const latest = () => s.versions.at(-1);
  function totals(scopes) {
    const separate = scopes.filter(x=>x.mode==='separate');
    return {priced:separate.filter(x=>x.amount!==null).reduce((a,x)=>a+x.amount,0),pricedCount:separate.filter(x=>x.amount!==null).length,
      pending:scopes.filter(x=>(x.mode==='separate'||x.requested)&&x.mode!=='included'&&x.amount===null),
      inclusionPending:scopes.filter(x=>x.mode==='included'&&!x.confirmed)};
  }
  function treatment(x) { return x.mode==='included' ? (x.confirmed?'Included in Solar EPC':'Inclusion not confirmed') : x.mode==='optional'?'Optional scope':'Separately quoted'; }
  function priceText(x) { return x.mode==='included' ? (x.confirmed?'Included':'Confirm inclusion') : x.amount===null?'To be confirmed':money(x.amount); }
  function extraLabel(t) { return t.pricedCount ? money(t.priced) : 'No priced items'; }
  function toast(text) { $('conceptToast').textContent=text; $('conceptToast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('conceptToast').hidden=true,4200); }
  function navigate(view, focus=true) {
    s.view=titles[view]?view:'scope';
    if(location.hash!==`#${s.view}`) history.replaceState(null,'',`#${s.view}`);
    render();
    if(focus) $('viewTitle').focus({preventScroll:true});
  }
  function summaryCard(snapshot=s.draft,customer=false) {
    const t=totals(snapshot.scopes);
    return `<div class="surface offer-card"><span class="mini-label">${customer?'PINNED OFFER':'WORKING DRAFT'} · DEMO-026</span><h2>Your offer, clearly.</h2><p>Solar EPC and additional scope stay separate.</p><div class="price-line"><span>Solar EPC · this offer</span><strong>${money(snapshot.solar)}</strong><small>Illustrative entered gross price.<br>No financial calculations changed.</small></div><div class="price-line addon"><span>Additional scope · separately</span><strong>${extraLabel(t)}</strong><small>${t.pricedCount?'Priced separate items only.':'Optional items are not added.'}${t.pending.length?`<br>${t.pending.length} requested scope price${t.pending.length>1?'s':''} pending.`:''}</small></div>${t.inclusionPending.length?'<div class="note amber">Included scope needs preparer confirmation before the offer can be published.</div>':''}<div class="note">No combined total. Unpriced scope is never treated as ₹0.</div>${customer?'':`<button type="button" class="btn btn-primary full-button" data-go="customer">Explore customer view ${icon('arrow')}</button><div class="offer-meta">Customer view uses published sample revisions.</div>`}</div>`;
  }
  function coverCard() {
    const t=totals(s.draft.scopes);
    return `<div class="surface cover-mini"><div class="cover-photo"><img src="../assets/images/about-residential-solar.jpg" alt="Illustrative residential solar architecture"><span>Solar. Considered.</span></div><h3>Cover stays concise.</h3><p>Customer identity first. Scope details stay in the offer.</p>${t.pending.length?'<div class="inline-alert">Requested additional scope: price pending.</div>':''}</div>`;
  }
  function scopeView() {
    return `<div class="view-grid"><div class="stack"><section class="surface"><div class="section-top"><div><h2>A clear commercial scope</h2><p>Separate what is priced, included and still to be confirmed.</p></div><span class="section-number">01 / 06</span></div><div class="solar-summary"><div><span class="mini-label">CORE OFFER</span><h3>10 kWp rooftop solar EPC</h3><p>Design · supply · installation · commissioning</p></div><div class="solar-amount"><strong>${money(s.draft.solar)}</strong><span>SAMPLE GROSS PRICE · READ-ONLY</span></div></div><div class="scope-heading"><h3>Additional systems & scope</h3><span>Never added automatically</span></div>${s.draft.scopes.map(x=>`<div class="scope-row"><div class="scope-row-top"><span class="scope-icon ${x.id}">${icon(x.id)}</span><div class="scope-title"><h3>${esc(x.name)}</h3><p>${esc(x.detail)}</p></div><div class="scope-price"><strong>${priceText(x)}</strong><span>${esc(treatment(x))}</span></div></div><div class="scope-controls"><select id="mode-${x.id}" data-mode="${x.id}" aria-label="${esc(x.name)} commercial treatment">${[['separate','Separately quoted'],['included','Included in Solar EPC'],['optional','Optional / not in offer']].map(([v,l])=>`<option value="${v}" ${x.mode===v?'selected':''}>${l}</option>`).join('')}</select><label class="check"><input type="checkbox" data-requested="${x.id}" ${x.requested?'checked':''}>Requested by customer</label></div>${x.mode==='included'?`<div class="inclusion-confirm"><label class="check"><input type="checkbox" data-confirm="${x.id}" ${x.confirmed?'checked':''}>I confirm this scope is already priced in Solar EPC. This does not change its price.</label></div>`:''}</div>`).join('')}<div class="surface-foot">${icon('lock')} Draft edits do not alter a published revision or its customer responses.</div></section><div class="note amber"><strong>Try it:</strong> change a scope treatment or mark rainwater as requested. The offer summary and cover warning update. To carry edits into Customer View, publish a sample revision below.</div><section class="surface"><div class="survey-actions"><div><h3>Keep published offers stable.</h3><p>${s.dirty?'Unpublished demo changes · next revision R'+(latest().number+1):'No unpublished changes · latest sample revision R'+latest().number}</p></div><button type="button" class="btn btn-primary" id="publishSample" ${!s.dirty?'disabled':''}>Publish sample revision ${icon('arrow')}</button></div></section></div><aside class="stack summary-stack">${summaryCard()}${coverCard()}</aside></div>`;
  }
  function revisionsView() {
    const current=latest(), previous=s.versions.at(-2);
    const selected=s.versions.find(x=>x.number===s.selectedRevision)||current;
    return `<div class="view-grid"><div class="stack"><div class="revision-options">${[previous,current].map(v=>`<button type="button" class="revision-tab ${selected.number===v.number?'active':''}" data-revision="${v.number}" aria-pressed="${selected.number===v.number}"><span class="status-chip ${v.number===current.number?'green':'gray'}">${v.number===current.number?'Latest published':'Previous version'}</span><strong>Revision ${v.number}</strong><small>${esc(v.date)} · ${money(v.solar)} Solar EPC</small></button>`).join('')}</div><section class="surface"><div class="section-top"><div><h2>What changed?</h2><p>Published Revision ${previous.number} → Revision ${current.number}</p></div><span class="status-chip blue">Version comparison</span></div><table class="diff-table"><thead><tr><th>SCOPE / VALUE</th><th>REVISION ${previous.number}</th><th>REVISION ${current.number}</th></tr></thead><tbody><tr><td>Solar EPC price</td><td>${money(previous.solar)}</td><td class="diff-new">${money(current.solar)}</td></tr>${current.scopes.map((x,i)=>`<tr><td>${esc(x.name)}</td><td>${esc(treatment(previous.scopes[i]))}<br>${priceText(previous.scopes[i])}</td><td class="${JSON.stringify(x)!==JSON.stringify(previous.scopes[i])?'diff-new':''}">${esc(treatment(x))}<br>${priceText(x)}${x.requested?'<br>Customer-requested':''}</td></tr>`).join('')}</tbody></table><div class="surface-foot">${icon('history')} Comparisons use stored sample snapshots, not the current working draft.</div></section><section class="surface surface-pad"><h2>Open this exact revision</h2><p class="page-subtitle">See how the customer stays on the version you shared, even when a newer offer exists.</p><button type="button" class="btn btn-primary full-button" id="openSelected">Open customer Revision ${selected.number} ${icon('arrow')}</button></section></div><aside class="stack"><section class="surface surface-pad"><span class="mini-label">THE LINK RULE</span><h2>Pinned. Never silently replaced.</h2><ul class="list-ticks"><li>${icon('check')}Each link belongs to one published revision.</li><li>${icon('check')}A notice points to a newer revision through an authorised flow.</li><li>${icon('check')}An old response stays attached to the old version.</li><li>${icon('check')}A revised offer needs a fresh response.</li></ul><div class="note amber">Demo navigation only. No share tokens are created, and no actual public response endpoint exists here.</div></section></aside></div>`;
  }
  const responseLabels = {interested:'Interested / discuss next steps',changes:'Request changes',declined:'Not proceeding'};
  function responseTimeline() {
    return `<section class="surface surface-pad"><span class="mini-label">PREPARER VIEW · SAMPLE ACTIVITY</span><h2>A more useful conversation.</h2><div class="timeline">${s.responses.slice().reverse().map(r=>`<div class="timeline-item latest"><strong>${esc(responseLabels[r.choice])}</strong><p>Revision ${r.version} · ${r.version===latest().number?'latest offer':'older offer—latest not approved'}<br>${esc(r.name)} · customer-link simulation${r.comment?'<br>“'+esc(r.comment)+'”':''}</p><small>${esc(r.time)} · demo browser time</small></div>`).join('')}<div class="timeline-item"><strong>Revision 2 prepared</strong><p>Sample internal activity · staff-entered</p><small>21 Oct 2026 · illustrative record</small></div><div class="timeline-item"><strong>Customer link opened</strong><p>Opening a link does not prove the proposal was read.</p><small>Sample event—not a real tracked customer</small></div></div>${s.responses.length?'<button type="button" class="btn btn-secondary full-button" id="responseFollowup">Create a follow-up '+icon('arrow')+'</button>':''}<div class="note">Responses here stay in this tab. They are not stored on a server or sent to your team.</div></section>`;
  }
  function customerView() {
    const v=s.versions.find(x=>x.number===s.viewedVersion)||s.versions[0], t=totals(v.scopes), r=s.responses.find(x=>x.version===v.number);
    return `<div class="customer-layout"><section class="customer-frame"><div class="customer-bar"><i class="browser-dot"></i><i class="browser-dot"></i><i class="browser-dot"></i><span>Customer preview · DEMO-026 · Revision ${v.number}</span></div>${v.number!==latest().number?`<div class="revision-notice"><span>You are viewing Revision ${v.number}. Revision ${latest().number} is available.</span><button type="button" id="viewLatest">View newer offer ↗</button></div>`:''}<div class="customer-hero"><img src="../assets/images/about-residential-solar.jpg" alt="Illustrative solar terrace—not a verified project photograph"><div><p class="eyebrow">KTM ENERGY EXPERTS · SAMPLE PROPOSAL</p><h2>A brighter home.<br>A considered beginning.</h2><p>Prepared for Patil Residence · Pune<br>10 kWp residential rooftop solar · Revision ${v.number}</p></div></div><div class="customer-body"><h3>Your proposed scope</h3><p>Solar EPC is this offer. Additional scope is shown separately—not silently added to your solar price.</p><div class="customer-values"><div class="customer-value"><span>Solar EPC · gross</span><strong>${money(v.solar)}</strong><small>Illustrative offer value</small></div><div class="customer-value"><span>Additional scope · separate</span><strong>${extraLabel(t)}</strong><small>Priced separate items only${t.pending.length?'<br>Requested scope prices pending':''}</small></div></div><div class="badge-line">${v.scopes.map(x=>`<span class="status-chip ${x.mode==='included'?'green':x.mode==='separate'?'blue':'gray'}">${esc(x.name)} · ${esc(treatment(x))}</span>`).join('')}</div>${t.pending.length?'<div class="note amber">Requested additional scope has a pending price. The additional offer is not complete.</div>':''}<hr><h3>How would you like to proceed?</h3><p>Your response is about <strong>Revision ${v.number}</strong>. It does not approve a different revision or authorise payment.</p>${r?`<div class="response-success"><h3>${icon('check')} Demo response recorded</h3><p>${esc(responseLabels[r.choice])} · Revision ${r.version}<br>By ${esc(r.name)} · ${esc(r.time)}<br>Stored in this tab only—not an order or verified signature.</p><button type="button" class="btn btn-secondary" id="editResponse">Change sample response</button></div>`:`<form class="response-form" id="responseForm"><div class="response-options">${[['interested','Interested / discuss next steps','Let’s review the next steps together.'],['changes','Request changes','Tell us what you would like revised.'],['declined','Not proceeding','Let the team know your decision.']].map(([value,label,detail])=>`<label class="response-choice"><input type="radio" name="response" value="${value}" required><span><strong>${label}</strong><small>${detail}</small></span></label>`).join('')}</div><label class="field"><span>Your name <span class="source-chip">· use a sample name</span></span><input id="responseName" name="sampleName" placeholder="e.g. Demo Customer" maxlength="100" autocomplete="off" required></label><label class="field response-comment"><span>Comment <span class="source-chip">· optional</span></span><textarea id="responseComment" maxlength="600" placeholder="A question, requested change or a suitable time to talk…"></textarea></label><label class="check"><input type="checkbox" id="responseConsent" required>I understand this sample response refers to Revision ${v.number}, not a signed order or payment authorisation.</label><button type="submit" class="btn btn-primary">Record demo response ${icon('arrow')}</button><p class="response-error" id="responseError" role="alert" hidden></p></form>`}</div></section><aside class="stack">${responseTimeline()}<div class="note amber"><strong>About identity:</strong> a typed name or possession of a link is not verified buyer identity. A production workflow needs the approved token, anti-spam and consent controls.</div></aside></div>`;
  }
  function surveyView() {
    const v=s.survey;
    return `<div class="view-grid"><section class="surface"><div class="section-top"><div><h2>Site information, with its source.</h2><p>A measured fact should never look the same as an assumption.</p></div><span class="status-chip amber">Review pending</span></div><form id="surveyForm"><div class="surface-pad form-grid"><label class="field"><span>Entered roof area</span><input type="number" name="area" value="${esc(v.area)}" min="0.1" max="1000000" step="0.1" required><small class="field-note">Survey reference only. No solar or rainwater sizing is recalculated.</small></label><label class="field"><span>Area unit</span><select name="unit">${['m²','sq ft'].map(x=>`<option ${v.unit===x?'selected':''}>${x}</option>`).join('')}</select><small class="field-note">Original value and unit are retained. No silent conversion.</small></label><label class="field"><span>Source of roof area</span><select name="source">${['Customer-provided','Site-measured','Design assumption','Pending confirmation'].map(x=>`<option ${v.source===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="field"><span>Roof type</span><select name="roof">${['RCC terrace','Metal roof','Other / needs review'].map(x=>`<option ${v.roof===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="field wide"><span>Shading observation</span><select name="shading">${['Pending site check','Observed shading—layout review needed','No major shading observed—not a yield guarantee'].map(x=>`<option ${v.shading===x?'selected':''}>${x}</option>`).join('')}</select></label><label class="field wide"><span>Site notes</span><textarea name="notes" maxlength="600" rows="3">${esc(v.notes)}</textarea></label><div class="note amber wide">Survey information is not structural approval, equipment compatibility certification or hydraulic design. Pending checks stay pending.</div></div><div class="survey-actions"><p>No live proposal is updated.</p><button type="submit" class="btn btn-primary">Save sample survey ${icon('check')}</button></div></form></section><aside class="stack"><section class="surface surface-pad"><span class="mini-label">QUOTATION READINESS</span><h2>Know what needs a visit.</h2><div class="checklist-row"><div>Roof area<small>${esc(v.area)} ${esc(v.unit)} · ${esc(v.source)}</small></div><span class="status-chip ${v.source==='Site-measured'?'green':'amber'}">${v.source==='Site-measured'?'Measured':'Review'}</span></div><div class="checklist-row"><div>Shading<small>${esc(v.shading)}</small></div><span class="status-chip amber">${v.shading==='Pending site check'?'Pending':'Review'}</span></div><div class="checklist-row"><div>Structural suitability<small>Professional review required</small></div><span class="status-chip amber">Pending</span></div><div class="checklist-row"><div>Customer requirements<small>Sample requirement captured</small></div><span class="status-chip green">Captured</span></div><button type="button" class="btn btn-secondary full-button" id="surveyFollowup">Create survey follow-up ${icon('arrow')}</button></section><div class="note">Survey data does not overwrite the quotation. Applying reviewed information would be a separate, deliberate production action.</div></aside></div>`;
  }
  function followupsView() {
    const open=s.tasks.filter(x=>!x.done), filtered=s.filter==='all'?s.tasks:s.tasks.filter(x=>s.filter==='done'?x.done:!x.done);
    return `<div class="metrics-row"><div class="surface mini-metric"><span>Open follow-ups</span><strong>${open.length}</strong></div><div class="surface mini-metric"><span>Completed</span><strong>${s.tasks.length-open.length}</strong></div><div class="surface mini-metric"><span>Customer responses · demo</span><strong>${s.responses.length}</strong></div></div><div class="view-grid"><section class="surface"><div class="section-top"><div><h2>Your next conversations</h2><p>Tasks have an owner and context—not just a reminder.</p></div><span class="status-chip gray">Tab-local</span></div><div class="surface-pad filter-bar" role="group" aria-label="Filter follow-ups">${[['open','Open'],['done','Completed'],['all','All tasks']].map(([v,label])=>`<button type="button" class="filter-btn ${s.filter===v?'active':''}" data-filter="${v}" aria-pressed="${s.filter===v}">${label}</button>`).join('')}</div><div class="task-list">${filtered.length?filtered.map(t=>`<div class="task-row ${t.done?'done':''}"><input type="checkbox" class="task-toggle" data-task="${t.id}" aria-label="Mark ${esc(t.title)} ${t.done?'open':'complete'}" ${t.done?'checked':''}><div class="task-details"><strong>${esc(t.title)}</strong><p>${esc(t.note)}</p><div class="task-meta"><span>DEMO-026 · Patil Residence</span><span>Owner: ${esc(t.owner)}</span></div></div><span class="status-chip ${t.done?'green':'amber'}">${t.done?'Completed':esc(t.due)}</span></div>`).join(''):'<div class="empty-tasks">No tasks in this view. Try another filter.</div>'}</div><div class="surface-foot">${icon('shield')} Task completion never marks a quotation as won or a payment as received.</div></section><aside class="stack"><section class="surface surface-pad"><span class="mini-label">NEXT ACTION</span><h2>Create a sample follow-up</h2><form id="taskForm" class="stack"><label class="field"><span>What needs to happen?</span><input name="title" maxlength="120" placeholder="e.g. Discuss the requested changes" value="${esc(s.suggestion)}" required></label><label class="field"><span>Due date</span><input type="date" name="due" value="2026-10-22" required></label><label class="field"><span>Responsible person</span><select name="owner"><option>KTM Demo</option><option>Survey Demo</option></select></label><button type="submit" class="btn btn-primary">Add sample task +</button></form></section><div class="note">Sample tasks disappear on refresh. No notifications, reminders or assignments leave this preview.</div></aside></div>`;
  }
  function exportRows(v) {
    return [
      ['KTM QUOTATION STUDIO — SAMPLE CUSTOMER COPY',''],
      ['SAMPLE DATA — NOT A COMMERCIAL OFFER',''],
      ['Proposal reference','DEMO-026'],['Revision',v.number],['Customer','Patil Residence — SAMPLE'],['Location','Pune, Maharashtra'],
      ['Solar EPC — illustrative gross price',v.solar],['Additional scope','Shown separately; no combined total'],
      ...v.scopes.map(x=>[x.name+' — '+treatment(x)+(x.requested?' · customer-requested':''),x.mode==='included'?(x.confirmed?'Included in entered Solar EPC price':'Inclusion not confirmed'):x.amount===null?'To be confirmed':x.amount]),
      ['Pricing note','Optional items are not added. Missing prices are not zero.'],
      ['Validity / payment / taxes','Illustrative only; project-specific commercial terms not entered.'],
      ['Export type','Values-only snapshot; edits to this file do not update the application.'],
      ['Safety note','This sample is not an engineering approval, signed order or payment authorisation.']
    ];
  }
  function exportView() {
    const v=latest();
    return `<div class="view-grid"><section class="surface"><div class="export-toolbar"><div class="file-info"><span class="file-icon">${icon('file')}</span><div><strong>DEMO-026_R${v.number}_Customer.xlsx</strong><small>Published snapshot · Revision ${v.number} · sample customer copy</small></div></div><button type="button" class="btn btn-primary" id="downloadExcel">${icon('download')} Download sample Excel</button></div><div class="sheet-scroll"><table class="export-table"><thead><tr><th></th><th>A · DESCRIPTION</th><th>B · VALUE / TREATMENT</th></tr></thead><tbody>${exportRows(v).map((row,i)=>`<tr class="${i<2?'sheet-caption':''}"><td>${i+1}</td><td>${esc(row[0])}</td><td>${esc(typeof row[1]==='number'&&i!==3?money(row[1]):row[1])}</td></tr>`).join('')}</tbody></table></div><div class="sheet-tabs"><span>Customer quotation</span></div></section><aside class="stack"><section class="surface surface-pad"><span class="mini-label">SAFE BY CONTENT</span><h2>The customer copy only.</h2><ul class="list-ticks"><li>${icon('check')}Published quotation values, not a second finance engine.</li><li>${icon('check')}No purchase costs, private notes or internal margins.</li><li>${icon('check')}Pending prices stay “To be confirmed”.</li><li>${icon('check')}No hidden worksheets or live connections.</li></ul><div class="note">A real .xlsx downloads locally. It is editable in Excel; snapshot does not mean tamper-proof. It never writes changes back to Studio.</div></section><div class="note amber">Working draft changes are excluded. Publish a sample revision from Scope & pricing to export those changes.</div></aside></div>`;
  }
  function render() {
    const [title,subtitle]=titles[s.view];
    $('viewTitle').textContent=title; $('viewSubtitle').textContent=subtitle; $('crumbName').textContent=title;
    $('ribbonRevision').textContent=s.view==='scope'?`Working draft · latest published R${latest().number}`:`Published sample revisions · latest R${latest().number}`;
    document.querySelectorAll('#conceptNav [data-view]').forEach(b=>{ if(b.dataset.view===s.view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current'); });
    $('nextView').textContent=s.view==='customer'?'Back to offer ←':'Customer preview ↗';
    $('view').innerHTML=({scope:scopeView,revisions:revisionsView,customer:customerView,survey:surveyView,followups:followupsView,export:exportView})[s.view]();
    hydrateIcons();
    bindForms();
  }
  function bindForms() {
    const form=$('responseForm');
    if(form)form.addEventListener('submit',e=>{
      e.preventDefault();
      const choice=new FormData(form).get('response'), name=$('responseName').value.trim();
      if(!responseLabels[choice]||!name||!$('responseConsent').checked){$('responseError').textContent='Choose a response, enter a sample name and confirm the acknowledgement.';$('responseError').hidden=false;return;}
      const record={version:s.viewedVersion,choice,name,comment:$('responseComment').value.trim(),time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})};
      s.responses=s.responses.filter(x=>x.version!==record.version);s.responses.push(record);render();toast('Demo response recorded in this tab only. Nothing was sent.');
    });
    const survey=$('surveyForm');
    if(survey)survey.addEventListener('submit',e=>{e.preventDefault();s.survey=Object.fromEntries(new FormData(survey));render();toast('Sample survey saved in this tab. Quotation values are unchanged.');});
    const task=$('taskForm');
    if(task)task.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(task),title=String(f.get('title')).trim();if(!title)return; s.tasks.push({id:Math.max(...s.tasks.map(x=>x.id))+1,title,owner:String(f.get('owner')),due:String(f.get('due')),note:'Sample follow-up · '+(s.suggestion?'created from the current review context.':'manually entered.'),done:false});s.suggestion='';s.filter='open';render();toast('Sample follow-up added. No real reminder was scheduled.');});
  }
  document.addEventListener('click',e=>{
    const view=e.target.closest('[data-view]'); if(view){navigate(view.dataset.view);return;}
    const go=e.target.closest('[data-go]');if(go){navigate(go.dataset.go);return;}
    const rev=e.target.closest('[data-revision]');if(rev){s.selectedRevision=Number(rev.dataset.revision);render();return;}
    const filter=e.target.closest('[data-filter]');if(filter){s.filter=filter.dataset.filter;render();return;}
    const button=e.target.closest('button');if(!button)return;
    switch(button.id){
      case 'nextView':navigate(s.view==='customer'?'scope':'customer');break;
      case 'resetDemo':$('resetDialog').showModal();break;
      case 'cancelReset':$('resetDialog').close();break;
      case 'confirmReset':resetState();$('resetDialog').close();navigate('scope');toast('Sample workspace reset. No live data was affected.');break;
      case 'viewLatest':s.viewedVersion=latest().number;render();toast('Now viewing the latest published sample—not the working draft.');break;
      case 'openSelected':s.viewedVersion=s.selectedRevision;navigate('customer');break;
      case 'editResponse':s.responses=s.responses.filter(x=>x.version!==s.viewedVersion);render();break;
      case 'responseFollowup':{const r=s.responses.at(-1);s.suggestion=`Discuss ${responseLabels[r.choice].toLowerCase()} · Revision ${r.version}`;navigate('followups');break;}
      case 'surveyFollowup':s.suggestion='Verify roof measurements, access and shading';navigate('followups');break;
      case 'publishSample':{
        if(totals(s.draft.scopes).inclusionPending.length){toast('Confirm that included scope is already priced in Solar EPC first.');break;}
        const v=clone(s.draft);v.number=latest().number+1;v.date='21 Oct 2026 · demo';s.versions.push(v);s.draft=clone(v);s.dirty=false;s.selectedRevision=v.number;render();toast(`Sample Revision ${v.number} published in this tab. Old snapshots are unchanged.`);break;
      }
      case 'downloadExcel':{
        if(!window.XLSX){toast('Excel export did not load. Refresh the preview and try again.');break;}
        const v=latest(), rows=exportRows(v), ws=XLSX.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:62},{wch:100}];
        rows.forEach((row,i)=>{if(typeof row[1]==='number'&&i!==3)ws[XLSX.utils.encode_cell({r:i,c:1})].z='"₹" #,##0';});
        const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Customer quotation');
        XLSX.writeFile(wb,`DEMO-026_R${v.number}_Customer.xlsx`,{compression:true});toast('Sample customer Excel downloaded. No live quotation was exported.');break;
      }
    }
  });
  document.addEventListener('change',e=>{
    const target=e.target;
    if(target.matches('[data-mode],[data-requested],[data-confirm]')){
      const id=target.dataset.mode||target.dataset.requested||target.dataset.confirm, item=s.draft.scopes.find(x=>x.id===id);
      if(target.dataset.mode){item.mode=target.value;item.confirmed=false;}
      else if(target.dataset.requested)item.requested=target.checked;
      else item.confirmed=target.checked;
      s.dirty=JSON.stringify(s.draft.scopes)!==JSON.stringify(latest().scopes);
      const restore=target.id;render();if(restore)$(restore)?.focus({preventScroll:true});
    }
    if(target.matches('[data-task]')){const t=s.tasks.find(x=>x.id===Number(target.dataset.task));t.done=target.checked;render();toast(t.done?'Sample task completed. Proposal status is unchanged.':'Sample task reopened.');}
  });
  window.addEventListener('hashchange',()=>navigate(location.hash.slice(1)));
  navigate(location.hash.slice(1)||'scope',false);
})();
