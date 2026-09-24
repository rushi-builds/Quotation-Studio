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
    if (name === 'settings') refreshHealth();
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
