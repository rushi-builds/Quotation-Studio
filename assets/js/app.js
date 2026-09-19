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
        window.StateStore.collectForm(), CONTENT, PROJECT_IMAGES);
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
  }

  function loadActiveIntoUI() {
    const blob = window.Proposals.active();
    if (!blob) return;
    window.StateStore.applyForm(Object.assign({}, window.StateStore.DEFAULTS, blob.form || {}));
    if (blob.form && !blob.form.propDate) $('propDate').value = new Date().toISOString().slice(0, 10);
    if (blob.content) {
      /* deep-merge page objects so partial overrides don't blank siblings */
      Object.keys(blob.content).forEach((k) => {
        const inc = blob.content[k];
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
  }

  /* ---------- preview page navigation ---------- */
  function buildNav() {
    const nav = $('pageNav');
    if (!nav) return;
    nav.innerHTML = '';
    window.Render.PAGES.forEach((p, i) => {
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
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const idx = window.Render.PAGES.findIndex((p) => p.id === en.target.id);
          nav.querySelectorAll('.nav-chip').forEach((c, i) => c.classList.toggle('active', i === idx));
        });
      }, { rootMargin: '-40% 0px -55% 0px' });
      window.Render.PAGES.forEach((p) => { const el = $(p.id); if (el) io.observe(el); });
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

    $('logoUpload').addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        document.querySelectorAll('#formLogo, .pg-logo img, .cover-logo img').forEach((img) => {
          img.src = ev.target.result;
        });
        scheduleSave();
      };
      reader.readAsDataURL(file);
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
    refreshManager();
    window.Editor.build();
    window.Render.renderAll();
    window.Exporter.wire();
    buildNav();
    fitPages();
    saveNow(); /* snapshot the working state immediately — no lost first edits */
    window.addEventListener('resize', fitPages);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => window.Render.renderAll());
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
