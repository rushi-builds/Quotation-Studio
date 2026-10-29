/* Offline review workspace: actual UI/navigation, existing validation, no writes. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium, devices } = require('playwright');
const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
(async () => {
  const { default: c } = await import('@sparticuz/chromium');
  const browser = await chromium.launch({ executablePath: await c.executablePath(), args: c.args.filter(a => a !== '--single-process'), headless: true });
  const shots = path.join(__dirname, 'shots/proposal-review'); fs.mkdirSync(shots, { recursive: true });
  let checks = 0;
  const check = (label, value) => { assert.ok(value, label); checks++; console.log('PASS:', label); };
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const errors = [], writes = [];
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.origin !== new URL(base).origin || /^\/(api|auth)\//.test(u.pathname)) {
        if (route.request().method() !== 'GET') writes.push(u.pathname);
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      }
      return route.continue();
    });
    const p = await context.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + '/quotation.html'); await p.waitForSelector('#proposalReviewButton');
    // Wait for font/image-triggered footer layout frames before byte-exact A4 capture.
    await p.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    const capture = () => p.evaluate(() => ({ form: StateStore.collectForm(), content: JSON.stringify(CONTENT), finance: JSON.stringify(Finance.compute(Render.lastState)), pages: [...document.querySelectorAll('.preview-panel .page')].map(n => n.outerHTML) }));
    const initial = await capture();
    const open = async () => { await p.locator('#proposalReviewButton').evaluate(n => n.scrollIntoView({ block: 'center', behavior: 'instant' })); await p.click('#proposalReviewButton'); await p.waitForFunction(() => proposalReviewDialog.open); };
    const close = async () => { await p.getByRole('button', { name: 'Close proposal review', exact: true }).click(); await p.waitForFunction(() => !proposalReviewDialog.open); };
    await open();
    check('one labelled native modal with live current reference', await p.locator('dialog[open]').count() === 1 && await p.locator('#proposalReviewDialog').getAttribute('aria-labelledby') === 'proposalReviewTitle' && (await p.locator('.qrw-context').textContent()).includes(await p.locator('#propRef').inputValue()));
    const issueMessages = await p.evaluate(() => __qsPreflight.issues().blocking.map(i => i.message));
    check('corrections exactly reuse preflight messages', JSON.stringify(await p.locator('.qrw-blocking .qrw-finding>p').allTextContents()) === JSON.stringify(issueMessages));
    check('engineering input notes reuse existing source', await p.evaluate(() => document.querySelector('.qrw-notes summary').textContent.endsWith(String(__qsPreflight.notes().length))));
    check('key quotation details list customer, site, capacity and selected equipment', await p.locator('#qrwKeyDetails [data-review-detail]').count() === 6 && await p.locator('[data-review-detail="custName"] .qrw-key-detail-value').textContent() === 'Not entered' && await p.locator('[data-review-detail="custAddress"] .qrw-key-detail-value').textContent() === 'Not entered' && (await p.locator('[data-review-detail="capacity"] .qrw-key-detail-value').textContent()).includes('7 kWp'));
    const defaultDetailStatus = await p.locator('#qrwKeyDetails .qrw-key-detail-status').allTextContents();
    check('default capacity is flagged and catalogue equipment is never presented as verified', defaultDetailStatus[2].includes('Template default') && defaultDetailStatus[3].includes('Template default') && !defaultDetailStatus[4].includes('verified') && !defaultDetailStatus[5].includes('verified') && (await p.locator('[data-review-detail="moduleMake"] .qrw-key-detail-value').textContent()).includes('Model') && (await p.locator('[data-review-detail="inverterMake"] .qrw-key-detail-value').textContent()).includes('Model'));
    check('each key detail points to its existing source input', await p.locator('#qrwKeyDetails [data-review-source]').count() === 6);
    check('review does not claim approval or an invented readiness percentage', !/\d+% ready|engineering approved|approved design|ready to send/i.test(await p.locator('#proposalReviewDialog').innerText()));
    await p.screenshot({ path: path.join(shots, 'review-desktop.png') });
    await p.locator('#qrw-review-tab').focus(); await p.keyboard.press('ArrowRight');
    check('keyboard tabs update selection and focus', await p.locator('#qrw-pages-tab').getAttribute('aria-selected') === 'true' && await p.locator('#qrw-pages-tab').evaluate(n => n === document.activeElement));
    check('15 included sheets and seven conditional definitions at default', await p.locator('.qrw-sheet-total strong').textContent() === '15' && await p.locator('.qrw-page-list>.qrw-page').count() === 15 && await p.locator('.qrw-omitted .qrw-page').count() === 7);
    await p.screenshot({ path: path.join(shots, 'pages-desktop.png') });
    await p.fill('#qrwPageFilter', 'solution'); check('page filter uses titles', await p.locator('.qrw-page').count() === 1 && await p.locator('[data-review-page="pageSolution"]').count() === 1);
    await p.fill('#qrwPageFilter', 'no-such-page'); check('page search has an honest empty state', await p.locator('.qrw-empty').isVisible());
    await p.keyboard.press('Escape'); check('Escape clears a nonempty filter before closing modal', await p.locator('#qrwPageFilter').inputValue() === '' && await p.locator('#proposalReviewDialog').evaluate(n => n.open));
    await close(); assert.deepEqual(await capture(), initial); check('open/filter/close changes no form, CONTENT, Finance or A4 HTML', true);
    check('close returns focus to invoking control', await p.locator('#proposalReviewButton').evaluate(n => n === document.activeElement));
    // Excel guidance is navigation, not an import, privileged opener or Sync.
    await open(); await p.locator('.qrw-notes>summary').click();
    check('site note messages still exactly match the existing engineering source', await p.evaluate(() => JSON.stringify([...document.querySelectorAll('.qrw-note .qrw-finding>p')].map(n => n.textContent)) === JSON.stringify(__qsPreflight.notes().map(n => n.message))));
    check('one Excel input action for the cable/soil notes', await p.locator('#qrwExcelInputs').count() === 1 && await p.locator('#qrwExcelInputs').isVisible());
    check('Excel guidance describes manual entry and site verification, not auto-fill', await p.locator('#qrwExcelInputs').getAttribute('aria-describedby') === 'qrwExcelInputHelp' && (await p.locator('#qrwExcelInputHelp').innerText()).includes('no auto-fill or Sync') && (await p.locator('#qrwExcelInputHelp').innerText()).includes('soil resistivity'));
    const excelAccess = await p.locator('#openCatalogueExcel').evaluate(n => ({ href: n.getAttribute('href'), disabled: n.getAttribute('aria-disabled') }));
    const popups = []; p.on('popup', popup => popups.push(popup));
    await p.screenshot({ path: path.join(shots, 'excel-input-notes-desktop.png') });
    await p.locator('#qrwExcelInputs').click();
    check('Excel action closes review and reveals/focuses existing access in All mode', await p.locator('#proposalReviewDialog').evaluate(n => !n.open) && await p.locator('#eqCatalog').isVisible() && await p.locator('#eqCatalog').evaluate(n => n === document.activeElement));
    assert.deepEqual(await capture(), initial); check('Excel guidance navigation leaves form, CONTENT, Finance and A4 unchanged', true);
    assert.deepEqual(await p.locator('#openCatalogueExcel').evaluate(n => ({ href: n.getAttribute('href'), disabled: n.getAttribute('aria-disabled') })), excelAccess);
    check('Excel navigation preserves access restrictions and opens no external window', excelAccess.disabled === 'true' && popups.length === 0);
    await p.click('#modeEss');
    await open(); await p.locator('.qrw-blocking [data-review-source="custName"]').click();
    check('finding closes modal and focuses original customer input', await p.locator('#proposalReviewDialog').evaluate(n => !n.open) && await p.locator('#custName').evaluate(n => n === document.activeElement));
    await p.fill('#custName', 'Review QA Customer'); await p.fill('#custAddress', 'Pune QA site'); await p.fill('#capacity', '8'); await p.selectOption('#customerType', 'commercial');
    await p.waitForFunction(() => Render.lastState.custName === 'Review QA Customer' && Render.lastState.custAddress === 'Pune QA site' && Number(Render.lastState.capacity) === 8 && Render.lastState.customerType === 'commercial');
    await open();
    check('resolved customer blocker disappears while key fields show the current source values', !await p.locator('.qrw-blocking [data-review-source="custName"]').count() && (await p.locator('.qrw-clear').textContent()).includes('No export blockers reported.') && await p.locator('[data-review-detail="custName"] .qrw-key-detail-value').textContent() === 'Review QA Customer' && await p.locator('[data-review-detail="custAddress"] .qrw-key-detail-value').textContent() === 'Pune QA site' && await p.locator('[data-review-detail="capacity"] .qrw-key-detail-value').textContent() === '8 kWp' && (await p.locator('[data-review-detail="capacity"] .qrw-key-detail-status').textContent()).includes('verify against design') && await p.locator('[data-review-detail="customerType"] .qrw-key-detail-value').textContent() === 'Commercial' && (await p.locator('[data-review-detail="customerType"] .qrw-key-detail-status').textContent()).includes('Selected · confirm category'));
    await close();
    await p.fill('#custAddress', ''); await p.fill('#capacity', '7'); await p.selectOption('#customerType', 'residential');
    await p.waitForFunction(() => !Render.lastState.custAddress && Number(Render.lastState.capacity) === 7 && Render.lastState.customerType === 'residential');
    // Live advisory and blocker parity, including payment and partial loan.
    await p.evaluate(() => { for (const [id, value] of Object.entries({ payAdvance: '60', loanAmt: '300000', loanRate: '', loanYears: '' })) { const n = document.getElementById(id); n.value = value; n.dispatchEvent(new Event('input', { bubbles: true })); } });
    await open();
    check('all payment/loan corrections match the live export gate', await p.evaluate(() => JSON.stringify([...document.querySelectorAll('.qrw-blocking .qrw-finding>p')].map(n => n.textContent)) === JSON.stringify(__qsPreflight.issues().blocking.map(i => i.message))));
    await p.locator('[data-review-source="payAdvance"]').click(); check('source navigation opens the real payment section', await p.locator('#payAdvance').evaluate(n => n === document.activeElement && n.closest('.studio-section').open));
    await p.evaluate(() => { for (const [id, value] of Object.entries({ payAdvance: '50', loanAmt: '', loanRate: '', loanYears: '' })) { const n = document.getElementById(id); n.value = value; n.dispatchEvent(new Event('input', { bubbles: true })); } });
    await open(); await p.click('#qrw-pages-tab'); await p.fill('#qrwPageFilter', 'solution'); await p.locator('[data-review-page="pageSolution"]').getByRole('button', { name: 'View ↗' }).click();
    await p.waitForFunction(() => { const r = pageSolution.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
    check('View reuses real page navigation without editing', await p.locator('#pageSolution').evaluate(n => { const r = n.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }));
    await open(); await p.click('#qrw-pages-tab'); await p.fill('#qrwPageFilter', 'battery storage'); await p.locator('[data-review-page="pageBessOverview"]').getByRole('button', { name: 'Open editor' }).click();
    check('optional editor opens without enabling battery or changing quote', await p.locator('[aria-label="Page to edit"]').inputValue() === 'pageBessOverview' && await p.evaluate(() => !Bess.enabled(Render.lastState) && !Render.lastVisible.some(p => p.id === 'pageBessOverview')));
    const savedFinance = await p.evaluate(() => JSON.stringify(Finance.compute(Render.lastState)));
    await p.evaluate(() => { DocumentStudio.excludePage('pageQuality', true); DocumentStudio.addTextBlock('pageAbout', 'Review QA addition', ('Site-specific requirements remain subject to verification. ').repeat(130)); });
    await open(); await p.click('#qrw-pages-tab');
    check('removal is visible with no implicit restore', await p.locator('[data-review-page="pageQuality"]').textContent().then(s => s.includes('Removed')) && await p.evaluate(() => !Render.lastVisible.some(p => p.id === 'pageQuality')));
    check('edited pages and continuation numbers come from actual document', await p.locator('[data-review-page="pageAbout"] .qrw-tag-edited').textContent() === 'Saved edits' && await p.locator('[data-review-page="pageAbout"] .qrw-continuation').isVisible() && await p.locator('.qrw-sheet-total strong').textContent() === String(await p.evaluate(() => Render.lastVisible.length)));
    const continuation = await p.evaluate(() => Render.lastVisible.find(p => p.id.startsWith('pageAbout-continuation-')).id);
    await p.locator('[data-review-page="pageAbout"] .qrw-continuation-links button').first().click();
    await p.waitForFunction(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }, continuation);
    check('continuation View reaches the actual extra sheet', true);
    await open(); await p.click('#qrw-pages-tab');
    check('page overview identifies the current preview source', await p.locator('[data-review-page="pageAbout"][aria-current="page"]').count() === 1);
    await close();
    assert.equal(await p.evaluate(() => JSON.stringify(Finance.compute(Render.lastState))), savedFinance); check('document review and pagination leave financial output unchanged', true);
    // Existing output selector is the source; no second form value/select created.
    await p.selectOption('#pdfFormat', 'power');
    const beforePower = await capture(); await open(); await p.click('#qrw-pages-tab');
    check('Power overview is a separate six-page output', await p.locator('.qrw-sheet-total strong').textContent() === '6' && await p.locator('.qrw-page-list>.qrw-page').count() === 6 && await p.locator('.qrw-page-actions').getByRole('button', { name: 'View ↗' }).count() === 0);
    await p.locator('[data-review-page="power3"]').getByRole('button', { name: 'Edit page', exact: true }).click();
    check('Power edit opens the existing Power editor without enabling another report', await p.locator('[aria-label="Document format to edit"]').inputValue() === 'power' && await p.locator('[aria-label="Page to edit"]').inputValue() === 'power3' && await p.locator('#pdfFormat').inputValue() === 'power');
    assert.deepEqual(await capture(), beforePower); check('Power overview/editor navigation leaves quote and A4 HTML unchanged', true);
    await p.fill('#docTextSearch', 'solar');
    check('editor search and generated editor fields never become proposal form data', await p.evaluate(() => !Object.keys(StateStore.collectForm()).some(k => k === 'docTextSearch' || k.startsWith('docEdit-'))));
    await p.evaluate(() => StateStore.applyForm({ docTextSearch: 'must not overwrite editor search' }));
    check('restoring legacy saved editor keys cannot overwrite UI search', await p.locator('#docTextSearch').inputValue() === 'solar');
    await p.evaluate(() => DocumentStudio.excludePage('power2', true));
    await open(); await p.click('#qrw-pages-tab');
    check('Power removals use actual report pagination', await p.locator('.qrw-sheet-total strong').textContent() === '5' && (await p.locator('[data-review-page=power2]').textContent()).includes('Removed'));
    await close(); await p.evaluate(() => DocumentStudio.restorePage('power2'));
    await p.evaluate(() => { window.__pdfParent = pdfFormat.parentNode; window.__pdfNext = pdfFormat.nextSibling; });
    await open(); check('review has a distinct Excel snapshot action and leaves the sole PDF selector in its original footer', await p.locator('#qrwExportSpreadsheet').count() === 1 && await p.locator('#pdfFormat').count() === 1 && await p.locator('#pdfFormat').evaluate(n => n.closest('.form-actions') !== null) && await p.locator('#qrwChangeFormat').count() === 0);
    await close(); check('closing review preserves PDF selector position', await p.evaluate(() => pdfFormat.parentNode === __pdfParent && pdfFormat.nextSibling === __pdfNext));
    await p.selectOption('#pdfFormat', 'full');
    // Cross-proposal navigation uses the active store, never a cached customer.
    await require('./legacy-proposal-fixture.cjs')(p, 'pmNew');
    await p.fill('#custName', 'Other review proposal');
    await p.waitForFunction(() => Render.lastState.custName === 'Other review proposal');
    await open(); check('switching active proposal cannot leak previous change summaries', (await p.locator('.qrw-context').textContent()).includes('Other review proposal') && await p.locator('.qrw-changes .qrw-count').textContent() === '0' && await p.locator('.qrw-sheet-total strong').textContent() === '15'); await close();
    await p.evaluate(() => { StateStore.applyForm({ systemEnabled: true, systemInclude: true, systemTemplate: 'custom', systemName: 'QA system' }); Render.renderAll(); });
    for (const [format, count] of [['system', 2], ['system-power', 1]]) {
      await p.selectOption('#pdfFormat', format); const before = await capture(); await open(); await p.click('#qrw-pages-tab');
      check(format + ' overview counts only that report family', await p.locator('.qrw-sheet-total strong').textContent() === String(count) && await p.locator('.qrw-page-list>.qrw-page').count() === count);
      await close(); assert.deepEqual(await capture(), before);
    }
    await p.selectOption('#pdfFormat', 'full');
    await p.emulateMedia({ media: 'print' });
    check('review launcher and workspace are excluded from print', await p.locator('#proposalReviewButton').evaluate(n => getComputedStyle(n).display === 'none') && await p.locator('#proposalReviewDialog').evaluate(n => getComputedStyle(n).display === 'none'));
    await p.emulateMedia({ media: 'screen' });
    // Laptop/Android-size/iPhone-size/tablet landscape UI; Chromium, not Safari.
    for (const [name, options] of [['small-phone', { ...devices['iPhone SE'] }], ['android', { ...devices['Pixel 7'] }], ['tablet', { ...devices['iPad (gen 7) landscape'] }], ['short-laptop', { viewport: { width: 1366, height: 600 } }]]) {
      const mobile = await browser.newContext({ ...options, reducedMotion: 'reduce' });
      await mobile.route('**/api/**', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
      const m = await mobile.newPage(); m.on('pageerror', e => errors.push(e.message)); await m.goto(base + '/quotation.html'); await m.waitForSelector('#proposalReviewButton');
      await m.locator('#proposalReviewButton').scrollIntoViewIfNeeded(); if (options.hasTouch) await m.locator('#proposalReviewButton').tap(); else await m.locator('#proposalReviewButton').click();
      const fits = () => m.evaluate(() => { const d = proposalReviewDialog, r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && d.scrollWidth <= d.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('.qrw-body').scrollWidth <= document.querySelector('.qrw-body').clientWidth + 1; });
      check(name + ' modal fits width/height without horizontal overflow', await fits());
      if (options.hasTouch) check(name + ' controls have 44px touch height', await m.locator('.qrw button,.qrw summary').evaluateAll(ns => ns.filter(n => n.getClientRects().length).every(n => n.getBoundingClientRect().height >= 44)));
      check(name + ' key-detail rows stay readable inside the review panel', await fits() && await m.locator('#qrwKeyDetails [data-review-detail]').count() === 6 && await m.locator('#qrwKeyDetails [data-review-detail]').evaluateAll(ns => ns.every(n => { const r=n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && n.scrollWidth <= n.clientWidth + 1; })));
      await m.click('#qrw-pages-tab'); await m.fill('#qrwPageFilter', 'solution'); check(name + ' searchable page overview fits', await fits() && await m.locator('.qrw-page').count() === 1);
      await m.locator('[data-review-page=pageSolution]').scrollIntoViewIfNeeded();
      await m.screenshot({ path: path.join(shots, name + '.png') });
      await m.keyboard.press('Tab'); check(name + ' keyboard focus stays inside modal', await m.evaluate(() => proposalReviewDialog.contains(document.activeElement)));
      const view = m.locator('[data-review-page=pageSolution]').getByRole('button', { name: 'View ↗' });
      if (options.hasTouch) await view.tap(); else await view.click();
      await m.waitForFunction(() => { const r = pageSolution.getBoundingClientRect(); return !proposalReviewDialog.open && r.top < innerHeight && r.bottom > 0; });
      check(name + ' real View click/tap reaches the proposal page', true);
      await m.locator('#proposalReviewButton').scrollIntoViewIfNeeded(); await m.locator('#proposalReviewButton').click();
      await m.locator('.qrw-notes>summary').click(); await m.locator('#qrwExcelInputs').scrollIntoViewIfNeeded();
      check(name + ' Excel input action fits without modal overflow', await fits() && await m.locator('#qrwExcelInputs').evaluate(n => { const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
      await m.screenshot({ path: path.join(shots, name + '-excel-notes.png') });
      if (options.hasTouch) await m.locator('#qrwExcelInputs').tap(); else await m.locator('#qrwExcelInputs').click();
      check(name + ' Excel action reaches existing access without enabling workbook', await m.locator('#proposalReviewDialog').evaluate(n => !n.open) && await m.locator('#eqCatalog').isVisible() && await m.locator('#eqCatalog').evaluate(n => n === document.activeElement) && await m.locator('#openCatalogueExcel').getAttribute('aria-disabled') === 'true');
      await mobile.close();
    }
    // Customer view never loads the builder review interface.
    const share = await context.newPage(); const activeId = await p.evaluate(() => Proposals.activeId()); await share.goto(base + '/share.html?p=' + encodeURIComponent(activeId)); await share.waitForFunction(() => window.Render?.lastState);
    check('customer view contains no review launcher/dialog or review JS', await share.locator('#proposalReviewButton,#proposalReviewDialog,script[src*="proposal-review"]').count() === 0);
    check('zero browser runtime errors', errors.length === 0); check('zero API/auth writes', writes.length === 0);
    console.log('RESULT:', checks, 'passed; offline Chromium, no production access.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
