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

  function param(name) { return new URLSearchParams(location.search).get(name); }

  function safeReportUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch (e) { return ''; }
  }

  function whatsappPhone(value) {
    const raw = String(value || '').trim();
    if (!/^\+?[\d\s()-]+$/.test(raw)) return '';
    let digits = raw.replace(/\D/g, '');
    if (/^[6-9]\d{9}$/.test(digits)) digits = '91' + digits;
    return /^[1-9]\d{10,14}$/.test(digits) ? digits : '';
  }

  function injectPages() {
    return fetch('quotation.html', { credentials: 'same-origin' })
      .then((r) => { if (r.ok === false) throw new Error('Proposal markup request failed'); return r.text(); })
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
      $('shareSub').textContent = 'This viewer reads proposals saved in this browser only. A link alone does not transfer proposal data to another device. Ask the sender for the PDF or import the proposal file in the builder.';
      $('sharePrint').disabled = true;
      $('shareAcceptWrap').style.display = 'none';
      $('shareSimBar').style.display = 'none';
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
    $('shareFooter').textContent = [f.companyName, f.companyPhone, f.companyEmail, f.companyWebsite].filter(Boolean).join(' • ');

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

    /* Never interpolate proposal URLs into HTML. Imported proposal files are
       untrusted input; only absolute HTTP(S) links can become actions. */
    const simBar = $('shareSimBar');
    const simActions = $('shareSimActions');
    const phone = whatsappPhone(f.companyPhone);
    const whatsapp = (text) => phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text) : '';
    const request = (what) => whatsapp('Hi ' + (f.companyName || 'KTM') + ', I am reviewing proposal #' +
      (f.propRef || '') + ' for ' + (f.custName || 'my site') + '. Please share ' + what + '.');
    if (simBar && simActions) {
      simActions.replaceChildren();
      const missing = [];
      const addLink = (href, label, requestLink) => {
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'btn-sim-action' + (requestLink ? ' btn-sim-req' : '');
        link.textContent = label;
        simActions.appendChild(link);
      };
      [['arkaUrl', 'Arka-360 3D layout', 'Open Arka-360 3D layout'],
        ['pvsystUrl', 'PVsyst report', 'View PVsyst report']].forEach(([key, label, action]) => {
        const href = safeReportUrl(f[key]);
        if (href) addLink(href, action, false);
        else missing.push(label);
      });
      if (missing.length) {
        const label = missing.join(' & ');
        const href = request(label);
        if (href) addLink(href, 'Request ' + label + ' on WhatsApp', true);
        else {
          const note = document.createElement('span');
          note.textContent = 'To request ' + label + ', ask the proposal sender to add a valid WhatsApp contact number.';
          simActions.appendChild(note);
        }
      }
      simBar.style.display = 'flex';
    }

    /* Local typed acknowledgement, NOT a server-verified e-signature.
       Sending the WhatsApp message remains an explicit customer action. */
    const sacForm = $('sacForm');
    const sacSuccess = $('sacSuccess');
    const sacAcceptBtn = $('sacAcceptBtn');
    const error = $('sacError');
    const setAcceptedUI = (accepted) => {
      if (sacForm) sacForm.style.display = 'none';
      if (sacSuccess) {
        sacSuccess.style.display = 'block';
        $('sacSuccessMsg').textContent = 'Acceptance saved on this device' +
          (accepted.signerName ? ' by ' + accepted.signerName : '') + '. Reference #' + (f.propRef || '') +
          '. Send the WhatsApp message below to notify the team; there is no automatic server notification.';
        const wa = whatsapp('Hi ' + (f.companyName || 'KTM') + ', I, ' + (accepted.signerName || f.custName || 'the customer') +
          ', acknowledge Proposal #' + (f.propRef || '') + ' v' + (f.propVersion || '1.0') +
          ' for ' + (f.custName || '') + ' (' + (f.capacity || '') + ' kWp). Please confirm pricing and the next steps.');
        const notify = $('sacWaNotify');
        notify.hidden = !wa;
        if (wa) notify.href = wa;
        else $('sacSuccessMsg').textContent += ' No valid WhatsApp contact is configured; contact the sender directly.';
      }
    };
    const expired = () => {
      const until = window.Finance.addDays(f.propDate, Number(f.validityDays) || 15);
      return blob.status === 'expired' || blob.status === 'archived' ||
        (until && Date.now() > new Date(until + 'T23:59:59').getTime());
    };
    if (blob.status === 'accepted') {
      setAcceptedUI(blob);
    } else if (expired()) {
      sacAcceptBtn.disabled = true;
      error.textContent = 'This proposal is expired or archived. Please request an updated proposal.';
    } else if (sacAcceptBtn) {
      sacAcceptBtn.addEventListener('click', () => {
        error.textContent = '';
        const name = $('sacSignerName').value.trim();
        const role = $('sacSignerRole').value.trim();
        if (!name || !$('sacConsent').checked) {
          error.textContent = 'Enter your full name and confirm that you reviewed the proposal.';
          return;
        }
        if (expired()) { error.textContent = 'This proposal has expired. Please request an updated proposal.'; return; }
        const latest = window.Proposals.get(blob.id);
        if (!latest || latest.updatedAt !== blob.updatedAt) {
          error.textContent = 'This proposal has changed. Reload and review the latest version before accepting.';
          return;
        }
        const accepted = Object.assign({}, latest, {
          status: 'accepted', acceptedAt: new Date().toISOString(),
          signerName: name + (role ? ' (' + role + ')' : ''),
          acceptanceMethod: 'local-typed-acknowledgement', consentConfirmed: true
        });
        window.Proposals.put(accepted);
        const saved = window.Proposals.get(blob.id);
        if (!saved || saved.acceptedAt !== accepted.acceptedAt || saved.signerName !== accepted.signerName) {
          error.textContent = 'Could not save acceptance on this device. Check browser storage and try again.';
          return;
        }
        $('shareStatus').textContent = window.Proposals.statusLabel('accepted');
        setAcceptedUI(saved);
      });
    }

    injectPages()
      .then(() => {
        const state = Object.assign({}, window.StateStore.DEFAULTS, blob.form || {},
          { options: Array.isArray(blob.options) ? blob.options : [] });
        window.Render.renderAll(state);
        fitPages();
        $('shareAcceptWrap').style.display = '';
        $('sharePrint').disabled = false;
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
        $('shareAcceptWrap').style.display = 'none';
        $('sharePrint').disabled = true;
        $('shareSub').textContent = 'Could not load the proposal view — please serve this folder over HTTP.';
      });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
