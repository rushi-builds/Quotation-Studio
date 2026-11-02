/* ==========================================================================
   Feedback inbox — the dashboard panel behind #panel-feedback.
   --------------------------------------------------------------------------
   Reads GET /api/feedback, which already merges the two public sources:
     · project notes visitors leave on gallery.html
     · ratings and comments customers leave on a shared quotation
   The server computes the statistics, so this file never invents a number:
   it renders `stats` exactly as received and only filters the list.

   It also keeps a small index of feedback per quotation, which is what puts
   the "★ 4.5 · 2 notes" chip on a row in the Quotations table.
   ========================================================================== */
'use strict';

(function (root) {
  const api = root.PlatformAPI;
  const panel = () => document.getElementById('panel-feedback');

  const state = {
    source: 'all',
    status: 'all',
    rating: 0,
    q: '',
    offset: 0,
    limit: 20,
    items: [],
    stats: null,
    matched: 0,
    hasMore: false,
    loading: false,
    error: '',
    ready: false
  };

  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    const clean = String(name || '').trim();
    if (!clean) return '··';
    const parts = clean.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]).join('').toUpperCase();
  }

  function when(iso) {
    const ms = Date.parse(iso || '');
    if (!Number.isFinite(ms)) return '';
    const diff = Date.now() - ms;
    const min = Math.round(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + 'm ago';
    const hours = Math.round(min / 60);
    if (hours < 24) return hours + 'h ago';
    const days = Math.round(hours / 24);
    if (days < 7) return days + 'd ago';
    try {
      return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (_) {
      return new Date(ms).toISOString().slice(0, 10);
    }
  }

  function stars(rating) {
    const value = Number(rating) || 0;
    let html = '<span class="fb-stars" title="' + value + ' out of 5" aria-label="' + value + ' out of 5">';
    for (let i = 1; i <= 5; i += 1) {
      html += '<i class="' + (i <= value ? 'on' : '') + '" aria-hidden="true">★</i>';
    }
    return html + '</span>';
  }

  function query() {
    const params = {
      source: state.source,
      status: state.status,
      rating: state.rating || '',
      q: state.q,
      limit: state.limit,
      offset: state.offset
    };
    if (state.focusProposal) params.proposal = state.focusProposal;
    return params;
  }

  /* ---------- data ---------- */
  async function refresh(reset) {
    if (!api || !panel()) return;
    if (reset) {
      state.offset = 0;
      state.items = [];
    }
    state.loading = true;
    state.error = '';
    render();
    try {
      const data = await api.feedback(query());
      const items = Array.isArray(data && data.items) ? data.items : [];
      state.items = reset || state.offset === 0 ? items : state.items.concat(items);
      state.stats = data && data.stats ? data.stats : null;
      state.matched = Number(data && data.matched) || items.length;
      state.hasMore = !!(data && data.hasMore);
      state.ready = true;
      state.offset = state.items.length;
    } catch (error) {
      state.error = (error && error.message) || 'Could not load feedback.';
      state.ready = true;
    } finally {
      state.loading = false;
      render();
    }
    paintBadge();
  }

  /* A light index (most recent 200 notes) so a quotation row can show its own
     rating without a request per row. */
  const index = { byProposal: Object.create(null), loaded: false };
  async function loadIndex() {
    if (!api || index.loaded) return;
    try {
      const data = await api.feedback({ limit: 200 });
      index.byProposal = Object.create(null);
      (data && data.items || []).forEach((item) => {
        if (!item.proposal || !item.proposal.id) return;
        const id = item.proposal.id;
        const entry = index.byProposal[id] || { count: 0, sum: 0, rated: 0 };
        entry.count += 1;
        if (item.rating) { entry.sum += item.rating; entry.rated += 1; }
        index.byProposal[id] = entry;
      });
      index.loaded = true;
      paintBadge(data && data.stats);
      document.dispatchEvent(new CustomEvent('qs:feedback-index'));
    } catch (_) {
      /* Offline or signed out: the table simply renders without chips. */
    }
  }

  function chipFor(proposalId) {
    const entry = index.byProposal[String(proposalId || '')];
    if (!entry || !entry.count) return '';
    const avg = entry.rated ? Math.round((entry.sum / entry.rated) * 10) / 10 : null;
    const label = (avg ? '★ ' + avg : '★') + ' · ' + entry.count + (entry.count === 1 ? ' note' : ' notes');
    return '<button type="button" class="qfb-chip" data-qfb="' + esc(proposalId) + '" title="Read this quotation’s feedback">' + esc(label) + '</button>';
  }

  function paintBadge(stats) {
    const badge = $('feedbackNavBadge');
    if (!badge) return;
    const fresh = stats ? Number(stats.fresh) || 0 : (state.stats ? Number(state.stats.fresh) || 0 : 0);
    badge.textContent = fresh > 99 ? '99+' : String(fresh);
    badge.hidden = !fresh;
  }

  /* ---------- render ---------- */
  function statCard(label, value, note, cls) {
    return '<div class="fb-stat ' + (cls || '') + '"><span>' + esc(label) + '</span><strong>' +
      esc(value) + '</strong><small>' + esc(note) + '</small></div>';
  }

  function renderStats() {
    const host = $('feedbackStats');
    if (!host) return;
    const s = state.stats;
    if (!s) {
      host.innerHTML = statCard('Notes received', '—', 'loading', 'is-plain') +
        statCard('Needs a reply', '—', 'loading', 'is-plain') +
        statCard('Average rating', '—', 'loading', 'is-plain') +
        statCard('Project likes', '—', 'loading', 'is-plain');
      return;
    }
    const weekNote = s.week ? '+' + s.week + ' in the last 7 days' : 'nothing new this week';
    const freshNote = s.total ? 'of ' + s.total + ' note' + (s.total === 1 ? '' : 's') : 'inbox is clear';
    const ratingNote = s.rated ? s.rated + ' note' + (s.rated === 1 ? '' : 's') + ' rated' : 'no ratings yet';
    const likeNote = s.likes && s.likes.projects
      ? s.likes.projects + ' project' + (s.likes.projects === 1 ? '' : 's') + ' liked'
      : 'no likes yet';
    host.innerHTML =
      statCard('Notes received', s.total, weekNote, '') +
      statCard('Needs a reply', s.fresh, freshNote, 'is-quiet') +
      statCard('Average rating', s.avgRating == null ? '—' : s.avgRating + '/5', ratingNote, 'is-green') +
      statCard('Project likes', (s.likes && s.likes.total) || 0, likeNote, 'is-plain');
  }

  function noteHtml(item) {
    const isProject = item.source === 'project';
    const subject = isProject
      ? (item.project && item.project.name) || 'Gallery page'
      : (item.proposal && (item.proposal.ref || item.proposal.title)) || 'Quotation';
    const sub = isProject
      ? [item.project && item.project.capacity, item.project && item.project.sector].filter(Boolean).join(' · ')
      : [item.proposal && item.proposal.customer, item.proposal && item.proposal.version].filter(Boolean).join(' · ');
    const who = item.name || (isProject ? 'Gallery visitor' : (item.proposal && item.proposal.customer) || 'Customer');
    const openLink = isProject
      ? ((item.project && item.project.id)
        ? '<a class="fb-link" href="gallery.html#p-' + encodeURIComponent(item.project.id) +
          '" target="_blank" rel="noopener">View project ↗</a>'
        : '')
      : (item.proposal && item.proposal.id
        ? '<button type="button" class="fb-link" data-open-quote="' + esc(item.proposal.id) + '">Open quotation ↗</button>'
        : '');
    return '<article class="fb-note ' + (item.handledAt ? 'is-handled' : 'is-new') +
      '" data-source="' + esc(item.source) + '" data-item="' + esc(item.id) + '">' +
      '<span class="fb-avatar" aria-hidden="true">' + esc(initials(who)) + '</span>' +
      '<div>' +
        '<div class="fb-note-head">' +
          '<strong>' + esc(who) + '</strong>' +
          '<span class="fb-source ' + esc(item.source) + '">' + esc(item.sourceLabel) + '</span>' +
          '<span class="fb-when">' + esc(when(item.createdAt)) + '</span>' +
        '</div>' +
        '<p class="fb-message">' + esc(item.message || '(No written note — rating only.)') + '</p>' +
        '<div class="fb-foot">' +
          (item.rating ? stars(item.rating) : '<span class="fb-subject">No rating</span>') +
          '<span class="fb-subject" title="' + esc(subject + (sub ? ' · ' + sub : '')) + '">' + esc(subject) +
            (sub ? ' · ' + esc(sub) : '') + '</span>' +
          (item.contactRequested ? '<span class="fb-contact">Wants a call</span>' : '') +
          (item.nextStep && item.nextStep !== 'interested' ? '<span class="fb-subject">Next: ' + esc(item.nextStep) + '</span>' : '') +
          '<div class="fb-actions">' +
            openLink +
            '<button type="button" class="fb-mark ' + (item.handledAt ? 'is-undo' : '') + '" data-mark="' +
              esc(item.id) + '">' + (item.handledAt ? 'Handled ✓' : 'Mark handled') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function emptyHtml() {
    if (state.error) {
      return '<div class="fb-empty is-error"><strong>Could not load feedback</strong><p>' +
        esc(state.error) + '</p></div>';
    }
    const filtering = state.source !== 'all' || state.status !== 'all' || state.rating || state.q || state.focusProposal;
    return '<div class="fb-empty"><strong>' + (filtering ? 'No notes match this filter' : 'No feedback yet') + '</strong>' +
      '<p>' + (filtering
        ? 'Try another source, rating or search word.'
        : 'Notes from the public gallery and ratings on shared quotations will appear here the moment someone leaves one.') +
      '</p></div>';
  }

  function renderList() {
    const host = $('feedbackList');
    if (!host) return;
    if (!state.ready || (state.loading && !state.items.length)) {
      host.innerHTML = '<div class="fb-skeleton"></div><div class="fb-skeleton"></div><div class="fb-skeleton"></div>';
    } else if (!state.items.length) {
      host.innerHTML = emptyHtml();
    } else {
      host.innerHTML = state.items.map(noteHtml).join('');
    }
    const more = $('feedbackMore');
    if (more) more.hidden = !state.hasMore;
  }

  function renderSide() {
    const s = state.stats;
    const avgChip = $('fbAvgChip');
    if (avgChip) avgChip.textContent = s && s.avgRating != null ? s.avgRating + ' / 5' : 'no ratings';

    const ratings = $('feedbackRatings');
    if (ratings) {
      const buckets = (s && s.buckets) || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
      const max = Math.max(1, ...[5, 4, 3, 2, 1].map((n) => Number(buckets[n]) || 0));
      ratings.innerHTML = [5, 4, 3, 2, 1].map((n) => {
        const count = Number(buckets[n]) || 0;
        return '<div class="fb-rrow"><span>' + n + ' ★</span>' +
          '<span class="fb-rbar"><i style="width:' + Math.round((count / max) * 100) + '%"></i></span>' +
          '<b>' + count + '</b></div>';
      }).join('');
    }

    const likes = $('feedbackLikes');
    const total = $('fbLikesTotal');
    const top = (s && s.likes && s.likes.top) || [];
    if (total) total.textContent = (s && s.likes && s.likes.total) || 0;
    if (likes) {
      likes.innerHTML = top.length
        ? top.slice(0, 6).map((row) => {
          const max = Math.max(1, ...top.map((r) => r.count));
          return '<div class="fb-likerow"><span title="' + esc(row.name) + '">' + esc(row.name) + '</span>' +
            '<b>' + row.count + '</b>' +
            '<span class="fb-rbar"><i style="width:' + Math.round((row.count / max) * 100) + '%"></i></span></div>';
        }).join('')
        : '<p class="micro muted" style="margin:0;font-size:12px">No likes yet — share the gallery and they start here.</p>';
    }

    const countAll = $('fbCountAll');
    const countProject = $('fbCountProject');
    const countQuotation = $('fbCountQuotation');
    const sources = (s && s.sources) || { project: { count: 0 }, quotation: { count: 0 } };
    if (countAll) countAll.textContent = (s && s.total) || 0;
    if (countProject) countProject.textContent = sources.project ? sources.project.count : 0;
    if (countQuotation) countQuotation.textContent = sources.quotation ? sources.quotation.count : 0;
  }

  function render() {
    renderStats();
    renderSide();
    renderList();
    document.querySelectorAll('#feedbackTabs .fb-tab').forEach((tab) => {
      const on = tab.getAttribute('data-source') === state.source;
      tab.classList.toggle('on', on);
      tab.setAttribute('aria-selected', String(on));
    });
  }

  /* ---------- actions ---------- */
  async function markHandled(itemId, button) {
    if (!api) return;
    const item = state.items.find((row) => row.id === itemId);
    const next = !(item && item.handledAt);
    if (button) button.disabled = true;
    try {
      await api.markFeedback(itemId, next);
      if (item) item.handledAt = next ? new Date().toISOString() : null;
      /* In the "needs a reply" view a note leaves the list the moment it is
         handled - the open queue stays a queue. In every other view it stays,
         dimmed, with an undo. */
      if (next && state.status === 'new' && state.items.length) {
        state.items = state.items.filter((row) => row.id !== itemId);
      }
      if (state.stats) {
        state.stats.fresh = Math.max(0, (Number(state.stats.fresh) || 0) + (next ? -1 : 1));
        state.stats.handled = Math.max(0, (Number(state.stats.handled) || 0) + (next ? 1 : -1));
      }
      render();
      paintBadge();
      index.loaded = false;
      loadIndex();
      if (root.QSDash && root.QSDash.toast) root.QSDash.toast(next ? 'Marked as handled.' : 'Re-opened — it is back in the inbox.');
    } catch (error) {
      if (button) button.disabled = false;
      if (root.QSDash && root.QSDash.toast) root.QSDash.toast((error && error.message) || 'Could not update that note.');
    }
  }

  async function exportCsv() {
    if (!api) return;
    try {
      const text = await api.feedbackCsv(query());
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ktm-feedback-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      if (root.QSDash && root.QSDash.toast) root.QSDash.toast('Exported the notes you can see.');
    } catch (error) {
      if (root.QSDash && root.QSDash.toast) root.QSDash.toast('Could not export just now.');
    }
  }

  function focusOn(proposalId) {
    state.focusProposal = String(proposalId || '');
    state.source = state.focusProposal ? 'quotation' : 'all';
    state.status = 'all';
    state.rating = 0;
    state.q = '';
    const search = $('feedbackSearch');
    if (search) search.value = '';
    refresh(true);
  }

  /* ---------- wiring ---------- */
  function bind() {
    const tabs = $('feedbackTabs');
    if (tabs) {
      tabs.addEventListener('click', (event) => {
        const tab = event.target.closest('.fb-tab');
        if (!tab) return;
        state.source = tab.getAttribute('data-source') || 'all';
        state.focusProposal = '';
        refresh(true);
      });
    }
    const list = $('feedbackList');
    if (list) {
      list.addEventListener('click', (event) => {
        const mark = event.target.closest('[data-mark]');
        if (mark) { markHandled(mark.getAttribute('data-mark'), mark); return; }
        const quote = event.target.closest('[data-open-quote]');
        if (quote) {
          const id = quote.getAttribute('data-open-quote');
          if (root.QSDash && root.QSDash.open) root.QSDash.open(id);
        }
      });
    }
    const more = $('feedbackMore');
    if (more) more.addEventListener('click', () => refresh(false));

    const search = $('feedbackSearch');
    let timer = 0;
    if (search) {
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.q = search.value.trim();
          refresh(true);
        }, 260);
      });
    }
    const status = $('feedbackStatus');
    if (status) status.addEventListener('change', () => { state.status = status.value; refresh(true); });
    const rating = $('feedbackRating');
    if (rating) rating.addEventListener('change', () => { state.rating = Number(rating.value) || 0; refresh(true); });
    const refreshBtn = $('feedbackRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', () => { index.loaded = false; loadIndex(); refresh(true); });
    const exportBtn = $('feedbackExport');
    if (exportBtn) exportBtn.addEventListener('click', exportCsv);

    /* A chip in the Quotations table opens this panel filtered to that row. */
    document.addEventListener('click', (event) => {
      const chip = event.target.closest('[data-qfb]');
      if (!chip) return;
      const id = chip.getAttribute('data-qfb');
      if (root.QSDash && root.QSDash.show) root.QSDash.show('feedback');
      focusOn(id);
    });
  }

  function open() {
    if (!state.ready || state.error) refresh(true);
    else { render(); paintBadge(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  root.QSFeedback = {
    open,
    refresh: () => refresh(true),
    chipFor,
    showProposal: (id) => { if (root.QSDash && root.QSDash.show) root.QSDash.show('feedback'); focusOn(id); },
    loadIndex
  };

  /* The dashboard calls this once it knows a session exists. */
  document.addEventListener('qs:session', loadIndex);
  document.addEventListener('qs:feedback-index', () => {
    if (root.QSDash && root.QSDash.refreshTable) root.QSDash.refreshTable();
  });
})(typeof self !== 'undefined' ? self : this);
