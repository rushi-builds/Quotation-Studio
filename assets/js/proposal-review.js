/* Builder-only review workspace. Read existing preflight/document metadata;
 * never own a quote value, approve engineering, save, publish or export. */
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
    const close = button('×', () => { restoreFormat(); dialog.close(); }, 'qrw-close'); close.setAttribute('aria-label', 'Close proposal review');
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
    footer.append(el('p', '', 'Input checks are not engineering approval, subsidy approval or a guarantee of site performance.'), button('Back to builder', () => { restoreFormat(); dialog.close(); }));
    shell.append(header, context, tabs, body, footer); dialog.append(shell); document.body.append(dialog);

    let activeTab = 'review', model, restoreFocus = true, pending = 0, returnTo = launcher;
    // Reuse the ONE real PDF selector. Moving it preserves its original
    // listeners and option availability; no mirror select or quote value.
    const formatSelect = $('pdfFormat'), formatParent = formatSelect.parentNode, formatNext = formatSelect.nextSibling;
    const outputTitle = el('h3'), sheetTotal = el('strong'), total = el('div', 'qrw-sheet-total');
    total.append(sheetTotal, el('span', '', 'A4 sheets'));
    const outputMetrics = el('dl', 'qrw-output-metrics');
    const formatControl = el('div', 'qrw-format-control'); formatControl.id = 'qrwFormatControl'; formatControl.hidden = true;
    const formatLabel = el('label', '', 'PDF format'); formatLabel.id = 'qrwFormatLabel'; formatLabel.htmlFor = 'pdfFormat';
    const formatHelp = el('p', 'qrw-muted', 'Changes the current download choice. Nothing is saved, published or downloaded.');
    formatControl.append(formatLabel, formatHelp);
    let formatExpanded = false, previousFormatLabel;
    const formatToggle = button('Change PDF format', () => {
      if (formatExpanded) { restoreFormat(); formatToggle.focus(); }
      else {
        formatExpanded = true; formatControl.hidden = false; formatToggle.setAttribute('aria-expanded', 'true');
        previousFormatLabel = formatSelect.getAttribute('aria-labelledby');
        formatSelect.setAttribute('aria-labelledby', formatLabel.id);
        formatLabel.after(formatSelect); formatSelect.focus({ preventScroll: true });
        formatControl.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
    });
    formatToggle.id = 'qrwChangeFormat'; formatToggle.setAttribute('aria-controls', formatControl.id); formatToggle.setAttribute('aria-expanded', 'false');
    const saveContext = el('div', 'qrw-save-context'), saveText = el('p');
    saveContext.append(el('span', 'qrw-eyebrow', 'SAVE STATUS'), saveText);
    const powerHint = el('p', 'qrw-muted', 'Power is a separate report. Open its editor to view the existing Power preview.'); powerHint.hidden = true;
    sidebar.append(el('span', 'qrw-eyebrow', 'SELECTED PDF OUTPUT'), outputTitle, total, outputMetrics, formatToggle, formatControl,
      saveContext, el('p', 'qrw-muted', 'Uses the current builder inputs and existing document checks. Review does not save, publish or download anything.'), powerHint);
    function restoreFormat() {
      if (!formatExpanded) return;
      formatParent.insertBefore(formatSelect, formatNext?.parentNode === formatParent ? formatNext : null);
      if (previousFormatLabel === null) formatSelect.removeAttribute('aria-labelledby');
      else formatSelect.setAttribute('aria-labelledby', previousFormatLabel);
      formatExpanded = false; formatControl.hidden = true; formatToggle.setAttribute('aria-expanded', 'false');
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
    function navigate(action) { restoreFocus = false; restoreFormat(); dialog.close(); action(); }
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
    function renderReview() {
      reviewContent.replaceChildren();
      if (model.blocking.length) reviewContent.append(issueGroup('Needs correction', 'blocking', model.blocking, 'These existing export checks need attention before a PDF can be generated.'));
      else {
        const clear = el('section', 'qrw-clear');
        clear.append(el('span', 'qrw-eyebrow', 'EXPORT CHECKS'), el('h3', '', 'No export blockers reported.'), el('p', 'qrw-muted', 'Review the assumptions, scope and selected output before sharing. This is not a design approval.'));
        reviewContent.append(clear);
      }
      if (model.advisory.length) reviewContent.append(issueGroup('Review recommended', 'advisory', model.advisory, 'Advisories come from the current preflight, not a new scoring system.'));
      const notes = el('details', 'qrw-notes');
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
      const head = el('div', 'qrw-section-heading'); head.append(el('h3', '', 'Document changes'), el('span', 'qrw-count', String(changes.length)));
      changeSection.append(head, el('p', 'qrw-muted', changes.length ? 'Saved presentation edits in this output. This is not a comparison against a published version.' : 'No page removals or Document Studio edits saved for this output. Linked form values and template wording are reviewed at their sources.'));
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
      // Keep the real selector connected and focused while counts/status update.
      const label = formatSelect.selectedOptions[0]?.textContent || 'Detailed proposal';
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
      restoreFormat(); returnTo = document.activeElement; restoreFocus = true; activeTab = 'review'; pageFilter.value = '';
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
    dialog.addEventListener('cancel', restoreFormat);
    dialog.addEventListener('close', () => { restoreFormat(); if (restoreFocus && returnTo?.isConnected) returnTo.focus({ preventScroll: true }); });
    document.addEventListener('qs:rendered', schedule);
    document.addEventListener('change', e => { if (e.target.id === 'pdfFormat') schedule(); });
    const saveObserver = new MutationObserver(() => { if (dialog.open) renderOutput(); });
    if ($('saveIndicator')) saveObserver.observe($('saveIndicator'), { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    selectTab('review'); schedule();
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
