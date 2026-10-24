/* Studio Pulse domain layer. No network, timers, credentials or provider delivery. */
'use strict';
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./business-engine.js') : root.BusinessEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PulseOperations = api;
})(typeof window !== 'undefined' ? window : globalThis, function (E) {
  const clone = value => JSON.parse(JSON.stringify(value));
  const at = (date, time = '23:59') => Date.parse(date + 'T' + time + ':00+05:30');
  const terminal = lead => !lead || ['Won', 'Lost'].includes(lead.stage);
  const external = action => ['WhatsApp follow-up', 'Email follow-up'].includes(action);
  const mutable = job => !['Done', 'Cancelled'].includes(job.status);
  function ensure(data) {
    data.ops ||= { jobs: [], audit: [], nextId: 1, quiet: { start: 9, end: 18 } };
    return data.ops;
  }
  function audit(data, type, detail, now, leadId = null) {
    const ops = ensure(data);
    ops.audit.unshift({ id: 'audit-' + ops.nextId++, type, detail, leadId, at: new Date(now).toISOString(), actor: 'Sandbox operator / local worker' });
  }
  // Stable canonical payload: changing a rule's scope/content/schedule invalidates approval.
  function fingerprint(value) {
    const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object'
      ? Object.fromEntries(Object.keys(x).sort().filter(k => !['status', 'approval', 'approvedAt', 'approvedBy'].includes(k)).map(k => [k, canonical(x[k])])) : x;
    return JSON.stringify(canonical(value));
  }
  function transition(data, rule, target, now) {
    ensure(data);
    const current = rule.status || 'Draft';
    const valid = { Draft: ['Needs approval'], 'Needs approval': ['Approved', 'Draft'], Approved: ['Active', 'Draft', 'Paused'], Active: ['Paused', 'Draft'], Paused: ['Active', 'Draft'] };
    if (!valid[current]?.includes(target)) return { ok: false, reason: 'Invalid lifecycle transition' };
    if (target === 'Approved') { rule.approval = fingerprint(rule); rule.approvedAt = new Date(now).toISOString(); }
    if (target === 'Active') {
      if (!['New lead','Overdue follow-up','Awaiting team reply'].includes(rule.trigger)||!['Create internal follow-up','Notify owner','WhatsApp follow-up','Email follow-up'].includes(rule.action))return {ok:false,reason:'Unsupported trigger or action'};
      if(!rule.owner?.trim())return {ok:false,reason:'Assign a rule owner before activation'};
      if (!rule.approval || rule.approval !== fingerprint(rule)) return { ok: false, reason: 'Rule changed; approval required again' };
      if (external(rule.action)) return { ok: false, reason: 'External activation locked: authorised sender, permission validation and provider adapter are not installed' };
    }
    rule.status = target;
    if (['Paused', 'Draft'].includes(target)) for (const job of data.ops.jobs.filter(j => j.ruleId === rule.id && mutable(j))) {
      job.status = target === 'Paused' ? 'Paused' : 'Cancelled'; job.reason = 'Rule ' + target.toLowerCase();
    }
    if (target === 'Active') for (const job of data.ops.jobs.filter(j => j.ruleId === rule.id && j.status === 'Paused')) job.status = 'Scheduled';
    audit(data, 'Rule ' + target.toLowerCase(), rule.name, now);
    return { ok: true };
  }
  function edited(data, id, now) {
    const rule = data.rules.find(r => r.id === id);
    if (!rule) return;
    rule.status = 'Draft'; delete rule.approval; delete rule.approvedAt;
    for (const job of ensure(data).jobs.filter(j => j.ruleId === id && mutable(j))) { job.status = 'Cancelled'; job.reason = 'Rule edited; approval invalidated'; }
    audit(data, 'Approval invalidated', rule.name, now);
  }
  function desk(data, now) {
    const today = E.day(now), output = [], leads = data.leads || [];
    const add = (lead, kind, priority, detail, due, threadId = null, sourceId = null) => {
      if (lead) output.push({ id: kind + ':' + lead.id + ':' + (sourceId || threadId || due || ''), leadId: lead.id, company: lead.company, owner: lead.owner || 'Unassigned', kind, priority, detail, due, threadId, sourceId });
    };
    for (const task of data.tasks || []) if (task.status === 'open' && at(task.date, task.time) < now) {
      const lead = leads.find(l => l.id === task.leadId);
      if (!terminal(lead)) add(lead, 'Overdue', 1, task.title, new Date(at(task.date, task.time)).toISOString(), null, task.id);
    }
    for (const thread of E.pending(data.threads || [])) {
      const age = Math.max(0, (now - Date.parse(thread.receivedAt)) / 3600000);
      add(leads.find(l => l.id === thread.leadId), 'Unanswered', age >= 24 ? 1 : 2, thread.provider + ' · waiting ' + Math.floor(age) + 'h', thread.receivedAt, thread.id);
    }
    for (const lead of leads.filter(l => !terminal(l))) {
      if (!lead.owner?.trim()) add(lead, 'No owner', 1, 'Assign a responsible team member', null);
      const hasNext = (data.tasks || []).some(t => t.leadId === lead.id && t.status === 'open') || (data.calendar || []).some(c => c.leadId === lead.id && at(c.date, c.time) >= now);
      if (!hasNext) add(lead, 'No next step', 2, 'Plan a follow-up or meeting', null);
      const since = lead.stageChangedAt || lead.created;
      if (since && String(since).slice(0, 10) <= E.shift(today, -7)) add(lead, 'Stalled', 3, lead.stageChangedAt ? 'No stage movement for at least 7 days' : 'Open record at least 7 days old; stage-change history unavailable', since);
    }
    return output.sort((a, b) => a.priority - b.priority || String(a.due || '9999').localeCompare(String(b.due || '9999')) || a.company.localeCompare(b.company));
  }
  function timeline(data, leadId) {
    const lead = (data.leads || []).find(l => l.id === leadId);
    if (!lead) return [];
    const items = [], push = (id, kind, label, when, detail = '', dateOnly = false) => items.push({ id, kind, label, when, detail, dateOnly });
    for (const [field, label] of [['created', 'Lead recorded'], ['quoteAt', 'Quotation issue recorded'], ['wonAt', 'First win recorded']]) if (lead[field]) push(field, 'CRM', label, lead[field], '', true);
    (lead.notes || []).forEach((note, i) => push('note-' + i, 'Note', note, null, 'Undated internal note'));
    for (const t of (data.tasks || []).filter(t => t.leadId === leadId)) push(t.id, 'Task', t.title, new Date(at(t.date, t.time)).toISOString(), t.status + ' · scheduled deadline, not completion time');
    for (const c of (data.calendar || []).filter(c => c.leadId === leadId)) push(c.id, 'Meeting', c.title, new Date(at(c.date, c.time)).toISOString(), c.owner + ' · internal calendar');
    for (const t of (data.threads || []).filter(t => t.leadId === leadId)) {
      (t.messages || []).forEach((m, i) => push(t.id + '-' + (m.id || i), t.provider, m.direction === 'in' ? 'Inbound message' : 'Recorded outbound message', m.time, m.text));
      (t.notes || []).forEach((n, i) => push(t.id + '-note-' + i, 'Note', n, null, 'Undated ' + t.provider + ' internal note'));
    }
    for (const e of (data.events || []).filter(e => e.leadId === leadId)) push(e.id, e.kind, e.text, new Date(at(e.date, e.time)).toISOString());
    for (const e of (data.ops?.audit || []).filter(e => e.leadId === leadId)) push(e.id, 'Control', e.type, e.at, e.detail);
    for (const e of (data.governance?.audit || []).filter(e => e.leadId === leadId)) push(e.id, 'Control', e.action, e.at, e.detail+' · '+e.actor+' / '+e.role);
    for (const j of (data.ops?.jobs || []).filter(j => j.leadId === leadId)) push(j.id, 'Outbox', j.subject || j.action, j.createdAt, j.status + ' · ' + (j.reason || 'No provider delivery'));
    return items.sort((a, b) => (Date.parse(b.when) || 0) - (Date.parse(a.when) || 0));
  }
  function results(data, range, now) {
    const map = new Map();
    for (const lead of (data.leads || []).filter(l => E.inside(l.created, range))) {
      const row = map.get(lead.source) || { source: lead.source, leads: 0, won: 0, lost: 0, open: 0 };
      row.leads++;
      if (lead.wonAt && lead.wonAt >= lead.created && lead.wonAt <= E.day(now)) row.won++;
      else if (lead.stage === 'Lost') row.lost++;
      else row.open++;
      map.set(lead.source, row);
    }
    const durations = [];
    for (const thread of data.threads || []) {
      let inbound = null;
      for (const message of [...(thread.messages || [])].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
        const time = Date.parse(message.time);
        if (time > now || !Number.isFinite(time)) continue;
        if (message.direction === 'in' && inbound === null) inbound = time;
        if (message.direction === 'out' && ['sent', 'delivered', 'read'].includes(String(message.status).toLowerCase()) && inbound !== null && time >= inbound) {
          if (E.inside(E.day(inbound), range)) durations.push((time - inbound) / 60000);
          inbound = null;
        }
      }
    }
    durations.sort((a, b) => a - b);
    const middle = Math.floor(durations.length / 2);
    return { sources: [...map.values()].sort((a, b) => b.leads - a.leads), responsePairs: durations.length, medianMinutes: durations.length ? (durations[middle] + durations[Math.floor((durations.length - 1) / 2)]) / 2 : null };
  }
  function renderMessage(text, lead) {
    const fields = { customer: lead.name || lead.company, company: lead.company, owner: lead.owner || 'Studio team', service: lead.service || 'your project' };
    if (/\{\{(.*?)\}\}/g.test(text)) text = text.replace(/\{\{(.*?)\}\}/g, (_, key) => {
      if (!Object.hasOwn(fields, key.trim())) throw Error('Unknown message field: ' + key);
      return fields[key.trim()];
    });
    if (text.includes('{{') || text.includes('}}')) throw Error('Incomplete message field');
    return text;
  }
  function enqueue(data, spec, now) {
    const ops = ensure(data), lead = data.leads.find(l => l.id === spec.leadId);
    if (!lead) throw Error('Linked customer required');
    if (!['WhatsApp', 'Gmail', 'Outlook', 'Internal'].includes(spec.channel)) throw Error('Unsupported channel');
    if(/[\r\n]/.test(spec.subject||''))throw Error('Message subject cannot contain header line breaks');
    if (!spec.body?.trim() || spec.body.length > 4000 || !Number.isFinite(Date.parse(spec.dueAt)) || Date.parse(spec.dueAt) < now) throw Error('Message and a current/future schedule are required');
    const body=renderMessage(spec.body,lead),dueAt=new Date(spec.dueAt).toISOString();
    if(!spec.key){const duplicate=ops.jobs.find(j=>mutable(j)&&j.leadId===lead.id&&j.channel===spec.channel&&j.body===body&&j.dueAt===dueAt);if(duplicate)return duplicate;}
    const key = spec.key || 'manual-' + ops.nextId;
    const existing = ops.jobs.find(j => j.key === key); if (existing) return existing;
    const job = { id: 'job-' + ops.nextId++, key, leadId: lead.id, channel: spec.channel, recipient:spec.channel==='WhatsApp'?(lead.phone||''):(spec.channel==='Internal'?'':lead.email||''), action: spec.action || 'Customer follow-up', subject: String(spec.subject || '').slice(0, 180), body: renderMessage(spec.body, lead), createdAt: new Date(now).toISOString(), dueAt: new Date(spec.dueAt).toISOString(), status: spec.channel === 'Internal' ? 'Scheduled' : 'Needs approval', attempts: 0, approval: false, ruleId: spec.ruleId || null, reason: 'No provider delivery' };
    ops.jobs.unshift(job); audit(data, 'Draft queued', job.channel + ' · ' + job.subject, now, lead.id);
    return job;
  }
  function blockers(data, job, now) {
    const lead = data.leads.find(l => l.id === job.leadId), reasons = [];
    if (terminal(lead)) reasons.push('Customer record missing or deal closed');
    if (lead?.optedOut) reasons.push('Customer opted out');
    if (lead?.outreachPaused) reasons.push('Customer outreach paused');
    if (job.channel !== 'Internal') {
      if (!job.approval) reasons.push('Human approval required');
      const recipient=job.recipient||'',current=job.channel==='WhatsApp'?(lead?.phone||''):(lead?.email||'');
      if(job.channel==='WhatsApp'?!/^\+[1-9]\d{7,14}$/.test(recipient.replace(/[ ()-]/g,'')):!/^\S+@[^@\s]+\.[^@\s]+$/.test(recipient))reasons.push(job.channel==='WhatsApp'?'Valid E.164 customer phone required':'Valid customer email required');
      if(recipient!==current)reasons.push('Recipient changed since draft; recreate and review');
      const consent = lead?.permissions?.[job.channel];
      if (!consent?.allowed || !consent.evidence?.trim()) reasons.push('Channel permission evidence not recorded');
      // Deliberately hard-locked. A preference, imported JSON or checkbox is never a trusted provider capability.
      reasons.push('Authorised sender and provider adapter not installed');
      if (job.channel === 'WhatsApp') reasons.push('Provider messaging window / approved-template eligibility not verified');
      const quiet = ensure(data).quiet, hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
      if (hour < quiet.start || hour >= quiet.end) reasons.push('Outside allowed sending hours (IST)');
      const replied = (data.threads || []).some(t => t.leadId === job.leadId && t.messages?.some(m => m.direction === 'in' && Date.parse(m.time) > Date.parse(job.createdAt)));
      if (replied) reasons.push('New inbound reply; human review required');
    }
    if (Date.parse(job.dueAt) > now) reasons.push('Scheduled for later');
    return reasons;
  }
  function approveJob(data, id, now) {
    const job = ensure(data).jobs.find(j => j.id === id);
    if (!job || !mutable(job)) return false;
    job.approval = true; job.approvedAt = new Date(now).toISOString();
    job.status = blockers(data, job, now).length ? 'Blocked' : 'Scheduled';
    job.reason = blockers(data, job, now).join('; ') || 'Eligible internal action';
    audit(data, 'Draft reviewed', 'Approval is not provider permission or delivery', now, job.leadId);
    return true;
  }
  function customerControl(data, leadId, control, value, now) {
    const lead = data.leads.find(l => l.id === leadId); if (!lead) throw Error('Customer not found');
    if (!['outreachPaused', 'optedOut'].includes(control)) throw Error('Invalid customer control');
    lead[control] = Boolean(value);
    for (const job of ensure(data).jobs.filter(j => j.leadId === leadId && mutable(j) && j.channel !== 'Internal')) {
      if (value) { job.status = control === 'optedOut' ? 'Cancelled' : 'Paused'; job.reason = control === 'optedOut' ? 'Customer opted out' : 'Customer outreach paused'; }
      else if (job.status === 'Paused') { job.status = 'Needs approval'; job.approval = false; job.reason = 'Resumed; fresh review required'; }
    }
    audit(data, control === 'optedOut' ? 'Opt-out updated' : 'Outreach pause updated', String(Boolean(value)), now, leadId);
  }
  function receiveReply(data, message, now) {
    const thread = data.threads.find(t => t.id === message.threadId);
    if (!thread || !message.id || !Number.isFinite(Date.parse(message.time)) || Date.parse(message.time) > now || !message.text?.trim()) throw Error('Invalid inbound reply');
    if (thread.messages.some(m => m.id === message.id)) return false;
    thread.messages.push({ id: message.id, direction: 'in', time: message.time, text: message.text, status: 'Received' });
    const latest = [...thread.messages].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0];
    if (latest.direction === 'in') { thread.waiting = 'Team'; thread.handled = false; thread.receivedAt = latest.time; }
    for (const job of ensure(data).jobs.filter(j => j.leadId === thread.leadId && j.channel !== 'Internal' && mutable(j) && Date.parse(message.time) > Date.parse(j.createdAt))) {
      job.status = 'Cancelled'; job.reason = 'New inbound reply; review before further outreach';
    }
    audit(data, 'Inbound reply recorded', thread.provider + ' · pending outreach stopped where applicable', now, thread.leadId);
    return true;
  }
  function safety(data, now) {
    for (const job of ensure(data).jobs.filter(j => mutable(j) && j.channel !== 'Internal')) {
      const lead = data.leads.find(l => l.id === job.leadId);
      const inbound = (data.threads || []).some(t => t.leadId === job.leadId && t.messages?.some(m => m.direction === 'in' && Date.parse(m.time) > Date.parse(job.createdAt)));
      if (terminal(lead) || lead.optedOut || inbound) { job.status = 'Cancelled'; job.reason = inbound ? 'New inbound reply; review before further outreach' : lead?.optedOut ? 'Customer opted out' : 'Deal closed / customer unavailable'; audit(data, 'Pending outreach stopped', job.reason, now, job.leadId); }
      else if (lead.outreachPaused && job.status !== 'Paused') { job.status = 'Paused'; job.reason = 'Customer outreach paused'; }
    }
  }
  function run(data, now) {
    const ops = ensure(data), today = E.day(now);safety(data,now);
    for (const rule of (data.rules || []).filter(r => r.status === 'Active')) {
      if (rule.approval !== fingerprint(rule) || external(rule.action)) { rule.status = 'Paused'; audit(data, 'Rule paused by safety gate', rule.name, now); continue; }
      let matches;try{matches=E.dryRun(rule,data.leads,data.tasks,data.threads,today,now);}catch(error){rule.status='Paused';audit(data,'Invalid rule paused',rule.name+' · '+error.message,now);continue;}
      for (const match of matches) {
        enqueue(data, { key: match.key, ruleId: rule.id, leadId: match.leadId, channel: 'Internal', action: rule.action, subject: rule.name, body: 'Internal action: ' + rule.name, dueAt: new Date(now).toISOString() }, now);
      }
    }
    let changed = 0;
    for (const job of ops.jobs.filter(j => mutable(j) && !['Paused', 'Needs approval'].includes(j.status) && Date.parse(j.dueAt) <= now).slice(0, 25)) {
      const reasons = blockers(data, job, now);
      if (reasons.length) { const reason = reasons.join('; '); if (job.reason !== reason || job.status !== 'Blocked') { job.status = 'Blocked'; job.reason = reason; changed++; } continue; }
      if (job.ruleId && data.rules.find(r => r.id === job.ruleId)?.status !== 'Active') continue;
      if (job.channel !== 'Internal') continue;
      const id = 'effect-' + job.id;
      if (job.action === 'Notify owner') {
        if (!data.events.some(e => e.id === id)) data.events.unshift({ id, leadId: job.leadId, kind: 'Internal notice', owner:data.rules.find(r=>r.id===job.ruleId)?.owner||'Sales', text: job.body, date: today, time: new Date(now).toLocaleTimeString('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}) });
      } else if (!data.tasks.some(t => t.id === id)) {
        data.tasks.push({ id, leadId: job.leadId, title: job.body, type: 'Follow-up', owner: data.rules.find(r => r.id === job.ruleId)?.owner || 'Sales', date: E.shift(today, 1), time: '09:00', status: 'open' });
      }
      job.status = 'Done'; job.attempts++; job.reason = 'Internal Studio action completed; no external message'; job.finishedAt = new Date(now).toISOString(); changed++;
      audit(data, 'Internal action completed', job.subject, now, job.leadId);
    }
    return changed;
  }
  return Object.freeze({ at, ensure, audit, fingerprint, transition, edited, desk, timeline, results, renderMessage, enqueue, blockers, approveJob, customerControl, receiveReply, safety, run, clone });
});
