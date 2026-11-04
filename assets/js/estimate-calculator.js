/* Quick solar estimate calculator.

   Public-facing tool: enter monthly electricity bill, consumer type and
   location - get an instant estimate of recommended system size, panel
   count, cost, annual savings and payback period. All figures are
   indicative only - a real proposal follows after a site visit. No data
   leaves the browser.
 */
'use strict';
(function (root) {
  /* India-centric default assumptions, stated plainly. */
  var DEFAULTS = {
    /* kWh per kWp per day, averaged over a year for Pune/Maharashtra. */
    solarYield: 4.2,
    /* ₹ per kWp installed, all-inclusive (modules, inverter, structure, cabling, net-metering). */
    costPerKwp: 52000,
    /* ₹ per kWh grid electricity (Maharashtra average). */
    gridRate: 7.50,
    /* Roof area needed per kWp (sq ft) - practical allowance incl. spacing. */
    areaPerKwp: 80,
    /* Annual degradation and performance ratio already baked into yield. */
    performanceRatio: 0.81
  };

  /* Consumer type adjustments on yield and cost. */
  var TYPE_ADJUST = {
    residential: { yieldMult: 1.00, costMult: 1.00 },
    commercial:  { yieldMult: 1.05, costMult: 0.95 },
    industrial:  { yieldMult: 1.10, costMult: 0.90 },
    society:     { yieldMult: 1.00, costMult: 1.00 }
  };

  /* Standard commercial panel used for the panel-count estimate:
     ~2278 mm × 1134 mm ≈ 27.8 sq ft per 580Wp panel (~48 sq ft/kWp panel-only).
     Real roofs need spacing, tilt rows and access, so the practical roof
     allowance stays at 80 sq ft/kWp (areaPerKwp above). */
  var PANEL_WP = 580;

  function el(id) { return document.getElementById(id); }
  function fmt(n, decimals) {
    if (n == null || !isFinite(n)) return '—';
    return Number(n).toFixed(decimals == null ? 0 : decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function money(n) { return '₹' + fmt(n); }

  var form = el('estimateForm');
  if (!form) return;

  var inputs = {
    bill: el('estBill'),
    type: el('estType'),
    city: el('estCity')
  };
  var outputs = {
    system: el('estSystem'),
    panels: el('estPanels'),
    cost: el('estCost'),
    savings: el('estSavings'),
    payback: el('estPayback'),
    roof: el('estRoof')
  };
  var resultPanel = el('estimateResult');
  var calculateBtn = el('estCalculate');

  function allFilled() {
    return inputs.bill.value && inputs.type.value && inputs.city.value;
  }

  function compute() {
    var bill = Number(inputs.bill.value) || 0;
    var type = inputs.type ? inputs.type.value : 'residential';
    var city = inputs.city ? inputs.city.value : 'Pune';
    if (!bill || !type || !city) return null;

    var adj = TYPE_ADJUST[type] || TYPE_ADJUST.residential;

    /* Monthly units from bill: units = bill / rate. */
    var monthlyUnits = bill / DEFAULTS.gridRate;
    var annualUnits = monthlyUnits * 12;

    /* System size needed to cover annual consumption. */
    var annualYieldPerKwp = DEFAULTS.solarYield * 365 * DEFAULTS.performanceRatio * adj.yieldMult;
    var systemKwp = annualUnits / annualYieldPerKwp;
    systemKwp = Math.max(systemKwp, 1); /* minimum 1 kWp */

    var panelCount = Math.round((systemKwp * 1000) / PANEL_WP);
    var roofNeeded = systemKwp * DEFAULTS.areaPerKwp;

    var costPerKwp = DEFAULTS.costPerKwp * adj.costMult;
    var cost = systemKwp * costPerKwp;

    /* Annual solar generation. */
    var annualSolar = systemKwp * annualYieldPerKwp;
    /* Offset: solar covers generation, capped at 100% of consumption. */
    var offsetUnits = Math.min(annualSolar, annualUnits);
    var annualSavings = offsetUnits * DEFAULTS.gridRate;
    var payback = annualSavings > 0 ? cost / annualSavings : 99;

    return {
      type: type,
      city: city,
      bill: bill,
      systemKwp: systemKwp,
      panelCount: panelCount,
      roofNeeded: roofNeeded,
      cost: cost,
      annualSavings: annualSavings,
      payback: payback,
      monthlyUnits: monthlyUnits
    };
  }

  function paint(res) {
    if (!res) {
      if (resultPanel) resultPanel.hidden = true;
      return;
    }
    outputs.system.textContent = res.systemKwp.toFixed(1) + ' kWp';
    if (outputs.panels) {
      outputs.panels.textContent = '≈' + res.panelCount + ' panels (580Wp)';
    }
    outputs.cost.textContent = money(res.cost);
    outputs.savings.textContent = money(Math.round(res.annualSavings)) + ' / yr';
    outputs.payback.textContent = res.payback.toFixed(1) + ' years';
    outputs.roof.textContent = Math.round(res.roofNeeded) + ' sq ft';

    /* Color coding: payback card. */
    var paybackCard = document.getElementById('estPaybackCard');
    if (paybackCard) {
      paybackCard.className = 'result-card';
      if (res.payback <= 4) paybackCard.classList.add('payback-excellent');
      else if (res.payback <= 6) paybackCard.classList.add('payback-good');
      else if (res.payback <= 8) paybackCard.classList.add('payback-average');
      else paybackCard.classList.add('payback-high');
    }

    if (resultPanel) resultPanel.hidden = false;
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function onInput() {
    if (calculateBtn) calculateBtn.disabled = !allFilled();
    paint(compute());
  }

  if (calculateBtn) {
    calculateBtn.addEventListener('click', function (event) {
      event.preventDefault();
      paint(compute());
    });
  }
  var resetBtn = el('estReset');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      inputs.bill.value = '';
      if (inputs.type) inputs.type.selectedIndex = 0;
      if (inputs.city) inputs.city.selectedIndex = 0;
      if (calculateBtn) calculateBtn.disabled = true;
      paint(null);
    });
  }
  [inputs.bill, inputs.type, inputs.city].forEach(function (i) {
    if (i) i.addEventListener('input', onInput);
  });

  /* Live preview as the visitor types. */
  onInput();

  root.EstimateCalculator = { compute: compute };
})(window);
