/* Workspace overview — real, permission-scoped API data only. */
'use strict';
(function () {
  const D = window.QSDash, api = window.PlatformAPI, $ = (id) => document.getElementById(id);
  if (!D || !api) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CLOSED = ['accepted', 'rejected', 'expired', 'archived'];
  const STAGES = [['draft', 'Draft', '#94A3B8'], ['internal_review', 'In review', '#60A5FA'], ['ready', 'Ready', '#F59E0B'], ['sent', 'Sent', '#8B5CF6'], ['viewed', 'Viewed', '#14B8A6'], ['negotiation', 'Negotiation', '#EC4899'], ['accepted', 'Accepted', '#22C55E']];
  const EXTRA = [['rejected', 'Rejected', '#EF4444'], ['expired', 'Expired', '#A8A29E'], ['archived', 'Archived', '#CBD5E1']];
  const LABEL = {}; STAGES.concat(EXTRA).forEach((s) => { LABEL[s[0]] = s[1]; });
  const EVT = { link_opened: 'Opened the quotation', pdf_download_requested: 'Requested a PDF', survey_requested: 'Requested a survey', interest_recorded: 'Showed interest', version_published: 'Version published', share_clicked: 'Share started', link_revoked: 'Link revoked', section_view: 'Viewed a section' };
  const ICON = { home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10', proposals: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8', gallery: 'M3 3h18v18H3z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3 M21 15l-5-5L5 21', publish: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7', send: 'M22 2L11 13 M22 2l-7 20-4-9-9-4z', activity: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0', tasks: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11', reports: 'M18 20V10 M12 20V4 M6 20v-6', settings: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6' };
  const svg = (d) => '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  document.querySelectorAll('.nav-item[data-panel] .ico').forEach((el) => { const k = el.parentElement.getAttribute('data-panel'); if (ICON[k]) el.innerHTML = svg(ICON[k]); });
  const bellSvg = svg(ICON.activity);
  const inr = (n) => n >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + ' Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(1) + ' L' : '₹' + Math.round(n).toLocaleString('en-IN');
  function ago(iso) { const t = Date.parse(iso); if (!t) return ''; const m = Math.max(0, Math.round((Date.now() - t) / 6e4)); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; if (m < 1440) return Math.round(m / 60) + ' hr ago'; return Math.round(m / 1440) + ' day' + (m >= 2880 ? 's' : '') + ' ago'; }
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  function dueLabel(iso) { if (!iso) return '—'; const d = new Date(iso), now = new Date(), tm = new Date(now.getTime() + 864e5); const day = sameDay(d, now) ? 'Today' : sameDay(d, tm) ? 'Tomorrow' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }); return day + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
  // No per-quotation downloads or persistent financial cache on Home.
  // Reported quoted total is not opportunity pipeline value or collected revenue.
  let X = { tasks: [], activity: [], notes: [], unread: 0, report: null };
  let failures = new Set(), pending = null, again = false;
  function load() {
    again = true;
    if (pending) return pending;
    pending = (async () => {
      while (again) {
        again = false;
        const keys = ['tasks', 'activity', 'notes', 'report'];
        const results = await Promise.allSettled([
          api.listTasks(), api.listActivity(), api.listNotifications(), api.reportSummary()
        ]);
        results.forEach((r, i) => {
          const key = keys[i];
          if (r.status === 'rejected') { failures.add(key); return; }
          failures.delete(key);
          if (key === 'notes') { X.notes = r.value.notifications || []; X.unread = r.value.unread || 0; }
          else if (key === 'report') X.report = r.value;
          else X[key] = r.value[key] || [];
        });
        render();
      }
    })().finally(() => { pending = null; });
    return pending;
  }
  window.QSDashHome = { refresh: load };
  const go = (attr, v) => 'data-' + attr + '="' + esc(v) + '"';
  function card(title, link, linkAct, body, cls) { return '<section class="card hc ' + (cls || '') + '"><div class="card-head"><h2>' + title + '</h2>' + (link ? '<button type="button" class="vall" ' + linkAct + '>' + link + ' →</button>' : '') + '</div>' + body + '</section>'; }
  const empty = (m) => '<div class="hempty"><span class="empty-icon" aria-hidden="true">◇</span>' + m + '</div>';
  function render() {
    const root = $('homeBody'); if (!root) return;
    const u = D.user() || {}, P = D.proposals(), now = new Date(), cust = (p) => p.customer || 'Untitled';
    const active = P.filter((p) => !CLOSED.includes(p.status || 'draft'));
    const open = X.tasks.filter((t) => t.status === 'open');
    const overdue = open.filter((t) => t.overdue), dueToday = open.filter((t) => t.dueAt && sameDay(new Date(t.dueAt), now));
    const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisM = P.filter((p) => { const d = new Date(p.createdAt); return d >= mStart && d <= now; }).length;
    const waiting = P.filter((p) => ['sent', 'viewed'].includes(p.status)), unread = X.unread;
    if ($('bellCount')) { $('bellCount').textContent = failures.has('notes') ? '!' : unread > 9 ? '9+' : unread; $('bellCount').hidden = !failures.has('notes') && !unread; }
    if ($('chipName')) { $('chipName').textContent = u.name || 'User'; $('chipRole').textContent = u.roleLabel || u.role || ''; if (u.elevated) { const d = document.createElement('span'); d.className = 'admin-dot'; d.title = 'Admin mode'; d.setAttribute('aria-label', 'Admin mode'); $('chipRole').appendChild(d); } $('userAv').textContent = (u.name || 'U').trim().charAt(0).toUpperCase(); }
    if ($('homeDate')) $('homeDate').textContent = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
    if ($('homeSub')) $('homeSub').textContent = P.length ? 'Here’s what’s moving in your workspace today.' : 'Your next great customer conversation starts here.';
    const kpi = (ic, c, label, val, hint, act) => '<button type="button" class="kpi2 ' + c + '" ' + act + '><span class="kic">' + svg(ic) + '</span><span><i>' + label + '</i><b>' + val + '</b><em>' + hint + '</em></span></button>';
    const reportValue = X.report && X.report.value;
    const quoted = reportValue && reportValue.quotedSum;
    const priced = reportValue && reportValue.proposalsWithValue || 0;
    const kpis =
      kpi(ICON.proposals, 'c-blue', 'Active quotations', active.length, P.length + ' saved in total', go('status', 'active')) +
      kpi(ICON.reports, 'c-violet', 'Quoted value', failures.has('report') ? '—' : priced && Number.isFinite(Number(quoted)) ? inr(Number(quoted)) : '—', failures.has('report') ? 'Unable to load' : priced + ' priced · all quotations, not revenue', go('go', 'reports')) +
      kpi(ICON.proposals, 'c-teal', 'Created this month', thisM, 'Based on creation date', go('status', 'this_month')) +
      kpi(ICON.tasks, 'c-amber', 'Follow-ups due today', failures.has('tasks') ? '—' : dueToday.length, failures.has('tasks') ? 'Unable to load' : overdue.length + ' overdue overall', go('tasks', 'today'));
    const prow = (n, t, s, act, c) => '<button type="button" class="prow" ' + act + '><b class="pn ' + c + '">' + n + '</b><span><strong>' + t + '</strong><i>' + s + '</i></span><u>›</u></button>';
    const prio = prow(failures.has('tasks') ? '—' : overdue.length, 'Follow-ups overdue', 'Open tasks past their due time', go('tasks', 'overdue'), 'r') +
      prow(failures.has('tasks') ? '—' : dueToday.length, 'Follow-ups due today', 'All open tasks scheduled for today', go('tasks', 'today'), 'a') +
      prow(waiting.length, 'Sent or viewed quotations', 'Staff-marked status', go('status', 'waiting'), 'v') +
      prow(failures.has('notes') ? '—' : unread, 'Unread notifications', failures.has('notes') ? 'Unable to load' : 'Recorded workspace alerts', go('go', 'activity'), 'b');
    const acts = X.activity.filter((e) => ['link_opened', 'pdf_download_requested', 'survey_requested', 'interest_recorded', 'section_view'].includes(e.type)).slice().sort((a,b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5);
    const actHtml = acts.length ? acts.map((e) => '<button type="button" class="arow" ' + (e.proposalId ? go('open', e.proposalId) : go('go', 'activity')) + '><span class="av sm">' + esc((e.proposalTitle || '?').trim().charAt(0).toUpperCase()) + '</span><span><strong>' + esc(String(e.proposalTitle || 'Quotation').replace(/\s[—-]\s[\d.]+ kWp$/, '')) + '</strong><i>' + EVT[e.type] + '</i></span><em>' + ago(e.createdAt) + '</em></button>').join('') : empty('No customer activity yet.');
    const byId = (id) => P.find((p) => p.id === id);
    const fu = open.slice().sort((a,b) => (Date.parse(a.dueAt) || Infinity) - (Date.parse(b.dueAt) || Infinity)).slice(0, 5), fuHtml = fu.length ? '<table class="data tight"><thead><tr><th>Customer</th><th>Task</th><th>Due</th><th>Quotation</th><th></th></tr></thead><tbody>' + fu.map((t) => { const p = byId(t.proposalId); return '<tr><td><button type="button" class="record-link" ' + (p ? go('open', p.id) : go('go', 'tasks')) + '>' + esc(p ? cust(p) : '—') + '</button></td><td>' + esc(t.title) + '</td><td class="' + (t.overdue ? 'late' : '') + '">' + esc(dueLabel(t.dueAt)) + '</td><td class="mono">' + esc(p ? p.ref || '—' : '—') + '</td><td>' + ((D.canEdit && D.canEdit()) ? '<button type="button" class="btn btn-secondary btn-sm" data-done="' + esc(t.id) + '">Complete</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' : empty('No open follow-ups.');
    const rq = P.slice().sort((a,b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 6);
    const rqHtml = rq.length ? '<div class="table-wrap"><table class="data tight"><thead><tr><th>Customer / reference</th><th>System</th><th>Status</th><th>Last updated</th></tr></thead><tbody>' + rq.map(p =>
      '<tr><td><div class="quote-client"><span class="client-icon" aria-hidden="true">' + esc(cust(p).slice(0,2).toUpperCase()) + '</span><div><button type="button" class="record-link" ' + go('open',p.id) + '>' + esc(cust(p)) + '</button><small>' + esc(p.ref || 'No reference') + '</small></div></div></td><td>' + esc(p.capacity ? p.capacity + ' kWp' : '—') + '</td><td><span class="badge ' + esc(p.status || 'draft') + '">' + esc(LABEL[p.status || 'draft'] || p.status) + '</span></td><td>' + esc(p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '—') + '</td></tr>'
    ).join('') + '</tbody></table></div>' : empty('No quotations yet.');
    const problem = key => '<div class="home-error" role="status">Unable to load ' + esc(key) + '. <button type="button" class="vall" data-retry>Retry</button></div>';
    const errorNote = failures.size ? '<div class="home-error" role="status">Some data is unavailable. <button type="button" class="vall" data-retry>Retry</button></div>' : '';
    const html = errorNote + '<div class="kpis">' + kpis + '</div><div class="hgrid">' +
      card('Needs your attention', '', '', prio, '') +
      card('Latest customer signals', 'View all', go('go','activity'), failures.has('activity') ? problem('customer activity') : actHtml, '') +
      card('Pick up where you left off', 'View all', go('status',''), rqHtml, 'w2') +
      card('Your next conversations', 'View all', go('tasks','all'), failures.has('tasks') ? problem('follow-ups') : '<div class="table-wrap">' + fuHtml + '</div>', 'w2') + '</div>';
    document.dispatchEvent(new CustomEvent('qs:workspace-updated'));
    if (root.__h === html) return; root.__h = html; root.innerHTML = html;
  }
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-retry]')) { await load(); return; }
    const task = e.target.closest('#homeBody [data-tasks]'); if (task) { D.showTasks(task.dataset.tasks); return; }
    const done = e.target.closest('#homeBody [data-done]');
    if (done) { e.stopPropagation(); done.disabled = true; try { await api.updateTask(done.getAttribute('data-done'), { status: 'done' }); D.toast('Follow-up completed'); await D.refresh(); } catch (err) { D.toast(err.message || 'Could not complete task'); done.disabled = false; } return; }
    const t = e.target.closest('#homeBody [data-open],#bellDrop [data-open]'); if (t) { D.open(t.getAttribute('data-open')); return; }
    const s = e.target.closest('#homeBody [data-status]'); if (s) { D.filterStatus(s.getAttribute('data-status')); return; }
    const g = e.target.closest('#homeBody [data-go]'); if (g) { D.show(g.getAttribute('data-go')); return; }
    if (!e.target.closest('.gsearch')) closeSearch(); if (!e.target.closest('.bellwrap')) $('bellDrop').classList.remove('on');
  });
  $('btnNewFollowup').addEventListener('click', () => { D.showTasks('all'); setTimeout(() => $('taskTitle') && $('taskTitle').focus(), 50); });
  $('btnUserChip').addEventListener('click', () => D.show('settings'));
  const gs = $('gSearch'), searchBox = $('gResults');
  let results = [], activeResult = -1;
  const pages = [['home','Overview'],['proposals','Quotations'],['tasks','Follow-ups'],['activity','Customer activity'],['send','Sharing'],['gallery','Project gallery'],['reports','Analytics'],['settings','Settings']];
  function settings(tab) { D.show('settings'); document.querySelector('[data-settings="'+tab+'"]').click(); }
  function closeSearch() { searchBox.classList.remove('on'); gs.setAttribute('aria-expanded','false'); gs.removeAttribute('aria-activedescendant'); activeResult=-1; }
  function commands() {
    const writable = !!(D.user() && D.canEdit && D.canEdit());
    const rows = pages.map(([id,label])=>({label,detail:'Page',keywords:id+' '+({home:'dashboard workspace',proposals:'quotes proposals customers customer',tasks:'tasks reminders pending calls',activity:'notifications timeline events',send:'send whatsapp email share customer',gallery:'photos images portfolio projects',reports:'reports business summary analytics',settings:'account profile preferences'}[id]||''),run:()=>D.show(id)}));
    rows.push(
      {label:'Log out',detail:'Sign out of your account',keywords:'logout log out signout sign out exit account session',run:()=>$('btnLogout').click()},
      {label:'Forgot password',detail:'Open sign-in password recovery',keywords:'forgot fogot forget reset recover password login bhool',run:()=>{location.href='index.html#forgotPassword';}},
      {label:'Change password',detail:'Settings · Security',keywords:'password security update',run:()=>{settings('security');$('currPassword').focus();}},
      {label:'Edit profile',detail:'Settings · Profile',keywords:'name account profile email',run:()=>{settings('profile');$('profileName').focus();}},
      {label:'Appearance',detail:'Light / Dark / System',keywords:'theme appearance mode light dark system glass color',run:()=>$('dashboardTheme').focus()},
      {label:'Ask Studio AI',detail:'Open assistant',keywords:'ai assistant artificial intelligence chatbot chat bot help pricing price cost 3kw',run:()=>{if($('assistantPanel').hidden)$('assistantLauncher').click();$('assistantPrompt').focus();}},
      {label:'Open quotation Studio',detail:'Editor · Pricing, system settings and PDF export',keywords:'editor studio edit rate gst capacity module inverter engineering finance pdf export download save quotation',run:()=>{location.href='quotation.html';}},
      {label:'Versions & links',detail:'Sharing · Published quotation versions',keywords:'publish published versions customer links',run:()=>D.show('publish')}
    );
    if(writable) rows.unshift(
      {label:'New quotation',detail:'Create a quotation in Studio',keywords:'new quotation proposal quote create add banana',run:()=>$('btnNewProposal').click()},
      {label:'New follow-up',detail:'Create a task or reminder',keywords:'new task followup follow up reminder add create',run:()=>{D.showTasks('all');$('taskTitle').focus();}},
      {label:'Upload photo',detail:'Project gallery',keywords:'upload image photo gallery project',run:()=>{D.show('gallery');$('galleryFile').focus();}}
    );
    if(D.canManage && D.canManage())rows.push({label:'Manage team',detail:'Settings · Team',keywords:'team roles permission members users',run:()=>settings('team')});
    return rows;
  }
  const normalise=value=>String(value||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function search() {
    const q=normalise(gs.value), words=q.split(' ').filter(Boolean);
    if(!q){results=[];searchBox.replaceChildren();closeSearch();return;}
    const actionRows=commands();
    const recordRows=[
      ...D.proposals().map(p=>({label:p.customer||p.title||'Untitled quotation',detail:'Quotation · '+(p.ref||'No reference')+' · '+(p.capacity?p.capacity+' kWp':'No size'),keywords:[p.title,p.ref,p.capacity,p.status,'quotation proposal customer'].join(' '),run:()=>D.open(p.id)})),
      ...X.tasks.map(t=>({label:t.title,detail:'Follow-up · '+(t.status||'open'),keywords:[t.notes,t.status,'task followup reminder'].join(' '),run:()=>D.showTasks(t.status==='done'?'done':'all')})),
      ...X.notes.map(n=>({label:n.title,detail:'Notification',keywords:[n.body,'notification activity'].join(' '),run:()=>D.show('activity')}))
    ];
    const match=r=>words.every(w=>normalise(r.label+' '+r.detail+' '+r.keywords).includes(w));
    results=[...actionRows.filter(match),...recordRows.filter(match)].sort((a,b)=>Number(normalise(b.label).startsWith(q))-Number(normalise(a.label).startsWith(q))).slice(0,14);
    searchBox.replaceChildren();activeResult=-1;gs.removeAttribute('aria-activedescendant');
    const heading=document.createElement('div');heading.className='search-heading';heading.textContent='Search results';searchBox.append(heading);
    if(!results.length){const empty=document.createElement('div');empty.className='hempty';empty.textContent='No matches. Try “new proposal”, “forgot password”, a customer or a task.';searchBox.append(empty);}
    results.forEach((r,i)=>{const b=document.createElement('button');b.type='button';b.id='global-result-'+i;b.setAttribute('role','option');b.setAttribute('aria-selected','false');const strong=document.createElement('strong'),detail=document.createElement('i');strong.textContent=r.label;detail.textContent=r.detail;b.append(strong,detail);b.addEventListener('click',()=>activate(i));searchBox.append(b);});
    searchBox.classList.add('on');gs.setAttribute('aria-expanded','true');
  }
  function activate(index){const result=results[index];if(!result)return;closeSearch();gs.value='';result.run();}
  gs.addEventListener('input',search);gs.addEventListener('focus',search);
  gs.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();closeSearch();gs.blur();return;}
    if(e.key==='Tab'){closeSearch();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();if(!searchBox.classList.contains('on'))search();if(!results.length)return;
      activeResult=activeResult<0?(e.key==='ArrowDown'?0:results.length-1):(activeResult+(e.key==='ArrowDown'?1:-1)+results.length)%results.length;
      searchBox.querySelectorAll('[role="option"]').forEach((b,i)=>b.setAttribute('aria-selected',String(i===activeResult)));
      const selected=$('global-result-'+activeResult);gs.setAttribute('aria-activedescendant',selected.id);selected.scrollIntoView?.({block:'nearest'});return;
    }
    if(e.key==='Enter'){e.preventDefault();if(searchBox.classList.contains('on'))activate(activeResult<0?0:activeResult);}
  });
  document.addEventListener('qs:workspace-updated',()=>{if(document.activeElement===gs&&searchBox.classList.contains('on'))search();});
  document.addEventListener('keydown',e=>{const typing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName||'')||e.target.isContentEditable;if(((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k')||(e.key==='/'&&!typing)){e.preventDefault();gs.focus();}});
  const menu=$('pageMenu'), pageButton=$('currentPage');
  function closePages(){menu.hidden=true;pageButton.setAttribute('aria-expanded','false');}
  $('workspaceHome').addEventListener('click',()=>{closePages();closeSearch();D.show('home');window.scrollTo({top:0,behavior:'instant'});});
  pages.forEach(([id,label])=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.textContent=label;b.addEventListener('click',()=>{closePages();D.show(id);pageButton.focus();window.scrollTo({top:0,behavior:'instant'});});menu.append(b);});
  pageButton.addEventListener('click',()=>{menu.hidden=!menu.hidden;pageButton.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden){closeSearch();menu.querySelector('button').focus();}});
  menu.addEventListener('keydown',e=>{const buttons=[...menu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();}if(e.key==='Escape'){closePages();pageButton.focus();}});
  document.addEventListener('click',e=>{if(!e.target.closest('.gbar-left'))closePages();});
  document.addEventListener('focusin',e=>{if(!e.target.closest('.gbar-left'))closePages();});
  $('btnBell').innerHTML = bellSvg + '<span id="bellCount" class="dot" hidden></span>';
  $('btnBell').addEventListener('click', async () => { const box = $('bellDrop'); if (box.classList.toggle('on') === false) return; box.innerHTML = '<div class="hempty">Loading…</div>'; try { const r = await api.listNotifications(), rows = (r && r.notifications || []).slice(0, 6); box.innerHTML = '<div class="dhead"><strong>Notifications</strong><button type="button" id="bellAll">Mark all read</button></div>' + (rows.length ? rows.map((n) => '<button type="button" class="nrow' + (n.unread ? ' un' : '') + '" ' + (n.proposalId ? go('open', n.proposalId) : '') + '><strong>' + esc(n.title) + '</strong><i>' + esc(n.body || '') + '</i><em>' + ago(n.createdAt) + '</em></button>').join('') : '<div class="hempty">No notifications yet.</div>') + '<button type="button" class="dfoot" id="bellView">View all activity →</button>'; $('bellAll').onclick = async () => { try { await api.markAllNotificationsRead(); D.toast('Notifications marked read'); box.classList.remove('on'); D.refresh(); } catch (err) { D.toast(err.message || 'Failed'); } }; $('bellView').onclick = () => { box.classList.remove('on'); D.show('activity'); }; } catch (err) { box.innerHTML = '<div class="hempty">' + esc(err.message || 'Could not load') + '</div>'; } });
  document.addEventListener('qs:home', load);
})();
