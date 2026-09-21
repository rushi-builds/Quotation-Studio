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

  /* Pristine HTML form values = the template defaults for "New proposal".
     Captured before any saved data is applied. */
  let pristine = null;

  /* ---------- autosave ---------- */
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const blob = window.Proposals.saveActive(
        window.StateStore.collectForm(), CONTENT, PROJECT_IMAGES, window.__qsOptions || []);
      const el = $('saveIndicator');
      if (el) {
        el.textContent = blob ? 'Saved ✓' : 'Save failed';
        el.classList.add('on');
        setTimeout(() => el.classList.remove('on'), 1600);
      }
      refreshManager(false);
    }, 400);
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
        if (window.__qsSaveNow) window.__qsSaveNow();
        const id = window.Proposals.activeId();
        if (id) window.open('share.html?p=' + encodeURIComponent(id), '_blank');
      });
    }
    document.querySelectorAll('[data-engineering-open]').forEach(button => {
      button.addEventListener('click', () => {
        if (window.__qsSaveNow) window.__qsSaveNow();
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
    window.StateStore.applyForm(Object.assign({}, window.StateStore.DEFAULTS, blob.form || {}));
    if (blob.form && !blob.form.propDate) $('propDate').value = new Date().toISOString().slice(0, 10);
    window.__qsOptions = Array.isArray(blob.options) ? blob.options : [];
    if (blob.content) {
      /* deep-merge page objects so partial overrides don't blank siblings */
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
    // Old saved proposals have no tracking-image key; do not inherit a private
    // replacement photograph from the previously open proposal.
    if (!Object.prototype.hasOwnProperty.call(blob.projectImages || {}, 'PROJ_TRACKING')) PROJECT_IMAGES.PROJ_TRACKING = TRACKING_PROJECT_IMAGE;
    if (blob.projectImages) {
      Object.keys(blob.projectImages).forEach((k) => { PROJECT_IMAGES[k] = blob.projectImages[k]; });
    }
    window.EquipmentStore.refreshSelects();
    if (!blob.form || !Object.keys(blob.form).length) window.Proposals.saveActive(window.StateStore.collectForm(), CONTENT, PROJECT_IMAGES, window.__qsOptions);
    renderOptionsUI();
    // Rebind editor closures to the newly loaded proposal's content objects.
    if ($('advContainer')?.children.length) window.Editor.build();
  }

  function switchTo(id) {
    window.Proposals.saveActive(window.StateStore.collectForm(), CONTENT, PROJECT_IMAGES);
    window.Proposals.setActive(id);
    loadActiveIntoUI();
    window.Render.renderAll();
    refreshManager();
  }

  function saveNow() {
    return window.Proposals.saveActive(
      window.StateStore.collectForm(), CONTENT, PROJECT_IMAGES);
  }

  function wireManager() {
    const sel = $('proposalSelect');
    if (!sel) return;
    sel.addEventListener('change', () => { if (sel.value) switchTo(sel.value); });

    $('pmNew').addEventListener('click', () => {
      saveNow(); /* persist the proposal we are leaving — never lose edits */
      const form = Object.assign({}, pristine);
      form.propDate = new Date().toISOString().slice(0, 10);
      form.propVersion = '1.0';
      const b = window.Proposals.create(form);
      window.Proposals.setActive(b.id);
      loadActiveIntoUI();
      window.Render.renderAll();
      refreshManager();
    });

    $('pmDup').addEventListener('click', () => {
      saveNow(); /* duplicate exactly what is on screen */
      const b = window.Proposals.duplicate(window.Proposals.activeId());
      if (b) switchTo(b.id);
    });

    $('pmVersion').addEventListener('click', () => {
      saveNow();
      const b = window.Proposals.saveAsVersion(window.Proposals.activeId());
      if (b) switchTo(b.id);
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
          { propDate: new Date().toISOString().slice(0, 10) }));
        window.Proposals.setActive(b.id);
      }
      loadActiveIntoUI();
      window.Render.renderAll();
      refreshManager();
    });

    $('pmStatus').addEventListener('change', function () {
      saveNow(); /* status change snapshots current edits too */
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
        const reader = new FileReader();
        reader.onload = function (ev) {
          const img = $(input.dataset.photo);
          if (img) { img.src = ev.target.result; scheduleSave(); }
        };
        reader.readAsDataURL(file);
      });
    });

    $('resetBtn').addEventListener('click', () => {
      if (confirm('Reset this proposal\u2019s inputs to the template defaults? Text edits and other proposals are kept.')) {
        window.StateStore.applyForm(Object.assign({}, pristine,
          { propDate: new Date().toISOString().slice(0, 10) }));
        window.Render.renderAll();
        scheduleSave();
      }
    });
    $('exportBtn').addEventListener('click', () => window.StateStore.exportFile());
    $('importFile').addEventListener('change', async function () {
      const f = this.files[0];
      if (!f) return;
      try {
        const created = await window.StateStore.importFile(f);
        loadActiveIntoUI();
        window.Render.renderAll();
        refreshManager();
        void created;
      } catch (err) {
        alert('Could not read that proposal file. Please check it is a Quotation Studio .json export.');
      }
    });
    $('advToggle').addEventListener('click', () => {
      const p = $('advancedPanel');
      if (p) p.open = !p.open;
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    if (window.__qsBooted) return; /* idempotent — harnesses may fire DOMContentLoaded twice */
    window.__qsBooted = true;
    pristine = window.StateStore.collectForm();       /* HTML defaults */
    if (!pristine.propDate) {
      $('propDate').value = new Date().toISOString().slice(0, 10);
      pristine.propDate = $('propDate').value;
    }
    window.Proposals.init();                           /* migrate legacy, ensure active */
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
    const MODE_KEY = 'qstudio.formMode'; /* UI preference only, never data */
    const setMode = (mode) => {
      if (!form) return;
      const all = mode === 'all';
      form.classList.toggle('qs-mode-essentials', !all);
      const bE = $('modeEss'), bA = $('modeAll');
      if (bE) bE.classList.toggle('active', !all);
      if (bA) bA.classList.toggle('active', all);
      try { localStorage.setItem(MODE_KEY, all ? 'all' : 'essentials'); } catch (e) {}
    };
    $('modeEss') && $('modeEss').addEventListener('click', () => setMode('essentials'));
    $('modeAll') && $('modeAll').addEventListener('click', () => setMode('all'));
    let savedMode = 'essentials';
    try { savedMode = localStorage.getItem(MODE_KEY) || 'essentials'; } catch (e) {}
    setMode(savedMode === 'all' ? 'all' : 'essentials');

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
