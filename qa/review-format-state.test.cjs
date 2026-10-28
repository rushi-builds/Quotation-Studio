/* Real review-format interaction + persisted editor-state ownership regression.
 * Local browser data only; no production access, auth or API writes. */
'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
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
    await p.evaluate(() => document.fonts.ready);
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
    const original = await snapshot(p);
    await open(p); await p.click('#qrwChangeFormat');
    check('format button reveals the ONE original selector without closing review', await p.evaluate(() => proposalReviewDialog.open && document.querySelector('#qrwFormatControl #pdfFormat') === __originalFormat && document.querySelectorAll('#pdfFormat').length === 1 && document.activeElement === __originalFormat));
    await p.selectOption('#pdfFormat', 'power');
    await p.waitForFunction(() => document.querySelector('.qrw-sheet-total strong').textContent === '6');
    check('Power selection updates the real format, label and review count', await p.evaluate(() => pdfFormat.value === 'power' && downloadLabel.textContent.includes('6 Pages') && document.querySelector('#qrwChangeFormat').getAttribute('aria-expanded') === 'true'));
    check('count/status refresh keeps the selector connected and focused', await p.evaluate(() => document.activeElement === __originalFormat && __originalFormat.isConnected));
    await p.screenshot({ path: path.join(folder, 'format-desktop.png') });
    await close(p);
    check('close restores exact selector position/listeners and selected format', await p.evaluate(() => pdfFormat === __originalFormat && pdfFormat.parentNode === __formatParent && pdfFormat.nextSibling === __formatNext && pdfFormat.value === 'power' && !pdfFormat.hasAttribute('aria-labelledby')));
    assert.deepEqual(await snapshot(p), original); check('choosing output format does not change quote, CONTENT, Finance or A4 markup', true);
    await open(p); await p.click('#qrwChangeFormat'); await p.selectOption('#pdfFormat', 'full');
    await p.waitForFunction(() => document.querySelector('.qrw-sheet-total strong').textContent === String(Render.lastVisible.length));
    await p.click('#qrwChangeFormat');
    check('toggle collapse restores selector while keeping modal open', await p.evaluate(() => proposalReviewDialog.open && pdfFormat.parentNode === __formatParent && document.querySelector('#qrwChangeFormat').getAttribute('aria-expanded') === 'false'));
    await p.click('#qrwChangeFormat'); await p.keyboard.press('Escape');
    await p.waitForFunction(() => !proposalReviewDialog.open);
    check('Escape cannot strand the real selector inside closed modal', await p.evaluate(() => pdfFormat.parentNode === __formatParent));
    await open(p); await p.click('#qrwChangeFormat'); await p.locator('[data-review-source="custName"]').click();
    check('source navigation restores PDF control before focusing original input', await p.evaluate(() => !proposalReviewDialog.open && document.activeElement === custName && pdfFormat.parentNode === __formatParent));
    await p.fill('#custName', 'Format QA');
    // Prove an actual download uses the format selected inside the review.
    await open(p); await p.click('#qrwChangeFormat'); await p.selectOption('#pdfFormat', 'power');
    await p.waitForFunction(() => document.querySelector('.qrw-sheet-total strong').textContent === '6'); await close(p);
    const download = p.waitForEvent('download', { timeout: 120000 });
    await p.locator('#downloadBtn').scrollIntoViewIfNeeded(); await p.click('#downloadBtn');
    const pdf = await download; const pdfPath = path.join(folder, 'selected-power.pdf'); await pdf.saveAs(pdfPath);
    const bytes = fs.readFileSync(pdfPath), text = bytes.toString('latin1');
    check('actual Download button generates a real six-page PDF from selected Power format', bytes.subarray(0, 5).toString() === '%PDF-' && (text.match(/\/Type \/Page\b/g) || []).length === 6 && bytes.length > 10000);
    await p.waitForFunction(() => !downloadBtn.disabled);
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
      await open(p, true); await p.locator('#qrwChangeFormat').scrollIntoViewIfNeeded(); await p.locator('#qrwChangeFormat').tap();
      await p.selectOption('#pdfFormat', 'power');
      await p.waitForFunction(() => document.querySelector('.qrw-sheet-total strong').textContent === '6');
      check(name + ': real tap opens native source selector and format updates in-place', await p.evaluate(() => proposalReviewDialog.open && document.querySelector('#qrwFormatControl #pdfFormat').value === 'power' && document.querySelectorAll('#pdfFormat').length === 1));
      check(name + ': touch selector is readable and fits the modal', await p.locator('#pdfFormat').evaluate(n => { const r = n.getBoundingClientRect(), body = n.closest('.qrw-body'); return parseFloat(getComputedStyle(n).fontSize) >= 16 && r.height >= 44 && r.left >= 0 && r.right <= innerWidth && body.scrollWidth <= body.clientWidth + 1; }));
      await p.screenshot({ path: path.join(folder, name + '-format.png') });
      await close(p); check(name + ': close returns selected format to builder footer', await p.locator('.form-actions #pdfFormat').count() === 1 && await p.locator('#pdfFormat').inputValue() === 'power');
      await ctx.close();
    }
    check('zero browser errors', errors.length === 0); check('zero API/auth writes', writes.length === 0);
    console.log('RESULT:', count, 'PASS. Chromium emulation, not physical iOS/Safari certification.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
