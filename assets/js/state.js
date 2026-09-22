/* ==========================================================================
   Quotation Studio — Form State Helpers
   --------------------------------------------------------------------------
   Low-level bridge between the DOM form and plain objects:
     - DEFAULTS mirror the input ids in quotation.html
     - collectForm()/applyForm() read/write every field
     - export/import of proposal files now goes through Proposals (model.js)

   Persistence itself lives in model.js (one proposal = one blob).
   ========================================================================== */
'use strict';

(function (root) {
  const DEFAULTS = {
    /* ---- Branding ---- */
    companyName: 'KTM Energy Experts',
    companyTagline: 'Govt. Approved Solar EPC Contractor | Est. 2015',
    companyPhone: '+91 93094 86769',
    companyEmail: 'enquiry@ktmenergyexperts.com',
    companyAddress: 'Office No. 502, Vantage Towers C, Bramhacorp, Bavdhan, Pune - 411021, Maharashtra',
    companyWebsite: 'www.ktmenergyexperts.com',
    statYears: '11+',
    statProjects: '200+',
    statCapacity: '20+ MW',
    prepName: '',
    /* ---- Customer & proposal ---- */
    customerType: 'residential',
    custName: '',
    custAddress: '',
    propDate: '',
    propRef: 'KTM/2026/Solar/013',
    propVersion: '1.0',
    validityDays: '15',
    monthlyBill: '',
    /* ---- System design ---- */
    capacity: '7',
    genFactor: '1460',
    moduleMake: 'Panasonic / Waaree / Adani or Equivalent',
    moduleWattage: '545',
    moduleTech: 'Mono PERC Half-Cut',
    moduleLengthMm: '2278',
    moduleWidthMm: '1134',
    inverterMake: 'Deye or Equivalent',
    inverterKw: '',
    mountMake: 'Hot-Dip GI / Aluminum-ARS Solartech make',
    cableMake: 'Polycab / KEI or Equivalent',
    roofType: 'RCC Terrace',
    availableArea: '',
    galleryUrl: '',
    qrDestinationType: 'gallery',
    briefingEnabled: true,
    pvsystUrl: '',
    arkaUrl: '',
    /* ---- Financial assumptions ---- */
    costPerKwp: '90000',
    corpTaxRate: '25',
    depreciationRate: '40',
    gstPercent: '8.9',
    tariff: '15',
    escalation: '6',
    degradation: '0.5',
    subsidyOverride: '',
    co2Factor: '0.79',
    treeFactor: '58.4',
    payAdvance: '50',
    payDispatch: '40',
    payCompletion: '10',
    /* ---- BOM (₹, ex-GST, all optional) ---- */
    bomModules: '',
    bomInverter: '',
    bomStructure: '',
    bomBos: '',
    bomInstall: '',
    bomLiaison: '',
    /* ---- Financing (optional — all three required to show EMI analysis) ---- */
    loanAmt: '',
    loanRate: '',
    loanYears: '',
    /* ---- Terms ---- */
    durationText: 'Typical completion within 6–8 weeks from advance payment, subject to DISCOM net-metering timelines.',
    jurisdiction: 'Pune, Maharashtra',
    surveyWindow: 'A free detailed'
  };

  function collectForm() {
    const out = {};
    document.querySelectorAll('#quoteForm [id]').forEach((el) => {
      if (el.type === 'file' || el.id === 'logoUpload') return;
      if (el.disabled) return;
      /* proposal-manager controls are workflow state, not proposal fields */
      if (el.closest('.prop-manager')) return;
      /* system-options controls store their data on the proposal blob instead */
      if (el.closest('.opt-manager')) return;
      if (!el.id) return;
      out[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }

  function applyForm(vals) {
    Object.keys(vals || {}).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!vals[id];
      else {
        // Presets/imports can contain makes outside this browser's catalog.
        // Preserve them rather than silently saving an empty select value.
        if (['moduleMake', 'moduleTech', 'inverterMake', 'mountMake', 'cableMake'].includes(id) &&
            el.tagName === 'SELECT' && vals[id] && !Array.from(el.options).some(o => o.value === String(vals[id]))) {
          el.add(new Option(String(vals[id]), String(vals[id])));
        }
        el.value = vals[id];
      }
    });
  }

  /* ---------- proposal file export / import (through Proposals) ---------- */
  function exportFile() {
    const active = root.Proposals.active();
    if (!active) return;
    const blob = Object.assign({}, active, {form: collectForm(), content: CONTENT, projectImages: PROJECT_IMAGES, options: root.__qsOptions || []});
    const payload = JSON.stringify({
      kind: 'ktm-proposal',
      v: 3,
      exportedAt: new Date().toISOString(),
      proposal: blob
    }, null, 2);
    const a = document.createElement('a');
    const name = (blob.form && blob.form.custName) || 'proposal';
    a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    a.download = 'ProposalFile_' + name.replace(/[^a-z0-9]+/gi, '_') + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  /** Import a proposal file as a NEW proposal (never overwrites history). */
  function importFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (ev) {
        try {
          const data = JSON.parse(ev.target.result);
          const p = data && (data.proposal || data);
          if (!p || (!p.form && !data.form)) throw new Error('Not a proposal file');
          const form = p.form || data.form;
          const created = root.Proposals.create(form, {
            content: p.content || data.content || null,
            projectImages: p.projectImages || data.projectImages || null,
            options: Array.isArray(p.options) ? p.options :
              (Array.isArray(data.options) ? data.options : []),
            status: 'draft'
          });
          if (p.ref || (data.form && data.form.propRef)) { /* keep ref from file */ }
          root.Proposals.setActive(created.id);
          resolve(created);
        } catch (e) { reject(e); }
      };
      reader.readAsText(file);
    });
  }

  root.StateStore = { DEFAULTS, collectForm, applyForm, exportFile, importFile };
})(typeof self !== 'undefined' ? self : this);
