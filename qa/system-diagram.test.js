/* Illustrated overview: topology, live values, bounded text and export parity.
   QA_BASE=http://127.0.0.1:8080 node qa/system-diagram.test.js */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { upgradeProposalContent } = require('../assets/js/content.js');
let passed = 0;
const check = (name, ok) => { assert(ok, name); passed++; console.log('  ✓ ' + name); };
(async () => {
  const migrated = upgradeProposalContent({pageTechSpec:{diagramLabels:{array:'Solar Array',grid:'DISCOM Grid',home:'My workshop'}}});
  check('old default labels migrate without overwriting custom copy', migrated.pageTechSpec.diagramLabels.array === 'Rooftop Solar' && migrated.pageTechSpec.diagramLabels.grid === 'MSEDCL (MSEB)' && migrated.pageTechSpec.diagramLabels.home === 'My workshop');
  const {default: chromium} = await import('@sparticuz/chromium');
  const browser = await puppeteer.launch({executablePath: process.env.CHROMIUM_PATH || await chromium.executablePath(), args: chromium.args.filter(a => a !== '--single-process'), headless:true});
  try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({width:1440,height:1100});
    await page.goto((process.env.QA_BASE || 'http://127.0.0.1:8080') + '/quotation.html', {waitUntil:'networkidle0'});
    await page.evaluate(() => document.fonts.ready);
    const shots = path.join(__dirname, 'shots'); fs.mkdirSync(shots,{recursive:true});
    const label = (p, key) => p.$eval('[data-diagram-label="'+key+'"]', e => [...e.querySelectorAll('text')].map(t => t.textContent).join(' '));
    async function geometry(p, mode) {
      const issues = await p.$eval('#v_tsDiagram svg', svg => {
        const errors = []; const boxes = [];
        const root = svg.getBoundingClientRect();
        const scale = svg.viewBox.baseVal.width / root.width;
        const bounds = el => {
          const b = el.getBoundingClientRect();
          return {x:(b.x-root.x)*scale,y:(b.y-root.y)*scale,width:b.width*scale,height:b.height*scale};
        };
        svg.querySelectorAll('[data-diagram-label]').forEach(g => {
          const b = bounds(g), left = +g.dataset.labelLeft, width = +g.dataset.labelWidth;
          if (b.x < left - 1 || b.x + b.width > left + width + 1 || b.y < -.5 || b.y + b.height > svg.viewBox.baseVal.height + .5) errors.push(g.dataset.diagramLabel + ': outside slot');
          g.querySelectorAll('text').forEach(t => boxes.push({key:g.dataset.diagramLabel,b:bounds(t)}));
        });
        boxes.forEach((a,i) => boxes.slice(i+1).forEach(c => {
          if (a.b.x < c.b.x+c.b.width-.5 && a.b.x+a.b.width > c.b.x+.5 && a.b.y < c.b.y+c.b.height-.5 && a.b.y+a.b.height > c.b.y+.5) errors.push(a.key+' overlaps '+c.key);
        }));
        return errors;
      });
      if (issues.length) console.error(mode, issues);
      check(mode + ': labels stay in their slots and never overlap', issues.length === 0);
    }
    check('all seven equipment illustrations and load junction exist', await page.$$eval('#v_tsDiagram [data-component]', els => els.length === 8));
    const property = await page.$eval('#v_tsDiagram svg', svg => {
      const root=svg.getBoundingClientRect(), scale=718/root.width;
      const box=e=>{const r=e.getBoundingClientRect();return {x:(r.left-root.left)*scale,y:(r.top-root.top)*scale,w:r.width*scale,h:r.height*scale};};
      return {bay:box(svg.querySelector('[data-property-space]')),art:box(svg.querySelector('[data-property-art]')),label:box(svg.querySelector('[data-diagram-label="home"]')),branch:box(svg.querySelector('[data-flow-to="home"]'))};
    });
    check('property retains its original 87 × 66 card', Math.abs(property.bay.w-87)<.1 && Math.abs(property.bay.h-66)<.1);
    check('house retains its original 51 × 41 artwork, without scaling', Math.abs(property.art.w-51)<.1 && Math.abs(property.art.h-41)<.1);
    check('property label and illustration have separate breathing room', property.label.y+property.label.h+3 < property.art.y && property.art.x>property.bay.x+12 && property.art.x+property.art.w<property.bay.x+property.bay.w-12);
    check('branch reaches the house without crossing its artwork', property.branch.y>=property.art.y+property.art.h && Math.abs(property.branch.h-25)<.1);
    check('only the house is raised 8 units; equipment row is not translated', await page.$eval('#v_tsDiagram svg', svg =>
      svg.querySelector('[data-component="home"]').getAttribute('transform')==='translate(0 -8)' && !svg.querySelector('[data-equipment-lane]') &&
      svg.querySelector('[data-diagram-label="home"] text').getAttribute('y')==='6' && svg.viewBox.baseVal.y===-8));
    const edges = await page.$$eval('[data-flow-from]', els => els.map(e => [e.dataset.flowFrom,e.dataset.flowTo,e.dataset.flowDirection,e.hasAttribute('marker-start'),e.hasAttribute('marker-end')]));
    check('solar path contains DC protection, inverter and AC protection in order', ['array:dcdb','dcdb:inverter','inverter:acdb','acdb:property-bus'].every(pair => edges.some(e => e[0]+':'+e[1]===pair && e[2]==='forward' && e[4])));
    check('local loads branch BEFORE the net meter', edges.some(e => e[0]==='property-bus' && e[1]==='home') && !edges.some(e => e[0]==='meter' && e[1]==='home'));
    check('both service connections have visible two-way arrows', ['property-bus:meter','meter:grid'].every(pair => edges.some(e => e[0]+':'+e[1]===pair && e[2]==='both' && e[3] && e[4])));
    check('wire arrows paint above equipment backplates', await page.$eval('#v_tsDiagram svg', svg => (svg.querySelector('[data-component="grid"]').compareDocumentPosition(svg.querySelector('[data-flow-from="meter"]')) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0));
    check('utility label identifies requested MSEB / MSEDCL grid', (await label(page,'utility')) === 'MSEDCL (MSEB)');
    check('default module count and wattage are visible', (await label(page,'array-value')) === '13 × 545 Wp modules');
    check('default inverter rating is visible', (await label(page,'inverter-value')) === '7 kW');
    check('SVG has accessible topology and conceptual-layout disclaimer', await page.$eval('#v_tsDiagram svg', e => e.getAttribute('role')==='img' && e.querySelector('desc').textContent.includes('Not a construction wiring drawing')));
    await geometry(page,'Default');
    const initialLabels = await page.evaluate(() => JSON.parse(JSON.stringify(CONTENT.pageTechSpec.diagramLabels)));
    async function edit(fields) {
      await page.evaluate(fields => {
        Object.entries(fields).forEach(([id,value]) => {const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));});
      }, fields);
    }
    await edit({capacity:'15.6',moduleWattage:'620',inverterKw:'12'});
    const expected = await page.evaluate(() => { const f=Finance.compute(Render.lastState);return [f.moduleCount+' × '+f.moduleWattage+' Wp modules',f.inverterKw+' kW']; });
    check('module values follow actual edited finance inputs', (await label(page,'array-value')) === expected[0] && expected[0] !== '13 × 545 Wp modules');
    check('manual inverter rating updates the visible drawing', (await label(page,'inverter-value')) === expected[1] && expected[1] === '12 kW');
    await geometry(page,'Edited equipment');
    await page.evaluate(() => {
      const input=[...document.querySelectorAll('.field')].find(e=>e.querySelector('label')?.textContent==='Diagram — dcdb').querySelector('input');
      input.value='DC isolator'; input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    check('new protection labels are editable through real Advanced editor', (await label(page,'dcdb')) === 'DC isolator');
    await page.evaluate(() => {
      Object.keys(CONTENT.pageTechSpec.diagramLabels).filter(k=>k!=='note').forEach(k => CONTENT.pageTechSpec.diagramLabels[k]='Very long customised component label with additional project-specific detail'); Render.renderAll();
    });
    await geometry(page,'Long custom labels');
    check('long copy wraps/truncates with full text retained in SVG titles', await page.$eval('[data-diagram-label="array"]', e=>e.querySelectorAll('text').length===2 && e.querySelector('title').textContent.includes('project-specific') && [...e.querySelectorAll('text')].some(t=>t.textContent.endsWith('…'))));
    await page.evaluate(() => {CONTENT.pageTechSpec.diagramLabels.array='<image href="x" onerror="window.diagramInjected=1"/>';Render.renderAll();});
    check('custom label markup remains text and cannot execute', await page.$eval('#v_tsDiagram', e=>!e.querySelector('image,script,foreignObject') && !window.diagramInjected && e.querySelector('[data-diagram-label="array"] title').textContent.startsWith('<image')));
    await page.evaluate(labels => {Object.assign(CONTENT.pageTechSpec.diagramLabels,labels);Render.renderAll();},initialLabels);
    await edit({capacity:'7',moduleWattage:'545',inverterKw:''});
    await page.emulateMediaType('print'); await geometry(page,'Print');
    check('illustration is visible in print', await page.$eval('#v_tsDiagram', e=>e.checkVisibility()));
    await page.emulateMediaType('screen');
    // The same SVG must survive the actual html2canvas path used by PDF export.
    const raster = await page.evaluate(async () => {
      const el=document.getElementById('v_tsDiagram');
      const c=await html2canvas(el,{scale:2,logging:false,backgroundColor:'#FBFCFE'});
      return {width:c.width,height:c.height,png:c.toDataURL()};
    });
    check('PDF capture rasterizes the complete diagram', raster.width > 1000 && raster.height > 300);
    fs.writeFileSync(path.join(shots,'system-overview-pdf.png'),Buffer.from(raster.png.split(',')[1],'base64'));
    const svgMarkup = await page.$eval('#v_tsDiagram svg', e=>new XMLSerializer().serializeToString(e));
    const proof = await browser.newPage(); await proof.setViewport({width:742,height:204,deviceScaleFactor:2});
    await proof.setContent('<style>body{margin:12px;background:#fbfcfe}</style>'+svgMarkup);
    check('standalone SVG is valid XML with no external image dependencies', await proof.evaluate(s=>!new DOMParser().parseFromString(s,'image/svg+xml').querySelector('parsererror') && !document.querySelector('svg image'),svgMarkup));
    await proof.screenshot({path:path.join(shots,'system-overview-detail.png')}); await proof.close();
    const targetPromise=browser.waitForTarget(t=>t.url().includes('/share.html?'));
    await page.click('#engineeringViewBtn'); const customer=await (await targetPromise).page();
    customer.on('pageerror',e=>errors.push(e.message));
    await customer.waitForSelector('#v_tsDiagram svg');
    check('saved Customer View retains illustrations and live equipment values', (await label(customer,'array-value')) === '13 × 545 Wp modules' && await customer.$$eval('[data-component]',els=>els.length===8));
    await geometry(customer,'Customer View');
    await customer.setViewport({width:390,height:844});
    await customer.waitForFunction(() => {const r=document.querySelector('#v_tsDiagram').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1;});
    await geometry(customer,'Mobile Customer View');
    await customer.$eval('#pageTechSpec',e=>e.scrollIntoView({behavior:'instant'}));
    check('mobile drawing scales inside the viewport', await customer.$eval('#v_tsDiagram',e=>e.getBoundingClientRect().left>=0 && e.getBoundingClientRect().right<=innerWidth+1));
    // Pixel parity catches Chromium's stale SVG text paint after scale changes;
    // geometry alone passes even when the glyphs are painted off the drawing.
    async function repaintParity(p, mode) {
      const diagram=await p.$('#v_tsDiagram');
      const actual=await diagram.screenshot();
      await p.$eval('#v_tsDiagram svg',svg=>svg.replaceWith(svg.cloneNode(true)));
      const repainted=await diagram.screenshot();
      check(mode+': resized SVG paint matches a freshly laid-out reference',Buffer.from(actual).equals(Buffer.from(repainted)));
    }
    await repaintParity(customer,'Mobile Customer View');
    await customer.screenshot({path:path.join(shots,'system-overview-mobile.png')});
    await page.setViewport({width:390,height:844});
    await page.waitForFunction(() => {const r=document.querySelector('#v_tsDiagram').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1;});
    check('mobile builder also keeps the complete illustrated page in frame', await page.$eval('#pageTechSpec',e=>e.getBoundingClientRect().left>=0 && e.getBoundingClientRect().right<=innerWidth+1));
    check('mobile approved cover is not clipped by its scaled wrapper', await page.$eval('#pageCover',e=>e.getBoundingClientRect().left>=0 && e.getBoundingClientRect().right<=innerWidth+1));
    await repaintParity(page,'Mobile builder');
    check('no runtime errors',errors.length===0);
    console.log(`\n${passed} passed, 0 failed`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
