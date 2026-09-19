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
  const F = window.Finance;

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

  function loadProposalIntoUI(blob) {
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

  function loadActiveIntoUI() {
    loadProposalIntoUI(window.Proposals.active());
  }

  function switchTo(id) {
    window.Proposals.saveActive(window.StateStore.collectForm(), CONTENT, PROJECT_IMAGES);
    window.Proposals.setActive(id);
    loadActiveIntoUI();
    window.Render.renderAll();
    refreshManager();
  }

  /* ---------- sharing ---------- */
  function waNumber(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.length === 10) d = '91' + d; /* Indian mobile without country code */
    return d;
  }
  function shareLink() {
    const s = window.Render.readState();
    const base = (s.shareLinkBase || '').trim();
    if (base) return base + encodeURIComponent(s.propRef || '');
    return location.origin + location.pathname + '?p=' + window.Proposals.activeId();
  }
  function shareMessage(s, f) {
    const pb = isFinite(f.payback) ? f.payback.toFixed(1) : '—';
    return 'Hello ' + (s.custName || 'there') + ',\n\n' +
      'Your personalised rooftop solar proposal from ' + s.companyName + ' is ready:\n' +
      s.capacity + ' kWp • approx ' + F.fmtINR(f.annualSaving / 12) + '/month savings • payback ~' + pb + ' years\n\n' +
      'Explore it here: ' + shareLink() + '\n\n' +
      'Happy to walk you through it anytime.\n— ' + (s.prepName || s.companyName);
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
  let navIO = null;
  function buildNav() {
    const nav = $('pageNav');
    if (!nav) return;
    const pages = window.Render.visiblePages();
    nav.innerHTML = '';
    pages.forEach((p, i) => {
      const chipEl = document.createElement('button');
      chipEl.className = 'nav-chip';
      chipEl.type = 'button';
      chipEl.dataset.page = p.id;
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
    if (navIO) navIO.disconnect();
    if ('IntersectionObserver' in window) {
      navIO = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          nav.querySelectorAll('.nav-chip').forEach((c) => {
            c.classList.toggle('active', c.dataset.page === en.target.id);
          });
        });
      }, { rootMargin: '-40% 0px -55% 0px' });
      pages.forEach((p) => { const el = $(p.id); if (el) navIO.observe(el); });
    }
  }
  /* rebuild the nav only when the set of visible pages changes */
  function syncNav() {
    const nav = $('pageNav');
    if (!nav) return;
    const want = window.Render.visiblePages().length;
    if (nav.children.length !== want) buildNav();
  }
  document.addEventListener('qs:rendered', syncNav);

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

    /* WhatsApp share */
    $('waBtn').addEventListener('click', () => {
      const s = window.Render.readState();
      const f = window.Finance.compute(s);
      const num = waNumber(s.companyPhone);
      if (!num) { alert('Add a phone number in Company Branding first.'); return; }
      window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(shareMessage(s, f)), '_blank', 'noopener');
    });

    /* Copy share link */
    $('copyLinkBtn').addEventListener('click', () => {
      const link = shareLink();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(() => {
          const el = $('copyLinkBtn');
          const old = el.textContent;
          el.textContent = 'Copied ✓';
          setTimeout(() => { el.textContent = old; }, 1500);
        }).catch(() => { prompt('Copy this proposal link:', link); });
      } else {
        prompt('Copy this proposal link:', link);
      }
    });
  }

  /* ---------- customer share mode (?p=<id>) ---------- */
  function wireCustomerBar(blob) {
    const s = Object.assign({}, window.StateStore.DEFAULTS, blob.form || {});
    const f = window.Finance.compute(s);
    $('ctCompany').textContent = s.companyName;
    $('ctFor').textContent = 'Prepared for ' + (s.custName || 'you') +
      (s.capacity ? '  •  ' + s.capacity + ' kWp' : '');
    $('ctCall').href = 'tel:' + String(s.companyPhone || '').replace(/\s/g, '');
    $('ctWa').href = 'https://wa.me/' + waNumber(s.companyPhone) + '?text=' +
      encodeURIComponent('Hello, I would like to discuss the solar proposal you shared.');
    $('ctPdf').addEventListener('click', () => {
      const st = $('ctStatus');
      window.Exporter.exportPdf((m) => { if (st) st.textContent = m; });
    });
    document.title = 'Solar Proposal — ' + (s.custName || '') + ' (' + s.capacity + ' kWp)';
  }

  /* ---------- boot ---------- */
  function boot() {
    pristine = window.StateStore.collectForm();       /* HTML defaults */
    if (!pristine.propDate) {
      $('propDate').value = new Date().toISOString().slice(0, 10);
      pristine.propDate = $('propDate').value;
    }
    window.Proposals.init();                           /* migrate legacy, ensure active */
    const shareId = new URLSearchParams(location.search).get('p');
    const sharedBlob = shareId ? window.Proposals.get(shareId) : null;
    if (sharedBlob) {
      /* Customer share view: render the requested proposal read-only and
         never touch the sales rep's active pointer or autosave. */
      document.body.classList.add('customer-mode');
      loadProposalIntoUI(sharedBlob);
      wireCustomerBar(sharedBlob);
    } else {
      loadActiveIntoUI();                              /* apply saved proposal if any */
    }
    window.EquipmentStore.wire();
    window.EquipmentStore.refreshSelects();
    if (!sharedBlob) {
      window.EquipmentStore.renderManager($('eqCatalog'), () => {
        window.Render.renderAll();
        scheduleSave();
      });
      wireForm();
      wireManager();
      refreshManager();
      window.Editor.build();
    }
    window.Render.renderAll();
    window.Exporter.wire();
    buildNav();
    fitPages();
    if (!sharedBlob) saveNow(); /* snapshot immediately — no lost first edits */
    window.addEventListener('resize', fitPages);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => window.Render.renderAll());
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
