/* ==========================================================================
   Quotation Studio — Advanced Edit Panel
   --------------------------------------------------------------------------
   Auto-generated editor for every line of brochure text in CONTENT.
   Writes back into the CONTENT object live; the main render loop picks up
   changes instantly. StateStore persists edits alongside the form.
   ========================================================================== */
'use strict';

(function (root) {
  const $ = (id) => document.getElementById(id);

  function mkField(container, label, value, onChange, multiline) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = document.createElement('label');
    lab.textContent = label;
    wrap.appendChild(lab);
    const inp = document.createElement(multiline ? 'textarea' : 'input');
    if (!multiline) inp.type = 'text'; else inp.rows = 2;
    inp.value = value === undefined || value === null ? '' : value;
    inp.addEventListener('input', () => {
      onChange(inp.value);
      root.Render.renderAll();
      if (root.__qsScheduleSave) root.__qsScheduleSave();
    });
    wrap.appendChild(inp);
    container.appendChild(wrap);
    return inp;
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
  /** Editor for a static DOM label that is not part of CONTENT. */
  function mkDomField(group, label, id, multiline) {
    const el = $(id);
    if (!el) return;
    mkField(group, label, el.textContent, (v) => { el.textContent = v; }, multiline);
  }
  const S = (obj, key) => [(v) => { obj[key] = v; }, obj[key]];

  function build() {
    const rootEl = $('advContainer');
    rootEl.innerHTML = '';
    let g;

    /* ---------- shared ---------- */
    g = mkGroup(rootEl, 'Shared — All Pages');
    mkField(g, 'Footer tagline (centre of every page footer)', CONTENT.shared.footerTagline, (v) => { CONTENT.shared.footerTagline = v; }, true);
    mkField(g, 'Warranty headline (used on Summary + Tech Spec)', CONTENT.shared.warrantyLine, (v) => { CONTENT.shared.warrantyLine = v; });

    /* ---------- cover ---------- */
    g = mkGroup(rootEl, 'Cover');
    mkField(g, 'Eyebrow — Residential', CONTENT.cover.eyebrowByType.residential, (v) => { CONTENT.cover.eyebrowByType.residential = v; });
    mkField(g, 'Eyebrow — Commercial', CONTENT.cover.eyebrowByType.commercial, (v) => { CONTENT.cover.eyebrowByType.commercial = v; });
    mkField(g, 'Eyebrow — Industrial', CONTENT.cover.eyebrowByType.industrial, (v) => { CONTENT.cover.eyebrowByType.industrial = v; });
    mkField(g, 'Title — line 1', CONTENT.cover.titleLine1, (v) => { CONTENT.cover.titleLine1 = v; });
    mkField(g, 'Title — line 2 (accent colour)', CONTENT.cover.titleLine2, (v) => { CONTENT.cover.titleLine2 = v; });
    mkField(g, 'Footer stat 4 caption', CONTENT.cover.footerStat4, (v) => { CONTENT.cover.footerStat4 = v; }, true);
    ['preparedFor', 'capacity', 'date', 'validTill', 'reference', 'preparedBy', 'version'].forEach((k) => {
      mkField(g, 'Label — ' + k, CONTENT.cover.labels[k], (v) => { CONTENT.cover.labels[k] = v; });
    });

    /* ---------- executive summary ---------- */
    g = mkGroup(rootEl, 'Executive Summary');
    mkField(g, 'Eyebrow', CONTENT.exec.eyebrow, (v) => { CONTENT.exec.eyebrow = v; });
    mkField(g, 'Heading', CONTENT.exec.heading, (v) => { CONTENT.exec.heading = v; });
    mkField(g, 'Subheading', CONTENT.exec.sub, (v) => { CONTENT.exec.sub = v; }, true);
    [['netInvestment', 'Net investment tile'], ['year1Saving', 'Year-1 saving tile'],
     ['payback', 'Payback tile'], ['lifetime', 'Lifetime tile']].forEach(([k, l]) => {
      mkField(g, l + ' — caption', CONTENT.exec.heroLabels[k], (v) => { CONTENT.exec.heroLabels[k] = v; });
    });
    mkField(g, 'KPI section label', CONTENT.exec.kpiSectionLabel, (v) => { CONTENT.exec.kpiSectionLabel = v; });
    Object.keys(CONTENT.exec.kpis).forEach((k) => {
      mkField(g, 'KPI caption — ' + k, CONTENT.exec.kpis[k], (v) => { CONTENT.exec.kpis[k] = v; });
    });
    mkField(g, 'Journey section label', CONTENT.exec.journeySectionLabel, (v) => { CONTENT.exec.journeySectionLabel = v; });
    mkField(g, 'Journey note (uses {payback})', CONTENT.exec.journeyNote, (v) => { CONTENT.exec.journeyNote = v; }, true);
    mkField(g, '"What you are getting" label', CONTENT.exec.includedSectionLabel, (v) => { CONTENT.exec.includedSectionLabel = v; });
    mkField(g, 'Included intro (uses {company})', CONTENT.exec.includedIntro, (v) => { CONTENT.exec.includedIntro = v; }, true);
    mkField(g, 'Effective-cost hint (uses {tariff})', CONTENT.exec.effectiveHint, (v) => { CONTENT.exec.effectiveHint = v; }, true);

    /* ---------- system options (optional page) ---------- */
    g = mkGroup(rootEl, 'System Options page (optional)');
    mkField(g, 'Heading', CONTENT.pageOptions.heading, (v) => { CONTENT.pageOptions.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageOptions.sub, (v) => { CONTENT.pageOptions.sub = v; });
    mkField(g, 'Intro', CONTENT.pageOptions.intro, (v) => { CONTENT.pageOptions.intro = v; }, true);
    [['invest', 'Net Investment'], ['annual', 'Year-1 Saving'], ['monthly', 'Saving / Month'],
     ['payback', 'Payback'], ['lifetime', '25-Yr Savings'], ['gen', 'Units / Year'],
     ['modules', 'Modules'], ['recommended', 'RECOMMENDED badge'],
     ['match', '"In this proposal" badge'], ['notSet', 'Not-configured text']].forEach(([k, l]) => {
      mkField(g, l + ' caption', CONTENT.pageOptions.chips[k], (v) => { CONTENT.pageOptions.chips[k] = v; });
    });
    mkField(g, 'Comparison section label', CONTENT.pageOptions.metricsLabel, (v) => { CONTENT.pageOptions.metricsLabel = v; });
    mkField(g, 'Chart title', CONTENT.pageOptions.chartTitle, (v) => { CONTENT.pageOptions.chartTitle = v; });
    mkField(g, 'Footnote (uses {genFactor} {tariff})', CONTENT.pageOptions.note, (v) => { CONTENT.pageOptions.note = v; }, true);

    /* ---------- about ---------- */
    g = mkGroup(rootEl, 'About');
    mkField(g, 'Eyebrow (uses {companyCaps})', CONTENT.pageAbout.eyebrow, (v) => { CONTENT.pageAbout.eyebrow = v; });
    mkField(g, 'Heading — line 1', CONTENT.pageAbout.heading1, (v) => { CONTENT.pageAbout.heading1 = v; });
    mkField(g, 'Heading — line 2', CONTENT.pageAbout.heading2, (v) => { CONTENT.pageAbout.heading2 = v; });
    [1, 2, 3].forEach((n) => {
      mkField(g, 'Paragraph ' + n, CONTENT.pageAbout['para' + n], (v) => { CONTENT.pageAbout['para' + n] = v; }, true);
    });
    mkField(g, 'Section label', CONTENT.pageAbout.sectionLabel, (v) => { CONTENT.pageAbout.sectionLabel = v; });
    CONTENT.pageAbout.stats.forEach((it, i) => {
      const b = mkItemBlock(g, 'Stat card ' + (i + 1));
      mkField(b, 'Value', it.value, (v) => { it.value = v; });
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; });
    });
    CONTENT.pageAbout.features.forEach((it, i) => {
      const b = mkItemBlock(g, 'Feature ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; });
    });

    /* ---------- why solar ---------- */
    g = mkGroup(rootEl, 'Why Rooftop Solar');
    mkField(g, 'Heading', CONTENT.pageWhySolar.heading, (v) => { CONTENT.pageWhySolar.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageWhySolar.sub, (v) => { CONTENT.pageWhySolar.sub = v; });
    mkField(g, 'Paragraph', CONTENT.pageWhySolar.para, (v) => { CONTENT.pageWhySolar.para = v; }, true);
    CONTENT.pageWhySolar.benefits.forEach((it, i) => {
      const b = mkItemBlock(g, 'Benefit ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description (supports {capacity} {co2Annual} {treesAnnual})', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Highlight quote (supports {capacity} {annualGen})', CONTENT.pageWhySolar.highlight, (v) => { CONTENT.pageWhySolar.highlight = v; }, true);

    /* ---------- solution ---------- */
    g = mkGroup(rootEl, 'Proposed Solution');
    mkField(g, 'Heading', CONTENT.pageSolution.heading, (v) => { CONTENT.pageSolution.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageSolution.sub, (v) => { CONTENT.pageSolution.sub = v; });
    mkField(g, 'Paragraph', CONTENT.pageSolution.para, (v) => { CONTENT.pageSolution.para = v; }, true);
    CONTENT.pageSolution.specs.forEach((it, i) => {
      const b = mkItemBlock(g, 'Spec card ' + (i + 4) + ' (first 3 — capacity, generation, modules — are automatic)');
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; });
    });
    mkField(g, '"What\'s Included" label', CONTENT.pageSolution.includedLabel, (v) => { CONTENT.pageSolution.includedLabel = v; });
    CONTENT.pageSolution.included.forEach((it, i) => {
      const b = mkItemBlock(g, 'Included item ' + (i + 1) + (it.mode ? ' (description follows the ' + it.mode + ' dropdown)' : ''));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      if (!it.mode) mkField(b, 'Description', it.desc, (v) => { it.desc = v; });
    });

    /* ---------- tech spec ---------- */
    g = mkGroup(rootEl, 'Technical Specification');
    mkField(g, 'Heading', CONTENT.pageTechSpec.heading, (v) => { CONTENT.pageTechSpec.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageTechSpec.sub, (v) => { CONTENT.pageTechSpec.sub = v; });
    mkField(g, 'Paragraph', CONTENT.pageTechSpec.para, (v) => { CONTENT.pageTechSpec.para = v; }, true);
    mkField(g, 'Diagram title', CONTENT.pageTechSpec.diagramTitle, (v) => { CONTENT.pageTechSpec.diagramTitle = v; });
    Object.keys(CONTENT.pageTechSpec.diagramLabels).forEach((k) => {
      mkField(g, 'Diagram — ' + k, CONTENT.pageTechSpec.diagramLabels[k], (v) => { CONTENT.pageTechSpec.diagramLabels[k] = v; });
    });
    mkField(g, 'Table section label', CONTENT.pageTechSpec.groupsLabel, (v) => { CONTENT.pageTechSpec.groupsLabel = v; });
    mkField(g, 'Note label', CONTENT.pageTechSpec.noteLabel, (v) => { CONTENT.pageTechSpec.noteLabel = v; });
    mkField(g, 'Note', CONTENT.pageTechSpec.note, (v) => { CONTENT.pageTechSpec.note = v; }, true);

    /* ---------- scope ---------- */
    g = mkGroup(rootEl, 'EPC Scope');
    mkField(g, 'Heading', CONTENT.pageScope.heading, (v) => { CONTENT.pageScope.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageScope.sub, (v) => { CONTENT.pageScope.sub = v; });
    mkField(g, 'Paragraph', CONTENT.pageScope.para, (v) => { CONTENT.pageScope.para = v; }, true);
    mkField(g, 'Deliverables label', CONTENT.pageScope.delivLabel, (v) => { CONTENT.pageScope.delivLabel = v; });
    CONTENT.pageScope.deliverables.forEach((it, i) => {
      mkField(g, 'Deliverable ' + (i + 1), it.title, (v) => { it.title = v; }, true);
    });
    mkField(g, 'Client responsibilities label', CONTENT.pageScope.respLabel, (v) => { CONTENT.pageScope.respLabel = v; });
    CONTENT.pageScope.resp.forEach((it, i) => {
      const b = mkItemBlock(g, 'Responsibility ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Additional scope label', CONTENT.pageScope.addlLabel, (v) => { CONTENT.pageScope.addlLabel = v; });
    CONTENT.pageScope.addl.forEach((it, i) => {
      const b = mkItemBlock(g, 'Additional item ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Closing note', CONTENT.pageScope.closing, (v) => { CONTENT.pageScope.closing = v; }, true);

    /* ---------- quality ---------- */
    g = mkGroup(rootEl, 'Installation Quality');
    mkField(g, 'Heading', CONTENT.pageQuality.heading, (v) => { CONTENT.pageQuality.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageQuality.sub, (v) => { CONTENT.pageQuality.sub = v; });
    mkField(g, 'Paragraph', CONTENT.pageQuality.para, (v) => { CONTENT.pageQuality.para = v; }, true);
    mkField(g, 'Standards label', CONTENT.pageQuality.standardsLabel, (v) => { CONTENT.pageQuality.standardsLabel = v; });
    CONTENT.pageQuality.standards.forEach((it, i) => {
      const b = mkItemBlock(g, 'Standard ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Checklist label', CONTENT.pageQuality.checklistLabel, (v) => { CONTENT.pageQuality.checklistLabel = v; });
    CONTENT.pageQuality.checklist.forEach((it, i) => {
      const b = mkItemBlock(g, 'Checklist item ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Workmanship promise', CONTENT.pageQuality.promise, (v) => { CONTENT.pageQuality.promise = v; }, true);

    /* ---------- savings ---------- */
    g = mkGroup(rootEl, 'Generation & Savings');
    mkField(g, 'Heading', CONTENT.pageSavings.heading, (v) => { CONTENT.pageSavings.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageSavings.sub, (v) => { CONTENT.pageSavings.sub = v; });
    mkField(g, 'Paragraph', CONTENT.pageSavings.para, (v) => { CONTENT.pageSavings.para = v; }, true);
    Object.keys(CONTENT.pageSavings.chips).forEach((k) => {
      mkField(g, 'KPI caption — ' + k, CONTENT.pageSavings.chips[k], (v) => { CONTENT.pageSavings.chips[k] = v; });
    });
    mkField(g, 'Chart 1 title', CONTENT.pageSavings.chartCumTitle, (v) => { CONTENT.pageSavings.chartCumTitle = v; });
    mkField(g, 'Chart 1 note (uses {payback})', CONTENT.pageSavings.chartCumNote, (v) => { CONTENT.pageSavings.chartCumNote = v; }, true);
    mkField(g, 'Chart 2 title', CONTENT.pageSavings.chartAnnualTitle, (v) => { CONTENT.pageSavings.chartAnnualTitle = v; });
    mkField(g, 'Chart 2 note (uses {escalation} {degradation})', CONTENT.pageSavings.chartAnnualNote, (v) => { CONTENT.pageSavings.chartAnnualNote = v; }, true);
    mkField(g, 'Table title', CONTENT.pageSavings.tableTitle, (v) => { CONTENT.pageSavings.tableTitle = v; });
    Object.keys(CONTENT.pageSavings.tableHeaders).forEach((k) => {
      mkField(g, 'Table header — ' + k, CONTENT.pageSavings.tableHeaders[k], (v) => { CONTENT.pageSavings.tableHeaders[k] = v; });
    });
    mkField(g, 'Assumptions label', CONTENT.pageSavings.assumptionsLabel, (v) => { CONTENT.pageSavings.assumptionsLabel = v; });
    mkField(g, 'Footnote', CONTENT.pageSavings.note, (v) => { CONTENT.pageSavings.note = v; }, true);

    /* ---------- investment ---------- */
    g = mkGroup(rootEl, 'Investment');
    mkField(g, 'Heading', CONTENT.pageInvestment.heading, (v) => { CONTENT.pageInvestment.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageInvestment.sub, (v) => { CONTENT.pageInvestment.sub = v; });
    mkField(g, 'Intro (uses {capacity})', CONTENT.pageInvestment.desc, (v) => { CONTENT.pageInvestment.desc = v; }, true);
    const IC = CONTENT.pageInvestment.cards;
    Object.keys(IC).forEach((k) => {
      mkField(g, 'Caption — ' + k, IC[k], (v) => { IC[k] = v; });
    });
    mkField(g, 'Rate chip label', CONTENT.pageInvestment.rateChip, (v) => { CONTENT.pageInvestment.rateChip = v; });
    mkField(g, 'Bridge chart title', CONTENT.pageInvestment.bridgeTitle, (v) => { CONTENT.pageInvestment.bridgeTitle = v; });
    mkField(g, 'BOM section title', CONTENT.pageInvestment.bomTitle, (v) => { CONTENT.pageInvestment.bomTitle = v; });
    mkField(g, 'BOM intro', CONTENT.pageInvestment.bomIntro, (v) => { CONTENT.pageInvestment.bomIntro = v; }, true);
    mkField(g, 'Payment label', CONTENT.pageInvestment.paymentLabel, (v) => { CONTENT.pageInvestment.paymentLabel = v; });
    mkField(g, 'Payment note', CONTENT.pageInvestment.paymentNote, (v) => { CONTENT.pageInvestment.paymentNote = v; }, true);
    mkField(g, 'Disclaimer', CONTENT.pageInvestment.disclaimer, (v) => { CONTENT.pageInvestment.disclaimer = v; }, true);

    /* ---------- why ktm ---------- */
    g = mkGroup(rootEl, 'Why Choose KTM');
    mkField(g, 'Heading', CONTENT.pageWhyKtm.heading, (v) => { CONTENT.pageWhyKtm.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageWhyKtm.sub, (v) => { CONTENT.pageWhyKtm.sub = v; });
    mkField(g, 'Paragraph', CONTENT.pageWhyKtm.para, (v) => { CONTENT.pageWhyKtm.para = v; }, true);
    mkField(g, 'Differentiators label', CONTENT.pageWhyKtm.diffLabel, (v) => { CONTENT.pageWhyKtm.diffLabel = v; });
    CONTENT.pageWhyKtm.differentiators.forEach((it, i) => {
      const b = mkItemBlock(g, 'Differentiator ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Commitments label', CONTENT.pageWhyKtm.commitLabel, (v) => { CONTENT.pageWhyKtm.commitLabel = v; });
    CONTENT.pageWhyKtm.commitments.forEach((it, i) => {
      const b = mkItemBlock(g, 'Commitment ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description', it.desc, (v) => { it.desc = v; }, true);
    });

    /* ---------- projects ---------- */
    g = mkGroup(rootEl, 'Projects Portfolio');
    mkField(g, 'Heading', CONTENT.pageProjects.heading, (v) => { CONTENT.pageProjects.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageProjects.sub, (v) => { CONTENT.pageProjects.sub = v; }, true);
    CONTENT.pageProjects.categories.forEach((cat, ci) => {
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
          reader.onload = function (ev) { PROJECT_IMAGES[p.img] = ev.target.result; root.Render.renderAll(); if (root.__qsScheduleSave) root.__qsScheduleSave(); };
          reader.readAsDataURL(file);
        });
        wrap.appendChild(fileInp);
        b.appendChild(wrap);
      });
    });

    /* ---------- warranty ---------- */
    g = mkGroup(rootEl, 'Warranty & Journey');
    mkField(g, 'Heading', CONTENT.pageWarranty.heading, (v) => { CONTENT.pageWarranty.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageWarranty.sub, (v) => { CONTENT.pageWarranty.sub = v; });
    mkField(g, 'Warranty label', CONTENT.pageWarranty.warrLabel, (v) => { CONTENT.pageWarranty.warrLabel = v; });
    CONTENT.pageWarranty.warranties.forEach((it, i) => {
      const b = mkItemBlock(g, 'Warranty card ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Bullet 1', it.b1, (v) => { it.b1 = v; });
      mkField(b, 'Bullet 2', it.b2, (v) => { it.b2 = v; });
    });
    mkField(g, 'Journey label', CONTENT.pageWarranty.journeyLabel, (v) => { CONTENT.pageWarranty.journeyLabel = v; });
    CONTENT.pageWarranty.steps.forEach((it, i) => {
      const b = mkItemBlock(g, 'Journey step ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Bullet 1', it.b1, (v) => { it.b1 = v; });
      mkField(b, 'Bullet 2', it.b2, (v) => { it.b2 = v; });
      mkField(b, 'Bullet 3', it.b3, (v) => { it.b3 = v; });
    });
    mkField(g, 'Closing note', CONTENT.pageWarranty.closing, (v) => { CONTENT.pageWarranty.closing = v; }, true);

    /* ---------- terms ---------- */
    g = mkGroup(rootEl, 'Terms & Conditions');
    mkField(g, 'Heading', CONTENT.pageTerms.heading, (v) => { CONTENT.pageTerms.heading = v; });
    mkField(g, 'Subheading', CONTENT.pageTerms.sub, (v) => { CONTENT.pageTerms.sub = v; });
    mkField(g, 'Intro', CONTENT.pageTerms.intro, (v) => { CONTENT.pageTerms.intro = v; }, true);
    mkField(g, 'Items label', CONTENT.pageTerms.itemsLabel, (v) => { CONTENT.pageTerms.itemsLabel = v; });
    CONTENT.pageTerms.items.forEach((it, i) => {
      const b = mkItemBlock(g, 'Term ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description (supports {validity} {duration} {jurisdiction} {company})', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'Note label', CONTENT.pageTerms.noteLabel, (v) => { CONTENT.pageTerms.noteLabel = v; });
    mkField(g, 'Note', CONTENT.pageTerms.note, (v) => { CONTENT.pageTerms.note = v; }, true);

    /* ---------- closing ---------- */
    g = mkGroup(rootEl, 'Acceptance & Contact');
    mkField(g, 'Banner heading', CONTENT.pageClosing.bannerHeading, (v) => { CONTENT.pageClosing.bannerHeading = v; });
    mkField(g, 'Banner subheading', CONTENT.pageClosing.bannerSub, (v) => { CONTENT.pageClosing.bannerSub = v; });
    mkField(g, 'Next steps label', CONTENT.pageClosing.nextLabel, (v) => { CONTENT.pageClosing.nextLabel = v; });
    CONTENT.pageClosing.next.forEach((it, i) => {
      const b = mkItemBlock(g, 'Next step ' + (i + 1));
      mkField(b, 'Title', it.title, (v) => { it.title = v; });
      mkField(b, 'Description (supports {surveyWindow})', it.desc, (v) => { it.desc = v; }, true);
    });
    mkField(g, 'CTA text', CONTENT.pageClosing.cta, (v) => { CONTENT.pageClosing.cta = v; });
    mkField(g, 'Acceptance label', CONTENT.pageClosing.acceptLabel, (v) => { CONTENT.pageClosing.acceptLabel = v; });
    mkField(g, 'Acceptance intro (uses {company})', CONTENT.pageClosing.acceptIntro, (v) => { CONTENT.pageClosing.acceptIntro = v; }, true);
    mkField(g, 'Customer signature caption', CONTENT.pageClosing.signCustomer, (v) => { CONTENT.pageClosing.signCustomer = v; });
    mkField(g, 'Company signature caption (uses {company})', CONTENT.pageClosing.signCompany, (v) => { CONTENT.pageClosing.signCompany = v; });
    mkField(g, 'Customer signature sub-caption', CONTENT.pageClosing.signCustomerSub, (v) => { CONTENT.pageClosing.signCustomerSub = v; });
    mkField(g, 'Company signature sub-caption', CONTENT.pageClosing.signCompanySub, (v) => { CONTENT.pageClosing.signCompanySub = v; });
    mkField(g, 'Disclaimer (uses {company})', CONTENT.pageClosing.disclaimer, (v) => { CONTENT.pageClosing.disclaimer = v; }, true);
  }

  root.Editor = { build };
})(typeof self !== 'undefined' ? self : this);
