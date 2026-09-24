/* ==========================================================================
   Quotation Studio — Staff Dashboard controller (Phase A)
   ========================================================================== */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.PlatformAPI;

  let mode = 'login'; /* login | register */
  let user = null;
  let allProposals = [];
  let toastTimer = null;

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
  function setAuthMode(next) {
    mode = next;
    $('tabLogin').classList.toggle('on', mode === 'login');
    $('tabRegister').classList.toggle('on', mode === 'register');
    $('nameField').hidden = mode !== 'register';
    $('authHeading').textContent = mode === 'login' ? 'Sign in' : 'Create account';
    $('authSub').textContent = mode === 'login'
      ? 'Cloud proposals, status and the path to customer links — Phase A.'
      : 'First account on this server becomes Owner. Use your work email when you have it.';
    $('authSubmit').textContent = mode === 'login' ? 'Sign in' : 'Create account';
    $('authPassword').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('authError').classList.remove('on');
    $('authError').textContent = '';
  }

  function showAuthError(msg) {
    const el = $('authError');
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
    $('settingsRole').textContent = user.role || '—';
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
    if (name === 'settings') refreshHealth();
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
      renderHome((sum && sum.recent) || allProposals.slice(0, 8));
      renderPropTable();
    } catch (err) {
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
    $('authForm').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      $('authError').classList.remove('on');
      const email = $('authEmail').value.trim();
      const password = $('authPassword').value;
      const name = $('authName').value.trim();
      $('authSubmit').disabled = true;
      try {
        const r = mode === 'login'
          ? await api.login(email, password)
          : await api.register(name, email, password);
        user = r.user;
        showApp();
        await refreshAll();
        toast(mode === 'login' ? 'Signed in' : 'Account created');
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
