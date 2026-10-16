/* Approved customer-facing investment layout and builder summary; no finance changes. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const battery = require('./bess-fixture.js');
(async () => {
  const { default: bundle } = await import('@sparticuz/chromium');
  const browser = await chromium.launch({ executablePath: await bundle.executablePath(), args: bundle.args.filter(a => a !== '--single-process'), headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
    await page.goto(base + '/quotation.html');
    await page.waitForFunction(() => !!window.Render?.lastState);
    await page.evaluate(() => document.fonts.ready);
    const bom = { bomModules: '100000', bomInverter: '20000', bomStructure: '15000', bomBos: '10000', bomInstall: '15000', bomLiaison: '5000' };
    const fixtures = [
      ['residential', {}], ['commercial', { customerType: 'commercial', capacity: '100' }],
      ['industrial', { customerType: 'industrial', capacity: '100' }], ['RWA provisional', { customerType: 'rwa', capacity: '100' }],
      ['RWA confirmed', { customerType: 'rwa', capacity: '100', rwaEligibleKwp: '60' }],
      ['manual subsidy', { subsidyOverride: '50000' }], ['zero subsidy', { subsidyOverride: '0' }],
      ['negative effective cost', { subsidyOverride: '99999999' }], ['state top-up', { stateTopUp: '10000' }],
      ['residential BOM', bom], ['commercial BOM', { ...bom, customerType: 'commercial' }],
      ['industrial BOM', { ...bom, customerType: 'industrial' }],
      ['commercial BOM payment warning', { ...bom, customerType: 'commercial', payCompletion: '5' }], ['RWA BOM', { ...bom, customerType: 'rwa' }],
      ['battery and additional system', { ...battery, bessSpecMode: 'manual', bessInclude: true, systemEnabled: true, systemInclude: true, systemTemplate: 'custom', systemName: 'EV charger', systemPrice: '150000' }]
    ];
    async function checkView(view, builder) {
      const result = await view.evaluate(() => {
        const s = Render.lastState, f = Finance.compute(s), page = document.getElementById('pageInvestment');
        const text = id => document.getElementById(id).textContent;
        const foot = page.querySelector('.pg-foot').getBoundingClientRect();
        const disclaimer = page.querySelector('#v_inDisclaimer').getBoundingClientRect();
        const blocks = [...page.querySelector('.pg-body').children].filter(el => el.id !== 'v_inDisclaimer' && el.getBoundingClientRect().height);
        return {
          gross: text('v_inGrossTotal'), net: text('v_inCostNet'), base: text('v_inCostBase'), gst: text('v_inCostGst'), subsidy: text('v_inCostSub'),
          expected: { gross: Finance.fmtINR(f.grossTotal), net: Finance.fmtINR(f.netInvestment), base: Finance.fmtINR(f.projectCost), gst: '+ ' + Finance.fmtINR(f.gstAmount), subsidy: '− ' + Finance.fmtINR(f.subsidy) },
          labels: [text('v_inCostBaseL'), text('v_inCostNetL')],
          cards: page.querySelectorAll('.inv-card').length,
          cardRows: [...page.querySelectorAll('.inv-card')].map(el => ({ top: el.offsetTop, width: el.offsetWidth })),
          chartHeight: page.querySelector('#chartBridge').clientHeight,
          chartAspectCorrect: Math.abs(page.querySelector('#chartBridge').width / page.querySelector('#chartBridge').clientWidth - page.querySelector('#chartBridge').height / page.querySelector('#chartBridge').clientHeight) < .03,
          header: page.querySelector('.inv-total-label').textContent,
          summary: document.querySelector('[data-metric="investment"]')?.textContent,
          summaryLabel: document.querySelector('[data-metric="investment"]')?.previousElementSibling.textContent,
          energyLabel: document.querySelector('[data-metric="energy"]')?.previousElementSibling.textContent,
          energy: document.querySelector('[data-metric="energy"]')?.textContent, expectedEnergy: Finance.fmtNum(f.annualGen) + ' kWh',
          scopeLabel: Bess.included(s) || AdditionalSystems.included(s) ? 'Solar Project Cost' : 'Total Project Cost',
          height: page.scrollHeight, footClear: disclaimer.bottom <= foot.top - 1,
          collisions: blocks.filter(el => el.getBoundingClientRect().bottom > disclaimer.top - 2).map(el => ({ id: el.id || el.className, bottom: el.getBoundingClientRect().bottom, limit: disclaimer.top })),
          clippedCards: [...page.querySelectorAll('.inv-v')].filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.id),
          retiredCopy: /auto-calculated|not generated automatically|guaranteed energy savings/.test(page.textContent),
          retainedNotes: page.textContent.includes('not an upfront discount') && text('v_inDisclaimer').includes('approval'),
          payments: [...page.querySelectorAll('.pay-chip .pa')].map(el => el.textContent), expectedPayments: [f.pay.advance, f.pay.dispatch, f.pay.completion].map(p => Finance.fmtINR(p.amount))
        };
      });
      for (const key of ['gross', 'net', 'base', 'gst', 'subsidy']) assert.equal(result[key], result.expected[key], key);
      assert.equal(result.header, 'TOTAL PAYABLE TO KTM · INCLUDING GST');
      assert.equal(result.cards, 5);
      assert(result.cardRows.slice(0, 3).every(card => card.top === result.cardRows[0].top && card.width >= 200));
      assert(result.cardRows[3].top === result.cardRows[4].top && result.cardRows[3].top > result.cardRows[0].top && result.cardRows[3].width >= 300, 'three cost cards then two wider benefit cards');
      assert(result.chartHeight >= 240 && result.chartAspectCorrect, 'tall chart is redrawn, never stretched');
      assert.deepEqual(result.payments, result.expectedPayments);
      assert(result.height <= 1124 && result.footClear, JSON.stringify(result));
      assert.deepEqual(result.collisions, [], 'content stays above the disclaimer/footer');
      assert.deepEqual(result.clippedCards, [], 'all currency values fit');
      assert(!result.retiredCopy && result.retainedNotes);
      if (builder) {
        assert.equal(result.summary, result.expected.gross, 'builder uses gross total, not renamed net investment');
        assert.equal(result.summaryLabel, result.scopeLabel);
        assert.equal(result.energyLabel, 'Annual Energy');
        assert.equal(result.energy, result.expectedEnergy);
      }
    }
    for (const [name, fields] of fixtures) {
      await page.evaluate(fields => {
        StateStore.applyForm({ ...StateStore.DEFAULTS, custName: 'Investment QA', propRef: 'KTM-QA-INV', capacity: '3', costPerWp: '62.5', gstPercent: '8.9', genFactor: '1460', ...fields });
        Render.renderAll();
      }, fields);
      // The workspace listens to its normal input/render update path.
      await page.locator('#capacity').dispatchEvent('input');
      await checkView(page, true);
      console.log('PASS:', name, '— finance values, gross summary, five cards and A4 clearance');
    }
    // Legacy defaults migrate on saved proposals; custom wording must survive.
    const migration = await page.evaluate(() => {
      const old = { shared: { footerTagline: 'Engineering Excellence • Premium Quality • Trusted Performance' }, pageInvestment: { cards: { projectCost: 'Project Cost', subsidy: 'Government Subsidy', netInvestment: 'Net Investment', netInvestmentCaption: 'Payable after subsidy', subsidyCaptionAuto: 'PM Surya Ghar - auto-calculated' } } };
      const custom = { shared: { footerTagline: 'Custom approved footer' }, pageInvestment: { cards: { projectCost: 'Custom cost caption' } } };
      return { migrated: upgradeProposalContent(old), custom: upgradeProposalContent(custom) };
    });
    assert.equal(migration.migrated.shared.footerTagline, 'Engineering Excellence • Trusted Performance');
    assert.equal(migration.migrated.pageInvestment.cards.netInvestment, 'Effective Cost After Subsidy');
    assert.equal(migration.migrated.pageInvestment.cards.subsidyCaptionAuto, 'PM Surya Ghar · Subject to approval');
    assert.equal(migration.custom.shared.footerTagline, 'Custom approved footer');
    assert.equal(migration.custom.pageInvestment.cards.projectCost, 'Custom cost caption');
    await page.evaluate(() => { StateStore.applyForm({ ...StateStore.DEFAULTS, custName: 'Investment QA', propRef: 'KTM-QA-INV', capacity: '3', costPerWp: '62.5', gstPercent: '8.9' }); Render.renderAll(); window.__qsSaveNow(); });
    await page.reload(); await page.waitForFunction(() => !!window.Render?.lastState);
    await checkView(page, true);
    await page.emulateMedia({ media: 'print' }); await checkView(page, true);
    await page.emulateMedia({ media: 'screen' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => Render.fitPages()); await checkView(page, true);
    await page.setViewportSize({ width: 1440, height: 1100 });
    const id = await page.evaluate(() => Proposals.activeId());
    const shared = await context.newPage();
    shared.on('pageerror', e => errors.push(e.message));
    await shared.goto(base + '/share.html?p=' + encodeURIComponent(id));
    await shared.waitForFunction(() => !!window.Render?.lastState); await checkView(shared, false);
    await shared.close();
    const shots = path.join(__dirname, 'shots', 'investment'); fs.mkdirSync(shots, { recursive: true });
    const png = await page.evaluate(async () => {
      const copy = document.getElementById('pageInvestment').cloneNode(true);
      copy.style.transform = 'none';
      const source = document.getElementById('pageInvestment');
      const canvases = source.querySelectorAll('canvas');
      copy.querySelectorAll('canvas').forEach((canvas, i) => canvas.getContext('2d').drawImage(canvases[i], 0, 0));
      const host = document.createElement('div'); host.className = 'pdf-snapshot'; host.append(copy); document.body.append(host);
      try { return (await html2canvas(copy, { scale: 1.5, logging: false, backgroundColor: '#fff' })).toDataURL(); }
      finally { host.remove(); }
    });
    fs.writeFileSync(path.join(shots, 'investment-page.png'), Buffer.from(png.split(',')[1], 'base64'));
    if (process.env.QA_REAL_PDF === '1') {
      const pdf = await page.evaluate(async () => {
        const Original = jspdf.jsPDF, originalCanvas = html2canvas;
        let investmentCaptured = false, data;
        jspdf.jsPDF = function(...args) {
          const doc = new Original(...args);
          doc.save = () => { data = doc.output('datauristring').split(',')[1]; };
          return doc;
        };
        window.html2canvas = async (el, options) => {
          if (el.id === 'pageInvestment') {
            const expected = Finance.fmtINR(Finance.compute(Render.lastState).grossTotal);
            if (el.querySelector('#v_inGrossTotal').textContent !== expected) throw new Error('Snapshot gross amount differs');
            investmentCaptured = true;
          }
          return originalCanvas(el, options);
        };
        try {
          await Exporter.exportPdf(() => {}, { format: 'full' });
          return { data, count: Render.lastVisible.length, investmentCaptured, cleaned: !document.querySelector('.pdf-snapshot') };
        } finally { jspdf.jsPDF = Original; window.html2canvas = originalCanvas; }
      });
      assert(pdf.investmentCaptured && pdf.cleaned);
      const bytes = Buffer.from(pdf.data, 'base64');
      assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length, pdf.count);
      fs.writeFileSync(path.join(shots, 'Detailed-Investment-Proposal.pdf'), bytes);
      console.log('PASS: real detailed PDF, ' + pdf.count + ' pages, correct snapshot gross amount and cleanup.');
    }
    assert.deepEqual(errors, []);
    console.log('PASS: saved reload, exact-default copy migration, custom copy retained, print/mobile, Customer View and real PDF canvas rendering.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
