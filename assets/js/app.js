/* ==========================================================================
   Quotation Studio — Application Bootstrap
   --------------------------------------------------------------------------
   Wires the form to the render loop, autosave, preview navigation,
   page scaling, proposal import/export and the PDF button.
   Depends on: Finance, Icons, Charts, Render, Editor, Exporter, StateStore.
   ========================================================================== */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  /* ---------- autosave ---------- */
  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const res = window.StateStore.save();
      const el = $('saveIndicator');
      if (el) {
        el.textContent = res.ok ? 'Saved ✓' : 'Not saved';
        el.classList.add('on');
        setTimeout(() => el.classList.remove('on'), 1600);
      }
    }, 400);
  }

  /* ---------- preview scaling (mobile fit) ---------- */
  function fitPages() {
    const panel = document.querySelector('.preview-panel');
    if (!panel) return;
    const avail = panel.clientWidth - 32; /* padding */
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
    /* highlight the page nearest the top while scrolling */
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

    /* logo upload */
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

    /* per-page photo uploads */
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

    /* toolbar actions */
    const resetBtn = $('resetBtn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
      if (confirm('Reset this proposal to defaults? All entered values and text edits on this device will be cleared.')) {
        window.StateStore.reset();
        location.reload();
      }
    });
    const exportStateBtn = $('exportBtn');
    if (exportStateBtn) exportStateBtn.addEventListener('click', () => window.StateStore.exportFile());
    const importInput = $('importFile');
    if (importInput) importInput.addEventListener('change', async function () {
      const f = this.files[0];
      if (!f) return;
      try {
        await window.StateStore.importFile(f);
        location.reload();
      } catch (err) {
        alert('Could not read that proposal file. Please check it is a Quotation Studio .json export.');
      }
    });
    const advToggle = $('advToggle');
    if (advToggle) advToggle.addEventListener('click', () => {
      const p = $('advancedPanel');
      if (p) p.open = !p.open;
    });
  }

  /* ---------- boot ---------- */
  function boot() {
    $('propDate').value = new Date().toISOString().slice(0, 10);
    const restored = window.StateStore.restore();
    if (restored && !$('propDate').value) $('propDate').value = new Date().toISOString().slice(0, 10);
    wireForm();
    window.Editor.build();
    window.Render.renderAll();
    window.Exporter.wire();
    buildNav();
    fitPages();
    window.addEventListener('resize', fitPages);
    /* redraw charts once webfonts are ready so canvas text uses Inter/Poppins */
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => window.Render.renderAll());
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
