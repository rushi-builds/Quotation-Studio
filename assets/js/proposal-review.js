/* Builder-only review workspace. Reads current quote/preflight/document data;
 * never owns quote values or approval. Spreadsheet export is local-only. */
'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const button = (text, action, cls = 'qrw-button') => {
    const n = el('button', cls, text); n.type = 'button';
    n.addEventListener('click', action); return n;
  };
  function boot() {
    const panel = document.querySelector('.form-panel.studio-ready');
    if (!panel || !window.DocumentStudio?.overview || $('proposalReviewDialog')) return;
    const launcher = button('', open, 'qrw-launch'); launcher.id = 'proposalReviewButton';
    launcher.setAttribute('aria-haspopup', 'dialog'); launcher.setAttribute('aria-controls', 'proposalReviewDialog');
    const launchIcon = el('span', 'qrw-launch-icon'); launchIcon.setAttribute('aria-hidden', 'true');
    // Local vector, not a font/platform-dependent symbol.
    launchIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 11h6M9 15h6M9 18h3"/></svg>';
    const launchCopy = el('span', 'qrw-launch-copy'), launchStatus = el('small');
    launchCopy.append(el('strong', '', 'Review & pages'), launchStatus);
    launcher.append(launchIcon, launchCopy, el('span', 'qrw-launch-arrow', '↗'));
    panel.insertBefore(launcher, $('quoteForm'));

    const dialog = el('dialog', 'qrw'); dialog.id = 'proposalReviewDialog';
    dialog.setAttribute('aria-labelledby', 'proposalReviewTitle');
    dialog.setAttribute('aria-describedby', 'proposalReviewDescription');
    const shell = el('div', 'qrw-shell'), header = el('header', 'qrw-header'), title = el('div');
    title.append(el('span', 'qrw-eyebrow', 'PROPOSAL WORKSPACE'));
    const heading = el('h2', '', 'Before you share.'); heading.id = 'proposalReviewTitle'; title.append(heading);
    const description = el('p', '', 'Review the current inputs and see exactly which pages are included.');
    description.id = 'proposalReviewDescription'; title.append(description);
    const close = button('×', () => dialog.close(), 'qrw-close'); close.setAttribute('aria-label', 'Close proposal review');
    header.append(title, close);
    const context = el('div', 'qrw-context'), reference = el('strong'), customer = el('span');
    context.append(reference, customer);
    const tabs = el('div', 'qrw-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Proposal workspace');
    const reviewTab = button('Review', () => selectTab('review')), pagesTab = button('Page overview', () => selectTab('pages'));
    for (const [tab, key] of [[reviewTab, 'review'], [pagesTab, 'pages']]) {
      tab.id = 'qrw-' + key + '-tab'; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'qrw-' + key);
      tabs.append(tab);
    }
    const body = el('div', 'qrw-body'), main = el('div', 'qrw-main'), sidebar = el('aside', 'qrw-output');
    sidebar.setAttribute('aria-label', 'Selected PDF output');
    const reviewPanel = el('section', 'qrw-review'); reviewPanel.id = 'qrw-review';
    const pagesPanel = el('section', 'qrw-pages'); pagesPanel.id = 'qrw-pages';
    for (const [node, key] of [[reviewPanel, 'review'], [pagesPanel, 'pages']]) {
      node.setAttribute('role', 'tabpanel'); node.setAttribute('aria-labelledby', 'qrw-' + key + '-tab'); node.tabIndex = 0;
    }
    const reviewContent = el('div'); reviewPanel.append(reviewContent);
    const pageHeading = el('div', 'qrw-section-heading'); pageHeading.append(el('h3', '', 'Your document, page by page.'));
    const pageIntro = el('p', 'qrw-muted', 'View an included page or open its existing editor. Nothing here adds or removes pages.');
    const pageFilter = el('input'); pageFilter.type = 'search'; pageFilter.id = 'qrwPageFilter'; pageFilter.placeholder = 'Find a page…';
    const filterLabel = el('label', 'qrw-filter-label', 'Find a page'); filterLabel.htmlFor = pageFilter.id;
    const pageList = el('div', 'qrw-page-list'), pageCount = el('p', 'qrw-muted'); pageCount.setAttribute('role', 'status');
    pagesPanel.append(pageHeading, pageIntro, filterLabel, pageFilter, pageCount, pageList);
    main.append(reviewPanel, pagesPanel); body.append(main, sidebar);
    const footer = el('footer', 'qrw-footer');
    footer.append(el('p', '', 'Input checks are not engineering approval, subsidy approval or a guarantee of site performance.'), button('Back to builder', () => dialog.close()));
    shell.append(header, context, tabs, body, footer); dialog.append(shell); document.body.append(dialog);

    let activeTab = 'review', model, restoreFocus = true, pending = 0, returnTo = launcher;
    // PDF format remains in its original builder footer. This sidebar slot
    // provides a distinct, local-only Excel-compatible quotation snapshot.
    const outputTitle = el('h3'), sheetTotal = el('strong'), total = el('div', 'qrw-sheet-total');
    total.append(sheetTotal, el('span', '', 'A4 sheets'));
    const outputMetrics = el('dl', 'qrw-output-metrics');
    const spreadsheetCard = el('section', 'qrw-spreadsheet-card'); spreadsheetCard.id = 'qrwSpreadsheetCard';
    spreadsheetCard.append(el('span', 'qrw-eyebrow', 'LIVE QUOTE SNAPSHOT'), el('h3', '', 'Excel review sheet'));
    const spreadsheetHelp = el('p', 'qrw-muted', 'Download current quotation inputs, finance estimates, existing review checks and page list as an Excel-ready CSV.');
    spreadsheetHelp.id = 'qrwSpreadsheetHelp'; spreadsheetCard.append(spreadsheetHelp);
    const spreadsheetButton = button('', () => { void exportSpreadsheet(); }, 'qrw-export-button');
    const spreadsheetIcon = el('span', 'qrw-export-icon'); spreadsheetIcon.setAttribute('aria-hidden', 'true');
    spreadsheetIcon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3.5h10l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20z"/><path d="M15 3.5V8h4M8 11h8M8 14.5h8M8 18h8"/></svg>';
    spreadsheetButton.append(spreadsheetIcon, el('span', '', 'Download review sheet'), el('span', 'qrw-file-badge', 'CSV'));
    spreadsheetButton.id = 'qrwExportSpreadsheet'; spreadsheetButton.setAttribute('aria-label', 'Download Excel-ready review sheet as CSV'); spreadsheetButton.setAttribute('aria-describedby', spreadsheetHelp.id);
    const spreadsheetMeta = el('span', 'qrw-spreadsheet-meta', 'Inputs · estimates · checks · page manifest');
    const spreadsheetStatus = el('p', 'qrw-spreadsheet-status', 'Generated in this browser only. Nothing is uploaded or saved to the quotation.');
    spreadsheetStatus.id = 'qrwSpreadsheetStatus'; spreadsheetStatus.setAttribute('role', 'status'); spreadsheetStatus.setAttribute('aria-live', 'polite');
    spreadsheetCard.append(spreadsheetButton, spreadsheetMeta, spreadsheetStatus);
    const saveContext = el('div', 'qrw-save-context'), saveText = el('p');
    saveContext.append(el('span', 'qrw-eyebrow', 'SAVE STATUS'), saveText);
    const powerHint = el('p', 'qrw-muted', 'Power is a separate report. Open its editor to view the existing Power preview.'); powerHint.hidden = true;
    sidebar.append(el('span', 'qrw-eyebrow', 'SELECTED PDF OUTPUT'), outputTitle, total, outputMetrics, spreadsheetCard,
      saveContext, el('p', 'qrw-muted', 'Uses the current builder inputs and existing document checks. The spreadsheet is a local snapshot, not an approval or a saved quotation.'), powerHint);

    function csvCell(value) {
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      let text = value == null ? '' : String(value);
      // Prevent spreadsheet formula execution from customer-entered text.
      if (/^[\u0000-\u0020\u00a0\u2000-\u200a]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    }
    function spreadsheetRows() {
      const s = window.Render.lastState || {};
      let finance = {};
      try { finance = window.Finance?.compute ? window.Finance.compute(s) : {}; } catch (_) { /* Keep the source-value export available if estimates are invalid. */ }
      const selectedCategory = $('customerType')?.selectedOptions?.[0]?.textContent || s.customerType || '';
      const selectedOutput = $('pdfFormat')?.selectedOptions?.[0]?.textContent || 'Detailed proposal';
      const finite = value => value === '' || value == null ? '' : Number.isFinite(Number(value)) ? Number(value) : '';
      const rows = [
        ['QUOTATION STUDIO', 'LIVE REVIEW SNAPSHOT'],
        ['Generated (UTC)', new Date().toISOString()],
        ['Source', 'Current builder inputs · generated locally · no upload'],
        [],
        ['QUOTE DETAILS'],
        ['Reference', s.propRef || 'Not assigned'], ['Version', s.propVersion || '1.0'],
        ['Proposal date', s.propDate || 'Not entered'], ['Customer', s.custName || 'Not entered'],
        ['Site address', s.custAddress || 'Not entered'], ['Customer category', selectedCategory],
        ['System capacity (kWp)', finite(s.capacity)], ['Solar module make', s.moduleMake || 'Not selected'],
        ['Solar module model', s.moduleModel || 'Not selected'], ['Solar module rating (Wp)', finite(s.moduleWattage)],
        ['Inverter make', s.inverterMake || 'Not selected'], ['Inverter model', s.inverterModel || 'Not selected'],
        ['Inverter rating (kW)', finite(s.inverterKw)], ['Selected PDF output', selectedOutput],
        ['Included A4 sheets', finite(model?.total)], [],
        ['FINANCE ENGINE OUTPUT · ESTIMATES · INR'],
        ['Gross project total', finite(finance.grossTotal)], ['Estimated subsidy', finite(finance.subsidy)],
        ['Estimated net investment', finite(finance.netInvestment)],
        ['Note', 'Current finance-engine estimates only. Verify assumptions, eligibility and terms in the proposal.'], [],
        ['EXISTING REVIEW CHECKS'], ['Type', 'Message']
      ];
      for (const issue of model?.blocking || []) rows.push(['PDF blocker', issue.message]);
      for (const issue of model?.advisory || []) rows.push(['Advisory', issue.message]);
      for (const issue of model?.notes || []) rows.push(['Engineering input note', issue.message]);
      if (!model?.blocking?.length) rows.push(['PDF blocker', 'None reported by existing checks']);
      if (!model?.advisory?.length) rows.push(['Advisory', 'None reported by existing checks']);
      rows.push([], ['PROPOSAL PAGE MANIFEST'], ['Page', 'Included in selected output', 'A4 sheet numbers', 'Saved presentation edits']);
      for (const page of model?.rows || []) {
        rows.push([page.title, page.included ? 'Yes' : 'No', (page.pages || []).map(p => p.number).filter(Number.isFinite).join(', '), editSummary(page)]);
      }
      return rows;
    }
    async function exportSpreadsheet() {
      spreadsheetButton.disabled = true; spreadsheetStatus.textContent = 'Building the live snapshot and calculating its SHA-256 fingerprint…';
      let objectUrl;
      try {
        const rows = spreadsheetRows();
        const content = rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
        let digest = 'not available';
        if (window.crypto?.subtle && window.TextEncoder) {
          const bytes = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
          digest = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        }
        const csv = '\ufeff' + content + [
          ['INTEGRITY', 'SHA-256 of all preceding rows', digest].map(csvCell).join(',')
        ].join('\r\n') + '\r\n';
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }); objectUrl = URL.createObjectURL(blob);
        const link = el('a');
        const ref = String(window.Render.lastState?.propRef || 'quotation').toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'quotation';
        link.href = objectUrl; link.download = 'quotation-review-' + ref + '-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.append(link); link.click(); link.remove();
        spreadsheetStatus.textContent = 'Downloaded ' + link.download + ' · SHA-256 ' + (digest === 'not available' ? digest : digest.slice(0, 16) + '…') + ' · no data uploaded.';
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      } catch (error) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        spreadsheetStatus.textContent = 'Snapshot could not be created. Your quotation has not been changed.';
        console.error('Quotation spreadsheet snapshot failed:', error);
      } finally { spreadsheetButton.disabled = false; }
    }

    function selectTab(key) {
      activeTab = key;
      for (const [tab, id] of [[reviewTab, 'review'], [pagesTab, 'pages']]) {
        tab.setAttribute('aria-selected', String(id === key)); tab.tabIndex = id === key ? 0 : -1;
      }
      reviewPanel.hidden = key !== 'review'; pagesPanel.hidden = key !== 'pages';
    }
    tabs.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const key = event.key === 'Home' ? 'review' : event.key === 'End' ? 'pages' : activeTab === 'review' ? 'pages' : 'review';
      selectTab(key); (key === 'review' ? reviewTab : pagesTab).focus();
    });
    function navigate(action) { restoreFocus = false; dialog.close(); action(); }
    function viewPage(id) {
      const index = window.Render.lastVisible.findIndex(p => p.id === id);
      if (index < 0) return;
      navigate(() => {
        const chip = $('pageNav')?.querySelectorAll('.nav-chip')[index];
        if (chip) { chip.click(); chip.focus({ preventScroll: true }); }
        else $(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
      });
    }
    function sourceTarget(id) {
      let target = $(id);
      if (!target) return null;
      if (target.closest('[hidden]') || target.disabled) {
        // Locate setup, never reveal/enable a hidden conditional input.
        if (target.closest('[data-section="systemEnabled"]')) target = $('advancedSystemSelect');
        else return null;
      }
      return target;
    }
    function issueGroup(title, kind, issues, note = '') {
      const group = el('section', 'qrw-issue-group qrw-' + kind), head = el('div', 'qrw-section-heading');
      head.append(el('h3', '', title), el('span', 'qrw-count', String(issues.length))); group.append(head);
      if (note) group.append(el('p', 'qrw-muted', note));
      const list = el('ul');
      for (const issue of issues) {
        const item = el('li', 'qrw-finding'); item.append(el('p', '', issue.message));
        const target = sourceTarget(issue.id);
        if (target) {
          const action = button(target.matches('.page') ? 'View page ↗' : 'Open source ↗', () => {
            if (target.matches('.page')) viewPage(target.id);
            else navigate(() => window.__qsPreflight.reveal(target.id));
          }, 'qrw-text-button');
          action.dataset.reviewSource = target.id; item.append(action);
        } else item.append(el('small', 'qrw-muted', 'Review in the original input section; this control may be conditional.'));
        list.append(item);
      }
      group.append(list); return group;
    }
    function readModel() {
      const format = $('pdfFormat')?.value || 'full';
      const output = window.DocumentStudio.overview(format);
      const issues = window.__qsPreflight.issues();
      return { ...output, blocking: issues.blocking || [], advisory: issues.advisory || [], notes: window.__qsPreflight.notes?.() || [] };
    }
    const detailIssueAliases = {
      custName: ['custName'], custAddress: ['custAddress'], customerType: ['customerType'], capacity: ['capacity'],
      moduleMake: ['moduleMake', 'moduleModel', 'moduleWattage', 'moduleTech'],
      inverterMake: ['inverterMake', 'inverterModel', 'inverterKw']
    };
    function detailIssue(ids) {
      const keys = Array.isArray(ids) ? ids : detailIssueAliases[ids] || [ids];
      const blocker = model?.blocking?.find(issue => keys.includes(issue.id));
      if (blocker) return { ...blocker, kind: 'blocker' };
      const advisory = model?.advisory?.find(issue => keys.includes(issue.id));
      return advisory ? { ...advisory, kind: 'advisory' } : null;
    }
    function keyDetailRows() {
      const state = window.Render.lastState || {};
      const defaults = window.StateStore?.DEFAULTS || {};
      const same = (id) => String(state[id] ?? '').trim().toLocaleLowerCase() === String(defaults[id] ?? '').trim().toLocaleLowerCase();
      const isTemplateCapacity = Number(state.capacity) > 0 && Number(state.capacity) === Number(defaults.capacity);
      const capacity = Number(state.capacity) > 0 && Number.isFinite(Number(state.capacity))
        ? Number(state.capacity).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' kWp'
        : (state.capacity ? String(state.capacity) : 'Not entered');
      const customerName = String(state.custName || '').trim();
      const siteAddress = String(state.custAddress || '').trim();
      const moduleMake = String(state.moduleMake || '').trim(), moduleModel = String(state.moduleModel || '').trim();
      const inverterMake = String(state.inverterMake || '').trim(), inverterModel = String(state.inverterModel || '').trim();
      const module = [moduleMake || 'Make not selected', moduleModel || 'Model not selected', state.moduleWattage ? state.moduleWattage + ' Wp' : 'Rating not entered'].join(' · ');
      const inverter = [inverterMake || 'Make not selected', inverterModel || 'Model not selected'].join(' · ');
      const customerType = $('customerType')?.selectedOptions?.[0]?.textContent || String(state.customerType || 'Not selected');
      const defaultModule = ['moduleMake', 'moduleModel', 'moduleWattage', 'moduleTech'].every(same);
      const defaultInverter = ['inverterMake', 'inverterModel'].every(same);
      const status = (ids, fallback) => {
        const issue = detailIssue(ids);
        return issue ? (issue.kind === 'blocker' ? 'PDF blocker · ' : 'Review recommended · ') + issue.message : fallback;
      };
      const tone = (ids, fallback) => detailIssue(ids) ? 'attention' : fallback;
      return [
        { id: 'custName', label: 'Customer name', value: customerName || 'Not entered', status: status('custName', customerName ? 'Entered' : 'Required · add before sharing'), tone: tone('custName', customerName ? 'neutral' : 'missing') },
        { id: 'custAddress', label: 'Site address', value: siteAddress || 'Not entered', status: status('custAddress', siteAddress ? 'Entered' : 'Not entered · optional if available'), tone: tone('custAddress', 'neutral') },
        { id: 'customerType', label: 'Customer category', value: customerType, status: status('customerType', same('customerType') ? 'Template default · confirm category' : 'Selected · confirm category'), tone: tone('customerType', same('customerType') ? 'attention' : 'neutral') },
        { id: 'capacity', label: 'System capacity', value: capacity, status: status('capacity', isTemplateCapacity ? 'Template default · confirm or change' : Number(state.capacity) > 0 ? 'Entered · verify against design' : 'Needs a valid capacity'), tone: tone('capacity', isTemplateCapacity || !(Number(state.capacity) > 0) ? 'attention' : 'neutral') },
        { id: 'moduleMake', label: 'Solar module', value: module, status: status('moduleMake', !moduleModel ? 'Model not selected · choose catalogue model' : defaultModule ? 'Template selection · confirm model' : 'Selected · verify model and rating'), tone: tone('moduleMake', !moduleModel || defaultModule ? 'attention' : 'neutral') },
        { id: 'inverterMake', label: 'Inverter', value: inverter, status: status('inverterMake', !inverterModel ? 'Model not selected · choose catalogue model' : defaultInverter ? 'Template selection · confirm model' : 'Selected · verify model'), tone: tone('inverterMake', !inverterModel || defaultInverter ? 'attention' : 'neutral') }
      ];
    }
    function attentionItems() {
      const details = keyDetailRows(), groups = new Map();
      for (const detail of details) if (detail.tone === 'attention' || detail.tone === 'missing') groups.set('detail:' + detail.id, detail);
      for (const issue of [...model.blocking, ...model.advisory]) {
        const group = details.find(detail => (detailIssueAliases[detail.id] || []).includes(issue.id));
        groups.set(group ? 'detail:' + group.id : 'issue:' + (issue.id || issue.message), group || issue);
      }
      const represented = issue => details.some(detail => (detailIssueAliases[detail.id] || []).includes(issue.id));
      const requiredNotes = model.notes.filter(note => /^DATA REQUIRED(?:\s|[-–—]|$)/i.test(String(note.message || '').trim()));
      for (const note of requiredNotes) groups.set('note:' + (note.id || note.message), note);
      return {
        details, requiredNotes, count: groups.size,
        extraBlocking: model.blocking.filter(issue => !represented(issue)),
        extraAdvisory: model.advisory.filter(issue => !represented(issue))
      };
    }
    function renderKeyDetails(details = keyDetailRows()) {
      const section = el('section', 'qrw-key-details'); section.id = 'qrwKeyDetails';
      section.append(el('h3', '', 'Key quotation details'));
      section.append(el('p', 'qrw-muted', 'Live from the current inputs. Prefilled template values are flagged to confirm or change; these reminders do not add PDF blockers.'));
      const list = el('ul', 'qrw-key-detail-list');
      for (const detail of details) {
        const item = el('li', 'qrw-key-detail qrw-detail-' + detail.tone); item.dataset.reviewDetail = detail.id;
        const copy = el('div', 'qrw-key-detail-copy');
        copy.append(el('span', 'qrw-key-detail-label', detail.label), el('strong', 'qrw-key-detail-value', detail.value), el('span', 'qrw-key-detail-status', detail.status));
        item.append(copy);
        const target = sourceTarget(detail.id);
        if (target) {
          const action = button('Open source ↗', () => navigate(() => window.__qsPreflight.reveal(target.id)), 'qrw-text-button');
          action.dataset.reviewSource = target.id; item.append(action);
        } else item.append(el('small', 'qrw-muted', 'Review in the original input section.'));
        list.append(item);
      }
      section.append(list); return section;
    }
    function renderReview() {
      reviewContent.replaceChildren();
      const attention = attentionItems();
      const summary = el('section', 'qrw-attention-summary ' + (model.blocking.length ? 'qrw-attention-blocked' : attention.count ? 'qrw-attention-review' : 'qrw-clear'));
      summary.dataset.blockers = String(model.blocking.length > 0);
      summary.setAttribute('aria-live', 'polite');
      const heading = el('div', 'qrw-section-heading');
      heading.append(el('h3', '', 'Items to resolve'), el('span', 'qrw-count', String(attention.count)));
      const blockerLabel = model.blocking.length === 1 ? '1 PDF export blocker' : model.blocking.length ? model.blocking.length + ' PDF export blockers' : 'no PDF export blockers';
      const requiredLabel = attention.requiredNotes.length === 0 ? 'no engineering inputs required' : attention.requiredNotes.length === 1 ? '1 engineering input required' : attention.requiredNotes.length + ' engineering inputs required';
      const summaryText = attention.count
        ? attention.count + (attention.count === 1 ? ' item remains' : ' items remain') + ' · ' + blockerLabel + ' · ' + requiredLabel + '. Resolve an item and this count updates live.'
        : 'All good · ready to export. No unresolved blockers or flagged inputs. Engineering and site verification still applies; this is not design approval.';
      summary.append(el('span', 'qrw-eyebrow', 'LIVE REVIEW COUNT'), heading, el('p', 'qrw-muted', summaryText));
      reviewContent.append(summary);
      if (attention.extraBlocking.length) reviewContent.append(issueGroup('Additional PDF blockers', 'blocking', attention.extraBlocking, 'These existing export checks are not represented by a key-detail row.'));
      if (attention.extraAdvisory.length) reviewContent.append(issueGroup('Review recommended', 'advisory', attention.extraAdvisory, 'Advisories come from the current preflight, not a new scoring system.'));
      reviewContent.append(renderKeyDetails(attention.details));
      const notes = el('details', 'qrw-notes'); notes.open = attention.requiredNotes.length > 0;
      notes.append(el('summary', '', 'Engineering input notes · ' + model.notes.length));
      if (model.notes.length) {
        const group = issueGroup('Site verification & input notes', 'note', model.notes, 'Internal notes are not additional export blockers.');
        if ($('eqCatalog') && model.notes.some(issue => ['dcCableLengthM', 'acCableLengthM', 'soilResistivity'].includes(issue.id))) {
          const excel = el('div', 'qrw-excel-inputs');
          const help = el('p', 'qrw-muted', 'Use the Excel quotation / BOM software, then enter its results in the source fields below. Site measurements, including soil resistivity, still need verification. Opens Excel access only; no auto-fill or Sync.');
          help.id = 'qrwExcelInputHelp';
          const action = button('Get input values from Excel ↗', () => navigate(() => window.__qsPreflight.reveal('eqCatalog')));
          action.id = 'qrwExcelInputs'; action.setAttribute('aria-describedby', help.id);
          excel.append(action, help); group.querySelector('ul').before(excel);
        }
        notes.append(group);
      }
      else notes.append(el('p', 'qrw-muted', 'No input notes reported by the existing engineering checks. Site verification is still required.'));
      reviewContent.append(notes);
      const changes = model.rows.filter(r => r.edited || r.excluded || r.custom);
      const changeSection = el('section', 'qrw-changes');
      const head = el('div', 'qrw-section-heading'); head.append(el('h3', '', 'Presentation edits'), el('span', 'qrw-count', String(changes.length)));
      changeSection.append(head, el('p', 'qrw-muted', changes.length ? 'Saved page-level edits in this output; this is not a comparison against a published version.' : 'No saved page-level edits or removals. Live quotation details are listed above.'));
      if (changes.length) {
        const list = el('ul');
        for (const row of changes) { const li = el('li'); li.append(el('strong', '', row.title), el('span', 'qrw-muted', editSummary(row))); list.append(li); }
        changeSection.append(list, button('Inspect pages', () => { selectTab('pages'); pagesTab.focus(); }, 'qrw-text-button'));
      }
      reviewContent.append(changeSection);
    }
    function editSummary(row) {
      const parts = [];
      if (row.custom) parts.push('Added page');
      if (row.excluded) parts.push('Page removed');
      if (row.textOverrides) parts.push(row.textOverrides + ' saved text override' + (row.textOverrides === 1 ? '' : 's'));
      if (row.removedBlocks) parts.push(row.removedBlocks + ' removed section' + (row.removedBlocks === 1 ? '' : 's'));
      if (row.addedBlocks) parts.push(row.addedBlocks + ' added section' + (row.addedBlocks === 1 ? '' : 's'));
      return parts.join(' · ') || 'Original page structure';
    }
    function renderPages() {
      if (!model) return;
      const query = pageFilter.value.trim().toLocaleLowerCase();
      const rows = model.rows.filter(r => r.title.toLocaleLowerCase().includes(query));
      const included = rows.filter(r => r.included).sort((a, b) => a.pages[0].number - b.pages[0].number), other = rows.filter(r => !r.included);
      pageList.replaceChildren();
      pageCount.textContent = query ? rows.length + ' matching page definition' + (rows.length === 1 ? '' : 's') : model.total + ' included A4 sheets · ' + other.length + ' page definitions not included';
      if (!rows.length) { pageList.append(el('p', 'qrw-empty', 'No matching pages. Try another page title.')); return; }
      function rowNode(row) {
        const item = el('article', 'qrw-page'); item.dataset.reviewPage = row.id;
        const activeIndex = [...($('pageNav')?.querySelectorAll('.nav-chip') || [])].findIndex(n => n.classList.contains('active'));
        const activePage = window.Render.lastVisible[activeIndex]?.id || window.__qsLastPageId;
        const current = model.format !== 'power' && row.pages.some(p => p.id === activePage);
        if (current) item.setAttribute('aria-current', 'page');
        const number = el('span', 'qrw-page-number', row.included ? String(row.pages[0].number).padStart(2, '0') : '—');
        const copy = el('div', 'qrw-page-copy'); copy.append(el('h4', '', row.title));
        const states = el('div', 'qrw-page-states');
        states.append(el('span', row.included ? 'qrw-tag' : 'qrw-tag qrw-tag-muted', row.included ? 'Included' : row.excluded ? 'Removed' : 'Not included · optional'));
        if (current) states.append(el('span', 'qrw-tag qrw-tag-current', 'In preview'));
        if (row.edited) states.append(el('span', 'qrw-tag qrw-tag-edited', 'Saved edits'));
        if (row.custom) states.append(el('span', 'qrw-tag qrw-tag-edited', 'Added page'));
        copy.append(states);
        if (row.edited || row.excluded || row.custom) copy.append(el('small', 'qrw-muted', editSummary(row)));
        const continuations = row.pages.filter(p => p.continuation);
        if (continuations.length) {
          copy.append(el('small', 'qrw-continuation', 'Continues on ' + continuations.map(p => 'page ' + p.number).join(', ')));
          if (model.format !== 'power') {
            const links = el('div', 'qrw-continuation-links');
            continuations.forEach(p => links.append(button('View page ' + p.number + ' ↗', () => viewPage(p.id), 'qrw-text-button')));
            copy.append(links);
          }
        }
        const actions = el('div', 'qrw-page-actions');
        if (row.included && model.format !== 'power') actions.append(button('View ↗', () => viewPage(row.id), 'qrw-text-button'));
        actions.append(button(row.included ? 'Edit page' : 'Open editor', () => navigate(() => window.DocumentStudio.openEditor(row.id, model.format)), 'qrw-text-button'));
        item.append(number, copy, actions); return item;
      }
      included.forEach(r => pageList.append(rowNode(r)));
      if (other.length) {
        const omitted = el('details', 'qrw-omitted'); omitted.open = !!query;
        omitted.append(el('summary', '', 'Not in this output · ' + other.length), el('p', 'qrw-muted', 'Removed or conditional pages. Opening the editor does not restore a page or enable a system.'));
        other.forEach(r => omitted.append(rowNode(r))); pageList.append(omitted);
      }
    }
    function renderOutput() {
      // Reflect the sole PDF selector in the builder footer; never duplicate or move it.
      const label = $('pdfFormat')?.selectedOptions?.[0]?.textContent || 'Detailed proposal';
      outputTitle.textContent = label.replace(/\s*\(\d+ Pages\)$/i, '');
      sheetTotal.textContent = String(model.total); outputMetrics.replaceChildren();
      for (const [name, value] of [['Pages with saved edits', model.rows.filter(r => r.included && r.edited).length], ['Added sheets / continuations', model.rows.flatMap(r => r.pages).filter(p => p.continuation || model.rows.find(r => r.id === p.origin)?.custom).length], ['Removed page definitions', model.rows.filter(r => r.excluded).length]]) {
        outputMetrics.append(el('dt', '', name), el('dd', '', String(value)));
      }
      saveText.textContent = $('saveIndicator')?.textContent || 'Check save status in the builder';
      powerHint.hidden = model.format !== 'power';
    }
    function render() {
      const s = window.Render.lastState || {};
      reference.textContent = (s.propRef || 'Current draft') + ' · v' + (s.propVersion || '1.0');
      customer.textContent = s.custName || 'Customer not entered';
      model = readModel(); renderReview(); renderPages(); renderOutput(); selectTab(activeTab);
    }
    function open() {
      returnTo = document.activeElement; restoreFocus = true; activeTab = 'review'; pageFilter.value = '';
      window.__qsPreflight.run(); render(); dialog.showModal(); close.focus();
    }
    function schedule() {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        const issues = window.__qsPreflight?.issues?.() || {};
        const count = issues.blocking?.length || 0;
        launchStatus.textContent = (window.Render.lastVisible?.length || 0) + ' detailed pages · ' + count + (count === 1 ? ' correction' : ' corrections');
        if (dialog.open) render();
      });
    }
    pageFilter.addEventListener('input', renderPages);
    pageFilter.addEventListener('keydown', event => { if (event.key === 'Escape' && pageFilter.value) { event.preventDefault(); event.stopPropagation(); pageFilter.value = ''; renderPages(); } });
    dialog.addEventListener('close', () => { if (restoreFocus && returnTo?.isConnected) returnTo.focus({ preventScroll: true }); });
    document.addEventListener('qs:rendered', schedule);
    document.addEventListener('change', e => { if (e.target.id === 'pdfFormat') schedule(); });
    const saveObserver = new MutationObserver(() => { if (dialog.open) renderOutput(); });
    if ($('saveIndicator')) saveObserver.observe($('saveIndicator'), { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    selectTab('review'); schedule();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
