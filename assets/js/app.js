/* ==========================================================================
   Quotation Studio — Application Bootstrap
   --------------------------------------------------------------------------
   Orchestrates: proposal store (model.js), form state (state.js), equipment
   catalog (equipment.js), rendering, autosave, preview navigation/scaling,
   proposal file import/export and the PDF button.
   ========================================================================== */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  function today() {
    const date = new Date();
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  }

  /* Pristine HTML form values = the template defaults for "New proposal".
     Captured before any saved data is applied. */
  let pristine = null;
  const templateContent = JSON.stringify(CONTENT);
  const templateProjectImages = JSON.stringify(PROJECT_IMAGES);
  let templatePageImages = {};
  function restoreObject(target, snapshot) {
    Object.keys(target).forEach(key => delete target[key]);
    Object.assign(target, JSON.parse(snapshot));
  }

  const COMPANY_KEY = 'qstudio.companyDefaults';

  /* ---------- autosave ---------- */
  let saveTimer = null;
  function showSaveState(state) {
    const el = $('saveIndicator');
    if (!el) return;
    el.dataset.state = state;
    const at = new Date();
    const time = String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0');
    el.textContent = {saving: 'Saving…', saved: 'Saved in this browser · ' + time, error: 'Not saved'}[state];
    el.title = state === 'error'
      ? 'Browser storage could not save your changes. Your work is still open here — use Save now, or Export backup before closing this tab.'
      : 'Saved in this browser only, at ' + time + '. Export a backup to keep a portable copy.';
    el.classList.add('on');
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    showSaveState('saving');
    saveTimer = setTimeout(() => { saveNow(); refreshManager(false); }, 400);
  }
  window.__qsScheduleSave = scheduleSave; /* used by the Advanced Edit panel */
  window.__qsSaveNow = saveNow;           /* used by harnesses / before navigation */

  /* ---------- system options (Good / Better / Best) ---------- */
  const OPTION_FIELDS = ['capacity', 'genFactor', 'moduleMake', 'moduleWattage', 'moduleTech',
    'inverterMake', 'inverterKw', 'costPerKwp', 'gstPercent', 'tariff', 'escalation',
    'degradation', 'subsidyOverride'];

  function optionsList() { return window.__qsOptions || (window.__qsOptions = []); }

  function persistOptions() {
    scheduleSave();
    window.Render.renderAll();
  }

  function renderOptionsUI() {
    const list = $('optList');
    if (!list) return;
    const opts = optionsList();
    if (!opts.length) {
      list.innerHTML = '<div class="hint">No saved options yet. Design a system above, then save it with a name — e.g. “Good — 5 kWp”.</div>';
      return;
    }
    list.innerHTML = opts.map((o, i) => {
      const fin = window.Finance.compute(Object.assign(
        {}, window.StateStore.collectForm(), o.fields, { options: [] }));
      const summary = o.fields.capacity + ' kWp · ' +
        (isFinite(fin.payback) ? fin.payback.toFixed(1) + ' yr payback' : 'payback —') + ' · ' +
        window.Finance.fmtINRshort(fin.netInvestment);
      return '<div class="opt-row' + (o.recommended ? ' recommended' : '') + '" data-i="' + i + '">' +
        '<div class="opt-info"><div class="opt-name">' +
        o.name.replace(/&/g, '&amp;').replace(/</g, '&lt;') +
        (o.recommended ? '<span class="opt-rec-chip">★ Recommended</span>' : '') + '</div>' +
        '<div class="opt-sum">' + summary + '</div></div>' +
        '<div class="opt-actions">' +
        '<button type="button" class="link-btn" data-act="apply" data-i="' + i + '">Apply</button>' +
        '<button type="button" class="link-btn" data-act="rec" data-i="' + i + '" title="Mark as recommended">★</button>' +
        '<button type="button" class="link-btn danger" data-act="del" data-i="' + i + '" title="Remove option">×</button>' +
        '</div></div>';
    }).join('');

    list.querySelectorAll('button[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.i, 10);
        const opts2 = optionsList();
        const act = btn.dataset.act;
        if (act === 'apply') {
          window.StateStore.applyForm(opts2[i].fields);
          Object.keys(opts2[i].fields).forEach((id) => {
            const el = document.getElementById(id);
            if (el) { el.dispatchEvent(new Event('input', { bubbles: true })); }
          });
          persistOptions();
        } else if (act === 'rec') {
          const wasRec = opts2[i].recommended;
          opts2.forEach((o) => { o.recommended = false; });
          opts2[i].recommended = !wasRec;
          persistOptions();
          renderOptionsUI();
        } else if (act === 'del') {
          opts2.splice(i, 1);
          persistOptions();
          renderOptionsUI();
        }
      });
    });
  }

  function captureOption() {
    const s = window.StateStore.collectForm();
    const fields = {};
    OPTION_FIELDS.forEach((k) => { fields[k] = s[k]; });
    return fields;
  }

  function wireOptions() {
    const save = $('optSave');
    if (!save) return;
    save.addEventListener('click', () => {
      const nameEl = $('optName');
      let name = (nameEl.value || '').trim();
      if (!name) {
        const cap = window.StateStore.collectForm().capacity;
        name = 'Option ' + (optionsList().length + 1) + ' — ' + cap + ' kWp';
      }
      optionsList().push({ id: 'o_' + Date.now().toString(36), name, fields: captureOption(), recommended: false });
      nameEl.value = '';
      persistOptions();
      renderOptionsUI();
    });
  }

  /* ---------- WhatsApp share ---------- */
  function wireShare() {
    const btn = $('waShare');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const s = window.StateStore.collectForm();
      const link = (s.shareUrl || '').trim();
      let msg = 'Hello ' + (s.custName || '').trim() + ',\n' +
        'Here is your personalised rooftop solar proposal from ' + s.companyName + ' (' +
        s.capacity + ' kWp).\n' +
        (link ? '\nExplore it here: ' + link + '\n' : '') +
        '\n— ' + s.companyName + ' | ' + s.companyPhone;
      const url = 'https://wa.me/?text=' + encodeURIComponent(msg);
      window.open(url, '_blank');
    });
    /* read-only customer view for THIS proposal (same renderers as the PDF) */
    const cv = $('custViewBtn');
    if (cv) {
      cv.addEventListener('click', () => {
        if (window.__qsSaveNow && !window.__qsSaveNow()) return;
        const id = window.Proposals.activeId();
        if (id) window.open('share.html?p=' + encodeURIComponent(id), '_blank');
      });
    }
    document.querySelectorAll('[data-engineering-open]').forEach(button => {
      button.addEventListener('click', () => {
        if (window.__qsSaveNow && !window.__qsSaveNow()) return;
        const id = window.Proposals.activeId();
        if (id) window.open('share.html?p=' + encodeURIComponent(id) + '#shareAcceptWrap', '_blank');
      });
    });
  }

  /* ---------- proposal manager UI ---------- */
  function refreshManager(rebuildSelect) {
    const sel = $('proposalSelect');
    if (!sel) return;
    const activeId = window.Proposals.activeId();
    if (rebuildSelect !== false) {
      const items = window.Proposals.list();
      sel.innerHTML = items.map((p) => {
        const label = '#' + (p.ref || p.id.slice(-4)) + ' · ' + p.title +
          ' — ' + window.Proposals.statusLabel(p.status) + ' · v' + p.version;
        return '<option value="' + p.id + '">' +
          label.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</option>';
      }).join('');
      sel.value = activeId || '';
    }
    const blob = window.Proposals.active();
    if (!blob) return;
    const status = $('pmStatus');
    if (status && status.options.length !== window.Proposals.STATUSES.length) {
      status.innerHTML = window.Proposals.STATUSES.map((s) =>
        '<option value="' + s.id + '">' + s.label + '</option>').join('');
    }
    if (status) status.value = blob.status || 'draft';
    const upd = $('pmUpdated');
    if (upd) {
      const d = new Date(blob.updatedAt || blob.createdAt || Date.now());
      upd.value = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }
    const meta = $('pmMeta');
    if (meta) {
      const bits = [];
      if (blob.prevId) bits.push('Version of #' + ((window.Proposals.get(blob.prevId) || {}).form || {}).propRef);
      if (blob.sentAt) bits.push('Sent ' + new Date(blob.sentAt).toLocaleDateString('en-IN'));
      if (blob.acceptedAt) bits.push('Accepted ' + new Date(blob.acceptedAt).toLocaleDateString('en-IN'));
      /* Statuses are set by hand in this workspace; nothing here is verified
         customer-side activity. Say so rather than implying tracking. */
      bits.push('Statuses are set manually in this browser');
      meta.textContent = bits.join('  •  ');
    }
    /* Created → Sent → Accepted milestone strip (stamps live on the blob) */
    const tl = $('pmTimeline');
    if (tl) {
      const fmt = (iso) => {
        const d = new Date(iso || '');
        return isNaN(d) ? '' :
          d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
      };
      const steps = [
        { label: 'Created', at: blob.createdAt || blob.updatedAt },
        { label: 'Sent', at: blob.sentAt },
        { label: 'Accepted', at: blob.acceptedAt }
      ];
      const lastDone = steps.reduce((acc, st, i) => (st.at ? i : acc), -1);
      tl.innerHTML = steps.map((st, i) => {
        const state = st.at ? 'done' : (i === lastDone + 1 ? 'next' : '');
        return '<div class="pm-tl-step ' + state + '"><div class="pm-tl-dot"></div>' +
          '<div class="pm-tl-label">' + st.label + '</div>' +
          '<div class="pm-tl-date">' + (fmt(st.at) || (state === 'next' ? 'pending' : '—')) + '</div></div>';
      }).join('');
    }
  }

  function loadActiveIntoUI() {
    const blob = window.Proposals.active();
    if (!blob) return;
    /* exposed for CloudBridge after pulling a cloud proposal */
    window.StateStore.applyForm(Object.assign({}, window.StateStore.DEFAULTS, blob.form || {}));
    if (blob.form && !blob.form.propDate) $('propDate').value = today();
    window.__qsOptions = Array.isArray(blob.options) ? blob.options : [];
    // Every proposal starts from canonical defaults, never the previous user's
    // in-memory edits. Partial/legacy proposals get only their own overrides.
    restoreObject(CONTENT, templateContent);
    restoreObject(PROJECT_IMAGES, templateProjectImages);
    window.__qsPageImages = {};
    Object.entries(templatePageImages).forEach(([id, src]) => {
      const override = blob.pageImages && blob.pageImages[id];
      if (typeof override === 'string' && override) window.__qsPageImages[id] = override;
      if ($(id)) $(id).src = window.__qsPageImages[id] || src;
    });
    if (typeof window.Proposals.markAccepted === 'function') {
      window.Proposals.markAccepted(blob.id);   /* this revision is now the tab's baseline */
    }
    if (blob.content) {
      /* Merge page-level overrides onto clean template defaults. */
      const incoming = upgradeProposalContent(blob.content);
      Object.keys(incoming).forEach((k) => {
        const inc = incoming[k];
        const base = CONTENT[k];
        if (inc && base && typeof inc === 'object' && typeof base === 'object' &&
            !Array.isArray(inc) && !Array.isArray(base)) {
          CONTENT[k] = Object.assign({}, base, inc);
        } else {
          CONTENT[k] = inc;
        }
      });
    }
    if (blob.projectImages) {
      Object.keys(blob.projectImages).forEach((k) => { PROJECT_IMAGES[k] = blob.projectImages[k]; });
    }
    window.EquipmentStore.refreshSelects();
    if (!blob.form || !Object.keys(blob.form).length) window.Proposals.saveActive(window.StateStore.collectForm(), CONTENT, PROJECT_IMAGES, window.__qsOptions, window.__qsPageImages || {});
    renderOptionsUI();
    // Rebind editor closures to the newly loaded proposal's content objects.
    if ($('advContainer')?.children.length) window.Editor.build();
  }

  function switchTo(id) {
    if (!saveNow()) { $('proposalSelect').value = window.Proposals.activeId(); return; }
    window.Proposals.setActive(id);
    loadActiveIntoUI();
    window.Render.renderAll();
    refreshManager();
  }

  /* ---------- workspace position (resume on reopen) ----------
     Presentation only: which proposal, the settings mode, expanded sections and
     the reading position. Never proposal data, so a corrupt record is harmless. */
  /* The preview column scrolls on desktop; the window scrolls on mobile. */
  function previewScroller() {
    const panel = document.querySelector('.preview-panel');
    if (panel && panel.scrollHeight > panel.clientHeight + 4) return panel;
    return null;
  }
  function currentWorkspace() {
    try {
      if (!window.WorkspacePrefs) return {};
      const id = window.Proposals.activeId && window.Proposals.activeId();
      return id ? window.WorkspacePrefs.read(id) : {};
    } catch (e) { return {}; }
  }
  function saveWorkspace(patch) {
    try {
      if (!window.WorkspacePrefs) return false;
      const id = window.Proposals.activeId && window.Proposals.activeId();
      if (!id) return false;
      const form = $('quoteForm');
      const open = form
        ? [...form.querySelectorAll('details.studio-section[open]')].map((d) => d.dataset.section).filter(Boolean)
        : [];
      const pageId = window.__qsLastPageId || null;
      const pdfSel = $('pdfFormat');
      const pdfFormat = pdfSel && !pdfSel.disabled ? pdfSel.value : null;
      const panel = document.querySelector('.control-panel, aside.panel, #quotePanel');
      const preview = previewScroller();
      const next = Object.assign({
        mode: form && form.classList.contains('qs-mode-essentials') ? 'essentials' : 'all',
        open,
        pageId,
        pdfFormat,
        panelScroll: panel ? Math.round(panel.scrollTop) : null,
        pageScroll: Math.round(preview ? preview.scrollTop : window.scrollY)
      }, patch || {});
      window.WorkspacePrefs.setLast(id);
      return window.WorkspacePrefs.write(id, next);
    } catch (e) { return false; }
  }
  window.__qsSaveWorkspace = saveWorkspace;

  function restoreWorkspacePosition() {
    const prefs = currentWorkspace();
    /* Resume the chosen PDF format, but only while that report is still
       available for this proposal (the option is removed when it is not). */
    const pdfSel = $('pdfFormat');
    if (pdfSel && prefs.pdfFormat && [...pdfSel.options].some((o) => o.value === prefs.pdfFormat)) {
      pdfSel.value = prefs.pdfFormat;
      window.Exporter?.updateLabel?.();
    }
    const form = $('quoteForm');
    if (form && prefs.open && prefs.open.length) {
      form.querySelectorAll('details.studio-section').forEach((d) => {
        d.open = prefs.open.includes(d.dataset.section);
      });
    }
    const preview = previewScroller();
    if (prefs.pageId && $(prefs.pageId)) {
      const el = $(prefs.pageId);
      if (prefs.pageScroll && preview) preview.scrollTop = prefs.pageScroll;
      else if (prefs.pageScroll) window.scrollTo(0, prefs.pageScroll);
      else el.scrollIntoView({ block: 'start' });
      const chip = [...document.querySelectorAll('.nav-chip')].find((c) => c.title === (window.Render.PAGES.find((p) => p.id === prefs.pageId) || {}).title);
      if (chip) chip.classList.add('active');
    } else if (prefs.pageScroll) {
      if (preview) preview.scrollTop = prefs.pageScroll; else window.scrollTo(0, prefs.pageScroll);
    }
    const panel = document.querySelector('.control-panel, aside.panel, #quotePanel');
    if (panel && prefs.panelScroll) panel.scrollTop = prefs.panelScroll;
  }

  /* A reset bumps this token so a slow file read that started before the reset
     can never write its image back into the fresh proposal. */
  function uploadToken() { return window.__qsUploadToken || 0; }

  function saveNow() {
    clearTimeout(saveTimer);
    try {
      const blob = window.Proposals.saveActive(window.StateStore.collectForm(), CONTENT, PROJECT_IMAGES, window.__qsOptions || [], window.__qsPageImages || {});
      // The store tolerates quota errors; verify the actual saved blob before
      // claiming success in the workspace, including private image uploads.
      const saved = blob && window.Proposals.get(blob.id);
      const ok = !!saved && JSON.stringify(saved) === JSON.stringify(blob);
      showSaveState(ok ? 'saved' : 'error');
      return ok ? blob : null;
    } catch (error) { showSaveState('error'); return null; }
  }

  /* Cloud bridge hooks (Phase A) — optional; safe if platform is offline. */
  window.__qsSaveNow = saveNow;
  window.__qsLoadActive = function reloadFromActive() {
    loadActiveIntoUI();
    if (window.Render && window.Render.renderAll) window.Render.renderAll();
    if (typeof refreshManager === 'function') refreshManager();
  };

  function creationSaved(blob) {
    if (blob && window.Proposals.get(blob.id) && window.Proposals.list().some(p => p.id === blob.id)) return true;
    showSaveState('error');
    $('statusMsg').textContent = 'Could not create the proposal in browser storage. Your current proposal is still open; export a backup before freeing storage.';
    return false;
  }

  function wireManager() {
    const sel = $('proposalSelect');
    if (!sel) return;
    sel.addEventListener('change', () => { if (sel.value) switchTo(sel.value); });

    $('pmNew').addEventListener('click', () => {
      if (!saveNow()) return; /* keep unsaved edits if browser storage is full */
      const form = Object.assign({}, pristine);
      const company = window.__qsCompanyDefaults && window.__qsCompanyDefaults();
      if (company) Object.assign(form, company);   /* reusable branding for new proposals */
      form.propDate = today();
      form.propVersion = '1.0';
      /* Automatic customer-facing number, unique inside this workspace. */
      if (typeof window.Proposals.nextRef === 'function') form.propRef = window.Proposals.nextRef();
      const b = window.Proposals.create(form);
      if (!creationSaved(b)) return;
      window.Proposals.setActive(b.id);
      loadActiveIntoUI();
      window.Render.renderAll();
      refreshManager();
    });

    $('pmDup').addEventListener('click', () => {
      if (!saveNow()) return; /* duplicate exactly what is on screen */
      const b = window.Proposals.duplicate(window.Proposals.activeId());
      if (creationSaved(b)) switchTo(b.id);
    });

    $('pmVersion').addEventListener('click', () => {
      if (!saveNow()) return;
      const b = window.Proposals.saveAsVersion(window.Proposals.activeId());
      if (creationSaved(b)) switchTo(b.id);
    });

    $('pmDelete').addEventListener('click', () => {
      const blob = window.Proposals.active();
      if (!blob) return;
      const total = window.Proposals.list().length;
      if (!confirm(total > 1
        ? 'Delete this proposal? Other proposals are not affected.'
        : 'Delete this proposal? A fresh blank proposal will be created.')) return;
      window.Proposals.remove(blob.id);
      if (!window.Proposals.activeId()) {
        const b = window.Proposals.create(Object.assign({}, pristine,
          { propDate: today() }));
        window.Proposals.setActive(b.id);
      }
      loadActiveIntoUI();
      window.Render.renderAll();
      refreshManager();
    });

    $('pmStatus').addEventListener('change', function () {
      if (!saveNow()) { this.value = window.Proposals.active()?.status || 'draft'; return; }
      window.Proposals.setStatus(window.Proposals.activeId(), this.value);
      refreshManager();
      scheduleSave();
    });
  }

  /* ---------- preview scaling (mobile fit) ---------- */
  function fitPages() {
    const panel = document.querySelector('.preview-panel');
    if (!panel) return;
    const avail = panel.clientWidth - 32;
    const scale = Math.min(1, avail / 794);
    document.documentElement.style.setProperty('--page-scale', scale);
    document.querySelectorAll('.page-wrap').forEach((wrap) => {
      wrap.style.height = (1123 * scale + 8) + 'px';
    });
    window.Render?.refreshDiagramScale?.();
  }

  /* ---------- preview page navigation ---------- */
  function buildNav() {
    const nav = $('pageNav');
    if (!nav) return;
    const vis = (window.Render.lastVisible && window.Render.lastVisible.length)
      ? window.Render.lastVisible : window.Render.visiblePages(window.Render.lastState || {});
    nav.innerHTML = '';
    vis.forEach((p, i) => {
      const chipEl = document.createElement('button');
      chipEl.className = 'nav-chip';
      chipEl.type = 'button';
      chipEl.innerHTML = '<b>' + (i + 1) + '</b> ' + p.nav;
      chipEl.title = p.title;
      chipEl.addEventListener('click', () => {
        const el = $(p.id);
        window.__qsLastPageId = p.id;
        saveWorkspace();
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        nav.querySelectorAll('.nav-chip').forEach((c) => c.classList.remove('active'));
        chipEl.classList.add('active');
      });
      nav.appendChild(chipEl);
    });
    if ('IntersectionObserver' in window) {
      buildNav.io = buildNav.io || new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const idx = vis.findIndex((p) => p.id === en.target.id);
          nav.querySelectorAll('.nav-chip').forEach((c, i) => c.classList.toggle('active', i === idx));
          if (idx >= 0) window.__qsLastPageId = vis[idx].id;   /* resume hint */
        });
      }, { rootMargin: '-40% 0px -55% 0px' });
      buildNav.io.disconnect();
      window.Render.PAGES.forEach((p) => {
        const el = $(p.id);
        if (el) buildNav.io.observe(el);
      });
    }
  }

  /* ---------- form wiring ---------- */
  function wireForm() {
    const form = $('quoteForm');
    if (!form) return;
    form.addEventListener('input', (e) => {
      if (e.target && e.target.type === 'file') return;
      window.Render.renderAll();
      scheduleSave();
    });
    form.addEventListener('change', (e) => {
      if (e.target && e.target.type === 'file') return;
      window.Render.renderAll();
      scheduleSave();
    });

    document.querySelectorAll('input[data-photo]').forEach((input) => {
      input.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const owner = window.Proposals.activeId();
        const token = uploadToken();
        const reader = new FileReader();
        reader.onload = function (ev) {
          if (window.Proposals.activeId() !== owner || token !== uploadToken()) return;
          const img = $(input.dataset.photo);
          if (img) {
            img.src = ev.target.result;
            window.__qsPageImages[input.dataset.photo] = ev.target.result;
            window.Render.renderAll(); scheduleSave();
          }
        };
        reader.readAsDataURL(file);
      });
    });

    /* ----- Save now: same path as autosave, but immediate and explicit ----- */
    function saveNowFromMenu() {
      const blob = saveNow();
      if (blob) {
        $('statusMsg').textContent = 'Saved in this browser at '
          + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          + '. Export a backup for a portable copy.';
      } else {
        $('statusMsg').textContent = 'Could not save to this browser\u2019s storage. Your work is still open — use Export backup now.';
      }
      refreshManager(false);
    }
    if ($('saveNowBtn')) $('saveNowBtn').addEventListener('click', saveNowFromMenu);
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && String(event.key).toLowerCase() === 's') {
        event.preventDefault();          /* never open the browser's Save Page dialog */
        saveNowFromMenu();
      }
    });

    /* ----- Reset current proposal: complete, and only after confirmation ----- */
    function resetCurrentProposal() {
      const before = JSON.stringify({ form: window.StateStore.collectForm(),
        content: window.CONTENT, options: window.__qsOptions || [], images: window.__qsPageImages || {} });
      try {
        window.StateStore.applyForm(Object.assign({}, pristine, { propDate: today() }));
        restoreObject(CONTENT, templateContent);
        restoreObject(PROJECT_IMAGES, templateProjectImages);
        window.__qsOptions = [];
        window.__qsPendingOptionName = '';
        window.__qsUploadToken = uploadToken() + 1;   /* void in-flight uploads */
        window.__qsPageImages = {};
        document.querySelectorAll('input[data-photo]').forEach((input) => {
          const img = $(input.dataset.photo);
          if (img && templatePageImages[input.dataset.photo]) img.src = templatePageImages[input.dataset.photo];
          input.value = '';
        });
        ['importFile', 'up_cover', 'up_about', 'up_solution', 'up_projects',
         'up_epc', 'up_warranty', 'up_quality', 'up_contact', 'up_tracking'].forEach((id) => {
          const el = $(id); if (el) el.value = '';
        });
        const blob = window.Proposals.saveActive(window.StateStore.collectForm(), CONTENT,
          PROJECT_IMAGES, window.__qsOptions || [], window.__qsPageImages || {});
        if (!blob || !window.Proposals.get(blob.id)) throw new Error('storage');
        /* Status and any hand-recorded acknowledgement return to Draft. */
        if (blob && typeof window.Proposals.resetToDraft === 'function') window.Proposals.resetToDraft(blob.id);
        else if (blob && typeof window.Proposals.setStatus === 'function') window.Proposals.setStatus(blob.id, 'draft');
        /* The remembered reading position belongs to the old content. */
        if (window.WorkspacePrefs && blob) window.WorkspacePrefs.write(blob.id, { pageId: null, pageScroll: 0, panelScroll: 0 });
        window.Render.renderAll();
        refreshManager(false);
        $('statusMsg').textContent = 'This proposal was reset to the template defaults. Other proposals, earlier versions and the shared equipment library were not touched.';
      } catch (error) {
        /* Storage failed: put the working content back rather than losing it. */
        const snapshot = JSON.parse(before);
        window.StateStore.applyForm(snapshot.form);
        restoreObject(CONTENT, JSON.stringify(snapshot.content));
        window.__qsOptions = snapshot.options;
        window.__qsPageImages = snapshot.images;
        /* Put the pictures back on the pages too, not just in memory. */
        Object.entries(templatePageImages).forEach(([id, src]) => {
          const img = $(id);
          if (img) img.src = (snapshot.images && snapshot.images[id]) || src;
        });
        window.Render.renderAll();
        refreshManager(false);
        showSaveState('error');
        $('statusMsg').textContent = 'The reset could not be saved to this browser\u2019s storage, so nothing was cleared. Export a backup first.';
      }
    }
    const RESET_QUESTION = 'Reset this proposal to the template defaults?\n\n'
      + 'This clears this proposal\u2019s inputs, edited brochure text, uploaded page images, '
      + 'comparison options, battery and additional-system settings, and returns its status to Draft.\n\n'
      + 'Other proposals, earlier versions and the shared equipment library are NOT affected.';
    $('resetBtn').addEventListener('click', () => {
      if (confirm(RESET_QUESTION)) resetCurrentProposal();
    });

    /* ----- reusable company defaults (this browser only) ----- */
    const COMPANY_FIELDS = ['companyName', 'companyTagline', 'companyPhone', 'companyEmail',
      'companyAddress', 'companyWebsite', 'prepName', 'statYears', 'statProjects', 'statCapacity'];
    function savedCompanyDefaults() {
      try {
        const raw = localStorage.getItem(COMPANY_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
      } catch (e) { return null; }
    }
    if ($('companyDefaultSave')) $('companyDefaultSave').addEventListener('click', () => {
      const values = {};
      COMPANY_FIELDS.forEach((id) => { if ($(id)) values[id] = $(id).value; });
      let ok = false;
      try { localStorage.setItem(COMPANY_KEY, JSON.stringify(values)); ok = true; } catch (e) { ok = false; }
      $('companyDefaultStatus').textContent = ok
        ? 'Saved. New proposals in this browser start with these company details (this browser only — it is not shared with other devices or people).'
        : 'Could not save these defaults: browser storage is full. They are still used for this proposal.';
    });
    if ($('companyDefaultClear')) $('companyDefaultClear').addEventListener('click', () => {
      try { localStorage.removeItem(COMPANY_KEY); } catch (e) {}
      $('companyDefaultStatus').textContent = 'Saved company defaults cleared. The current proposal keeps its details.';
    });
    window.__qsCompanyDefaults = savedCompanyDefaults;
    $('exportBtn').addEventListener('click', () => {
      const saved = !!saveNow();
      window.StateStore.exportFile();   /* exports live values, so nothing is lost here */
      $('statusMsg').textContent = saved
        ? 'Backup file for this proposal downloaded. It contains what is on screen right now, including anything that failed to autosave.'
        : 'Autosave could not write to this browser, so the backup file contains what is on screen right now — keep that file.';
    });
    $('importFile').addEventListener('change', async function () {
      const input = this;
      const f = input.files[0];
      if (!f) return;
      try {
        if (!saveNow()) throw new Error('storage');
        const created = await window.StateStore.importFile(f);
        loadActiveIntoUI();
        window.Render.renderAll();
        refreshManager();
        window.__qsUploadToken = uploadToken() + 1;  /* drop stale pending uploads */
        if (typeof window.Proposals.markAccepted === 'function') window.Proposals.markAccepted(created.id);
        $('statusMsg').textContent = 'Imported "' + ((created.form && created.form.custName) || 'proposal')
          + '" as a new draft. Your previous proposal is still saved and was not changed.';
      } catch (err) {
        const message = String((err && err.message) || '');
        if (message === 'storage' || /storage/i.test(message)) {
          $('statusMsg').textContent = 'Import failed: this browser is out of storage for another proposal. Your current proposal is unchanged — free some space or export a backup first.';
        } else if (/JSON|Unexpected|proposal file|Not a proposal/i.test(message)) {
          $('statusMsg').textContent = 'That file is not a Quotation Studio backup (.json). Nothing was imported and your current proposal is unchanged.';
        } else {
          $('statusMsg').textContent = 'Import failed (' + message + '). Nothing was imported and your current proposal is unchanged.';
        }
      } finally {
        input.value = '';   /* allow choosing the same file again */
      }
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    if (window.__qsBooted) return; /* idempotent — harnesses may fire DOMContentLoaded twice */
    window.__qsBooted = true;
    templatePageImages = Object.fromEntries([...document.querySelectorAll('input[data-photo]')]
      .map(input => [input.dataset.photo, $(input.dataset.photo)?.getAttribute('src') || '']));
    window.Bess.wire();
    window.AdditionalSystems.wire();
    pristine = window.StateStore.collectForm();       /* HTML defaults */
    /* Boot-time brochure text, so 'Reset current proposal' can restore it. */

    if (!pristine.propDate) {
      $('propDate').value = today();
      pristine.propDate = $('propDate').value;
    }
    window.Proposals.init();                           /* migrate legacy, ensure active */
    /* Resume the proposal last open in this browser, when it still exists.
       A stale or unreadable preference only falls back to the first proposal -
       it never touches proposal data. */
    if (window.WorkspacePrefs) {
      try {
        const want = window.WorkspacePrefs.last();
        if (want && window.Proposals.get(want) && window.Proposals.activeId() !== want) {
          window.Proposals.setActive(want);
        }
        if (window.Proposals.activeId()) window.WorkspacePrefs.setLast(window.Proposals.activeId());
      } catch (e) {}
    }
    loadActiveIntoUI();                                /* apply saved proposal if any */
    window.EquipmentStore.wire();
    window.EquipmentStore.refreshSelects();
    window.EquipmentStore.renderManager($('eqCatalog'), () => {
      window.Render.renderAll();
      scheduleSave();
    });
    wireForm();

    wireManager();
    wireOptions();
    wireShare();
    const form = $('quoteForm');
    const MODE_KEY = 'qstudio.formMode'; /* legacy global UI preference only */
    const setMode = (mode, remember = true) => {
      if (!form) return;
      const all = mode === 'all';
      form.classList.toggle('qs-mode-essentials', !all);
      const bE = $('modeEss'), bA = $('modeAll');
      if (bE) { bE.classList.toggle('active', !all); bE.setAttribute('aria-pressed', String(!all)); }
      if (bA) { bA.classList.toggle('active', all); bA.setAttribute('aria-pressed', String(all)); }
      document.dispatchEvent(new CustomEvent('qs:mode', {detail: {all}}));
      if (remember) {
        try { localStorage.setItem(MODE_KEY, all ? 'all' : 'essentials'); } catch (e) {}
        /* The section layout is remembered per proposal (spec item 2). */
        saveWorkspace();
      }
    };
    $('modeEss') && $('modeEss').addEventListener('click', () => setMode('essentials'));
    $('modeAll') && $('modeAll').addEventListener('click', () => setMode('all'));
    let savedMode = 'essentials';
    try { savedMode = localStorage.getItem(MODE_KEY) || 'essentials'; } catch (e) {}
    {
      const wsPrefs = currentWorkspace();
      setMode(wsPrefs.mode || (savedMode === 'all' ? 'all' : 'essentials'), false);
    }

    /* 1-Click Quick Presets for Rapid Solar Quotations */
    const PRESETS = {
      '3kw': {
        capacity: '3', customerType: 'residential', costPerKwp: '62000',
        tariff: '8.5', moduleWattage: '545', moduleMake: 'Premier Energies',
        moduleTech: 'Mono PERC DCR', inverterKw: '3', inverterMake: 'Growatt'
      },
      '5kw': {
        capacity: '5', customerType: 'residential', costPerKwp: '58000',
        tariff: '9.2', moduleWattage: '550', moduleMake: 'Waaree Energies',
        moduleTech: 'Bifacial TopCon', inverterKw: '5', inverterMake: 'Deye'
      },
      '25kw': {
        capacity: '25', customerType: 'commercial', costPerKwp: '48000',
        tariff: '12.5', moduleWattage: '550', moduleMake: 'Adani Solar',
        moduleTech: 'Bifacial Mono PERC', inverterKw: '25', inverterMake: 'Sungrow'
      },
      '100kw': {
        capacity: '100', customerType: 'industrial', costPerKwp: '42000',
        tariff: '14.0', moduleWattage: '550', moduleMake: 'Goldi Solar',
        moduleTech: 'TopCon Bifacial', inverterKw: '100', inverterMake: 'Sungrow'
      }
    };
    document.querySelectorAll('.qp-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = PRESETS[btn.dataset.preset];
        if (!p) return;
        if (!confirm('Apply this indicative preset? It replaces system/pricing assumptions and clears previous BOM, financing, subsidy override and design report links. Customer details and saved options are kept. Verify equipment and prices before sending.')) return;
        const resetDesign = {
          genFactor: '1460', gstPercent: '8.9', escalation: '6', degradation: '0.5',
          subsidyOverride: '', arkaUrl: '', pvsystUrl: '',
          bomModules: '', bomInverter: '', bomStructure: '', bomBos: '', bomInstall: '', bomLiaison: '',
          loanAmt: '', loanRate: '', loanYears: '', moduleLengthMm: '', moduleWidthMm: ''
        };
        window.StateStore.applyForm(Object.assign({}, resetDesign, p));
        window.Render.renderAll();
        scheduleSave();
      });
    });

    refreshManager();
    window.Editor.build();
    window.Render.renderAll();
    window.Exporter.wire();
    buildNav();
    fitPages();
    saveNow(); /* snapshot the working state immediately — no lost first edits */
    document.addEventListener('qs:rendered', buildNav);

    /* Resume the reading position, but never yank the viewport once the user
       has started working in this tab. */
    let userTookOver = false;
    const markTookOver = () => { userTookOver = true; };
    ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach((type) =>
      document.addEventListener(type, markTookOver, { passive: true, once: true }));
    window.__qsRestoreWorkspace = () => {
      if (userTookOver) return false;
      restoreWorkspacePosition();
      return true;
    };
    setTimeout(() => { if (!userTookOver) restoreWorkspacePosition(); }, 0);

    /* Remember the section layout, the reading position, and flush any pending
       edits when the tab is hidden or closed. */
    document.addEventListener('toggle', () => { if (!userTookOver) saveWorkspace(); }, true);
    let wsTimer = null;
    const rememberPosition = () => {
      const preview = previewScroller();
      const anchor = 140;
      const pages = (window.Render.lastVisible && window.Render.lastVisible.length)
        ? window.Render.lastVisible : window.Render.PAGES;
      let current = null;
      pages.forEach((page) => {
        const el = $(page.id);
        if (el && el.getBoundingClientRect().top <= anchor) current = page.id;
      });
      if (current) window.__qsLastPageId = current;
      clearTimeout(wsTimer);
      wsTimer = setTimeout(saveWorkspace, 250);
      void preview;
    };
    /* Scroll events do not bubble, so listen in the capture phase to catch the
       preview column as well as the window on small screens. */
    document.addEventListener('scroll', rememberPosition, { capture: true, passive: true });
    window.addEventListener('scroll', rememberPosition, { passive: true });
    $('pdfFormat') && $('pdfFormat').addEventListener('change', () => saveWorkspace());
    const flushBeforeHide = () => { saveNow(); saveWorkspace(); };
    window.addEventListener('pagehide', flushBeforeHide);
    /* Another tab saved a newer revision of this proposal: keep this tab's work
       and warn, rather than overwriting what the other tab wrote. */
    window.addEventListener('qs:saveconflict', () => {
      showSaveState('error');
      $('statusMsg').textContent = 'This proposal was changed in another tab or window, so this tab stopped autosaving to avoid overwriting it. Your work is still open here: export a backup, then reload this page to take the newer version.';
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushBeforeHide();
    });

    /* presentation mode — hide the editor, refit pages to full width */
    const enterPresent = () => {
      document.body.classList.add('presenting');
      fitPages();
    };
    const exitPresent = () => {
      document.body.classList.remove('presenting');
      fitPages();
    };
    const pb = $('presentBtn');
    if (pb) pb.addEventListener('click', enterPresent);
    const pe = $('exitPresentBtn');
    if (pe) pe.addEventListener('click', exitPresent);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') exitPresent();
    });
    window.addEventListener('resize', fitPages);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => window.Render.renderAll());
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
