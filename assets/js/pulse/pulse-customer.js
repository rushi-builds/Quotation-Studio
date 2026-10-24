/* Compact customer workspace. Domain records/permissions remain owned by existing controllers. */
'use strict';
(() => {
  const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sections = ['timeline', 'details', 'tasks', 'conversations'];
  const format = value => new Intl.DateTimeFormat('en-IN', {timeZone:'Asia/Kolkata',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
  let context, currentLead;
  function select(key, focus = false) {
    if (!sections.includes(key)) return;
    document.querySelectorAll('#pulseCustomerTabs [role="tab"]').forEach(tab => {
      const active = tab.dataset.customerSection === key;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll('#pulseCustomerPanels > [role="tabpanel"]').forEach(panel => { panel.hidden = panel.dataset.section !== key; });
    if (focus) document.querySelector('#pulseCustomerTabs [data-customer-section="'+key+'"]')?.focus();
  }
  function organize(ctx, lead) {
    context = ctx; currentLead = lead.id;
    const root = document.getElementById('ghDialogBody'), history = root.querySelector(':scope > .pulse-customer');
    if (!history) return;
    const details = [...root.children].filter(node => node !== history);
    const flags = history.querySelector('.pulse-customer-flags'), controls = history.querySelector(':scope > .gh-actions');
    history.querySelector('.pulse-section-title')?.remove();
    history.className = 'pulse-customer-history';
    const data = ctx.state, now = Date.now(), threads = data.threads.filter(t => t.leadId === lead.id);
    const openTasks = data.tasks.filter(t => t.leadId === lead.id && t.status === 'open').sort((a,b) => PulseOperations.at(a.date,a.time)-PulseOperations.at(b.date,b.time));
    const meetings = data.calendar.filter(m => m.leadId === lead.id && PulseOperations.at(m.date,m.time)>=now).sort((a,b)=>PulseOperations.at(a.date,a.time)-PulseOperations.at(b.date,b.time));
    const next = openTasks[0] || meetings[0];
    const last = threads.flatMap(t => t.messages || []).filter(m => Number.isFinite(Date.parse(m.time))).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time))[0];
    const initials = (lead.company || 'Customer').split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
    const shell = document.createElement('section'); shell.className = 'pulse-customer'; shell.dataset.lead = lead.id;
    shell.innerHTML = '<div class="pulse-profile"><span class="pulse-avatar">'+h(initials)+'</span><div><span class="gh-eyebrow">Customer 360</span><h3>'+h(lead.name || 'Contact not recorded')+'</h3><p>'+h(lead.service)+' · Sample business record</p></div><button type="button" class="gh-primary" data-pulse-action="compose" data-id="'+h(lead.id)+'">'+PulseBrand.symbol('chat')+'<span>Draft follow-up</span></button></div><div class="pulse-profile-stats"><div><span>Stage</span><strong data-stage="'+h(lead.stage)+'">'+h(lead.stage)+'</strong></div><div><span>Owner</span><strong>'+h(lead.owner || 'Unassigned')+'</strong></div><div><span>Next step</span><strong>'+(next?format(PulseOperations.at(next.date,next.time)):'Not planned')+'</strong><small>'+(next?h(next.title):'Add a task or meeting')+'</small></div><div><span>Last conversation</span><strong>'+(last?format(last.time):'Not recorded')+'</strong><small>Recorded thread event</small></div></div>';
    if(flags)shell.append(flags); if(controls){controls.classList.add('pulse-customer-controls');shell.append(controls);}
    const tabs=document.createElement('div');tabs.id='pulseCustomerTabs';tabs.className='pulse-customer-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Customer workspace');
    tabs.innerHTML=sections.map(key=>'<button type="button" role="tab" id="pulseCustomerTab-'+key+'" aria-controls="pulseCustomerPanel-'+key+'" data-pulse-action="customer-section" data-id="'+key+'" data-customer-section="'+key+'">'+key[0].toUpperCase()+key.slice(1)+(key==='conversations'?' <span class="pulse-tab-count">'+threads.length+'</span>':'')+'</button>').join('');shell.append(tabs);
    const panels=document.createElement('div');panels.id='pulseCustomerPanels';
    sections.forEach(key=>{const panel=document.createElement('section');panel.id='pulseCustomerPanel-'+key;panel.dataset.section=key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','pulseCustomerTab-'+key);panel.tabIndex=0;panels.append(panel);});
    panels.children[0].append(history);details.forEach(node=>panels.children[1].append(node));
    const taskRows=data.tasks.filter(t=>t.leadId===lead.id);
    panels.children[2].innerHTML='<div class="pulse-subheading"><h3>Tasks & next steps</h3><button type="button" class="gh-secondary" data-pulse-action="plan-task" data-id="'+h(lead.id)+'">'+PulseBrand.symbol('plus')+'<span>Plan next step</span></button></div>'+taskRows.map(task=>'<article class="pulse-customer-task"><span class="pulse-task-glyph">'+PulseBrand.symbol(task.status==='done'?'check':'clock')+'</span><div><strong>'+h(task.title)+'</strong><small>'+format(PulseOperations.at(task.date,task.time))+' IST · '+h(task.owner||'Unassigned')+'</small></div>'+(task.status==='open'?'<button type="button" class="gh-secondary" data-pulse-customer-complete="'+h(task.id)+'">Complete</button>':'<span class="gh-pill ready">Done</span>')+'</article>').join('')+(taskRows.length?'':'<p class="gh-empty">No internal tasks recorded.</p>')+'<h3>Upcoming internal meetings</h3>'+meetings.map(m=>'<article class="pulse-customer-task"><span class="pulse-task-glyph">'+PulseBrand.symbol('clock')+'</span><div><strong>'+h(m.title)+'</strong><small>'+format(PulseOperations.at(m.date,m.time))+' IST · '+h(m.owner)+'</small></div></article>').join('');
    panels.children[3].innerHTML='<div class="pulse-subheading"><h3>Linked conversations</h3><span>Live threads · providers disconnected</span></div>'+threads.map(t=>'<article class="pulse-customer-thread">'+PulseBrand.badge(t.provider)+'<div><strong>'+h(t.provider)+' · '+h(t.subject)+'</strong><small>'+h(t.handled?'Handled internally':t.waiting==='Team'?'Awaiting team':'Awaiting customer')+' · '+h(t.owner)+'</small></div><button type="button" class="gh-secondary" data-pulse-action="conversation" data-id="'+h(t.id)+'">Open thread</button></article>').join('')+(threads.length?'':'<p class="gh-empty">No linked conversations recorded.</p>');
    shell.append(panels);root.replaceChildren(shell);document.getElementById('ghDialog').classList.add('pulse-customer-dialog');select('timeline');
    tabs.addEventListener('keydown',event=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const selected=tabs.querySelector('[aria-selected="true"]').dataset.customerSection,index=sections.indexOf(selected),next=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:-1)+4)%4;select(sections[next],true);});
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-pulse-customer-complete]');if(!button||button.disabled||!context||!window.PulseAccess?.canEdit())return;
    const task=context.state.tasks.find(t=>t.id===button.dataset.pulseCustomerComplete&&t.leadId===currentLead);
    if(!task||task.status!=='open')return;
    task.status='done';task.completedAt=new Date().toISOString();PulseOperations.audit(context.state,'Internal task completed',task.title,Date.now(),task.leadId);
    context.render();context.leadDialog(task.leadId);select('tasks');context.announce('Internal task completed. No external message sent.');
  });
  window.PulseCustomer=Object.freeze({organize,select});
})();
