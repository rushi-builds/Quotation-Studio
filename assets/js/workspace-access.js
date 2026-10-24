/* Account preparations + real, server-enforced access requests. No provider
 * credentials, OAuth grants, message content or financial values in storage. */
'use strict';
(() => {
  const api=window.PlatformAPI,$=id=>document.getElementById(id);
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const providerNames={gmail:'Gmail',outlook:'Outlook',whatsapp:'WhatsApp',instagram:'Instagram',linkedin:'LinkedIn',website:'Website','google-calendar':'Google Calendar','outlook-calendar':'Outlook Calendar'};
  let state=null,version=0,busy=false,dialog=null,returnFocus=null,accessTab='accounts',accountFilter='all';
  const identity=()=>window.QSDash?.user()?.id;
  const label=p=>state?.permissionLabels?.[p]||p;
  const btn=(action,caption,attrs='')=>`<button type="button" class="btn btn-secondary btn-sm" data-wa="${action}" ${attrs}>${h(caption)}</button>`;
  const pending=(resource,permission)=>state?.requests.some(r=>r.userId===state.self.id&&r.resource===resource&&r.permission===permission&&r.status==='pending');
  function requestButton(resource,permission){return btn('request',pending(resource,permission)?'Request pending':'Request access',`data-resource="${h(resource)}" data-permission="${h(permission)}" ${pending(resource,permission)||state?.readOnlyReview?'disabled':''}`);}
  function open(tab='accounts'){accessTab=['accounts','requests','permissions','history'].includes(tab)?tab:'accounts';window.QSDash?.showSettings('connections',true);$('workspaceAccess')?.scrollIntoView({block:'start',behavior:'smooth'});}
  function showDialog(title,html){
    returnFocus=document.activeElement;
    // Pin the identity/revision actually shown to the reviewer. A background
    // refresh must never silently upgrade an already-open approval form.
    dialog.dataset.revision=String(state?.revision??'');dialog.dataset.user=identity()||'';
    dialog.innerHTML=`<div class="sc-dialog-head"><h2 id="waDialogTitle">${h(title)}</h2>${btn('close','Close')}</div>${html}<p id="waError" role="alert"></p>`;
    if(state?.readOnlyReview){
      dialog.querySelectorAll('input,select,textarea,button[type="submit"]').forEach(el=>el.disabled=true);
      dialog.querySelector('.sc-dialog-head')?.insertAdjacentHTML('afterend','<p class="wa-preview-label">Read-only sample preview</p>');
    }
    dialog.showModal();
  }
  const reasonField=()=>'<label>Reason<textarea name="reason" required minlength="5" maxlength="500" rows="3"></textarea></label>';
  const duration=()=>'<label>Access duration<select name="days"><option value="30">30 days</option><option value="7">7 days</option><option value="90">90 days</option><option value="0">Until revoked</option></select></label>';
  const shortLabel=p=>({'member':'Membership','metrics.read':'Company insights','finance.read':'Financial reports','pricing.read':'Quotation pricing','followups.read':'Shared follow-ups','inbox.read':'Inbox','messages.send':'Replies','calendar.read':'Calendar','calendar.write':'Create events','connection.manage':'Account settings'}[p]||label(p));
  function symbol(name){
    const custom={refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',archive:'<path d="M4 8h16v12H4zM3 3h18v5H3zM9 12h6"/>'};
    return custom[name]?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+custom[name]+'</svg>':window.PulseBrand.symbol(name);
  }
  const iconButton=(action,icon,caption,attrs='')=>`<button type="button" class="btn btn-secondary btn-sm wa-icon-button" data-wa="${action}" aria-label="${h(caption)}" title="${h(caption)}" ${attrs}>${symbol(icon)}</button>`;
  const permissionIcon=p=>({'member':'person','metrics.read':'globe','finance.read':'shield','pricing.read':'layers','followups.read':'clock','inbox.read':'chat','messages.send':'arrow','calendar.read':'clock','calendar.write':'plus'}[p]||'settings');
  const statusPill=(text,tone='neutral')=>`<span class="wa-status wa-status-${tone}"><i aria-hidden="true"></i>${h(text)}</span>`;
  function selectTab(tab,focus=false){
    if(!['accounts','requests','permissions','history'].includes(tab))return;
    accessTab=tab;render();if(focus)$('wa-tab-'+tab)?.focus();
  }
  function accountCard(c,s){
    const rights=Object.entries(c.permissions).filter(([p])=>p!=='connection.manage');
    return `<article class="wa-account wa-account-card" data-wa-account="${h(c.id)}">
      <div class="wa-account-top"><span class="wa-provider-icon">${PulseBrand.badge(providerNames[c.provider]||c.provider,'card')}</span><span class="wa-scope">${symbol(c.scope==='company'?'layers':'person')}${c.scope==='company'?'Company':'Personal'}</span>${c.canManage?iconButton('archive',c.archived?'refresh':'archive',c.archived?'Restore account preparation':'Archive account preparation',`data-resource="${h(c.id)}" ${s.readOnlyReview?'disabled':''}`):''}</div>
      <h4 class="wa-account-name">${h(c.label)}</h4><span class="wa-provider-name">${h(providerNames[c.provider]||c.provider)}</span>
      <div class="wa-account-status">${statusPill(c.archived?'Archived':'Not connected',c.archived?'neutral':'pending')}</div>
      <div class="wa-rights" aria-label="Account permissions">${rights.map(([p,allowed])=>`<span class="wa-right ${allowed&&!c.archived?'is-allowed':'is-restricted'}" title="${h(label(p))}: ${c.archived?'Archived':allowed?'Allowed':'Restricted'}">${symbol(allowed&&!c.archived?'check':'lock')}<span>${h(shortLabel(p))}</span><span class="sc-sr-only"> · ${c.archived?'Archived':allowed?'Allowed':'Restricted'}</span></span>`).join('')}</div>
      <div class="wa-card-actions">${btn('account-details','Permissions',`data-resource="${h(c.id)}"`)}${c.canShare&&!c.archived?btn('share','Manage access',`data-resource="${h(c.id)}" ${s.readOnlyReview?'disabled':''}`):''}</div>
    </article>`;
  }
  function accountDetails(id){
    const c=state.connections.find(c=>c.id===id);if(!c)return;
    showDialog(c.label,`<div class="wa-detail-provider"><span class="wa-provider-icon">${PulseBrand.badge(providerNames[c.provider]||c.provider,'card')}</span><div><strong>${h(providerNames[c.provider]||c.provider)}</strong><p>${c.scope==='company'?'Company account':'Personal account'} · ${c.archived?'Archived':'Not connected'}</p></div></div><div class="wa-detail-permissions">${Object.entries(c.permissions).map(([p,allowed])=>`<div class="wa-detail-row"><span>${symbol(permissionIcon(p))}${h(label(p))}</span>${statusPill(c.archived?'Archived':allowed?'Allowed':'Restricted',allowed&&!c.archived?'allowed':'neutral')}${!allowed&&!c.archived&&c.scope==='company'?requestButton(c.id,p):''}</div>`).join('')}</div><p class="wa-note">Permissions control Studio access. Provider linking is separate.</p>`);
  }
  function historyEntry(e){
    const d=e.detail||{}, who=state.users.find(u=>u.id===d.userId)?.name||(d.userId===state.self.id?'You':'Former member');
    const resource=d.resource==='workspace'?'Company workspace':state.connections.find(c=>c.id===d.resource)?.label||d.label||'Account no longer available';
    const rows=[['Changed by',e.actorName||'Former member'],...(d.userId?[['For',who]]:[]),...(d.resource?[['Account',resource]]:[]),...(d.permission?[['Permission',label(d.permission)]]:[]),...(e.action==='Access granted'?[['Duration',d.expiresAt?new Date(d.expiresAt).toLocaleString():'Until revoked']]:[]),...(d.reason?[['Reason',d.reason]]:[])];
    const date=Number.isFinite(Date.parse(e.at))?new Date(e.at):null;
    return `<li><span class="wa-history-dot">${symbol('shield')}</span><div><strong>${h(e.action)}</strong><span>${h(e.actorName||'Former member')}</span><details class="wa-history-details"><summary>Details</summary><dl>${rows.map(([name,value])=>`<div><dt>${h(name)}</dt><dd>${h(value)}</dd></div>`).join('')}</dl></details></div><time ${date?`datetime="${h(e.at)}" title="${h(date.toLocaleString())}"`:''}>${date?h(date.toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})):'Date unavailable'}</time></li>`;
  }
  function render(){
    const root=$('workspaceAccess');if(!root||!state)return;
    const s=state;
    const add=$('connectionsAdd')?.querySelector('button');if(add)add.disabled=Boolean(s.readOnlyReview||!s.self.member);
    const pendingCount=s.requests.filter(r=>r.status==='pending').length;
    const visible=s.connections.filter(c=>accountFilter==='all'||c.scope===accountFilter);
    const accounts=visible.map(c=>accountCard(c,s)).join('');
    const workspace=Object.keys(s.workspacePermissions).map(p=>`<div class="wa-access-tile"><span class="wa-access-icon">${symbol(permissionIcon(p))}</span><div><strong>${h(shortLabel(p))}</strong><span>${s.permissions[p]?'Access allowed':'Restricted'}</span></div>${s.permissions[p]?`<span class="wa-access-check" aria-label="${h(label(p))}: allowed">${symbol('check')}</span>`:(s.self.member?requestButton('workspace',p):`<span class="wa-access-lock" aria-label="Membership required">${symbol('lock')}</span>`)}</div>`).join('');
    const requests=s.requests.slice().reverse().map(r=>{
      const canReview=r.userId!==s.self.id&&r.status==='pending'&&(s.self.manager&&r.resource==='workspace'||s.connections.some(c=>c.id===r.resource&&c.canShare));
      const status={pending:'Pending',approved:'Approved',rejected:'Declined',expired:'Expired',cancelled:'Cancelled'}[r.status]||r.status;
      return `<article class="wa-request-card"><div class="wa-request-person"><span class="wa-avatar" aria-hidden="true">${h(r.userName?.trim().charAt(0)||'?')}</span><div><strong>${h(r.userName)}</strong><span>${h(shortLabel(r.permission))} · ${h(r.resourceLabel)}</span></div>${statusPill(status,r.status==='pending'?'pending':r.status==='approved'?'allowed':'neutral')}</div><div class="wa-request-bottom"><details class="wa-request-context"><summary>Request details</summary><p>${h(r.reason)}</p>${r.reviewReason?`<p><strong>Decision</strong> · ${h(r.reviewReason)}</p>`:''}</details>${canReview?btn('review',s.readOnlyReview?'View request':'Review request',`data-request="${h(r.id)}"`):''}</div></article>`;
    }).join('');
    const history=s.audit.map(historyEntry).join('');
    const tabs=[['accounts','Accounts',s.connections.length],['requests','Requests',pendingCount],['permissions','My access',null],['history','History',null]];
    root.setAttribute('aria-busy','false');
    root.innerHTML=`<div class="wa-header"><div class="wa-header-title"><span class="wa-header-icon">${symbol('shield')}</span><div><h3>Accounts & access</h3><span>${s.connections.length} ${s.connections.length===1?'account':'accounts'} · Company & personal</span></div></div><div class="wa-actions">${iconButton('refresh','refresh','Refresh access')}${s.self.manager?btn('share','Team access',`data-resource="workspace" ${s.readOnlyReview?'disabled':''}`):''}${btn('prepare','+ Add account',`${s.readOnlyReview||!s.self.member?'disabled':''}`)}</div></div>
      <div class="wa-tabbar" role="tablist" aria-label="Accounts and access sections">${tabs.map(([key,name,count])=>`<button type="button" role="tab" id="wa-tab-${key}" data-wa="tab" data-tab="${key}" aria-controls="wa-panel-${key}" aria-selected="${accessTab===key}" tabindex="${accessTab===key?0:-1}">${name}${count!==null?`<span class="wa-tab-count ${key==='requests'&&count?'has-pending':''}">${count}</span>`:''}</button>`).join('')}</div>
      ${!s.self.member?`<div class="wa-membership-notice"><span>${symbol('shield')}Company approval required</span>${requestButton('workspace','member')}</div>`:''}
      <section role="tabpanel" tabindex="0" id="wa-panel-accounts" aria-labelledby="wa-tab-accounts" ${accessTab!=='accounts'?'hidden':''}><div class="wa-account-toolbar"><span>Your accounts</span><div class="wa-scope-filters" role="group" aria-label="Account ownership">${[['all','All'],['company','Company'],['personal','Personal']].map(([key,name])=>`<button type="button" data-wa="filter" data-filter="${key}" aria-pressed="${accountFilter===key}">${name}</button>`).join('')}</div></div><div class="wa-accounts">${accounts||`<div class="wa-empty">${symbol('layers')}<strong>${s.connections.length?'No accounts in this view':'No accounts yet'}</strong><span>${s.self.member?'Add an account to organise its permissions.':'Company accounts appear after approval.'}</span></div>`}</div></section>
      <section role="tabpanel" tabindex="0" id="wa-panel-requests" aria-labelledby="wa-tab-requests" ${accessTab!=='requests'?'hidden':''}><div class="wa-section-heading"><strong>Access requests</strong><span>${pendingCount?pendingCount+' pending':'All up to date'}</span></div><div class="wa-requests" id="workspaceAccessRequests">${requests||`<div class="wa-empty">${symbol('check')}<strong>You're all caught up</strong><span>New access requests will appear here.</span></div>`}</div></section>
      <section role="tabpanel" tabindex="0" id="wa-panel-permissions" aria-labelledby="wa-tab-permissions" ${accessTab!=='permissions'?'hidden':''}><div class="wa-section-heading"><strong>My workspace access</strong><span>Signed-in permissions</span></div><div class="wa-workspace">${workspace}</div></section>
      <section role="tabpanel" tabindex="0" id="wa-panel-history" aria-labelledby="wa-tab-history" ${accessTab!=='history'?'hidden':''}><div class="wa-section-heading"><strong>Access history</strong><span>Recent decisions</span></div>${history?`<ol class="wa-history">${history}</ol>`:`<div class="wa-empty">${symbol('clock')}<strong>No decisions yet</strong></div>`}</section>
      <div class="wa-footer"><span>${symbol('lock')}Account setup only · provider linking unavailable</span>${s.readOnlyReview?'<span class="wa-preview-label" title="No permissions or account changes can be saved here.">Read-only sample preview</span>':''}</div>`;
  }
  async function refresh(){
    const ticket=++version,uid=identity();
    state=null;
    const add=$('connectionsAdd')?.querySelector('button');if(add)add.disabled=true;
    const root=$('workspaceAccess');
    const restoreRefreshFocus=root?.contains(document.activeElement)&&document.activeElement.dataset.wa==='refresh';
    if(root){root.setAttribute('aria-busy','true');root.innerHTML='<div class="workspace-loading" role="status"><span>Loading account permissions…</span><div class="workspace-skeleton" aria-hidden="true"><i></i><i></i><i></i></div></div>';}

    // Clear any displayed company amounts while permissions are revalidated.
    document.querySelectorAll('[data-wa-sensitive]').forEach(n=>n.replaceChildren());
    try{
      const result=await api.workspaceAccess();
      if(ticket!==version||uid!==identity())return;
      state=result;render();
      if(restoreRefreshFocus&&document.activeElement===document.body)root?.querySelector('[data-wa=refresh]')?.focus();
      const pulse=$('workspacePulse');if(pulse)await renderPulse(pulse,ticket);
    }catch(e){
      if(ticket!==version)return;
      if(root){root.setAttribute('aria-busy','false');root.innerHTML=`<p role="status">${h(e.code==='PREVIEW_BACKEND_DISABLED'?'Access management requires the authenticated Studio backend. This preview cannot change permissions.':e.message)}</p>${btn('refresh','Retry')}`;}
      const pulse=$('workspacePulse');if(pulse)pulse.innerHTML='<p>Company access is unavailable.</p>'+btn('open','Manage in Settings');
    }
  }
  async function submit(command,fields){
    if(busy||!state||state.readOnlyReview)return;
    if(dialog.dataset.user!==identity()){dialog.close();return;}
    busy=true;const uid=identity(),revision=Number(dialog.dataset.revision);
    const save=dialog.querySelector('button[type=submit]'),caption=save?.textContent;
    dialog.setAttribute('aria-busy','true');if(save)save.textContent='Saving…';
    dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
    try{
      const result=await api.workspaceCommand(command,{...fields,revision});
      if(uid!==identity())return;
      state=result;version++;render();dialog.close();window.QSDash?.toast('Access settings saved. No provider action performed.');
      const pulse=$('workspacePulse');if(pulse)await renderPulse(pulse,version);
      window.QSDashHome?.refresh();
    }catch(e){
      if(uid!==identity())return;
      if($('waError'))$('waError').textContent=e.message;
      // Never replay an approval or grant automatically after a conflict.
      if(e.status===409){state=null;dialog.close();await refresh();window.QSDash?.toast(e.message);}
    }finally{busy=false;dialog.setAttribute('aria-busy','false');if(save)save.textContent=caption;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  function prepare(){
    showDialog('Prepare an account',`<form data-wa-form="connections"><label>Service<select name="provider">${Object.entries(providerNames).map(([p,name])=>`<option value="${p}">${name}</option>`).join('')}</select></label><label>Account name<input name="label" required maxlength="100" placeholder="e.g. KTM sales mailbox"></label><label>Ownership<select name="scope"><option value="personal">My individual account · private by default</option>${state.self.manager?'<option value="company">Company account</option>':''}</select></label><p class="wa-note">Use an account nickname. Do not enter passwords, tokens or private messages. Provider consent will be a separate step.</p><button type="submit" class="btn btn-primary">Save preparation</button></form>`);
  }
  function share(resource){
    const c=state.connections.find(c=>c.id===resource);
    if(resource==='workspace'&&!state.self.manager||resource!=='workspace'&&!c?.canShare)return;
    const permissions=resource==='workspace'?Object.keys(state.workspacePermissions):state.providers[c.provider];
    const grants=state.grants.filter(g=>g.resource===resource);
    showDialog(resource==='workspace'?'Company access':c.label+' · access',`<form data-wa-form="grant" data-resource="${h(resource)}"><label>Team member<select name="userId" required><option value="">Choose a person</option>${state.users.map(u=>`<option value="${h(u.id)}">${h(u.name)}</option>`).join('')}</select></label><label>Permission<select name="permission">${permissions.map(p=>`<option value="${h(p)}">${h(label(p))}</option>`).join('')}</select></label><label>Decision<select name="decision"><option value="allow">Allow</option><option value="deny">Revoke / block</option></select></label>${duration()}${reasonField()}<button type="submit" class="btn btn-primary">Save access decision</button></form><details><summary>Recorded decisions</summary>${grants.map(g=>`<p>${h(state.users.find(u=>u.id===g.userId)?.name||'Former member')} · ${h(label(g.permission))} · ${g.decision==='deny'?'Revoked':g.expiresAt&&Date.parse(g.expiresAt)<=Date.now()?'Expired':'Allowed'}<br><small>${g.expiresAt?'Until '+h(new Date(g.expiresAt).toLocaleString()):'Until changed'}</small></p>`).join('')||'<p>No explicit decisions yet. Owner authority and standard sales access come from Team roles.</p>'}</details>`);
  }
  async function renderPulse(root,ticket=version){
    if(!root.isConnected)return;
    root.innerHTML='<p role="status">Checking company access…</p>';
    if(!state){root.innerHTML='<p>Company access is unavailable.</p>'+btn('open','Manage in Settings');return;}
    if(!state.permissions['metrics.read']){root.innerHTML='<div class="wa-heading"><strong>Company workspace</strong><span>Owner approval required</span></div>'+requestButton('workspace',state.self.member?'metrics.read':'member');return;}
    const uid=identity();
    try{
      const p=await api.workspacePulse();
      if(ticket!==version||uid!==identity()||!root.isConnected)return;
      const m=p.metrics;
      root.innerHTML=`<div class="wa-heading"><strong>Company workspace</strong>${btn('open','Accounts & access')}</div><div class="wa-company-metrics">${[['Quotations',m.quotations],['Accepted',m.accepted],['Open follow-ups',m.openFollowups],['Overdue',m.overdueFollowups]].map(([name,value])=>`<div><span>${h(name)}</span><strong>${h(value)}</strong></div>`).join('')}</div>${p.channels.length?`<div class="wa-channel-summary">${p.channels.map(c=>`<span>${h(c.label)} · ${h(providerNames[c.provider])}: — <small>Not connected</small></span>`).join('')}</div>`:''}<div class="wa-finance"><strong>Company quoted value</strong>${p.financeAllowed?'<div data-wa-sensitive id="waCompanyFinance">Loading…</div>':requestButton('workspace','finance.read')}</div><details><summary>Shared company follow-ups</summary>${p.followupsAllowed?'<div id="waCompanyTasks" data-wa-sensitive>Loading…</div>':requestButton('workspace','followups.read')}</details>`;
      if(p.financeAllowed){
        const f=await api.workspaceFinance();if(ticket!==version||uid!==identity()||!root.isConnected)return;
        const target=root.querySelector('#waCompanyFinance');if(target)target.innerHTML=`<strong>${f.proposalsWithValue?new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(f.quotedSum):'—'}</strong><small>${h(f.proposalsWithValue)} priced · ${h(f.proposalsMissingValue)} missing · not revenue</small>`;
      }
      if(p.followupsAllowed){
        const f=await api.workspaceFollowups();if(ticket!==version||uid!==identity()||!root.isConnected)return;
        const target=root.querySelector('#waCompanyTasks');if(target)target.innerHTML=f.tasks.map(t=>`<p><strong>${h(t.title)}</strong> · ${h(t.status)}<br><small>${t.dueAt?h(new Date(t.dueAt).toLocaleString()):'No due date'}</small></p>`).join('')||'<p>No shared follow-ups.</p>';
      }
    }catch(e){if(ticket===version&&root.isConnected)root.innerHTML='<p>Company data is unavailable. Access may have changed.</p>'+btn('refresh','Refresh access');}
  }
  function mountPulse(container){
    if(container.querySelector('#workspacePulse'))return;
    const section=document.createElement('section');section.id='workspacePulse';section.className='gh-card wa-pulse';
    const after=container.querySelector('.pulse-visual-metrics');if(after)after.after(section);else container.append(section);
    if(state)renderPulse(section);else refresh();
  }
  function mount(){
    const root=$('connectionsContent');if(!root)return;
    const section=document.createElement('section');section.id='workspaceAccess';section.className='wa-access';section.setAttribute('aria-label','Accounts and access');section.innerHTML='<p>Open Accounts & access to load your permissions.</p>'+btn('refresh','Load access');
    root.querySelector('.sc-toolbar')?.before(section);
    dialog=document.createElement('dialog');dialog.id='workspaceAccessDialog';dialog.className='sc-dialog wa-dialog';dialog.setAttribute('aria-labelledby','waDialogTitle');document.body.append(dialog);
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    dialog.addEventListener('close',()=>{if(returnFocus?.isConnected)returnFocus.focus();});
    dialog.addEventListener('submit',event=>{
      const form=event.target.closest('[data-wa-form]');if(!form)return;event.preventDefault();const data=Object.fromEntries(new FormData(form));
      if(form.dataset.resource)data.resource=form.dataset.resource;
      if(form.dataset.request)data.requestId=form.dataset.request;
      if('days'in data)data.days=Number(data.days);
      if('archived'in data)data.archived=data.archived==='true';
      submit(form.dataset.waForm,data);
    });
    if(identity())refresh();
  }
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-workspace-access]')){event.preventDefault();$('bellDrop')?.classList.remove('on');open('requests');return;}
    const b=event.target.closest('[data-wa]');if(!b||b.disabled)return;
    if(b.dataset.wa==='open'){open();return;}
    if(b.dataset.wa==='tab'){selectTab(b.dataset.tab,true);return;}
    if(b.dataset.wa==='filter'){accountFilter=['all','company','personal'].includes(b.dataset.filter)?b.dataset.filter:'all';render();$('workspaceAccess')?.querySelector('[data-filter="'+accountFilter+'"]')?.focus();return;}
    if(b.dataset.wa==='refresh'){refresh();return;}
    if(b.dataset.wa==='close'){dialog.close();return;}
    if(!state||busy)return;
    if(b.dataset.wa==='account-details')accountDetails(b.dataset.resource);
    if(b.dataset.wa==='prepare')prepare();
    if(b.dataset.wa==='share')share(b.dataset.resource);
    if(b.dataset.wa==='request'){
      const resource=b.dataset.resource,permission=b.dataset.permission;
      showDialog('Request '+label(permission),`<form data-wa-form="requests" data-resource="${h(resource)}"><input type="hidden" name="permission" value="${h(permission)}">${reasonField()}<p class="wa-note">Requests expire after 7 days. Approval grants only the permission named above.</p><button type="submit" class="btn btn-primary">Submit request</button></form>`);
    }
    if(b.dataset.wa==='review'){
      const r=state.requests.find(r=>r.id===b.dataset.request);if(!r)return;
      showDialog('Review access request',`<p><strong>${h(r.userName)}</strong> requests ${h(label(r.permission))} for ${h(r.resourceLabel)}.</p><p>${h(r.reason)}</p><form data-wa-form="review" data-request="${h(r.id)}"><label>Decision<select name="decision"><option value="approve">Approve this permission only</option><option value="reject">Reject</option></select></label>${duration()}${reasonField()}<button type="submit" class="btn btn-primary">Confirm decision</button></form>`);
    }
    if(b.dataset.wa==='archive'){
      const c=state.connections.find(c=>c.id===b.dataset.resource);if(!c)return;
      showDialog(c.archived?'Restore preparation':'Archive preparation',`<p>${c.archived?'Restoring does not restore old grants.':'Existing explicit grants will be revoked and pending requests cancelled. No external provider is disconnected by this action.'}</p><form data-wa-form="archive"><input type="hidden" name="connectionId" value="${h(c.id)}"><input type="hidden" name="archived" value="${!c.archived}">${reasonField()}<button type="submit" class="btn btn-primary">Confirm</button></form>`);
    }
  });
  document.addEventListener('keydown',event=>{
    const tab=event.target.closest('#workspaceAccess [role="tab"]');
    if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const keys=['accounts','requests','permissions','history'],index=keys.indexOf(tab.dataset.tab);
    selectTab(event.key==='Home'?keys[0]:event.key==='End'?keys[3]:keys[(index+(event.key==='ArrowRight'?1:3))%4],true);
  });
  document.addEventListener('qs:settings',e=>{if(e.detail==='connections')refresh();});
  document.addEventListener('qs:session',()=>{version++;state=null;accessTab='accounts';accountFilter='all';dialog?.close();if($('workspaceAccess'))refresh();});
  window.addEventListener('focus',()=>{if(identity()&&($('panel-sales')?.classList.contains('on')||!document.querySelector('[data-settings-section="connections"]')?.hidden&&$('panel-settings')?.classList.contains('on')))refresh();});
  window.StudioWorkspaceAccess=Object.freeze({open,refresh,mountPulse});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
