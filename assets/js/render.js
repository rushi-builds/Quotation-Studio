/* ==========================================================================
   Quotation Studio — Page Renderers
   --------------------------------------------------------------------------
   Renders all proposal pages from (state × CONTENT × Finance). Pages are
   registered in PAGES[] — the single source of truth for page order,
   numbering, the preview navigator and the PDF export loop.

   Rules:
     - every value shown traces back to form inputs or defined calculations
     - all user text is escaped; icons come from Icons (inline SVG)
     - charts are drawn after DOM updates via drawCharts()
   ========================================================================== */
'use strict';

(function (root) {
  const $ = (id) => document.getElementById(id);
  const F = root.Finance, C = root.Charts, I = root.Icons;

  /* ------------------------------------------------------------------ */
  /* small helpers                                                       */
  /* ------------------------------------------------------------------ */
  function esc(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /** Replace {key} placeholders from a vars map; unknown keys are removed. */
  function tpl(str, vars) {
    return String(str || '').replace(/\{(\w+)\}/g, (m, k) =>
      (vars && vars[k] !== undefined && vars[k] !== null) ? String(vars[k]) : '');
  }
  function set(id, v) { const el = $(id); if (el) el.textContent = (v === undefined || v === null) ? '' : v; }
  function setHTML(id, v) { const el = $(id); if (el) el.innerHTML = (v === undefined || v === null) ? '' : v; }
  function show(id, on) { const el = $(id); if (el) el.style.display = on ? '' : 'none'; }

  const TYPE_LABEL = { residential: 'Residential', commercial: 'Commercial', industrial: 'Industrial' };

  /* Merge state + finance into the template variable pool. */
  function tplVars(s, f) {
    return {
      capacity: s.capacity, annualGen: F.fmtNum(f.annualGen) + ' kWh',
      co2Annual: f.co2Annual.toFixed(1), treesAnnual: F.fmtNum(f.treesAnnual),
      company: s.companyName, companyCaps: s.companyName.toUpperCase(),
      payback: isFinite(f.payback) ? f.payback.toFixed(1) : '—',
      moduleCount: f.moduleCount || '—', moduleWattage: f.moduleWattage || '—',
      inverterRating: f.inverterKw ? f.inverterKw + ' kW' : '—',
      tariff: s.tariff, escalation: s.escalation, degradation: s.degradation,
      genFactor: s.genFactor, validity: s.validityDays + ' days',
      duration: s.durationText, jurisdiction: s.jurisdiction,
      surveyWindow: s.surveyWindow,
      monthlySaving: F.fmtINR(f.annualSaving / 12),
      netInvestment: F.fmtINR(f.netInvestment),
      validTill: F.fmtDate(F.addDays(s.propDate, s.validityDays)) || '—',
      customerType: TYPE_LABEL[s.customerType] || 'Residential'
    };
  }

  /* ================================================================== */
  /* PAGE 1 — COVER                                                      */
  /* ================================================================== */
  function renderCover(s, f, v) {
    set('v_coverEyebrow', tpl(CONTENT.cover.eyebrowByType[s.customerType] || CONTENT.cover.eyebrowByType.residential, v));
    set('v_coverTitle1', CONTENT.cover.titleLine1);
    set('v_coverTitle2', CONTENT.cover.titleLine2);
    set('v_coverPreparedLabel', CONTENT.cover.labels.preparedFor);
    set('v_coverCustName', s.custName);
    set('v_coverCustAddress', s.custAddress);
    set('v_coverCapacityLabel', CONTENT.cover.labels.capacity);
    set('v_coverCapacity', s.capacity + ' kWp');
    set('v_coverDateLabel', CONTENT.cover.labels.date);
    set('v_coverDate', F.fmtDate(s.propDate) || '—');
    set('v_coverValidLabel', CONTENT.cover.labels.validTill);
    set('v_coverValid', v.validTill);
    set('v_coverRefLabel', CONTENT.cover.labels.reference);
    set('v_coverRef', s.propRef);
    set('v_coverVersion', 'v' + s.propVersion);
    const pb = $('v_coverPrepRow');
    if (pb) pb.style.display = s.prepName ? '' : 'none';
    set('v_coverPrepLabel', CONTENT.cover.labels.preparedBy);
    set('v_coverPrepBy', s.prepName);
    set('v_coverBadgeKwp', s.capacity + ' kWp');
    set('v_coverBadgeGen', F.fmtINRshort(f.lifetimeSaving));
    set('v_coverStatYears', s.statYears);
    set('v_coverStatProjects', s.statProjects);
    set('v_coverStatCapacity', s.statCapacity);
    set('v_coverStat4', CONTENT.cover.footerStat4);

    // Visible text overlays use the same IDs/state as the rest of the proposal.
    // Fit in artwork coordinates (not transformed preview coordinates). Reset on
    // every render so shorter edits grow back; fonts.ready triggers another render.
    const artwork = document.querySelector('.ktm-cover__artwork');
    if (artwork && artwork.clientWidth) {
      artwork.querySelectorAll('[data-cover-font]').forEach((el) => {
        let size = Number(el.dataset.coverFont) * artwork.clientWidth / 1060;
        el.style.fontSize = size + 'px';
        el.title = el.textContent;
        while (size > 4 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
          size = Math.max(4, size - 0.5);
          el.style.fontSize = size + 'px';
        }
      });
    }

    /* cover QR — generated only from a real link provided by the user */
    const qrWrap = $('coverQrWrap');
    if (qrWrap) {
      const url = (s.shareUrl || '').trim();
      if (url && /^https?:\/\//i.test(url) && root.QRCode && $('qrCover')) {
        qrWrap.style.display = '';
        try {
          root.QRCode.toCanvas($('qrCover'), url,
            { width: 92, margin: 1, color: { dark: '#1C2B3F', light: '#FFFFFF' } },
            function () { /* drawn */ });
        } catch (e) { qrWrap.style.display = 'none'; }
      } else {
        qrWrap.style.display = 'none';
      }
    }
  }

  /* ================================================================== */
  /* PAGE 2 — EXECUTIVE SUMMARY                                          */
  /* ================================================================== */
  function renderExec(s, f, v) {
    const E = CONTENT.exec;
    set('v_exEyebrow', tpl(E.eyebrow, v));
    set('v_exHeading', tpl(E.heading, v));
    set('v_exSub', tpl(E.sub, v) + (s.custName ? '' : ''));
    set('v_exCustomerLine', s.custName ? ('Prepared exclusively for ' + s.custName +
      (s.custAddress ? ' • ' + s.custAddress : '')) : '');

    set('v_exHeroNet', F.fmtINR(f.netInvestment));
    set('v_exHeroNetLabel', E.heroLabels.netInvestment);
    set('v_exHeroSave', F.fmtINR(f.annualSaving));
    set('v_exHeroSaveLabel', E.heroLabels.year1Saving);
    set('v_exHeroPayback', isFinite(f.payback) ? f.payback.toFixed(1) + ' yrs' : '—');
    set('v_exHeroPaybackLabel', E.heroLabels.payback);
    set('v_exHeroLifetime', F.fmtINRshort(f.lifetimeSaving));
    set('v_exHeroLifetimeLabel', E.heroLabels.lifetime);

    /* KPI tiles — 8 tiles; the bill-offset tile replaces the warranty tile
       only when the customer's monthly bill has been entered. */
    const k = E.kpis;
    const tiles = [
      { l: k.capacity, val: s.capacity + ' kWp', icon: 'panel' },
      { l: k.annualGen, val: F.fmtNum(f.annualGen) + ' kWh', icon: 'sun' },
      { l: k.modules, val: f.moduleCount ? f.moduleCount + ' × ' + f.moduleWattage + ' Wp' : '—', icon: 'grid2' },
      { l: k.arrayArea, val: f.arrayArea ? Math.round(f.arrayArea) + ' m²' : '—', icon: 'target' },
      { l: k.irr, val: isFinite(f.irr) ? f.irr.toFixed(1) + '%' : '—', icon: 'trend' },
      { l: k.effective, val: f.effectivePerUnit > 0 ? '₹' + f.effectivePerUnit.toFixed(2) + ' / unit' : '—', icon: 'rupee' },
      { l: k.co2, val: f.co2Annual.toFixed(1) + ' tonnes', icon: 'leaf' }
    ];
    if (f.monthlyBill > 0 && f.annualSaving > 0) {
      tiles.push({ l: k.billOffset, val: Math.min(100, Math.round(f.billOffset)) + '% of your bill', icon: 'bolt' });
    } else {
      tiles.push({ l: 'Performance Warranty', val: CONTENT.shared.warrantyLine.replace('25-Year ', ''), icon: 'shield' });
    }
    setHTML('v_exKpis', tiles.map((t) =>
      '<div class="kpi-tile">' + I.chip(t.icon, 30) +
      '<div class="kpi-l">' + esc(t.l) + '</div>' +
      '<div class="kpi-v">' + esc(t.val) + '</div></div>').join(''));

    /* investment journey strip */
    set('v_exJourneyLabel', E.journeySectionLabel);
    set('v_exKpiLabel', E.kpiSectionLabel);
    const steps = [
      { t: 'You invest', d: F.fmtINRshort(f.netInvestment) },
      { t: 'It generates', d: F.fmtNum(f.annualGen) + ' units/yr' },
      { t: 'You save', d: F.fmtINRshort(f.annualSaving) + '/yr' },
      { t: 'Payback', d: isFinite(f.payback) ? 'Year ' + f.payback.toFixed(1) : '—' },
      { t: '25-yr earnings', d: F.fmtINRshort(f.lifetimeSaving) }
    ];
    setHTML('v_exJourney', steps.map((st, i) =>
      '<div class="jstep"><div class="jstep-t">' + esc(st.t) + '</div>' +
      '<div class="jstep-d">' + esc(st.d) + '</div></div>' +
      (i < steps.length - 1 ? '<div class="jstep-arrow">' + I.get('trend', 14, '#F2811D') + '</div>' : '')
    ).join(''));
    set('v_exJourneyNote', tpl(E.journeyNote, v));

    /* what you are getting */
    set('v_exIncludedLabel', E.includedSectionLabel);
    set('v_exIncludedIntro', tpl(E.includedIntro, v));
    const items = CONTENT.pageSolution.included.map((it) => ({
      icon: it.icon || 'check', t: it.title,
      d: it.mode ? modeDesc(it.mode, s) : it.desc
    }));
    items.push({ icon: 'shield', t: '25-Year Performance Warranty', d: 'Backed by OEM warranties and our 1-year workmanship promise.' });
    items.push({ icon: 'doc', t: 'Net-Metering & Subsidy Procedure', d: 'End-to-end DISCOM application and PM Surya Ghar paperwork handled for you.' });
    setHTML('v_exIncluded', items.map((it) =>
      '<div class="inc-item">' + I.get(it.icon, 17, '#F2811D') +
      '<div><div class="inc-t">' + esc(it.t) + '</div>' +
      '<div class="inc-d">' + esc(it.d) + '</div></div></div>').join(''));

    set('v_exEffectiveHint', tpl(E.effectiveHint, { tariff: s.tariff }));
    show('v_exEffectiveHint', f.effectivePerUnit > 0);
    set('v_exTraceNote', 'Every figure on this page is computed live from the project inputs — see Generation & Savings Analysis (pages ' +
      pageNum('pageSavings') + '–' + pageNum('pageInvestment') + ') for the full workings.');
  }

  function modeDesc(mode, s) {
    const map = {
      module: s.moduleMake + ' — ' + (f_moduleLine(s)),
      inverter: s.inverterMake + '.',
      mount: s.mountMake + '.',
      cable: s.cableMake + ' cables & protection.'
    };
    return map[mode] || '';
  }
  function f_moduleLine(s) {
    return (s.moduleTech ? s.moduleTech + ' modules.' : 'modules.');
  }

  /* ================================================================== */
  /* PAGE — SYSTEM OPTIONS COMPARISON (visible when 2+ options saved)    */
  /* ================================================================== */
  const OPTION_FIELDS = ['capacity', 'genFactor', 'moduleMake', 'moduleWattage', 'moduleTech',
    'inverterMake', 'inverterKw', 'costPerKwp', 'gstPercent', 'tariff', 'escalation',
    'degradation', 'subsidyOverride'];

  function optionFinance(opt, s) {
    const merged = Object.assign({}, s, opt.fields || {});
    merged.options = []; /* no recursion inside option computations */
    return F.compute(merged);
  }

  function renderOptions(s /*, f, v */) {
    const P = CONTENT.pageOptions;
    const opts = (s.options || []).slice(0, 4);
    set('v_opEyebrow', P.eyebrow);
    set('v_opHeading', P.heading);
    set('v_opSub', P.sub);
    set('v_opPara', P.para);
    set('v_opTableLabel', P.tableLabel);
    set('v_opBoldNote', opts.length ? P.boldNote : '');
    set('v_opNote', P.note);

    const cols = opts.map((o) => ({ name: o.name, fin: optionFinance(o, s), rec: !!o.recommended }));
    let html = '<thead><tr><th class="opt-metric"></th>' + cols.map((c) =>
      '<th>' + esc(c.name) + (c.rec ? '<span class="opt-rec">' + esc(P.recommendedBadge) + '</span>' : '') + '</th>'
    ).join('') + '</tr></thead><tbody>';

    const bestIndex = (rawVals, mode) => {
      const nums = rawVals.map((x) => (isFinite(x) ? x : NaN));
      if (nums.filter((n) => !isNaN(n)).length < 2) return -1;
      let bi = -1, bv = mode === 'min' ? Infinity : -Infinity;
      nums.forEach((n, i) => {
        if (isNaN(n)) return;
        if (mode === 'min' ? n < bv : n > bv) { bv = n; bi = i; }
      });
      return bi;
    };

    const m = P.metrics;
    const rows = [
      { label: m.capacity, vals: cols.map((c) => c.fin.capacity + ' kWp') },
      { label: m.modules, vals: cols.map((c) => c.fin.moduleCount ? c.fin.moduleCount + ' × ' + c.fin.moduleWattage + ' Wp' : '—') },
      { label: m.annualGen, vals: cols.map((c) => c.fin.annualGen), fmt: (x) => F.fmtNum(x) + ' kWh', best: 'max' },
      { label: m.annualSaving, vals: cols.map((c) => c.fin.annualSaving), fmt: F.fmtINR, best: 'max' },
      { label: m.netInvestment, vals: cols.map((c) => c.fin.netInvestment), fmt: F.fmtINR, best: 'min' },
      { label: m.costPerWp, vals: cols.map((c) => c.fin.costPerWp), fmt: (x) => '₹' + (Math.round(x * 10) / 10) + ' / Wp', best: 'min' },
      { label: m.payback, vals: cols.map((c) => c.fin.payback), fmt: (x) => isFinite(x) ? x.toFixed(1) + ' yrs' : '—', best: 'min' },
      { label: m.irr, vals: cols.map((c) => c.fin.irr), fmt: (x) => isFinite(x) ? x.toFixed(1) + '%' : '—', best: 'max' },
      { label: m.lifetime, vals: cols.map((c) => c.fin.lifetimeSaving), fmt: F.fmtINR, best: 'max' },
      { label: m.co2, vals: cols.map((c) => c.fin.co2Annual), fmt: (x) => x.toFixed(1) + ' t/yr', best: 'max' }
    ];
    rows.forEach((r) => {
      const bi = r.best ? bestIndex(r.vals, r.best) : -1;
      html += '<tr><td class="opt-metric">' + esc(r.label) + '</td>' +
        r.vals.map((val, i) => {
          const text = r.fmt ? r.fmt(val) : String(val);
          return '<td' + (i === bi ? ' class="best"' : '') + '>' + esc(text) + '</td>';
        }).join('') + '</tr>';
    });
    html += '</tbody>';
    setHTML('v_opTable', html);
    /* at-a-glance chips — computed winners from the same comparison */
    const oldChips = document.getElementById('v_opChips');
    if (oldChips) oldChips.remove();
    if (opts.length >= 2) {
      const chips = document.createElement('div');
      chips.className = 'opt-chips';
      chips.id = 'v_opChips';
      const finite = (xs) => xs.map((x) => isFinite(x) ? x : NaN);
      const pick = (vals, mode) => {
        const nums = finite(vals);
        let bi = -1, bv = mode === 'min' ? Infinity : -Infinity;
        nums.forEach((n, i) => { if (!isNaN(n) && (mode === 'min' ? n < bv : n > bv)) { bv = n; bi = i; } });
        return bi;
      };
      const mk = (label, o, fin, detail) =>
        '<div class="opt-chip"><div class="oc-l">' + esc(label) + '</div>' +
        '<div class="oc-v">' + esc(o.name) + '</div>' +
        '<div class="oc-s">' + detail + '</div></div>';
      const iInv = pick(cols.map((c) => c.fin.netInvestment), 'min');
      const iPay = pick(finite(cols.map((c) => c.fin.payback)), 'min');
      const iLife = pick(cols.map((c) => c.fin.lifetimeSaving), 'max');
      chips.innerHTML =
        '<div class="oc-lead">' + esc(P.chipsLead || 'At a glance') + '</div>' +
        (iInv >= 0 ? mk(P.chips.invest, opts[iInv], cols[iInv].fin, F.fmtINR(cols[iInv].fin.netInvestment)) : '') +
        (iPay >= 0 ? mk(P.chips.payback, opts[iPay], cols[iPay].fin, cols[iPay].fin.payback.toFixed(1) + ' yrs') : '') +
        (iLife >= 0 ? mk(P.chips.lifetime, opts[iLife], cols[iLife].fin, F.fmtINR(cols[iLife].fin.lifetimeSaving)) : '');
      const anchor = document.getElementById('v_opBoldNote');
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(chips, anchor.nextSibling);
    }

  }

  /* ================================================================== */
  /* PAGE 3 — ABOUT                                                      */
  /* ================================================================== */
  function renderAbout(s, f, v) {
    const P = CONTENT.pageAbout;
    set('v_abEyebrow', tpl(P.eyebrow, v));
    set('v_abHeading', esc(P.heading1) + '<br>' + esc(P.heading2));
    set('v_abPara1', P.para1);
    set('v_abPara2', P.para2);
    set('v_abPara3', P.para3);
    set('v_abSectionLabel', P.sectionLabel);
    setHTML('v_abStats', P.stats.map((it) =>
      '<div class="card stat-card">' + I.chip(it.icon, 34) +
      '<div class="card-value">' + esc(it.value) + '</div>' +
      '<div class="card-title">' + esc(it.title) + '</div>' +
      '<div class="card-desc">' + esc(it.desc) + '</div></div>').join(''));
    setHTML('v_abFeatures', P.features.map((it) =>
      '<div class="card feat-card">' + I.chip(it.icon, 28, 'var(--cream-2)', '#D96A0E') +
      '<div><div class="feat-t">' + esc(it.title) + '</div>' +
      '<div class="feat-d">' + esc(it.desc) + '</div></div></div>').join(''));
  }

  /* ================================================================== */
  /* PAGE 4 — WHY ROOFTOP SOLAR                                          */
  /* ================================================================== */
  function renderWhySolar(s, f, v) {
    const P = CONTENT.pageWhySolar;
    set('v_wsHeading', P.heading);
    set('v_wsSub', P.sub);
    set('v_wsPara', P.para);
    setHTML('v_wsBenefits', P.benefits.map((b) => {
      const desc = b.desc.indexOf('{') >= 0 ? tpl(b.desc, v) : b.desc;
      return '<div class="card benefit-card">' + I.chip(b.icon, 30) +
        '<div class="card-title">' + esc(b.title) + '</div>' +
        '<div class="card-desc">' + esc(desc) + '</div></div>';
    }).join(''));
    set('v_wsHighlight', tpl(P.highlight, v));
    set('v_wsAnnualGen', F.fmtNum(f.annualGen) + ' kWh');
    set('v_wsAnnualSaving', F.fmtINR(f.annualSaving));
    set('v_wsLifetimeSaving', F.fmtINR(f.lifetimeSaving));

    /* No invented bill or fixed-charge floor. This is an energy-offset
       illustration, not a DISCOM bill/settlement or guaranteed cash saving. */
    show('v_wsBillSlashCard', f.monthlyBill > 0);
    set('v_bscBeforeVal', F.fmtINR(f.monthlyBill) + ' / mo');
    set('v_bscAfterVal', F.fmtINR(f.monthlyBillAfter) + ' / mo');
    set('v_bscSavedVal', F.fmtINR(f.monthlyBillSaving) + ' / mo');
    set('v_bscSavedYr', '≈ ' + F.fmtINR(f.monthlyBillSaving * 12) + ' offset / yr');
    const billBar = $('v_bscAfterBar');
    if (billBar) billBar.style.width = (f.monthlyBill > 0 ? f.monthlyBillAfter / f.monthlyBill * 100 : 0) + '%';

  }

  /* ================================================================== */
  /* PAGE 5 — PROPOSED SOLUTION                                          */
  /* ================================================================== */
  function renderSolution(s, f, v) {
    const P = CONTENT.pageSolution;
    set('v_soHeading', P.heading);
    set('v_soSub', P.sub);
    set('v_soPara', P.para);
    const dyn = [
      { icon: 'target', title: s.capacity + ' kWp', desc: 'Recommended System Capacity' },
      { icon: 'sun', title: '≈ ' + F.fmtNum(f.annualGen) + ' kWh', desc: 'Estimated Annual Energy Generation (Year 1)' },
      { icon: 'panel', title: f.moduleCount + ' × ' + f.moduleWattage + ' Wp', desc: (s.moduleTech || 'Solar') + ' Modules — ' + s.moduleMake }
    ];
    setHTML('v_soSpecs', dyn.concat(P.specs).map((it) =>
      '<div class="card spec-card">' + I.chip(it.icon, 28) +
      '<div class="spec-t">' + esc(it.title) + '</div>' +
      '<div class="card-desc">' + esc(it.desc) + '</div></div>').join(''));
    set('v_soIncludedLabel', P.includedLabel);
    setHTML('v_soIncluded', P.included.map((it) =>
      '<div class="card incl-card">' + I.chip(it.icon, 30) +
      '<div class="incl-t">' + esc(it.title) + '</div>' +
      '<div class="card-desc">' + esc(it.mode ? modeDesc(it.mode, s) : it.desc) + '</div></div>').join(''));
  }

  /* ================================================================== */
  /* PAGE 6 — TECHNICAL SPECIFICATION                                    */
  /* ================================================================== */
  function renderTechSpec(s, f, v) {
    const P = CONTENT.pageTechSpec;
    set('v_tsHeading', P.heading);
    set('v_tsSub', P.sub);
    set('v_tsPara', P.para);

    /* system overview diagram (inline SVG, explicit colours) */
    set('v_tsDiagramTitle', P.diagramTitle);
    setHTML('v_tsDiagram', systemDiagram(s, f, P));
    set('v_tsDiagramNote', tpl(P.diagramLabels.note, v));

    set('v_tsGroupsLabel', P.groupsLabel);
    const rows = [];
    const addRows = (group, list) => {
      rows.push('<tr class="spec-group"><td colspan="2">' + esc(group) + '</td></tr>');
      list.forEach(([k, val]) => {
        rows.push('<tr><td class="spec-k">' + esc(k) + '</td><td class="spec-v">' + esc(val) + '</td></tr>');
      });
    };
    addRows('SOLAR MODULES', [
      ['Make', s.moduleMake],
      ['Technology', s.moduleTech || '—'],
      ['Rated Power', f.moduleWattage + ' Wp per module'],
      ['Quantity', f.moduleCount + ' modules'],
      ['Installed Array Size', F.fmtNum(f.installedKwp * 100) / 100 + ' kWp'],
      ['Total Module Area', f.arrayArea ? Math.round(f.arrayArea) + ' m² (≈ ' + Math.round(f.arrayArea * 10.764) + ' sq.ft)' : '—'],
      ['Performance Warranty', CONTENT.shared.warrantyLine]
    ]);
    addRows('INVERTER', [
      ['Make', s.inverterMake],
      ['Rated Output', f.inverterKw + ' kW' + (s.inverterKw ? '' : ' (auto — equal to capacity)')],
      ['DC/AC Ratio', f.dcAcRatio ? f.dcAcRatio.toFixed(2) + ' : 1' : '—'],
      ['Monitoring', 'Wi-Fi real-time generation monitoring (mobile app)']
    ]);
    addRows('MOUNTING & CABLing'.replace('CABLing', 'CABLING'), [
      ['Structure Make', s.mountMake],
      ['Roof Type', s.roofType || '—'],
      ['Cabling & Protection', s.cableMake],
      ['Earthing & Lightning Protection', 'Included (as per EPC scope)']
    ]);
    if (s.availableArea) {
      const need = Math.ceil(f.arrayArea || 0);
      const ok = parseFloat(s.availableArea) >= need;
      addRows('SITE', [
        ['Available Roof Area', s.availableArea + ' m²'],
        ['Required Module Area', need + ' m² ' + (ok ? '— fits ✓' : '— exceeds available area')]
      ]);
    }
    setHTML('v_tsTable', rows.join(''));
    set('v_tsNoteLabel', P.noteLabel);
    set('v_tsNote', P.note);
    const refs = [
      [s.pvsystUrl, P.refsPvsyst, 'chart'],
      [s.arkaUrl, P.refsArka, 'sun']
    ].filter((r) => r[0] && String(r[0]).trim());
    const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return String(u).replace(/^https?:\/\//, '').split('/')[0]; } };
    show('v_tsRefsWrap', refs.length > 0);
    if (refs.length) {
      set('v_tsRefsLabel', P.refsLabel);
      setHTML('v_tsRefs', refs.map(([u, label, icon]) =>
        '<div class="ts-ref"><div class="tr-icon">' + I.get(icon, 14, '#D96A0E') + '</div>' +
        '<div class="tr-body"><div class="tr-l">' + esc(label) + '</div>' +
        '<div class="tr-v"><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' +
        esc(host(u)) + '</a></div></div></div>').join(''));
      set('v_tsRefsNote', P.refsNote);
    }
  }

  /* Simple, clean single-line system diagram (sun → array → inverter →
     meter → home/grid). Only entered values are printed on it. */
  function systemDiagram(s, f, P, v) {
    const L = P.diagramLabels;
    const navy = '#1C2B3F', orange = '#F2811D', gray = '#5B6472';
    const label = (x, y, txt, size, color, weight) =>
      '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="' + size + '" font-weight="' + (weight || 600) + '" fill="' + color + '">' + txt + '</text>';
    const box = (x, y, w, h, fill, stroke) =>
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="9" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.4"/>';
    const arrow = (x1, y, x2, txt) =>
      '<line x1="' + x1 + '" y1="' + y + '" x2="' + (x2 - 8) + '" y2="' + y + '" stroke="' + gray + '" stroke-width="1.6"/>' +
      '<path d="M' + (x2 - 8) + ' ' + (y - 4) + ' L' + x2 + ' ' + y + ' L' + (x2 - 8) + ' ' + (y + 4) + ' z" fill="' + gray + '"/>' +
      (txt ? label((x1 + x2) / 2, y - 8, txt, 9.5, orange, 700) : '');
    const icon = (name, size, color, x, y) =>
      I.get(name, size, color).replace('<svg ', '<svg x="' + x + '" y="' + y + '" ');
    const W = 718, H = 172, cy = 78;
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">';
    /* sun */
    svg += icon('sun', 34, orange, 12, cy - 17);
    /* array */
    svg += box(72, cy - 27, 152, 54, '#FFF7EE', orange);
    svg += icon('panel', 24, navy, 86, cy - 12);
    svg += label(196, cy - 4, L.array, 10.5, navy, 700);
    svg += label(196, cy + 12, tpl(L.arrayValue, v), 9, gray, 500);
    svg += arrow(232, cy, 290, L.dc);
    /* inverter */
    svg += box(292, cy - 27, 130, 54, navy, navy);
    svg += icon('inverter', 22, '#FFFFFF', 306, cy - 11);
    svg += label(382, cy - 4, L.inverter, 10.5, '#FFFFFF', 700);
    svg += label(382, cy + 12, tpl(L.inverterValue, v), 9, '#F7A45C', 500);
    svg += arrow(430, cy, 488, L.ac);
    /* meter */
    svg += box(490, cy - 27, 118, 54, '#FFF7EE', orange);
    svg += icon('meter', 22, navy, 504, cy - 11);
    svg += label(570, cy - 3, L.meter, 8.8, navy, 700);
    svg += label(570, cy + 12, 'NET METERING', 7.6, gray, 600);
    /* split arrows to home + grid */
    svg += arrow(614, cy - 14, 648, '');
    svg += arrow(614, cy + 14, 648, '');
    /* home (icon + label inside the box) */
    svg += box(650, cy - 48, 62, 44, '#FFFFFF', '#C9D2DE');
    svg += icon('home', 17, navy, 672, cy - 43);
    svg += label(681, cy - 11, L.home, 7.4, gray, 600);
    /* grid */
    svg += box(650, cy + 4, 62, 44, '#FFFFFF', '#C9D2DE');
    svg += icon('bolt', 17, orange, 672, cy + 9);
    svg += label(681, cy + 41, L.grid, 7.4, gray, 600);
    svg += '</svg>';
    return svg;
  }

  /* ================================================================== */
  /* PAGE 7 — EPC SCOPE                                                  */
  /* ================================================================== */
  function renderScope(s, f, v) {
    const P = CONTENT.pageScope;
    set('v_scHeading', P.heading);
    set('v_scSub', P.sub);
    set('v_scPara', P.para);
    set('v_scDelivLabel', P.delivLabel);
    setHTML('v_scDeliverables', P.deliverables.map((it, i) =>
      '<div class="deliv-box"><div class="deliv-num">' + (i + 1) + '</div>' +
      '<div class="deliv-t">' + esc(it.title) + '</div></div>').join(''));
    set('v_scRespLabel', P.respLabel);
    setHTML('v_scResp', P.resp.map((it) =>
      '<div class="resp-item">' + I.chip(it.icon, 28, 'var(--cream-2)', '#D96A0E') +
      '<div><div class="rt">' + esc(it.title) + '</div>' +
      '<div class="rd">' + esc(it.desc) + '</div></div></div>').join(''));
    set('v_scAddlLabel', P.addlLabel);
    setHTML('v_scAddl', P.addl.map((it) =>
      '<div class="addl-box"><div class="addl-t">' + esc(it.title) + '</div>' +
      '<div class="card-desc">' + esc(it.desc) + '</div></div>').join(''));
    set('v_scClosing', P.closing);
  }

  /* ================================================================== */
  /* PAGE 8 — INSTALLATION QUALITY                                       */
  /* ================================================================== */
  function renderQuality(s, f, v) {
    const P = CONTENT.pageQuality;
    set('v_quHeading', P.heading);
    set('v_quSub', P.sub);
    set('v_quPara', P.para);
    set('v_quStandardsLabel', P.standardsLabel);
    setHTML('v_quStandards', P.standards.map((it) =>
      '<div class="card std-card">' + I.chip(it.icon, 30) +
      '<div class="card-title">' + esc(it.title) + '</div>' +
      '<div class="card-desc">' + esc(it.desc) + '</div></div>').join(''));
    set('v_quChecklistLabel', P.checklistLabel);
    setHTML('v_quChecklist', P.checklist.map((it) =>
      '<div class="card check-card">' + I.get('check', 18, '#D96A0E') +
      '<div><div class="check-t">' + esc(it.title) + '</div>' +
      '<div class="card-desc">' + esc(it.desc) + '</div></div></div>').join(''));
    set('v_quPromise', P.promise);
  }

  /* ================================================================== */
  /* PAGE 9 — GENERATION & SAVINGS ANALYSIS                              */
  /* ================================================================== */
  function renderSavings(s, f, v) {
    const P = CONTENT.pageSavings;
    set('v_svHeading', P.heading);
    set('v_svSub', P.sub);
    set('v_svPara', P.para);
    set('v_svChipGen', F.fmtNum(f.annualGen) + ' kWh');
    set('v_svChipGenL', P.chips.annualGen);
    set('v_svChipSave', F.fmtINR(f.annualSaving));
    set('v_svChipSaveL', P.chips.annualSaving);
    set('v_svChipY25', F.fmtINR(f.series.saving[24]));
    set('v_svChipY25L', P.chips.year25Saving);
    set('v_svChipEff', f.effectivePerUnit > 0 ? '₹' + f.effectivePerUnit.toFixed(2) + '/unit' : '—');
    set('v_svChipEffL', P.chips.effective);

    set('v_svChartCumTitle', P.chartCumTitle);
    set('v_svChartCumNote', tpl(P.chartCumNote, v));
    set('v_svChartAnnualTitle', P.chartAnnualTitle);
    set('v_svChartAnnualNote', tpl(P.chartAnnualNote, v));

    /* milestone table */
    set('v_svTableTitle', P.tableTitle);
    const H = P.tableHeaders;
    const rows = [5, 10, 15, 20, 25].filter((y) => y <= f.series.years.length);
    setHTML('v_svTable', '<thead><tr>' +
      '<th>' + esc(H.year) + '</th><th>' + esc(H.cumSaving) + '</th>' +
      '<th>' + esc(H.netPosition) + '</th><th>' + esc(H.roi) + '</th></tr></thead><tbody>' +
      rows.map((y) => {
        const cum = f.series.cumSaving[y - 1];
        const net = cum - f.netInvestment;
        const roi = f.netInvestment > 0 ? (net / f.netInvestment) * 100 : 0;
        return '<tr><td class="sv-y">' + y + ' yrs</td>' +
          '<td>' + F.fmtINR(cum) + '</td>' +
          '<td class="' + (net >= 0 ? 'pos' : 'neg') + '">' + (net >= 0 ? '+' : '−') + ' ' + F.fmtINR(Math.abs(net)) + '</td>' +
          '<td class="' + (net >= 0 ? 'pos' : 'neg') + '">' + (roi >= 0 ? '+' : '−') + Math.abs(roi).toFixed(0) + '%</td></tr>';
      }).join('') + '</tbody>');

    set('v_svAssumptionsLabel', P.assumptionsLabel);
    setHTML('v_svAssumptions',
      '<span>' + esc(s.genFactor) + ' kWh/kWp/yr generation</span>' +
      '<span>₹' + esc(s.tariff) + '/unit tariff</span>' +
      '<span>' + esc(s.escalation) + '%/yr escalation</span>' +
      '<span>' + esc(s.degradation) + '%/yr degradation</span>' +
      '<span>' + esc(s.co2Factor) + ' kg CO₂/kWh grid factor</span>');
    set('v_svNote', P.note);
  }

  /* ================================================================== */
  /* PAGE 10 — INVESTMENT & COST BREAKDOWN                               */
  /* ================================================================== */
  function renderInvestment(s, f, v) {
    const P = CONTENT.pageInvestment;
    set('v_inHeading', P.heading);
    set('v_inSub', P.sub);
    set('v_inDesc', tpl(P.desc, v));

    set('v_inCostBase', F.fmtINR(f.projectCost));
    set('v_inCostBaseL', P.cards.projectCost);
    set('v_inCostGst', '+ ' + F.fmtINR(f.gstAmount));
    set('v_inCostGstL', P.cards.gstLine + ' (' + s.gstPercent + '%)');
    set('v_inCostSub', '− ' + F.fmtINR(f.subsidy));
    set('v_inCostSubL', P.cards.subsidy);
    set('v_inCostNet', F.fmtINR(f.netInvestment));
    set('v_inCostNetL', P.cards.netInvestment);
    /* subsidy caption reflects exactly how the number was derived */
    const subCap = f.subsidyAuto ? P.cards.subsidyCaptionAuto
      : (s.subsidyOverride !== '' ? P.cards.subsidyCaptionOverride : P.cards.subsidyCaptionNA);
    set('v_inCostSubCap', subCap);
    set('v_inRate', '₹' + (Math.round(f.costPerWp * 10) / 10) + ' / Wp');
    set('v_inRateL', P.rateChip);

    /* commercial / industrial tax shield benefit (IT Act Sec 32) */
    const taxBanner = $('v_inTaxShieldBanner');
    if (taxBanner) {
      if (f.isCommercialOrInd && f.taxShield > 0) {
        taxBanner.style.display = 'flex';
        set('v_inTaxDepr', F.fmtINR(f.taxDepreciationYear1));
        set('v_inTaxSaved', F.fmtINR(f.taxShield));
        set('v_inTaxRate', f.corpTaxRatePct + '%');
        set('v_inDeprRate', f.depreciationRatePct + '%');
      } else {
        taxBanner.style.display = 'none';
      }
    }

    /* cost build-up bridge always; BOM donut section only when entered */
    set('v_inBridgeTitle', P.bridgeTitle);
    set('v_inBomTitle', P.bomTitle);
    set('v_inBomIntro', P.bomIntro);
    const hasBom = f.bomSum > 0;
    show('v_inBomSection', hasBom);
    if (hasBom) {
      setHTML('v_inBomLegend', f.bomItems.map((it, i) => {
        const pct = (it.value / f.bomSum) * 100;
        const colors = ['#F2811D', '#1C2B3F', '#F7A45C', '#D96A0E', '#5B6B80', '#8FA1B5'];
        return '<div class="bom-row"><span class="bom-dot" style="background:' + colors[i % colors.length] + '"></span>' +
          '<span class="bom-name">' + esc(it.label) + '</span>' +
          '<span class="bom-val">' + F.fmtINR(it.value) + '</span>' +
          '<span class="bom-pct">' + pct.toFixed(1) + '%</span></div>';
      }).join('') +
        (Math.abs(f.bomDelta) > Math.max(2000, f.projectCost * 0.02)
          ? '<div class="bom-warn">⚠ Breakdown entered covers ' + F.fmtINR(f.bomSum) + ' of the ' +
            F.fmtINR(f.projectCost) + ' project cost — the two are shown exactly as entered.</div>'
          : ''));
    }

    /* payment schedule */
    set('v_inIncludesLabel', 'WHAT THE PRICE INCLUDES');
    setHTML('v_inIncludes', CONTENT.pageSolution.included.map((it) =>
      '<div class="inc-item">' + I.get(it.icon || 'check', 16, '#D96A0E') +
      '<div class="inc-t">' + esc(it.title) + '</div></div>').join(''));
    set('v_inPayLabel', P.paymentLabel);
    set('v_inPayNote', P.paymentNote);
    const pay = [
      ['v_inPayA', f.pay.advance, 'Advance — on signing'],
      ['v_inPayD', f.pay.dispatch, 'Before material dispatch'],
      ['v_inPayC', f.pay.completion, 'On completion & handover']
    ];
    setHTML('v_inPayChips', pay.map(([id, p, label]) =>
      '<div class="pay-chip"><div class="pv">' + p.pct + '%</div>' +
      '<div class="pa">' + F.fmtINR(p.amount) + '</div>' +
      '<div class="pl">' + esc(label) + '</div></div>').join(''));
    const sumWarn = $('v_inPayWarn');
    if (Math.round(f.pay.sumPct) !== 100) {
      sumWarn.style.display = '';
      set('v_inPayWarn', '⚠ Payment schedule totals ' + f.pay.sumPct + '% — adjust the three percentages to total 100%.');
    } else sumWarn.style.display = 'none';

    set('v_inDisclaimer', P.disclaimer);
  }

  /* ================================================================== */
  /* PAGE 10b — FINANCING & EMI (optional page)                          */
  /* ================================================================== */
  /* page visibility: true when the three loan inputs are all entered     */
  let _finKey = null, _finVis = false;
  function hasFinancing(s) {
    if (!s) return false;
    const key = [s.loanAmt, s.loanRate, s.loanYears].join('|');
    if (key !== _finKey) {
      let fin = null;
      try { fin = F.compute(s).financing; } catch (e) { fin = null; }
      _finKey = key; _finVis = !!fin;
    }
    return _finVis;
  }

  function renderFinance(s, f /*, v */) {
    const P = CONTENT.pageFinance;
    const fin = f.financing;
    if (!fin) return; /* page hidden; nothing to fill */
    set('v_finEyebrow', P.eyebrow);
    set('v_finHeading', P.heading);
    set('v_finSub', P.sub);
    set('v_finPara', P.para);
    set('v_finRecap', P.recapLabel + ':  ₹' + F.fmtINR(fin.loan).replace('₹', '') +
      '  @ ' + s.loanRate + '% p.a.  ×  ' + s.loanYears + ' years  →  EMI ' +
      F.fmtINR(fin.emi) + ' / month for ' + fin.months + ' months');
    setHTML('v_finCards', [
      [P.cards.emi, F.fmtINR(fin.emi) + ' / mo', ''],
      [P.cards.interest, F.fmtINR(fin.totalInterest), ''],
      [P.cards.saving, F.fmtINR(fin.monthlySavingY1) + ' / mo', 'inv-card-sub'],
      [P.cards.outgo, (fin.netMonthlyY1 < 0 ? '−' : '') + F.fmtINR(Math.abs(fin.netMonthlyY1)) + ' / mo', 'inv-card-net']
    ].map((c) =>
      '<div class="inv-card ' + c[2] + '"><div class="inv-l">' + esc(c[0]) + '</div>' +
      '<div class="inv-v">' + esc(c[1]) + '</div></div>').join(''));
    set('v_finChartTitle', P.chartTitle);
    const hl = $('v_finHighlight');
    if (fin.crossingMonth === 1) {
      hl.style.display = '';
      set('v_finHighlight', P.cashflowPositive);
    } else if (isFinite(fin.crossingMonth)) {
      hl.style.display = '';
      set('v_finHighlight', tpl(P.crossing, { m: fin.crossingMonth }));
    } else {
      hl.style.display = 'none';
    }
    set('v_finNote', tpl(P.note, { rate: s.loanRate, years: s.loanYears }));
  }

  /* ================================================================== */
  /* PAGE 11 — WHY CHOOSE KTM                                            */
  /* ================================================================== */
  function renderWhyKtm(s, f, v) {
    const P = CONTENT.pageWhyKtm;
    set('v_wkHeading', P.heading);
    set('v_wkSub', P.sub);
    set('v_wkPara', P.para);
    set('v_wkDiffLabel', P.diffLabel);
    setHTML('v_wkDiffs', P.differentiators.map((it) =>
      '<div class="card diff-card">' + I.chip(it.icon, 28, 'var(--cream-2)', '#D96A0E') +
      '<div class="diff-t">' + esc(it.title) + '</div>' +
      '<div class="card-desc">' + esc(it.desc) + '</div></div>').join(''));
    set('v_wkCommitLabel', P.commitLabel);
    setHTML('v_wkCommits', P.commitments.map((it) =>
      '<div class="commit-card">' + I.chip(it.icon, 26) +
      '<div class="commit-t">' + esc(it.title) + '</div>' +
      '<div class="commit-d">' + esc(it.desc) + '</div></div>').join(''));
  }

  /* ================================================================== */
  /* PAGE 12 — PROJECTS PORTFOLIO                                        */
  /* ================================================================== */
  function renderProjects(s, f, v) {
    const P = CONTENT.pageProjects;
    set('v_prHeading', P.heading);
    set('v_prSub', P.sub);
    /* traceable counts: projects listed on this page + overall track record stat */
    const listed = P.categories.reduce((t, c) => t + c.projects.length, 0);
    setHTML('v_prStats',
      '<span class="ps-big">' + listed + ' flagship projects</span>' +
      '<span class="ps-sep"></span>' +
      '<span>' + P.categories.length + ' sectors — industrial, commercial & residential</span>' +
      '<span class="ps-sep"></span>' +
      '<span>' + esc(s.statProjects) + ' delivered to date</span>');
    const catIcons = ['factory', 'building', 'home'];
    setHTML('v_prCats', P.categories.map((cat, ci) => {
      return '<div class="proj-cat-label">' + I.chip(catIcons[ci % catIcons.length], 26) +
        '<div class="txt">' + esc(cat.label) + '</div></div>' +
        '<div class="proj-grid">' + cat.projects.map((p) => {
          const src = PROJECT_IMAGES[p.img] || '';
          return '<div class="proj-card"><img src="' + esc(src) + '" alt="' + esc(p.name) + '">' +
            '<div class="pc-body"><div class="pc-name">' + esc(p.name) + '</div>' +
            '<div class="pc-loc">' + esc(p.location) + '</div>' +
            '<div class="pc-cap">' + esc(p.capacity) + '</div></div></div>';
        }).join('') + '</div>';
    }).join(''));
  }

  /* ================================================================== */
  /* PAGE 13 — WARRANTY & INSTALLATION JOURNEY                           */
  /* ================================================================== */
  function renderWarranty(s, f, v) {
    const P = CONTENT.pageWarranty;
    set('v_wrHeading', P.heading);
    set('v_wrSub', P.sub);
    set('v_wrWarrLabel', P.warrLabel);
    setHTML('v_wrWarranties', P.warranties.map((it) =>
      '<div class="card warr-card">' + I.chip(it.icon, 28) +
      '<div class="warr-t">' + esc(it.title) + '</div><ul>' +
      (it.b1 ? '<li>' + esc(it.b1) + '</li>' : '') +
      (it.b2 ? '<li>' + esc(it.b2) + '</li>' : '') + '</ul></div>').join(''));
    set('v_wrJourneyLabel', P.journeyLabel);
    setHTML('v_wrJourney', P.steps.map((it, i) =>
      '<div class="card journey-card"><div class="journey-num">' + (i + 1) + '</div>' +
      '<div class="journey-t">' + esc(it.title) + '</div><ul>' +
      (it.b1 ? '<li>' + esc(it.b1) + '</li>' : '') +
      (it.b2 ? '<li>' + esc(it.b2) + '</li>' : '') +
      (it.b3 ? '<li>' + esc(it.b3) + '</li>' : '') + '</ul></div>').join(''));
    set('v_wrClosing', P.closing);
  }

  /* ================================================================== */
  /* PAGE 14 — TERMS & CONDITIONS                                        */
  /* ================================================================== */
  function renderTerms(s, f, v) {
    const P = CONTENT.pageTerms;
    set('v_tmHeading', P.heading);
    set('v_tmSub', P.sub);
    set('v_tmIntro', P.intro);
    set('v_tmItemsLabel', P.itemsLabel);
    setHTML('v_tmItems', P.items.map((it, i) =>
      '<div class="term-item"><div class="term-num">' + String(i + 1).padStart(2, '0') + '</div>' +
      '<div><div class="term-t">' + esc(it.title) + '</div>' +
      '<div class="term-d">' + esc(tpl(it.desc, v)) + '</div></div></div>').join(''));
    set('v_tmNoteLabel', P.noteLabel);
    set('v_tmNote', tpl(P.note, v));
  }

  /* ================================================================== */
  /* PAGE 15 — CLOSING / ACCEPTANCE / CONTACT                            */
  /* ================================================================== */
  function renderClosing(s, f, v) {
    const P = CONTENT.pageClosing;
    set('v_clHeading', P.bannerHeading);
    set('v_clSub', P.bannerSub);
    set('v_clNextLabel', P.nextLabel);
    setHTML('v_clNext', P.next.map((it) =>
      '<div class="next-item">' + I.chip(it.icon, 30) +
      '<div><div class="next-t">' + esc(tpl(it.title, v)) + '</div>' +
      '<div class="next-d">' + esc(tpl(it.desc, v)) + '</div></div></div>').join(''));
    set('v_clHighlight', f.annualSaving > 0
      ? 'Projected saving of ' + F.fmtINR(f.annualSaving / 12) + '/month — every month of delay has a real cost.'
      : '');
    show('v_clHighlightRow', f.annualSaving > 0);
    set('v_clCta', P.cta);
    set('v_clCtaPhone', s.companyPhone);
    const icoMap = { v_clIcoCompany: 'building', v_clIcoPin: 'pin', v_clIcoPhone: 'phone', v_clIcoMail: 'mail', v_clIcoWeb: 'globe' };
    Object.keys(icoMap).forEach((id) => setHTML(id, I.chip(icoMap[id], 26)));
    set('v_clCompanyName', s.companyName + (s.companyName.match(/Pvt\.?\s*Ltd\.?/i) ? '' : ' Pvt. Ltd.'));
    set('v_clCompanyTagline', s.companyTagline);
    set('v_clAddress', s.companyAddress);
    set('v_clPhone', s.companyPhone);
    set('v_clEmail', s.companyEmail);
    set('v_clWebsite', s.companyWebsite);
    set('v_clAcceptLabel', P.acceptLabel);
    set('v_clAcceptIntro', tpl(P.acceptIntro, v));
    set('v_clSignCustomer', P.signCustomer);
    set('v_clSignCompany', tpl(P.signCompany, v));
    set('v_clSignCustomerSub', P.signCustomerSub);
    set('v_clSignCompanySub', P.signCompanySub);
    set('v_clDisclaimer', tpl(P.disclaimer, v));
  }

  /* ================================================================== */
  /* PAGE REGISTRY                                                       */
  /* ================================================================== */
  const PAGES = [
    { id: 'pageCover', nav: 'Cover', title: 'Cover', render: renderCover, chrome: 'none' },
    { id: 'pageExec', nav: 'Summary', title: 'Executive Summary', render: renderExec },
    { id: 'pageOptions', nav: 'Options', title: 'System Options', render: renderOptions,
      visible: (s) => ((s && s.options) || []).length >= 2 },
    { id: 'pageAbout', nav: 'About', title: 'About Us', render: renderAbout },
    { id: 'pageWhySolar', nav: 'Why Solar', title: 'Why Rooftop Solar', render: renderWhySolar },
    { id: 'pageSolution', nav: 'Solution', title: 'Proposed Solution', render: renderSolution },
    { id: 'pageTechSpec', nav: 'Tech Specs', title: 'Technical Specification', render: renderTechSpec },
    { id: 'pageScope', nav: 'EPC Scope', title: 'EPC Scope', render: renderScope },
    { id: 'pageQuality', nav: 'Quality', title: 'Installation Quality', render: renderQuality },
    { id: 'pageSavings', nav: 'Savings', title: 'Generation & Savings', render: renderSavings },
    { id: 'pageInvestment', nav: 'Investment', title: 'Investment & Cost Breakdown', render: renderInvestment },
    { id: 'pageFinance', nav: 'Financing', title: 'Financing & EMI', render: renderFinance,
      visible: (s) => hasFinancing(s) },
    { id: 'pageWhyKtm', nav: 'Why KTM', title: 'Why Choose KTM', render: renderWhyKtm },
    { id: 'pageProjects', nav: 'Projects', title: 'Projects Portfolio', render: renderProjects },
    { id: 'pageWarranty', nav: 'Warranty', title: 'Warranty & Journey', render: renderWarranty },
    { id: 'pageTerms', nav: 'Terms', title: 'Terms & Conditions', render: renderTerms },
    { id: 'pageClosing', nav: 'Contact', title: 'Acceptance & Contact', render: renderClosing }
  ];

  function pageNum(id) {
    const list = lastVisible.length ? lastVisible : PAGES;
    const i = list.findIndex((p) => p.id === id);
    return i >= 0 ? i + 1 : '';
  }

  /* Pages shown for the current state (conditional pages may drop out). */
  let lastVisible = [];
  function visiblePages(s) {
    return PAGES.filter((p) => !p.visible || p.visible(s));
  }

  /* Page labels, header meta and footer furniture on every page. */
  function renderChrome(s, f) {
    lastVisible = visiblePages(s);
    const total = lastVisible.length;
    lastVisible.forEach((p, i) => {
      const wrap = document.querySelector('.page-wrap[data-page="' + p.id + '"]');
      if (wrap) wrap.style.display = '';
      const label = document.querySelector('.page-wrap[data-page="' + p.id + '"] .page-label');
      if (label) label.textContent = 'Page ' + (i + 1) + ' of ' + total + ' — ' + p.title;
      const foot = $('v_pgnum_' + p.id);
      if (foot) foot.textContent = 'Page ' + (i + 1) + ' of ' + total;
    });
    /* hide conditional pages that dropped out */
    PAGES.forEach((p) => {
      if (!lastVisible.includes(p)) {
        const wrap = document.querySelector('.page-wrap[data-page="' + p.id + '"]');
        if (wrap) wrap.style.display = 'none';
      }
    });
    const meta = s.propRef + '  •  v' + s.propVersion + '  •  ' + (F.fmtDate(s.propDate) || '—');
    document.querySelectorAll('[data-head-ref]').forEach((el) => { el.textContent = meta; });
    const footLeft = s.companyName + '  •  ' + s.companyPhone + '  •  ' + s.companyWebsite;
    document.querySelectorAll('[data-foot-company]').forEach((el) => { el.textContent = footLeft; });
    const tagline = String(CONTENT.shared.footerTagline || '').replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '');
    document.querySelectorAll('[data-foot-tagline]').forEach((el) => { el.textContent = tagline; });
    /* logo on every page + form brand */
    const logoSrc = ($('formLogo') || {}).src;
    if (logoSrc) document.querySelectorAll('.pg-logo img, .cover-logo img').forEach((img) => { img.src = logoSrc; });
  }

  /* ================================================================== */
  /* charts (after layout)                                               */
  /* ================================================================== */
  function drawCharts(f) {
    C.cumulative($('chartCum'), f);
    C.annual($('chartAnnual'), f);
    C.bridge($('chartBridge'), f);
    C.donut($('chartDonut'), f.bomItems, f.projectCost);
    C.emi($('chartFinEmi'), f);
  }

  /* Live quote chip — shows capacity + customer + net investment live */
  function updateLiveChip(s, f) {
    const el = $('liveChipText');
    if (!el) return;
    const cap = (s.capacity || '—') + ' kWp';
    const cust = (s.custName || '').trim().split(' ')[0] || 'Live';
    const net = F.fmtINRshort(f.netInvestment);
    el.textContent = 'Live • ' + cap + ' • ' + cust + ' • ' + net;
    const chip = $('liveChip');
    if (chip) chip.title = 'Live quote — ' + cap + ' for ' + (s.custName || 'customer') + ' — net ' + F.fmtINR(f.netInvestment);
  }

  /* ================================================================== */
  let lastState = null;
  function renderAll(stateOverride) {
    const s = stateOverride || readState();
    lastState = s;
    const f = F.compute(s);
    const v = tplVars(s, f);
    renderChrome(s, f);
    PAGES.forEach((p) => { try { p.render(s, f, v); } catch (e) { console.error('render', p.id, e); } });
    updateLiveChip(s, f);
    drawCharts(f);
    if (typeof document !== 'undefined' && document.dispatchEvent) {
      try { document.dispatchEvent(new CustomEvent('qs:rendered')); } catch (e) { /* noop */ }
    }
    return { s, f };
  }

  function readState() {
    const g = (id) => { const el = $(id); return el ? el.value : ''; };
    return {
      companyName: g('companyName'), companyTagline: g('companyTagline'),
      companyPhone: g('companyPhone'), companyEmail: g('companyEmail'),
      companyAddress: g('companyAddress'), companyWebsite: g('companyWebsite'),
      statYears: g('statYears'), statProjects: g('statProjects'), statCapacity: g('statCapacity'),
      prepName: g('prepName'),
      customerType: g('customerType'), custName: g('custName'), custAddress: g('custAddress'),
      propDate: g('propDate'), propRef: g('propRef'), propVersion: g('propVersion'),
      validityDays: g('validityDays'), monthlyBill: g('monthlyBill'),
      capacity: g('capacity'), genFactor: g('genFactor'),
      moduleMake: g('moduleMake'), moduleWattage: g('moduleWattage'), moduleTech: g('moduleTech'),
      moduleLengthMm: g('moduleLengthMm'), moduleWidthMm: g('moduleWidthMm'),
      inverterMake: g('inverterMake'), inverterKw: g('inverterKw'),
      mountMake: g('mountMake'), cableMake: g('cableMake'),
      roofType: g('roofType'), availableArea: g('availableArea'),
      pvsystUrl: g('pvsystUrl'), arkaUrl: g('arkaUrl'),
      costPerKwp: g('costPerKwp'), gstPercent: g('gstPercent'),
      corpTaxRate: g('corpTaxRate'), depreciationRate: g('depreciationRate'),
      tariff: g('tariff'), escalation: g('escalation'), degradation: g('degradation'),
      subsidyOverride: g('subsidyOverride'), co2Factor: g('co2Factor'), treeFactor: g('treeFactor'),
      payAdvance: g('payAdvance'), payDispatch: g('payDispatch'), payCompletion: g('payCompletion'),
      bomModules: g('bomModules'), bomInverter: g('bomInverter'), bomStructure: g('bomStructure'),
      bomBos: g('bomBos'), bomInstall: g('bomInstall'), bomLiaison: g('bomLiaison'),
      loanAmt: g('loanAmt'), loanRate: g('loanRate'), loanYears: g('loanYears'),
      durationText: g('durationText'), jurisdiction: g('jurisdiction'), surveyWindow: g('surveyWindow'),
      shareUrl: g('shareUrl'),
      options: (root.__qsOptions || [])
    };
  }

  root.Render = { renderAll, PAGES, drawCharts, readState, pageNum, visiblePages,
    get lastState() { return lastState; },
    get lastVisible() { return lastVisible; } };
})(typeof self !== 'undefined' ? self : this);
