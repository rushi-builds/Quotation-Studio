/* Builder-only workspace. Move existing controls; never clone inputs or own
   quotation values. Finance, Render and Proposals remain the sources of truth. */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
  function boot() {
    const form = $('quoteForm'), panel = document.querySelector('.form-panel');
    if (!form || panel.classList.contains('studio-ready')) return;
    panel.classList.add('studio-ready');

    const overview = element('section', 'studio-overview');
    overview.setAttribute('aria-label', 'Live quotation summary');
    overview.innerHTML = '<div class="studio-overview-top"><span><i></i> LIVE QUOTATION</span><span class="studio-page-count"></span></div><div class="studio-metrics"><div><small>System capacity</small><strong data-metric="capacity"></strong></div><div><small>Net investment</small><strong data-metric="investment"></strong></div><div><small>Year-one energy</small><strong data-metric="energy"></strong></div></div>';
    const overviewBar = element('div', 'studio-overview-bar');
    overviewBar.append(overview);
    panel.insertBefore(overviewBar, form);

    const mode = $('formMode');
    panel.insertBefore(mode, form);
    mode.setAttribute('role', 'group'); mode.setAttribute('aria-label', 'Control detail level');
    const presets = element('details', 'studio-presets');
    presets.append(element('summary', '', 'Start from a preset'));
    presets.append(mode.querySelector('.quick-presets-bar'));
    form.prepend(presets);

    const search = element('div', 'studio-search');
    search.innerHTML = '<label for="studioSearch">Find a setting</label><div class="studio-search-box"><span aria-hidden="true">⌕</span><input id="studioSearch" type="search" placeholder="Search customer, inverter, QR…" autocomplete="off" aria-controls="studioSearchResults"><button type="button" aria-label="Clear search" hidden>×</button></div><div id="studioSearchResults" hidden><p role="status"></p><ul></ul></div>';
    panel.insertBefore(search, form);

    // Keep proposal selection immediately available, with infrequent actions tucked away.
    const manager = form.querySelector('.prop-manager');
    manager.querySelector('legend').textContent = 'Current proposal';
    const management = element('details', 'studio-management');
    management.append(element('summary', '', 'Manage proposals & versions'));
    [...manager.children].filter(el => el.tagName !== 'LEGEND' && !el.contains($('proposalSelect'))).forEach(el => management.append(el));
    manager.append(management); form.prepend(manager);
    $('waShare').textContent = 'Share via WhatsApp';
    const footer = panel.querySelector('.form-actions');
    const tools = element('details', 'studio-tools'); tools.append(element('summary', '', 'Save, backup & reset'));
    tools.append(footer.querySelector('.form-links'));
    const secondary = element('div', 'studio-secondary');
    const customerView = $('custViewBtn'); customerView.textContent = 'Customer view ↗';
    secondary.append(customerView, tools); footer.insertBefore(secondary, $('statusMsg'));
    $('exportBtn').textContent = 'Export backup';
    $('resetBtn').textContent = 'Reset current proposal…';
    footer.querySelector('label[for="importFile"]').textContent = 'Import backup';
    panel.querySelectorAll('label.upload-btn,label[for="importFile"]').forEach(label => {
      label.tabIndex = 0; label.setAttribute('role', 'button');
      label.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $(label.htmlFor).click(); }
      });
    });

    // Separate payment / loan fields from financial assumptions without changing IDs.
    const payments = element('fieldset'); payments.append(element('legend', '', 'Payment & financing'));
    const paymentFields = $('payAdvance').closest('.field');
    const finance = paymentFields.closest('fieldset');
    const loanHint = paymentFields.nextElementSibling, loanRow = loanHint.nextElementSibling;
    payments.append(paymentFields, loanHint, loanRow); finance.after(payments);
    /* The optional commercial-tax illustration lives with the money, not as
       its own section: folded inside Payment & financing. */
    const taxBox = finance.querySelector('.studio-advanced-tax');
    if (taxBox) payments.append(taxBox);
    ['Advance (%)', 'Before dispatch (%)', 'On completion (%)'].forEach((text, i) => {
      const input = [$('payAdvance'), $('payDispatch'), $('payCompletion')][i];
      const label = element('label', 'studio-payment-label', text); label.htmlFor = input.id;
      const wrap = element('div'); input.before(wrap); wrap.append(label, input);
    });

    const customerFields = $('custName').closest('fieldset');
    customerFields.querySelector('legend').after($('custName').closest('.field'), $('custAddress').closest('.field'));
    customerFields.append($('prepName').closest('.field'));
    /* The advanced audio card sits directly under the Prepared-by box. */
    const audioAdv = document.querySelector('details.studio-advanced');
    if (audioAdv) customerFields.append(audioAdv);

    const configs = [
      ['custName', 'Customer & system', 'users', 'pageCover', 'Customer, site and proposal details'],
      ['moduleMake', 'Equipment & design', 'panel', 'pageTechSpec', 'Modules, inverter and roof specifications'],
      ['bessEnabled', 'Battery storage (BESS)', 'bolt', 'pageBessOverview', 'Optional storage, backup and a separate value assessment'],
      ['systemEnabled', 'Additional systems', 'grid2', 'pageSystemOverview', 'Zero Export, monitoring, EV charging, DG coordination or Custom'],
      ['costPerWp', 'Pricing & savings', 'chart', 'pageInvestment', 'Pricing, tariff and calculation assumptions'],
      ['payAdvance', 'Payment & financing', 'rupee', 'pageInvestment', 'Payment milestones, optional loan & tax illustration'],
      ['optName', 'Compare system options', 'panel', 'pageOptions', 'Good, Better and Best configurations'],
      ['bomModules', 'Cost breakdown', 'badge', 'pageInvestment', 'Optional itemised costs before GST'],
      ['pvsystUrl', 'Engineering reports', 'doc', 'pageTechSpec', 'PVsyst and Arka document links'],
      ['durationText', 'Terms & delivery', 'shield', 'pageTerms', 'Delivery commitments and jurisdiction'],
      ['companyName', 'Company branding', 'building', 'pageAbout', 'Company identity and contact information'],
      ['up_cover', 'Page photographs', 'drone', 'pageCover', 'Replace photographs on individual pages'],
      ['galleryUrl', 'QR & links', 'globe', 'pageClosing', 'What the customer’s QR code opens']
    ];
    /* Everything the dealer touches once, not per quote, folds into the
       advanced drawer after the sections are built. */
    const ADVANCED_SECTIONS = ['optName', 'bomModules', 'pvsystUrl', 'durationText', 'companyName', 'up_cover'];
    const sections = [];
    configs.forEach(([field, title, icon, target, description], index) => {
      const fieldset = $(field).closest('fieldset');
      const details = element('details', 'studio-section'); details.dataset.section = field;
      if (fieldset.hasAttribute('data-adv')) details.setAttribute('data-adv', '');
      if (field === 'moduleMake') { details.removeAttribute('data-adv'); fieldset.removeAttribute('data-adv'); }
      details.open = index === 0;
      const summary = element('summary');
      const symbol = element('span', 'studio-section-icon'); symbol.setAttribute('aria-hidden', 'true');
      symbol.innerHTML = window.Icons.get(icon, 19, '#6D7B8C');
      const text = element('span', 'studio-section-copy');
      text.append(element('strong', '', title), element('small', '', description));
      const chevron = element('span', 'studio-chevron', '⌄'); chevron.setAttribute('aria-hidden', 'true');
      summary.append(symbol, text, chevron); details.append(summary);
      fieldset.querySelector('legend').classList.add('studio-sr-only');
      details.append(fieldset); form.append(details);
      const view = element('button', 'studio-view-page', 'View related page ↗'); view.type = 'button';
      view.addEventListener('click', () => {
        let page = $(target);
        if (!page || !page.getClientRects().length) page = $('pageExec');
        if (!page || !page.getClientRects().length) page = $('pageCover');
        page.scrollIntoView({behavior: 'instant', block: 'start'});
      });
      fieldset.append(view); sections.push({field, details, text, description});
    });
    // Keep content and equipment libraries out of routine quotation inputs.
    const library = form.querySelector('.eq-panel'); library.querySelector('summary').textContent = 'Equipment library';
    form.append(library, $('advancedPanel'));
    $('advancedPanel').classList.add('studio-content');

    /* Fold the once-per-company and expert sections into the advanced drawer
       so the working panel stays a short list; the drawer opens in both modes. */
    const wrap = $('advancedWrap');
    sections.filter((sec) => ADVANCED_SECTIONS.includes(sec.field)).forEach((sec) => wrap.append(sec.details));
    wrap.append(library);
    const engFs = $('tiltDeg') ? $('tiltDeg').closest('fieldset') : null;
    if (engFs && engFs.parentElement === wrap) {
      const d = element('details', 'studio-section'); d.dataset.section = 'tiltDeg'; d.setAttribute('data-adv', '');
      const summary = element('summary');
      const symbol = element('span', 'studio-section-icon'); symbol.setAttribute('aria-hidden', 'true');
      symbol.innerHTML = window.Icons.get('panel', 19, '#6D7B8C');
      const copy = element('span', 'studio-section-copy');
      copy.append(element('strong', '', 'Engineering design basis'),
        element('small', '', 'Wind, string, cable, earthing & roof-load checks - printed as DATA REQUIRED until supplied'));
      summary.append(symbol, copy, element('span', 'studio-chevron', '⌄'));
      d.append(summary);
      engFs.querySelector('legend').classList.add('studio-sr-only');
      wrap.insertBefore(d, engFs); d.append(engFs);
    }
    /* Panel order: the working list, then QR & links, then the drawer, and
       Advanced Edit last. */
    form.insertBefore(wrap, $('advancedPanel'));

    /* Reference-number guard. The template ships with a sample reference, and
       two proposals can end up sharing one number without anything noticing -
       both send a customer a quotation with the wrong identifier. The authored
       value is read once, before any saved proposal can overwrite it. */
    const SAMPLE_REF = String(($('propRef') || {}).getAttribute?.('value') || '').trim();
    const refWarning = element('p', 'studio-ref-warning');
    refWarning.id = 'refWarning';
    refWarning.setAttribute('role', 'status');
    refWarning.hidden = true;
    const refField = $('proposalSelect') && $('proposalSelect').closest('.field');
    if (refField) refField.after(refWarning);

    function labels() {
      panel.querySelectorAll('.field').forEach(field => {
        const controls = field.querySelectorAll('input:not([type=file]),select,textarea');
        const label = field.querySelector('label');
        if (controls.length === 1 && label) {
          if (controls[0].id) label.htmlFor = controls[0].id;
          else controls[0].setAttribute('aria-label', label.textContent);
        }
      });
    }
    labels();
    const editorObserver = new MutationObserver(labels);
    editorObserver.observe($('advContainer'), {childList: true});

    function referenceIssue(state) {
      const ref = String(state.propRef || '').trim();
      if (!ref) return 'This proposal has no reference number - press New in Proposals to issue the next one.';
      const active = window.Proposals.activeId();
      const clash = (window.Proposals.list() || []).find(p => p.id !== active &&
        String(p.ref || '').trim().toLowerCase() === ref.toLowerCase());
      if (clash) return 'Reference ' + ref + ' is already used by another proposal (#' +
        (clash.ref || clash.id.slice(-4)) + ' · ' + (clash.title || 'untitled') +
        '). Two customers must not receive one number - issue a new version, or give this one its own reference.';
      if (SAMPLE_REF && ref === SAMPLE_REF) return 'This is still the template sample reference (' + SAMPLE_REF +
        '). Press New in Proposals to issue this proposal its own number.';
      return '';
    }

    function update() {
      const state = window.Render.lastState || window.Render.readState();
      const f = window.Finance.compute(state);
      overview.querySelector('[data-metric="capacity"]').textContent = (state.capacity || '-') + ' kWp';
      overview.querySelector('[data-metric="investment"]').previousElementSibling.textContent=(window.Bess.included(state)||window.AdditionalSystems.included(state))?'Solar-only investment':'Net investment';
      overview.querySelector('[data-metric="investment"]').textContent = window.Finance.fmtINR(f.netInvestment);
      overview.querySelector('[data-metric="energy"]').textContent = window.Finance.fmtNum(f.annualGen) + ' kWh';
      overview.querySelector('.studio-page-count').textContent = window.Render.lastVisible.length + ' pages';
      /* Live derived read-outs. The rate fields above them are per-kWp and
         per-Wp, so without these the panel looks like it ignores the capacity
         input entirely - the totals only moved on the preview side. */
      const genHint = $('hintGenFactor');
      if (genHint) {
        genHint.textContent = f.annualGen > 0
          ? 'Year-1 output ≈ ' + window.Finance.fmtNum(f.annualGen) + ' kWh from ' +
            f.installedKwp.toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' kWp installed.'
          : 'Enter a capacity to see the year-1 output.';
      }
      const costHint = $('hintCostPerWp');
      if (costHint) {
        costHint.textContent = f.projectCost > 0
          ? 'Project cost ' + window.Finance.fmtINR(f.projectCost) + ' ex-GST · ' +
            window.Finance.fmtINR(f.grossTotal) + ' with GST.'
          : 'Enter a rate and capacity to see the project cost.';
      }
      const summaries = {
        custName: state.custName || 'Add customer details',
        moduleMake: (state.moduleWattage || '-') + ' W modules · ' + (state.inverterKw || f.inverterKw || '-') + ' kW inverter',
        costPerWp: '₹' + (Math.round((state.costPerKwp || 0) / 10) / 100) + '/Wp · ₹' + (state.tariff || '0') + '/unit',
        payAdvance: [state.payAdvance || 0, state.payDispatch || 0, state.payCompletion || 0].join(' / ') + '% · ' + (f.financing ? 'Financing included' : 'Payment milestones'),
        galleryUrl: state.galleryUrl ? 'Link entered · verify before sharing' : 'Add your public QR destination when ready'
      };
      sections.forEach(({field, text, description}) => { text.querySelector('small').textContent = summaries[field] || description; });
      const selected = $('proposalSelect').selectedOptions[0];
      if (selected) selected.textContent = '#' + (state.propRef || 'Draft') + ' · ' + (state.custName || 'Untitled customer') + ' - ' + (state.capacity || '0') + ' kWp · v' + (state.propVersion || '1.0');
      const bessSection=document.querySelector('[data-section="bessEnabled"] summary small');
      if(bessSection) bessSection.textContent=window.Bess.enabled(state) ? (window.Bess.included(state)?'Included':'Standalone')+' · '+(state.bessCapacity||'-')+' kWh' : 'Not included · solar-only proposal';
      const sysSummary=document.querySelector('[data-section="systemEnabled"] summary small');
      if(sysSummary)sysSummary.textContent=window.AdditionalSystems.enabled(state)?(state.systemName||'Custom system')+' · '+(window.AdditionalSystems.included(state)?'included':'standalone'):'Optional controls, charging or a custom system';
      /* The panel stays silent about the reference too - the pre-flight
         raises it before a PDF exists. */
      refWarning.hidden = true;
      validateWithEngineering(f, state);
      if (searchInput.value.trim()) find();
    }
    const feedback = element('div', 'studio-feedback'); feedback.setAttribute('role', 'status');
    feedback.hidden = true; panel.insertBefore(feedback, form);
    let lastIssues = {blocking: [], advisory: []};
    function collect() {
      /* Two levels: blocking issues would print a wrong document, advisories
         are suspicions worth a look. The panel shows both; the download only
         refuses for the first kind. */
      const blocking = [], advisory = [];
      [['custName', 'Add a customer name.'], ['capacity', 'Enter a system capacity greater than zero.'], ['costPerWp', 'Enter a cost per Wp greater than zero.']].forEach(([id, message]) => {
        const el = $(id), invalid = id === 'custName' ? !el.value.trim() : !(Number(el.value) > 0);
        el.setAttribute('aria-invalid', String(invalid));
        if (invalid) blocking.push({id, message});
      });
      const pay = ['payAdvance', 'payDispatch', 'payCompletion'];
      const invalidPay = pay.some(id => !$(id).value || Number($(id).value) < 0 || Number($(id).value) > 100) || Math.abs(pay.reduce((n, id) => n + Number($(id).value), 0) - 100) > .01;
      pay.forEach(id => $(id).setAttribute('aria-invalid', String(invalidPay)));
      if (invalidPay) blocking.push({id: 'payAdvance', message: 'Payment milestones must total 100%.'});
      const loan = ['loanAmt', 'loanRate', 'loanYears'], hasLoan = loan.some(id => $(id).value !== '');
      const invalidLoan = hasLoan && (!loan.every(id => $(id).value !== '') || !($('loanAmt').value > 0) || !(Number($('loanRate').value) >= 0) || !($('loanYears').value >= 1 && $('loanYears').value <= 30));
      loan.forEach(id => $(id).setAttribute('aria-invalid', String(invalidLoan)));
      if (invalidLoan) blocking.push({id: 'loanAmt', message: 'Enter a positive loan amount, an interest rate of 0% or more, and a tenure of 1–30 years.'});
      /* Reference problems (sample number, duplicate, none) never clutter the
         panel; they surface once, in the export pre-flight. */
      const refIssue = referenceIssue(window.Render.lastState || window.Render.readState());
      if (refIssue) advisory.push({ id: 'propRef', message: refIssue });
      const handled = new Set(['capacity','costPerWp',...pay,...loan]);
      form.querySelectorAll('input[type="number"]').forEach(input => {
        if (handled.has(input.id)) return;
        let invalid = input.validity.badInput || input.validity.rangeUnderflow || input.validity.rangeOverflow;
        if (['moduleWattage','treeFactor'].includes(input.id)) invalid ||= !(Number(input.value) > 0);
        if (input.id === 'degradation') invalid ||= Number(input.value) >= 100;
        if (input.id === 'subsidyOverride' && input.value !== '') invalid ||= Number(input.value) > window.Finance.compute(window.Render.lastState).grossTotal;
        input.setAttribute('aria-invalid', String(invalid));
        if (invalid) advisory.push({id:input.id,message:'Check ' + (input.labels?.[0]?.textContent || input.id) + ': the value is outside the expected range.'});
      });
      return {blocking, advisory, notes: []};
    }

    /* The panel stays silent: an invalid field carries its own red outline,
       and the export pre-flight names every blocker before a PDF exists.
       The strip therefore never renders - the hidden-rule below is kept as
       the guarantee that nothing extra ever appears above the form. */
    function renderFeedback(list) {
      const messages = list.blocking.concat(list.advisory)
        .filter((m) => !/^DATA REQUIRED/.test(m.message));
      const notesOnly = !list.blocking.length && !list.advisory.length;
      feedback.replaceChildren(); feedback.hidden = notesOnly || !messages.length;
      feedback.hidden = true;
    }

    /* Kept for the plain "what does the form say" question. */
    function validate() {
      const list = collect();
      renderFeedback(list);
      lastIssues = { blocking: list.blocking, advisory: list.advisory };
      return lastIssues;
    }
    /* ---- engineering design basis ----------------------------------------
       The same two levels, from engineering.js: a figure that already proves
       the design wrong stops the PDF, and an input nobody has supplied yet is
       an advisory that the page prints as DATA REQUIRED. The panel and the
       download read this one function, so they cannot disagree. */
    function engineeringIssues(f, state) {
      if (!window.Engineering || typeof window.Engineering.report !== 'function') return { blocking: [], advisory: [] };
      state = state || window.Render.lastState || window.Render.readState();
      f = f || window.Finance.compute(state);
      const phases = f.isCommercialOrInd ? 3 : 1;
      const acVoltageV = phases === 3 ? 415 : 230;
      const acCurrentA = f.inverterKw > 0
        ? (f.inverterKw * 1000) / (acVoltageV * (phases === 3 ? Math.sqrt(3) : 1)) : 0;
      let out;
      try {
        out = window.Engineering.report(state, {
          moduleCount: f.moduleCount, acCurrentA, acVoltageV, phases
        }) || {};
      } catch (e) { return { blocking: [], advisory: [] }; }
      return { blocking: out.blocking || [], advisory: out.advisory || [], notes: out.notes || [] };
    }
    /* The Tech Spec page is a fixed A4 box. Its fit ladder shrinks the drawing
       and the cell padding to make the design basis fit, and reports what is
       left over - but only a real browser can measure that. An overfull page
       would print with its last rows cut off, so it is named in the dialog
       before the sheet reaches a customer. */
    function overflowIssues() {
      return (window.__qsPageOverflow || []).length ? [{
        id: 'pageTechSpec',
        message: 'The Technical Specification page is too full: with the roof-area figures and the reference links both shown, its last rows would be cut off. Remove a reference link (or leave the roof area blank) and it fits again.'
      }] : [];
    }
    function validateWithEngineering(f, state) {
      const merged = collect();
      const eng = engineeringIssues(f, state);
      const seen = new Set(merged.blocking.concat(merged.advisory, merged.notes).map((i) => i.id + '|' + i.message));
      const add = (list, item) => { if (!seen.has(item.id + '|' + item.message)) list.push(item); };
      eng.blocking.forEach((i) => add(merged.blocking, i));
      eng.advisory.forEach((i) => add(merged.advisory, i));
      /* A DATA REQUIRED gap prints openly on the page, so it never blocks -
         but the preparer still gets one look before the sheet leaves the
         building: the gap rides along as an advisory, so the export
         pre-flight raises it and offers "Download anyway" rather than
         refusing. Informational notes stay out of the gate entirely. */
      eng.notes.forEach((i) => {
        if (/^DATA REQUIRED/.test(i.message)) add(merged.advisory, i);
        else add(merged.notes, i);
      });
      overflowIssues().forEach((i) => add(merged.advisory, i));
      renderFeedback(merged);
      /* What the download sees: the two levels that change the document. */
      lastIssues = { blocking: merged.blocking, advisory: merged.advisory };
      return lastIssues;
    }
    /* The export pre-flight reads exactly this list, so the panel and the
       download can never disagree about what is wrong. */
    window.__qsPreflight = {
      run: validateWithEngineering,
      issues: () => lastIssues,
      reveal: (id) => { const el = $(id); if (el) reveal(el); }
    };

    function reveal(input) {
      if (!input) return;
      if(input.id==='systemEnabled'){input.closest('.studio-section').open=true;input=document.querySelector('[data-system-choice="yes"]');}
      if(input.id==='bessEnabled'){input.closest('.studio-section').open=true;input=document.querySelector('[data-bess-choice="yes"]');}
      if (input.closest('[data-adv]')) $('modeAll').click();
      for (let parent = input.parentElement; parent && parent !== panel; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS') parent.open = true;
      }
      input.scrollIntoView({behavior: 'instant', block: 'center'}); input.focus({preventScroll: true});
    }
    const searchInput = $('studioSearch'), results = $('studioSearchResults'), clear = search.querySelector('button');
    function clearSearch() { searchInput.value = ''; results.hidden = true; clear.hidden = true; }
    function find() {
      const query = searchInput.value.trim().toLowerCase();
      clear.hidden = !query; results.hidden = !query;
      const list = results.querySelector('ul'); list.replaceChildren();
      if (!query) return;
      const matches = [...form.querySelectorAll('input:not([type=file]),select,textarea')].filter(el => !el.disabled && (!el.closest('[hidden]') || ['bessEnabled','systemEnabled'].includes(el.id))).map(input => {
        const label = input.labels?.[0]?.textContent || input.getAttribute('aria-label') || input.closest('.field')?.querySelector('label')?.textContent || input.id;
        const path = [];
        for (let parent = input.parentElement; parent && parent !== form; parent = parent.parentElement) {
          if (parent.tagName === 'DETAILS') path.unshift(parent.querySelector(':scope > summary')?.textContent || '');
        }
        const section = input.closest('.studio-section')?.querySelector('summary strong')?.textContent || path.join(' / ') || 'Proposal management';
        return {input, label, section};
      }).filter(item => query.split(/\s+/).every(word => (item.label + ' ' + item.section).toLowerCase().includes(word)));
      results.querySelector('p').textContent = matches.length ? 'Showing ' + Math.min(matches.length, 8) + ' of ' + matches.length + ' matching settings' : 'No matching settings. Try “tariff”, “module” or “QR”.';
      matches.slice(0, 8).forEach(({input, label, section}) => {
        const li = element('li'), button = element('button'); button.type = 'button';
        button.append(element('strong', '', label), element('small', '', section));
        button.addEventListener('click', () => { clearSearch(); reveal(input); }); li.append(button); list.append(li);
      });
    }
    searchInput.addEventListener('input', find); clear.addEventListener('click', () => { clearSearch(); searchInput.focus(); });
    searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { clearSearch(); e.stopPropagation(); } });
    document.addEventListener('qs:rendered', update); update();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
