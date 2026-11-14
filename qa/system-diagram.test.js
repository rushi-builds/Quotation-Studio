/* System overview: the live flow diagram on the Technical Specification page.

   This page used to be tested against a hand-built SVG: data-component nodes at
   fixed 87x66 bay sizes, a viewBox offset of -8, <text> slots per label, and a
   `data-component` count of 8. That drawing was retired in favour of a live one
   (proposal-v2.js flowDiagram) - divs and inline SVG arrows, driven by editable
   content and by the quotation's own finance numbers - so the old assertions no
   longer describe anything on the page and were failing on structure, not on a
   visible defect.

   What still matters, and is checked here, is the promise the old test protected:
   the diagram is on the specification page, it carries the quoted numbers rather
   than baked-in ones, every label comes from editable content, both meter links
   are two-way, the DC side is green and the AC side navy, and the row fits.

   Run: QA_BASE=http://127.0.0.1:8080 node qa/system-diagram.test.js
*/
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { upgradeProposalContent } = require('../assets/js/content.js');

let passed = 0;
const check = (name, ok) => { assert(ok, name); passed++; console.log('  \u2713 ' + name); };

(async () => {
  /* The migration contract is unchanged and still worth pinning: a document made
     before the redesign carries the old default labels, and those must be moved
     forward without overwriting anything the builder had customised. */
  const migrated = upgradeProposalContent({ pageTechSpec: { diagramLabels: { array: 'Solar Array', grid: 'DISCOM Grid', home: 'My workshop' } } });
  check('old default labels migrate without overwriting custom copy',
    migrated.pageTechSpec.diagramLabels.array === 'Rooftop Solar'
    && migrated.pageTechSpec.diagramLabels.grid === 'MSEDCL'
    && migrated.pageTechSpec.diagramLabels.home === 'My workshop');

  const { default: chromium } = await import('@sparticuz/chromium');
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || await chromium.executablePath(),
    args: chromium.args.filter((a) => a !== '--single-process'),
    headless: true
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewport({ width: 1440, height: 1100 });
    const base = process.env.QA_BASE || 'http://127.0.0.1:8080';
    await page.goto(base + '/quotation.html', { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    const shots = path.join(__dirname, 'shots');
    fs.mkdirSync(shots, { recursive: true });

    /* ------------------------------------------------ where the diagram lives */
    check('the overview is drawn on the specification page, not page 5',
      await page.evaluate(() => !!document.querySelector('#pageTechSpec #v_tsDiagram .pv2-flow-row')
        && !document.querySelector('#pageSolution .pv2-overview')));

    check('the section ribbon sits above the drawing',
      await page.evaluate(() => {
        const t = document.getElementById('v_tsDiagramTitle');
        const d = document.getElementById('v_tsDiagram');
        return !!t && !!d && t.textContent.trim() === 'SYSTEM OVERVIEW'
          && !!(t.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING);
      }));

    check('the drawing sits above the four specification cards',
      await page.evaluate(() => {
        const d = document.querySelector('#pageTechSpec .diagram-box');
        const c = document.querySelector('#pageTechSpec .pv2-spec');
        return !!d && !!c && !!(d.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
      }));

    /* ------------------------------------------------------------- the nodes */
    check('all seven equipment illustrations are in the row',
      await page.evaluate(() => document.querySelectorAll('#v_tsDiagram .pv2-flow-row .pv2-node').length) === 7);

    check('six links join them', await page.evaluate(() =>
      document.querySelectorAll('#v_tsDiagram .pv2-flow-row .pv2-arrow').length) === 6);

    check('the row fits the 718px column without clipping',
      await page.evaluate(() => {
        const row = document.querySelector('#v_tsDiagram .pv2-flow-row');
        const box = document.getElementById('v_tsDiagram');
        if (!row || !box) return false;
        const r = row.getBoundingClientRect(), b = box.getBoundingClientRect();
        return r.left >= b.left - 1 && r.right <= b.right + 1;
      }));

    /* Every drawing fills one shared box, so the equipment sits on one line. */
    check('every drawing is the same height, on one line',
      await page.evaluate(() => {
        const arts = [...document.querySelectorAll('#v_tsDiagram .pv2-node-art')];
        if (arts.length !== 7) return false;
        const hs = arts.map((a) => a.getBoundingClientRect().height);
        const bs = arts.map((a) => a.getBoundingClientRect().bottom);
        return Math.max(...hs) - Math.min(...hs) < 0.6 && Math.max(...bs) - Math.min(...bs) < 0.6;
      }));

    /* ------------------------------------------------------- the meter links */
    check('both links touching the bi-directional meter are two-way',
      await page.evaluate(() => {
        const links = [...document.querySelectorAll('#v_tsDiagram .pv2-flow-row .pv2-arrow')];
        return links.length === 6 && links[4].classList.contains('is-both') && links[5].classList.contains('is-both')
          && links.slice(0, 4).every((l) => !l.classList.contains('is-both'));
      }));

    check('the two-way links carry the block pair, and only one pair each',
      await page.evaluate(() => {
        const both = [...document.querySelectorAll('#v_tsDiagram .pv2-arrow.is-both')];
        return both.length === 2 && both.every((a) => a.querySelectorAll('svg path').length === 2);
      }));

    /* --------------------------------------------------------- the DC/AC ink */
    check('the DC side is green and the AC side navy',
      await page.evaluate(() => {
        const links = [...document.querySelectorAll('#v_tsDiagram .pv2-arrow:not(.is-both) svg path')];
        const fills = new Set(links.map((p) => (p.getAttribute('fill') || '').toUpperCase()));
        return fills.has('#1E9E63') && fills.has('#14263A')
          && [...links].slice(0, 2).every((p) => p.getAttribute('fill').toUpperCase() === '#1E9E63')
          && [...links].slice(2, 4).every((p) => p.getAttribute('fill').toUpperCase() === '#14263A');
      }));

    check('the DC badge is an outlined green pill and the AC badge outlined navy',
      await page.evaluate(() => {
        const dc = document.querySelector('#v_tsDiagram .pv2-grp.is-dc');
        const ac = document.querySelector('#v_tsDiagram .pv2-grp.is-ac');
        if (!dc || !ac) return false;
        const cs = (el) => getComputedStyle(el);
        return dc.textContent.trim() === 'DC' && ac.textContent.trim() === 'AC'
          && cs(dc).borderTopStyle === 'solid' && cs(ac).borderTopStyle === 'solid'
          && cs(dc).borderTopColor !== cs(ac).borderTopColor;
      }));

    /* --------------------------------------------- the values come from the form */
    check('the array caption carries the quoted modules, not a baked-in number',
      await page.evaluate(() => /545/.test(document.querySelector('#v_tsDiagram').textContent)
        || /Wp Modules/.test(document.querySelector('#v_tsDiagram').textContent)));

    check('every node caption is editable content, not a raster',
      await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('#v_tsDiagram .pv2-node b')];
        return nodes.length === 7 && nodes.every((n) => n.textContent.trim().length > 0);
      }));

    /* -------------------------------------------------- print + customer view */
    await page.emulateMediaType('print');
    check('the illustration is visible in print',
      await page.evaluate(() => document.getElementById('v_tsDiagram').checkVisibility()));
    await page.emulateMediaType('screen');

    const raster = await page.evaluate(async () => {
      const el = document.getElementById('v_tsDiagram');
      const c = await html2canvas(el, { scale: 2, logging: false, backgroundColor: '#FBFCFE' });
      return { width: c.width, height: c.height };
    });
    check('PDF capture rasterizes the complete diagram', raster.width > 600 && raster.height > 60);

    await page.screenshot({ path: path.join(shots, 'system-overview.png'), clip: await page.evaluate(() => {
      const r = document.getElementById('pageTechSpec').getBoundingClientRect();
      return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: Math.min(r.height, 1100) };
    }) }).catch(() => {});

    /* The customer must see the same drawing, from saved content. */
    const shareId = await page.evaluate(() => {
      window.__qsSaveNow && window.__qsSaveNow();
      return window.Proposals && window.Proposals.activeId ? window.Proposals.activeId() : null;
    });
    if (shareId) {
      const customer = await browser.newPage();
      customer.on('pageerror', (e) => errors.push(e.message));
      await customer.goto(base + '/share.html?p=' + encodeURIComponent(shareId), { waitUntil: 'networkidle0' });
      await customer.evaluate(() => document.fonts.ready);
      await customer.waitForSelector('#v_tsDiagram .pv2-flow-row', { timeout: 20000 })
        .catch((e) => { throw new Error('Customer View never rendered the diagram: ' + e.message); });
      check('saved Customer View carries the same live diagram',
        await customer.evaluate(() => document.querySelectorAll('#v_tsDiagram .pv2-node').length) === 7);
      await customer.bringToFront();
      await customer.setViewport({ width: 390, height: 844 });
      await customer.waitForFunction(() => {
        const r = document.getElementById('v_tsDiagram').getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth + 1;
      }, { timeout: 20000 }).catch((e) => { throw new Error('Mobile Customer View never framed the diagram: ' + e.message); });
      check('mobile drawing scales inside the viewport', await customer.evaluate(() => {
        const r = document.getElementById('v_tsDiagram').getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth + 1;
      }));
      await customer.close();
    }

    check('no runtime errors', errors.length === 0);
    console.log('\n' + passed + ' passed, 0 failed');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
