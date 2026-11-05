/* ==========================================================================
   Quotation Studio — the "auto rate" in the pricing block

   The quotation's rate field is the dealer's number: after a site visit he
   types exactly what he agreed. But a fresh proposal should not start on a
   number that has nothing to do with the capacity either - a 100 kW job and a
   3 kW job do not cost the same per Wp.

   So the pricing block offers the same model the gallery card prices with
   (assets/js/rate-model.js), as a starting point that is always visible:

     AUTO     the field follows `RateModel.ratePerWp(customerType, capacity)`.
              Change the capacity or the customer type and the rate follows.
     MANUAL   the moment the dealer types in the rate field, the field is his.
              Nothing overwrites it again.

   "Reset to auto" in the block puts it back on the model. Every rate the model
   can produce sits inside the band's floors, so an auto quote can never land on
   a rate the business does not sell at.

   The mode is stored with the proposal (hidden `rateMode` input, collected by
   StateStore exactly like every other field), so a saved quotation reopens with
   the rate the dealer actually sent - never re-priced by a later change to the
   model. Proposals saved before this existed have no `rateMode`; StateStore
   treats those as MANUAL, because their stored rate is the agreed price.
   ========================================================================== */
'use strict';

(function (root) {
  var doc = root.document;

  function $(id) { return doc.getElementById(id); }
  function money(n) { return '₹' + (Math.round(n * 100) / 100).toFixed(2) + '/Wp'; }

  var TYPE_LABEL = {
    residential: 'residential (subsidy)',
    rwa: 'housing society (subsidy)',
    commercial: 'commercial (no subsidy)',
    industrial: 'industrial (no subsidy)'
  };

  var writing = false;         /* true while WE write the field, so we don't call it manual */

  function modeOf() {
    var el = $('rateMode');
    return el && el.value === 'manual' ? 'manual' : 'auto';
  }
  function setMode(mode) {
    var el = $('rateMode');
    if (el) el.value = mode;
  }

  function capacity() {
    var el = $('capacity');
    var n = el ? parseFloat(el.value) : NaN;
    return isFinite(n) && n > 0 ? n : null;
  }
  function customerType() {
    var el = $('customerType');
    return (el && el.value) || 'residential';
  }
  function autoRate() {
    if (!root.RateModel) return null;
    var cap = capacity();
    if (cap === null) return root.RateModel.anchor;
    return root.RateModel.ratePerWp(customerType(), cap);
  }

  function writeRate(value) {
    var field = $('costPerWp');
    if (!field) return;
    writing = true;
    field.value = (Math.round(value * 100) / 100).toFixed(2);
    /* The normal bubbling form event renders and autosaves the new price. */
    field.dispatchEvent(new root.Event('input', { bubbles: true }));
    writing = false;
  }

  function render() {
    var rate = autoRate();
    var mode = modeOf();
    var cap = capacity();

    var price = $('rateAutoPrice');
    if (price) {
      price.textContent = rate === null ? 'Rate model unavailable'
        : 'Auto ' + money(rate) + ' · ' + (cap === null ? 'enter a capacity' : cap + ' kWp') +
          ' · ' + (TYPE_LABEL[customerType()] || customerType());
    }

    var box = $('rateAutoBox');
    if (box) box.dataset.mode = mode;

    var reset = $('rateAutoReset');
    if (reset) {
      reset.hidden = mode === 'auto';
      reset.disabled = rate === null;
    }

    /* #hintCostPerWp belongs to the control panel (project cost, GST); this
       block owns its own line so the two never overwrite each other. */
    var hint = $('rateAutoHint');
    if (hint) {
      hint.textContent = mode === 'auto'
        ? 'Following the capacity band. Type your own rate here to take over.'
        : 'Your rate. "Reset to auto" returns to ' + (rate === null ? 'the band' : money(rate)) + '.';
    }
  }

  /** Follow the band (only when the field is on auto), then repaint. */
  function sync() {
    var rate = autoRate();
    if (modeOf() === 'auto' && rate !== null && $('costPerWp')) writeRate(rate);
    render();
  }

  /** Called by StateStore.applyForm after a proposal loads or the form resets. */
  function refresh() { sync(); }

  function mount() {
    var field = $('costPerWp');
    if (!field) return;

    ['capacity', 'customerType'].forEach(function (id) {
      var el = $(id);
      if (!el) return;
      el.addEventListener('input', sync);
      el.addEventListener('change', sync);
    });

    /* Typing a rate takes the field out of auto for this proposal. */
    field.addEventListener('input', function () {
      if (writing) return;
      setMode('manual');
      render();
    });

    var reset = $('rateAutoReset');
    if (reset) reset.addEventListener('click', function () { setMode('auto'); sync(); });

    /* A fresh proposal starts on the band; a reopened one is already manual. */
    sync();
  }

  root.PricingAuto = { mount: mount, refresh: refresh, autoRate: autoRate, mode: modeOf };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount);
  else mount();
}(typeof self !== 'undefined' ? self : this));
