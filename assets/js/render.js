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
    set('v_coverBadgeGen', '≈ ' + F.fmtNum(f.annualGen) + ' units / year');
    set('v_coverStatYears', s.statYears);
    set('v_coverStatProjects', s.statProjects);
    set('v_coverStatCapacity', s.statCapacity);
    set('v_coverStat4', CONTENT.cover.footerStat4);
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
  /* SYSTEM OPTIONS (Good / Better / Best)                               */
  /* ================================================================== */
  /** Compute the three optional systems with the SAME engine as the main
      design — only capacity and cost/kWp are overridden per option. */
  function computeOptions(s) {
    const names = [s.opt1Name, s.opt2Name, s.opt3Name];
    const kwps = [s.opt1Kwp, s.opt2Kwp, s.opt3Kwp];
    const costs = [s.opt1Cost, s.opt2Cost, s.opt3Cost];
    const rec = parseInt(s.optRec, 10) || 0;
    return [0, 1, 2].map((i) => {
      const kwpRaw = parseFloat(kwps[i]);
      const kwp = (isFinite(kwpRaw) && kwpRaw > 0) ? kwpRaw : 0;
      const cfg = Object.assign({}, s, {
        capacity: kwp,
        costPerKwp: (parseFloat(costs[i]) > 0) ? parseFloat(costs[i]) : s.costPerKwp
      });
      return {
        i: i, name: names[i] || ('Option ' + (i + 1)), kwp: kwp,
        rec: rec === i + 1, f: F.compute(cfg)
      };
    });
  }

  function renderOptions(s, f, v) {
    const P = CONTENT.pageOptions;
    set('v_opHeading', P.heading);
    set('v_opSub', P.sub);
    set('v_opIntro', P.intro);
    set('v_opMetricsLabel', P.metricsLabel);
    set('v_opChartTitle', P.chartTitle);
    const list = computeOptions(s);
    const row = (k, val) => '<div class="opt-r"><span class="k">' + esc(k) + '</span><span class="val">' + val + '</span></div>';
    setHTML('v_opCards', list.map((o) => {
      const m = o.f;
      const cfgd = o.kwp > 0;
      const isMain = cfgd && Math.abs(parseFloat(s.capacity) - o.kwp) < 0.001;
      return '<div class="opt-card' + (o.rec ? ' opt-rec' : '') + '">' +
        (o.rec && cfgd ? '<div class="opt-badge">' + esc(P.chips.recommended) + '</div>' : '') +
        '<div class="opt-name">' + esc(o.name) + '</div>' +
        (cfgd
          ? '<div class="opt-kwp">' + o.kwp + ' kWp</div>' +
            '<div class="opt-rows">' +
            row(P.chips.invest, F.fmtINR(m.netInvestment)) +
            row(P.chips.annual, F.fmtINR(m.annualSaving)) +
            row(P.chips.monthly, F.fmtINR(m.annualSaving / 12)) +
            row(P.chips.payback, isFinite(m.payback) ? m.payback.toFixed(1) + ' yrs' : '—') +
            row(P.chips.lifetime, F.fmtINRshort(m.lifetimeSaving)) +
            row(P.chips.gen, F.fmtNum(m.annualGen) + ' kWh') +
            '</div>' +
            (isMain ? '<div class="opt-match">' + esc(P.chips.match) + '</div>' : '')
          : '<div class="opt-empty">' + esc(P.chips.notSet) + '</div>') +
        '</div>';
    }).join(''));
    const metrics = [
      [P.chips.invest, (m) => F.fmtINR(m.netInvestment)],
      [P.chips.annual, (m) => F.fmtINR(m.annualSaving)],
      [P.chips.payback, (m) => isFinite(m.payback) ? m.payback.toFixed(1) + ' yrs' : '—'],
      [P.chips.lifetime, (m) => F.fmtINR(m.lifetimeSaving)],
      [P.chips.gen, (m) => F.fmtNum(m.annualGen) + ' kWh'],
      [P.chips.modules, (m) => (m.moduleCount ? m.moduleCount + ' × ' + m.moduleWattage + ' Wp' : '—')]
    ];
    setHTML('v_opTable',
      '<thead><tr><th></th>' +
      list.map((o) => '<th' + (o.rec ? ' class="opt-col-rec"' : '') + '>' + esc(o.name) + '</th>').join('') +
      '</tr></thead><tbody>' +
      metrics.map(([label, get]) =>
        '<tr><td class="sv-y">' + esc(label) + '</td>' +
        list.map((o) => '<td>' + (o.kwp > 0 ? get(o.f) : '—') + '</td>').join('') +
        '</tr>').join('') +
      '</tbody>');
    set('v_opNote', tpl(P.note, v));
  }

  /* ================================================================== */
  /* PAGE REGISTRY                                                       */
  /* ================================================================== */
  const PAGES = [
    { id: 'pageCover', nav: 'Cover', title: 'Cover', render: renderCover, chrome: 'none' },
    { id: 'pageExec', nav: 'Summary', title: 'Executive Summary', render: renderExec },
    { id: 'pageOptions', nav: 'Options', title: 'Choose Your System', render: renderOptions,
      visible: (s) => !!s.optShow },
    { id: 'pageAbout', nav: 'About', title: 'About Us', render: renderAbout },
    { id: 'pageWhySolar', nav: 'Why Solar', title: 'Why Rooftop Solar', render: renderWhySolar },
    { id: 'pageSolution', nav: 'Solution', title: 'Proposed Solution', render: renderSolution },
    { id: 'pageTechSpec', nav: 'Tech Specs', title: 'Technical Specification', render: renderTechSpec },
    { id: 'pageScope', nav: 'EPC Scope', title: 'EPC Scope', render: renderScope },
    { id: 'pageQuality', nav: 'Quality', title: 'Installation Quality', render: renderQuality },
    { id: 'pageSavings', nav: 'Savings', title: 'Generation & Savings', render: renderSavings },
    { id: 'pageInvestment', nav: 'Investment', title: 'Investment & Cost Breakdown', render: renderInvestment },
    { id: 'pageWhyKtm', nav: 'Why KTM', title: 'Why Choose KTM', render: renderWhyKtm },
    { id: 'pageProjects', nav: 'Projects', title: 'Projects Portfolio', render: renderProjects },
    { id: 'pageWarranty', nav: 'Warranty', title: 'Warranty & Journey', render: renderWarranty },
    { id: 'pageTerms', nav: 'Terms', title: 'Terms & Conditions', render: renderTerms },
    { id: 'pageClosing', nav: 'Contact', title: 'Acceptance & Contact', render: renderClosing }
  ];

  /* The most recently rendered state — lets nav/PDF/chrome honour the same
     page visibility (e.g. the optional System Options page). */
  let CURRENT = null;
  function visiblePages() {
    if (!CURRENT) return PAGES;
    return PAGES.filter((p) => !p.visible || p.visible(CURRENT.s));
  }
  function pageNum(id) {
    return visiblePages().findIndex((p) => p.id === id) + 1;
  }

  /* Page labels, header meta and footer furniture on every page. */
  function renderChrome(s, f) {
    const list = visiblePages();
    const total = list.length;
    PAGES.forEach((p) => {
      const wrap = document.querySelector('.page-wrap[data-page="' + p.id + '"]');
      if (wrap) wrap.style.display = (p.visible && !p.visible(s)) ? 'none' : '';
      const idx = list.indexOf(p);
      const label = wrap && wrap.querySelector('.page-label');
      if (label) label.textContent = idx >= 0 ? 'Page ' + (idx + 1) + ' of ' + total + ' — ' + p.title : '';
      const foot = $('v_pgnum_' + p.id);
      if (foot) foot.textContent = idx >= 0 ? 'Page ' + (idx + 1) + ' of ' + total : '';
    });
    const dl = $('downloadLabel');
    if (dl) dl.textContent = 'Generate & Download PDF (' + total + ' Pages)';
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
    C.options($('chartOptions'), computeOptions(CURRENT ? CURRENT.s : readState()));
  }

  /* ================================================================== */
  function renderAll() {
    const s = readState();
    const f = F.compute(s);
    const v = tplVars(s, f);
    CURRENT = { s: s, f: f, v: v };
    renderChrome(s, f);
    PAGES.forEach((p) => { try { p.render(s, f, v); } catch (e) { console.error('render', p.id, e); } });
    drawCharts(f);
    try { document.dispatchEvent(new Event('qs:rendered')); } catch (e) { /* noop */ }
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
      costPerKwp: g('costPerKwp'), gstPercent: g('gstPercent'),
      tariff: g('tariff'), escalation: g('escalation'), degradation: g('degradation'),
      subsidyOverride: g('subsidyOverride'), co2Factor: g('co2Factor'), treeFactor: g('treeFactor'),
      payAdvance: g('payAdvance'), payDispatch: g('payDispatch'), payCompletion: g('payCompletion'),
      bomModules: g('bomModules'), bomInverter: g('bomInverter'), bomStructure: g('bomStructure'),
      bomBos: g('bomBos'), bomInstall: g('bomInstall'), bomLiaison: g('bomLiaison'),
      durationText: g('durationText'), jurisdiction: g('jurisdiction'), surveyWindow: g('surveyWindow'),
      optShow: ($('optShow') || {}).checked === true,
      opt1Name: g('opt1Name'), opt1Kwp: g('opt1Kwp'), opt1Cost: g('opt1Cost'),
      opt2Name: g('opt2Name'), opt2Kwp: g('opt2Kwp'), opt2Cost: g('opt2Cost'),
      opt3Name: g('opt3Name'), opt3Kwp: g('opt3Kwp'), opt3Cost: g('opt3Cost'),
      optRec: (document.querySelector('input[name="optRec"]:checked') || {}).value || '0',
      shareLinkBase: g('shareLinkBase')
    };
  }

  root.Render = { renderAll, PAGES, drawCharts, readState, pageNum, visiblePages, computeOptions };
})(typeof self !== 'undefined' ? self : this);
