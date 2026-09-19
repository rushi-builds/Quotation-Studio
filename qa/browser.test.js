/* Real-browser QA via puppeteer-core + bundled chromium.
   Run: LD_LIBRARY_PATH=/tmp/allibs/lib node qa/browser.test.js */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const BASE = process.env.QA_BASE || 'http://localhost:8020';
const OUT = __dirname + '/shots';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: '/tmp/chromium-bin/chromium',
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars', '--font-render-hinting=none'],
    defaultViewport: { width: 1440, height: 950 }
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

  await page.goto(BASE + '/quotation.html', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 900));

  const t = (name, ok, extra) => console.log((ok ? '  ✓ ' : '  ✗ FAIL: ') + name + (ok || extra === undefined ? '' : ' → ' + extra));

  /* ---- integrity ---- */
  const pageCount = await page.$$eval('.page', (els) => els.length);
  const visibleCount = await page.$$eval('.page', (els) => els.filter((e) => e.getClientRects().length > 0).length);
  t('17 page shells (options + financing hidden by default)', pageCount === 17, pageCount);
  t('15 visible (options hidden by default)', visibleCount === 15, visibleCount);
  const kv = await page.evaluate(() => ({
    coverName: document.getElementById('v_coverCustName').textContent,
    heroNet: document.getElementById('v_exHeroNet').textContent,
    payback: document.getElementById('v_exHeroPayback').textContent,
    pgnum: document.getElementById('v_pgnum_pageTerms').textContent,
    donutHidden: document.getElementById('v_inBomSection').style.display === 'none',
    kpis: document.querySelectorAll('#v_exKpis .kpi-tile').length
  }));
  t('cover personalised', kv.coverName.includes('Bhooshan'), kv.coverName);
  t('hero net ₹6,08,070', kv.heroNet === '₹6,08,070', kv.heroNet);
  t('payback ~3.7', /^3\.\d/.test(kv.payback), kv.payback);
  t('page numbering', kv.pgnum === 'Page 14 of 15', kv.pgnum);
  t('8 KPI tiles', kv.kpis === 8, kv.kpis);

  /* ---- canvas charts have real pixels ---- */
  const canv = await page.evaluate(() => ['chartCum', 'chartAnnual', 'chartBridge'].map((id) => {
    const c = document.getElementById(id);
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let non = 0;
    for (let i = 3; i < d.length; i += 400) if (d[i] !== 0) non++;
    return { id, non, w: c.width, h: c.height };
  }));
  canv.forEach((c) => t(`chart ${c.id} painted (${c.w}×${c.h})`, c.non > 50, c.non));

  /* ---- no content overflow: every page's scrollHeight within budget ---- */
  const overflow = await page.evaluate(() => {
    return [...document.querySelectorAll('.page')].map((p) => {
      const body = p.querySelector('.pg-body');
      return { id: p.id, sh: p.scrollHeight, ch: p.clientHeight, bodyOverflow: body ? body.scrollHeight - body.clientHeight : 0 };
    }).filter((x) => x.sh > x.ch + 1 || x.bodyOverflow > 2);
  });
  t('no vertical overflow on any page', overflow.length === 0, JSON.stringify(overflow));

  /* ---- interactions ---- */
  await page.select('#customerType', 'commercial');
  await new Promise((r) => setTimeout(r, 300));
  const subCap = await page.$eval('#v_inCostSubCap', (e) => e.textContent);
  t('commercial subsidy caption', subCap.includes('Not applicable'), subCap);
  await page.select('#customerType', 'residential');
  await new Promise((r) => setTimeout(r, 200));

  await page.type('#bomModules', '300000');
  await page.type('#bomInverter', '80000');
  await page.type('#bomStructure', '70000');
  await page.type('#bomBos', '60000');
  await page.type('#bomInstall', '90000');
  await page.type('#bomLiaison', '30000');
  await new Promise((r) => setTimeout(r, 500));
  const donutShown = await page.$eval('#v_inBomSection', (e) => e.style.display !== 'none');
  t('BOM donut appears', donutShown);
  const donutPixels = await page.evaluate(() => {
    const c = document.getElementById('chartDonut');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let non = 0;
    for (let i = 3; i < d.length; i += 100) if (d[i] !== 0) non++;
    return non;
  });
  t('donut painted', donutPixels > 100, donutPixels);

  /* ---- system options (Good/Better/Best) + cover QR ---- */
  await page.evaluate(() => { document.getElementById('optName').focus(); });
  await page.type('#optName', 'Good — 5 kWp');
  await page.evaluate(() => { const c = document.getElementById('capacity'); c.value = '5'; c.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#optSave');
  await page.evaluate(() => { const c = document.getElementById('capacity'); c.value = '8'; c.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => { document.getElementById('optName').focus(); });
  await page.type('#optName', 'Best — 8 kWp');
  await page.click('#optSave');
  await new Promise((r) => setTimeout(r, 400));
  const opt = await page.evaluate(() => ({
    visible: document.querySelector('[data-page="pageOptions"]').getClientRects().length > 0,
    chips: document.querySelectorAll('#pageNav .nav-chip').length,
    opgnum: document.getElementById('v_pgnum_pageOptions').textContent,
    cols: document.querySelectorAll('#v_opTable thead th').length,
    rows: document.querySelectorAll('#v_opTable tbody tr').length,
    bests: document.querySelectorAll('#v_opTable td.best').length,
    names: document.getElementById('v_opTable').textContent.includes('Good — 5 kWp') &&
           document.getElementById('v_opTable').textContent.includes('Best — 8 kWp'),
    optCount: (window.__qsOptions || []).length
  }));
  t('options page visible with 2 options', opt.visible, opt.visible);
  t('16 nav chips', opt.chips === 16, opt.chips);
  t('options page numbered', opt.opgnum === 'Page 3 of 16', opt.opgnum);
  t('comparison table 2 cols × 10 rows', opt.cols === 3 && opt.rows === 10, opt.cols + 'x' + opt.rows);
  t('best cells highlighted', opt.bests >= 3, opt.bests);
  t('option names in header', opt.names, opt.names);

  const rec = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('#optList button[data-act="rec"]')];
    btns[btns.length - 1].click();
    return !!document.querySelector('#v_opTable th .opt-rec');
  });
  t('recommended badge on table', rec, rec);
  const chips = await page.evaluate(() => ({
    n: document.querySelectorAll('#v_opChips .opt-chip').length,
    lead: (document.querySelector('#v_opChips .oc-lead') || {}).textContent || ''
  }));
  t('3 at-a-glance chips', chips.n === 3, chips.n);
  t('chips lead-in', /glance/i.test(chips.lead), chips.lead);

  await page.evaluate(() => { const u = document.getElementById('shareUrl'); u.value = 'https://example.com/proposals/KTME-2026-013'; u.dispatchEvent(new Event('input', { bubbles: true })); });
  await new Promise((r) => setTimeout(r, 600));
  const qr = await page.evaluate(() => {
    const wrap = document.getElementById('coverQrWrap');
    const c = document.getElementById('qrCover');
    if (!wrap || !c) return { shown: false };
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 100) dark++;
    return { shown: wrap.getClientRects().length > 0, w: c.width, dark };
  });
  t('cover QR shown for valid link', qr.shown === true, JSON.stringify(qr));
  t('cover QR painted', qr.w >= 92 && qr.dark > 200, JSON.stringify(qr));
  await page.evaluate(() => { const u = document.getElementById('shareUrl'); u.value = ''; u.dispatchEvent(new Event('input', { bubbles: true })); });
  await new Promise((r) => setTimeout(r, 400));
  const qrGone = await page.evaluate(() => document.getElementById('coverQrWrap').getClientRects().length === 0);
  t('cover QR hidden when link cleared', qrGone, qrGone);
  /* restore the demo link so the cover screenshot shows the QR */
  await page.evaluate(() => { const u = document.getElementById('shareUrl'); u.value = 'https://example.com/proposals/KTME-2026-013'; u.dispatchEvent(new Event('input', { bubbles: true })); });
  await new Promise((r) => setTimeout(r, 500));

  /* ---- WhatsApp share opens wa.me with a crafted message ---- */
  await page.evaluate(() => { window.__opened = null; window.open = (u) => { window.__opened = u; return {}; }; });
  await page.click('#waShare');
  const wa = await page.evaluate(() => window.__opened || '');
  t('wa.me share opens', wa.startsWith('https://wa.me/?text='), wa.slice(0, 60));
  t('wa.me message carries link + customer', decodeURIComponent(wa).includes('Bhooshan') && decodeURIComponent(wa).includes('KTME-2026-013'));

  /* ---- screenshots of every VISIBLE page (desktop) ----
     viewport 1260 + hidden sticky toolbar: element.screenshot clips
     mis-align with the sticky toolbar and wide viewports. */
  await page.setViewport({ width: 1260, height: 950 });
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => { const tb = document.querySelector('.preview-toolbar'); if (tb) tb.style.visibility = 'hidden'; });
  const ids = await page.$$eval('.page', (els) => els.filter((e) => e.getClientRects().length > 0).map((e) => e.id));
  for (const id of ids) {
    const el = await page.$('#' + id);
    await el.evaluate((n) => n.scrollIntoView({ block: 'start' }));
    await new Promise((r) => setTimeout(r, 150));
    await el.screenshot({ path: `${OUT}/${id}.png`, captureBeyondViewport: false });
  }
  await page.evaluate(() => { const tb = document.querySelector('.preview-toolbar'); if (tb) tb.style.visibility = ''; });
  await page.setViewport({ width: 1440, height: 950 });
  await new Promise((r) => setTimeout(r, 400));
  console.log('  ✓ desktop screenshots:', ids.length);

  /* ---- autosave indicator ---- */
  await new Promise((r) => setTimeout(r, 700));
  const saved = await page.evaluate(() =>
    Object.keys(localStorage).some((k) => k.startsWith('qstudio.proposal.')));
  t('autosave persisted', saved);

  /* ---- mobile pass ---- */
  await page.setViewport({ width: 390, height: 844 });
  await new Promise((r) => setTimeout(r, 700));
  const mScale = await page.evaluate(() => getComputedStyle(document.getElementById('pageExec')).transform);
  t('pages scaled on mobile', mScale.includes('matrix') && mScale !== 'none', mScale);
  await page.screenshot({ path: `${OUT}/mobile-top.png` });
  await page.evaluate(() => document.getElementById('pageSavings').scrollIntoView());
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `${OUT}/mobile-savings.png` });

  /* ---- real PDF export ---- */
  await page.setViewport({ width: 1440, height: 950 });
  await new Promise((r) => setTimeout(r, 400));
  const client = await page.createCDPSession();
  await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });
  await page.click('#downloadBtn');
  const pdfPath = OUT + '/export-test.pdf';
  let pdfOk = false, lastStatus = '';
  for (let i = 0; i < 360; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = await page.$eval('#statusMsg', (e) => e.textContent).catch(() => '');
    if (st && st !== lastStatus) { console.log('   …', st); lastStatus = st; }
    const any = fs.existsSync(pdfPath) ||
      fs.readdirSync(OUT).some((f) => f.endsWith('.pdf') && fs.statSync(OUT + '/' + f).size > 50000);
    if (st.includes('Downloaded') || any) { pdfOk = true; break; }
  }
  t('PDF exported', pdfOk);
  if (pdfOk) {
    let pdfFile = null;
    for (let i = 0; i < 100 && !pdfFile; i++) {
      const f = fs.readdirSync(OUT).find((f) => f.endsWith('.pdf') && fs.statSync(OUT + '/' + f).size > 50000);
      if (f) pdfFile = OUT + '/' + f; else await new Promise((r) => setTimeout(r, 100));
    }
    if (pdfFile) console.log('   PDF:', require('path').basename(pdfFile), (fs.statSync(pdfFile).size / 1048576).toFixed(2) + ' MB');
  }
  const status = await page.$eval('#statusMsg', (e) => e.textContent);
  t('status confirms 16 pages', status.includes('16'), status);

  /* ---- financing (EMI) page: appears, paints, exports as page 17 ---- */
  console.log('— financing (EMI) —');
  /* the first export must be fully finished (button re-enabled, status final)
     before we mutate state — a mid-run click would be silently ignored */
  let settled = false;
  for (let i = 0; i < 120; i++) {
    const st = await page.$eval('#statusMsg', (e) => e.textContent).catch(() => '');
    const btnOff = await page.$eval('#downloadBtn', (e) => e.disabled).catch(() => true);
    if (st.includes('Downloaded') && !btnOff) { settled = true; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  t('first export settled before financing checks', settled);
  await page.type('#loanAmt', '500000');
  await page.type('#loanRate', '9');
  await page.type('#loanYears', '10');
  await new Promise((r) => setTimeout(r, 900));
  const fin = await page.evaluate(() => {
    const pg = document.getElementById('pageFinance');
    let painted = 0;
    try {
      const d = document.getElementById('chartFinEmi').getContext('2d').getImageData(0, 0, 718, 330).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) painted++;
    } catch (e) { /* noop */ }
    return {
      visible: document.querySelector('.page-wrap[data-page="pageFinance"]').style.display !== 'none',
      overflow: pg.scrollHeight > 1124,
      painted,
      nav: document.querySelectorAll('#pageNav .nav-chip').length
    };
  });
  t('financing page visible', fin.visible);
  t('financing nav chip (17 pages)', fin.nav === 17, fin.nav);
  t('financing page fits (no overflow)', !fin.overflow, fin.overflow);
  t('EMI chart painted', fin.painted > 500, fin.painted);
  await page.evaluate(() => { const t = document.querySelector('.preview-toolbar'); if (t) t.style.visibility = 'hidden'; });
  await page.setViewport({ width: 1260, height: 950 });
  await new Promise((r) => setTimeout(r, 400));
  const finEl = await page.$('#pageFinance');
  await finEl.evaluate((n) => n.scrollIntoView({ block: 'start' }));
  await new Promise((r) => setTimeout(r, 150));
  await finEl.screenshot({ path: `${OUT}/financing.png`, captureBeyondViewport: false });
  await page.evaluate(() => { const t = document.querySelector('.preview-toolbar'); if (t) t.style.visibility = ''; });
  await page.setViewport({ width: 1440, height: 950 });
  await new Promise((r) => setTimeout(r, 400));
  fs.readdirSync(OUT).forEach((f) => { if (f.endsWith('.pdf')) fs.unlinkSync(OUT + '/' + f); });
  await page.$eval('#statusMsg', (e) => { e.textContent = ''; });
  await page.click('#downloadBtn');
  let pdfOk2 = false, status2 = '';
  for (let i = 0; i < 360; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const st = await page.$eval('#statusMsg', (e) => e.textContent).catch(() => '');
    if (st && st !== lastStatus) { console.log('   …', st); lastStatus = st; }
    if (st.includes('Downloaded')) { pdfOk2 = true; status2 = st; break; }
  }
  t('PDF with financing exported', pdfOk2);
  if (pdfOk2) {
    const f2 = fs.readdirSync(OUT).find((f) => f.endsWith('.pdf') && fs.statSync(OUT + '/' + f).size > 50000);
    if (f2) console.log('   PDF:', f2, (fs.statSync(OUT + '/' + f2).size / 1048576).toFixed(2) + ' MB');
  }
  t('status confirms 17 pages with financing', status2.includes('17'), status2);
  await page.evaluate(() => {
    ['loanAmt', 'loanRate', 'loanYears'].forEach((id) => {
      const e = document.getElementById(id); e.value = '';
      e.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  await new Promise((r) => setTimeout(r, 700));
  t('financing page hides when loan cleared',
    await page.evaluate(() => document.querySelector('.page-wrap[data-page="pageFinance"]').style.display === 'none'));

  console.log('\nERRORS (' + errors.length + '):');
  errors.slice(0, 10).forEach((e) => console.log(' ', e.slice(0, 250)));

  /* ---- customer share view ---- */
  const shareId = await page.evaluate(() => localStorage.getItem('qstudio.activeId'));
  const p2 = await browser.newPage();
  p2.on('pageerror', (e) => errors.push('[share pageerror] ' + e.message));
  await p2.goto(BASE + '/share.html?p=' + shareId, { waitUntil: 'networkidle0', timeout: 60000 });
  await p2.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 900));
  const sv = await p2.evaluate(() => ({
    cust: document.getElementById('shareCustomer').textContent,
    visible: [...document.querySelectorAll('.page-wrap')].filter((x) => x.getClientRects().length > 0).length,
    hero: document.getElementById('v_exHeroNet') ? document.getElementById('v_exHeroNet').textContent : '',
    noForm: !document.getElementById('quoteForm'),
    optVisible: document.querySelector('[data-page="pageOptions"]').getClientRects().length > 0
  }));
  const expPages = await page.evaluate(() => {
    const b = JSON.parse(localStorage.getItem('qstudio.proposal.' + localStorage.getItem('qstudio.activeId')));
    return (b.options || []).length >= 2 ? 16 : 15;
  });
  t('share: customer banner', sv.cust.includes('Bhooshan'), sv.cust);
  t('share: ' + expPages + ' pages visible (options-aware)', sv.visible === expPages, sv.visible);
  t('share: finance rendered', /₹/.test(sv.hero), sv.hero);
  t('share: read-only (no builder form)', sv.noForm, sv.noForm);
  await p2.evaluate(() => document.querySelector('.share-topbar').scrollIntoView());
  await p2.screenshot({ path: `${OUT}/share-view-top.png` });
  await p2.evaluate(() => document.querySelector('[data-page="pageOptions"]').scrollIntoView());
  await new Promise((r) => setTimeout(r, 400));
  await p2.screenshot({ path: `${OUT}/share-view-options.png` });
  t('share: options page present', sv.optVisible, sv.optVisible);
  await p2.close();

  console.log('---');
  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  await browser.close();
  process.exit(errors.length ? 2 : 0);
})().catch((e) => { console.error('QA crashed:', e.message); process.exit(1); });
