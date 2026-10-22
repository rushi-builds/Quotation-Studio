/* Preview access controls and reversible alert / connection management. */
'use strict';
(() => {
  const G=PulseGovernance,O=PulseOperations;
  const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const actors={}; /* demo actors removed for production — identity comes from the signed-in Studio user */
  let ctx,actor=null; /* identity wired via PulseAccess.trustActor() from the signed-in Studio user */
  const local=()=>Boolean(window.PulseStorage?.enabled),canEdit=()=>G.manage(actor);
  const locked=()=>!window.PulseData?.writable||!canEdit();
  const button=(action,label,id='',disabled=false)=>'<button type="button" class="gh-secondary" data-gov-action="'+action+'" data-id="'+h(id)+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
  const time=v=>v?new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(v))+' IST':'—';
  const mutable=new Set(['save','new-lead','new-task','new-event','complete','rule','new-rule','simulate','connection','handle-thread','rule-state','run-internal','compose','job-approve','job-cancel','test-reply','pause-customer','optout-customer','permission','quiet-hours','plan-task']);
  function allowLegacy(action){return !mutable.has(action)||canEdit();}
  async function perform(command){
    if(!window.PulseData?.writable){ctx.close();ctx.announce('Saving is unavailable: the Studio persistence backend is not connected yet. Nothing changed.');return;}
    if(local())await PulseStorage.control(command);
    else G.execute(ctx.state,actor,command,Date.now());
    ctx.close();ctx.render();ctx.announce('Control saved. No customer record deleted and no provider connected.');
  }
  function addCard(){return '<section class="gh-card pg-add-card"><div class="pg-add-icon">'+PulseBrand.symbol('plus')+'</div><h2>Add connection</h2><p>Another service. Another account.<br>One organised Studio workspace.</p>'+button('add','+ Add connection','',locked())+'<small>Setup preparations only · connect/sync requires an authorised adapter.</small>'+button('connection-history','Archived setups · '+G.state(ctx.state).connections.filter(c=>c.archived).length)+'</section>';}
  function extraCards(){return G.state(ctx.state).connections.filter(c=>!c.archived).map(c=>'<section class="gh-card pg-extra"><div>'+ (PulseBrand.badge(c.provider,'card')||'<span class="pg-generic">'+PulseBrand.symbol('layers')+'</span>')+'</div><h2>'+h(c.provider)+'</h2><span class="pg-status">NOT CONNECTED · ADAPTER REQUIRED</span><p>'+h(c.label)+'</p><dl><dt>Desired cadence</dt><dd>'+h(c.cadence)+' · not scheduled</dd><dt>Last successful sync</dt><dd>—</dd><dt>Data through</dt><dd>—</dd></dl><div class="gh-actions">'+button('edit-connection','Configure',c.id,locked())+'<button class="gh-secondary" disabled>Sync</button>'+button('archive-connection','Archive',c.id,locked())+'</div></section>').join('');}
  function decorate(){
    if(ctx.state.tab==='connections'&&!document.querySelector('.pg-add-card'))document.querySelector('.bi-connections')?.insertAdjacentHTML('beforeend',extraCards()+addCard());
    if(ctx.state.tab==='desk'&&!document.querySelector('[data-gov-action="alert-history"]'))document.querySelector('.pulse-hero-strip')?.insertAdjacentHTML('beforeend',button('alert-history','Managed alerts & requests'));
    lockLegacy();
  }
  function lockLegacy(){
    if(!canEdit()){
      for(const root of [document.getElementById('panel-sales'),document.getElementById('ghDialog')]){
        root?.querySelectorAll('[data-bi-action],[data-pulse-action]').forEach(b=>{if(mutable.has(b.dataset.biAction||b.dataset.pulseAction)){b.disabled=true;b.title='Owner / Admin only';}});
        root?.querySelectorAll('#biLeadForm input,#biLeadForm select,#biLeadForm textarea,#biLeadForm button[type="submit"],#ghDialogBody form:not([data-gov-form]) input,#ghDialogBody form:not([data-gov-form]) select,#ghDialogBody form:not([data-gov-form]) textarea,#ghDialogBody form:not([data-gov-form]) button[type="submit"],[data-pulse-customer-complete]').forEach(b=>{b.disabled=true;});
      }
    }
  }
  function rowControls(row){const allowed=canEdit()||(actor&&actor.role==='Member'&&row.owner===actor.ownerName);return '<div class="pg-row-controls">'+button('alert','Manage alert',row.id,allowed?(!window.PulseData?.writable):true)+'</div>';}
  function addDialog(){
    ctx.dialog('Add connections','Multi-select service preparations · no OAuth or credentials requested','<form data-gov-form="add"><label class="gh-field"><span>Search services</span><input id="pgSearch" type="search" placeholder="Search a service…"></label><div class="pg-catalog">'+G.catalog.map(provider=>'<label data-catalog-name="'+h(provider.toLowerCase())+'"><input type="checkbox" name="provider" value="'+h(provider)+'">'+(PulseBrand.badge(provider,'mini')||PulseBrand.symbol('layers'))+'<span>'+h(provider)+'</span></label>').join('')+'</div><label class="gh-field"><span>Account label / batch prefix</span><input name="label" maxlength="80" required placeholder="e.g. Sales mailbox or Operations"></label><p class="gh-note">You can add another account of the same service with a different label. Extra services are not installed integrations. No account is connected and no sync runs here.</p><p id="pgError" role="status" class="gh-validation"></p><button class="gh-primary" type="submit">Add selected preparations</button></form>');
  }
  function editConnection(id){const c=G.state(ctx.state).connections.find(c=>c.id===id&&!c.archived);if(!c)return;
    ctx.dialog(c.provider+' setup','Additional account preparation · sender / adapter remains disconnected','<form data-gov-form="edit" data-id="'+h(id)+'"><div class="gh-fields"><label class="gh-field full"><span>Account label</span><input name="label" required maxlength="100" value="'+h(c.label)+'"></label><label class="gh-field"><span>Desired cadence · not a running job</span><select name="cadence">'+['Manual','Hourly','Daily'].map(v=>'<option '+(v===c.cadence?'selected':'')+'>'+v+'</option>').join('')+'</select></label><label class="gh-field full"><span>Purpose / notes · no secrets</span><textarea name="purpose" maxlength="500">'+h(c.purpose)+'</textarea></label></div><p class="gh-note">OAuth, approved access, a secure provider adapter and sync health verification are required before connection. No tokens, passwords or arbitrary webhook URLs are collected.</p><p id="pgError" role="status" class="gh-validation"></p><button type="submit" class="gh-primary">Save preparation</button></form>');
  }
  function reasonDialog(type,id,title){ctx.dialog(title,'Reversible control · reason is recorded in audit history','<form data-gov-form="reason" data-type="'+h(type)+'" data-id="'+h(id)+'"><label class="gh-field"><span>Reason (required)</span><textarea name="reason" minlength="5" maxlength="500" required></textarea></label><p id="pgError" role="status" class="gh-validation"></p><button type="submit" class="gh-primary">Confirm</button></form>');}
  function alertDialog(id){const row=O.desk(ctx.state,Date.now()).find(r=>r.id===id);if(!row)return;const manager=canEdit();
    ctx.dialog('Manage '+row.kind+' alert',String(row.company).replace(' · Sample','')+' · '+row.detail,'<form data-gov-form="alert" data-id="'+h(id)+'" data-signature="'+h(G.signature(ctx.state,row))+'"><label class="gh-field"><span>Action</span><select name="operation">'+(manager?'<option value="alerts.dismiss">Dismiss this occurrence</option>':'<option value="alerts.request">Request dismissal · Owner/Admin review</option>')+'<option value="alerts.snooze">Snooze temporarily</option></select></label><label class="gh-field"><span>Snooze duration (only used for Snooze)</span><select name="duration"><option value="1">1 hour</option><option value="24">1 day</option>'+(manager?'<option value="168">7 days</option>':'')+'</select></label><label class="gh-field"><span>Reason (required)</span><textarea name="reason" required minlength="5" maxlength="500"></textarea></label><p class="gh-note">This hides only this alert occurrence. The customer is NOT deleted; tasks remain open, inbox status and automation behaviour are unchanged. Snoozes expire automatically; changed underlying context raises a fresh alert.</p><p id="pgError" role="status" class="gh-validation"></p><button type="submit" class="gh-primary">Save alert control</button></form>');
  }
  function history(kind){const gov=G.state(ctx.state),manager=canEdit(),now=Date.now();
    if(kind==='connections')ctx.dialog('Archived connection preparations','Restore is Owner/Admin only · no real account disconnection or data deletion','<div class="pg-history">'+gov.connections.filter(c=>c.archived).map(c=>'<article><strong>'+h(c.provider)+' · '+h(c.label)+'</strong>'+button('restore-connection','Restore',c.id,!manager)+'</article>').join('')+(gov.connections.some(c=>c.archived)?'':'<p>No archived preparations.</p>')+'</div>'+audit(gov.audit.filter(a=>a.action.startsWith('Connection'))));
    else ctx.dialog('Managed alerts & review requests','Only alert visibility changes. Customer records and the original evidence are retained.','<h3>Review requests</h3><div class="pg-history">'+gov.requests.slice().reverse().map(r=>'<article><div><strong>'+h(r.company)+' · '+h(r.kind)+'</strong><p>'+h(r.reason)+'</p><small>'+h(r.actor)+' · '+h(r.status)+' · '+time(r.at)+(r.reviewedAt?' · reviewed '+time(r.reviewedAt)+' / '+h(r.reviewedBy)+' · '+h(r.reviewReason):'')+'</small></div>'+(r.status==='Pending'?'<div>'+button('approve-request','Approve',r.id,!manager)+button('reject-request','Reject',r.id,!manager)+'</div>':'')+'</article>').join('')+(gov.requests.length?'':'<p>No review requests.</p>')+'</div><h3>Dismissed / snoozed occurrences</h3><div class="pg-history">'+gov.alerts.slice().reverse().map(a=>'<article><div><strong>'+h(a.company)+' · '+h(a.kind)+'</strong><p>'+h(a.reason)+'</p><small>'+h(a.mode)+' · '+h(G.status(ctx.state,a,now))+' · '+h(a.actor)+' / '+h(a.role)+(a.until?' · until '+time(a.until):'')+'</small></div>'+(a.status==='Hidden'?button('restore-alert','Restore',a.id,!manager):'')+'</article>').join('')+(gov.alerts.length?'':'<p>No managed alerts.</p>')+'</div>'+audit(gov.audit.filter(a=>!a.action.startsWith('Connection'))));
  }
  function audit(rows){return '<details class="pg-audit"><summary>Control audit · '+rows.length+'</summary>'+rows.slice(0,100).map(a=>'<p><strong>'+h(a.action)+'</strong><br>'+h(a.detail)+'<br><small>'+h(a.actor)+' / '+h(a.role)+' · '+time(a.at)+'</small></p>').join('')+'</details>';}
  function mount(context){ctx=context;ctx.state.governance ||= G.empty();
    document.addEventListener('click',event=>{const target=event.target.closest('[data-gov-action]');if(!target||target.disabled)return;const action=target.dataset.govAction,id=target.dataset.id;
      if(action==='add')addDialog();if(action==='edit-connection')editConnection(id);if(action==='connection-history')history('connections');if(action==='alert-history')history('alerts');if(action==='alert')alertDialog(id);
      const reasons={'archive-connection':['connections.archive','Archive preparation'],'restore-connection':['connections.restore','Restore preparation'],'restore-alert':['alerts.restore','Restore alert'],'approve-request':['requests.approve','Approve dismissal request'],'reject-request':['requests.reject','Reject dismissal request']};if(reasons[action])reasonDialog(reasons[action][0],id,reasons[action][1]);
    });
    setInterval(()=>{if(['desk','overview'].includes(ctx.state.tab)&&!document.hidden&&!document.getElementById('ghDialog')?.open&&!window.PulseStorage?.dirty&&!document.activeElement?.matches('input,select,textarea'))ctx.render();},60000);
    document.addEventListener('input',event=>{if(event.target.id==='pgSearch'){const q=event.target.value.toLowerCase().trim();document.querySelectorAll('[data-catalog-name]').forEach(row=>{row.hidden=!row.dataset.catalogName.includes(q);});}});
    document.addEventListener('submit',async event=>{const form=event.target.closest('[data-gov-form]');if(!form)return;event.preventDefault();const values=Object.fromEntries(new FormData(form));let command;
      try{if(form.dataset.govForm==='add'){const selected=new FormData(form).getAll('provider');command={type:'connections.add',items:selected.map(provider=>({provider,label:values.label.trim()+(selected.length>1?' · '+provider:'')}))};}
        if(form.dataset.govForm==='edit')command={type:'connections.edit',id:form.dataset.id,...values};
        if(form.dataset.govForm==='reason')command={type:form.dataset.type,id:form.dataset.id,reason:values.reason};
        if(form.dataset.govForm==='alert')command={type:values.operation,rowId:form.dataset.id,signature:form.dataset.signature,reason:values.reason,until:new Date(Date.now()+Number(values.duration)*3600000).toISOString()};
        await perform(command);
      }catch(error){const errorNode=document.getElementById('pgError');if(errorNode)errorNode.textContent=error.message;else ctx.announce(error.message);}
    });
  }
  window.PulseAccess=Object.freeze({canEdit,allowLegacy,get actor(){return actor;},trustActor(value){if(value?.id&&G.roles.includes(value.role))actor=value;}});
  window.PulseGovernanceUI=Object.freeze({mount,decorate,lockLegacy,rowControls,history});
})();
