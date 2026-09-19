/* ==========================================================================
   Quotation Studio — State & Persistence
   --------------------------------------------------------------------------
   Single source of truth for form defaults and saved proposals.

   - DEFAULTS map 1:1 to form input ids in quotation.html
   - autosaves the form + CONTENT + PROJECT_IMAGES to localStorage
   - export/import as a .json proposal file (share between sales reps)
   - photos are stored as dataURLs when quota allows; gracefully skipped
     otherwise so the rest of the state always persists.
   ========================================================================== */
'use strict';

(function (root) {
  const STORAGE_KEY = 'qstudio.proposal.v2';

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
    custName: 'Mr. Bhooshan Waghmare',
    custAddress: 'Moshi, Pimpri-Chinchwad, Pune',
    propDate: '',            // set to today at boot
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
    /* ---- Financial assumptions ---- */
    costPerKwp: '90000',
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
    /* ---- Terms ---- */
    durationText: 'Typical completion within 6–8 weeks from advance payment, subject to DISCOM net-metering timelines.',
    jurisdiction: 'Pune, Maharashtra',
    surveyWindow: 'A free detailed'
  };

  /* ids of file inputs and buttons never persisted */
  const SKIP_IDS = new Set(['logoUpload']);

  function collectForm() {
    const out = {};
    document.querySelectorAll('#quoteForm [id]').forEach((el) => {
      if (el.type === 'file' || SKIP_IDS.has(el.id)) return;
      if (!el.id) return;
      if (el.type === 'checkbox') out[el.id] = el.checked;
      else out[el.id] = el.value;
    });
    return out;
  }

  function applyForm(vals) {
    Object.keys(vals || {}).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!vals[id];
      else el.value = vals[id];
    });
  }

  /* ---------- persistence ---------- */
  function payload() {
    return {
      v: 2,
      savedAt: new Date().toISOString(),
      form: collectForm(),
      content: CONTENT,
      projectImages: PROJECT_IMAGES
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload()));
      return { ok: true };
    } catch (e) {
      /* most likely quota — retry without heavy image data */
      try {
        const p = payload();
        stripImages(p);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
        return { ok: true, note: 'images skipped (storage limit)' };
      } catch (e2) {
        return { ok: false };
      }
    }
  }

  function stripImages(p) {
    Object.keys(p.projectImages || {}).forEach((k) => {
      if (typeof p.projectImages[k] === 'string' && p.projectImages[k].startsWith('data:')) {
        delete p.projectImages[k];
      }
    });
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function restore() {
    const data = load();
    if (!data) return false;
    if (data.form) applyForm(data.form);
    if (data.content) {
      /* deep-restore CONTENT (saved copy fully replaces the default) */
      Object.keys(data.content).forEach((k) => { CONTENT[k] = data.content[k]; });
    }
    if (data.projectImages) {
      Object.keys(data.projectImages).forEach((k) => { PROJECT_IMAGES[k] = data.projectImages[k]; });
    }
    return true;
  }

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
  }

  /* ---------- import / export ---------- */
  function exportFile() {
    const blob = new Blob([JSON.stringify(payload(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    const name = (document.getElementById('custName') || {}).value || 'proposal';
    a.href = URL.createObjectURL(blob);
    a.download = 'ProposalFile_' + name.replace(/[^a-z0-9]+/gi, '_') + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  function importFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = function (ev) {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data || (!data.form && !data.content)) throw new Error('Not a proposal file');
          reset();
          if (data.form) applyForm(data.form);
          if (data.content) Object.keys(data.content).forEach((k) => { CONTENT[k] = data.content[k]; });
          if (data.projectImages) {
            Object.keys(data.projectImages).forEach((k) => { PROJECT_IMAGES[k] = data.projectImages[k]; });
          }
          save();
          resolve(data);
        } catch (e) { reject(e); }
      };
      reader.readAsText(file);
    });
  }

  root.StateStore = {
    DEFAULTS, STORAGE_KEY, collectForm, applyForm,
    save, load, restore, reset, exportFile, importFile
  };
})(typeof self !== 'undefined' ? self : this);
