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
    ...root.Bess.DEFAULTS,
    ...root.AdditionalSystems.DEFAULTS,
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
    /* Audio greeting honourific: auto-detect from the name (salutation.js),
       or a fixed sir / ma'am / ji / none. */
    custSalutation: 'auto',
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
    /* ---- Financial assumptions ----
       Defaults are deliberately conservative and defensible in front of a
       customer; every one of them is editable per proposal.
         tariff ₹10/unit  — blended MSEDCL LT-1 residential rate (~₹10.3/unit
                            for a ~400-unit consumer incl. duty and fixed
                            charges). ₹15 sat above even the top slab.
         escalation 4%/yr — long-run Indian tariff CAGR; 6% compounded to
                            ₹64/unit over 25 years, which invites challenge.
         co2Factor 0.71   — CEA CO2 Baseline Database v21.0, FY2024-25.
         treeFactor 22    — mature-tree absorption, 20-25 kg CO2/yr.
       Roof clearance is no longer a fixed 1.4x assumption: engineering.js
       derives it from the tilt and latitude (see the block below). */
    /* Quoted as ₹ per Wp — the rate customers and sales teams actually quote.
       The calculation engine keeps working in ₹/kWp; state.js and render.js
       convert at the boundary. */
    costPerWp: '63.63',
    corpTaxRate: '25',
    depreciationRate: '40',
    gstPercent: '8.9',
    tariff: '10',
    escalation: '4',
    degradation: '0.5',
    /* ---- Engineering design basis (engineering.js) -------------------------
       Every figure below is either a standard's own arithmetic or a site value
       the designer supplies. They print on the Tech Spec page; blanks print as
       DATA REQUIRED. Values here are the shipped assumptions, not derivations:
         tilt 15°        site figure — MNRE/UPNEDA bands 22–24° for north India
         latitude 18.52  Pune
         Vb 39 m/s       IS 875-3:2015 basic wind speed map
         terrain 3       suburban, IS 875-3 Table 2 Class A
         netUpliftCp 1.2 design assumption — confirm with the structural designer
         roofZone edge   suction is far stronger at edges and corners
         Vmax 1100 V     typical three-phase rooftop inverter DC limit
         MPPT 200–1000 V typical window; datasheet wins
         Tmin 0 °C       conventional cold cell temperature (safety side)
         Tmax cell 65 °C
         2400 Pa         IEC 61215-2 module mechanical-load rating
         60 kg/m²        MNRE/UPNEDA terrace load benchmark
       --------------------------------------------------------------------- */
    tiltDeg: '15',
    latitudeDeg: '18.52',
    shadeHalfWindowHours: '3',
    roofSetbackM: '0.6',
    windSpeed: '39',
    terrainCategory: '3',
    buildingHeightM: '10',
    windK1: '1',
    windK3: '1',
    windK4: '1',
    netUpliftCp: '1.2',
    roofZone: 'edge',
    anchorsPerModule: '4',
    moduleLoadClassPa: '2400',
    moduleVoc: '',
    moduleVmp: '',
    moduleIsc: '',
    moduleImp: '',
    moduleVocBetaPct: '-0.27',
    moduleVmpBetaPct: '-0.36',
    inverterVmaxDc: '1100',
    mpptMinV: '200',
    mpptMaxV: '1000',
    inverterMaxCurrentA: '',
    minAmbientC: '0',
    maxCellC: '65',
    dcCableLengthM: '',
    dcCableSizeMm2: '',
    acCableLengthM: '',
    acCableSizeMm2: '',
    soilResistivity: '',
    earthTargetOhm: '5',
    electrodeLengthM: '3',
    electrodeDiaM: '0.05',
    electrodeEfficiency: '0.75',
    thunderstormDays: '30',
    lpsClass: 'IV',
    buildingLengthM: '',
    buildingWidthM: '',
    moduleWeightKg: '28',
    rackKgPerM2: '2.5',
    roofLoadBenchmarkKgM2: '60',
    /* Blank means derive the roof clearance from tilt and latitude; a typed
       value is a deliberate manual override and the page says so. */
    roofClearanceFactor: '',
    subsidyOverride: '',
    co2Factor: '0.71',
    treeFactor: '22',
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
      if (el.disabled || el.hasAttribute('data-equipment-custom')) return;
      /* proposal-manager controls are workflow state, not proposal fields */
      if (el.closest('.prop-manager')) return;
      /* system-options controls store their data on the proposal blob instead */
      if (el.closest('.opt-manager')) return;
      if (!el.id || !['INPUT','SELECT','TEXTAREA'].includes(el.tagName)) return;
      out[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return out;
  }

  function applyForm(vals) {
    /* Proposals saved before the switch to ₹/Wp stored `costPerKwp`. Convert
       legacy values so a resumed quotation keeps its own price instead of
       silently falling back to the template default. */
    if (vals && vals.costPerWp === undefined && vals.costPerKwp !== undefined && vals.costPerKwp !== '') {
      vals = Object.assign({}, vals, { costPerWp: String((parseFloat(vals.costPerKwp) || 0) / 1000) });
    }
    Object.keys(vals || {}).forEach((id) => {
      const el = document.getElementById(id);
      if (!el || el.hasAttribute('data-equipment-custom')) return;
      if (typeof root.EquipmentStore?.setValue === 'function' && root.EquipmentStore.setValue(id, vals[id])) return;
      if (el.type === 'checkbox') el.checked = id==='bessEnabled' ? root.Bess.enabled({bessEnabled:vals[id]}) : ['bessInclude','bessAutoEconomics','systemEnabled','systemInclude'].includes(id) ? vals[id]===true : !!vals[id];
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
    const blob = Object.assign({}, active, {form: collectForm(), content: CONTENT, projectImages: PROJECT_IMAGES, pageImages: root.__qsPageImages || {}, options: root.__qsOptions || []});
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
            pageImages: p.pageImages || data.pageImages || null,
            options: Array.isArray(p.options) ? p.options :
              (Array.isArray(data.options) ? data.options : []),
            status: 'draft'
          });
          if (!root.Proposals.get(created.id) || !root.Proposals.list().some(item => item.id === created.id)) throw new Error('Not enough browser storage to import this proposal. Your current proposal is unchanged.');
          root.Proposals.setActive(created.id);
          resolve(created);
        } catch (e) { reject(e); }
      };
      reader.readAsText(file);
    });
  }

  root.StateStore = { DEFAULTS, collectForm, applyForm, exportFile, importFile };
})(typeof self !== 'undefined' ? self : this);
