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

  const ROLE_LABEL = { owner: 'Owner', sales: 'Sales', viewer: 'Engineer', custom: 'Custom' };
  /* The four built-in words the SERVER may send, in the vocabulary this UI
     shows. `viewer` reads "Engineer" on screen everywhere — a label rename
     only: the stored role, its rank and every gate are untouched. Anything
     a member typed passes through verbatim, so a custom title is never
     rewritten. */
  const SERVER_ROLE_LABEL = { Owner: 'Owner', Sales: 'Sales', Viewer: 'Engineer', Custom: 'Custom' };
  function roleLabel(roleOrUser) {
    if (roleOrUser && typeof roleOrUser === 'object') {
      if (roleOrUser.roleLabel) return SERVER_ROLE_LABEL[roleOrUser.roleLabel] || roleOrUser.roleLabel;
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

  /* Capability helpers. The server sends canWrite / canManageTeam on the
     signed-in user, computed from EFFECTIVE powers (a designated ADMIN_EMAIL
     login satisfies both even when its stored role is `viewer`), so the UI
     never re-derives them from a role string. The fallbacks only apply to an
     older backend that does not send the flags yet. */
  function canEdit() {
    if (!user) return false;
    return user.canWrite != null ? !!user.canWrite : user.role !== 'viewer';
  }
  function canManage() {
    if (!user) return false;
    return user.canManageTeam != null ? !!user.canManageTeam : user.role === 'owner';
  }
  const POWER_LABEL = { owner: 'Owner', sales: 'Sales', viewer: 'Engineer' };
  /* S1 — the badge is the STORED role, so it can never read "Admin". The
     backend already sends `power` derived from `role` alone; this clamps it a
     second time so that no future backend change can put the word on screen.
     Every member can see this panel, and an Admin badge would announce the
     elevation to all of them. Note there is deliberately no 'admin' key in
     POWER_LABEL either. */
  function storedPowerWord(m) {
    const r = String((m && m.role) || '').toLowerCase();
    if (r === 'owner') return 'owner';
    if (r === 'viewer') return 'viewer';
    return 'sales'; /* sales, and every custom title, act as Sales */
  }
  function powerLabel(p) { return POWER_LABEL[String(p || '').toLowerCase()] || 'Member'; }
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
    if ($('settingsRole')) {
      $('settingsRole').textContent = roleLabel(user);
      /* Red dot: self-only tell that this account is in elevated admin mode.
         Driven by the stored `elevated` flag; nobody else's payload has it. */
      if (user && user.elevated) {
        const d = document.createElement('span');
        d.className = 'admin-dot'; d.title = 'Admin mode';
        d.setAttribute('aria-label', 'Admin mode');
        $('settingsRole').appendChild(d);
      }
    }
    if ($('settingsSince')) $('settingsSince').textContent = memberSince(user);
    wireRolePencil();
    /* Own pencil stays visible for everyone; only the affordance changes. */
    if ($('btnRoleEdit')) {
      const mine = canManage();
      $('btnRoleEdit').title = mine ? 'Edit your role' : 'Ask owner to change it';
      $('btnRoleEdit').setAttribute('aria-label', mine ? 'Edit your role' : 'Ask owner to change it');
      $('btnRoleEdit').classList.toggle('is-locked', !mine);
    }
    if ($('profileName')) $('profileName').value = user.name || '';
    if ($('profilePhone')) $('profilePhone').value = user.phone || '';
    if ($('profileTitle')) $('profileTitle').value = user.roleCustom || '';
    if ($('profileInstagram')) $('profileInstagram').value = user.instagram || '';
    if ($('profileLinkedin')) $('profileLinkedin').value = user.linkedin || '';
    refreshProfileNudge();
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

  /* The one-time first-sign-in nudge. It reads `profile_done`, which the
     server flips the first time the member saves Settings → Profile: a display
     flag that appears in no gate, so showing or hiding it grants nothing. */
  function refreshProfileNudge() {
    const el = $('profileNudge');
    if (!el) return;
    el.hidden = !user || !!user.profileDone;
  }

  /* One English confirmation modal, used wherever a change deserves a pause.
     It resolves true only on the confirming click, so nothing is written and
     nothing is sent until the second one. Falls back to the native prompt only
     if the browser has no <dialog>, which no supported browser lacks. */
  function confirmDialog(opts) {
    const o = opts || {};
    const dlg = $('confirmBox');
    if (!dlg) return Promise.resolve(window.confirm(o.body || 'Are you sure?'));
    return new Promise((resolve) => {
      const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
      set('cfTitle', o.title || 'Are you sure?');
      set('cfBody', o.body || '');
      set('cfOk', o.confirm || 'Confirm');
      set('cfCancel', o.cancel || 'Cancel');
      const done = (val) => {
        closeDialog('confirmBox');
        resolve(val);
      };
      const ok = $('cfOk');
      const cancel = $('cfCancel');
      if (ok) {
        ok.onclick = () => done(true);
        ok.focus();
      }
      if (cancel) cancel.onclick = () => done(false);
      dlg.onclose = () => done(false);
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open', '');
    });
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

  function memberSince(u) {
    const t = u && u.createdAt ? new Date(u.createdAt) : null;
    if (!t || isNaN(t)) return '';
    return 'Member since ' + t.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }

  /* Own-role pencil — visible to everyone.

     ONE editor, gated by capability and never by a role string. canManage() is
     true for an owner and for the designated ADMIN_EMAIL login (whose effective
     powers already clear the owner gate). Anyone else gets a disabled pencil
     that says who to ask.

     There is NO "Admin" dropdown option and no elevation control. Elevation is a
     TYPED TITLE: the designated admin types admin / Admin / ADMIN into the title
     box and saves; the backend sets is_admin = 1 and leaves the display
     untouched. For anyone else the same word is just a custom title with sales
     power (a title never grants access). Setting ANY other role de-elevates. The
     only tell is the small red dot beside your own role, which nobody else can
     see and which is driven by the stored `elevated` flag. */
  function wireRolePencil() {
    const btn = $('btnRoleEdit');
    const box = $('roleEditor');
    if (!btn || !box || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => {
      if (!canManage() && !(user && user.canElevate)) {
        btn.title = 'Ask owner to change it';
        toast('Ask owner to change it');
        return;
      }
      if (!box.hidden) { box.hidden = true; box.replaceChildren(); return; }
      box.hidden = false;
      wireRoleEditor(box, btn);
    });
  }

  /* Role + typed-title editor.
       custom  -> title REQUIRED (sales power + that chip)
       owner   -> title OPTIONAL (owner power; blank chip shows "Owner")
       sales / viewer -> no title
     Typing "admin" as a custom title elevates the designated admin on the
     backend with ZERO display change; the returned member is the source of
     truth, so the chip does not move and only the red dot appears. */
  function wireRoleEditor(box, btn) {
    const sel = document.createElement('select');
    sel.className = 'role-select';
    sel.setAttribute('aria-label', 'Your role');

    const title = document.createElement('input');
    title.type = 'text';
    title.className = 'role-title';
    title.maxLength = 60;
    title.setAttribute('aria-label', 'Display title');

    /* Power keys, in order — Custom sits LAST because picking it is what opens
       the typed-title box. It is offered as an INSTRUCTION, not as a stored
       value: the wording lives in the box underneath, and a Sales or Engineer
       row never grows a custom entry just because a title survived a role
       change. */
    ['owner', 'sales', 'viewer'].forEach((r) => {
      const o = document.createElement('option');
      o.value = r; o.textContent = roleLabel(r);
      if (user.role === r) o.selected = true;
      sel.append(o);
    });
    /* Custom sits LAST, worded exactly as the team table words it, and its
       label is an INSTRUCTION rather than a stored value: pick it and the box
       below is where you type. It is offered on EVERY row, not only one
       already stored as custom — this pencil is where the designated mailbox
       types "admin", and a row that starts at Sales would otherwise have no
       way to reach that door at all. */
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Custom — type here';
    if (user.role === 'custom') customOpt.selected = true;
    sel.append(customOpt);

    /* Whatever title the account already has is loaded ONCE and never blanked
       by a role choice: a hidden box still holds its text, so saving after a
       move to Sales or Engineer sends the wording back and preserves it. */
    title.value = user.roleCustom || '';
    function syncTitle() {
      const v = sel.value;
      const titleable = v === 'custom' || v === 'owner';
      title.hidden = !titleable;
      title.disabled = false;
      title.placeholder = v === 'custom'
        ? 'Typed title (for example Project lead)'
        : 'Display title (optional — blank shows "Owner")';
    }
    sel.addEventListener('change', syncTitle);
    syncTitle();

    const save = document.createElement('button');
    save.type = 'button'; save.className = 'role-save'; save.textContent = 'Save';
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.className = 'role-cancel'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => { box.hidden = true; box.replaceChildren(); btn.focus(); });

    save.addEventListener('click', async () => {
      const v = sel.value;
      const t = title.value.trim();
      if (v === 'custom' && !t) { toast('Enter a title, or pick a power level'); return; }
      const titleToSend = t;
      save.disabled = true;
      try {
        const out = await api.setTeamRole(user.id, v, titleToSend);
        const m = (out && out.member) || null;
        /* The returned member is the source of truth. On elevation the display
           fields come back UNCHANGED, so copying them keeps the chip identical
           while `elevated` flips the red dot on. */
        if (m) {
          user.role = m.role;
          user.roleCustom = m.roleCustom || null;
          user.roleLabel = m.roleLabel || roleLabel(m.role);
          if (m.isAdmin != null) user.isAdmin = !!m.isAdmin;
          if (m.elevated != null) user.elevated = !!m.elevated;
          if (m.canElevate != null) user.canElevate = !!m.canElevate;
          user.canWrite = m.effectiveCanWrite != null ? !!m.effectiveCanWrite : (m.canWrite != null ? !!m.canWrite : user.canWrite);
          user.canManageTeam = m.effectiveCanManageTeam != null ? !!m.effectiveCanManageTeam : (m.canManageTeam != null ? !!m.canManageTeam : user.canManageTeam);
        } else {
          user.role = (v === 'custom' && t) ? 'custom' : v;
          user.roleCustom = ((v === 'owner' || v === 'custom') && t) ? t : null;
          user.roleLabel = user.roleCustom || roleLabel(v);
        }
        box.hidden = true; box.replaceChildren();
        showApp();
        refreshTeamPanel();
        toast((out && out.note) || 'Saved');
      } catch (err) {
        save.disabled = false;
        toast(err.message || 'Could not change role');
      }
    });

    box.replaceChildren(sel, title, save, cancel);
    sel.focus();
  }

  /* Team panel. Columns: name, contact, stored-role badge, last sign-in (from
     the sessions table), and the role control.

     Every member may READ it; only an owner or the designated admin gets the
     role control and the contact column. The server enforces both halves — it
     omits `email` from other members' rows for a non-manager, and POST
     /api/team/role keeps its own owner gate — so this is presentation, not the
     boundary. `canManageTeam` in the response says which view to render.

     The EDIT cell holds the role select and, for a titleable row, the title
     input — separate on purpose: the title is what a member typed, the badge
     is their STORED role, and neither ever reflects elevation. The INFO cell
     opens the member card, which every member may open and only a manager may
     act from. */
  /* ---------- member info card ----------
     The eye at the end of a team row opens one card with everything the server
     is willing to show THIS actor about that member: display details for
     everyone, and the remove button only when the server said this actor
     manages the team.

     The card is presentation, not the boundary. DELETE /api/team/members/:id
     keeps its own owner gate and refuses your own row, the OWNER_EMAIL row and
     an elevated row, so a client that forges the manage flag gets nothing but
     a refusal. */
  let teamMembers = [];
  let teamCanManage = false;
  let memberInFocus = null;

  function memberById(id) {
    return teamMembers.find((m) => m && m.id === id) || null;
  }

  function closeDialog(id) {
    const dlg = $(id);
    if (!dlg) return;
    if (typeof dlg.close === 'function' && dlg.open) dlg.close();
    else dlg.removeAttribute('open');
  }

  /* --- member card: reach-out helpers ------------------------------------
     Everything below reads display data the member published about
     THEMSELVES in Settings, plus one bit of present-tense state. The card is
     presentation; the server remains the boundary, so nothing here decides
     who may see what. */

  /* A stable hue from a string, so the same person is the same colour on every
     screen and nothing has to be stored or agreed on. */
  function tintFrom(seed) {
    let h = 0;
    const s = String(seed || '?');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }
  function applyAvatarTint(el, seed) {
    if (!el) return;
    const hue = tintFrom(seed);
    el.style.background = 'hsl(' + hue + ' 62% 88%)';
    el.style.color = 'hsl(' + hue + ' 58% 26%)';
  }

  /* Ten minutes reads as "here now"; before that the honest minute count, and
     before that the sign-in date. It uses only lastLogin, which the team list
     already carries, so there is no new endpoint and nothing to keep fresh. */
  function statusOf(lastLogin) {
    const t = lastLogin ? new Date(lastLogin).getTime() : 0;
    if (!t || isNaN(t)) return { live: false, text: 'No sign-in recorded' };
    const mins = (Date.now() - t) / 60000;
    if (mins < 10) return { live: true, text: 'Active now' };
    if (mins < 60) return { live: false, text: 'Last seen ' + Math.max(1, Math.round(mins)) + ' min ago' };
    return { live: false, text: 'Last sign-in ' + fmtDate(lastLogin) };
  }

  /* wa.me wants the international number with no + and no spaces. A bare
     10-digit number is read as this workspace's own country code; a number
     that already carries one is left exactly as the member typed it. */
  function waHref(phone) {
    const digits = String(phone || '').replace(/[^0-9]/g, '');
    if (digits.length < 10) return '';
    return 'https://wa.me/' + (digits.length === 10 ? '91' + digits : digits);
  }

  function paintLike(m) {
    const b = $('miLike');
    if (b) {
      const on = !!(m && m.likedByMe);
      b.classList.toggle('is-liked', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on ? 'Remove your kudos' : 'Give kudos';
    }
    const c = $('miLikeCount');
    if (c) c.textContent = String((m && Number(m.likes)) || 0);
  }

  /* One vote per member per member is enforced by the server's unique pair;
     this only paints whatever answer comes back, so a double click simply
     flips twice and lands where the server says it should. */
  async function toggleLike() {
    const m = memberInFocus;
    if (!m) return;
    try {
      const out = await api.toggleMemberLike(m.id);
      m.likes = Number(out && out.likes) || 0;
      m.likedByMe = !!(out && out.likedByMe);
      paintLike(m);
    } catch (err) {
      toast(err.message || 'Could not save that');
    }
  }

  async function copyText(text, label) {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      toast(label + ' copied');
    } catch (e) {
      toast('Could not copy ' + String(label).toLowerCase());
    }
  }

  function openMemberInfo(memberId) {
    const m = memberById(memberId);
    const dlg = $('memberInfo');
    if (!m || !dlg) return;
    memberInFocus = m;
    /* Badge word, never a label derived from elevation: the card shows the
       stored role like every other surface does. */
    const pwr = storedPowerWord(m);
    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    /* A link the member has not published is removed rather than greyed out:
       there is nothing to click, and a dead pill is worse than no pill. */
    const setLink = (id, href) => {
      const el = $(id);
      if (!el) return;
      if (href) { el.href = href; el.hidden = false; }
      else { el.removeAttribute('href'); el.hidden = true; }
    };
    set('miAvatar', (String(m.name || '?').trim().charAt(0) || '?').toUpperCase());
    set('miName', m.name || '—');
    set('miSubtitle', powerLabel(pwr));
    /* Every member receives these fields — the eye opens the same card for
       everyone — so this is an honest reading of the row, never an unhide. */
    set('miEmail', m.email || 'Not shared');
    set('miPhone', m.phone || 'Not added yet');
    set('miTitle', m.roleCustom || '—');
    set('miRole', powerLabel(pwr));
    set('miFirst', m.createdAt ? fmtDate(m.createdAt) : '—');
    set('miLast', m.lastLogin ? fmtDate(m.lastLogin) : '—');
    set('miNote', '');
    /* Reach-out row and present state. The links are what this member chose to
       publish about themselves in Settings, so showing them to the team is not
       an unhide; the copy buttons and the WhatsApp pill work off the contact
       detail the row already carries. */
    applyAvatarTint($('miAvatar'), m.email || m.name);
    const st = statusOf(m.lastLogin);
    if ($('miStatus')) $('miStatus').textContent = st.text;
    if ($('miStatusDot')) $('miStatusDot').classList.toggle('is-live', st.live);
    setLink('miWa', waHref(m.phone));
    setLink('miIg', m.instagram);
    setLink('miLi', m.linkedin);
    if ($('miCopyPhone')) $('miCopyPhone').hidden = !m.phone;
    paintLike(m);
    const manage = $('miManage');
    if (manage) manage.hidden = !teamCanManage;
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  /* Removal is irreversible, so the warning is a real dialog that names the
     account and spells out what leaves with it, and NOTHING is sent until the
     second click. The counts come back in the response and are read out in the
     toast, so the scope is confirmed after the fact as well as before. */
  function askRemoveMember() {
    const m = memberInFocus;
    const dlg = $('deleteConfirm');
    if (!m || !dlg) return;
    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set('dcName', m.name || '—');
    set('dcEmail', m.email || '');
    set('dcNote', '');
    const btn = $('dcConfirm');
    if (btn) { btn.disabled = false; btn.textContent = 'Delete permanently'; }
    closeDialog('memberInfo');
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  async function confirmRemoveMember() {
    const m = memberInFocus;
    const note = $('dcNote');
    const btn = $('dcConfirm');
    if (!m) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Deleting…'; }
    if (note) note.textContent = '';
    try {
      const out = await api.deleteTeamMember(m.id);
      const rc = (out && out.removed) || {};
      const bits = [];
      const push = (n, one, many) => { if (n) bits.push(n + ' ' + (n === 1 ? one : many)); };
      push(rc.proposals, 'quotation', 'quotations');
      push(rc.customers, 'customer', 'customers');
      push(rc.tasks, 'task', 'tasks');
      push(rc.galleryUploads, 'photo', 'photos');
      push(rc.sessions, 'active session', 'active sessions');
      closeDialog('deleteConfirm');
      memberInFocus = null;
      toast('Removed ' + (m.name || 'member') + (bits.length ? ' — ' + bits.join(', ') : ''));
      await refreshTeamPanel();
    } catch (err) {
      if (note) note.textContent = err.message || 'Could not remove this member';
      if (btn) { btn.disabled = false; btn.textContent = 'Delete permanently'; }
      toast(err.message || 'Could not remove this member');
    }
  }

  async function refreshTeamPanel() {
    const body = $('teamBody');
    if (!body) return;
    const COLS = 6;
    try {
      const r = await api.listTeam();
      const members = (r && r.members) || [];
      /* The member card reads from here, because it opens after this function
         has returned. */
      teamMembers = members;
      /* Read-only unless the server says this actor manages the team. Falling
         back to the local flag keeps an older backend behaving as before. */
      const manage = r && r.canManageTeam != null ? !!r.canManageTeam : canManage();
      teamCanManage = manage;
      /* The heading pill follows the same server flag, so a member is never
         told this screen is theirs to control. The intro line under the heading
         is fixed copy in dashboard.html — one theme line for everyone, because
         the gate speaks for itself: the pill says who may act and the EDIT cell
         says "Only owner access" on every row a member cannot change. */
      if ($('teamAccessPill')) $('teamAccessPill').textContent = manage ? 'Owner access' : 'Read-only';
      body.innerHTML = members.map((m) => {
        const pwr = storedPowerWord(m);
        /* Selection follows the POWER KEY alone. A Sales or Engineer row may
           legitimately carry a preserved title now (role_custom rides along a
           role change), and that must not re-label the row as a custom role:
           the wording lives on the member card, not in this dropdown. The
           typed-title box therefore appears only for owner and custom. */
        const isCustom = m.role === 'custom';
        const titleable = isCustom || m.role === 'owner';
        const titleId = 'teamTitle_' + m.id;
        /* Contact detail goes to EVERY member now: the eye opens the full card
           for anyone, so the address and number ride the same row. Only the
           controls differ — Edit and Remove stay with the manager. */
        const contact = escapeHtml(m.email || '') +
          (m.phone ? '<span class="contact-sub">' + escapeHtml(m.phone) + '</span>' : '');
        /* The eye is the one control every row carries, manager or not. */
        const eye = '<td class="team-info-cell"><button type="button" class="team-info-btn" data-info="' + escapeHtml(m.id) +
          '" aria-label="View info for ' + escapeHtml(m.name) + '" title="View info">👁</button></td>';
        if (!manage) {
          /* View-only: the same information, no control. The EDIT cell says
             what it says on the tin instead of offering a dead affordance.
             Six cells so the header lines up. */
          return '<tr data-member="' + escapeHtml(m.id) + '" class="team-readonly">' +
            '<td><strong>' + escapeHtml(m.name) + '</strong></td>' +
            '<td class="muted">' + contact + '</td>' +
            '<td><span class="badge badge-power" data-power="' + escapeHtml(pwr) + '">' + escapeHtml(powerLabel(pwr)) + '</span></td>' +
            '<td class="muted micro">' + escapeHtml(m.lastLogin ? fmtDate(m.lastLogin) : '—') + '</td>' +
            '<td class="muted micro">Only owner access</td>' +
            eye +
          '</tr>';
        }
        let opts = ['owner', 'sales', 'viewer'].map((role) => (
          '<option value="' + role + '"' + (!isCustom && m.role === role ? ' selected' : '') + '>' + roleLabel(role) + '</option>'
        )).join('');
        /* Custom sits LAST, and its label is an INSTRUCTION rather than a
           stored value: pick it and the box below is where you type. The
           wording itself never lives in the dropdown. */
        opts += '<option value="custom"' + (isCustom ? ' selected' : '') + '>Custom — type here</option>';
        /* Never an "Admin" entry here: elevation is self-service and lives in
           the own-role pencil, so no owner can raise or lower anyone else. */
        return '<tr data-member="' + escapeHtml(m.id) + '">' +
          '<td><strong>' + escapeHtml(m.name) + '</strong></td>' +
          '<td class="muted">' + contact + '</td>' +
          '<td><span class="badge badge-power" data-power="' + escapeHtml(pwr) + '">' + escapeHtml(powerLabel(pwr)) + '</span></td>' +
          '<td class="muted micro">' + escapeHtml(m.lastLogin ? fmtDate(m.lastLogin) : '—') + '</td>' +
          '<td class="team-edit-cell">' +
            '<select data-team-user="' + escapeHtml(m.id) + '" class="team-role-select" aria-label="Role for ' + escapeHtml(m.name) + '">' +
            opts + '</select>' +
            '<input type="text" class="team-title-input" id="' + escapeHtml(titleId) +
            '" data-team-title="' + escapeHtml(m.id) + '" maxlength="60" value="' + escapeHtml(m.roleCustom || '') + '"' +
            ' placeholder="' + (m.role === 'owner' ? 'Display title (optional)' : 'Typed title') + '"' +
            (titleable ? '' : ' hidden') + ' aria-label="Display title for ' + escapeHtml(m.name) + '" />' +
          '</td>' +
          eye +
        '</tr>';
      }).join('') || '<tr><td colspan="' + COLS + '" class="empty">No members.</td></tr>';
      if (!manage && members.length) {
        body.insertAdjacentHTML('beforeend',
          '<tr><td colspan="' + COLS + '" class="empty micro">Read-only — Only owner access: only the workspace owner can change roles. Your role: ' +
          escapeHtml(roleLabel(user)) + '.</td></tr>');
      }
      /* No `if (!manage) return` here, and that is deliberate. Everything below
         binds controls that exist ONLY on a manager's rows — a read-only row
         has no role select and no title box, so those querySelectorAll calls
         simply find nothing and cost nothing. The eye, by contrast, is on EVERY
         row: returning early here used to render the button for every role and
         then leave it with no listener, so the click went nowhere and only a
         manager could actually open a card. */
      const applyRole = async (memberId, role, titleVal) => {
        /* The title travels with EVERY role, Sales and Engineer included: that
           is what preserves the wording across a role change instead of
           wiping it. The badge still comes from the power key alone. */
        const out = await api.setTeamRole(memberId, role, titleVal);
        if (out && out.note) toast(out.note);
        if (memberId === user.id && out && out.member) {
          user.role = out.member.role;
          user.roleCustom = out.member.roleCustom || null;
          user.roleLabel = out.member.roleLabel || roleLabel(out.member.role);
          /* S2 changed what a member row carries: canWrite/canManageTeam on a
             team-panel row are now the STORED-role values, and the effective
             ones arrive as effectiveCanWrite/effectiveCanManageTeam on the
             actor's own row only. Reading the stored pair here would silently
             strip a viewer-level elevated account of its reach after any role
             edit, so the effective fields win whenever the backend sends them. */
          user.canWrite = out.member.effectiveCanWrite != null
            ? !!out.member.effectiveCanWrite : out.member.canWrite;
          user.canManageTeam = out.member.effectiveCanManageTeam != null
            ? !!out.member.effectiveCanManageTeam : out.member.canManageTeam;
          if (out.member.isAdmin != null) user.isAdmin = !!out.member.isAdmin;
          if (out.member.canElevate != null) user.canElevate = !!out.member.canElevate;
          showApp();
        }
        return out;
      };

      body.querySelectorAll('.team-role-select').forEach((sel) => {
        sel.addEventListener('change', async () => {
          const id = sel.getAttribute('data-team-user');
          const row = sel.closest('tr');
          const input = row ? row.querySelector('.team-title-input') : null;
          /* The box appears only for the two roles that carry wording; on
             Sales / Engineer it is gone rather than greyed out. */
          const wantsTitle = sel.value === 'custom' || sel.value === 'owner';
          if (input) { input.hidden = !wantsTitle; input.disabled = !wantsTitle; }
          try {
            await applyRole(id, sel.value, input ? input.value.trim() : '');
            toast('Role updated');
            await refreshTeamPanel();
          } catch (err) {
            toast(err.message || 'Could not change role');
            await refreshTeamPanel();
          }
        });
      });

      body.querySelectorAll('.team-title-input').forEach((input) => {
        input.addEventListener('change', async () => {
          const id = input.getAttribute('data-team-title');
          const row = input.closest('tr');
          const sel = row ? row.querySelector('.team-role-select') : null;
          if (!sel || (sel.value !== 'custom' && sel.value !== 'owner')) return;
          try {
            await applyRole(id, sel.value, input.value.trim());
            toast('Title updated');
            await refreshTeamPanel();
          } catch (err) {
            toast(err.message || 'Could not change title');
            await refreshTeamPanel();
          }
        });
      });

      /* The card opens for everyone; what it offers inside is decided from
         teamCanManage, which the server set — this listener is only the
         click, never the permission. */
      body.querySelectorAll('.team-info-btn').forEach((btn) => {
        btn.addEventListener('click', () => openMemberInfo(btn.getAttribute('data-info')));
      });
    } catch (err) {
      body.innerHTML = '<tr><td colspan="' + COLS + '" class="empty">' + escapeHtml(err.message || 'Could not load team') + '</td></tr>';
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
      escapeHtml(h.storage || '?') + '</strong> · code <strong>' + escapeHtml(h.codeVersion || '?') +
      '</strong> · ' + escapeHtml(h.time || '');
    /* Health warnings are configuration state only - they never name an email
       or admit that a designated admin exists. */
    const warns = (h.warnings || []).filter(Boolean);
    if (warns.length) {
      el.innerHTML += '<br><span class="warn">' + warns.map(escapeHtml).join('<br>') + '</span>';
    }
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

  window.QSDash = { proposals: () => allProposals, setProposals: rows => { allProposals = rows; renderPropTable(); renderPropStats(); }, user: () => user, canEdit, canManage, powerLabel, refresh: () => refreshAll(), show: (name, id) => showPanel(name, id), open: (id) => openInStudio(id), toast,
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
        const phone = ($('profilePhone') && $('profilePhone').value || '').trim();
        const title = ($('profileTitle') && $('profileTitle').value || '').trim();
        const instagram = (($('profileInstagram') && $('profileInstagram').value) || '').trim();
        const linkedin = (($('profileLinkedin') && $('profileLinkedin').value) || '').trim();
        const msg = $('profileSaveMsg');
        if (msg) msg.textContent = '';
        if (!name) {
          if (msg) msg.textContent = 'Name cannot be empty.';
          toast('Name cannot be empty');
          return;
        }
        /* Read back in English before anything is written. This updates
           display details only — the job title never decides access. */
        const ok = await confirmDialog({
          title: 'Save your profile?',
          body: 'Your display name, contact number, job title and social links will be updated across the workspace. Your access does not change.',
          confirm: 'Save changes'
        });
        if (!ok) return;
        $('btnSaveProfile').disabled = true;
        try {
          const r = await api.updateProfile({ name, phone, title, instagram, linkedin });
          user = r.user;
          showApp();
          await renderHome();
          refreshProfileNudge();
          if (msg) msg.textContent = 'Profile saved.';
          toast('Profile saved');
        } catch (err) {
          if (msg) msg.textContent = err.message || 'Could not save profile';
          toast(err.message || 'Could not save profile');
        } finally {
          $('btnSaveProfile').disabled = false;
        }
      });
    }

    /* Member card, removal warning and the one-time nudge — bound once, so a
       re-render of the table can never stack a second listener. */
    if ($('memberInfoClose')) $('memberInfoClose').addEventListener('click', () => closeDialog('memberInfo'));
    if ($('miDelete')) $('miDelete').addEventListener('click', askRemoveMember);
    /* The heart and the copy pills live in the card, which is rebuilt only as
       HTML — so these are bound once, here, and read memberInFocus on click. */
    if ($('miLike')) $('miLike').addEventListener('click', toggleLike);
    if ($('miCopyEmail')) $('miCopyEmail').addEventListener('click', () => {
      if (memberInFocus) copyText(memberInFocus.email || '', 'Email');
    });
    if ($('miCopyPhone')) $('miCopyPhone').addEventListener('click', () => {
      if (memberInFocus) copyText(memberInFocus.phone || '', 'Number');
    });
    if ($('dcCancel')) $('dcCancel').addEventListener('click', () => closeDialog('deleteConfirm'));
    if ($('dcConfirm')) $('dcConfirm').addEventListener('click', confirmRemoveMember);
    if ($('btnNudgeClose')) {
      $('btnNudgeClose').addEventListener('click', () => {
        const el = $('profileNudge');
        if (el) el.hidden = true;
      });
    }
    if ($('btnNudgeGo')) {
      $('btnNudgeGo').addEventListener('click', () => {
        showPanel('settings');
        document.querySelectorAll('[data-settings]').forEach((n) => n.classList.toggle('selected', n.dataset.settings === 'profile'));
        document.querySelectorAll('[data-settings-section]').forEach((n) => { n.hidden = n.dataset.settingsSection !== 'profile'; });
        const focusField = $('profilePhone') || $('profileName');
        if (focusField) focusField.focus();
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
        const handoff = new URLSearchParams(location.search), panel = handoff.get('panel'), id = handoff.get('proposal');
        if (['home','proposals','tasks','activity','reports','send'].includes(panel)) {
          if (!id || allProposals.some(p=>p.id===id)) showPanel(panel,id);
        }
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
