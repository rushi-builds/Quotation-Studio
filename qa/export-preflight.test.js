/* ==========================================================================
   Export pre-flight — the builder's own findings decide whether a PDF is made
   --------------------------------------------------------------------------
   Booting includes control-panel.js, so this exercises the REAL validation, the
   REAL gate on the download button, the dialog that reports what is actually
   wrong, the reference-number guard, and the notice that replaces all of it
   when there is nothing to report.

   The rule under test: a quotation that would print a wrong offer produces no
   PDF; an unusual-but-deliberate value still can; a clean sheet downloads with
   a confirmation that fades on its own.

   Run: node qa/export-preflight.test.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const runtimeErrors = [];
let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.error('  ✗ FAIL: ' + name + ' → ' + e.message); }
}
const assert = require('node:assert/strict');

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

function bootApp() {
  let html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  /* jsdom fetches nothing, so inline the stylesheets: the dialog and the notice
     only exist for a style-aware assertion when their rules are present. */
  html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const href = /href=["']([^"']+)["']/i.exec(tag);
    if (!href || /^https?:/i.test(href[1])) return tag;
    const file = path.join(ROOT, href[1]);
    if (!fs.existsSync(file)) return tag;
    return '<style data-from="' + href[1] + '">' + fs.readFileSync(file, 'utf8') + '</style>';
  });
  const dom = new JSDOM(html, {
    url: 'http://localhost/quotation.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.HTMLCanvasElement.prototype.getContext = function () { return mockCtx(); };
      window.Element.prototype.scrollIntoView = function () {};
      Object.defineProperty(window.HTMLImageElement.prototype, 'complete', { get: () => true });
      Object.defineProperty(window.HTMLImageElement.prototype, 'naturalWidth', { get: () => 100 });
      Object.defineProperty(window.HTMLImageElement.prototype, 'naturalHeight', { get: () => 100 });
      window.devicePixelRatio = 2;
      window.confirm = () => true;
      window.addEventListener('error', (e) => runtimeErrors.push(e.message));
      /* jsdom ships <dialog> without the modal methods; without them the app's
         own no-dialog fallback answers instead and no dialog is ever exercised. */
      const proto = window.HTMLDialogElement && window.HTMLDialogElement.prototype;
      if (proto && typeof proto.showModal !== 'function') {
        proto.showModal = function () { if (!this.open) this.open = true; };
        proto.close = function (value) {
          if (!this.open) return;
          this.open = false;
          if (value !== undefined) this.returnValue = value;
          this.dispatchEvent(new window.Event('close'));
        };
      }
    }
  });
  const { window } = dom;
  const src = ['content.js', 'engineering.js', 'finance.js', 'storage-catalog.js', 'bess.js', 'additional-systems.js',
    'supplement-design.js', 'icons.js', 'charts.js', 'model.js', 'state.js', 'equipment.js',
    'render.js', 'editor.js', 'experience.js', 'briefing.js', 'export.js', 'workspace-prefs.js',
    'app.js', 'control-panel.js']
    .map((f) => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n;\n');
  window.eval(src);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  return window;
}

const w = bootApp();
const d = w.document;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fire = (el, type = 'input') => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const setInput = (id, value) => { const el = d.getElementById(id); el.value = String(value); fire(el); };
const txt = (id) => (d.getElementById(id) || {}).textContent || '';
const val = (id) => (d.getElementById(id) || {}).value || '';
const dlg = () => d.getElementById('exportCheckDialog');
const toast = () => d.getElementById('exportToast');
const actionButtons = () => Array.from((dlg() || d).querySelectorAll('.qs-dialog-actions .qs-btn'));
const actionMatching = (re) => actionButtons().find((b) => re.test(b.textContent));
const fixLinks = () => Array.from((dlg() || d).querySelectorAll('.qs-dialog-item button'));

/* the PDF is stubbed exactly as the other suites stub it */
let savedName = '';
let saveThrows = null;
w.html2canvas = async () => ({ toDataURL: () => 'data:image/jpeg;base64,AAAA' });
w.jspdf = {
  jsPDF: class {
    constructor() { this.internal = { pageSize: { getWidth: () => 794, getHeight: () => 1123 } }; }
    addPage() {} addImage() {} setProperties() {}
    save(n) { if (saveThrows) throw saveThrows; savedName = n; }
  }
};
const clickDownload = () => d.getElementById('downloadBtn').click();
const cleanSheet = () => { reset(); setInput('custName', 'QA Customer'); };
async function waitFor(predicate, ms = 15000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (predicate()) return true;
    await wait(25);
  }
  return false;
}
/* the button is disabled for the whole export, so its return is the signal that
   the previous scenario has fully finished and savedName belongs to it */
const idle = () => waitFor(() => !d.getElementById('downloadBtn').disabled);

/* put the sheet back to the shipped defaults between scenarios */
const reset = () => { w.StateStore.applyForm(w.StateStore.DEFAULTS); w.Render.renderAll(); };

(async () => {
  console.log('— Export pre-flight: the reference-number guard —');
  check('the guard is visible while the template sample reference is in place', () => {
    w.Render.renderAll();
    assert.equal(val('propRef'), 'KTM/2026/Solar/013', 'the template sample is the shipped default');
    assert.equal(d.getElementById('refWarning').hidden, false, 'the sample reference must be flagged');
    assert.ok(/template sample reference/.test(txt('refWarning')), txt('refWarning'));
  });
  check('the guard lives in the builder, never inside the customer markup', () => {
    assert.equal(d.querySelector('.preview-panel #refWarning'), null,
      'share.html builds its pages from .preview-panel, so the guard must stay outside it');
  });
  check('its own number clears the guard', () => {
    setInput('propRef', 'KTM/2026/Solar/101');
    assert.equal(d.getElementById('refWarning').hidden, true, txt('refWarning'));
  });
  check('an empty reference is reported', () => {
    setInput('propRef', '');
    assert.ok(/no reference number/.test(txt('refWarning')), txt('refWarning'));
  });
  check('a reference another proposal already uses is reported', () => {
    w.Proposals.create(Object.assign({}, w.StateStore.DEFAULTS, { custName: 'Another customer', propRef: 'DUP/9' }));
    setInput('propRef', 'DUP/9');
    assert.ok(/already used by another proposal/.test(txt('refWarning')), txt('refWarning'));
    assert.ok(/DUP\/9/.test(txt('refWarning')), 'the message must name the number');
  });
  check('the clash is reported whatever the capitalisation', () => {
    setInput('propRef', 'dup/9');
    assert.ok(/already used by another proposal/.test(txt('refWarning')), txt('refWarning'));
  });

  console.log('— Export pre-flight: what counts as blocking —');
  const issues = () => w.__qsPreflight.run();
  check('a complete sheet has nothing to report', () => {
    /* the shipped template carries no customer, so a complete sheet is one
       with a name on it — that is the app's own first blocking rule */
    cleanSheet();
    const found = issues();
    assert.equal(found.blocking.length, 0, JSON.stringify(found.blocking));
    assert.equal(found.advisory.length, 0, JSON.stringify(found.advisory));
  });
  check('the shipped template blocks until a customer is named', () => {
    reset();
    assert.ok(issues().blocking.some((i) => /customer name/i.test(i.message)),
      'a fresh proposal has no customer, so it must not be downloadable yet');
  });
  check('a missing customer name blocks', () => {
    setInput('custName', '');
    assert.ok(issues().blocking.some((i) => /customer name/i.test(i.message)), JSON.stringify(issues().blocking));
    reset();
  });
  check('a zero capacity blocks', () => {
    setInput('capacity', '0');
    assert.ok(issues().blocking.some((i) => /capacity greater than zero/i.test(i.message)), JSON.stringify(issues().blocking));
    reset();
  });
  check('a zero rate blocks', () => {
    setInput('costPerWp', '0');
    assert.ok(issues().blocking.some((i) => /cost per Wp greater than zero/i.test(i.message)), JSON.stringify(issues().blocking));
    reset();
  });
  check('payment milestones that do not total 100% block', () => {
    setInput('payCompletion', '20');
    assert.ok(issues().blocking.some((i) => /total 100%/.test(i.message)), JSON.stringify(issues().blocking));
    reset();
  });
  check('a half-entered loan blocks', () => {
    setInput('loanAmt', '500000');
    assert.ok(issues().blocking.some((i) => /loan amount/i.test(i.message)), JSON.stringify(issues().blocking));
    reset();
  });
  check('an unusual number is only an advisory', () => {
    cleanSheet();
    setInput('degradation', '150');
    const found = issues();
    assert.equal(found.blocking.length, 0, 'an out-of-range number must not block: ' + JSON.stringify(found.blocking));
    assert.ok(found.advisory.some((i) => /degradation/i.test(i.message)), JSON.stringify(found.advisory));
    reset();
  });

  console.log('— Export pre-flight: a clean sheet —');
  await (async () => {
    await idle();
    cleanSheet();
    savedName = '';
    clickDownload();
    await waitFor(() => savedName !== '');
    check('no dialog appears when nothing is wrong', () => assert.equal(dlg().open, false));
    check('the PDF is produced', () => assert.ok(/^Proposal_/.test(savedName), savedName));
    check('a confirmation says the checks passed', () =>
      assert.ok(/All checks passed — your download has started\./.test(txt('exportToast')), txt('exportToast')));
    check('the confirmation is showing, as a success', () => {
      assert.equal(toast().classList.contains('is-visible'), true);
      assert.equal(toast().getAttribute('data-kind'), 'ok');
    });
    check('the confirmation is announced, not thrown in front of the page', () => {
      assert.equal(toast().getAttribute('role'), 'status');
      assert.equal(toast().getAttribute('aria-live'), 'polite');
      assert.equal(d.querySelector('.preview-panel #exportToast'), null, 'never part of the customer markup');
    });
  })();

  console.log('— Export pre-flight: a blocking problem stops the PDF —');
  await (async () => {
    await idle();
    cleanSheet();
    savedName = '';
    setInput('custName', '');
    clickDownload();
    await wait(60);
    check('the pre-flight opens instead of the PDF', () => assert.equal(dlg().open, true));
    check('no PDF was produced', () => assert.equal(savedName, '', savedName));
    check('the dialog reports the actual problem, not a generic one', () =>
      assert.ok(/Add a customer name\./.test(dlg().textContent), dlg().textContent.trim().slice(0, 90)));
    check('the dialog says plainly that it is not ready to send', () =>
      assert.ok(/not ready to send/.test(dlg().textContent), dlg().textContent.trim().slice(0, 60)));
    check('a blocking sheet offers no way to download anyway', () =>
      assert.equal(actionMatching(/Download anyway/), undefined));
    check('the fix link jumps to the field and closes the dialog', () => {
      fixLinks()[0].click();
      assert.equal(dlg().open, false);
      assert.equal(d.getElementById('custName').getAttribute('aria-invalid'), 'true');
    });
    check('closing without fixing still produces no PDF', () => assert.equal(savedName, '', savedName));
    reset();
  })();

  console.log('— Export pre-flight: an advisory is raised, not enforced —');
  await (async () => {
    await idle();
    cleanSheet();
    savedName = '';
    setInput('degradation', '150');
    clickDownload();
    await wait(60);
    check('the pre-flight opens for an advisory too', () => assert.equal(dlg().open, true));
    check('no PDF yet — the choice belongs to the preparer', () => assert.equal(savedName, '', savedName));
    check('the advisory is described as a check, not a refusal', () =>
      assert.ok(/Check these before you download/.test(dlg().textContent) && !/not ready to send/.test(dlg().textContent),
        dlg().textContent.trim().slice(0, 60)));
    check('the download is offered anyway', () => assert.ok(actionMatching(/Download anyway/)));
    await (async () => {
      actionMatching(/Download anyway/).click();
      await waitFor(() => savedName !== '');
      check('choosing to go ahead produces the PDF', () => assert.ok(/^Proposal_/.test(savedName), savedName));
      check('the dialog is closed afterwards', () => assert.equal(dlg().open, false));
    })();
    reset();
  })();

  console.log('— Export pre-flight: the confirmation fades on its own —');
  await (async () => {
    await idle();
    cleanSheet();
    toast().classList.remove('is-visible');
    savedName = '';
    clickDownload();
    await wait(120);
    check('it is visible while the download runs', () => assert.equal(toast().classList.contains('is-visible'), true));
    await wait(3600);
    check('and removes itself without being clicked', () => assert.equal(toast().classList.contains('is-visible'), false));
    check('the PDF was still produced', () => assert.ok(/^Proposal_/.test(savedName), savedName));
  })();

  console.log('— Export pre-flight: a failed generation is reported —');
  await (async () => {
    await idle();
    cleanSheet();
    saveThrows = new Error('capture failed');
    clickDownload();
    await waitFor(() => saveThrows === null || /capture failed/.test(txt('exportToast')), 4000);
    check('the failure is announced in the notice', () => {
      assert.ok(/capture failed/.test(txt('exportToast')), txt('exportToast'));
      assert.equal(toast().getAttribute('data-kind'), 'error');
    });
    check('the failure also reaches the status line', () =>
      assert.ok(/capture failed/.test(txt('statusMsg')), txt('statusMsg')));
    saveThrows = null;
    reset();
  })();

  console.log('— Export pre-flight: closing the dialog generates nothing —');
  await (async () => {
    await idle();
    cleanSheet();
    setInput('custName', '');
    savedName = '';
    clickDownload();
    await wait(60);
    check('the dialog is open and waiting', () => assert.equal(dlg().open, true));
    check('no PDF is produced while it waits', () => assert.equal(savedName, '', savedName));
    actionMatching(/^Close$/).click();
    await wait(250);
    check('choosing Close produces no PDF', () => assert.equal(savedName, '', savedName));
    check('the dialog is gone', () => assert.equal(dlg().open, false));
    check('the button is usable again straight away',
      () => assert.equal(d.getElementById('downloadBtn').disabled, false));
    reset();
  })();

  check('both elements are marked builder-only', () => {
    assert.equal(toast().hasAttribute('data-builder-only'), true, 'the notice');
    assert.equal(dlg().hasAttribute('data-builder-only'), true, 'the dialog');
  });
  check('no runtime errors during the whole run', () => assert.deepEqual(runtimeErrors, []));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
