/* ==========================================================================
   Quotation Studio — PDF Export & Print
   --------------------------------------------------------------------------
   Rasterises each A4 page with html2canvas at 2× and assembles a PDF via
   jsPDF. Fully client-side. Filename carries customer + capacity + ref.
   Also wires the browser-print path (@media print handles layout).
   ========================================================================== */
'use strict';

(function (root) {
  const $ = (id) => document.getElementById(id);

  async function exportPdf(statusCb) {
    const set = (m) => { if (statusCb) statusCb(m); };
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) { /* noop */ }
    }
    const { jsPDF } = root.jspdf;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    /* only pages visible for the current state (conditional pages may drop out) */
    const pages = (root.Render.lastVisible && root.Render.lastVisible.length)
      ? root.Render.lastVisible : root.Render.PAGES;
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < pages.length; i++) {
      set('Rendering page ' + (i + 1) + ' of ' + pages.length + '…');
      const el = $(pages[i].id);
      /* render at full quality even if the preview is scaled down */
      const wasTransform = el.style.transform;
      el.style.transform = 'none';
      let canvas;
      try {
        canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false,
          onclone: (doc) => doc.body.classList.add('qs-pdf-capture') });
      } finally {
        el.style.transform = wasTransform || '';
      }
      const img = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, 0, pageW, pageH, undefined, 'FAST');
    }
    const s = (root.Render.lastState && root.Render.lastState.custName !== undefined)
      ? root.Render.lastState : root.Render.readState();
    const cust = (s.custName || 'Customer').replace(/[^a-z0-9]+/gi, '_');
    const ref = (s.propRef || '').replace(/[^a-z0-9]+/gi, '-');
    pdf.setProperties({
      title: 'Solar Proposal — ' + s.custName + ' (' + s.capacity + ' kWp)',
      subject: 'Rooftop solar EPC proposal ' + ref + ' v' + s.propVersion,
      author: s.companyName,
      creator: s.companyName + ' — Quotation Studio'
    });
    pdf.save('Proposal_' + cust + '_' + s.capacity + 'kWp_' + ref + '.pdf');
    set('Downloaded ✓ (' + pages.length + ' pages)');
  }

  function wire() {
    const btn = $('downloadBtn');
    const status = $('statusMsg');
    if (btn) {
      btn.addEventListener('click', async function () {
        btn.disabled = true;
        btn.classList.add('busy');
        try {
          await exportPdf((m) => { status.textContent = m; });
        } catch (err) {
          console.error(err);
          status.textContent = 'Something went wrong while generating the PDF — please try again.';
        } finally {
          btn.disabled = false;
          btn.classList.remove('busy');
          setTimeout(() => { status.textContent = ''; }, 5000);
        }
      });
    }
    /* page-count aware button label */
    const lbl = $('downloadLabel');
    const count = root.Render.lastVisible && root.Render.lastVisible.length ? root.Render.lastVisible.length : root.Render.PAGES.length;
    if (lbl) lbl.textContent = 'Generate & Download PDF (' + count + ' Pages)';
  }

  root.Exporter = { exportPdf, wire };
})(typeof self !== 'undefined' ? self : this);
