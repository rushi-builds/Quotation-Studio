/* ==========================================================================
   Quotation Studio — Secure customer portal (Phase B)
   --------------------------------------------------------------------------
   Loads a frozen published snapshot via /api/portal/proposal?t=<token>.
   No staff session cookies are required. control-panel / editor are not loaded.
   ========================================================================== */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  function param(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function showGate(title, sub, isError) {
    const gate = $('portalGate');
    const main = $('portalMain');
    if (main) main.hidden = true;
    if (gate) gate.hidden = false;
    if ($('gateTitle')) $('gateTitle').textContent = title || 'Unable to open proposal';
    if ($('gateSub')) $('gateSub').textContent = sub || '';
    if (gate && gate.querySelector('.portal-gate-card')) {
      gate.querySelector('.portal-gate-card').classList.toggle('is-error', !!isError);
    }
  }

  function showMain() {
    const gate = $('portalGate');
    const main = $('portalMain');
    if (gate) gate.hidden = true;
    if (main) main.hidden = false;
  }

  function injectPages() {
    return fetch('quotation.html', { credentials: 'same-origin' })
      .then((r) => {
        if (r.ok === false) throw new Error('Proposal markup request failed');
        return r.text();
      })
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const main = doc.querySelector('.preview-panel');
        if (!main) throw new Error('Preview markup not found');
        const toolbar = main.querySelector('.preview-toolbar');
        if (toolbar) {
          toolbar.querySelectorAll(':scope > :not(.page-nav)').forEach((el) => el.remove());
          toolbar.removeAttribute('class');
        }
        main.querySelectorAll('[data-builder-only], .exit-present').forEach((el) => el.remove());
        $('sharePages').innerHTML = main.innerHTML;
      });
  }

  function fitPages() {
    const panel = document.querySelector('.share-panel');
    if (!panel) return;
    const avail = panel.clientWidth - 28;
    const scale = Math.min(1, avail / 794);
    document.documentElement.style.setProperty('--page-scale', scale);
    document.querySelectorAll('.page-wrap').forEach((wrap) => {
      wrap.style.height = (1123 * scale + 8) + 'px';
    });
    if (window.Render && window.Render.refreshDiagramScale) {
      window.Render.refreshDiagramScale();
    }
  }

  function applySnapshot(snapshot) {
    const form = snapshot.form || {};
    if (window.StateStore && window.StateStore.applyForm) {
      window.StateStore.applyForm(Object.assign({}, window.StateStore.DEFAULTS || {}, form));
    }
    if (snapshot.content && window.CONTENT) {
      try {
        const incoming = snapshot.content;
        Object.keys(incoming).forEach((k) => {
          const inc = incoming[k];
          const base = window.CONTENT[k];
          if (inc && base && typeof inc === 'object' && typeof base === 'object' &&
              !Array.isArray(inc) && !Array.isArray(base)) {
            window.CONTENT[k] = Object.assign({}, base, inc);
          } else {
            window.CONTENT[k] = inc;
          }
        });
      } catch (_) {}
    }
    if (snapshot.projectImages && window.PROJECT_IMAGES) {
      Object.keys(snapshot.projectImages).forEach((k) => {
        window.PROJECT_IMAGES[k] = snapshot.projectImages[k];
      });
    }
    if (snapshot.pageImages) {
      window.__qsPageImages = snapshot.pageImages;
      Object.keys(snapshot.pageImages).forEach((id) => {
        const el = $(id);
        if (el && snapshot.pageImages[id]) el.src = snapshot.pageImages[id];
      });
    }
    if (Array.isArray(snapshot.options)) window.__qsOptions = snapshot.options;

    if (window.Render && window.Render.renderAll) window.Render.renderAll();
    if (window.Experience && typeof window.Experience.mountShare === 'function') {
      try { window.Experience.mountShare(form); } catch (_) {}
    }
  }

  function whatsappPhone(value) {
    const raw = String(value || '').trim();
    if (!/^\+?[\d\s()-]+$/.test(raw)) return '';
    let digits = raw.replace(/\D/g, '');
    if (/^[6-9]\d{9}$/.test(digits)) digits = '91' + digits;
    return /^[1-9]\d{10,14}$/.test(digits) ? digits : '';
  }

  function wireCustomerActions(snapshot, token) {
    const form = snapshot.form || {};
    const company = form.companyName || 'our team';
    const cust = snapshot.customerName || form.custName || 'Customer';
    const cap = snapshot.capacity || form.capacity || '';

    if ($('shareCustomer')) $('shareCustomer').textContent = cust;
    if ($('shareCapacity')) {
      $('shareCapacity').textContent = cap
        ? (cap + ' kWp rooftop solar proposal')
        : 'Rooftop solar proposal';
    }
    if ($('shareTitle')) {
      $('shareTitle').textContent = (form.companyName || 'Solar Proposal');
    }
    if ($('shareSub')) {
      const ref = snapshot.ref || form.propRef || '';
      const ver = snapshot.versionLabel || form.propVersion || '';
      const bits = [];
      if (ref) bits.push(ref);
      if (ver) bits.push('Version ' + ver);
      bits.push('Published copy — changes to the draft do not affect this page');
      $('shareSub').textContent = bits.join(' · ');
    }
    document.title = 'Solar Proposal — ' + cust + (cap ? ' (' + cap + ' kWp)' : '');

    if ($('shareStatus')) {
      $('shareStatus').textContent = 'Secure customer view';
    }
    if ($('portalPrivacy')) $('portalPrivacy').hidden = false;

    const printBtn = $('sharePrint');
    if (printBtn && window.Export && typeof window.Export.downloadPdf === 'function') {
      printBtn.disabled = false;
      printBtn.addEventListener('click', () => {
        postEvent(token, 'pdf_download_requested', {
          format: ($('pdfFormat') && $('pdfFormat').value) || 'full'
        });
        try {
          window.Export.downloadPdf({
            format: ($('pdfFormat') && $('pdfFormat').value) || 'full',
            customerName: cust,
            capacity: cap,
            ref: snapshot.ref || form.propRef || ''
          });
        } catch (err) {
          if ($('shareStatus')) {
            $('shareStatus').textContent = err.message || 'PDF export failed on this device';
          }
        }
      });
    }

    const accept = $('shareAcceptWrap');
    if (accept) accept.style.display = '';
    const jump = $('requestJump');
    if (jump) {
      jump.disabled = false;
      jump.addEventListener('click', () => {
        accept && accept.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    const engForm = $('engineeringRequestForm');
    if (engForm) {
      engForm.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const phone = whatsappPhone(($('requestPhone') && $('requestPhone').value) || form.companyPhone || '');
        const stage = ($('requestStage') && $('requestStage').value) || 'reviewing';
        const loc = ($('requestLocation') && $('requestLocation').value) || '';
        const win = ($('requestWindow') && $('requestWindow').value) || '';
        const notes = ($('requestNotes') && $('requestNotes').value) || '';
        const wants = [];
        if ($('requestSurvey') && $('requestSurvey').checked) wants.push('site survey');
        if ($('requestArka') && $('requestArka').checked) wants.push('Arka 3D layout');
        if ($('requestPvsyst') && $('requestPvsyst').checked) wants.push('PVsyst report');
        postEvent(token, 'survey_requested', { stage, wants, loc: loc.slice(0, 120) });
        const lines = [
          'Hello ' + company + ',',
          '',
          'I reviewed the solar proposal' + (snapshot.ref ? ' (' + snapshot.ref + ')' : '') + '.',
          'Customer: ' + cust,
          cap ? ('Capacity: ' + cap + ' kWp') : '',
          'Stage: ' + stage,
          wants.length ? ('Requesting: ' + wants.join(', ')) : '',
          loc ? ('Site: ' + loc) : '',
          win ? ('Preferred window: ' + win) : '',
          notes ? ('Notes: ' + notes) : '',
          '',
          'Sent from the secure proposal link.'
        ].filter(Boolean).join('\n');
        const companyWa = whatsappPhone(form.companyPhone || '');
        if (!companyWa) {
          if ($('requestHint')) {
            $('requestHint').textContent = 'No company WhatsApp number is set on this proposal. Please call or email the team using the contact details on the last page.';
          }
          return;
        }
        const href = 'https://wa.me/' + companyWa + '?text=' + encodeURIComponent(lines);
        window.open(href, '_blank', 'noopener,noreferrer');
      });
    }
  }

  function postEvent(token, type, meta) {
    try {
      fetch('/api/portal/event', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, type, meta: meta || {} })
      }).catch(() => {});
    } catch (_) {}
  }

  async function boot() {
    const token = param('t');
    if (!token) {
      showGate(
        'Link required',
        'Open the secure link provided by your installer. A proposal ID alone is not enough to view this page.',
        true
      );
      return;
    }

    let data;
    try {
      const res = await fetch('/api/portal/proposal?t=' + encodeURIComponent(token), {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showGate(
          'Proposal unavailable',
          (data && data.error) || 'This link is invalid, expired, or has been revoked. Please ask the sender for a new link or the PDF copy.',
          true
        );
        return;
      }
    } catch (_) {
      showGate(
        'Connection problem',
        'Could not reach the proposal server. Check your internet connection and try again.',
        true
      );
      return;
    }

    try {
      await injectPages();
      applySnapshot(data.snapshot || {});
      wireCustomerActions(data.snapshot || {}, token);
      showMain();
      fitPages();
      window.addEventListener('resize', fitPages);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          if (window.Render && window.Render.renderAll) window.Render.renderAll();
          fitPages();
        });
      }
    } catch (err) {
      showGate(
        'Could not display proposal',
        (err && err.message) || 'Something went wrong while preparing the pages.',
        true
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
