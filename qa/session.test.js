/* Save, resume, reset and proposal-management behaviour (browser).
   Run: LD_LIBRARY_PATH=/tmp/allibs/lib QA_BASE=http://127.0.0.1:8080 node qa/session.test.js */
'use strict';
const puppeteer = require('puppeteer-core');

(async () => {
  const { default: chromium } = await import('@sparticuz/chromium');
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args.filter((a) => a !== '--single-process'),
    headless: true
  });
  const BASE = process.env.QA_BASE || 'http://127.0.0.1:8080';
  const settle = (p, ms) => p.evaluate((t) => new Promise((r) => setTimeout(r, t)), ms || 400);
  const openApp = async (ctx, file) => {
    const p = await ctx.newPage();
    await p.setViewport({ width: 1440, height: 1050 });
    p.on('pageerror', (e) => console.log('  PAGE ERROR: ' + e.message));
    await p.goto(BASE + '/' + file, { waitUntil: 'networkidle0' });
    await settle(p, 500);
    return p;
  };
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok, detail });
  const context = await browser.createBrowserContext();
  const page = await openApp(context, 'quotation.html');
  page.on('pageerror', (e) => check('no page errors', false, e.message));

  /* 1. menu naming and order */
  const menu = await page.evaluate(() => {
    const tools = document.querySelector('.studio-tools');
    const links = tools ? tools.querySelector('.form-links') : null;
    return {
      summary: tools ? tools.querySelector('summary').textContent.trim() : null,
      items: links ? [...links.querySelectorAll('button, label[for="importFile"]')].map((el) => el.textContent.trim()) : [],
      scope: (document.getElementById('backupScope') || {}).textContent || ''
    };
  });
  check('menu is named "Save, backup & reset"', menu.summary === 'Save, backup & reset', menu.summary);
  const wanted = ['Save now', 'Export backup', 'Import backup', 'Reset current proposal…'];
  check('menu items are in the required order', JSON.stringify(menu.items) === JSON.stringify(wanted), menu.items.join(' | '));
  check('backup scope is stated (one proposal, not the workspace)', /not the whole workspace/.test(menu.scope), menu.scope.slice(0, 80));

  /* 2. Save now reports a truthful time */
  const saveMsg = await page.evaluate(async () => {
    document.getElementById('saveNowBtn').click();
    await new Promise((r) => setTimeout(r, 60));
    return { status: document.getElementById('statusMsg').textContent,
             indicator: document.getElementById('saveIndicator').textContent };
  });
  check('Save now confirms a save in this browser with a time',
    /^Saved in this browser at \d{1,2}:\d{2}/.test(saveMsg.status), saveMsg.status);
  check('save indicator says "in this browser", never the cloud',
    /in this browser/.test(saveMsg.indicator) && !/cloud|synced/i.test(saveMsg.indicator), saveMsg.indicator);

  /* 3. Ctrl+S saves and never opens the browser save dialog */
  const prevented = await page.evaluate(async () => {
    let prevented = false;
    const handler = (e) => { prevented = e.defaultPrevented; };
    window.addEventListener('keydown', handler);
    document.getElementById('custName').value = 'Shortcut Customer';
    document.getElementById('custName').dispatchEvent(new Event('input', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 450));
    window.removeEventListener('keydown', handler);
    return { prevented, saved: (Proposals.active().form || {}).custName };
  });
  check('Ctrl+S is captured (no browser save dialog)', prevented.prevented === true, String(prevented.prevented));
  check('Ctrl+S flushes the pending edit', prevented.saved === 'Shortcut Customer', String(prevented.saved));

  /* 4. workspace preferences resume: mode, sections, page, PDF format */
  await page.evaluate(async () => {
    document.getElementById('modeAll').click();
    const wanted = ['pricing', 'bessEnabled', 'systemEnabled'];
    document.querySelectorAll('details.studio-section').forEach((d) => { d.open = wanted.includes(d.dataset.section); d.dispatchEvent(new Event('toggle')); });
    const sel = document.getElementById('pdfFormat');
    const alt = [...sel.options].map((o) => o.value).find((v) => v !== 'full');
    if (alt) { sel.value = alt; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    document.getElementById('pageInvestment').scrollIntoView({ block: 'start' });
    await new Promise((r) => setTimeout(r, 900));
  });
  const before = await page.evaluate(() => ({
    mode: document.getElementById('quoteForm').classList.contains('qs-mode-essentials') ? 'essentials' : 'all',
    open: [...document.querySelectorAll('details.studio-section[open]')].map((d) => d.dataset.section).sort(),
    pdf: document.getElementById('pdfFormat').value,
    stored: JSON.parse(localStorage.getItem('qstudio.ws.' + Proposals.activeId()) || '{}')
  }));
  const reloaded = await page.reload({ waitUntil: 'networkidle0' }).then(() => settle(page, 500)).then(() => page.evaluate(() => ({
    mode: document.getElementById('quoteForm').classList.contains('qs-mode-essentials') ? 'essentials' : 'all',
    open: [...document.querySelectorAll('details.studio-section[open]')].map((d) => d.dataset.section).sort(),
    pdf: document.getElementById('pdfFormat').value,
    active: Proposals.activeId(),
    customer: (Proposals.active().form || {}).custName,
    page: window.__qsLastPageId,
    scrolled: (document.querySelector('.preview-panel') || {}).scrollTop || 0
  })));
  check('settings mode resumes after reload', reloaded.mode === before.mode, reloaded.mode + ' vs ' + before.mode);
  check('open control-panel sections resume', JSON.stringify(reloaded.open) === JSON.stringify(before.open), reloaded.open.join(','));
  check('selected PDF format resumes when still available', reloaded.pdf === before.pdf, reloaded.pdf + ' vs ' + before.pdf);
  check('the same proposal resumes', reloaded.customer === 'Shortcut Customer', String(reloaded.customer));
  check('the last preview page and reading position resume',
    reloaded.page === before.stored.pageId && reloaded.scrolled > 0,
    reloaded.page + ' / scrollTop ' + reloaded.scrolled);
  check('workspace preferences are stored per proposal',
    !!before.stored && before.stored.pageId === 'pageInvestment' && before.stored.pdfFormat === before.pdf,
    JSON.stringify(before.stored).slice(0, 120));

  /* 5. corrupt preferences must not harm the proposal data */
  const corrupt = await page.evaluate(async () => {
    const id = Proposals.activeId();
    localStorage.setItem('qstudio.ws.' + id, '{not json at all');
    return id;
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await settle(page, 500);
  const afterCorrupt = await page.evaluate(() => ({
    customer: (Proposals.active().form || {}).custName,
    pageOk: !!document.getElementById('pageCover')
  }));
  check('corrupt workspace preferences do not erase the proposal', afterCorrupt.customer === 'Shortcut Customer', String(afterCorrupt.customer));

  /* 6. reset asks, then clears this proposal only */
  const otherId = await page.evaluate(() => {
    const other = Proposals.create({ custName: 'Untouched Customer', capacity: '7' });
    Proposals.setActive(Proposals.activeId());
    return other.id;
  });
  const cancel = await page.evaluate(async () => {
    window.confirm = () => false;
    document.getElementById('custName').value = 'Should Survive';
    document.getElementById('custName').dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    document.getElementById('resetBtn').click();
    await new Promise((r) => setTimeout(r, 300));
    return { value: document.getElementById('custName').value, saved: (Proposals.active().form || {}).custName };
  });
  check('reset cancel keeps everything', cancel.value === 'Should Survive' && cancel.saved === 'Should Survive', JSON.stringify(cancel));

  const reset = await page.evaluate(async () => {
    window.confirm = () => true;
    Proposals.setStatus(Proposals.activeId(), 'sent');
    window.__qsOptions = [{ name: 'Custom option', capacity: '9' }];
    window.__qsPageImages = { pageCover: 'data:image/png;base64,AAA' };
    const picker = document.querySelector('#quoteForm input[data-photo]');
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([1])], 'picked.png', { type: 'image/png' }));
    Object.defineProperty(picker, 'files', { value: dt.files, configurable: true });
    await new Promise((r) => setTimeout(r, 400));
    document.getElementById('resetBtn').click();
    await new Promise((r) => setTimeout(r, 700));
    const active = Proposals.active();
    return {
      customer: active.form.custName, status: active.status,
      options: (active.options || []).length, photos: Object.keys(active.pageImages || {}).length,
      picker: document.querySelector('#quoteForm input[data-photo]').value,
      other: (Proposals.get('__OTHER__') || {}).form ? Proposals.get('__OTHER__').form.custName : null,
      message: document.getElementById('statusMsg').textContent,
      statusSel: document.getElementById('pmStatus').value
    };
  });
  const otherStill = await page.evaluate((id) => (Proposals.get(id) || {}).form.custName, otherId);
  check('reset clears customer inputs to template defaults', reset.customer === '', JSON.stringify(reset.customer));
  check('reset clears saved comparison options and uploaded images',
    reset.options === 0 && reset.photos === 0, reset.options + ' options / ' + reset.photos + ' images');
  check('reset clears the file-picker selection', reset.picker === '', JSON.stringify(reset.picker));
  check('reset returns the status to Draft', reset.status === 'draft' && reset.statusSel === 'draft', reset.status + '/' + reset.statusSel);
  check('reset keeps other proposals', otherStill === 'Untouched Customer', String(otherStill));
  check('reset confirmation message names what was kept', /not touched/.test(reset.message), reset.message);

  /* 6b. reset clears battery and optional-system settings and prices */
  const deep = await page.evaluate(async () => {
    window.confirm = () => true;
    const set = (id, v, ev) => { const el = document.getElementById(id); if (!el) return; el.value = v; el.dispatchEvent(new Event(ev || 'input', { bubbles: true })); };
    document.getElementById('bessEnabled').checked = true;
    document.getElementById('bessEnabled').dispatchEvent(new Event('change', { bubbles: true }));
    set('bessMake', 'Testcell');
    set('bessCapacity', '10');
    set('bessCost', '275000');
    set('bessBackupReady', 'yes');
    document.getElementById('systemEnabled').checked = true;
    document.getElementById('systemEnabled').dispatchEvent(new Event('change', { bubbles: true }));
    set('systemPrice', '48000');
    await new Promise((r) => setTimeout(r, 600));
    const mixed = { bess: document.getElementById('bessMake').value, price: document.getElementById('bessCost').value, sys: document.getElementById('systemPrice').value };
    document.getElementById('resetBtn').click();
    await new Promise((r) => setTimeout(r, 900));
    const active = Proposals.active();
    return {
      mixed,
      bess: (active.form || {}).bessMake || '', cost: (active.form || {}).bessCost || '',
      sysPrice: (active.form || {}).systemPrice || '', ready: (active.form || {}).bessBackupReady || '',
      onScreenBess: document.getElementById('bessEnabled').checked,
      onScreenSys: document.getElementById('systemEnabled').checked
    };
  });
  check('reset clears battery model and its price',
    deep.mixed.bess === 'Testcell' && deep.bess === '' && deep.cost === '', JSON.stringify(deep));
  check('reset clears optional-system price and scope back to off',
    deep.sysPrice === '' && deep.onScreenBess === false && deep.onScreenSys === false, JSON.stringify(deep).slice(0, 140));

  /* 6c. acknowledgement and status return to Draft */
  const ack = await page.evaluate(async () => {
    window.confirm = () => true;
    const id = Proposals.activeId();
    Proposals.setStatus(id, 'accepted');
    const b = Proposals.get(id); b.viewedAt = new Date().toISOString(); Proposals.put(b);
    document.getElementById('resetBtn').click();
    await new Promise((r) => setTimeout(r, 800));
    const after = Proposals.get(id);
    return { status: after.status, kept: Object.keys(after).filter((k) => /At$/.test(k) && k !== 'createdAt' && k !== 'updatedAt').length };
  });
  check('reset returns status and hand-recorded acknowledgements to Draft',
    ack.status === 'draft' && ack.kept === 0, JSON.stringify(ack));

  /* 7. pending uploads must not repopulate after a reset */
  const pending = await page.evaluate(async () => {
    const input = document.querySelector('#quoteForm input[data-photo]');
    const target = document.getElementById(input.dataset.photo);
    const tx = input.dataset.photo;
    /* slow reader: start an upload, reset before it lands */
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'x.png', { type: 'image/png' });
    const dt = new DataTransfer(); dt.items.add(file);
    Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    window.confirm = () => true;
    document.getElementById('resetBtn').click();
    await new Promise((r) => setTimeout(r, 900));
    const active = Proposals.active();
    return { photos: Object.keys(active.pageImages || {}).length, src: target.getAttribute('src') };
  });
  check('a pending upload does not repopulate after reset', pending.photos === 0, JSON.stringify(pending));

  /* 8. export / import clarity */
  const exportMsg = await page.evaluate(async () => {
    document.getElementById('exportBtn').click();
    await new Promise((r) => setTimeout(r, 120));
    return document.getElementById('statusMsg').textContent;
  });
  check('export states what the file contains', /on screen right now/.test(exportMsg), exportMsg.slice(0, 90));

  const importFlow = await page.evaluate(async () => {
    const payload = JSON.stringify({ kind: 'ktm-proposal', v: 3, proposal: { id: 'p_imported', form: { custName: 'Imported Customer', capacity: '11' }, options: [] } });
    const file = new File([payload], 'ProposalFile.json', { type: 'application/json' });
    const input = document.getElementById('importFile');
    const dt = new DataTransfer(); dt.items.add(file);
    Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
    const before = Proposals.list().length;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const afterFirst = { count: Proposals.list().length, customer: (Proposals.active().form || {}).custName, message: document.getElementById('statusMsg').textContent, empty: document.getElementById('importFile').value === '' };
    /* the same file again */
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    return { before, afterFirst, afterSecond: Proposals.list().length };
  });
  check('import creates a NEW proposal', importFlow.afterFirst.count === importFlow.before + 1, importFlow.afterFirst.count + ' vs ' + importFlow.before);
  check('import reports it was added as a new draft', /as a new draft/.test(importFlow.afterFirst.message), importFlow.afterFirst.message.slice(0, 90));
  check('the same file can be selected again', importFlow.afterSecond === importFlow.before + 2, String(importFlow.afterSecond));
  check('the file picker is cleared after import', importFlow.afterFirst.empty === true, String(importFlow.afterFirst.empty));

  const badImport = await page.evaluate(async () => {
    const file = new File(['<html>not a backup</html>'], 'junk.json', { type: 'application/json' });
    const input = document.getElementById('importFile');
    const dt = new DataTransfer(); dt.items.add(file);
    Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
    const before = Proposals.list().length;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    return { message: document.getElementById('statusMsg').textContent, unchanged: Proposals.list().length === before };
  });
  check('an invalid file gives a clear message and changes nothing',
    /not a Quotation Studio backup/.test(badImport.message) && badImport.unchanged, badImport.message.slice(0, 90));

  /* 9. multi-tab protection */
  const tabB = await context.newPage();
  await tabB.goto(BASE + '/quotation.html', { waitUntil: 'networkidle0' });
  await settle(tabB, 400);
  const conflict = await page.evaluate(async () => {
    const id = Proposals.activeId();
    /* simulate another tab having written a newer revision of this proposal */
    const stored = JSON.parse(localStorage.getItem('qstudio.proposal.' + id));
    stored.updatedAt = new Date(Date.now() + 60000).toISOString();
    stored.form = Object.assign({}, stored.form, { custName: 'From another tab' });
    localStorage.setItem('qstudio.proposal.' + id, JSON.stringify(stored));
    localStorage.setItem('qstudio.activeId', id);
    document.getElementById('custName').value = 'Typed here';
    document.getElementById('custName').dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    return { message: document.getElementById('statusMsg').textContent,
             indicator: document.getElementById('saveIndicator').dataset.state,
             kept: document.getElementById('custName').value,
             other: JSON.parse(localStorage.getItem('qstudio.proposal.' + id)).form.custName };
  });
  check('a newer revision from another tab is not overwritten', conflict.other === 'From another tab', String(conflict.other));
  check('the conflict is reported to the user', /another tab or window/i.test(conflict.message), conflict.message.slice(0, 100));
  check('the unsaved work stays on screen', conflict.kept === 'Typed here' && conflict.indicator === 'error', conflict.kept + '/' + conflict.indicator);

  const crossOver = await page.evaluate(async () => {
    const a = Proposals.activeId(), b = Proposals.list().find((p) => p.id !== a).id;
    Proposals.setActive(a);
    const tabValue = sessionStorage.getItem('qstudio.tabActiveId');
    localStorage.setItem('qstudio.activeId', b);   /* the other tab switches */
    const used = Proposals.activeId();
    return { tabValue, used, stable: used === a, shared: localStorage.getItem('qstudio.activeId') };
  });
  check('each tab keeps its own active proposal, whatever the shared key says',
    crossOver.stable === true && crossOver.tabValue === crossOver.used, JSON.stringify(crossOver));

  const pad = (s, n) => String(s).padEnd(n);
  let failed = 0;
  results.forEach((r) => {
    if (!r.ok) failed++;
    console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.name + (r.ok ? '' : '  → ' + r.detail));
  });
  console.log('\n' + results.length + ' checks, ' + failed + ' failed');
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
