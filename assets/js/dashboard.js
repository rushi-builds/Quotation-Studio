/* ==========================================================================
   Quotation Studio — Staff Dashboard controller (Phase A)
   ========================================================================== */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.PlatformAPI;

  let mode = 'login'; /* login | register | forgot | reset */
  let user = null;
  let loginAuth = null;

  let allProposals = [];
  let toastTimer = null;

  const ROLE_LABEL = { owner: 'Owner', sales: 'Sales', viewer: 'Viewer', custom: 'Custom' };
  function roleLabel(roleOrUser) {
    if (roleOrUser && typeof roleOrUser === 'object') {
      if (roleOrUser.roleLabel) return roleOrUser.roleLabel;
      if (roleOrUser.role === 'custom' && roleOrUser.roleCustom) return roleOrUser.roleCustom;
      return roleLabel(roleOrUser.role);
    }
    const r = String(roleOrUser || '').toLowerCase();
    return ROLE_LABEL[r] || (roleOrUser || '—');
  }

  const STATUS_LABEL = {
    draft: 'Draft',
    internal_review: 'Internal review',
    ready: 'Ready',
    sent: 'Sent',
    viewed: 'Viewed',
    negotiation: 'Negotiation',
    accepted: 'Accepted',
    rejected: 'Rejected',
    expired: 'Expired',
    archived: 'Archived'
  };

  /* Staff pipeline: one honest step at a time. Terminal states have no "next". */
  const NEXT_STATUS = {
    draft: 'internal_review',
    internal_review: 'ready',
    ready: 'sent',
    sent: 'viewed',
    viewed: 'negotiation',
    negotiation: 'accepted'
  };

  function toast(msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2800);
  }

  function banner(type, msg) {
    const el = $('banner');
    if (!el) return;
    if (!msg) {
      el.className = 'banner';
      el.textContent = '';
      return;
    }
    el.className = 'banner on ' + (type || 'info');
    el.textContent = msg;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function badge(status) {
    const s = status || 'draft';
    const label = STATUS_LABEL[s] || s;
    return '<span class="badge ' + escapeHtml(s) + '">' + escapeHtml(label) + '</span>';
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function canEdit() { return !!user && user.role !== 'viewer'; }
  function emptyState(title, detail, icon = '◇') {
    return '<div class="hempty"><span class="empty-icon" aria-hidden="true">' + icon + '</span><strong>' + escapeHtml(title) + '</strong>' + escapeHtml(detail || '') + '</div>';
  }
  /* ---------- auth UI ---------- */
  function clearAuthMessages() {
    if ($('authError')) {
      $('authError').classList.remove('on');
      $('authError').textContent = '';
    }
    if ($('authOk')) {
      $('authOk').style.display = 'none';
      $('authOk').textContent = '';
    }
  }

  function showAuthOk(msg) {
    const el = $('authOk');
    if (!el) return;
    el.style.display = msg ? 'block' : 'none';
    el.className = 'banner on ok';
    el.textContent = msg || '';
  }

  function setAuthMode(next) {
    if (loginAuth) loginAuth.setMode(next);
    else mode = next;
  }

  function showAuthError(msg) {
    if (loginAuth) loginAuth.showError(msg);
    else {
      const el = $('authError');
      if (!el) return;
      el.textContent = msg || 'Something went wrong';
      el.classList.add('on');
    }
  }

  function showApp() {
    if (loginAuth) loginAuth.hide();
    else $('authScreen').style.display = 'none';
    $('dash').classList.add('on');
    $('userName').textContent = user.name || 'User';
    $('userEmail').textContent = user.email || '';
    $('settingsName').textContent = user.name || '—';
    $('settingsEmail').textContent = user.email || '—';
    if ($('settingsRole')) $('settingsRole').textContent = roleLabel(user);
    if ($('profileName')) $('profileName').value = user.name || '';
    if ($('profileSaveMsg')) $('profileSaveMsg').textContent = '';
    if ($('currPassword')) $('currPassword').value = '';
    if ($('newPassword')) $('newPassword').value = '';
    if ($('newPassword2')) $('newPassword2').value = '';
    if ($('passwordChangeMsg')) $('passwordChangeMsg').textContent = '';
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night';
    $('homeGreeting').textContent = greet + ', ' + (user.name || 'there').split(' ')[0] + '.';
    ['btnNewFromHome','btnNewProposal','btnNewFollowup','btnTaskAdd','btnPublish','btnSendPrepare','btnGalleryUpload'].forEach(id => { if ($(id)) { $(id).disabled = !canEdit(); $(id).title = canEdit() ? '' : 'Your role is read-only'; } });
  }

  function showAuth() {
    /* No session — back to the sign-in page. */
    user = null;
    location.href = 'index.html';
  }

  /* ---------- navigation ---------- */
  let lastLaunch = null;

  const PAGE_LABELS = {home:'Overview',proposals:'Quotations',tasks:'Follow-ups',activity:'Customer activity',send:'Sharing',publish:'Sharing',gallery:'Project gallery',reports:'Analytics',settings:'Settings'};
  function showPanel(name, preferId) {
    if (!$('panel-' + name)) return;
    banner(null);
    if ($('currentPage')) $('currentPage').textContent = PAGE_LABELS[name] || name;
    if ($('dash').classList.contains('nav-open') && $('dashboardSidebar')?.contains(document.activeElement)) $('btnMenu')?.focus();
    $('dash').classList.remove('nav-open');
    if ($('btnMenu')) $('btnMenu').setAttribute('aria-expanded','false');
    if ($('sidebarBackdrop')) $('sidebarBackdrop').hidden = true;
    if (preferId && name === 'send') fillSendSelect(preferId);
    if (preferId && name === 'publish') fillPublishSelect(preferId);
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('on'));
    document.querySelectorAll('.nav-item[data-panel]').forEach((n) => {
      n.classList.toggle('on', n.getAttribute('data-panel') === (name === 'publish' ? 'send' : name));
    });
    const panel = $('panel-' + name);
    if (panel) panel.classList.add('on');
    const selected = document.querySelector('.nav-item.on');
    if (selected && selected.closest('details')) selected.closest('details').open = true;
    if (name === 'proposals') { renderPropTable(); renderPropStats(); }
    if (name === 'home') renderHome();
    if (name === 'gallery') refreshGalleryPanel();
    if (name === 'publish') refreshPublishPanel();
    if (name === 'send') refreshSendPanel();
    if (name === 'activity') refreshActivityPanel();
    if (name === 'tasks') refreshTasksPanel();
    if (name === 'reports') refreshReportsPanel();
    if (name === 'settings') {
      refreshHealth();
      refreshTeamPanel();
    }
  }

  const EVENT_LABELS = {
    version_published: 'Version published',
    link_opened: 'Link opened',
    suspected_prefetch: 'Suspected link preview / bot',
    pdf_download_requested: 'PDF download requested',
    survey_requested: 'Survey / review requested',
    link_revoked: 'Link revoked',
    interest_recorded: 'Interest recorded',
    section_view: 'Section viewed',
    share_clicked: 'Share flow started',
    send_drafted: 'Send drafted',
    send_state_cancelled: 'Send cancelled',
    send_state_failed: 'Send failed',
    send_state_share_clicked: 'Share opened'
  };

  async function refreshActivityPanel() {
    try {
      const [notes, act] = await Promise.all([
        api.listNotifications(),
        api.listActivity()
      ]);
      const unread = (notes && notes.unread) || 0;
      if ($('notifUnreadLabel')) $('notifUnreadLabel').textContent = unread + ' unread';
      if ($('kpiUnread')) $('kpiUnread').textContent = String(unread);
      renderNotifications((notes && notes.notifications) || []);
      renderActivity((act && act.activity) || []);
    } catch (err) {
      banner('err', err.message || 'Could not load activity');
    }
  }

  function renderNotifications(rows) {
    const body = $('notifBody'); if (!body) return;
    body.innerHTML = rows.length ? rows.map(n => '<article class="notification-item ' + (n.unread ? 'unread' : '') + '"><span class="activity-dot" aria-hidden="true"></span><div class="notification-copy"><h3>' + escapeHtml(n.title) + '</h3><p>' + escapeHtml(n.body || '') + '</p><small>' + escapeHtml(fmtDate(n.createdAt)) + '</small></div>' + (n.unread ? '<button type="button" class="text-link" data-read="' + escapeHtml(n.id) + '">Mark read</button>' : '') + '</article>').join('') : emptyState('You’re all caught up.','New notifications will appear here.','✓');
    body.querySelectorAll('[data-read]').forEach(btn => btn.addEventListener('click',async()=>{
      btn.disabled=true;try { await api.markNotificationRead(btn.dataset.read); await refreshActivityPanel(); await refreshAll(); } catch(err) { toast(err.message || 'Could not mark read'); btn.disabled=false; }
    }));
  }

  function renderActivity(rows) {
    const body = $('activityBody'); if (!body) return;
    body.innerHTML = rows.length ? rows.map(e => '<article class="timeline-item"><time>' + escapeHtml(fmtDate(e.createdAt)) + '</time><h3>' + escapeHtml(EVENT_LABELS[e.type] || e.type) + '</h3>' + (e.proposalId && allProposals.some(p=>p.id===e.proposalId) ? '<button type="button" class="text-link" data-open-activity="' + escapeHtml(e.proposalId) + '">' + escapeHtml(e.proposalTitle || 'Open quotation') + '</button>' : '<p>' + escapeHtml(e.proposalTitle || 'Workspace event') + '</p>') + '</article>').join('') : emptyState('The story starts here.','Shared links and customer activity will build this timeline.','↗');
    body.querySelectorAll('[data-open-activity]').forEach(b=>b.addEventListener('click',()=>openInStudio(b.dataset.openActivity)));
  }

  let taskLoad = 0;
  async function refreshTasksPanel() {
    const requestId = ++taskLoad;
    fillTaskProposalSelect();
    try {
      const r = await api.listTasks();
      if (requestId === taskLoad) renderTasks((r && r.tasks) || []);
    } catch (err) {
      banner('err', err.message || 'Could not load tasks');
    }
  }

  function fillTaskProposalSelect() {
    const sel = $('taskProposal');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">No linked proposal</option>' +
      allProposals.map((p) => (
        '<option value="' + escapeHtml(p.id) + '">' +
        escapeHtml((p.customer || 'Untitled') + (p.ref ? ' · ' + p.ref : '')) +
        '</option>'
      )).join('');
    if (cur) sel.value = cur;
  }

  function renderTasks(rows) {
    const body = $('tasksBody'); if (!body) return;
    const filter = $('taskFilter')?.value || 'all';
    rows = rows.filter(t => {
      if (filter === 'all') return true;
      if (filter === 'done') return t.status === 'done';
      if (t.status !== 'open') return false;
      if (filter === 'open') return true;
      if (filter === 'overdue') return !!t.overdue;
      return !!t.dueAt && new Date(t.dueAt).toDateString() === new Date().toDateString();
    }).sort((a,b)=> (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || (Date.parse(a.dueAt) || Infinity) - (Date.parse(b.dueAt) || Infinity));
    if ($('taskCount')) $('taskCount').textContent = String(rows.length);
    if (!rows.length) { body.innerHTML = emptyState('A clear list. A fresh start.','No follow-ups in this view. Plan your next step on the right.','✓'); return; }
    body.innerHTML = rows.map(t => {
      const prop = allProposals.find(p=>p.id===t.proposalId);
      const action = (act,label,cls='') => '<button type="button" class="' + cls + '" data-act="' + act + '" data-id="' + escapeHtml(t.id) + '">' + label + '</button>';
      const check = canEdit() ? action(t.status === 'open' ? 'task-done' : 'task-reopen', t.status === 'done' ? '✓' : '<span class="sr-only">' + (t.status === 'open' ? 'Complete task' : 'Reopen task') + '</span>', 'task-check') : '<span class="task-check" aria-label="' + escapeHtml(t.status) + '">' + (t.status === 'done' ? '✓' : '') + '</span>';
      return '<article class="task-item ' + escapeHtml(t.status) + '">' + check + '<div class="task-copy"><h3>' + escapeHtml(t.title) + '</h3><div class="task-meta"><span class="' + (t.overdue ? 'late' : '') + '">' + escapeHtml(t.dueAt ? fmtDate(t.dueAt) : 'No due date') + '</span>' + (prop ? '<button type="button" class="text-link" data-task-quote="' + escapeHtml(prop.id) + '">' + escapeHtml(prop.customer || prop.ref || 'Quotation') + '</button>' : '') + (t.status === 'cancelled' ? '<span>Cancelled</span>' : '') + '</div>' + (t.notes ? '<p>' + escapeHtml(t.notes) + '</p>' : '') + '</div>' + (canEdit() ? '<details class="row-menu"><summary aria-label="Task actions">⋯</summary><div class="row-menu-list">' + (t.status === 'open' ? action('task-cancel','Cancel task') : action('task-reopen','Reopen task')) + action('task-del','Delete task','danger') + '</div></details>' : '') + '</article>';
    }).join('');
    body.querySelectorAll('[data-act]').forEach(btn=>btn.addEventListener('click',onTaskAction));
    body.querySelectorAll('[data-task-quote]').forEach(btn=>btn.addEventListener('click',()=>openInStudio(btn.dataset.taskQuote)));
  }

  async function onTaskAction(ev) {
    const btn = ev.currentTarget;
    const act = btn.getAttribute('data-act');
    const id = btn.getAttribute('data-id');
    btn.disabled = true;
    try {
      if (act === 'task-done') await api.updateTask(id, { status: 'done' });
      else if (act === 'task-cancel') await api.updateTask(id, { status: 'cancelled' });
      else if (act === 'task-reopen') await api.updateTask(id, { status: 'open' });
      else if (act === 'task-del') {
        if (!confirm('Delete this follow-up task?')) return;
        await api.deleteTask(id);
      }
      await refreshTasksPanel();
      await refreshAll();
    } catch (err) {
      toast(err.message || 'Task update failed');
    } finally {
      btn.disabled = false;
    }
  }

  async function addTask() {
    const title = ($('taskTitle') && $('taskTitle').value || '').trim();
    if (!title) {
      toast('Enter a task title');
      return;
    }
    const due = $('taskDue') && $('taskDue').value;
    try {
      await api.createTask({
        title,
        notes: ($('taskNotes') && $('taskNotes').value) || '',
        proposalId: ($('taskProposal') && $('taskProposal').value) || undefined,
        dueAt: due ? new Date(due + 'T17:00:00').toISOString() : undefined
      });
      if ($('taskTitle')) $('taskTitle').value = '';
      if ($('taskNotes')) $('taskNotes').value = '';
      toast('Follow-up added');
      await refreshTasksPanel();
      await refreshAll();
    } catch (err) {
      toast(err.message || 'Could not add task');
    }
  }

  function fmtINR(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
      }).format(Number(n));
    } catch (_) {
      return '₹' + Math.round(Number(n)).toLocaleString('en-IN');
    }
  }

  async function refreshReportsPanel() {
    try {
      const r = await api.reportSummary();
      if ($('repTotal')) $('repTotal').textContent = String((r.proposals && r.proposals.total) || 0);
      if ($('repAccepted')) $('repAccepted').textContent = String((r.proposals && r.proposals.accepted) || 0);
      if ($('repOpens')) $('repOpens').textContent = String((r.engagement && r.engagement.linkOpens) || 0);
      if ($('repValue')) {
        $('repValue').textContent = r.value?.proposalsWithValue > 0 ? fmtINR(r.value.quotedSum) : '—';
      }
      if ($('repValueHint')) {
        const known = (r.value && r.value.proposalsWithValue) || 0;
        const miss = (r.value && r.value.proposalsMissingValue) || 0;
        $('repValueHint').textContent = known + ' priced · ' + miss + ' missing · not revenue';
      }
      const eng = r.engagement || {};
      const metrics = [['Published versions',eng.versionsPublished],['Active customer links',eng.activeCustomerLinks],['Share starts',eng.shareClicksRecorded],['PDF requests',eng.pdfDownloadRequests],['Survey requests',eng.surveyRequests],['Suspected previews',eng.suspectedPrefetches]];
      if ($('repEngagement')) $('repEngagement').innerHTML = metrics.map(([label,value])=>'<div class="engagement-tile"><span>' + label + '</span><strong>' + escapeHtml(value || 0) + '</strong></div>').join('');
      const st = r.proposals?.byStatus || {}, max = Math.max(1,...Object.values(st).map(Number));
      if ($('repStatus')) $('repStatus').innerHTML = Object.keys(st).length ? Object.entries(st).map(([key,n])=>'<div class="stage-row"><span>' + escapeHtml(STATUS_LABEL[key] || key) + '</span><span class="stage-bar"><i style="width:' + Math.max(0,Math.min(100,Number(n)/max*100)) + '%"></i></span><b>' + escapeHtml(n) + '</b></div>').join('') : emptyState('No quotations yet.','Your saved quotation stages will appear here.','▤');
      const ul = $('repHonesty');
      if (ul) {
        ul.innerHTML = (r.honesty || []).map((line) => '<li>' + escapeHtml(line) + '</li>').join('');
      }
    } catch (err) {
      banner('err', err.message || 'Could not load reports');
    }
  }

  async function refreshTeamPanel() {
    const body = $('teamBody');
    if (!body) return;
    if (!user || user.role !== 'owner') {
      body.innerHTML = '<tr><td colspan="3" class="empty">Only the workspace owner can manage team roles. Your role: ' +
        escapeHtml(roleLabel(user && user.role)) + '.</td></tr>';
      return;
    }
    try {
      const r = await api.listTeam();
      const members = (r && r.members) || [];
      body.innerHTML = members.map((m) => (
        '<tr>' +
          '<td><strong>' + escapeHtml(m.name) + '</strong></td>' +
          '<td class="muted">' + escapeHtml(m.email) + '</td>' +
          '<td><select data-team-user="' + escapeHtml(m.id) + '" class="team-role-select">' +
            (function () {
              const opts = ['owner', 'sales', 'viewer'];
              let html = opts.map((role) => (
                '<option value="' + role + '"' + (m.role === role ? ' selected' : '') + '>' + roleLabel(role) + '</option>'
              )).join('');
              if (m.role === 'custom' || m.roleCustom) {
                html = '<option value="custom" selected>' + escapeHtml(m.roleLabel || m.roleCustom || 'Custom') + '</option>' + html;
              }
              return html;
            })() +
          '</select></td></tr>'
      )).join('') || '<tr><td colspan="3" class="empty">No members.</td></tr>';
      body.querySelectorAll('.team-role-select').forEach((sel) => {
        sel.addEventListener('change', async () => {
          try {
            await api.setTeamRole(sel.getAttribute('data-team-user'), sel.value);
            toast('Role updated');
            if (sel.getAttribute('data-team-user') === user.id) {
              user.role = sel.value;
              user.roleCustom = null;
              user.roleLabel = roleLabel(sel.value);
              showApp();
            }
          } catch (err) {
            toast(err.message || 'Could not change role');
            await refreshTeamPanel();
          }
        });
      });
    } catch (err) {
      body.innerHTML = '<tr><td colspan="3" class="empty">' + escapeHtml(err.message || 'Could not load team') + '</td></tr>';
    }
  }

  function fillSendSelect(preferId) {
    const sel = $('sendSelect');
    if (!sel) return;
    const cur = preferId || sel.value;
    if (!allProposals.length) {
      sel.innerHTML = '<option value="">No cloud proposals yet</option>';
      return;
    }
    sel.innerHTML = allProposals.map((p) => {
      const label = (p.customer || 'Untitled') + ' — ' + (p.ref || p.id);
      return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(label) + '</option>';
    }).join('');
    if (cur && allProposals.some((p) => p.id === cur)) sel.value = cur;
  }

  let sendLoad = 0, sendLoadedId = null;
  async function refreshSendPanel() {
    const requestId = ++sendLoad;
    fillSendSelect();
    const id = $('sendSelect') && $('sendSelect').value;
    if (sendLoadedId !== id) { ['sendMessage','sendRecipientName','sendRecipientTo'].forEach(key=>{ if ($(key)) $(key).value=''; }); sendLoadedId=id; }
    lastLaunch = null;
    if ($('btnSendLaunch')) $('btnSendLaunch').hidden = true;
    if ($('btnSendCopy')) $('btnSendCopy').hidden = true;
    if ($('sendResult')) {
      $('sendResult').style.display = 'none';
      $('sendResult').className = 'banner info';
    }
    if (!id) {
      if ($('sendsBody')) {
        $('sendsBody').innerHTML = emptyState('Choose a quotation.','Its sharing history will appear here.','↗');
      }
      if ($('sendMessage')) $('sendMessage').value = '';
      return;
    }
    try {
      const [preview, sends] = await Promise.all([
        api.sendPreview(id),
        api.listSends(id)
      ]);
      if (requestId !== sendLoad || $('sendSelect').value !== id) return;
      if ($('sendRecipientName') && !$('sendRecipientName').value) {
        $('sendRecipientName').value = preview.defaultRecipientName || '';
      }
      if ($('sendRecipientTo') && !$('sendRecipientTo').value) {
        const ch = ($('sendChannel') && $('sendChannel').value) || 'whatsapp_manual';
        $('sendRecipientTo').value = ch === 'email_manual'
          ? (preview.defaultEmail || '')
          : (preview.defaultWhatsApp || '');
      }
      if ($('sendMessage') && !$('sendMessage').value.trim()) {
        const cust = preview.defaultRecipientName || 'there';
        const p = preview.proposal || {};
        $('sendMessage').value =
          'Dear ' + cust + ',\n\n' +
          'Please find your personalised rooftop solar proposal' +
          (p.capacity ? (' for ' + p.capacity + ' kWp') : '') +
          (p.ref ? (' (reference ' + p.ref + ')') : '') + '.\n\n' +
          'Secure proposal link (read-only):\n' +
          '[A secure link will be inserted when you prepare the send]\n\n' +
          'You can review the design, savings summary and next steps in your browser. ' +
          'A PDF can be downloaded from the same page.\n\n' +
          'Kind regards';
      }
      if ($('sendHonesty') && preview.honestyNote) {
        $('sendHonesty').textContent = 'Sharing opens your app; delivery is not confirmed.';
      }
      renderSends((sends && sends.sends) || []);
    } catch (err) {
      banner('err', err.message || 'Could not load send centre');
    }
  }

  function renderSends(rows) {
    const body = $('sendsBody'); if (!body) return;
    if (!rows.length) { body.innerHTML = emptyState('Nothing shared yet.','Prepare a message to start the conversation.','↗'); return; }
    body.innerHTML = rows.map(s => '<article class="send-item"><span class="client-icon" aria-hidden="true">↗</span><div><strong>' + escapeHtml(s.recipientName || s.recipientTo || 'Customer') + '</strong><p>' + escapeHtml(s.channelLabel || s.channel) + '</p><span class="badge ' + (s.state === 'failed' || s.state === 'cancelled' ? 'rejected' : 'sent') + '">' + escapeHtml(s.stateLabel || s.state) + '</span><p><small>' + escapeHtml(fmtDate(s.createdAt)) + '</small></p></div>' + (canEdit() && !['cancelled','failed'].includes(s.state) ? '<button type="button" class="text-link" data-cancel-send="' + escapeHtml(s.id) + '">Cancel</button>' : '') + '</article>').join('');
    body.querySelectorAll('[data-cancel-send]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await api.updateSendState(btn.dataset.cancelSend,'cancelled');await refreshSendPanelKeepMessage();toast('Send cancelled');}catch(err){toast(err.message || 'Could not cancel');btn.disabled=false;}}));
  }

  async function prepareSend() {
    const id = $('sendSelect') && $('sendSelect').value;
    if (!id) {
      toast('Select a proposal first');
      return;
    }
    const btn = $('btnSendPrepare');
    if (btn) btn.disabled = true;
    try {
      let message = ($('sendMessage') && $('sendMessage').value) || '';
      /* Placeholder replaced server-side if empty link line; keep user edits. */
      const r = await api.createSend(id, {
        channel: ($('sendChannel') && $('sendChannel').value) || 'whatsapp_manual',
        recipientName: ($('sendRecipientName') && $('sendRecipientName').value) || '',
        recipientTo: ($('sendRecipientTo') && $('sendRecipientTo').value) || '',
        messageBody: message.includes('[A secure link will be inserted')
          ? undefined
          : message,
        publishFirst: true,
        expiresInDays: 30,
        markShareClicked: true
      });
      if ($('sendSelect').value !== id) { toast('Sharing prepared for the previous quotation'); await refreshAll(); return; }
      lastLaunch = r.launch || null;
      if ($('sendMessage') && r.launch && r.launch.copyText) {
        $('sendMessage').value = r.launch.copyText;
      }
      const box = $('sendResult');
      if (box) {
        box.style.display = 'block';
        box.className = 'banner on ok';
        box.innerHTML =
          '<strong>Ready to share.</strong> State recorded as <em>share opened (not delivery-confirmed)</em>.<br />' +
          'Portal: <code style="word-break:break-all;font-size:12px">' +
          escapeHtml((r.launch && r.launch.portalUrl) || '') + '</code>' +
          '<div class="muted" style="margin-top:6px;font-size:12px">' +
          escapeHtml((r.launch && r.launch.honesty) || '') + '</div>';
      }
      if ($('btnSendLaunch')) {
        const canLaunch = !!(lastLaunch && (lastLaunch.whatsappUrl || lastLaunch.mailtoUrl));
        $('btnSendLaunch').hidden = !canLaunch;
        $('btnSendLaunch').textContent =
          lastLaunch && lastLaunch.whatsappUrl ? 'Open WhatsApp' :
          lastLaunch && lastLaunch.mailtoUrl ? 'Open email app' : 'Open channel';
      }
      if ($('btnSendCopy')) $('btnSendCopy').hidden = false;
      toast('Send prepared');
      await refreshAll();
      fillSendSelect(id);
      await refreshSendPanelKeepMessage();
    } catch (err) {
      toast(err.message || 'Could not prepare send');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function refreshSendPanelKeepMessage() {
    const msg = $('sendMessage') && $('sendMessage').value;
    const name = $('sendRecipientName') && $('sendRecipientName').value;
    const to = $('sendRecipientTo') && $('sendRecipientTo').value;
    const id = $('sendSelect') && $('sendSelect').value;
    fillSendSelect(id);
    if (!id) return;
    try {
      const sends = await api.listSends(id);
      renderSends((sends && sends.sends) || []);
    } catch (_) {}
    if ($('sendMessage') && msg) $('sendMessage').value = msg;
    if ($('sendRecipientName') && name) $('sendRecipientName').value = name;
    if ($('sendRecipientTo') && to) $('sendRecipientTo').value = to;
    if (lastLaunch) {
      if ($('btnSendCopy')) $('btnSendCopy').hidden = false;
      if ($('btnSendLaunch')) {
        const canLaunch = !!(lastLaunch.whatsappUrl || lastLaunch.mailtoUrl);
        $('btnSendLaunch').hidden = !canLaunch;
      }
    }
  }

  function launchChannel() {
    if (!lastLaunch) {
      toast('Prepare a send first');
      return;
    }
    const url = lastLaunch.whatsappUrl || lastLaunch.mailtoUrl;
    if (!url) {
      toast('This channel has no external launch URL — use Copy message');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function copySendMessage() {
    const text = (lastLaunch && lastLaunch.copyText) ||
      ($('sendMessage') && $('sendMessage').value) || '';
    if (!text) {
      toast('Nothing to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Message copied');
    } catch (_) {
      toast('Copy failed — select the message text manually');
    }
  }

  function fillPublishSelect(preferId) {
    const sel = $('publishSelect');
    if (!sel) return;
    const cur = preferId || sel.value;
    if (!allProposals.length) {
      sel.innerHTML = '<option value="">No cloud proposals yet</option>';
      return;
    }
    sel.innerHTML = allProposals.map((p) => {
      const label = (p.customer || 'Untitled') + ' — ' + (p.ref || p.id) + ' · ' + (STATUS_LABEL[p.status] || p.status);
      return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(label) + '</option>';
    }).join('');
    if (cur && allProposals.some((p) => p.id === cur)) sel.value = cur;
  }

  let publishLoad = 0;
  async function refreshPublishPanel() {
    const requestId = ++publishLoad;
    fillPublishSelect();
    const id = $('publishSelect') && $('publishSelect').value;
    if (!id) {
      if ($('versionsBody')) $('versionsBody').innerHTML = '<tr><td colspan="3" class="empty">Select a proposal to view published versions.</td></tr>';
      if ($('linksBody')) $('linksBody').innerHTML = '<tr><td colspan="6" class="empty">Select a proposal to view links.</td></tr>';
      if ($('eventsBody')) $('eventsBody').innerHTML = '<tr><td colspan="3" class="empty">Select a proposal to view events.</td></tr>';
      return;
    }
    try {
      const [vers, links, events] = await Promise.all([
        api.listVersions(id),
        api.listLinks(id),
        api.listEvents(id)
      ]);
      if (requestId !== publishLoad || $('publishSelect').value !== id) return;
      renderVersions((vers && vers.versions) || []);
      renderLinks((links && links.links) || []);
      renderEvents((events && events.events) || []);
    } catch (err) {
      banner('err', err.message || 'Could not load publish data');
    }
  }

  function renderVersions(rows) {
    const body = $('versionsBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="3" class="empty">No published versions yet. Publish to freeze the current draft for customers.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((v) => (
      '<tr>' +
        '<td><strong>v' + escapeHtml(v.versionLabel || '1.0') + '</strong></td>' +
        '<td class="muted">' + escapeHtml(fmtDate(v.createdAt)) + '</td>' +
        '<td class="mono muted" style="font-size:11px">' + escapeHtml((v.snapshotSha256 || '').slice(0, 16)) + '…</td>' +
      '</tr>'
    )).join('');
  }

  function renderLinks(rows) {
    const body = $('linksBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty">No customer links yet.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((t) => {
      let status = 'Active';
      let badgeCls = 'ready';
      if (t.revokedAt) { status = 'Revoked'; badgeCls = 'rejected'; }
      else if (t.expiresAt && Date.parse(t.expiresAt) <= Date.now()) { status = 'Expired'; badgeCls = 'expired'; }
      return '<tr>' +
        '<td>' + escapeHtml(t.label || 'Customer link') + '</td>' +
        '<td class="muted">' + escapeHtml(fmtDate(t.createdAt)) + '</td>' +
        '<td class="muted">' + escapeHtml(t.expiresAt ? fmtDate(t.expiresAt) : '—') + '</td>' +
        '<td class="mono">' + escapeHtml(String(t.openCount || 0)) + '</td>' +
        '<td><span class="badge ' + badgeCls + '">' + escapeHtml(status) + '</span></td>' +
        '<td class="row-actions">' +
          (t.revokedAt || !canEdit() ? '' :
            '<button type="button" class="btn btn-danger-soft btn-sm" data-act="revoke" data-id="' + escapeHtml(t.id) + '">Revoke</button>') +
        '</td></tr>';
    }).join('');
    body.querySelectorAll('[data-act="revoke"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Revoke this customer link? The recipient will no longer be able to open it.')) return;
        btn.disabled = true;
        try {
          await api.revokeLink(btn.getAttribute('data-id'));
          toast('Link revoked');
          await refreshPublishPanel();
        } catch (err) {
          toast(err.message || 'Could not revoke link');
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function renderEvents(rows) {
    const body = $('eventsBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="3" class="empty">No events recorded yet.</td></tr>';
      return;
    }
    const labels = {
      version_published: 'Version published',
      link_opened: 'Link opened',
      suspected_prefetch: 'Suspected link preview / bot',
      pdf_download_requested: 'PDF download requested',
      survey_requested: 'Survey / review requested',
      link_revoked: 'Link revoked',
      interest_recorded: 'Interest recorded',
      section_view: 'Section viewed'
    };
    body.innerHTML = rows.map((e) => (
      '<tr>' +
        '<td class="muted">' + escapeHtml(fmtDate(e.createdAt)) + '</td>' +
        '<td>' + escapeHtml(labels[e.type] || e.type) + '</td>' +
        '<td class="muted" style="font-size:12px">' + escapeHtml(e.meta && e.meta.ua ? String(e.meta.ua).slice(0, 60) : (e.versionId ? 'version ' + e.versionId.slice(0, 10) : '—')) + '</td>' +
      '</tr>'
    )).join('');
  }

  async function publishSelected() {
    const id = $('publishSelect') && $('publishSelect').value;
    if (!id) {
      toast('Select a proposal first');
      return;
    }
    const btn = $('btnPublish');
    if (btn) btn.disabled = true;
    try {
      const r = await api.publishProposal(id, {
        label: 'Customer link',
        expiresInDays: 30,
        note: 'Published from dashboard'
      });
      const path = (r.access && r.access.portalPath) || '';
      const absolute = path ? (location.origin + path) : '';
      const box = $('publishResult');
      if (box) {
        box.style.display = 'block';
        box.className = 'banner on ok';
        box.innerHTML =
          '<strong>Published.</strong> Secure link (copy now — shown once):<br />' +
          '<code style="word-break:break-all;font-size:12px">' + escapeHtml(absolute || path) + '</code>' +
          '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
            '<button type="button" class="btn btn-secondary btn-sm" id="btnCopyLink">Copy link</button>' +
            '<a class="btn btn-secondary btn-sm" id="btnOpenPortal" href="' + escapeHtml(path) + '" target="_blank" rel="noopener">Open portal</a>' +
          '</div>';
        const copyBtn = $('btnCopyLink');
        if (copyBtn) {
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(absolute || path);
              toast('Link copied');
            } catch (_) {
              toast('Copy failed — select the link text manually');
            }
          });
        }
      }
      toast('Version published');
      await refreshAll();
      fillPublishSelect(id);
      await refreshPublishPanel();
    } catch (err) {
      toast(err.message || 'Publish failed');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------- data ---------- */
  let refreshPending = null;
  function refreshAll() {
    if (!refreshPending) refreshPending = refreshData().finally(() => { refreshPending = null; });
    return refreshPending;
  }
  async function refreshData() {
    banner(null);
    try {
      const list = await api.listProposals();
      allProposals = (list && list.proposals) || [];
      await renderHome();
      renderPropTable();
      renderPropStats();
    } catch (err) {
      if (err && err.status === 401) {
        /* Session lost (token cleared / expired) — back to sign-in. */
        showAuth();
        setAuthMode('login');
        showAuthError('Your session expired. Please sign in again.');
        return;
      }
      banner('err', err.message || 'Could not load dashboard data');
    }
  }

  function renderHome() { return window.QSDashHome ? window.QSDashHome.refresh() : Promise.resolve(); }

  function renderPropStats() {
    const el = $('propStats');
    if (!el) return;
    const rows = filteredProposals();
    const inSet = (...ss) => rows.filter((x) => ss.includes(x.status || 'draft')).length;
    el.innerHTML =
      '<span class="chip">Showing <b>' + rows.length + '</b> of <b>' + allProposals.length + '</b></span>' +
      '<span class="chip hot">In progress <b>' + inSet('draft', 'internal_review', 'ready') + '</b></span>' +
      '<span class="chip">With customer <b>' + inSet('sent', 'viewed', 'negotiation') + '</b></span>' +
      '<span class="chip good">Accepted <b>' + inSet('accepted') + '</b></span>' +
      '<span class="chip">Closed <b>' + inSet('rejected', 'expired', 'archived') + '</b></span>';
  }

  function filteredProposals() {
    const q = (($('filterQ') && $('filterQ').value) || '').trim().toLowerCase();
    const st = ($('filterStatus') && $('filterStatus').value) || '';
    return allProposals.filter((p) => {
      const status = p.status || 'draft';
      if (st === 'waiting' && !['sent','viewed'].includes(status)) return false;
      if (st === 'active' && ['accepted','rejected','expired','archived'].includes(status)) return false;
      if (st === 'this_month') { const d = new Date(p.createdAt), now = new Date(); if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false; }
      if (st && !['waiting','active','this_month'].includes(st) && status !== st) return false;
      if (!q) return true;
      const hay = [p.customer, p.ref, p.title, p.capacity, p.status].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function renderPropTable() {
    const body = $('propTableBody');
    if (!body) return;
    const rows = filteredProposals();
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty"><span class="empty-icon" aria-hidden="true">▤</span><strong>No quotations here yet.</strong>Create your first quotation, or try another filter.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((p) => rowHtml(p, false)).join('');
    bindRowActions(body);
  }

  function rowHtml(p) {
    const customer = p.customer || 'Untitled customer', id = escapeHtml(p.id);
    const action = (act,label,cls='') => '<button type="button" class="' + cls + '" data-act="' + act + '" data-id="' + id + '">' + label + '</button>';
    const next = NEXT_STATUS[p.status || 'draft'];
    const menu = canEdit() ? '<details class="row-menu"><summary aria-label="Actions for ' + escapeHtml(customer) + '">⋯</summary><div class="row-menu-list">' + action('send','Share quotation') + action('pub','Manage versions & links') + action('dup','Duplicate quotation') + (next ? action('adv','Mark ' + escapeHtml(STATUS_LABEL[next])) : '') + action('del','Delete quotation','danger') + '</div></details>' : '';
    return '<tr><td><div class="quote-client"><span class="client-icon" aria-hidden="true">' + escapeHtml(customer.trim().slice(0,2).toUpperCase()) + '</span><div>' + action('open',escapeHtml(customer),'record-link') + '<small>' + escapeHtml(p.ref || p.title || 'No reference') + '</small></div></div></td><td class="capacity-cell">' + escapeHtml(p.capacity ? p.capacity + ' kWp' : '—') + '<small>Version ' + escapeHtml(p.version || '1.0') + '</small></td><td>' + badge(p.status) + '</td><td class="muted">' + escapeHtml(fmtDate(p.updatedAt)) + '</td><td><div class="row-actions">' + action('open',canEdit() ? 'Edit in Studio ↗' : 'Open ↗','btn btn-secondary btn-sm') + menu + '</div></td></tr>';
  }

  function bindRowActions(root) {
    root.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', onRowAction);
    });
  }

  async function onRowAction(ev) {
    const btn = ev.currentTarget;
    const act = btn.getAttribute('data-act');
    const id = btn.getAttribute('data-id');
    if (!id) return;
    if (act === 'open') {
      openInStudio(id);
      return;
    }
    if (act === 'pub') {
      showPanel('publish',id);
      return;
    }
    if (act === 'send') {
      showPanel('send',id);
      return;
    }
    if (act === 'adv') {
      const found = allProposals.find((x) => x.id === id) || {};
      const next = NEXT_STATUS[found.status || 'draft'];
      if (!next) return;
      if (['sent','viewed','accepted'].includes(next) && !confirm('Mark this quotation ' + STATUS_LABEL[next] + ' manually? This does not verify customer delivery or approval.')) return;
      btn.disabled = true;
      try {
        await api.updateProposal(id, { status: next });
        toast('Status \u2192 ' + (STATUS_LABEL[next] || next));
        await refreshAll();
        renderPropStats();
      } catch (err) {
        toast(err.message || 'Status update failed');
      } finally {
        btn.disabled = false;
      }
      return;
    }
    if (act === 'dup') {
      btn.disabled = true;
      try {
        await api.duplicateProposal(id);
        toast('Proposal duplicated');
        await refreshAll();
      } catch (err) {
        toast(err.message || 'Duplicate failed');
      } finally {
        btn.disabled = false;
      }
      return;
    }
    if (act === 'del') {
      if (!confirm('Delete this cloud proposal? This cannot be undone from the dashboard.')) return;
      btn.disabled = true;
      try {
        await api.deleteProposal(id);
        toast('Proposal deleted');
        await refreshAll();
      } catch (err) {
        toast(err.message || 'Delete failed');
      } finally {
        btn.disabled = false;
      }
    }
  }

  /** Hand a cloud proposal to the Studio via sessionStorage bridge. */
  function openInStudio(id) {
    try {
      sessionStorage.setItem('qs.cloudOpenId', id);
    } catch (_) {}
    window.location.href = 'quotation.html?cloud=' + encodeURIComponent(id);
  }

  let creatingDraft = false;
  async function createBlankAndOpen() {
    if (creatingDraft) return;
    creatingDraft = true;
    const buttons = [$('btnNewFromHome'), $('btnNewProposal')].filter(Boolean);
    buttons.forEach(b => b.disabled = true);
    try {
      const r = await api.createProposal({
        status: 'draft',
        form: {},
        title: 'Untitled customer — 0 kWp'
      });
      const id = r && r.proposal && r.proposal.id;
      toast('Draft created in cloud');
      if (id) openInStudio(id);
      else await refreshAll();
    } catch (err) {
      toast(err.message || 'Could not create proposal');
    } finally { creatingDraft = false; buttons.forEach(b => b.disabled = false); }
  }

  async function refreshHealth() {
    const el = $('settingsHealth');
    if (!el) return;
    const h = await api.health();
    if (!h) {
      el.textContent = 'Platform API not reachable from this page.';
      return;
    }
    el.innerHTML =
      'API <strong>ok</strong> · phase <strong>' + escapeHtml(h.phase || '?') + '</strong> · storage <strong>' +
      escapeHtml(h.storage || '?') + '</strong> · ' + escapeHtml(h.time || '');
  }

  /* ---------- project gallery (staff uploads) ---------- */
  const GALLERY_LABEL = { site: 'Site', industrial: 'Industrial', commercial: 'Commercial', residential: 'Residential' };

  async function refreshGalleryPanel() {
    const grid = $('galleryGrid');
    const count = $('galleryCount');
    if (!grid) return;
    try {
      const r = await api.listGallery();
      const allItems = (r && r.gallery) || [];
      const category = $('galleryFilter')?.value || '';
      const items = allItems.filter(g=>!category || g.category===category);
      if (count) count.textContent = items.length + (items.length === 1 ? ' photo' : ' photos');
      if (!items.length) {
        grid.innerHTML = '<div class="empty-pad">Your projects deserve a place here. Upload a photo, or choose another category.</div>';
        return;
      }
      grid.innerHTML = items.map((g) => (
        '<figure class="gcard">' +
          '<button type="button" class="gimg" data-view="' + escapeHtml(g.url) + '" data-cap="' + escapeHtml(g.caption || 'Site photo') + '" aria-label="Enlarge photo">' +
            '<img src="' + escapeHtml(g.url) + '" alt="' + escapeHtml(g.caption || 'Site photo') + '" loading="lazy" />' +
          '</button>' +
          '<figcaption><span>' + escapeHtml(g.caption || 'Site photo') + '</span>' +
          '<span class="muted micro">' + escapeHtml(GALLERY_LABEL[g.category] || 'Site') + ' \u00b7 ' + escapeHtml(fmtDate(g.created_at)) + '</span></figcaption>' +
          (canEdit() ? '<button type="button" class="btn btn-danger-soft btn-sm gdel" data-del="' + escapeHtml(g.id) + '">Remove photo</button>' : '') +
        '</figure>'
      )).join('');
      grid.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
        openGalleryViewer(b.getAttribute('data-view'), b.getAttribute('data-cap'));
      }));
      grid.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
        deleteGalleryItem(b.getAttribute('data-del'), b);
      }));
    } catch (err) {
      grid.innerHTML = '<div class="empty-pad">Could not load gallery: ' + escapeHtml(err.message || 'error') + '</div>';
    }
  }

  function openGalleryViewer(src, cap) {
    const dlg = $('galleryViewer');
    if (!dlg || !dlg.showModal) { window.open(src, '_blank', 'noopener'); return; }
    if ($('galleryLarge')) { $('galleryLarge').src = src; $('galleryLarge').alt = cap || 'Site photo'; }
    if ($('galleryViewerCap')) $('galleryViewerCap').textContent = cap || '';
    if (!dlg.open) dlg.showModal();
  }

  async function deleteGalleryItem(id, btn) {
    if (!id) return;
    if (!confirm('Delete this photo? This cannot be undone.')) return;
    if (btn) btn.disabled = true;
    try {
      await api.deleteGallery(id);
      toast('Photo deleted');
      await refreshGalleryPanel();
    } catch (err) {
      toast(err.message || 'Delete failed');
      if (btn) btn.disabled = false;
    }
  }

  /* Shrink photos in the browser (max ~1400px, JPEG, under ~900 KB) so the
     free database tier holds thousands of them and pages stay fast. */
  function compressPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAXDIM = 1400;
        let w = img.naturalWidth, hgt = img.naturalHeight;
        if (!w || !hgt) { reject(new Error('Could not read that image.')); return; }
        const scale = Math.min(1, MAXDIM / Math.max(w, hgt));
        w = Math.max(1, Math.round(w * scale));
        hgt = Math.max(1, Math.round(hgt * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = hgt;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Image tools unavailable in this browser.')); return; }
        ctx.drawImage(img, 0, 0, w, hgt);
        const attempt = (q, last) => canvas.toBlob((b) => {
          if (!b) { reject(new Error('Could not process that image.')); return; }
          if (b.size <= 900 * 1024 || last) {
            if (b.size > 900 * 1024) {
              reject(new Error('Photo is too large even compressed (kept under ~900 KB to meet the upload limit).'));
              return;
            }
            resolve(b);
            return;
          }
          attempt(0.7, true);
        }, 'image/jpeg', q);
        attempt(0.85, false);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image file.')); };
      img.src = url;
    });
  }

  async function uploadGalleryPhoto() {
    const fileInput = $('galleryFile');
    const msg = $('galleryMsg');
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (msg) msg.textContent = '';
    if (!file) { if (msg) msg.textContent = 'Choose a photo file first.'; return; }
    if (file.size > 20 * 1024 * 1024) { if (msg) msg.textContent = 'File is over 20 MB.'; return; }
    const btn = $('btnGalleryUpload');
    if (btn) btn.disabled = true;
    if (msg) msg.textContent = 'Optimizing photo…';
    try {
      const small = await compressPhoto(file);
      const up = new File([small], (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.jpg', { type: 'image/jpeg' });
      await api.uploadGallery(up, {
        caption: ($('galleryCaption') && $('galleryCaption').value || '').trim(),
        category: ($('galleryCategory') && $('galleryCategory').value) || 'site'
      });
      if (fileInput) fileInput.value = '';
      if ($('galleryCaption')) $('galleryCaption').value = '';
      if (msg) msg.textContent = 'Uploaded.';
      toast('Photo uploaded');
      await refreshGalleryPanel();
    } catch (err) {
      if (msg) msg.textContent = err.message || 'Upload failed';
      toast(err.message || 'Upload failed');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  window.QSDash = { proposals: () => allProposals, user: () => user, refresh: () => refreshAll(), show: (name) => showPanel(name), open: (id) => openInStudio(id), toast,
    showTasks(filter) { if ($('taskFilter')) $('taskFilter').value = filter || 'all'; showPanel('tasks'); },
    filterStatus(status) { if ($('filterStatus')) $('filterStatus').value = status || ''; if ($('filterQ')) $('filterQ').value = ''; showPanel('proposals'); }
  };
  /* ---------- boot ---------- */
  async function boot() {
    /* Sign-in lives on index.html now — this page only gates on a live session. */
    loginAuth = null;

    async function doLogout() {
      try { await api.logout(); } catch (_) {}
      location.href = 'index.html';
    }
    if ($('btnLogout')) $('btnLogout').addEventListener('click', doLogout);
    if ($('btnLogout2')) $('btnLogout2').addEventListener('click', doLogout);

    if ($('btnChangePassword')) {
      $('btnChangePassword').addEventListener('click', async () => {
        const msg = $('passwordChangeMsg');
        const cur = ($('currPassword') && $('currPassword').value) || '';
        const n1 = ($('newPassword') && $('newPassword').value) || '';
        const n2 = ($('newPassword2') && $('newPassword2').value) || '';
        if (msg) msg.textContent = '';
        if (!cur || !n1) {
          if (msg) msg.textContent = 'Enter your current and new passwords.';
          return;
        }
        if (n1 !== n2) {
          if (msg) msg.textContent = 'New password and confirmation do not match.';
          return;
        }
        $('btnChangePassword').disabled = true;
        try {
          const r = await api.changePassword(cur, n1);
          if ($('currPassword')) $('currPassword').value = '';
          if ($('newPassword')) $('newPassword').value = '';
          if ($('newPassword2')) $('newPassword2').value = '';
          if (msg) msg.textContent = r.message || 'Password updated.';
          toast('Password changed');
        } catch (err) {
          if (msg) msg.textContent = err.message || 'Could not change password';
        } finally {
          $('btnChangePassword').disabled = false;
        }
      });
    }
    if ($('btnSaveProfile')) {
      $('btnSaveProfile').addEventListener('click', async () => {
        const name = ($('profileName') && $('profileName').value || '').trim();
        const msg = $('profileSaveMsg');
        if (msg) msg.textContent = '';
        if (!name) {
          if (msg) msg.textContent = 'Name cannot be empty.';
          toast('Name cannot be empty');
          return;
        }
        $('btnSaveProfile').disabled = true;
        try {
          const r = await api.updateProfile({ name });
          user = r.user;
          showApp();
          await renderHome();
          if (msg) msg.textContent = 'Name saved.';
          toast('Name saved');
        } catch (err) {
          if (msg) msg.textContent = err.message || 'Could not update name';
          toast(err.message || 'Could not update name');
        } finally {
          $('btnSaveProfile').disabled = false;
        }
      });
    }

    if ($('galleryFilter')) $('galleryFilter').addEventListener('change',refreshGalleryPanel);
    document.querySelectorAll('[data-go-panel]').forEach(b=>b.addEventListener('click',()=>{
      const name = b.dataset.goPanel;
      const active = document.querySelector('.panel.on')?.id;
      const id = active === 'panel-send' ? $('sendSelect')?.value : active === 'panel-publish' ? $('publishSelect')?.value : null;
      showPanel(name,id);
    }));
    document.querySelectorAll('[data-focus]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.focus)?.focus()));
    document.querySelectorAll('[data-settings]').forEach(b=>b.addEventListener('click',()=>{
      document.querySelectorAll('[data-settings]').forEach(n=>n.classList.toggle('selected',n===b));
      document.querySelectorAll('[data-settings-section]').forEach(n=>n.hidden=n.dataset.settingsSection!==b.dataset.settings);
    }));
    document.addEventListener('click', e=>document.querySelectorAll('.row-menu[open]').forEach(menu=>{if(!menu.contains(e.target))menu.open=false;}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.row-menu[open]').forEach(menu=>menu.open=false);});
    document.querySelectorAll('.nav-item[data-panel]').forEach((n) => {
      n.addEventListener('click', () => showPanel(n.getAttribute('data-panel')));
    });

    $('btnNewFromHome').addEventListener('click', createBlankAndOpen);
    $('btnNewProposal').addEventListener('click', createBlankAndOpen);
    $('filterQ').addEventListener('input', () => { renderPropTable(); renderPropStats(); });
    $('filterStatus').addEventListener('change', () => { renderPropTable(); renderPropStats(); });
    if ($('btnPublish')) $('btnPublish').addEventListener('click', publishSelected);
    if ($('publishSelect')) {
      $('publishSelect').addEventListener('change', () => { refreshPublishPanel(); });
    }
    if ($('btnSendPrepare')) $('btnSendPrepare').addEventListener('click', prepareSend);
    if ($('btnSendLaunch')) $('btnSendLaunch').addEventListener('click', launchChannel);
    if ($('btnSendCopy')) $('btnSendCopy').addEventListener('click', copySendMessage);
    if ($('sendSelect')) {
      $('sendSelect').addEventListener('change', () => {
        if ($('sendMessage')) $('sendMessage').value = '';
        if ($('sendRecipientName')) $('sendRecipientName').value = '';
        if ($('sendRecipientTo')) $('sendRecipientTo').value = '';
        refreshSendPanel();
      });
    }
    if ($('sendChannel')) {
      $('sendChannel').addEventListener('change', () => {
        /* Refresh defaults for the new channel without wiping a custom message. */
        const id = $('sendSelect') && $('sendSelect').value;
        if (!id) return;
        api.sendPreview(id).then((preview) => {
          const ch = $('sendChannel').value;
          if ($('sendRecipientTo')) {
            $('sendRecipientTo').value = ch === 'email_manual'
              ? (preview.defaultEmail || '')
              : (preview.defaultWhatsApp || '');
          }
        }).catch(() => {});
      });
    }
    if ($('btnMarkAllRead')) {
      $('btnMarkAllRead').addEventListener('click', async () => {
        try {
          await api.markAllNotificationsRead();
          toast('Notifications marked read');
          await refreshActivityPanel();
          await refreshAll();
        } catch (err) {
          toast(err.message || 'Could not update notifications');
        }
      });
    }
    if ($('taskFilter')) $('taskFilter').addEventListener('change', refreshTasksPanel);
    if ($('btnTaskAdd')) $('btnTaskAdd').addEventListener('click', addTask);
    if ($('btnReportRefresh')) $('btnReportRefresh').addEventListener('click', refreshReportsPanel);
    if ($('btnGalleryUpload')) $('btnGalleryUpload').addEventListener('click', uploadGalleryPhoto);
    if ($('galleryViewerClose')) $('galleryViewerClose').addEventListener('click', () => { const d = $('galleryViewer'); if (d && d.open) d.close(); });
    if ($('galleryViewer')) $('galleryViewer').addEventListener('click', (e) => { const d = $('galleryViewer'); if (e.target === d && d.open) d.close(); });

    const resync = () => { if (user && !document.hidden) refreshAll(); };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('pageshow', (e) => { if (e.persisted) resync(); });
    setInterval(resync, 60000);
    /* session restore */
    try {
      const avail = await api.isAvailable();
      if (!avail) {
        showAuthError('Can\u2019t reach the platform server. This link is a static preview (no backend) \u2014 open the live :8787 server preview to sign in.');
        return;
      }
      user = await api.currentUser();
      if (user) {
        showApp();
        await refreshAll();
      } else {
        showAuth();
      }
    } catch (err) {
      showAuth();
      showAuthError(err.message || 'Could not reach platform');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
