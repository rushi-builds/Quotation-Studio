/* ==========================================================================
   Quotation Studio — Staff Dashboard controller (Phase A)
   ========================================================================== */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.PlatformAPI;

  let mode = 'login'; /* login | register */
  let user = null;

  function keepSession(r) {
    if (r && r.token && api.setSessionToken) api.setSessionToken(r.token);
  }
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
    return '<span class="badge ' + s + '">' + escapeHtml(label) + '</span>';
  }

  function escapeHtml(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
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
    mode = next;
    const isLogin = mode === 'login';
    const isRegister = mode === 'register';
    const isForgot = mode === 'forgot';
    const isReset = mode === 'reset';
    if ($('tabLogin')) $('tabLogin').classList.toggle('on', isLogin);
    if ($('tabRegister')) $('tabRegister').classList.toggle('on', isRegister);
    if ($('nameField')) $('nameField').hidden = !isRegister;
    if ($('roleField')) $('roleField').hidden = !isRegister;
    if ($('customRoleField')) {
      const showCustom = isRegister && $('authRole') && $('authRole').value === 'custom';
      $('customRoleField').hidden = !showCustom;
    }
    if ($('passwordField')) $('passwordField').hidden = isForgot;
    if ($('resetCodeField')) $('resetCodeField').hidden = !isReset;
    if ($('newPasswordField')) $('newPasswordField').hidden = !isReset;
    if ($('authPassword')) {
      $('authPassword').required = isLogin || isRegister;
      $('authPassword').autocomplete = isLogin ? 'current-password' : 'new-password';
    }
    if ($('authResetCode')) $('authResetCode').required = isReset;
    if ($('authNewPassword')) $('authNewPassword').required = isReset;
    if ($('btnForgot')) $('btnForgot').hidden = !(isLogin || isForgot);
    if ($('btnBackSignIn')) $('btnBackSignIn').hidden = isLogin || isRegister;

    if (isLogin) {
      $('authHeading').textContent = 'Sign in';
      $('authSub').textContent = 'Access your cloud proposals, customer links and follow-ups.';
      $('authSubmit').textContent = 'Sign in';
    } else if (isRegister) {
      $('authHeading').textContent = 'Create account';
      $('authSub').textContent = 'Pick your role when you create the account. Each email can register only once.';
      $('authSubmit').textContent = 'Create account';
    } else if (isForgot) {
      $('authHeading').textContent = 'Forgot password';
      $('authSub').textContent = 'Enter the email for your account. If it exists, a one-time recovery code will be shown (email delivery is not configured on this server yet).';
      $('authSubmit').textContent = 'Get recovery code';
    } else if (isReset) {
      $('authHeading').textContent = 'Set new password';
      $('authSub').textContent = 'Enter the recovery code and choose a new password (minimum 8 characters, no spaces).';
      $('authSubmit').textContent = 'Update password & sign in';
    }
    clearAuthMessages();
  }

  function showAuthError(msg) {
    clearAuthMessages();
    const el = $('authError');
    if (!el) return;
    el.textContent = msg || 'Something went wrong';
    el.classList.add('on');
  }

  function showApp() {
    $('authScreen').style.display = 'none';
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
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    $('homeGreeting').textContent = greet + ', ' + (user.name || 'there').split(' ')[0];
  }

  function showAuth() {
    $('dash').classList.remove('on');
    $('authScreen').style.display = '';
    user = null;
  }

  /* ---------- navigation ---------- */
  let lastLaunch = null;

  function showPanel(name) {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('on'));
    document.querySelectorAll('.nav-item[data-panel]').forEach((n) => {
      n.classList.toggle('on', n.getAttribute('data-panel') === name);
    });
    const panel = $('panel-' + name);
    if (panel) panel.classList.add('on');
    if (name === 'proposals') renderPropTable();
    if (name === 'home') renderHome();
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
    const body = $('notifBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty">No notifications yet. Customer opens and requests will appear here.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((n) => (
      '<tr style="' + (n.unread ? 'background:#FFFBF5' : '') + '">' +
        '<td class="muted">' + escapeHtml(fmtDate(n.createdAt)) + '</td>' +
        '<td><strong>' + escapeHtml(n.title) + '</strong>' +
          (n.unread ? ' <span class="badge sent">New</span>' : '') + '</td>' +
        '<td class="muted">' + escapeHtml(n.body || '—') + '</td>' +
        '<td class="row-actions">' +
          (n.unread
            ? '<button type="button" class="btn btn-ghost btn-sm" data-act="read-n" data-id="' +
              escapeHtml(n.id) + '">Mark read</button>'
            : '') +
        '</td></tr>'
    )).join('');
    body.querySelectorAll('[data-act="read-n"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await api.markNotificationRead(btn.getAttribute('data-id'));
          await refreshActivityPanel();
          await refreshAll();
        } catch (err) {
          toast(err.message || 'Could not update notification');
        }
      });
    });
  }

  function renderActivity(rows) {
    const body = $('activityBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="3" class="empty">No activity yet.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((e) => (
      '<tr>' +
        '<td class="muted">' + escapeHtml(fmtDate(e.createdAt)) + '</td>' +
        '<td>' + escapeHtml(EVENT_LABELS[e.type] || e.type) + '</td>' +
        '<td class="muted">' + escapeHtml(e.proposalTitle || e.proposalId || '—') + '</td>' +
      '</tr>'
    )).join('');
  }

  async function refreshTasksPanel() {
    fillTaskProposalSelect();
    try {
      const r = await api.listTasks();
      renderTasks((r && r.tasks) || []);
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
    const body = $('tasksBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4" class="empty">No follow-ups yet. Add a call or visit reminder above.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((t) => {
      let badge = t.status;
      let cls = 'draft';
      if (t.status === 'open' && t.overdue) { badge = 'Overdue'; cls = 'rejected'; }
      else if (t.status === 'open') { badge = 'Open'; cls = 'sent'; }
      else if (t.status === 'done') { badge = 'Done'; cls = 'accepted'; }
      else if (t.status === 'cancelled') { badge = 'Cancelled'; cls = 'archived'; }
      const prop = allProposals.find((p) => p.id === t.proposalId);
      return '<tr>' +
        '<td><strong>' + escapeHtml(t.title) + '</strong>' +
          (prop ? '<div class="muted" style="font-size:11.5px">' + escapeHtml(prop.customer || prop.ref || '') + '</div>' : '') +
          (t.notes ? '<div class="muted" style="font-size:11.5px">' + escapeHtml(t.notes) + '</div>' : '') +
        '</td>' +
        '<td class="muted">' + escapeHtml(t.dueAt ? fmtDate(t.dueAt) : '—') + '</td>' +
        '<td><span class="badge ' + cls + '">' + escapeHtml(badge) + '</span></td>' +
        '<td class="row-actions">' +
          (t.status === 'open'
            ? '<button type="button" class="btn btn-secondary btn-sm" data-act="task-done" data-id="' +
              escapeHtml(t.id) + '">Complete</button>' +
              '<button type="button" class="btn btn-ghost btn-sm" data-act="task-cancel" data-id="' +
              escapeHtml(t.id) + '">Cancel</button>'
            : '<button type="button" class="btn btn-ghost btn-sm" data-act="task-reopen" data-id="' +
              escapeHtml(t.id) + '">Reopen</button>') +
          '<button type="button" class="btn btn-danger-soft btn-sm" data-act="task-del" data-id="' +
            escapeHtml(t.id) + '">Delete</button>' +
        '</td></tr>';
    }).join('');
    body.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', onTaskAction);
    });
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
        $('repValue').textContent = fmtINR(r.value && r.value.quotedSum);
      }
      if ($('repValueHint')) {
        const known = (r.value && r.value.proposalsWithValue) || 0;
        const miss = (r.value && r.value.proposalsMissingValue) || 0;
        $('repValueHint').textContent = known + ' with value · ' + miss + ' missing';
      }
      const eng = r.engagement || {};
      if ($('repEngagement')) {
        $('repEngagement').innerHTML =
          'Versions published: <strong>' + escapeHtml(eng.versionsPublished || 0) + '</strong><br />' +
          'Active customer links: <strong>' + escapeHtml(eng.activeCustomerLinks || 0) + '</strong><br />' +
          'Share starts (manual): <strong>' + escapeHtml(eng.shareClicksRecorded || 0) + '</strong><br />' +
          'Link opens: <strong>' + escapeHtml(eng.linkOpens || 0) + '</strong> · ' +
          'Suspected previews: <strong>' + escapeHtml(eng.suspectedPrefetches || 0) + '</strong><br />' +
          'PDF requests: <strong>' + escapeHtml(eng.pdfDownloadRequests || 0) + '</strong> · ' +
          'Survey requests: <strong>' + escapeHtml(eng.surveyRequests || 0) + '</strong><br />' +
          '<span class="muted">' + escapeHtml(eng.note || '') + '</span>';
      }
      const st = (r.proposals && r.proposals.byStatus) || {};
      if ($('repStatus')) {
        const keys = Object.keys(st);
        $('repStatus').innerHTML = keys.length
          ? keys.map((k) => escapeHtml(STATUS_LABEL[k] || k) + ': <strong>' + st[k] + '</strong>').join(' · ')
          : 'No proposals yet.';
      }
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

  async function refreshSendPanel() {
    fillSendSelect();
    const id = $('sendSelect') && $('sendSelect').value;
    lastLaunch = null;
    if ($('btnSendLaunch')) $('btnSendLaunch').hidden = true;
    if ($('btnSendCopy')) $('btnSendCopy').hidden = true;
    if ($('sendResult')) {
      $('sendResult').style.display = 'none';
      $('sendResult').className = 'banner info';
    }
    if (!id) {
      if ($('sendsBody')) {
        $('sendsBody').innerHTML = '<tr><td colspan="5" class="empty">Select a proposal to view send history.</td></tr>';
      }
      if ($('sendMessage')) $('sendMessage').value = '';
      return;
    }
    try {
      const [preview, sends] = await Promise.all([
        api.sendPreview(id),
        api.listSends(id)
      ]);
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
        $('sendHonesty').textContent = preview.honestyNote;
      }
      renderSends((sends && sends.sends) || []);
    } catch (err) {
      banner('err', err.message || 'Could not load send centre');
    }
  }

  function renderSends(rows) {
    const body = $('sendsBody');
    if (!body) return;
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty">No send attempts recorded yet.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((s) => {
      let badgeCls = 'draft';
      if (s.state === 'share_clicked') badgeCls = 'sent';
      if (s.state === 'delivered') badgeCls = 'accepted';
      if (s.state === 'failed' || s.state === 'cancelled') badgeCls = 'rejected';
      return '<tr>' +
        '<td class="muted">' + escapeHtml(fmtDate(s.createdAt)) + '</td>' +
        '<td>' + escapeHtml(s.channelLabel || s.channel) + '</td>' +
        '<td>' + escapeHtml(s.recipientTo || s.recipientName || '—') + '</td>' +
        '<td><span class="badge ' + badgeCls + '" title="' + escapeHtml(s.stateLabel || '') + '">' +
          escapeHtml(s.stateLabel || s.state) + '</span></td>' +
        '<td class="row-actions">' +
          (s.state !== 'cancelled' && s.state !== 'failed'
            ? '<button type="button" class="btn btn-ghost btn-sm" data-act="cancel-send" data-id="' +
              escapeHtml(s.id) + '">Cancel</button>'
            : '') +
        '</td></tr>';
    }).join('');
    body.querySelectorAll('[data-act="cancel-send"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await api.updateSendState(btn.getAttribute('data-id'), 'cancelled');
          toast('Send marked cancelled');
          await refreshSendPanel();
        } catch (err) {
          toast(err.message || 'Could not update send');
        } finally {
          btn.disabled = false;
        }
      });
    });
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

  async function refreshPublishPanel() {
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
          (t.revokedAt ? '' :
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
  async function refreshAll() {
    banner(null);
    try {
      const [sum, list] = await Promise.all([api.summary(), api.listProposals()]);
      allProposals = (list && list.proposals) || [];
      const c = (sum && sum.counts) || {};
      $('kpiTotal').textContent = c.total != null ? c.total : allProposals.length;
      $('kpiDraft').textContent = c.draft != null ? c.draft : '0';
      $('kpiReady').textContent = c.ready != null ? c.ready : '0';
      $('kpiAccepted').textContent = c.accepted != null ? c.accepted : (c.won != null ? c.won : '0');
      if ($('kpiUnread')) $('kpiUnread').textContent = c.unreadNotifications != null ? c.unreadNotifications : '0';
      if ($('kpiTasks')) $('kpiTasks').textContent = c.openTasks != null ? c.openTasks : '0';
      if ($('kpiOverdue')) $('kpiOverdue').textContent = c.overdueTasks != null ? c.overdueTasks : '0';
      if ($('kpiRole')) $('kpiRole').textContent = roleLabel(user || (sum && sum.role) || '');
      renderHome((sum && sum.recent) || allProposals.slice(0, 8));
      renderPropTable();
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

  function renderHome(recent) {
    const rows = recent || allProposals.slice(0, 8);
    const body = $('homeTableBody');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty">No cloud proposals yet. Create one or save from the Studio.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((p) => rowHtml(p, true)).join('');
    bindRowActions(body);
  }

  function filteredProposals() {
    const q = (($('filterQ') && $('filterQ').value) || '').trim().toLowerCase();
    const st = ($('filterStatus') && $('filterStatus').value) || '';
    return allProposals.filter((p) => {
      if (st && p.status !== st) return false;
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
      body.innerHTML = '<tr><td colspan="7" class="empty">No proposals match. Try clearing filters or create a new one.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((p) => rowHtml(p, false)).join('');
    bindRowActions(body);
  }

  function rowHtml(p, compact) {
    const customer = escapeHtml(p.customer || 'Untitled');
    const ref = escapeHtml(p.ref || '—');
    const cap = escapeHtml(p.capacity ? p.capacity + ' kWp' : '—');
    const ver = escapeHtml(p.version || '1.0');
    const updated = escapeHtml(fmtDate(p.updatedAt));
    const actions =
      '<div class="row-actions">' +
        '<button type="button" class="btn btn-secondary btn-sm" data-act="open" data-id="' + escapeHtml(p.id) + '">Open in Studio</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="pub" data-id="' + escapeHtml(p.id) + '">Publish</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="send" data-id="' + escapeHtml(p.id) + '">Send</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="dup" data-id="' + escapeHtml(p.id) + '">Duplicate</button>' +
        '<button type="button" class="btn btn-danger-soft btn-sm" data-act="del" data-id="' + escapeHtml(p.id) + '">Delete</button>' +
      '</div>';
    if (compact) {
      return '<tr>' +
        '<td><strong>' + customer + '</strong></td>' +
        '<td class="mono muted">' + ref + '</td>' +
        '<td>' + cap + '</td>' +
        '<td>' + badge(p.status) + '</td>' +
        '<td class="muted">' + updated + '</td>' +
        '<td>' + actions + '</td></tr>';
    }
    return '<tr>' +
      '<td><strong>' + customer + '</strong><div class="muted" style="font-size:11.5px">' + escapeHtml(p.title || '') + '</div></td>' +
      '<td class="mono muted">' + ref + '</td>' +
      '<td class="mono">v' + ver + '</td>' +
      '<td>' + cap + '</td>' +
      '<td>' + badge(p.status) + '</td>' +
      '<td class="muted">' + updated + '</td>' +
      '<td>' + actions + '</td></tr>';
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
      showPanel('publish');
      fillPublishSelect(id);
      if ($('publishSelect')) $('publishSelect').value = id;
      refreshPublishPanel();
      return;
    }
    if (act === 'send') {
      showPanel('send');
      fillSendSelect(id);
      if ($('sendSelect')) $('sendSelect').value = id;
      refreshSendPanel();
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

  async function createBlankAndOpen() {
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
    }
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

  /* ---------- boot ---------- */
  async function boot() {
    $('tabLogin').addEventListener('click', () => setAuthMode('login'));
    $('tabRegister').addEventListener('click', () => setAuthMode('register'));
    if ($('authRole')) {
      $('authRole').addEventListener('change', () => {
        if ($('customRoleField')) {
          $('customRoleField').hidden = $('authRole').value !== 'custom' || mode !== 'register';
        }
      });
    }
    if ($('btnForgot')) {
      $('btnForgot').addEventListener('click', () => setAuthMode('forgot'));
    }
    if ($('btnBackSignIn')) {
      $('btnBackSignIn').addEventListener('click', () => setAuthMode('login'));
    }
    $('authForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      clearAuthMessages();
      const email = $('authEmail').value.trim();
      const password = $('authPassword') ? $('authPassword').value : '';
      const name = $('authName') ? $('authName').value.trim() : '';
      const code = $('authResetCode') ? $('authResetCode').value.trim() : '';
      const newPass = $('authNewPassword') ? $('authNewPassword').value : '';
      $('authSubmit').disabled = true;
      try {
        if (mode === 'login') {
          const r = await api.login(email, password);
          keepSession(r);
          user = r.user;
          showApp();
          await refreshAll();
          toast('Signed in');
        } else if (mode === 'register') {
          if (!name) throw new Error('Please enter your name.');
          const role = ($('authRole') && $('authRole').value) || 'sales';
          const roleCustom = ($('authRoleCustom') && $('authRoleCustom').value || '').trim();
          if (role === 'custom' && !roleCustom) {
            throw new Error('Enter a custom role title, or pick Owner, Sales, or Viewer.');
          }
          const r = await api.register(name, email, password, role, roleCustom);
          keepSession(r);
          user = r.user;
          showApp();
          await refreshAll();
          toast('Account created');
        } else if (mode === 'forgot') {
          const r = await api.forgotPassword(email);
          if (r.recoveryCode) {
            showAuthOk(
              (r.message || 'Recovery code ready.') +
              ' Your code: ' + r.recoveryCode +
              ' — copy it now, then continue to set a new password.'
            );
            if ($('authResetCode')) $('authResetCode').value = r.recoveryCode;
            setAuthMode('reset');
            /* keep the success banner after mode switch */
            showAuthOk(
              'Recovery code: ' + r.recoveryCode +
              '. It expires in 30 minutes and works once. Enter it below with your new password.'
            );
          } else {
            showAuthOk(r.message || 'If that account exists, follow the recovery steps provided by your administrator.');
            setAuthMode('reset');
          }
        } else if (mode === 'reset') {
          const r = await api.resetPassword(email, code, newPass);
          keepSession(r);
          user = r.user;
          showApp();
          await refreshAll();
          toast(r.message || 'Password updated');
        }
      } catch (err) {
        showAuthError(err.message || 'Authentication failed');
      } finally {
        $('authSubmit').disabled = false;
      }
    });

    async function doLogout() {
      try { await api.logout(); } catch (_) {}
      showAuth();
      setAuthMode('login');
      toast('Signed out');
    }
    $('btnLogout').addEventListener('click', doLogout);
    $('btnLogout2').addEventListener('click', doLogout);

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

    document.querySelectorAll('.nav-item[data-panel]').forEach((n) => {
      n.addEventListener('click', () => showPanel(n.getAttribute('data-panel')));
    });

    $('btnNewFromHome').addEventListener('click', createBlankAndOpen);
    $('btnNewProposal').addEventListener('click', createBlankAndOpen);
    $('filterQ').addEventListener('input', renderPropTable);
    $('filterStatus').addEventListener('change', renderPropTable);
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
    if ($('btnTaskAdd')) $('btnTaskAdd').addEventListener('click', addTask);
    if ($('btnReportRefresh')) $('btnReportRefresh').addEventListener('click', refreshReportsPanel);

    /* session restore */
    try {
      const avail = await api.isAvailable();
      if (!avail) {
        showAuthError('Platform server is not running. Start it with: node platform/local-server/server.js');
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
