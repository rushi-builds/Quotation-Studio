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
    panel.insertBefore(overview, form);

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
    const tools = element('details', 'studio-tools'); tools.append(element('summary', '', 'Backup & reset'));
    tools.append(footer.querySelector('.form-links'));
    const secondary = element('div', 'studio-secondary');
    const customerView = $('custViewBtn'); customerView.textContent = 'Customer view ↗';
    secondary.append(customerView, tools); footer.insertBefore(secondary, $('statusMsg'));
    $('exportBtn').textContent = 'Export backup';
    footer.querySelector('label[for="importFile"]').textContent = 'Import backup';
    $('resetBtn').textContent = 'Reset inputs';
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
    ['Advance (%)', 'Before dispatch (%)', 'On completion (%)'].forEach((text, i) => {
      const input = [$('payAdvance'), $('payDispatch'), $('payCompletion')][i];
      const label = element('label', 'studio-payment-label', text); label.htmlFor = input.id;
      const wrap = element('div'); input.before(wrap); wrap.append(label, input);
    });

    const customerFields = $('custName').closest('fieldset');
    const customerHint = customerFields.querySelector('.hint');
    customerHint.textContent = 'Start with the customer and system size. Your proposal updates as you type.';
    customerHint.after($('custName').closest('.field'), $('custAddress').closest('.field'));
    customerFields.append($('prepName').closest('.field'));

    const configs = [
      ['custName', 'Customer & system', 'users', 'pageCover', 'Customer, site and proposal details'],
      ['moduleMake', 'Equipment & design', 'panel', 'pageTechSpec', 'Modules, inverter and roof specifications'],
      ['bessEnabled', 'Battery storage (BESS)', 'bolt', 'pageBessOverview', 'Optional storage, backup and a separate value assessment'],
      ['systemEnabled', 'Additional systems', 'grid2', 'pageSystemOverview', 'Zero Export, monitoring, EV charging, DG coordination or Custom'],
      ['costPerKwp', 'Pricing & savings', 'chart', 'pageInvestment', 'Pricing, tariff and calculation assumptions'],
      ['payAdvance', 'Payment & financing', 'rupee', 'pageInvestment', 'Payment milestones and optional loan'],
      ['optName', 'Compare system options', 'panel', 'pageOptions', 'Good, Better and Best configurations'],
      ['bomModules', 'Cost breakdown', 'badge', 'pageInvestment', 'Optional itemised costs before GST'],
      ['depreciationRate', 'Tax assumptions', 'doc', 'pageInvestment', 'Optional commercial tax illustration'],
      ['pvsystUrl', 'Engineering reports', 'doc', 'pageTechSpec', 'PVsyst and Arka document links'],
      ['durationText', 'Terms & delivery', 'shield', 'pageTerms', 'Delivery commitments and jurisdiction'],
      ['companyName', 'Company branding', 'building', 'pageAbout', 'Company identity and contact information'],
      ['up_cover', 'Page photographs', 'drone', 'pageCover', 'Replace photographs on individual pages'],
      ['galleryUrl', 'QR & customer audio', 'globe', 'pageClosing', 'Gallery destination and optional narration']
    ];
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

    function update() {
      const state = window.Render.lastState || window.Render.readState();
      const f = window.Finance.compute(state);
      overview.querySelector('[data-metric="capacity"]').textContent = (state.capacity || '—') + ' kWp';
      overview.querySelector('[data-metric="investment"]').previousElementSibling.textContent=(window.Bess.included(state)||window.AdditionalSystems.included(state))?'Solar-only investment':'Net investment';
      overview.querySelector('[data-metric="investment"]').textContent = window.Finance.fmtINR(f.netInvestment);
      overview.querySelector('[data-metric="energy"]').textContent = window.Finance.fmtNum(f.annualGen) + ' kWh';
      overview.querySelector('.studio-page-count').textContent = window.Render.lastVisible.length + ' pages';
      const summaries = {
        custName: state.custName || 'Add customer details',
        moduleMake: (state.moduleWattage || '—') + ' W modules · ' + (state.inverterKw || f.inverterKw || '—') + ' kW inverter',
        costPerKwp: window.Finance.fmtINR(state.costPerKwp) + '/kWp · ₹' + (state.tariff || '0') + '/unit',
        payAdvance: [state.payAdvance || 0, state.payDispatch || 0, state.payCompletion || 0].join(' / ') + '% · ' + (f.financing ? 'Financing included' : 'Payment milestones'),
        galleryUrl: state.galleryUrl ? 'Link entered · verify before sharing' : 'Add your public QR destination when ready'
      };
      sections.forEach(({field, text, description}) => { text.querySelector('small').textContent = summaries[field] || description; });
      const selected = $('proposalSelect').selectedOptions[0];
      if (selected) selected.textContent = '#' + (state.propRef || 'Draft') + ' · ' + (state.custName || 'Untitled customer') + ' — ' + (state.capacity || '0') + ' kWp · v' + (state.propVersion || '1.0');
      const bessSection=document.querySelector('[data-section="bessEnabled"] summary small');
      if(bessSection) bessSection.textContent=window.Bess.enabled(state) ? (window.Bess.included(state)?'Included':'Standalone')+' · '+(state.bessCapacity||'—')+' kWh' : 'Not included · solar-only proposal';
      const sysSummary=document.querySelector('[data-section="systemEnabled"] summary small');
      if(sysSummary)sysSummary.textContent=window.AdditionalSystems.enabled(state)?(state.systemName||'Custom system')+' · '+(window.AdditionalSystems.included(state)?'included':'standalone'):'Optional controls, charging or a custom system';
      validate();
      if (searchInput.value.trim()) find();
    }
    const feedback = element('div', 'studio-feedback'); feedback.setAttribute('role', 'status');
    feedback.hidden = true; panel.insertBefore(feedback, form);
    function validate() {
      const messages = [];
      [['custName', 'Add a customer name.'], ['capacity', 'Enter a system capacity greater than zero.'], ['costPerKwp', 'Enter a cost per kWp greater than zero.']].forEach(([id, message]) => {
        const el = $(id), invalid = id === 'custName' ? !el.value.trim() : !(Number(el.value) > 0);
        el.setAttribute('aria-invalid', String(invalid));
        if (invalid) messages.push({id, message});
      });
      const pay = ['payAdvance', 'payDispatch', 'payCompletion'];
      const invalidPay = pay.some(id => !$(id).value || Number($(id).value) < 0 || Number($(id).value) > 100) || Math.abs(pay.reduce((n, id) => n + Number($(id).value), 0) - 100) > .01;
      pay.forEach(id => $(id).setAttribute('aria-invalid', String(invalidPay)));
      if (invalidPay) messages.push({id: 'payAdvance', message: 'Payment milestones must total 100%.'});
      const loan = ['loanAmt', 'loanRate', 'loanYears'], hasLoan = loan.some(id => $(id).value !== '');
      const invalidLoan = hasLoan && (!loan.every(id => $(id).value !== '') || !($('loanAmt').value > 0) || !(Number($('loanRate').value) > 0) || !($('loanYears').value >= 1 && $('loanYears').value <= 30));
      loan.forEach(id => $(id).setAttribute('aria-invalid', String(invalidLoan)));
      if (invalidLoan) messages.push({id: 'loanAmt', message: 'Enter a positive loan amount and interest rate, with a tenure of 1–30 years.'});
      const handled = new Set(['capacity','costPerKwp',...pay,...loan]);
      form.querySelectorAll('input[type="number"]').forEach(input => {
        if (handled.has(input.id)) return;
        let invalid = input.validity.badInput || input.validity.rangeUnderflow || input.validity.rangeOverflow;
        if (['moduleWattage','treeFactor'].includes(input.id)) invalid ||= !(Number(input.value) > 0);
        if (input.id === 'degradation') invalid ||= Number(input.value) >= 100;
        if (input.id === 'subsidyOverride' && input.value !== '') invalid ||= Number(input.value) > window.Finance.compute(window.Render.lastState).grossTotal;
        input.setAttribute('aria-invalid', String(invalid));
        if (invalid) messages.push({id:input.id,message:'Check ' + (input.labels?.[0]?.textContent || input.id) + ': the value is outside the expected range.'});
      });
      feedback.replaceChildren(); feedback.hidden = !messages.length;
      if (messages.length) feedback.append(element('strong', '', 'Review your inputs'));
      messages.forEach(({id, message}) => {
        const button = element('button', '', message + ' →'); button.type = 'button';
        button.addEventListener('click', () => reveal($(id))); feedback.append(button);
      });
    }
    function reveal(input) {
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
    function modeHint() {
      mode.querySelector('.fm-hint').textContent = form.classList.contains('qs-mode-essentials') ? 'Everyday quotation fields, without the extra setup.' : 'Full access to branding, equipment, reports and customer settings.';
    }
    document.addEventListener('qs:mode', modeHint); modeHint();
    document.addEventListener('qs:rendered', update); update();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
