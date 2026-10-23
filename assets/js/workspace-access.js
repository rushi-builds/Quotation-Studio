/* Account preparations + real, server-enforced access requests. No provider
 * credentials, OAuth grants, message content or financial values in storage. */
'use strict';
(() => {
  const api=window.PlatformAPI,$=id=>document.getElementById(id);
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const providerNames={gmail:'Gmail',outlook:'Outlook',whatsapp:'WhatsApp',instagram:'Instagram',linkedin:'LinkedIn',website:'Website','google-calendar':'Google Calendar','outlook-calendar':'Outlook Calendar'};
  let state=null,version=0,busy=false,dialog=null,returnFocus=null;
  const identity=()=>window.QSDash?.user()?.id;
  const label=p=>state?.permissionLabels?.[p]||p;
  const btn=(action,caption,attrs='')=>`<button type="button" class="btn btn-secondary btn-sm" data-wa="${action}" ${attrs}>${h(caption)}</button>`;
  const pending=(resource,permission)=>state?.requests.some(r=>r.userId===state.self.id&&r.resource===resource&&r.permission===permission&&r.status==='pending');
  function requestButton(resource,permission){return btn('request',pending(resource,permission)?'Request pending':'Request access',`data-resource="${h(resource)}" data-permission="${h(permission)}" ${pending(resource,permission)||state?.readOnlyReview?'disabled':''}`);}
  function open(){window.QSDash?.showSettings('connections',true);$('workspaceAccess')?.scrollIntoView({block:'start',behavior:'smooth'});}
  function showDialog(title,html){
    returnFocus=document.activeElement;
    // Pin the identity/revision actually shown to the reviewer. A background
    // refresh must never silently upgrade an already-open approval form.
    dialog.dataset.revision=String(state?.revision??'');dialog.dataset.user=identity()||'';
    dialog.innerHTML=`<div class="sc-dialog-head"><h2 id="waDialogTitle">${h(title)}</h2>${btn('close','Close')}</div>${html}<p id="waError" role="alert"></p>`;
    dialog.showModal();
  }
  const reasonField=()=>'<label>Reason<textarea name="reason" required minlength="5" maxlength="500" rows="3"></textarea></label>';
  const duration=()=>'<label>Access duration<select name="days"><option value="30">30 days</option><option value="7">7 days</option><option value="90">90 days</option><option value="0">Until revoked</option></select></label>';
  function render(){
    const root=$('workspaceAccess');if(!root||!state)return;
    const s=state;
    const add=$('connectionsAdd')?.querySelector('button');if(add)add.disabled=Boolean(s.readOnlyReview||!s.self.member);
    const accounts=s.connections.map(c=>`<article class="wa-account" data-wa-account="${h(c.id)}"><div class="wa-heading"><strong>${h(c.label)}</strong><span>${h(providerNames[c.provider]||c.provider)} · ${c.scope==='company'?'Company':'Personal'} · ${c.archived?'Archived':'Not connected'}</span></div><div class="wa-actions">${Object.entries(c.permissions).filter(([p])=>p!=='connection.manage').map(([p,allowed])=>`<span class="wa-permission">${h(label(p))}: ${c.archived?'Archived':allowed?'Allowed': 'Restricted'} ${!allowed&&!c.archived&&c.scope==='company'?requestButton(c.id,p):''}</span>`).join('')}${c.canShare&&!c.archived?btn('share','Manage access',`data-resource="${h(c.id)}" ${s.readOnlyReview?'disabled':''}`):''}${c.canManage?btn('archive',c.archived?'Restore':'Archive',`data-resource="${h(c.id)}" ${s.readOnlyReview?'disabled':''}`):''}</div></article>`).join('');
    const workspace=Object.entries(s.workspacePermissions).map(([p,name])=>`<div class="wa-permission"><span>${h(name)}</span><strong>${s.permissions[p]?'Allowed':'Restricted'}</strong>${!s.permissions[p]&&(s.self.member||p==='member')?requestButton('workspace',p):''}</div>`).join('');
    const requests=s.requests.slice().reverse().map(r=>{
      const canReview=r.userId!==s.self.id&&r.status==='pending'&&(s.self.manager&&r.resource==='workspace'||s.connections.some(c=>c.id===r.resource&&c.canShare));
      return `<article class="wa-account"><div><strong>${h(r.userName)} · ${h(label(r.permission))}</strong><p>${h(r.resourceLabel)} · ${h(r.status)}</p><p>${h(r.reason)}</p>${r.reviewReason?`<small>Decision: ${h(r.reviewReason)}</small>`:''}</div>${canReview?`<div class="wa-actions">${btn('review','Review request',`data-request="${h(r.id)}" ${s.readOnlyReview?'disabled':''}`)}</div>`:''}</article>`;
    }).join('');
    root.innerHTML=`<div class="wa-heading"><div><h3>Accounts & access</h3><p>Company tools, personal accounts and explicit permissions.</p></div><div class="wa-actions">${btn('refresh','Refresh')}${btn('prepare','+ Prepare account',s.readOnlyReview||!s.self.member?'disabled':'')}${s.self.manager?btn('share','Manage team access',`data-resource="workspace" ${s.readOnlyReview?'disabled':''}`):''}</div></div>${s.readOnlyReview?'<p class="wa-note">Read-only sample preview. No permission or account changes can be saved here.</p>':''}<p class="wa-note">Preparations do not connect a provider. No inbox, sync or sender is enabled yet.</p><div class="wa-workspace">${workspace}</div><div class="wa-accounts">${accounts||'<p>No accounts prepared yet.</p>'}</div><details class="wa-requests" id="workspaceAccessRequests" ${s.pendingReviews?'open':''}><summary>Access requests ${s.pendingReviews?`· ${s.pendingReviews} awaiting review`:''}</summary>${requests||'<p>No access requests.</p>'}</details><details><summary>Recent access history</summary>${s.audit.map(e=>`<p><strong>${h(e.action)}</strong> · ${h(e.actorName)}<br><small>${h(new Date(e.at).toLocaleString())}</small></p>`).join('')||'<p>No access decisions yet.</p>'}</details>`;
  }
  async function refresh(){
    const ticket=++version,uid=identity();
    state=null;
    const add=$('connectionsAdd')?.querySelector('button');if(add)add.disabled=true;
    const root=$('workspaceAccess');if(root)root.innerHTML='<p role="status">Loading account permissions…</p>';
    // Clear any displayed company amounts while permissions are revalidated.
    document.querySelectorAll('[data-wa-sensitive]').forEach(n=>n.replaceChildren());
    try{
      const result=await api.workspaceAccess();
      if(ticket!==version||uid!==identity())return;
      state=result;render();
      const pulse=$('workspacePulse');if(pulse)await renderPulse(pulse,ticket);
    }catch(e){
      if(ticket!==version)return;
      if(root)root.innerHTML=`<p role="status">${h(e.code==='PREVIEW_BACKEND_DISABLED'?'Access management requires the authenticated Studio backend. This preview cannot change permissions.':e.message)}</p>${btn('refresh','Retry')}`;
      const pulse=$('workspacePulse');if(pulse)pulse.innerHTML='<p>Company access is unavailable.</p>'+btn('open','Manage in Settings');
    }
  }
  async function submit(command,fields){
    if(busy||!state||state.readOnlyReview)return;
    if(dialog.dataset.user!==identity()){dialog.close();return;}
    busy=true;const uid=identity(),revision=Number(dialog.dataset.revision);
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
    }finally{busy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
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
    if(event.target.closest('[data-workspace-access]')){event.preventDefault();$('bellDrop')?.classList.remove('on');open();return;}
    const b=event.target.closest('[data-wa]');if(!b||b.disabled)return;
    if(b.dataset.wa==='open'){open();return;}
    if(b.dataset.wa==='refresh'){refresh();return;}
    if(b.dataset.wa==='close'){dialog.close();return;}
    if(!state||busy)return;
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
  document.addEventListener('qs:settings',e=>{if(e.detail==='connections')refresh();});
  document.addEventListener('qs:session',()=>{version++;state=null;dialog?.close();if($('workspaceAccess'))refresh();});
  window.addEventListener('focus',()=>{if(identity()&&($('panel-sales')?.classList.contains('on')||!document.querySelector('[data-settings-section="connections"]')?.hidden&&$('panel-settings')?.classList.contains('on')))refresh();});
  window.StudioWorkspaceAccess=Object.freeze({open,refresh,mountPulse});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
