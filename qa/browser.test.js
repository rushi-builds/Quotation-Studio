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
  t('15 pages', pageCount === 15, pageCount);
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

  /* ---- screenshots of every page (desktop) ---- */
  const ids = await page.$$eval('.page', (els) => els.map((e) => e.id));
  for (const id of ids) {
    const el = await page.$('#' + id);
    await el.screenshot({ path: `${OUT}/${id}.png` });
  }
  console.log('  ✓ desktop screenshots:', ids.length);

  /* ---- autosave indicator ---- */
  await new Promise((r) => setTimeout(r, 700));
  const saved = await page.evaluate(() => !!localStorage.getItem('qstudio.proposal.v2'));
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
    const pdfFile = fs.existsSync(pdfPath) ? pdfPath
      : OUT + '/' + fs.readdirSync(OUT).find((f) => f.endsWith('.pdf') && fs.statSync(OUT + '/' + f).size > 50000);
    console.log('   PDF:', require('path').basename(pdfFile), (fs.statSync(pdfFile).size / 1048576).toFixed(2) + ' MB');
  }
  const status = await page.$eval('#statusMsg', (e) => e.textContent);
  t('status confirms 15 pages', status.includes('15'), status);

  console.log('\nERRORS (' + errors.length + '):');
  errors.slice(0, 10).forEach((e) => console.log(' ', e.slice(0, 250)));
  await browser.close();
  process.exit(errors.length ? 2 : 0);
})().catch((e) => { console.error('QA crashed:', e.message); process.exit(1); });
