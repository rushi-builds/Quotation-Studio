/* ==========================================================================
   Quotation Studio — Application Logic
   --------------------------------------------------------------------------
   Depends on: content.js (CONTENT, PROJECT_IMAGES), html2canvas, jsPDF.
   Sections:
     1. Formatting helpers        5. Page render functions
     2. Form reading               6. Advanced editor
     3. Financial engine           7. Event wiring
     4. Card builders              8. PDF export
   ========================================================================== */
'use strict';

(function () {
  const $ = (id) => document.getElementById(id);

  /* ---------------- 1. Formatting helpers ---------------- */
  function fmtINR(n) {
    if (isNaN(n)) n = 0;
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }
  function fmtNum(n) {
    if (isNaN(n)) n = 0;
    return Math.round(n).toLocaleString('en-IN');
  }
  function fmtDate(dstr) {
    if (!dstr) return '';
    const d = new Date(dstr + 'T00:00:00');
    const day = d.getDate();
    const suf = (day % 10 === 1 && day !== 11) ? 'st'
      : (day % 10 === 2 && day !== 12) ? 'nd'
      : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return day + suf + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }
  /** PM Surya Ghar subsidy slabs: ₹30,000/kW for first 2 kW, ₹18,000 for the
      3rd kW, capped at ₹78,000 for 3 kW and above. */
  function calcSubsidy(kwp) {
    if (kwp <= 0) return 0;
    if (kwp <= 2) return 30000 * kwp;
    if (kwp < 3) return 60000 + 18000 * (kwp - 2);
    return 78000;
  }
  /** Internal rate of return via bisection (result in percent). */
  function calcIRR(cashflows) {
    const npv = (rate) => {
      let v = 0;
      for (let i = 0; i < cashflows.length; i++) v += cashflows[i] / Math.pow(1 + rate, i);
      return v;
    };
    let low = -0.95, high = 10, mid = 0;
    for (let i = 0; i < 200; i++) {
      mid = (low + high) / 2;
      const val = npv(mid);
      if (Math.abs(val) < 1) break;
      if (val > 0) low = mid; else high = mid;
    }
    return mid * 100;
  }
  function escapeHtml(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /** Replace {placeholders} in brochure text with live values. */
  function fillTemplate(tpl, s, f) {
    f = f || {};
    return tpl
      .replace(/{capacity}/g, s.capacity + ' kWp')
      .replace(/{annualGen}/g, fmtNum(f.annualGen || 0) + ' kWh')
      .replace(/{co2Annual}/g, (f.co2Annual || 0).toFixed(1))
      .replace(/{treesAnnual}/g, fmtNum(f.treesAnnual || 0))
      .replace(/{company}/g, s.companyName);
  }

  /* ---------------- 2. Form reading ---------------- */
  function readMain() {
    return {
      companyName: $('companyName').value,
      companyTagline: $('companyTagline').value,
      companyPhone: $('companyPhone').value,
      companyEmail: $('companyEmail').value,
      companyAddress: $('companyAddress').value,
      companyWebsite: $('companyWebsite').value,
      statYears: $('statYears').value,
      statProjects: $('statProjects').value,
      statCapacity: $('statCapacity').value,
      custName: $('custName').value,
      custAddress: $('custAddress').value,
      propDate: $('propDate').value,
      propRef: $('propRef').value,
      capacity: parseFloat($('capacity').value) || 0,
      genFactor: parseFloat($('genFactor').value) || 0,
      moduleMake: $('moduleMake').value,
      inverterMake: $('inverterMake').value,
      mountMake: $('mountMake').value,
      cableMake: $('cableMake').value,
      costPerKwp: parseFloat($('costPerKwp').value) || 0,
      gstPercent: parseFloat($('gstPercent').value) || 0,
      tariff: parseFloat($('tariff').value) || 0,
      escalation: (parseFloat($('escalation').value) || 0) / 100,
      degradation: (parseFloat($('degradation').value) || 0) / 100,
      subsidyOverride: $('subsidyOverride').value,
      payAdvance: parseFloat($('payAdvance').value) || 0,
      payDispatch: parseFloat($('payDispatch').value) || 0,
      payCompletion: parseFloat($('payCompletion').value) || 0
    };
  }

  /* ---------------- 3. Financial engine ---------------- */
  function computeFinancials(s) {
    const projectCost = s.capacity * s.costPerKwp;
    const gstAmount = projectCost * s.gstPercent / 100;
    const totalCost = projectCost + gstAmount;
    const subsidy = (s.subsidyOverride !== '' && !isNaN(parseFloat(s.subsidyOverride)))
      ? parseFloat(s.subsidyOverride)
      : calcSubsidy(s.capacity);
    const netInvestment = totalCost - subsidy;
    const annualGen = s.capacity * s.genFactor;
    const annualSaving = annualGen * s.tariff;

    // 25-year projection with panel degradation + tariff escalation
    const YEARS = 25;
    let gen = annualGen, tariff = s.tariff, lifetimeSaving = 0, lifetimeGenKWh = 0;
    const cashflows = [-netInvestment];
    for (let y = 0; y < YEARS; y++) {
      const yearSaving = gen * tariff;
      lifetimeSaving += yearSaving;
      lifetimeGenKWh += gen;
      cashflows.push(yearSaving);
      gen = gen * (1 - s.degradation);
      tariff = tariff * (1 + s.escalation);
    }

    const payback = annualSaving > 0 ? netInvestment / annualSaving : 0;
    const irr = calcIRR(cashflows);

    // Environmental impact (0.79 kg CO₂ per kWh; one tree ≈ 58.4 kg CO₂)
    const co2Factor = 0.79;
    const co2TonnesLifetime = lifetimeGenKWh * co2Factor / 1000;
    const treesEquivalent = (co2TonnesLifetime * 1000) / 58.4;
    const co2Annual = (annualGen * co2Factor) / 1000;
    const treesAnnual = (co2Annual * 1000) / 58.4;

    return {
      projectCost, gstAmount, totalCost, subsidy, netInvestment,
      annualGen, annualSaving, lifetimeSaving, payback, irr,
      co2TonnesLifetime, treesEquivalent, co2Annual, treesAnnual
    };
  }

  /* ---------------- 4. Card builders ---------------- */
  function statCard(it) {
    return '<div class="card" style="text-align:center;">' +
      '<div class="icon-circle" style="margin:0 auto 6px;">' + it.icon + '</div>' +
      '<div class="card-value">' + escapeHtml(it.value) + '</div>' +
      '<div class="card-title" style="margin:2px 0 3px;">' + escapeHtml(it.title) + '</div>' +
      '<div class="card-desc">' + escapeHtml(it.desc) + '</div></div>';
  }
  function featItem(it) {
    return '<div class="card" style="display:flex;gap:8px;align-items:flex-start;">' +
      '<div class="icon-circle">&#10003;</div>' +
      '<div><div class="card-title" style="margin:0;">' + escapeHtml(it.title) + '</div>' +
      '<div class="card-desc">' + escapeHtml(it.desc) + '</div></div></div>';
  }
  function benefitCard(it, s, f) {
    const desc = it.desc.indexOf('{') >= 0 ? fillTemplate(it.desc, s, f) : it.desc;
    return '<div class="card"><div class="card-title" style="margin-top:0;">' + escapeHtml(it.title) +
      '</div><div class="card-desc">' + escapeHtml(desc) + '</div></div>';
  }
  function specCard(it) {
    return '<div class="card" style="text-align:center;">' +
      '<div class="card-title" style="margin-top:0;font-size:10.5px;">' + escapeHtml(it.title) + '</div>' +
      '<div class="card-desc">' + escapeHtml(it.desc) + '</div></div>';
  }
  function delivCard(it) {
    return '<div class="deliv-box"><div class="icon-circle">&#9881;</div>' +
      '<div class="card-title">' + escapeHtml(it.title) + '</div></div>';
  }
  function respItem(it) {
    return '<div class="resp-item"><div class="icon-circle">&#127968;</div>' +
      '<div><div class="rt">' + escapeHtml(it.title) + '</div>' +
      '<div class="rd">' + escapeHtml(it.desc) + '</div></div></div>';
  }
  function addlItem(it) {
    return '<div class="addl-box"><div class="card-title" style="margin:0 0 2px;font-size:10px;">' +
      escapeHtml(it.title) + '</div><div class="card-desc">' + escapeHtml(it.desc) + '</div></div>';
  }
  function diffCard(it) {
    return '<div class="card"><div class="card-title" style="margin-top:0;">' + escapeHtml(it.title) +
      '</div><div class="card-desc">' + escapeHtml(it.desc) + '</div></div>';
  }
  function checkItem(it) {
    return '<div class="card check-card"><div class="icon-circle">&#10003;</div>' +
      '<div><div class="card-title" style="margin-top:0;">' + escapeHtml(it.title) + '</div>' +
      '<div class="card-desc">' + escapeHtml(it.desc) + '</div></div></div>';
  }
  function commitCard(it) {
    return '<div class="card" style="text-align:center;padding:8px 6px;">' +
      '<div class="card-title" style="margin-top:0;font-size:9.5px;">' + escapeHtml(it.title) + '</div>' +
      '<div class="card-desc" style="font-size:8.4px;">' + escapeHtml(it.desc) + '</div></div>';
  }
  function warrCard(it) {
    return '<div class="card warr-card"><div class="card-title" style="margin-top:0;">' +
      escapeHtml(it.title) + '</div><ul>' +
      (it.b1 ? '<li>' + escapeHtml(it.b1) + '</li>' : '') +
      (it.b2 ? '<li>' + escapeHtml(it.b2) + '</li>' : '') + '</ul></div>';
  }
  function journeyCard(it, idx) {
    return '<div class="card journey-card"><div class="journey-num">' + (idx + 1) + '</div>' +
      '<div class="card-title" style="margin-top:0;">' + escapeHtml(it.title) + '</div><ul>' +
      (it.b1 ? '<li>' + escapeHtml(it.b1) + '</li>' : '') +
      (it.b2 ? '<li>' + escapeHtml(it.b2) + '</li>' : '') +
      (it.b3 ? '<li>' + escapeHtml(it.b3) + '</li>' : '') + '</ul></div>';
  }
  function readyItem(it) {
    return '<div class="contact-item"><div class="icon-circle">&#9733;</div>' +
      '<div><div class="rt">' + escapeHtml(it.title) + '</div>' +
      '<div class="rd">' + escapeHtml(it.desc) + '</div></div></div>';
  }
  function projCard(p) {
    const src = PROJECT_IMAGES[p.img] || '';
    return '<div class="proj-card"><img src="' + src + '" alt="' + escapeHtml(p.name) + '">' +
      '<div class="pc-body"><div class="pc-name">' + escapeHtml(p.name) + '</div>' +
      '<div class="pc-loc">&#128205; ' + escapeHtml(p.location) + '</div>' +
      '<div class="pc-cap">&#9889; ' + escapeHtml(p.capacity) + '</div></div></div>';
  }

  /* ---------------- 5. Page render functions ---------------- */
  function renderPage1() {
    $('pv_p1_eyebrow').textContent = CONTENT.page1.eyebrow;
    $('pv_p1_heading').innerHTML = escapeHtml(CONTENT.page1.heading1) + '<br>' + escapeHtml(CONTENT.page1.heading2);
    $('pv_p1_para1').textContent = CONTENT.page1.para1;
    $('pv_p1_para2').textContent = CONTENT.page1.para2;
    $('pv_p1_para3').textContent = CONTENT.page1.para3;
    $('pv_p1_sectionLabel').textContent = CONTENT.page1.sectionLabel;
    $('pv_p1_stats').innerHTML = CONTENT.page1.stats.map(statCard).join('');
    $('pv_p1_features').innerHTML = CONTENT.page1.features.map(featItem).join('');
  }

  function renderPage3(s, f) {
    $('pv_p3_heading').textContent = CONTENT.page3.heading;
    $('pv_p3_sub').textContent = CONTENT.page3.sub;
    $('pv_p3_para').textContent = CONTENT.page3.para;
    $('pv_p3_benefits').innerHTML = CONTENT.page3.benefits.map((b) => benefitCard(b, s, f)).join('');
    $('pv_p3_highlight').textContent = fillTemplate(CONTENT.page3.highlight, s, f);
    $('v_p3_annualGen').textContent = fmtNum(f.annualGen) + ' kWh';
    $('v_p3_annualSaving').textContent = fmtINR(f.annualSaving);
    $('v_p3_lifetimeSaving').textContent = fmtINR(f.lifetimeSaving);
  }

  function renderPage4(s) {
    $('pv_p4_heading').textContent = CONTENT.page4.heading;
    $('pv_p4_sub').textContent = CONTENT.page4.sub;
    $('pv_p4_para').textContent = CONTENT.page4.para;
    const dynCards = [
      { title: s.capacity + ' kWp', desc: 'System Capacity' },
      { title: '~' + fmtNum(s.capacity * s.genFactor) + ' kWh', desc: 'Estimated Annual Energy Generation' }
    ];
    $('pv_p4_specs').innerHTML = dynCards.concat(CONTENT.page4.specs).map(specCard).join('');
    $('pv_p4_includedLabel').textContent = CONTENT.page4.includedLabel;
    const modeMap = {
      module: s.moduleMake + ' make.',
      inverter: s.inverterMake + ' make.',
      mount: s.mountMake + '.',
      cable: s.cableMake + '.'
    };
    $('pv_p4_included').innerHTML = CONTENT.page4.included.map((it) => {
      const desc = it.mode ? modeMap[it.mode] : it.desc;
      return specCard({ title: it.title, desc: desc });
    }).join('');
  }

  function renderPage5() {
    $('pv_p5_heading').textContent = CONTENT.page5.heading;
    $('pv_p5_sub').textContent = CONTENT.page5.sub;
    $('pv_p5_para').textContent = CONTENT.page5.para;
    $('pv_p5_delivLabel').textContent = CONTENT.page5.delivLabel;
    $('pv_p5_deliverables').innerHTML = CONTENT.page5.deliverables.map(delivCard).join('');
    $('pv_p5_respLabel').textContent = CONTENT.page5.respLabel;
    $('pv_p5_resp').innerHTML = CONTENT.page5.resp.map(respItem).join('');
    $('pv_p5_addlLabel').textContent = CONTENT.page5.addlLabel;
    $('pv_p5_addl').innerHTML = CONTENT.page5.addl.map(addlItem).join('');
    $('pv_p5_closing').textContent = CONTENT.page5.closing;
  }

  function renderPage6() {
    $('pv_p6_heading').textContent = CONTENT.page6.heading;
    $('pv_p6_sub').textContent = CONTENT.page6.sub;
    $('pv_p6_para').textContent = CONTENT.page6.para;
    $('pv_p6_standardsLabel').textContent = CONTENT.page6.standardsLabel;
    $('pv_p6_standards').innerHTML = CONTENT.page6.standards.map(diffCard).join('');
    $('pv_p6_checklistLabel').textContent = CONTENT.page6.checklistLabel;
    $('pv_p6_checklist').innerHTML = CONTENT.page6.checklist.map(checkItem).join('');
    $('pv_p6_promise').textContent = CONTENT.page6.promise;
  }

  function renderPage7() {
    $('pv_p8_heading').textContent = CONTENT.page7.heading;
    $('pv_p8_sub').textContent = CONTENT.page7.sub;
    $('pv_p8_para').textContent = CONTENT.page7.para;
    $('pv_p8_diffLabel').textContent = CONTENT.page7.diffLabel;
    $('pv_p8_differentiators').innerHTML = CONTENT.page7.differentiators.map(diffCard).join('');
    $('pv_p8_commitLabel').textContent = CONTENT.page7.commitLabel;
    $('pv_p8_commitments').innerHTML = CONTENT.page7.commitments.map(commitCard).join('');
  }

  function renderPage8() {
    $('pv_p9_heading').textContent = CONTENT.page8.heading;
    $('pv_p9_sub').textContent = CONTENT.page8.sub;
    $('pv_p9_warrLabel').textContent = CONTENT.page8.warrLabel;
    $('pv_p9_warranties').innerHTML = CONTENT.page8.warranties.map(warrCard).join('');
    $('pv_p9_journeyLabel').textContent = CONTENT.page8.journeyLabel;
    $('pv_p9_journey').innerHTML = CONTENT.page8.steps.map(journeyCard).join('');
    $('pv_p9_closing').textContent = CONTENT.page8.closing;
  }

  function renderPage9() {
    const catIcons = ['&#127981;', '&#127970;', '&#127968;']; // factory, office, home
    $('pv_p10_heading').textContent = CONTENT.page9.heading;
    $('pv_p10_sub').textContent = CONTENT.page9.sub;
    $('pv_p10_categories').innerHTML = CONTENT.page9.categories.map((cat, ci) => {
      return '<div class="proj-cat-label"><div class="icon-circle">' + catIcons[ci % catIcons.length] + '</div>' +
        '<div class="txt">' + escapeHtml(cat.label) + '</div></div>' +
        '<div class="proj-grid">' + cat.projects.map(projCard).join('') + '</div>';
    }).join('');
  }

  function renderPage10(s) {
    $('pv_p11_heading').textContent = CONTENT.page10.heading;
    $('pv_p11_sub').textContent = CONTENT.page10.sub;
    $('pv_p11_para').textContent = fillTemplate(CONTENT.page10.para, s, {});
    $('pv_p11_readyLabel').textContent = CONTENT.page10.readyLabel;
    $('pv_p11_ready').innerHTML = CONTENT.page10.ready.map(readyItem).join('');
    $('pv_p11_cta').textContent = CONTENT.page10.cta;
    $('v_p11_ctaPhone').textContent = s.companyPhone;
    $('pv_p11_disclaimer').textContent = fillTemplate(CONTENT.page10.disclaimer, s, {});
    $('v_p11_companyName').textContent = s.companyName +
      (s.companyName.match(/Pvt\.?\s*Ltd\.?/i) ? '' : ' Pvt. Ltd.');
    $('v_p11_companyTagline').textContent = s.companyTagline;
    $('v_p11_companyAddress').textContent = s.companyAddress;
    $('v_p11_companyPhone').textContent = s.companyPhone;
    $('v_p11_companyEmail').textContent = s.companyEmail;
    $('v_p11_companyWebsite').textContent = s.companyWebsite;
  }

  function renderCoverAndInvestment(s, f) {
    // Cover (page 2)
    $('v_custName').textContent = s.custName;
    $('v_custAddress').textContent = s.custAddress;
    $('v_capacity').textContent = s.capacity + ' kWp';
    $('v_propDate').textContent = fmtDate(s.propDate) || '—';
    $('v_propRef').textContent = s.propRef;
    $('v_statYears').textContent = s.statYears;
    $('v_statProjects').textContent = s.statProjects;
    $('v_statCapacity').textContent = s.statCapacity;

    // Investment (page 6)
    $('v_desc').textContent = 'A professionally engineered ' + s.capacity +
      ' kWp rooftop solar system is one of the highest returning investments available to a homeowner today — delivering guaranteed energy savings, government subsidies and inflation-proof returns for over 25 years.';
    $('v_footerAddress').textContent = s.companyAddress;
    $('v_footerContact').innerHTML = s.companyEmail + ' &nbsp;|&nbsp; ' + s.companyWebsite;
    $('v_projectCost').textContent = fmtINR(f.projectCost);
    $('v_gstLine').textContent = '+ ' + fmtINR(f.gstAmount) + ' GST (' + s.gstPercent + '%)';
    $('v_subsidy').textContent = fmtINR(f.subsidy);
    $('v_totalCost').textContent = fmtINR(f.totalCost);
    $('v_netInvestment').textContent = fmtINR(f.netInvestment);

    $('v_annualGen').textContent = fmtNum(f.annualGen) + ' kWh';
    $('v_annualSaving').textContent = fmtINR(f.annualSaving);
    $('v_payback').textContent = f.payback.toFixed(1) + ' Years';
    $('v_lifetimeSaving').textContent = fmtINR(f.lifetimeSaving);
    $('v_irr').textContent = f.irr.toFixed(0) + '%';
    $('v_co2trees').textContent = fmtNum(f.co2TonnesLifetime) + ' T / ' + fmtNum(f.treesEquivalent) + '+';

    $('v_payAdvanceVal').textContent = s.payAdvance + '%';
    $('v_payDispatchVal').textContent = s.payDispatch + '%';
    $('v_payCompletionVal').textContent = s.payCompletion + '%';

    $('v_specCapacity').textContent = s.capacity + ' kWp';
    $('v_specModule').textContent = s.moduleMake;
    $('v_specInverter').textContent = s.inverterMake;
    $('v_specMount').textContent = s.mountMake;
    $('v_specCable').textContent = s.cableMake;

    $('v_disclaimer').textContent = 'Figures above are engineering estimates based on standard generation, tariff and subsidy assumptions entered for this proposal. Actual generation, savings, payback and returns depend on site conditions, shading, sanctioned load, DISCOM tariff and government policy applicable at the time of installation. Government subsidy shown per PM Surya Ghar Yojana slabs prevailing at proposal date — subject to change.';
  }

  /** Footer strips on every content page share one tagline + live contact. */
  function renderFooterStrips(s) {
    const tagline = CONTENT.shared.footerTagline;
    const contact = s.companyWebsite + ' &nbsp;|&nbsp; ' + s.companyPhone;
    ['p1', 'p3', 'p4', 'p5', 'p6', 'p8', 'p9', 'p10', 'p11'].forEach((pg) => {
      const t = $('v_' + pg + '_footerTagline');
      const c = $('v_' + pg + '_footerContact');
      if (t) t.innerHTML = tagline;
      if (c) c.innerHTML = contact;
    });
  }

  function renderAll() {
    const s = readMain();
    const f = computeFinancials(s);
    renderFooterStrips(s);
    renderPage1();
    renderPage3(s, f);
    renderPage4(s);
    renderPage5();
    renderPage6();
    renderCoverAndInvestment(s, f);
    renderPage7();
    renderPage8();
    renderPage9();
    renderPage10(s);
  }

  /* ---------------- 6. Advanced editor ---------------- */
  function mkField(container, label, value, onChange, multiline) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('label');
    lab.textContent = label;
    wrap.appendChild(lab);
    const inp = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) inp.type = 'text'; else inp.rows = 2;
    inp.value = value;
    inp.addEventListener('input', () => { onChange(inp.value); renderAll(); });
    wrap.appendChild(inp);
    container.appendChild(wrap);
  }
  function mkGroup(parent, title) {
    const d = document.createElement('details');
    d.className = 'page-group';
    const s = document.createElement('summary');
    s.textContent = title;
    d.appendChild(s);
    parent.appendChild(d);
    return d;
  }
  function mkItemBlock(container, label) {
    const b = document.createElement('div');
    b.className = 'item-block';
    const t = document.createElement('div');
    t.className = 'item-title';
    t.textContent = label;
    b.appendChild(t);
    container.appendChild(b);
    return b;
  }
  /** One-line editor for static labels that live directly in the markup. */
  function mkDomField(group, label, id, multiline) {
    mkField(group, label, $(id).textContent, (v) => { $(id).textContent = v; }, multiline);
  }

  function buildAdvancedEditor() {
    const root = $('advContainer');
    root.innerHTML = '';

    // Shared elements
    let g = mkGroup(root, 'Shared — All Pages');
    mkField(g, 'Footer strip tagline (applies to every page)', CONTENT.shared.footerTagline,
      (v) => { CONTENT.shared.footerTagline = v; }, true);

    // Page 1
    g = mkGroup(root, 'Page 1 — About KTM');
    mkField(g, 'Eyebrow tag', CONTENT.page1.eyebrow, (v) => { CONTENT.page1.eyebrow = v; });
    mkField(g, 'Heading — line 1', CONTENT.page1.heading1, (v) => { CONTENT.page1.heading1 = v; });
    mkField(g, 'Heading — line 2', CONTENT.page1.heading2, (v) => { CONTENT.page1.heading2 = v; });
    mkField(g, 'Paragraph 1', CONTENT.page1.para1, (v) => { CONTENT.page1.para1 = v; }, true);
    mkField(g, 'Paragraph 2', CONTENT.page1.para2, (v) => { CONTENT.page1.para2 = v; }, true);
    mkField(g, 'Paragraph 3', CONTENT.page1.para3, (v) => { CONTENT.page1.para3 = v; }, true);
    CONTENT.page1.stats.forEach((it, i) => {
      const b = mkItemBlock(g, 'Stat card ' + (i + 1));
      mkField(b, 'Value', it.value, (v) => { it.value = v; });
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; });
    });
    mkField(g, 'Section label', CONTENT.page1.sectionLabel, (v) => { CONTENT.page1.sectionLabel = v; });
    CONTENT.page1.features.forEach((it, i) => {
      const b = mkItemBlock(g, 'Feature ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; });
    });

    // Page 2 (cover) — text pieces not already in the main form
    g = mkGroup(root, 'Page 2 — Cover');
    mkDomField(g, 'Eyebrow (e.g. RESIDENTIAL)', 'v_eyebrow');
    mkDomField(g, 'Title — line 1', 'v_titleLine1');
    mkDomField(g, 'Title — line 2 (accent colour)', 'v_titleLine2');
    mkDomField(g, '"Prepared For" label', 'v_labelPreparedFor');
    mkDomField(g, '"Project Capacity" label', 'v_labelCapacityLabel');
    mkDomField(g, '"Proposal Date" label', 'v_labelDateLabel');
    mkDomField(g, '"Proposal Reference" label', 'v_labelRefLabel');
    mkDomField(g, 'Footer stat 1 caption', 'v_statYearsLabel');
    mkDomField(g, 'Footer stat 2 caption', 'v_statProjectsLabel');
    mkDomField(g, 'Footer stat 3 caption', 'v_statCapacityLabel');
    mkDomField(g, 'Footer stat 4 caption', 'v_footerStat4Label', true);

    // Page 3
    g = mkGroup(root, 'Page 3 — Why Rooftop Solar');
    mkField(g, 'Heading', CONTENT.page3.heading, (v) => { CONTENT.page3.heading = v; });
    mkField(g, 'Subheading', CONTENT.page3.sub, (v) => { CONTENT.page3.sub = v; });
    mkField(g, 'Paragraph', CONTENT.page3.para, (v) => { CONTENT.page3.para = v; }, true);
    CONTENT.page3.benefits.forEach((it, i) => {
      const b = mkItemBlock(g, 'Benefit ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description (supports {capacity} {co2Annual} {treesAnnual})', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Highlight quote (supports {capacity} {annualGen})', CONTENT.page3.highlight,
      (v) => { CONTENT.page3.highlight = v; }, true);

    // Page 4
    g = mkGroup(root, 'Page 4 — Proposed Solution');
    mkField(g, 'Heading', CONTENT.page4.heading, (v) => { CONTENT.page4.heading = v; });
    mkField(g, 'Subheading', CONTENT.page4.sub, (v) => { CONTENT.page4.sub = v; });
    mkField(g, 'Paragraph', CONTENT.page4.para, (v) => { CONTENT.page4.para = v; }, true);
    CONTENT.page4.specs.forEach((it, i) => {
      const b = mkItemBlock(g, 'Spec card ' + (i + 3) + ' (of 8 — first 2 are capacity & generation, always automatic)');
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; });
    });
    mkField(g, '"What\'s Included" section label', CONTENT.page4.includedLabel,
      (v) => { CONTENT.page4.includedLabel = v; });
    CONTENT.page4.included.forEach((it, i) => {
      const b = mkItemBlock(g, 'Included item ' + (i + 1) +
        (it.mode ? ' (description follows the ' + it.mode + ' selection above)' : ''));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      if (!it.mode) mkField(b, 'Description', it.desc, (v) => { it.desc = v; });
    });

    // Page 5
    g = mkGroup(root, 'Page 5 — EPC Scope');
    mkField(g, 'Heading', CONTENT.page5.heading, (v) => { CONTENT.page5.heading = v; });
    mkField(g, 'Subheading', CONTENT.page5.sub, (v) => { CONTENT.page5.sub = v; });
    mkField(g, 'Paragraph', CONTENT.page5.para, (v) => { CONTENT.page5.para = v; }, true);
    mkField(g, 'Deliverables section label', CONTENT.page5.delivLabel, (v) => { CONTENT.page5.delivLabel = v; });
    CONTENT.page5.deliverables.forEach((it, i) => {
      const b = mkItemBlock(g, 'Deliverable ' + (i + 1));
      mkField(b, 'Text', it.title, (v) => { it.title = v; }, true);
    });
    mkField(g, 'Client responsibilities section label', CONTENT.page5.respLabel,
      (v) => { CONTENT.page5.respLabel = v; });
    CONTENT.page5.resp.forEach((it, i) => {
      const b = mkItemBlock(g, 'Responsibility ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Additional scope section label', CONTENT.page5.addlLabel, (v) => { CONTENT.page5.addlLabel = v; });
    CONTENT.page5.addl.forEach((it, i) => {
      const b = mkItemBlock(g, 'Additional scope item ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Closing note', CONTENT.page5.closing, (v) => { CONTENT.page5.closing = v; }, true);

    // Page 6
    g = mkGroup(root, 'Page 6 — Installation Quality');
    mkField(g, 'Heading', CONTENT.page6.heading, (v) => { CONTENT.page6.heading = v; });
    mkField(g, 'Subheading', CONTENT.page6.sub, (v) => { CONTENT.page6.sub = v; });
    mkField(g, 'Paragraph', CONTENT.page6.para, (v) => { CONTENT.page6.para = v; }, true);
    mkField(g, 'Standards section label', CONTENT.page6.standardsLabel, (v) => { CONTENT.page6.standardsLabel = v; });
    CONTENT.page6.standards.forEach((it, i) => {
      const b = mkItemBlock(g, 'Standard ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Checklist section label', CONTENT.page6.checklistLabel, (v) => { CONTENT.page6.checklistLabel = v; });
    CONTENT.page6.checklist.forEach((it, i) => {
      const b = mkItemBlock(g, 'Checklist point ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Workmanship promise note', CONTENT.page6.promise, (v) => { CONTENT.page6.promise = v; }, true);
    // Page 6 photo upload
    {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const lab = document.createElement('label');
      lab.textContent = 'Page 6 photo (optional upload)';
      wrap.appendChild(lab);
      const fileInp = document.createElement('input');
      fileInp.type = 'file';
      fileInp.accept = 'image/*';
      fileInp.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) { $('img_p6').src = ev.target.result; };
        reader.readAsDataURL(file);
      });
      wrap.appendChild(fileInp);
      g.appendChild(wrap);
    }

    // Page 7 (investment) — labels not already covered by the main form
    g = mkGroup(root, 'Page 7 — Investment');
    mkDomField(g, 'Heading', 'v_p7Heading');
    mkDomField(g, 'Subheading', 'v_p7Subheading');
    [
      ['v_labelProjectCost', '"Project Cost" label'],
      ['v_labelSubsidy', '"Government Subsidy" label'],
      ['v_captionSubsidy', 'Subsidy caption'],
      ['v_labelTotalCost', '"Total Project Cost" label'],
      ['v_captionTotalCost', 'Total cost caption'],
      ['v_labelNetInvestment', '"Net Investment" label'],
      ['v_captionNetInvestment', 'Net investment caption'],
      ['v_sectionFinancial', '"Financial Snapshot" label'],
      ['v_labelFinAnnualGen', 'Annual generation caption'],
      ['v_labelFinAnnualSaving', 'Annual saving caption'],
      ['v_labelFinPayback', 'Payback caption'],
      ['v_labelFinLifetime', 'Lifetime savings caption'],
      ['v_labelFinIRR', 'IRR caption'],
      ['v_labelFinCO2Trees', 'CO₂/Trees caption'],
      ['v_sectionPayment', '"Payment Terms" label'],
      ['v_labelPayAdvance', 'Advance payment caption'],
      ['v_labelPayDispatch', 'Dispatch payment caption'],
      ['v_labelPayCompletion', 'Completion payment caption'],
      ['v_sectionSpecs', '"System Specification" label'],
      ['v_labelSpecCapacity', 'Capacity row label'],
      ['v_labelSpecModule', 'Modules row label'],
      ['v_labelSpecInverter', 'Inverter row label'],
      ['v_labelSpecMount', 'Mounting row label'],
      ['v_labelSpecCable', 'Cabling row label'],
      ['v_labelSpecWarranty', 'Warranty row label'],
      ['v_specWarrantyValue', 'Warranty value text']
    ].forEach(([id, label]) => mkDomField(g, label, id));

    // Page 7
    g = mkGroup(root, 'Page 8 — Why Choose KTM');
    mkField(g, 'Heading', CONTENT.page7.heading, (v) => { CONTENT.page7.heading = v; });
    mkField(g, 'Subheading', CONTENT.page7.sub, (v) => { CONTENT.page7.sub = v; });
    mkField(g, 'Paragraph', CONTENT.page7.para, (v) => { CONTENT.page7.para = v; }, true);
    mkField(g, 'Differentiators section label', CONTENT.page7.diffLabel, (v) => { CONTENT.page7.diffLabel = v; });
    CONTENT.page7.differentiators.forEach((it, i) => {
      const b = mkItemBlock(g, 'Differentiator ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Commitments section label', CONTENT.page7.commitLabel, (v) => { CONTENT.page7.commitLabel = v; });
    CONTENT.page7.commitments.forEach((it, i) => {
      const b = mkItemBlock(g, 'Commitment ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });

    // Page 8
    g = mkGroup(root, 'Page 9 — Warranty & Installation');
    mkField(g, 'Heading', CONTENT.page8.heading, (v) => { CONTENT.page8.heading = v; });
    mkField(g, 'Subheading', CONTENT.page8.sub, (v) => { CONTENT.page8.sub = v; });
    mkField(g, 'Warranty section label', CONTENT.page8.warrLabel, (v) => { CONTENT.page8.warrLabel = v; });
    CONTENT.page8.warranties.forEach((it, i) => {
      const b = mkItemBlock(g, 'Warranty card ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Bullet 1', it.b1, (v) => { it.b1 = v; });
      mkField(b, 'Bullet 2', it.b2, (v) => { it.b2 = v; });
    });
    mkField(g, 'Installation journey section label', CONTENT.page8.journeyLabel,
      (v) => { CONTENT.page8.journeyLabel = v; });
    CONTENT.page8.steps.forEach((it, i) => {
      const b = mkItemBlock(g, 'Journey step ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Bullet 1', it.b1, (v) => { it.b1 = v; });
      mkField(b, 'Bullet 2', it.b2, (v) => { it.b2 = v; });
      mkField(b, 'Bullet 3', it.b3, (v) => { it.b3 = v; });
    });
    mkField(g, 'Closing note', CONTENT.page8.closing, (v) => { CONTENT.page8.closing = v; }, true);

    // Page 9
    g = mkGroup(root, 'Page 10 — Projects Portfolio');
    mkField(g, 'Heading', CONTENT.page9.heading, (v) => { CONTENT.page9.heading = v; });
    mkField(g, 'Subheading', CONTENT.page9.sub, (v) => { CONTENT.page9.sub = v; }, true);
    CONTENT.page9.categories.forEach((cat, ci) => {
      const cg = mkGroup(g, 'Category ' + (ci + 1) + ': ' + cat.label);
      mkField(cg, 'Category label', cat.label, (v) => { cat.label = v; });
      cat.projects.forEach((p, pi) => {
        const b = mkItemBlock(cg, 'Project ' + (pi + 1));
        mkField(b, 'Name', p.name, (v) => { p.name = v; });
        mkField(b, 'Location', p.location, (v) => { p.location = v; });
        mkField(b, 'Capacity', p.capacity, (v) => { p.capacity = v; });
        const wrap = document.createElement('div');
        wrap.className = 'field';
        const lab = document.createElement('label');
        lab.textContent = 'Photo (optional upload)';
        wrap.appendChild(lab);
        const fileInp = document.createElement('input');
        fileInp.type = 'file';
        fileInp.accept = 'image/*';
        fileInp.addEventListener('change', function (e) {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = function (ev) { PROJECT_IMAGES[p.img] = ev.target.result; renderAll(); };
          reader.readAsDataURL(file);
        });
        wrap.appendChild(fileInp);
        b.appendChild(wrap);
      });
    });

    // Page 10
    g = mkGroup(root, 'Page 11 — Contact / Closing');
    mkField(g, 'Heading', CONTENT.page10.heading, (v) => { CONTENT.page10.heading = v; });
    mkField(g, 'Subheading', CONTENT.page10.sub, (v) => { CONTENT.page10.sub = v; });
    mkField(g, 'Thank-you paragraph (use {company} for dynamic company name)', CONTENT.page10.para,
      (v) => { CONTENT.page10.para = v; }, true);
    mkDomField(g, '"Get in Touch" section label', 'pv_p11_contactLabel');
    mkField(g, '"Ready to Go Solar" section label', CONTENT.page10.readyLabel,
      (v) => { CONTENT.page10.readyLabel = v; });
    CONTENT.page10.ready.forEach((it, i) => {
      const b = mkItemBlock(g, 'Ready item ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; });
    });
    mkField(g, 'Call-to-action text (phone number is added automatically)', CONTENT.page10.cta,
      (v) => { CONTENT.page10.cta = v; });
    mkField(g, 'Disclaimer text (use {company})', CONTENT.page10.disclaimer,
      (v) => { CONTENT.page10.disclaimer = v; }, true);
  }

  /* ---------------- 7. Event wiring ---------------- */
  function wireEvents() {
    // Logo upload — replaces the logo on the form and every page
    $('logoUpload').addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function (ev) {
        document.querySelectorAll('#formLogo, #previewLogo, .pg-logo img').forEach((img) => {
          img.src = ev.target.result;
        });
      };
      reader.readAsDataURL(file);
    });

    // Per-page photo uploads
    ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p8', 'p9', 'p10', 'p11'].forEach((key) => {
      const input = $('up_' + key);
      if (!input) return;
      input.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
          const img = $('img_' + key);
          if (img) img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    });

    // Re-render on any main-form change
    document.querySelectorAll('.form-panel > fieldset input, .form-panel > fieldset select')
      .forEach((el) => {
        el.addEventListener('input', renderAll);
        el.addEventListener('change', renderAll);
      });
  }

  /* ---------------- 8. PDF export (all 11 pages) ---------------- */
  function wireExport() {
    $('downloadBtn').addEventListener('click', async function () {
      const btn = this, status = $('statusMsg');
      btn.disabled = true;
      try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageIds = ['page1', 'page2', 'page3', 'page4', 'page5', 'page6', 'page7', 'page8', 'page9', 'page10', 'page11'];
        for (let i = 0; i < pageIds.length; i++) {
          status.textContent = 'Rendering page ' + (i + 1) + ' of ' + pageIds.length + '…';
          const canvas = await html2canvas($(pageIds[i]), { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
          const imgData = canvas.toDataURL('image/jpeg', 0.92);
          const pageW = pdf.internal.pageSize.getWidth();
          const pageH = pdf.internal.pageSize.getHeight();
          if (i > 0) pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
        }
        const s = readMain();
        const filename = 'KTM_Quotation_' + (s.custName || 'Customer').replace(/[^a-z0-9]+/gi, '_') +
          '_' + s.capacity + 'kWp.pdf';
        pdf.save(filename);
        status.textContent = 'Downloaded ✓ (11 pages)';
      } catch (err) {
        console.error(err);
        status.textContent = 'Something went wrong — please try again.';
      } finally {
        btn.disabled = false;
        setTimeout(() => { status.textContent = ''; }, 5000);
      }
    });
  }

  /* ---------------- init ---------------- */
  $('propDate').value = new Date().toISOString().slice(0, 10);
  wireEvents();
  buildAdvancedEditor();
  renderAll();
  wireExport();
})();
