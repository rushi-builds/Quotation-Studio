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
    overview.innerHTML = '<div class="studio-overview-top"><span><i></i> LIVE QUOTATION</span><span class="studio-page-count"></span></div><div class="studio-metrics"><div><small>System capacity</small><strong data-metric="capacity"></strong></div><div><small>Total Project Cost</small><strong data-metric="investment"></strong></div><div><small>Annual Energy</small><strong data-metric="energy"></strong></div></div>';
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
      ['costPerWp', 'Pricing & savings', 'chart', 'pageInvestment', 'Pricing, tariff and calculation assumptions'],
      ['payAdvance', 'Payment & financing', 'rupee', 'pageInvestment', 'Payment milestones, optional loan & tax illustration'],
      ['optName', 'Compare system options', 'panel', 'pageOptions', 'Good, Better and Best configurations'],
      ['bomModules', 'Cost breakdown', 'badge', 'pageInvestment', 'Optional itemised costs before GST'],
      ['pvsystUrl', 'Engineering reports', 'doc', 'pageTechSpec', 'PVsyst and Arka document links'],
      ['durationText', 'Terms & delivery', 'shield', 'pageTerms', 'Delivery commitments and jurisdiction'],
      ['companyName', 'Company branding', 'building', 'pageAbout', 'Company identity and contact information'],
      ['up_cover', 'Page photographs', 'drone', 'pageCover', 'Replace photographs on individual pages'],
      ['galleryUrl', 'QR & links', 'globe', 'pageClosing', 'What the customer’s QR code opens'],
      ['systemEnabled', 'Advanced Systems', 'grid2', 'pageSystemOverview', 'Solar roofs, carports, controls & battery storage']
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
        if(field==='systemEnabled'&&(!page||!page.getClientRects().length)&&window.Bess.enabled(window.Render.lastState))page=$('pageBessOverview');
        if (!page || !page.getClientRects().length) page = $('pageExec');
        if (!page || !page.getClientRects().length) page = $('pageCover');
        page.scrollIntoView({behavior: 'instant', block: 'start'});
      });
      if (field === 'systemEnabled') {
        const pickerField=element('div','field system-picker-field'),pickerLabel=element('label','','Select system'),picker=element('select');
        picker.id='advancedSystemSelect';picker.setAttribute('data-system-picker','');pickerLabel.htmlFor=picker.id;
        [['none','No Advanced System'],...['weatherproof','carport'].map(key=>[key,window.AdditionalSystems.templates[key].name]),['bess','Battery Energy Storage (BESS)'],...['monitoring','dg'].map(key=>[key,window.AdditionalSystems.templates[key].name]),...Object.entries(window.AdditionalSystems.templates).filter(([key])=>!['weatherproof','carport','monitoring','dg'].includes(key)).map(([key,t])=>[key,t.name]),['custom','Custom system…'],['combined','Saved package + battery']].forEach(([value,text])=>{const option=new Option(text,value);if(value==='combined'){option.id='combinedSystemOption';option.hidden=true;option.disabled=true;}picker.add(option);});
        pickerField.append(pickerLabel,picker);fieldset.prepend(pickerField);$('systemTemplate').closest('.field').hidden=true;
        const card=element('div','selected-system-card');card.id='selectedSystemCard';card.hidden=true;pickerField.after(card);
        const battery=element('div','selected-battery-fields');battery.id='selectedBatteryFields';battery.dataset.section='bessEnabled';battery.hidden=true;
        const batteryFields=$('bessEnabled').closest('fieldset');batteryFields.querySelector('legend').classList.add('studio-sr-only');battery.append(batteryFields);fieldset.append(battery);
        // Routine fields first; colour roles are identical across every system.
        const group=(label,tone,nodes)=>{const box=element('section','system-input-group');box.dataset.inputTone=tone;box.setAttribute('aria-label',label);box.append(element('h3','system-input-heading',label),...nodes);return box;};
        const tone=(node,value)=>{node.dataset.inputTone=value;return node;};
        const packagePrice=$('systemPriceMode').closest('.field');
        const packagePriceGroup=group('Pricing','price',[]);packagePrice.before(packagePriceGroup);
        packagePriceGroup.append(packagePrice,$('systemPricingHint'),$('systemBaseReviewField'),$('systemPriceField'));
        tone($('systemEditDetails'),'scope');tone($('systemAdditions').closest('details'),'scope');
        const sizing=$('bessSizing').closest('.field'),backupInputs=$('bessLoad').closest('.row2');backupInputs.id='bessBackupInputs';backupInputs.hidden=true;
        const price=group('Pricing','price',[$('bessCost').closest('.field'),$('bessCostHint')]);
        const setup=group('Battery & sizing goal','scope',[$('bessModel').closest('.field'),$('bessCustomIdentity'),sizing,backupInputs]);
        const custom=tone($('bessAdditions').closest('details'),'scope');
        const specifications=tone($('bessCapacity').closest('details'),'technical');specifications.id='bessSpecifications';
        const advanced=$('bessAutoSetup');tone(advanced.querySelector('details'),'technical');
        const operating=tone($('bessUseCase').closest('details'),'economics');operating.id='bessOperating';
        const reportPreferences=tone($('bessInclude').closest('details'),'report');reportPreferences.id='bessReportPreferences';
        const inputStatus=$('bessInputStatus');if(inputStatus)reportPreferences.append(inputStatus);
        $('bessFields').append(price,setup,custom,advanced,specifications,operating,reportPreferences,$('bessValidation'));
        $('bessModel').addEventListener('change',()=>{if($('bessModel').value==='custom')$('bessCapacity').closest('details').open=true;});
        picker.addEventListener('input',event=>event.stopPropagation());
        picker.addEventListener('change',()=>{
          const chosen=picker.value;if(chosen==='combined')return;
          const old={system:$('systemEnabled').checked,battery:$('bessEnabled').checked};
          $('systemEnabled').checked=!['none','bess'].includes(chosen);$('bessEnabled').checked=chosen==='bess';
          if($('systemEnabled').checked){$('systemTemplate').value=chosen;$('systemTemplate').dispatchEvent(new Event('change',{bubbles:true}));if($('systemTemplate').value!==chosen){$('systemEnabled').checked=old.system;$('bessEnabled').checked=old.battery;}}
          else if(chosen==='bess'&&!$('bessModel').value&&!['bessMake','bessCapacity','bessPower'].some(id=>$(id).value.trim())){
            $('bessModel').value='pylon-us5000';$('bessModel').dispatchEvent(new Event('change',{bubbles:true}));
          }
          window.Render.renderAll();
        });
        const review=element('details','system-review');review.id='systemReview';review.hidden=true;
        const reviewSummary=element('summary');reviewSummary.id='systemReviewSummary';
        const reviewItems=element('ul');reviewItems.id='systemReviewItems';
        review.append(reviewSummary,reviewItems,element('p','system-review-note','Proposal review only. Final site design and installation approval are separate.'));details.append(review);
      }
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
        element('small', '', 'Proposal-stage PDF note · Excel integration pending · internal design checks'));
      summary.append(symbol, copy, element('span', 'studio-chevron', '⌄'));
      d.append(summary);
      engFs.querySelector('legend').classList.add('studio-sr-only');
      wrap.insertBefore(d, engFs); d.append(engFs);
    }
    /* Panel order: the working list, then QR & links, Advanced Systems, the drawer, and
       Advanced Edit last. */
    form.insertBefore(wrap, $('advancedPanel'));

    // Presentation-only grouping: move the original controls, never clone values.
    const equipment = $('moduleMake').closest('fieldset');
    const mixedRow = $('moduleTech').closest('.row2');
    const equipmentGroups = [
      ['Modules', 'mint', [$('moduleMake').closest('.field'), $('moduleModel').closest('.field'), $('moduleWattage').closest('.row3'), $('moduleTech').closest('.field')]],
      ['Inverter', 'blue', [$('inverterKw').closest('.field'), $('inverterMake').closest('.field'), $('inverterModel').closest('.field')]],
      ['Mounting & roof', 'sand', [$('mountMake').closest('.field'), $('roofType').closest('.row2')]],
      ['Cables & protection', 'lavender', [$('cableMake').closest('.field')]],
      ['Generation assumption', 'slate', [$('genFactor').closest('.field')]]
    ];
    equipmentGroups.forEach(([title, tone, nodes], i) => {
      const group = element('section', 'studio-input-cluster');
      group.dataset.tone = tone;
      const heading = element('h3', '', title); heading.id = 'equipmentGroup' + i;
      group.setAttribute('aria-labelledby', heading.id); group.append(heading, ...nodes);
      equipment.insertBefore(group, equipment.querySelector('.studio-view-page'));
    });
    if (mixedRow && !mixedRow.children.length) mixedRow.remove();
    // The same inner-card treatment throughout the editor. Keep actual .field
    // wrappers intact (including hidden/conditional state); never copy inputs.
    let clusterNumber = 0;
    function cluster(sectionId, title, tone, specs) {
      const host = form.querySelector('.studio-section[data-section="' + sectionId + '"] > fieldset');
      const box = element('section', 'studio-input-cluster studio-arranged-cluster');
      box.dataset.tone = tone;
      const heading = element('h3', '', title); heading.id = 'studioGroup' + (++clusterNumber);
      box.setAttribute('aria-labelledby', heading.id);
      const grid = element('div', 'studio-field-grid'); box.append(heading, grid);
      specs.forEach(spec => {
        const [id, full] = Array.isArray(spec) ? spec : [spec, false];
        const input = $(id), field = input?.closest('.field');
        if (!field || grid.contains(field)) return;
        const label = field.querySelector(':scope > label');
        if (label && input.matches('input:not([type=file]),select,textarea') && field.querySelectorAll('input,select,textarea').length === 1) label.htmlFor = input.id;
        if (full) field.classList.add('studio-field-wide');
        grid.append(field);
      });
      host.insertBefore(box, host.querySelector(':scope > .studio-view-page'));
      return box;
    }
    const full = id => [id, true];
    cluster('custName', 'Customer details', 'blue', [full('custName'), full('custAddress'), full('customerType')]);
    cluster('custName', 'Site & system', 'mint', ['capacity', 'monthlyBill', full('siteFetchBtn')]);
    cluster('custName', 'Proposal details', 'slate', [full('propRef'), 'propDate', 'propVersion', 'validityDays', 'prepName']);
    const sharing = cluster('custName', 'Sharing & audio', 'lavender', [full('shareUrl')]);
    if (audioAdv) sharing.append(audioAdv);
    cluster('costPerWp', 'Project pricing', 'sand', ['costPerWp', 'gstPercent']);
    cluster('costPerWp', 'Savings assumptions', 'blue', [full('tariff'), 'escalation', 'degradation']);
    cluster('costPerWp', 'Subsidy & support', 'mint', ['subsidyOverride', 'stateTopUp', full('rwaEligibleKwp')]);
    cluster('costPerWp', 'Environmental assumptions', 'slate', ['co2Factor', 'treeFactor']);
    const milestones = cluster('payAdvance', 'Payment milestones', 'sand', [full('payAdvance')]);
    milestones.querySelector('.field > label')?.remove(); // each % input already has its own associated label
    const lending = cluster('payAdvance', 'Loan (optional)', 'blue', [full('loanAmt'), 'loanRate', 'loanYears']);
    loanHint.textContent = 'Complete all three fields to include the EMI analysis.';
    lending.append(loanHint);
    if (taxBox) { taxBox.dataset.tone = 'lavender'; taxBox.classList.add('studio-tinted-disclosure'); lending.after(taxBox); }
    const comparisons = cluster('optName', 'Save a comparison', 'lavender', [full('optName'), full('optSave')]);
    comparisons.append($('optList'));
    cluster('bomModules', 'Equipment costs · before GST', 'mint', ['bomModules', 'bomInverter']);
    cluster('bomModules', 'Structure & balance of system', 'sand', ['bomStructure', 'bomBos']);
    const installation = cluster('bomModules', 'Installation & approvals', 'blue', [full('bomInstall'), full('bomLiaison')]);
    installation.append($('bomFormTotal'));
    cluster('pvsystUrl', 'Engineering documents', 'blue', [full('pvsystUrl'), full('arkaUrl')]);
    cluster('durationText', 'Delivery & survey', 'sand', [full('durationText'), full('surveyWindow')]);
    cluster('durationText', 'Legal', 'slate', [full('jurisdiction')]);
    cluster('companyName', 'Company identity', 'rose', [full('companyName'), full('companyTagline')]);
    cluster('companyName', 'Contact & office', 'blue', [full('companyPhone'), full('companyEmail'), full('companyAddress'), full('companyWebsite')]);
    const companyStats = cluster('companyName', 'Company figures', 'slate', ['statYears', 'statProjects', full('statCapacity')]);
    const companyHost = $('companyName').closest('fieldset');
    const companyDefaults = element('div', 'studio-company-defaults');
    companyDefaults.append($('companyDefaultsHint'), companyHost.querySelector('.form-links'), $('companyDefaultStatus'));
    companyStats.append(companyDefaults);
    cluster('up_cover', 'Cover & closing', 'rose', ['up_cover', 'up_closing']);
    cluster('up_cover', 'Company & solution', 'blue', ['up_about', 'up_whysolar', 'up_solution', 'up_scope']);
    cluster('up_cover', 'Quality & assurance', 'mint', ['up_quality', 'up_whyktm', full('up_warranty')]);
    cluster('galleryUrl', 'QR destination', 'blue', [full('qrDestinationType'), full('galleryUrl')]);
    const systemChoice = cluster('systemEnabled', 'Additional system', 'mint', [full('advancedSystemSelect')]);
    systemChoice.append($('selectedSystemCard'));
    $('advancedSystemSelect').closest('fieldset').querySelector('legend').after(systemChoice);
    const engineeringNote = cluster('tiltDeg', 'Proposal note', 'slate', [full('engineeringDesignNote')]);
    engFs.querySelector('legend').after(engineeringNote);

    // Existing technical/additional disclosures already own their conditional
    // controls. Tint their bodies in place; do not pull fields out of them.
    form.querySelectorAll('.eng-basis > .eng-group').forEach((group, i) => {
      group.dataset.tone = ['blue', 'sand', 'lavender', 'mint', 'slate', 'blue'][i % 6];
      group.classList.add('studio-tinted-disclosure');
    });
    form.querySelectorAll('#advContainer > .page-group').forEach(group => {
      group.dataset.tone = 'blue'; group.classList.add('studio-tinted-disclosure');
    });
    library.dataset.tone = 'slate'; library.classList.add('studio-tinted-disclosure');
    // Remove only now-empty row shells left by moving original fields.
    form.querySelectorAll('.studio-section .row2,.studio-section .row3').forEach(row => {
      if (!row.children.length) row.remove();
    });
    // Concise, authored helper copy only. Live statuses, assumptions and warnings
    // keep their elements and their existing renderer/validation ownership.
    $('equipmentEntryHint').textContent = 'Choose a make/model, or select Custom…';
    const shortLabels = {shareUrl:'Customer link (auto-created on save)', statYears:'Years in business', statProjects:'Completed projects', statCapacity:'Installed capacity', surveyWindow:'Survey wording'};
    Object.entries(shortLabels).forEach(([id, text]) => {
      const label = $(id)?.closest('.field')?.querySelector('label');
      if (label) label.textContent = text;
    });
    const subsidyNote = $('degradation').closest('.field').querySelector('.hint');
    function settingHelp(inputId, title, note) {
      if (!note) return;
      const help = element('details', 'studio-setting-help');
      help.dataset.settingHelp = inputId; help.id = inputId + 'Help';
      help.append(element('summary', '', title), note);
      $(inputId).closest('.studio-input-cluster').append(help);
      const input = $(inputId);
      input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), help.id].filter(Boolean).join(' '));
    }
    settingHelp('subsidyOverride', 'Subsidy basis & eligibility', subsidyNote);
    settingHelp('stateTopUp', 'State top-up eligibility', $('stateTopUp').closest('.field').querySelector('.hint'));
    const subsidyReminder = element('p', 'hint', 'Auto estimate — verify eligibility before sharing.');
    $('subsidyOverride').closest('.studio-input-cluster').querySelector('.studio-field-grid').after(subsidyReminder);
    companyHost.querySelector(':scope > .hint:not([id])')?.remove();
    const compareHint = $('optName').closest('fieldset').querySelector(':scope > .hint');
    if (compareHint) compareHint.textContent = 'Save 2+ designs to add a comparison page.';
    const bomHint = $('bomModules').closest('fieldset').querySelector(':scope > .hint');
    if (bomHint) bomHint.textContent = 'Optional itemised costs, before GST. Leave blank to omit the breakdown.';
    const reportsHint = $('pvsystUrl').closest('fieldset').querySelector(':scope > .hint');
    if (reportsHint) reportsHint.textContent = 'Links to externally prepared reports; no report content is generated.';

    const sectionTones = {
      custName: 'blue', moduleMake: 'mint', costPerWp: 'sand', payAdvance: 'sand',
      optName: 'lavender', bomModules: 'sand', pvsystUrl: 'blue', durationText: 'slate',
      companyName: 'rose', up_cover: 'rose', galleryUrl: 'blue', systemEnabled: 'mint', tiltDeg: 'slate'
    };
    form.querySelectorAll('.studio-section').forEach(section => {
      section.dataset.tone = sectionTones[section.dataset.section] || 'slate';
    });

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
      const family = id => {
        const seen = new Set();
        while (id && !seen.has(id)) { seen.add(id); const previous = window.Proposals.get(id)?.prevId; if (!previous) break; id = previous; }
        return id;
      };
      const activeFamily = family(active);
      const familyCloud = id => {
        const seen = new Set();
        while (id && !seen.has(id)) {
          seen.add(id);
          const cloud = window.CloudBridge?.cloudIdFor?.(id);
          if (cloud) return cloud;
          id = window.Proposals.get(id)?.prevId;
        }
        return null;
      };
      const activeCloud = familyCloud(active);
      const clash = (window.Proposals.list() || []).find(p => p.id !== active &&
        family(p.id) !== activeFamily && !(activeCloud && familyCloud(p.id) === activeCloud) &&
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
      overview.querySelector('[data-metric="investment"]').previousElementSibling.textContent=(window.Bess.included(state)||window.AdditionalSystems.included(state))?'Solar Project Cost':'Total Project Cost';
      overview.querySelector('[data-metric="investment"]').textContent = window.Finance.fmtINR(f.grossTotal);
      overview.querySelector('[data-metric="investment"]').title = 'Including GST, before estimated subsidy; optional upgrades priced separately';
      overview.querySelector('[data-metric="energy"]').textContent = window.Finance.fmtNum(f.annualGen) + ' kWh';
      overview.querySelector('[data-metric="energy"]').title = 'Estimated first-year annual generation';
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
      if(!window.Bess.enabled(state))$('bessInputStatus').textContent='No battery storage selected.';
      const sysSummary=document.querySelector('[data-section="systemEnabled"] summary small');
      if(sysSummary){const selected=[];if(window.AdditionalSystems.enabled(state))selected.push(window.AdditionalSystems.name(state));if(window.Bess.enabled(state))selected.push('Battery storage'+(state.bessCapacity?' · '+state.bessCapacity+' kWh':''));sysSummary.textContent=selected.join(' + ')||'Solar roofs, carports, controls & battery storage';}
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
       an internal note while the customer sees the proposal-stage qualification. The panel and the
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
      // Missing inputs are staff-only while customer PDFs use the proposal-stage note.
      // Keep all proven blockers and engineering advisories in the download gate.
      eng.notes.forEach((i) => add(merged.notes, i));
      const review = $('engineeringReview');
      if (review) {
        review.replaceChildren();
        const entries = [...eng.blocking.map(issue => ({issue, kind:'blocking'})),
          ...eng.advisory.map(issue => ({issue, kind:'advisory'})),
          ...eng.notes.map(issue => ({issue, kind:'note'}))];
        entries.forEach(({issue, kind}) => {
          const missing = /^DATA REQUIRED/.test(issue.message);
          const item = element('li', 'eng-review-item'); item.dataset.severity = kind;
          item.append(element('span', 'eng-review-tag', missing ? 'DATA REQUIRED' : kind === 'blocking' ? 'ACTION REQUIRED' : kind === 'advisory' ? 'REVIEW' : 'NOTE'),
            element('p', 'eng-review-copy', issue.message.replace(/^DATA REQUIRED\s*[-–—]?\s*/, '')));
          // Findings remain engine-owned. Navigate to the actual editable
          // controls, never spoof a pass by editing a generated warning.
          const sources = issue.id === 'dcCableLengthM'
            ? [['dcCableLengthM','Edit DC inputs'],['moduleVoc','String / datasheet inputs']]
            : issue.id === 'acCableLengthM'
              ? [['acCableLengthM','Edit AC inputs'],['inverterKw','Inverter rating']]
              : [[issue.id, issue.id === 'soilResistivity' ? 'Edit soil / earthing inputs' : 'Edit inputs']];
          const actions = element('div', 'eng-review-actions');
          sources.forEach(([id, label]) => {
            if (!$(id)) return;
            const action = element('button', 'link-btn', label);
            action.type = 'button'; action.dataset.reviewInput = id;
            action.addEventListener('click', () => reveal($(id)));
            actions.append(action);
          });
          if (actions.children.length) item.append(actions);
          review.append(item);
        });
        if (!review.children.length) review.append(element('li', '', 'No issues reported for the supplied inputs. Site verification is still required.'));
      }
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
      if(input.id==='systemEnabled'){input.closest('.studio-section').open=true;input=$('advancedSystemSelect');}
      if(input.id==='bessEnabled'){input.closest('.studio-section').open=true;input=$('advancedSystemSelect');}
      if (input.closest('[data-adv]')) $('modeAll').click();
      for (let parent = input.parentElement; parent && parent !== panel; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS') parent.open = true;
      }
      input.scrollIntoView({behavior: 'instant', block: 'center'}); input.focus({preventScroll: true});
    }
    form.addEventListener('click',event=>{const button=event.target.closest('[data-system-review-target]');if(button)reveal($(button.dataset.systemReviewTarget));});
    const searchInput = $('studioSearch'), results = $('studioSearchResults'), clear = search.querySelector('button');
    const notice = element('p', 'studio-search-notice');
    notice.setAttribute('role', 'status'); notice.hidden = true; search.after(notice);
    searchInput.placeholder = 'Search any field, option, upload or action…';
    searchInput.setAttribute('aria-expanded', 'false');
    results.querySelector('p').setAttribute('aria-live', 'polite');
    function clearSearch() {
      searchInput.value = ''; results.hidden = true; clear.hidden = true;
      searchInput.setAttribute('aria-expanded', 'false');
    }
    const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
    const normalize = value => clean(value).replace(/₹/g, ' rupees ').replace(/%/g, ' percent ').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    function titleOf(details) {
      const summary = details.querySelector(':scope > summary');
      return clean(summary?.querySelector('strong')?.textContent || summary?.textContent);
    }
    function entryFor(input) {
      const field = input.closest('.field');
      const isAction = input.matches('button,a');
      const libraryRow = input.closest('.eq-row');
      const libraryFields = {make:'Make', wp:'Rating Wp', kw:'Rating kW', lengthMm:'Length mm', widthMm:'Width mm', tech:'Technology', label:'Name'};
      const libraryLabel = libraryRow ? libraryRow.dataset.kind + ' ' + (libraryFields[input.dataset.f] || input.dataset.f || '') : '';
      const actionLabel = clean(input.textContent) === '×' ? input.title || 'Remove' : input.textContent;
      const label = clean(input.getAttribute('aria-label') || (input.tagName === 'SUMMARY' ? titleOf(input.parentElement) :
        isAction ? actionLabel : input.labels?.[0]?.textContent || field?.querySelector('label')?.textContent || libraryLabel || input.placeholder || input.id || input.name));
      if (!label) return null;
      const path = [];
      for (let parent = input.parentElement; parent && parent !== panel; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS' && input !== parent.querySelector(':scope > summary')) path.unshift(titleOf(parent));
      }
      const group = input.closest('.studio-input-cluster,.system-input-group');
      const groupTitle = clean(group?.querySelector(':scope > h3')?.textContent);
      if (groupTitle) path.push(groupTitle);
      const itemTitle = clean(input.closest('.item-block')?.querySelector(':scope > .item-title')?.textContent);
      if (itemTitle) path.push(itemTitle);
      if (libraryRow) path.push(libraryRow.dataset.kind + ' library row ' + (Number(libraryRow.dataset.idx) + 1));
      const section = path.filter(Boolean).join(' › ') || 'Proposal tools';
      // Index authored metadata, never customer text, URLs, prices or file names.
      const hint = clean(field?.querySelector('.hint:not([id])')?.textContent);
      const options = input.tagName === 'SELECT' ? [...input.options].filter(o => !o.hidden && !o.disabled).map(o => clean(o.textContent)) : [];
      // Proposal names are customer data, not static setting choices.
      if (input.id === 'proposalSelect') options.length = 0;
      const fieldAliases = {
        costPerWp: 'price pricing rate cost per watt', custName: 'client consumer name',
        custAddress: 'location site address', capacity: 'system size kilowatt',
        moduleMake: 'solar panel manufacturer brand', moduleWattage: 'panel wattage watts rating',
        inverterMake: 'inverter manufacturer brand', cableMake: 'cables wiring cable brand',
        galleryUrl: 'QR code qrcode link', tariff: 'electricity unit rate'
      };
      const aliases = (fieldAliases[input.id] || '') + (input.closest('[data-section="systemEnabled"]') ? ' additional systems additionals additions add-ons addons battery storage' : '');
      const keywords = [aliases, input.id, input.id.replace(/([a-z])([A-Z])/g, '$1 $2'), input.name, input.title, input.placeholder,
        input.dataset.page, input.dataset.key, hint, input.id ? form.querySelector('[data-setting-help="' + input.id + '"]')?.textContent : '', ...options].join(' ');
      return {input, label, section, options, text: normalize(label + ' ' + section + ' ' + keywords), primary: normalize(label)};
    }
    function searchEntries() {
      const native = [...panel.querySelectorAll('input,select,textarea,button,a[href],summary')].filter(input =>
        !input.closest('.studio-search,.studio-overview,.studio-feedback') &&
        !input.matches('[type="hidden"],#systemEnabled,#bessEnabled,#systemTemplate,[data-bess-choice],[data-system-choice]')
      ).map(entryFor).filter(Boolean);
      const documentText = (window.DocumentStudio?.searchEntries?.() || []).map(item=>({...item,options:[],text:normalize(item.label+' '+item.section),primary:normalize(item.label)}));
      return [...native,...documentText];
    }
    function visible(input) {
      return input && !input.disabled && input.getClientRects().length > 0 && !input.closest('[hidden]');
    }
    function navigate(item) {
      clearSearch(); notice.hidden = true;
      let target = item.input;
      if (target.matches('input[type="file"]')) target = target.labels?.[0] || target;
      reveal(target);
      if (!visible(target)) {
        const custom = item.input.closest('.equipment-custom');
        let controller = custom ? $(custom.id.replace(/CustomWrap$/, '')) : null;
        const routes = [
          ['bessEconomics', 'bessUseCase'], ['bessBackupInputs', 'bessSizing'],
          ['bessCustomIdentity', 'bessModel'], ['bessAutoSetup', 'bessModel'],
          ['systemWaterTankField', 'systemWaterRoute'], ['systemWaterFields', 'systemWaterEnabled'],
          ['rwaEligibilityField', 'customerType']
        ];
        for (const [container, id] of routes) {
          if (!controller && $(container)?.contains(item.input) && visible($(id))) controller = $(id);
        }
        if (!controller && /^(bess|system)/.test(item.input.id)) controller = $('advancedSystemSelect');
        // Fall back to a visible owning disclosure, never force hidden fields on.
        if (!visible(controller)) controller = item.input.closest('.studio-section')?.querySelector(':scope > summary');
        if (!controller) controller = item.input.closest('details')?.querySelector(':scope > summary');
        if (controller) { reveal(controller); target = controller; }
        notice.textContent = item.label + ' is conditional or unavailable. ' +
          (custom ? 'Choose Custom… in the highlighted dropdown first.' : 'Use the highlighted section’s setup controls first; search has not enabled or changed anything.');
        const anchor = target?.closest('.field') || target?.closest('.studio-section')?.querySelector(':scope > fieldset');
        if (anchor) anchor.before(notice);
        notice.hidden = false;
      }
      panel.querySelectorAll('.studio-search-target').forEach(el => el.classList.remove('studio-search-target'));
      if (target) {
        target.classList.add('studio-search-target');
        setTimeout(() => target.classList.remove('studio-search-target'), 3000);
      }
    }
    function find() {
      const query = normalize(searchInput.value), words = query.split(/\s+/).filter(Boolean);
      clear.hidden = !searchInput.value; results.hidden = !query; notice.hidden = true;
      searchInput.setAttribute('aria-expanded', String(!!query));
      const list = results.querySelector('ul'); list.replaceChildren();
      if (!query) return;
      const matches = searchEntries().filter(item => words.every(word => item.text.includes(word)));
      // Exact field labels win over hints, options and section matches.
      const score = item => item.primary === query ? 0 : words.every(w => item.primary.includes(w)) ? 1 : 2;
      matches.sort((a, b) => score(a) - score(b));
      results.querySelector('p').textContent = matches.length ? matches.length + ' matching settings & tools · all results below' : 'No matching settings. Try “tariff”, “module” or “QR”.';
      matches.forEach(item => {
        const li = element('li'), button = element('button'); button.type = 'button';
        if (item.input?.id) button.dataset.searchTarget = item.input.id;
        button.append(element('strong', '', item.label), element('small', '', item.section));
        const option = item.options.find(text => words.some(word => normalize(text).includes(word)));
        if (option && !words.every(word => item.primary.includes(word))) button.append(element('small', 'studio-search-option', 'Option: ' + option + ' · choose in dropdown'));
        if (item.input && (item.input.closest('[hidden]') || item.input.disabled)) button.append(element('small', '', 'Conditional setting · opens setup, does not enable it'));
        if (item.input?.matches('button,a,input[type="file"]')) button.append(element('small', '', 'Locate only · does not run this action'));
        button.addEventListener('click', () => {if(item.activate){clearSearch();item.activate();}else navigate(item);}); li.append(button); list.append(li);
      });
    }
    searchInput.addEventListener('input', find);
    clear.addEventListener('click', () => { clearSearch(); notice.hidden = true; searchInput.focus(); });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { clearSearch(); notice.hidden = true; e.stopPropagation(); }
      if (e.key === 'ArrowDown') { const first = results.querySelector('button'); if (first && !results.hidden) { e.preventDefault(); first.focus(); } }
      if (e.key === 'Enter') { const first = results.querySelector('button'); if (first && !results.hidden) { e.preventDefault(); first.click(); } }
    });
    results.addEventListener('keydown', e => {
      const buttons = [...results.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
      if (e.key === 'Escape') { clearSearch(); searchInput.focus(); e.stopPropagation(); }
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault(); const next = index + (e.key === 'ArrowDown' ? 1 : -1);
        (next < 0 ? searchInput : buttons[Math.min(next, buttons.length - 1)])?.focus();
      }
    });
    document.addEventListener('qs:rendered', update);window.AdditionalSystems.sync(window.Render.lastState||window.Render.readState());update();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
