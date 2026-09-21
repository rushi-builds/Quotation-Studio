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
      const incoming = upgradeProposalContent(blob.content);
      Object.keys(incoming).forEach((k) => {
        const inc = incoming[k];
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

    /* One engineering hub after review. URL presence means a link was supplied,
       not that a report has been verified. Requests never change order status. */
    const simBar = $('shareSimBar');
    const simActions = $('shareSimActions');
    const phone = whatsappPhone(f.companyPhone);
    const whatsapp = (text) => phone ? 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text) : '';
    const reports = [
      { key: 'arka', field: 'arkaUrl', label: 'Arka 3D layout', choice: 'requestArka', wrapper: 'requestArkaLabel' },
      { key: 'pvsyst', field: 'pvsystUrl', label: 'PVsyst simulation report', choice: 'requestPvsyst', wrapper: 'requestPvsystLabel' }
    ];
    simActions.replaceChildren();
    reports.forEach(report => {
      const href = window.Render.safeHttpUrl(f[report.field]);
      report.available = !!href;
      $(report.wrapper).hidden = !!href;
      $(report.choice).disabled = !!href;
      if (href) {
        const link = document.createElement('a');
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'btn-sim-action';
        link.textContent = 'Open ' + report.label;
        simActions.appendChild(link);
      }
    });
    const available = reports.filter(report => report.available).length;
    $('engineeringAvailability').textContent = available
      ? available + ' report link' + (available === 1 ? '' : 's') + ' provided. Any missing deliverable can be requested below.'
      : 'No site-specific report links have been provided yet. Detailed layouts and simulations follow verified site inputs and an agreed engineering scope.';
    simBar.style.display = 'block';

    const requestForm = $('engineeringRequestForm');
    const stage = $('requestStage');
    const locationInput = $('requestLocation');
    const timingInput = $('requestWindow');
    const prepare = $('prepareRequest');
    const requestError = $('requestError');
    const preview = $('requestPreview');
    const deliveryNote = $('requestDeliveryNote');
    locationInput.value = String(f.custAddress || '').slice(0, 240);
    if (blob.status === 'accepted') stage.value = 'ready';
    const interested = () => ['interested', 'ready'].includes(stage.value);
    const invalidateRequest = () => {
      preview.hidden = true;
      $('requestMessage').value = '';
      $('requestWhatsApp').removeAttribute('href');
      requestError.textContent = '';
      prepare.disabled = !interested();
      $('requestGate').textContent = interested()
        ? 'Preparing a request is free of commitment. Engineering scope, any fees and dates are agreed with the team first.'
        : 'Select an interested/ready stage when you have reviewed the proposal and want to discuss next steps.';
    };
    requestForm.addEventListener('input', invalidateRequest);
    requestForm.addEventListener('change', invalidateRequest);
    invalidateRequest();
    requestForm.addEventListener('submit', (event) => {
      event.preventDefault();
      invalidateRequest();
      if (!interested()) { requestError.textContent = 'Review the proposal and confirm your interest first.'; return; }
      const location = locationInput.value.trim();
      const timing = timingInput.value.trim();
      if (!location || location.length > 240 || timing.length > 120) {
        requestError.textContent = 'Enter a site address/locality (up to 240 characters) and a short preferred window.';
        return;
      }
      const services = [];
      if ($('requestSurvey').checked) services.push('Site survey / feasibility discussion');
      reports.forEach(report => { if (!report.available && $(report.choice).checked) services.push(report.label); });
      if (!services.length) { requestError.textContent = 'Select at least one engineering service.'; return; }
      const latest = window.Proposals.get(blob.id);
      if (!latest || latest.updatedAt !== blob.updatedAt) {
        requestError.textContent = 'This proposal changed. Reload and review it before preparing a request.';
        return;
      }
      const message = [
        'ENGINEERING REVIEW REQUEST — not an installation order',
        'Hello ' + (f.companyName || 'KTM Energy Experts') + ',',
        'I have reviewed proposal ' + (f.propRef || '—') + ' v' + (f.propVersion || '1.0') +
          ' prepared for ' + (f.custName || 'the customer') + ' (' + (f.capacity || '—') + ' kWp).',
        'Interest: ' + (stage.value === 'ready' ? 'Ready to discuss the final scope' : 'Interested — please discuss the site'),
        'Requested: ' + services.join('; '),
        'Site: ' + location,
        timing ? 'Preferred timing (not confirmed): ' + timing : 'Timing: please coordinate with me',
        expired() ? 'Please refresh the expired/archived quotation before proceeding with engineering.' : '',
        'I can provide the electricity bill, roof photos/dimensions and site access details.',
        'Please confirm site feasibility, required inputs, engineering scope, any fees and the delivery timeline before proceeding.'
      ].filter(Boolean).join('\n');
      $('requestMessage').value = message;
      const wa = whatsapp(message);
      const link = $('requestWhatsApp');
      link.hidden = !wa;
      if (wa) link.href = wa;
      deliveryNote.textContent = wa
        ? 'Prepared only—not sent or booked. Open WhatsApp, attach the site documents and send the message. The team confirms the next steps.'
        : 'No valid WhatsApp number is configured. Copy this message and contact the proposal sender directly. Nothing has been sent.';
      preview.hidden = false;
      preview.scrollIntoView({behavior:'smooth', block:'nearest'});
    });
    $('copyRequest').addEventListener('click', async () => {
      const message = $('requestMessage').value;
      if (!message) return;
      try {
        if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(message);
        deliveryNote.textContent = 'Message copied—not sent. Paste it into your conversation with the team.';
      } catch (e) {
        $('requestMessage').focus();
        $('requestMessage').select();
        deliveryNote.textContent = 'Automatic copy is unavailable. The message is selected; use Copy on your device. Nothing has been sent.';
      }
    });

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
        Object.assign(blob, saved);
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
