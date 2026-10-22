/* Studio Pulse: action desk, customer timeline and approval-first control room. */
'use strict';
(() => {
  const O = PulseOperations, E = BusinessEngine;
  let ctx, deskKind = 'All', deskOwner = 'All', outboxFilter = 'All', controlTab = 'rules', deskLimit = 25;
  const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const button = (action, label, id = '', kind = 'secondary', attrs = '') => '<button type="button" class="gh-' + kind + '" data-pulse-action="' + action + '" data-id="' + h(id) + '" ' + attrs + '>' + PulseBrand.buttonLabel(action,label) + '</button>';
  const heading = (name, sub, right = '') => '<div class="gh-head"><div><h2>' + h(name) + '</h2><small>' + h(sub) + '</small></div>' + right + '</div>';
  const pill = (text, kind = '') => '<span class="gh-pill ' + kind + '">' + h(text) + '</span>';
  const field = (label, html, full = false) => '<label class="gh-field ' + (full ? 'full' : '') + '"><span>' + h(label) + '</span>' + html + '</label>';
  const options = (values, selected) => values.map(v => '<option ' + (v === selected ? 'selected' : '') + '>' + h(v) + '</option>').join('');
  const when = value => value ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value.length === 10 ? value + 'T00:00:00+05:30' : value)) + ' IST' : 'Undated';
  const clean = value => String(value).replace(' · Sample', '');
  const activeData = () => ctx.state.mode !== 'unconnected' ? ctx.state : { ...ctx.state, leads: [], threads: [], tasks: [], calendar: [], events: [], ops: { jobs: [], audit: [], nextId: 1, quiet: { start: 9, end: 18 } } };
  function commit(message) { ctx.render(); if (message) ctx.announce(message); }
  function timeline(lead) {
    const data = activeData(), rows = O.timeline(data, lead.id), now = Date.now();
    return '<section class="pulse-customer"><div class="pulse-section-title"><div><span class="gh-eyebrow">ONE CUSTOMER · ONE TIMELINE</span><h3>Customer 360</h3></div>' + '<div class="gh-actions">' + button('edit-record', 'Edit record ↓', lead.id) + button('compose', '+ Draft follow-up', lead.id) + '</div></div><div class="pulse-customer-flags">' + pill(lead.outreachPaused ? 'Outreach paused' : 'Outreach not paused') + pill(lead.optedOut ? 'Opted out · no outreach' : 'Channel permission checked separately') + '</div><div class="gh-actions">' + button('pause-customer', lead.outreachPaused ? 'Resume for fresh review' : 'Pause all outreach', lead.id) + button('optout-customer', lead.optedOut ? 'Record re-consent review' : 'Record opt-out', lead.id) + button('permission', 'Permission evidence', lead.id) + '</div><div class="pulse-timeline-filters" role="group" aria-label="Timeline category">' + ['All', 'CRM', 'Task', 'Meeting', 'WhatsApp', 'Gmail', 'Outlook', 'Note', 'Control', 'Outbox'].map(type => button('timeline-filter', type, type, 'text', 'aria-pressed="' + (type === 'All') + '"')).join('') + '</div><ol class="pulse-timeline">' + rows.map(row => '<li data-pulse-kind="' + h(row.kind) + '"><i class="pulse-timeline-dot"></i><div><div class="pulse-timeline-meta">' + PulseBrand.badge(row.kind,'mini') + pill(row.kind) + '<time>' + (row.dateOnly ? h(row.when) + ' · date only' : when(row.when)) + '</time>' + (row.when && Date.parse(row.when) > now ? pill('Upcoming') : '') + '</div><strong>' + h(row.label) + '</strong><p>' + h(row.detail) + '</p></div></li>').join('') + '</ol></section>';
  }
  function desk() {
    const data = activeData(), rows = PulseGovernance.visible(data, Date.now()), owners=['All',...new Set(O.desk(data,Date.now()).map(r=>r.owner))];
    if(!owners.includes(deskOwner))deskOwner='All';
    const filtered = rows.filter(r => (deskKind === 'All' || r.kind === deskKind) && (deskOwner === 'All' || r.owner === deskOwner)), visible = filtered.slice(0,deskLimit);
    const leads = new Set(rows.map(r => r.leadId)), high = new Set(rows.filter(r => r.priority === 1).map(r => r.leadId));
    document.getElementById('biBody').innerHTML = '<div class="pulse-hero-strip"><div><span class="gh-eyebrow">YOUR NEXT BEST ACTION</span><h2>Nothing important slips through.</h2><p>Recorded deadlines, unanswered messages and missing next steps. No AI scores.</p></div>' + button('desk-export', 'Export action list') + '</div><div class="bi-metric-row">' + [['Customers needing action', leads.size], ['High-priority customers', high.size], ['Visible action signals', rows.length]].map(([label, value]) => '<div class="gh-card gh-metric"><span>' + label + '</span><strong>' + (ctx.state.mode !== 'unconnected' ? value : '—') + '</strong><small>Current operational state · independent of report dates</small></div>').join('') + '</div><div class="pulse-toolbar"><div class="pulse-filters" role="group" aria-label="Action type">' + ['All', 'Overdue', 'Unanswered', 'No owner', 'No next step', 'Stalled'].map(type => button('desk-filter', type, type, 'secondary', 'aria-pressed="' + (deskKind === type) + '"')).join('') + '</div><label>Owner <select id="pulseDeskOwner">' + options(owners, deskOwner) + '</select></label></div><section class="gh-card">' + heading('Action desk', filtered.length + ' signals · showing '+visible.length+' · one customer may need more than one action') + '<div class="gh-table-wrap"><table class="gh-table pulse-action-table"><thead><tr><th>PRIORITY / CUSTOMER</th><th>NEEDS ATTENTION</th><th>OWNER / RECORDED TIME</th><th>NEXT ACTION</th></tr></thead><tbody>' + visible.map(row => '<tr><td>' + pill(['', 'High', 'Medium', 'Low'][row.priority], row.priority === 1 ? 'review' : '') + '<br>' + button('customer', h(clean(row.company)), row.leadId, 'text') + '</td><td><strong>' + h(row.kind) + '</strong><small>' + h(row.detail) + '</small></td><td>' + h(row.owner) + '<small>' + (row.due ? when(row.due) : '—') + '</small></td><td>' + (row.threadId ? button('conversation', 'Open thread →', row.threadId, 'text') : row.kind === 'No owner' ? button('customer', 'Assign owner →', row.leadId, 'text') : button('plan-task', '+ Next step', row.leadId, 'text')) + PulseGovernanceUI.rowControls(row) + '</td></tr>').join('') + '</tbody></table>' + (visible.length ? '' : '<div class="gh-empty">No action signals in this view.</div>') + '</div>'+(visible.length<filtered.length?'<div class="pulse-more">'+button('desk-more','Show next 25 signals')+'</div>':'')+'</section>';
  }
  function overviewStrip() {
    const rows = PulseGovernance.visible(activeData(), Date.now()), high = new Set(rows.filter(r => r.priority === 1).map(r => r.leadId));
    return '<div class="pulse-attention"><span class="pulse-live-dot"></span><div><strong>' + (ctx.state.mode !== 'unconnected' ? high.size + ' customers need priority attention' : 'Action desk awaits connected Studio records') + '</strong><small>Unanswered conversations, deadlines and ownership gaps.</small></div>' + button('open-desk', 'Open action desk →', '', 'text') + '</div>';
  }
  function results() {
    const report = O.results(activeData(), ctx.state.range, Date.now());
    const srv = window.PulseData && window.PulseData.report, value = srv && srv.value || {}, eng = srv && srv.engagement || {};
    const studio = '<section class="gh-card" style="margin-top:18px">' + heading('Studio quotation value & engagement', 'Server-recorded Studio numbers · nothing invented') + '<div class="pulse-result-summary"><div><span>Quoted value · prices recorded</span><strong>' + (Number.isFinite(value.quotedSum) ? '₹' + value.quotedSum.toLocaleString('en-IN') : '—') + '</strong><small>' + Number(value.proposalsWithValue || 0) + ' quotation(s) with recorded price · ' + Number(value.proposalsMissingValue || 0) + ' without</small></div><div><span>Live engagement</span><strong>' + (Number(eng.versionsPublished || 0)) + ' publishes · ' + (Number(eng.linkOpens || 0)) + ' link opens</strong><small>' + Number(eng.linkOpens || 0) + ' opens are opens, not reads · ' + Number(eng.surveyRequests || 0) + ' survey requests · ' + Number(eng.pdfDownloadRequests || 0) + ' PDF downloads</small></div></div><div class="bi-table-note">Quoted value is not revenue or collected payment. Lead-cohort results appear after the lead CRM backend is connected.</div></section>';
    return studio + '<section class="gh-card pulse-results">' + heading('Business results · acquisition cohort', 'Leads created in the selected range; first recorded wins observed through ' + E.day(Date.now()) + '. Not the activity chart’s conversion rate.') + '<div class="pulse-result-summary"><div><span>Median recorded first-response interval</span><strong>' + (report.medianMinutes === null ? '—' : Math.round(report.medianMinutes).toLocaleString('en-IN') + ' min') + '</strong><small>' + report.responsePairs + ' measured inbound-to-outbound pairs · elapsed time, not business hours</small></div><div><span>Revenue / payments</span><strong>—</strong><small>No payment ledger connected. Won is not paid revenue.</small></div></div><div class="gh-table-wrap"><table class="gh-table"><thead><tr><th>RECORDED SOURCE</th><th>COHORT LEADS</th><th>FIRST WINS</th><th>LOST WITHOUT WIN</th><th>NO RECORDED OUTCOME</th><th>OBSERVED WIN SHARE</th></tr></thead><tbody>' + report.sources.map(row => '<tr><td>' + h(row.source) + '</td><td>' + row.leads + '</td><td>' + row.won + '</td><td>' + row.lost + '</td><td>' + row.open + '</td><td>' + (row.won / row.leads * 100).toFixed(1) + '%</td></tr>').join('') + (report.sources.length ? '' : '<tr><td colspan="6" class="gh-empty">Lead-cohort reporting is unavailable: the lead CRM backend is not connected yet.</td></tr>') + '</tbody></table></div><div class="bi-table-note">Different cohorts have different time to mature. Source is staff-recorded; these are not causal campaign ROI or channel-quality rankings.</div></section>';
  }
  function room() {
    const data = activeData(), ops = O.ensure(data), rules = data.rules || [], counts = { rules: rules.length, outbox: ops.jobs.length, audit: ops.audit.length };
    let body = '';
    if (controlTab === 'rules') body = '<div class="bi-rule-grid">' + rules.map(rule => {
      const status = rule.status || 'Draft', actions = status === 'Draft' ? [['Needs approval', 'Request review']] : status === 'Needs approval' ? [['Approved', 'Approve configuration'], ['Draft', 'Return to draft']] : status === 'Approved' || status === 'Paused' ? [['Active', 'Activate internal rule'], ['Draft', 'Return to draft']] : [['Paused', 'Pause'], ['Draft', 'Return to draft']];
      return '<section class="gh-card bi-rule-card">' + pill(status === 'Draft' ? 'DRAFT · INACTIVE' : status, status === 'Active' ? 'ready' : '') + '<h2>' + h(rule.name) + '</h2><div class="bi-rule-flow"><div><small>WHEN</small>' + h(rule.trigger) + '</div><div><small>IF</small>' + h(rule.source) + (rule.channel && rule.channel !== 'Any channel' ? ' · ' + h(rule.channel) : '') + '</div><div><small>THEN</small>' + h(rule.action) + ' · ' + h(rule.owner) + '</div></div><div class="gh-actions">' + ctx.btn('rule', 'Configure', 'secondary', 'data-id="' + h(rule.id) + '"') + ctx.btn('simulate', 'Dry run', 'secondary', 'data-id="' + h(rule.id) + '"') + actions.map(([target, label]) => button('rule-state', status === 'Approved' && /WhatsApp|Email/.test(rule.action) && target === 'Active' ? 'Check activation gates' : label, rule.id, 'primary', 'data-target="' + target + '"')).join('') + '</div></section>';
    }).join('') + '</div><section class="gh-card" style="margin-top:18px">' + heading('Simulation history', 'Dry-run matches only—not executions or delivery receipts') + '<div class="gh-table-wrap"><table class="gh-table bi-history-table"><thead><tr><th>RULE</th><th>MATCHES</th><th>RESULT</th><th>TIME</th></tr></thead><tbody>' + (data.ruleRuns || []).map(r => '<tr><td>' + h(r.name) + '</td><td>' + r.count + '</td><td>Simulated · no actions executed</td><td>' + h(r.time) + '</td></tr>').join('') + '</tbody></table></div></section>';
    if (controlTab === 'outbox') {
      const jobs = ops.jobs.filter(j => outboxFilter === 'All' || j.status === outboxFilter);
      body = '<div class="pulse-toolbar"><label>Queue status <select id="pulseOutboxFilter">' + options(['All', 'Needs approval', 'Scheduled', 'Blocked', 'Paused', 'Cancelled', 'Done'], outboxFilter) + '</select></label><span>Done = internal action only. No provider message is sent.</span></div><section class="gh-card">' + heading('Scheduled actions & draft outbox', 'Human approval never bypasses consent, opt-out, quiet hours or provider readiness.') + '<div class="gh-table-wrap"><table class="gh-table"><thead><tr><th>CUSTOMER / CHANNEL</th><th>ACTION / SCHEDULE</th><th>STATE / REASON</th><th>CONTROLS</th></tr></thead><tbody>' + jobs.map(job => '<tr><td>' + h(clean(data.leads.find(l => l.id === job.leadId)?.company || 'Missing record')) + '<small>' + h(job.channel) + '</small></td><td>' + h(job.subject || job.action) + '<small>' + when(job.dueAt) + '</small></td><td>' + pill(job.status) + '<small>' + h(job.reason) + '</small></td><td>' + button('job-detail', 'Inspect', job.id, 'text') + (!['Cancelled', 'Done'].includes(job.status) ? button('job-cancel', 'Cancel', job.id, 'text') : '') + '</td></tr>').join('') + '</tbody></table>' + (jobs.length ? '' : '<div class="gh-empty">No queued actions. Create a draft or run an approved internal rule.</div>') + '</div></section>';
    }
    if (controlTab === 'audit') body = '<section class="gh-card">' + heading('Control history', 'Session-only Studio UI events; not persisted and not provider delivery receipts.', button('audit-export', 'Export history')) + '<ol class="pulse-audit">' + ops.audit.slice(0, 150).map(event => '<li><strong>' + h(event.type) + '</strong><time>' + when(event.at) + '</time><p>' + h(event.detail) + '</p><small>' + h(event.actor) + '</small></li>').join('') + (ops.audit.length ? '' : '<li>No control events yet.</li>') + '</ol></section>';
    document.getElementById('biBody').innerHTML = '<div class="pulse-hero-strip"><div><span class="gh-eyebrow">AUTOMATION CONTROL ROOM</span><h2>Approve the flow. Keep control.</h2><p>Draft → Review → Approved → Active / Paused. External sending stays locked.</p></div><div class="gh-actions">' + ctx.btn('new-rule', '+ Rule', 'primary') + button('compose', '+ Draft message') + button('run-internal', 'Run eligible internal actions') + '</div></div><div class="pulse-safety"><strong>No external sender is connected.</strong><span>Internal actions can run in this sandbox. WhatsApp/email approvals are configuration reviews—not permission to deliver.</span>' + button('quiet-hours', 'Sending hours · ' + ops.quiet.start + ':00–' + ops.quiet.end + ':00 IST', '', 'text') + '</div><div class="pulse-control-tabs" role="group" aria-label="Control room section">' + [['rules', 'Rules'], ['outbox', 'Outbox'], ['audit', 'History']].map(([key, label]) => button('control-tab', label + ' · ' + counts[key], key, 'secondary', 'aria-pressed="' + (controlTab === key) + '"')).join('') + '</div>' + body;
  }
  function compose(leadId) {
    const data = activeData(), date = E.shift(E.day(Date.now()), 1);
    ctx.dialog('Draft customer follow-up', 'Preview and schedule only · no email or WhatsApp delivery', '<form data-pulse-form="compose"><div class="gh-fields">' + field('Customer', '<select name="leadId">' + data.leads.map(l => '<option value="' + h(l.id) + '" ' + (l.id === leadId ? 'selected' : '') + '>' + h(clean(l.company)) + '</option>').join('') + '</select>', true) + field('Channel', '<select name="channel">' + options(['WhatsApp', 'Gmail', 'Outlook'], 'WhatsApp') + '</select>') + field('Subject / internal label', '<input name="subject" required maxlength="180" value="Project follow-up">') + field('Message · {{customer}}, {{company}}, {{owner}}, {{service}}', '<textarea name="body" required maxlength="4000">Hello {{customer}}, following up on our discussion about {{service}}. Please let us know a convenient time to connect. — {{owner}}</textarea>', true) + field('Date · IST', '<input name="date" type="date" required value="' + date + '">') + field('Time · IST', '<input name="time" type="time" required value="10:00">') + '</div><p class="gh-validation" id="pulseError" role="status"></p><div class="gh-actions"><button class="gh-primary" type="submit">Preview & queue for review</button></div></form>');
  }
  function inspect(id) {
    const data = activeData(), job = O.ensure(data).jobs.find(j => j.id === id); if (!job) return;
    const reasons = O.blockers(data, job, Date.now());
    ctx.dialog('Action preview', job.channel + ' · ' + job.status + ' · NOT SENT', '<div class="pulse-preview"><h3>' + h(job.subject) + '</h3><pre>' + h(job.body) + '</pre><small>Scheduled: ' + when(job.dueAt) + '<br>Stable key: ' + h(job.key) + '</small></div><h3>Delivery readiness</h3><ul class="pulse-gates">' + reasons.map(reason => '<li>' + h(reason) + '</li>').join('') + '</ul><div class="gh-actions">' + (!['Done', 'Cancelled'].includes(job.status) ? button('job-approve', 'Approve configuration only', job.id, 'primary') : '') + (job.channel !== 'Internal' && !['Done','Cancelled'].includes(job.status)?button('test-reply','Test safety · simulate reply',job.id):'') + '</div><p class="gh-note">Approval records this sample review. It cannot connect a sender, verify permission, clear an opt-out or transmit this message.</p>');
  }
  function permission(id) {
    const lead = activeData().leads.find(l => l.id === id); if (!lead) return;
    ctx.dialog('Channel permission evidence', clean(lead.company) + ' · staff-recorded evidence, not automatic provider verification', '<form data-pulse-form="permission" data-id="' + h(id) + '"><div class="gh-fields">' + field('Channel', '<select name="channel">' + options(['WhatsApp', 'Gmail', 'Outlook'], 'WhatsApp') + '</select>') + field('Decision', '<select name="decision"><option>Not recorded</option><option>Allowed</option><option>Revoked</option></select>') + field('Evidence / purpose / source of permission', '<textarea name="evidence" maxlength="1200" required placeholder="Record how, when and for what purpose permission was given. Do not paste secrets."></textarea>', true) + '</div><p id="pulseError" class="gh-validation" role="status"></p><button type="submit" class="gh-primary">Record evidence</button></form><p class="gh-note">Opt-out is a separate global stop. Recording Allowed does not clear an opt-out or authorise a provider sender.</p><ul class="gh-timeline">' + Object.entries(lead.permissions || {}).map(([channel, p]) => '<li>' + h(channel) + ' · ' + (p.allowed ? 'Allowed (staff recorded)' : 'Not allowed') + '<br>' + h(p.evidence) + '<br>' + when(p.recordedAt) + '</li>').join('') + '</ul>');
  }
  function storageCard() {
    return '<section class="gh-card pulse-storage-card">' + heading('Workspace data', 'Studio reads live, permission-scoped data through the authenticated API. No Pulse write-backend is connected yet.') + '<p id="pulseStorageStatus" role="status">Read-only: views and exports work. Rule, draft and lead changes are unavailable until the persistence backend ships.</p><p class="bi-table-note">Views refresh from Studio on each visit; nothing you see here is stored privately outside your account permissions.</p></section>';
  }
  function mount(context) {
    ctx = context; O.ensure(ctx.state);
    window.PulseStorage?.bind(ctx);
    document.addEventListener('click', async event => {
      const node = event.target.closest('[data-pulse-action]'); if (!node || node.disabled) return;
      if (!node.closest('#panel-sales,#ghDialog')) return;
      const action = node.dataset.pulseAction, id = node.dataset.id, now = Date.now(), data = activeData();
      if(!PulseAccess.allowLegacy(action)){ctx.announce('Owner / Admin access required.');return;}
      const writeActions=['rule-state','run-internal','compose','test-reply','job-approve','job-cancel','pause-customer','optout-customer','permission','quiet-hours','plan-task','backup'];
      if(writeActions.includes(action)&&!window.PulseData?.writable){ctx.announce('Saving is unavailable: the Studio persistence backend is not connected yet.');return;}
      try {
        if (action === 'open-desk') ctx.show('desk');
        if (action === 'desk-filter') { deskKind = id; deskLimit=25;ctx.render(); }
        if(action==='desk-more'){deskLimit+=25;ctx.render();}
        if(action==='edit-record'){PulseCustomer.select('details',true);}
        if(action==='customer-section')PulseCustomer.select(id);
        if (action === 'customer') ctx.leadDialog(id);
        if (action === 'conversation') ctx.threadDialog(id);
        if (action === 'plan-task') ctx.eventForm('task', id);
        if (action === 'timeline-filter') {
          document.querySelectorAll('.pulse-timeline li').forEach(row => { row.hidden = id !== 'All' && row.dataset.pulseKind !== id; });
          document.querySelectorAll('[data-pulse-action="timeline-filter"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
        }
        if (action === 'control-tab') { controlTab = id; room(); }
        if (action === 'rule-state') {
          const rule = data.rules.find(r => r.id === id), result = O.transition(data, rule, node.dataset.target, now);
          if (!result.ok) ctx.dialog('Activation blocked', rule.name, '<p class="gh-note">' + h(result.reason) + '</p>');
          else commit('Rule ' + rule.status + '. External sending remains unavailable.');
        }
        if (action === 'run-internal') { const done = O.run(data, now); commit(done + ' eligible internal queue updates. No external messages sent.'); }
        if (action === 'compose') compose(id);
        if (action === 'job-detail') inspect(id);
        if(action==='test-reply'){
          const job=data.ops.jobs.find(j=>j.id===id);if(!job)return;
          let thread=data.threads.find(t=>t.leadId===job.leadId&&t.provider===job.channel);
          if(!thread){thread={id:'studio-thread-'+data.ops.nextId++,leadId:job.leadId,provider:job.channel,subject:'Safety-test conversation (session-only)',owner:'Sales',waiting:'Team',handled:false,receivedAt:new Date(now).toISOString(),messages:[],notes:[]};data.threads.push(thread);}
          O.receiveReply(data,{threadId:thread.id,id:'test-reply-'+data.ops.nextId++,time:new Date(now).toISOString(),text:'Simulated customer reply for safety testing. Please pause follow-ups while we discuss.'},now);
          O.audit(data,'Simulated reply safety test','Simulated only; no provider webhook or customer message received',now,job.leadId);
          ctx.render();inspect(id);ctx.announce('Simulated reply applied. Pending outreach stopped; no live customer event occurred.');
        }
        if (action === 'job-approve') { O.approveJob(data, id, now); ctx.render(); inspect(id); ctx.announce('Configuration reviewed. Provider delivery remains blocked.'); }
        if (action === 'job-cancel') { const job = data.ops.jobs.find(j => j.id === id); if (job && !['Done', 'Cancelled'].includes(job.status)) { job.status = 'Cancelled'; job.reason = 'Cancelled by Studio operator (session-only)'; O.audit(data, 'Action cancelled', job.subject, now, job.leadId); commit('Pending action cancelled.'); } }
        if (action === 'pause-customer' || action === 'optout-customer') {
          const lead = data.leads.find(l => l.id === id), key = action === 'pause-customer' ? 'outreachPaused' : 'optedOut';
          if (key === 'optedOut' && lead.optedOut) { ctx.dialog('Re-consent requires review', clean(lead.company), '<p class="gh-note">This preview does not clear a recorded opt-out. Record new permission evidence for review; existing cancelled actions stay cancelled.</p>'); return; }
          O.customerControl(data, id, key, !lead[key], now); ctx.render(); ctx.leadDialog(id); ctx.announce('Customer control saved. No provider action occurred.');
        }
        if (action === 'permission') permission(id);
        if (action === 'quiet-hours') ctx.dialog('Allowed sending hours', 'IST · affects readiness only; no provider sender is installed', '<form data-pulse-form="quiet"><div class="gh-fields">' + field('From hour (0–23)', '<input name="start" type="number" min="0" max="23" required value="' + data.ops.quiet.start + '">') + field('Until hour (1–24)', '<input name="end" type="number" min="1" max="24" required value="' + data.ops.quiet.end + '">') + '</div><p id="pulseError" class="gh-validation" role="status"></p><button class="gh-primary" type="submit">Save sending hours</button></form>');
        if (action === 'backup') return; /* no local workspace snapshot in production */
        if (action === 'desk-export') { const rows = PulseGovernance.visible(data, now).filter(r => (deskKind === 'All' || r.kind === deskKind) && (deskOwner === 'All' || r.owner === deskOwner)); ctx.download('Studio_Pulse_Actions.csv', E.csv([['STUDIO PULSE ACTION LIST · STUDIOS TASKS AND SIGNALS · LEAD-CRM ROWS NOT CONNECTED'], ['Company', 'Priority', 'Action', 'Detail', 'Owner', 'Recorded time'], ...rows.map(r => [r.company, r.priority, r.kind, r.detail, r.owner, r.due])])); }
        if (action === 'audit-export') ctx.download('Studio_Pulse_Control_History.csv', E.csv([['SESSION-ONLY CONTROL HISTORY · NOT PERSISTED · NOT PROVIDER DELIVERY'], ['Type', 'Detail', 'At', 'Actor'], ...data.ops.audit.map(r => [r.type, r.detail, r.at, r.actor])]));
        window.PulseGovernanceUI?.lockLegacy();
      } catch (error) { ctx.announce(error.message); }
    });
    document.addEventListener('change', event => {
      if (event.target.id === 'pulseDeskOwner') { deskOwner = event.target.value;deskLimit=25; ctx.render(); }
      if (event.target.id === 'pulseOutboxFilter') { outboxFilter = event.target.value; room(); }
    });
    document.addEventListener('submit', event => {
      const form = event.target.closest('[data-pulse-form]'); if (!form) return; event.preventDefault();
      if(!PulseAccess.canEdit()){ctx.announce('Owner / Admin access required.');return;}
      if(!window.PulseData?.writable){ctx.announce('Saving is unavailable: the Studio persistence backend is not connected yet.');return;}
      const values = Object.fromEntries(new FormData(form)), data = activeData(), now = Date.now();
      try {
        if (form.dataset.pulseForm === 'compose') {
          const job = O.enqueue(data, { ...values, dueAt: values.date + 'T' + values.time + ':00+05:30' }, now);
          ctx.render(); inspect(job.id); ctx.announce('Draft queued for review. Not sent.');
        }
        if (form.dataset.pulseForm === 'permission') {
          const lead = data.leads.find(l => l.id === form.dataset.id);
          if (!values.evidence?.trim()) throw Error('Permission evidence is required');
          lead.permissions ||= {}; lead.permissions[values.channel] = { allowed: values.decision === 'Allowed', evidence: values.evidence.trim(), recordedAt: new Date(now).toISOString() };
          if (values.decision !== 'Allowed') for (const job of data.ops.jobs.filter(j => j.leadId === lead.id && j.channel === values.channel && !['Done', 'Cancelled'].includes(j.status))) { job.status = 'Cancelled'; job.reason = 'Channel permission withdrawn / not recorded'; }
          O.audit(data, 'Permission evidence recorded', values.channel + ' · ' + values.decision, now, lead.id);
          ctx.render(); permission(lead.id); ctx.announce('Staff evidence recorded; provider eligibility is not verified.');
        }
        if (form.dataset.pulseForm === 'quiet') {
          const start = Number(values.start), end = Number(values.end);
          if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 || start >= end) throw Error('Choose valid same-day hours: start must be before end');
          data.ops.quiet = { start, end }; O.audit(data, 'Sending hours updated', start + ':00–' + end + ':00 IST', now); ctx.close(); commit('Allowed hours updated.');
        }
      } catch (error) { const el = document.getElementById('pulseError'); if (el) el.textContent = error.message; else ctx.announce(error.message); }
    });
  }
  window.PulseUI = Object.freeze({ mount, desk, room, timeline, overviewStrip, results, storageCard, organizeCustomer:lead=>PulseCustomer.organize(ctx,lead) });
})();
