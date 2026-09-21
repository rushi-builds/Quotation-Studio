/* Capacity real-sync + control-panel modes + design references + clean cover + OG tags
   Run: node qa/sync.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const t = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name, extra !== undefined ? '→ ' + String(extra).slice(0, 240) : ''); }
};
const errors = [];

function mockCtx() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'measureText') return () => ({ width: 42 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof prop === 'string') {
        if (!(prop in target)) target[prop] = () => {};
        return target[prop];
      }
      return undefined;
    },
    set() { return true; }
  });
}

function bootApp(seedStorage, url) {
  const html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '')
    .replace('<link rel="stylesheet" href="assets/css/app.css">', () =>
      '<style>' + fs.readFileSync(path.join(ROOT, 'assets/css/app.css'), 'utf8') + '</style>');
  const dom = new JSDOM(html, {
    url: url || 'http://localhost/quotation.html',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
      window.Element.prototype.scrollIntoView = function () {};
      window.confirm = () => true;
      window.open = () => ({});
      if (seedStorage) for (const [k, v] of Object.entries(seedStorage)) window.localStorage.setItem(k, v);
      window.addEventListener('error', (e) => errors.push('window: ' + e.message));
    }
  });
  const { window } = dom;
  const src = ['content.js', 'finance.js', 'icons.js', 'charts.js', 'model.js', 'state.js',
    'equipment.js', 'render.js', 'editor.js', 'export.js', 'app.js']
    .map((f) => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n;\n');
  window.eval(src);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  return window;
}

const fire = (w, el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));

console.log('— sync: boot & clean cover —');
const w = bootApp();
const d = w.document;

t('no errors on boot', errors.length === 0, errors.join('|'));
t('cover avatar row removed (clean professional)', !d.getElementById('coverPortraitRow'), 'should be null for clean look');
t('cover portrait img removed', !d.getElementById('img_cover_portrait'), 'avatar deleted per final decision');
t('cover uses exact reference artwork', (d.getElementById('img_cover')?.getAttribute('src') || '').includes('ktm-cover-page-1') || (d.getElementById('img_cover')?.getAttribute('src') || '').includes('page-cover-v2-portrait'), d.getElementById('img_cover')?.getAttribute('src'));
t('old landscape cover not used', !(d.getElementById('img_cover')?.getAttribute('src') || '').includes('page-cover.jpg'), 'should not use old landscape cover');
t('cover stats still present', !!d.getElementById('v_coverStatYears'));

t('OG tags present (quotation.html)', !!d.querySelector('meta[property="og:title"]'));
t('OG image present', !!d.querySelector('meta[property="og:image"]'));
t('OG image is v2 portrait (final)', (d.querySelector('meta[property="og:image"]')?.content || '').includes('v2-portrait'), d.querySelector('meta[property="og:image"]')?.content);
t('OG type website', d.querySelector('meta[property="og:type"]')?.content === 'website');
t('twitter card present', !!d.querySelector('meta[name="twitter:card"]'));
t('og:title contains Quotation Studio', (d.querySelector('meta[property="og:title"]')?.content || '').includes('Quotation Studio'));
t('og:description non-empty', (d.querySelector('meta[property="og:description"]')?.content || '').length > 10);

t('live chip element exists', !!d.getElementById('liveChip'));
t('live chip text exists', !!d.getElementById('liveChipText'));
t('live chip shows Live', d.getElementById('liveChipText').textContent.includes('Live'));
t('live chip shows capacity', d.getElementById('liveChipText').textContent.includes('7 kWp') || d.getElementById('liveChipText').textContent.includes('7'));
t('live chip has static dot (no pulse)', !!d.querySelector('#liveChip .live-dot'));
t('live chip dot has no animation (subtle per rule)', (() => {
  const dot = d.querySelector('#liveChip .live-dot');
  if (!dot) return false;
  const style = w.getComputedStyle(dot);
  return !style.animationName || style.animationName === 'none' || style.animation === '' || !style.animation.includes('livePulse');
})(), 'should be static per no-gimmicks rule');

console.log('— sync: control-panel modes —');
const form = d.getElementById('quoteForm');
const advanced = [...form.querySelectorAll('[data-adv]')];
t('defaults to Essentials', form.classList.contains('qs-mode-essentials'));
t('Essentials button active by default', d.getElementById('modeEss').classList.contains('active') && !d.getElementById('modeAll').classList.contains('active'));
t('exactly eight advanced sections tagged', advanced.length === 8, advanced.length);
t('all advanced sections hidden in Essentials', advanced.every((el) => w.getComputedStyle(el).display === 'none'));
t('capacity remains visible in Customer & System beside customer type', (() => {
  const cap = d.getElementById('capacity');
  return d.querySelectorAll('#capacity').length === 1 && !cap.closest('[data-adv]') &&
    cap.closest('fieldset').querySelector('legend').textContent === 'Customer & System' &&
    cap.closest('.row2') === d.getElementById('customerType').closest('.row2');
})());
t('all other form sections remain visible in Essentials', [...form.children].filter((el) => !el.hasAttribute('data-adv')).every((el) => w.getComputedStyle(el).display !== 'none'));
const beforeMode = JSON.stringify(w.StateStore.collectForm());
d.getElementById('modeAll').click();
t('All settings removes Essentials class', !form.classList.contains('qs-mode-essentials'));
t('All settings reveals advanced sections', advanced.every((el) => w.getComputedStyle(el).display !== 'none'));
t('All settings button active', d.getElementById('modeAll').classList.contains('active') && !d.getElementById('modeEss').classList.contains('active'));
t('All settings preference stored separately', w.localStorage.getItem('qstudio.formMode') === 'all');
const allReboot = bootApp({ 'qstudio.formMode': 'all' });
t('All settings preference restored on boot', !allReboot.document.getElementById('quoteForm').classList.contains('qs-mode-essentials'));
allReboot.close();
d.getElementById('modeEss').click();
t('back to Essentials hides advanced sections', form.classList.contains('qs-mode-essentials') && advanced.every((el) => w.getComputedStyle(el).display === 'none'));
t('switching modes leaves collected proposal data unchanged', JSON.stringify(w.StateStore.collectForm()) === beforeMode);
t('hidden inputs remain collected', w.StateStore.collectForm().moduleWattage === '545');
t('Essentials preference stored separately', w.localStorage.getItem('qstudio.formMode') === 'essentials');
const invalidMode = bootApp({ 'qstudio.formMode': 'unknown' });
t('unknown preference falls back to Essentials', invalidMode.document.getElementById('quoteForm').classList.contains('qs-mode-essentials'));
invalidMode.close();

console.log('— sync: design and simulation references —');
const refsWrap = d.getElementById('v_tsRefsWrap');
const pvsystUrl = 'https://www.example.com/reports/site-pvsyst.pdf';
const arkaUrl = 'https://design.example.org/site/arka';
const updateLink = (id, value) => {
  d.getElementById(id).value = value;
  fire(w, d.getElementById(id), 'input');
};
t('report defaults empty', w.StateStore.DEFAULTS.pvsystUrl === '' && w.StateStore.DEFAULTS.arkaUrl === '');
t('references hidden by default', w.getComputedStyle(refsWrap).display === 'none');
updateLink('pvsystUrl', pvsystUrl);
t('PVsyst input shows references even in Essentials', w.getComputedStyle(refsWrap).display !== 'none');
t('PVsyst label rendered', d.querySelector('#v_tsRefs .tr-l').textContent === 'PVsyst Performance Simulation');
t('reference hostname omits www and path', d.querySelector('#v_tsRefs a').textContent === 'example.com');
t('reference preserves full URL with safe new-tab attributes', (() => {
  const a = d.querySelector('#v_tsRefs a');
  return a.getAttribute('href') === pvsystUrl && a.target === '_blank' && a.rel === 'noopener noreferrer';
})());
t('reference section label and note rendered', d.getElementById('v_tsRefsLabel').textContent === 'DESIGN & SIMULATION REFERENCES' && d.getElementById('v_tsRefsNote').textContent.includes('authoritative source'));
t('references between spec table and note', refsWrap.previousElementSibling.id === 'v_tsTable' && refsWrap.nextElementSibling.classList.contains('note-box'));
updateLink('pvsystUrl', '');
t('clearing only link hides references again', w.getComputedStyle(refsWrap).display === 'none');
updateLink('arkaUrl', arkaUrl);
t('Arka alone shows its own label and hostname', d.querySelectorAll('#v_tsRefs .ts-ref').length === 1 && d.querySelector('#v_tsRefs .tr-l').textContent === 'Arka 3D Shading & Layout Design' && d.querySelector('#v_tsRefs a').textContent === 'design.example.org');
updateLink('pvsystUrl', pvsystUrl);
t('both report links render together', d.querySelectorAll('#v_tsRefs .ts-ref').length === 2);
const saved = w.__qsSaveNow();
t('both links saved on proposal blob', saved.form.pvsystUrl === pvsystUrl && saved.form.arkaUrl === arkaUrl);
t('mode preference not stored as proposal data', !JSON.stringify(saved).includes('qstudio.formMode') && !Object.values(saved.form).includes('essentials'));
const snapshot = {};
for (let i = 0; i < w.localStorage.length; i++) {
  const key = w.localStorage.key(i);
  snapshot[key] = w.localStorage.getItem(key);
}
const reboot = bootApp(snapshot);
t('both report inputs restored after reboot', reboot.document.getElementById('pvsystUrl').value === pvsystUrl && reboot.document.getElementById('arkaUrl').value === arkaUrl);
t('saved proposal blob retains both links after reboot', reboot.Proposals.active().form.pvsystUrl === pvsystUrl && reboot.Proposals.active().form.arkaUrl === arkaUrl);
t('both references render after reboot', reboot.document.querySelectorAll('#v_tsRefs .ts-ref').length === 2 && reboot.getComputedStyle(reboot.document.getElementById('v_tsRefsWrap')).display !== 'none');
reboot.close();
const editorLabels = ['References section label', 'PVsyst reference label', 'Arka reference label', 'References note'];
t('all four reference text fields available in Advanced Edit', editorLabels.every((label) => [...d.querySelectorAll('#advContainer label')].some((el) => el.textContent === label)));
updateLink('pvsystUrl', '');
updateLink('arkaUrl', '');
t('clearing both report links hides block', w.getComputedStyle(refsWrap).display === 'none');

console.log('— sync: initial capacity 7 kWp real-sync —');
t('cover capacity = 7 kWp', d.getElementById('v_coverCapacity').textContent === '7 kWp', d.getElementById('v_coverCapacity').textContent);
t('cover badge = 7 kWp', d.getElementById('v_coverBadgeKwp').textContent === '7 kWp');
t('tech spec module count 13 for 7kWp', d.getElementById('v_tsTable').textContent.includes('13 modules'));
t('solution spec shows 7 kWp', d.getElementById('v_soSpecs').textContent.includes('7 kWp'));
t('exec hero net = ₹6,08,070 for 7kWp', d.getElementById('v_exHeroNet').textContent === '₹6,08,070');
t('investment rate card present', d.getElementById('v_inRate').textContent.includes('/ Wp'));

console.log('— sync: change capacity to 10 kWp —');
d.getElementById('capacity').value = '10';
fire(w, d.getElementById('capacity'), 'input');

t('cover capacity updates to 10 kWp', d.getElementById('v_coverCapacity').textContent === '10 kWp', d.getElementById('v_coverCapacity').textContent);
t('cover badge updates to 10 kWp', d.getElementById('v_coverBadgeKwp').textContent === '10 kWp');
t('live chip updates to 10 kWp', d.getElementById('liveChipText').textContent.includes('10 kWp') || d.getElementById('liveChipText').textContent.includes('10'), d.getElementById('liveChipText').textContent);
t('exec hero net updates to ₹9,02,100 for 10kWp', d.getElementById('v_exHeroNet').textContent === '₹9,02,100', d.getElementById('v_exHeroNet').textContent);
t('tech spec module count 19 for 10kWp', d.getElementById('v_tsTable').textContent.includes('19 modules'), d.getElementById('v_tsTable').textContent.match(/\d+ modules/));
t('solution spec updates to 10 kWp', d.getElementById('v_soSpecs').textContent.includes('10 kWp'));
t('savings chip generation updates', d.getElementById('v_coverBadgeGen').textContent.includes('units'), d.getElementById('v_coverBadgeGen').textContent);
t('live chip title contains capacity', (d.getElementById('liveChip').title || '').includes('10 kWp') || (d.getElementById('liveChip').title || '').includes('10'));

console.log('— sync: change capacity to 5 kWp —');
d.getElementById('capacity').value = '5';
fire(w, d.getElementById('capacity'), 'input');

t('cover capacity updates to 5 kWp', d.getElementById('v_coverCapacity').textContent === '5 kWp');
t('cover badge updates to 5 kWp', d.getElementById('v_coverBadgeKwp').textContent === '5 kWp');
t('live chip updates to 5 kWp', d.getElementById('liveChipText').textContent.includes('5 kWp'));
t('tech spec module count 10 for 5kWp', d.getElementById('v_tsTable').textContent.includes('10 modules'), d.getElementById('v_tsTable').textContent.match(/\d+ modules/));
t('exec hero net for 5kWp has ₹', d.getElementById('v_exHeroNet').textContent.includes('₹'), d.getElementById('v_exHeroNet').textContent);

console.log('— sync: customer name live-sync to live chip —');
d.getElementById('custName').value = 'Ms. Test Customer';
fire(w, d.getElementById('custName'), 'input');
t('live chip shows customer first name Test', d.getElementById('liveChipText').textContent.includes('Test') || d.getElementById('liveChipText').textContent.includes('Ms.'), d.getElementById('liveChipText').textContent);
t('cover customer name updates', d.getElementById('v_coverCustName').textContent.includes('Test Customer'));

console.log('— sync: 20 kWp final check (₹18,82,200, 29,200, 37 modules) —');
d.getElementById('capacity').value = '20';
fire(w, d.getElementById('capacity'), 'input');
t('20kWp cover = 20 kWp', d.getElementById('v_coverCapacity').textContent === '20 kWp');
t('20kWp hero = ₹18,82,200', d.getElementById('v_exHeroNet').textContent === '₹18,82,200', d.getElementById('v_exHeroNet').textContent);
t('20kWp gen ≈ 29,200 units', d.getElementById('v_coverBadgeGen').textContent.includes('29,200'), d.getElementById('v_coverBadgeGen').textContent);
t('20kWp modules = 37', d.getElementById('v_tsTable').textContent.includes('37 modules'), d.getElementById('v_tsTable').textContent.match(/\d+ modules/));
t('live chip shows 20 kWp', d.getElementById('liveChipText').textContent.includes('20 kWp'));

console.log('— sync: share.html OG tags —');
const shareHtml = fs.readFileSync(path.join(ROOT, 'share.html'), 'utf8');
t('share.html has og:title', shareHtml.includes('og:title'));
t('share.html has og:image', shareHtml.includes('og:image'));
t('share.html og:image is v2 portrait', shareHtml.includes('v2-portrait'));
t('share.html has twitter:card', shareHtml.includes('twitter:card'));
t('share.html has og:description', shareHtml.includes('og:description'));

console.log('— sync: final integrity —');
t('no errors after all syncs', errors.length === 0, errors.join('|'));
t('page count still 15 by default (no options/finance)', d.querySelectorAll('#pageNav .nav-chip').length === 15, d.querySelectorAll('#pageNav .nav-chip').length);
t('timeline exists (Created→Sent→Accepted)', !!d.getElementById('pmTimeline') && d.getElementById('pmTimeline').querySelectorAll('.pm-tl-step').length === 3);
t('customer view button exists', !!d.getElementById('custViewBtn'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
