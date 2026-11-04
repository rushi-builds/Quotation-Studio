/* Quick solar estimate calculator.

   Public-facing tool: enter roof area and monthly electricity bill, get an
   instant estimate of recommended system size, cost, annual savings and
   payback period. All figures are indicative only - a real proposal follows
   after a site visit. No data leaves the browser.
 */
'use strict';
(function (root) {
  /* India-centric default assumptions, stated plainly. */
  var DEFAULTS = {
    /* kWh per kWp per day, averaged over a year for Pune/Maharashtra. */
    solarYield: 4.2,
    /* ₹ per kWp installed, all-inclusive (modules, inverter, structure, cabling, net-metering). */
    costPerKwp: 52000,
    /* ₹ per kWh grid electricity. */
    gridRate: 7.50,
    /* Roof area needed per kWp (sq ft). */
    areaPerKwp: 80,
    /* Annual degradation and performance ratio already baked into yield. */
    performanceRatio: 0.81
  };

  function el(id) { return document.getElementById(id); }
  function fmt(n, decimals) {
    if (n == null || !isFinite(n)) return '—';
    return Number(n).toFixed(decimals == null ? 0 : decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function money(n) { return '₹' + fmt(n); }

  var form = el('estimateForm');
  if (!form) return;

  var inputs = {
    area: el('estArea'),
    bill: el('estBill'),
    city: el('estCity')
  };
  var outputs = {
    system: el('estSystem'),
    cost: el('estCost'),
    savings: el('estSavings'),
    payback: el('estPayback'),
    roof: el('estRoof')
  };
  var resultPanel = el('estimateResult');
  var calculateBtn = el('estCalculate');

  /* Standard commercial panel used for the panel-count estimate:
     ~2278 mm × 1134 mm ≈ 27.8 sq ft per 580Wp panel (~48 sq ft/kWp panel-only).
     Real roofs need spacing, tilt rows and access, so the practical roof
     allowance stays at 80 sq ft/kWp (areaPerKwp above). */
  var PANEL_WP = 580;

  function compute() {
    var area = Number(inputs.area.value) || 0;
    var bill = Number(inputs.bill.value) || 0;
    var city = inputs.city ? inputs.city.value : 'Pune';
    if (!bill) return null; /* bill is the only required input */

    /* Monthly units from bill: units = bill / rate. */
    var monthlyUnits = bill / DEFAULTS.gridRate;
    var annualUnits = monthlyUnits * 12;

    /* System size needed to cover annual consumption. */
    var annualYieldPerKwp = DEFAULTS.solarYield * 365 * DEFAULTS.performanceRatio;
    var systemByUsage = annualUnits / annualYieldPerKwp;

    var systemKwp = systemByUsage;
    var roofLimited = false;

    /* If roof area is given, cap the system at what fits on the roof. */
    if (area) {
      var systemByRoof = area / DEFAULTS.areaPerKwp;
      if (systemByRoof < systemByUsage) {
        systemKwp = systemByRoof;
        roofLimited = true;
      }
    }
    systemKwp = Math.max(systemKwp, 1); /* minimum 1 kWp */

    var roofNeeded = systemKwp * DEFAULTS.areaPerKwp;
    var panelCount = Math.round((systemKwp * 1000) / PANEL_WP);
    var cost = systemKwp * DEFAULTS.costPerKwp;

    /* Annual solar generation. */
    var annualSolar = systemKwp * annualYieldPerKwp;
    /* Offset: solar covers generation, capped at 100% of consumption. */
    var offsetUnits = Math.min(annualSolar, annualUnits);
    var annualSavings = offsetUnits * DEFAULTS.gridRate;
    var payback = annualSavings > 0 ? cost / annualSavings : 99;

    return {
      city: city,
      area: area,
      bill: bill,
      systemKwp: systemKwp,
      roofNeeded: roofNeeded,
      roofLimited: roofLimited,
      panelCount: panelCount,
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
    var systemLabel = res.systemKwp.toFixed(1) + ' kWp';
    if (res.panelCount) systemLabel += ' · ≈' + res.panelCount + ' panels (580Wp)';
    outputs.system.textContent = systemLabel;
    outputs.cost.textContent = money(res.cost);
    outputs.savings.textContent = money(Math.round(res.annualSavings)) + ' / yr';
    outputs.payback.textContent = res.payback.toFixed(1) + ' years';
    var roofLabel = Math.round(res.roofNeeded) + ' sq ft';
    if (res.roofLimited) roofLabel += ' (roof-limited)';
    outputs.roof.textContent = roofLabel;
    if (resultPanel) resultPanel.hidden = false;
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function onInput() {
    if (calculateBtn) calculateBtn.disabled = !inputs.bill.value;
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
      inputs.area.value = '';
      inputs.bill.value = '';
      if (inputs.city) inputs.city.selectedIndex = 0;
      if (calculateBtn) calculateBtn.disabled = true;
      paint(null);
    });
  }
  [inputs.area, inputs.bill, inputs.city].forEach(function (i) {
    if (i) i.addEventListener('input', onInput);
  });

  /* Live preview as the visitor types. */
  onInput();

  root.EstimateCalculator = { compute: compute };
})(window);
