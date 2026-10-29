/* Local Excel snapshot export + PDF-selector ownership and persisted editor-state QA.
 * Browser-only snapshot; no production access, auth or API writes. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { chromium, devices } = require('playwright');
const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
(async () => {
  const { default: bundle } = await import('@sparticuz/chromium');
  const browser = await chromium.launch({ executablePath: await bundle.executablePath(), args: bundle.args.filter(a => a !== '--single-process'), headless: true });
  const folder = path.join(__dirname, 'shots/review-format-state'); fs.mkdirSync(folder, { recursive: true });
  const errors = [], writes = []; let count = 0;
  const check = (name, value) => { assert.ok(value, name); count++; console.log('PASS:', name); };
  async function context(options = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', ...options });
    await ctx.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.origin !== new URL(base).origin || /^\/(api|auth)\//.test(u.pathname)) {
        if (route.request().method() !== 'GET') writes.push(u.pathname);
        return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
      }
      return route.continue();
    });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.goto(base + '/quotation.html'); await p.waitForSelector('#proposalReviewButton');
    await p.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    return { ctx, p };
  }
  async function open(p, touch = false) {
    const b = p.locator('#proposalReviewButton'); await b.scrollIntoViewIfNeeded();
    if (touch) await b.tap(); else await b.click();
    await p.waitForFunction(() => proposalReviewDialog.open);
  }
  async function close(p) {
    await p.getByRole('button', { name: 'Close proposal review', exact: true }).click();
    await p.waitForFunction(() => !proposalReviewDialog.open);
  }
  const snapshot = p => p.evaluate(() => ({ form: StateStore.collectForm(), content: JSON.stringify(CONTENT), finance: JSON.stringify(Finance.compute(Render.lastState)), pages: [...document.querySelectorAll('.preview-panel .page')].map(n => n.outerHTML) }));
  try {
    const { ctx, p } = await context();
    await p.evaluate(() => { window.__originalFormat = pdfFormat; window.__formatParent = pdfFormat.parentNode; window.__formatNext = pdfFormat.nextSibling; });
    await p.fill('#custName', '=HYPERLINK("https://invalid.invalid","click")');
    await p.waitForFunction(() => Render.lastState.custName.startsWith('='));
    await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const beforeExport = await snapshot(p);
    await open(p);
    check('review offers a distinct Excel snapshot and keeps the sole PDF selector in the original footer', await p.locator('#qrwExportSpreadsheet').count() === 1 && await p.locator('#pdfFormat').count() === 1 && await p.locator('#pdfFormat').evaluate(n => n.parentNode === __formatParent && n.nextSibling === __formatNext) && await p.locator('#qrwChangeFormat').count() === 0);
    check('snapshot preview reflects current PDF output and page count', await p.locator('.qrw-sheet-total strong').textContent() === String(await p.evaluate(() => Render.lastVisible.length)) && (await p.locator('#qrwSpreadsheetHelp').textContent()).includes('finance estimates'));
    await p.screenshot({ path: path.join(folder, 'excel-snapshot-desktop.png') });
    const csvDownload = p.waitForEvent('download'); await p.click('#qrwExportSpreadsheet');
    const csvFile = await csvDownload, csvPath = path.join(folder, 'quotation-review.csv'); await csvFile.saveAs(csvPath);
    const csvBuffer = fs.readFileSync(csvPath), csv = csvBuffer.toString('utf8'), plainCsv = csv.replace(/^\uFEFF/, '');
    check('Excel-ready CSV contains live quote, finance estimates, checks and page manifest', csv.startsWith('\uFEFF') && plainCsv.includes('"Customer","\'=HYPERLINK') && plainCsv.includes('FINANCE ENGINE OUTPUT') && plainCsv.includes('EXISTING REVIEW CHECKS') && plainCsv.includes('PROPOSAL PAGE MANIFEST'));
    const integrityPrefix = '\r\n"INTEGRITY","SHA-256 of all preceding rows","';
    const integrityAt = plainCsv.lastIndexOf(integrityPrefix), hashStart = integrityAt + integrityPrefix.length, expectedHash = plainCsv.slice(hashStart, hashStart + 64);
    check('export includes verifiable SHA-256 fingerprint of the exact CSV snapshot', integrityAt > 0 && /^[0-9a-f]{64}$/.test(expectedHash) && crypto.createHash('sha256').update(plainCsv.slice(0, integrityAt + 2), 'utf8').digest('hex') === expectedHash);
    await close(p); assert.deepEqual(await snapshot(p), beforeExport); check('spreadsheet export changes no quote, CONTENT, Finance or A4 markup', true);
    check('closing review preserves exact PDF selector position', await p.evaluate(() => pdfFormat === __originalFormat && pdfFormat.parentNode === __formatParent && pdfFormat.nextSibling === __formatNext));
    await p.selectOption('#pdfFormat', 'power'); await p.waitForFunction(() => downloadLabel.textContent.includes('6 Pages'));
    await open(p); check('existing footer selector still controls the selected output in review', await p.locator('#pdfFormat').inputValue() === 'power' && await p.locator('.qrw-sheet-total strong').textContent() === '6'); await close(p);
    const download = p.waitForEvent('download', { timeout: 120000 });
    await p.locator('#downloadBtn').scrollIntoViewIfNeeded(); await p.click('#downloadBtn');
    const pdf = await download; const pdfPath = path.join(folder, 'selected-power.pdf'); await pdf.saveAs(pdfPath);
    const bytes = fs.readFileSync(pdfPath), text = bytes.toString('latin1');
    check('actual Download button still generates a real six-page Power PDF', bytes.subarray(0, 5).toString() === '%PDF-' && (text.match(/\/Type \/Page\b/g) || []).length === 6 && bytes.length > 10000);
    await p.waitForFunction(() => !downloadBtn.disabled);
    await p.fill('#custName', 'Format QA');
    // Point 6: real content-editor input, save, reload and JSON backup.
    await p.evaluate(() => DocumentStudio.openEditor('pageAbout'));
    const key = await p.evaluate(() => DocumentStudio.inventory('pageAbout').texts.find(t => !t.locked && t.node.parentElement.id === 'v_abHeading').key);
    const wording = 'Saved wording stays with this proposal.';
    await p.locator('[data-doc-text-key="' + key + '"] textarea').fill(wording);
    await p.waitForFunction(wording => v_abHeading.textContent.includes(wording), wording);
    await p.fill('#docTextSearch', 'UI-only search, never customer data');
    // Trigger actual normal Save now, rather than merely inspecting collectForm.
    await p.locator('.studio-tools>summary').scrollIntoViewIfNeeded(); await p.locator('.studio-tools>summary').click();
    await p.locator('#saveNowBtn').scrollIntoViewIfNeeded(); await p.click('#saveNowBtn');
    await p.waitForFunction(() => saveIndicator.dataset.state === 'saved');
    check('saved proposal has no doc search/generated field IDs, but retains source values and CONTENT wording', await p.evaluate(({ key, wording }) => {
      const q = Proposals.active();
      return !Object.keys(q.form).some(k => k === 'docTextSearch' || k.startsWith('docEdit-')) && q.form.custName === 'Format QA' && q.content.documentStudio.pages.pageAbout.variants.default.texts[key].value === wording;
    }, { key, wording }));
    // Simulate an older saved blob carrying transient keys. Apply must ignore
    // those keys; the next normal save must drop them without losing wording.
    await p.evaluate(() => { const q = Proposals.active(); q.form.docTextSearch = 'OLD SEARCH SHOULD NOT RETURN'; q.form['docEdit-old-generated-id'] = 'OLD UI'; Proposals.put(q); });
    await p.reload(); await p.waitForSelector('#proposalReviewButton');
    await p.evaluate(() => DocumentStudio.openEditor('pageAbout'));
    check('reload restores edited wording and real customer input, not legacy editor search', (await p.locator('#v_abHeading').textContent()).includes(wording) && await p.locator('#custName').inputValue() === 'Format QA' && await p.locator('#docTextSearch').inputValue() === '');
    await p.fill('#docTextSearch', 'another temporary query');
    await p.evaluate(() => __qsSaveNow());
    check('normal save cleans legacy transient form keys without resetting quote values', await p.evaluate(() => !Object.keys(Proposals.active().form).some(k => k === 'docTextSearch' || k.startsWith('docEdit-')) && Proposals.active().form.custName === 'Format QA'));
    const backupDownload = p.waitForEvent('download'); await p.evaluate(() => StateStore.exportFile());
    const backup = await backupDownload, backupPath = path.join(folder, 'proposal-backup.json'); await backup.saveAs(backupPath);
    const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    check('actual exported backup excludes UI keys and preserves document edits', data.kind === 'ktm-proposal' && !Object.keys(data.proposal.form).some(k => k === 'docTextSearch' || k.startsWith('docEdit-')) && data.proposal.content.documentStudio.pages.pageAbout.variants.default.texts[key].value === wording);
    await ctx.close();
    for (const [name, options] of [['android', devices['Pixel 7']], ['small-iphone', devices['iPhone SE']], ['tablet', devices['iPad (gen 7) landscape']]]) {
      const { ctx, p } = await context(options);
      await open(p, true); await p.locator('#qrwExportSpreadsheet').scrollIntoViewIfNeeded();
      check(name + ': Excel snapshot card fits the review without horizontal overflow', await p.locator('#qrwSpreadsheetCard').evaluate(n => { const r=n.getBoundingClientRect(), body=n.closest('.qrw-body'); return r.left >= 0 && r.right <= innerWidth && body.scrollWidth <= body.clientWidth + 1; }));
      check(name + ': spreadsheet export has touch-friendly target and explicit local status', await p.locator('#qrwExportSpreadsheet').evaluate(n => n.getBoundingClientRect().height >= 44) && await p.locator('#qrwSpreadsheetStatus').getAttribute('aria-live') === 'polite');
      await p.screenshot({ path: path.join(folder, name + '-excel-snapshot.png') });
      const mobileExport = p.waitForEvent('download'); await p.locator('#qrwExportSpreadsheet').tap();
      const mobileFile = await mobileExport;
      check(name + ': real tap downloads an Excel-ready CSV without moving PDF selector', mobileFile.suggestedFilename().endsWith('.csv') && await p.locator('#pdfFormat').evaluate(n => n.closest('.form-actions') !== null) && await p.locator('#pdfFormat').count() === 1);
      await close(p); await ctx.close();
    }
    check('zero browser errors', errors.length === 0); check('zero API/auth writes', writes.length === 0);
    console.log('RESULT:', count, 'PASS. Chromium emulation, not physical iOS/Safari certification.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
