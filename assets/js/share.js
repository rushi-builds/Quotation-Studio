/* ==========================================================================
   Quotation Studio — Customer Share View
   --------------------------------------------------------------------------
   Read-only render of one proposal for the customer:
       share.html?p=<proposalId>
   Uses the SAME renderers and finance engine as the builder — the customer
   sees exactly what the PDF contains, from the same data. No form, no editor.

   Works when served over HTTP (hosted statically, or the future platform).
   ========================================================================== */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  function param(name) {
    const m = new RegExp('[?&]' + name + '=([^&]+)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function injectPages() {
    return fetch('quotation.html', { credentials: 'same-origin' })
      .then((r) => r.text())
      .then((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const main = doc.querySelector('.preview-panel');
        if (!main) throw new Error('preview markup not found');
        /* drop the builder-only toolbar; keep the page navigator for jumping */
        const toolbar = main.querySelector('.preview-toolbar');
        if (toolbar) toolbar.removeAttribute('class'); /* keep element, plain styling */
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
  }

  function boot() {
    const id = param('p');
    const blob = id ? window.Proposals.get(id) : null;
    if (!blob) {
      $('shareCustomer').textContent = 'Proposal not found';
      $('shareSub').textContent = 'This link does not match a proposal stored on this device.';
      injectPages().then(() => {
        document.querySelectorAll('.page-wrap').forEach((w) => { w.style.display = 'none'; });
      }).catch(() => {});
      return;
    }

    /* company branding + OG tags dynamic */
    const f = blob.form || {};
    if (f.companyName) {
      $('shareTitle').textContent = f.companyName + ' — Solar Proposal';
      document.title = 'Solar Proposal — ' + (f.custName || 'Customer') + ' (' + f.capacity + ' kWp)';
    }
    try {
      const setMeta = (prop, content) => {
        let el = document.querySelector('meta[property=\"' + prop + '\"]');
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute('property', prop);
          document.head.appendChild(el);
        }
        el.setAttribute('content', content);
      };
      const ogTitle = (f.custName ? f.custName + ' — ' : '') + (f.capacity || '') + ' kWp Solar Proposal — ' + (f.companyName || 'KTM');
      const ogDesc = 'Personalised ' + (f.capacity || '') + ' kWp rooftop solar proposal for ' + (f.custName || 'customer') + ' — generation, savings, investment and EMI analysis by ' + (f.companyName || 'KTM Energy Experts');
      setMeta('og:title', ogTitle);
      setMeta('og:description', ogDesc);
      const twTitle = document.querySelector('meta[name=\"twitter:title\"]');
      if (twTitle) twTitle.setAttribute('content', ogTitle);
      const twDesc = document.querySelector('meta[name=\"twitter:description\"]');
      if (twDesc) twDesc.setAttribute('content', ogDesc);
    } catch (e) { /* noop */ }
    $('shareSub').textContent = 'Ref ' + (f.propRef || '') + ' · v' + (f.propVersion || '1.0') +
      ' · ' + (window.Finance.fmtDate(f.propDate) || '');
    $('shareStatus').textContent = window.Proposals.statusLabel(blob.status);
    $('shareCustomer').textContent = f.custName || '—';
    $('shareCapacity').textContent = (f.capacity || '—') + ' kWp rooftop solar system' +
      (f.custAddress ? ' · ' + f.custAddress : '');
    $('shareFooter').innerHTML =
      (f.companyName || '') + ' &nbsp;•&nbsp; ' + (f.companyPhone || '') +
      ' &nbsp;•&nbsp; ' + (f.companyEmail || '') + ' &nbsp;•&nbsp; ' + (f.companyWebsite || '');

    /* apply proposal-specific content + photos */
    if (blob.content) {
      Object.keys(blob.content).forEach((k) => {
        const inc = blob.content[k];
        const base = typeof CONTENT !== 'undefined' ? CONTENT[k] : undefined;
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

    injectPages()
      .then(() => {
        const state = Object.assign({}, window.StateStore.DEFAULTS, blob.form || {},
          { options: Array.isArray(blob.options) ? blob.options : [] });
        window.Render.renderAll(state);
        fitPages();
        window.addEventListener('resize', fitPages);
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(() => window.Render.renderAll(state));
        }
        const btn = $('sharePrint');
        if (btn) {
          btn.addEventListener('click', async function () {
            btn.disabled = true;
            const old = btn.textContent;
            try {
              await window.Exporter.exportPdf((m) => { btn.textContent = m; });
            } catch (e) {
              console.error(e);
              btn.textContent = 'Export failed';
            } finally {
              btn.disabled = false;
              setTimeout(() => { btn.textContent = old; }, 3000);
            }
          });
        }
      })
      .catch((e) => {
        console.error(e);
        $('shareSub').textContent = 'Could not load the proposal view — please serve this folder over HTTP.';
      });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
