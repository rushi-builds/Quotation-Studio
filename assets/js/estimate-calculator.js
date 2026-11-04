/* Quick solar estimate calculator — one aesthetic glass card.

   Public-facing tool: enter monthly electricity bill, consumer type and
   place - get an instant estimate of recommended system size, panel count,
   cost, annual savings and payback period. Includes 5-year savings chart,
   save/load to localStorage and print/download PDF. All figures are
   indicative only - a real proposal follows after a site visit. No data
   leaves the browser.
 */
'use strict';
(function (root) {
  /* India-centric default assumptions, stated plainly. */
  var DEFAULTS = {
    /* kWh per kWp per day, averaged over a year for Pune/Maharashtra. */
    solarYield: 4.2,
    /* ₹ per kWh grid electricity (Maharashtra average). */
    gridRate: 7.50,
    /* Roof area needed per kWp (sq ft) - practical allowance incl. spacing. */
    areaPerKwp: 80,
    /* Annual degradation and performance ratio already baked into yield. */
    performanceRatio: 0.81
  };

  /* Explicit per-kWp installed cost by consumer type (all-inclusive). */
  var COST_PER_KWP = {
    residential: 55000,
    commercial:  50000,
    industrial:  45000,
    society:     52000
  };

  /* Yield adjustment by consumer type. */
  var YIELD_MULT = {
    residential: 1.00,
    commercial:  1.05,
    industrial:  1.10,
    society:     1.00
  };

  /* Standard commercial panel used for the panel-count estimate:
     ~2278 mm × 1134 mm ≈ 27.8 sq ft per 550Wp panel (~50.5 sq ft/kWp panel-only).
     Real roofs need spacing, tilt rows and access, so the practical roof
     allowance stays at 80 sq ft/kWp (areaPerKwp above). */
  var PANEL_WP = 550;

  /* localStorage key for saved estimates. */
  var STORAGE_KEY = 'qs_estimates';

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
  var printBtn = el('estPrint');
  var chartCanvas = el('estChart');
  var chartCtx = chartCanvas ? chartCanvas.getContext('2d') : null;

  var lastRes = null;

  function allFilled() {
    return inputs.bill.value && inputs.type.value && inputs.city.value;
  }

  function compute() {
    var bill = Number(inputs.bill.value) || 0;
    var type = inputs.type ? inputs.type.value : 'residential';
    var city = inputs.city ? inputs.city.value : 'Pune';
    if (!bill || !type || !city) return null;

    var costPerKwp = COST_PER_KWP[type] || COST_PER_KWP.residential;
    var yieldMult = YIELD_MULT[type] || YIELD_MULT.residential;

    /* Monthly units from bill: units = bill / rate. */
    var monthlyUnits = bill / DEFAULTS.gridRate;
    var annualUnits = monthlyUnits * 12;

    /* System size needed to cover annual consumption. */
    var annualYieldPerKwp = DEFAULTS.solarYield * 365 * DEFAULTS.performanceRatio * yieldMult;
    var systemKwp = annualUnits / annualYieldPerKwp;
    systemKwp = Math.max(systemKwp, 1); /* minimum 1 kWp */

    var panelCount = Math.round((systemKwp * 1000) / PANEL_WP);
    var roofNeeded = systemKwp * DEFAULTS.areaPerKwp;

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

  function drawChart(res) {
    if (!chartCtx || !res) return;
    var canvas = chartCanvas;
    var rect = canvas.parentElement.getBoundingClientRect();
    var width = rect.width || 300;
    var height = 200;
    canvas.width = width;
    canvas.height = height;

    var ctx = chartCtx;
    ctx.clearRect(0, 0, width, height);

    var years = 5;
    var annualSavings = res.annualSavings;
    var maxVal = annualSavings * years;
    var padding = 44;
    var chartWidth = width - padding * 2;
    var chartHeight = height - padding - 34;
    var barWidth = (chartWidth / years) * 0.6;
    var gap = (chartWidth / years) * 0.4;

    /* Grid lines + Y labels. */
    ctx.strokeStyle = '#E4E8EE';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#8A90A2';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (var i = 0; i <= 4; i++) {
      var y = padding + chartHeight - (chartHeight * i / 4);
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(padding + chartWidth, y);
      ctx.stroke();
      ctx.fillText(fmt(Math.round(maxVal * i / 4)), padding - 8, y + 4);
    }

    /* Bars: cumulative savings per year. */
    for (var i = 0; i < years; i++) {
      var cumulative = annualSavings * (i + 1);
      var barHeight = (cumulative / maxVal) * chartHeight;
      var x = padding + gap + i * (barWidth + gap);
      var y = padding + chartHeight - barHeight;

      var grad = ctx.createLinearGradient(0, y, 0, padding + chartHeight);
      grad.addColorStop(0, '#F2811D');
      grad.addColorStop(1, '#D96A0E');
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, barWidth, barHeight, 6);
      else ctx.rect(x, y, barWidth, barHeight);
      ctx.fill();

      /* Year label. */
      ctx.fillStyle = '#8A90A2';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Year ' + (i + 1), x + barWidth / 2, padding + chartHeight + 20);

      /* Value label on top of bar. */
      ctx.fillStyle = '#0F1E2A';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('₹' + fmt(Math.round(cumulative)), x + barWidth / 2, y - 7);
    }

    /* Chart title. */
    ctx.fillStyle = '#0F1E2A';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('5-Year Cumulative Savings', width / 2, 22);
  }

  function paint(res) {
    lastRes = res;
    outputs.system.textContent = res ? res.systemKwp.toFixed(1) + ' kWp' : '—';
    if (outputs.panels) {
      outputs.panels.textContent = res ? '≈' + res.panelCount + ' panels (550Wp)' : '—';
    }
    outputs.cost.textContent = res ? money(res.cost) : '—';
    outputs.savings.textContent = res ? money(Math.round(res.annualSavings)) + ' / yr' : '—';
    outputs.payback.textContent = res ? res.payback.toFixed(1) + ' years' : '—';
    outputs.roof.textContent = res ? Math.round(res.roofNeeded) + ' sq ft' : '—';

    var paybackCard = document.getElementById('estPaybackCard');
    if (paybackCard) {
      paybackCard.className = 'result-card';
      if (res) {
        if (res.payback <= 4) paybackCard.classList.add('payback-excellent');
        else if (res.payback <= 6) paybackCard.classList.add('payback-good');
        else if (res.payback <= 8) paybackCard.classList.add('payback-average');
        else paybackCard.classList.add('payback-high');
      }
    }

    drawChart(res);

    var printBtnEl = el('estPrint');
    if (printBtnEl) printBtnEl.style.display = res ? 'inline-flex' : 'none';
  }

  function onInput() {
    if (calculateBtn) calculateBtn.disabled = !allFilled();
  }

  if (calculateBtn) {
    calculateBtn.addEventListener('click', function (event) {
      event.preventDefault();
      var res = compute();
      paint(res);
      if (res) saveEstimate(res);
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

  /* ---------- Save & Load ---------- */
  function saveEstimate(res) {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      var estimates = stored ? JSON.parse(stored) : [];
      var entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        bill: res.bill,
        type: res.type,
        city: res.city,
        systemKwp: res.systemKwp,
        panelCount: res.panelCount,
        cost: res.cost,
        annualSavings: res.annualSavings,
        payback: res.payback,
        roofNeeded: res.roofNeeded
      };
      estimates.unshift(entry);
      estimates = estimates.slice(0, 10);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(estimates));
      renderSavedList();
    } catch (e) { /* localStorage may be blocked */ }
  }

  function renderSavedList() {
    var list = el('savedEstimatesList');
    if (!list) return;
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      var estimates = stored ? JSON.parse(stored) : [];
      var wrap = el('savedEstimatesWrap');
      if (estimates.length === 0) {
        if (wrap) wrap.style.display = 'none';
        list.innerHTML = '<p class="saved-empty">No saved estimates yet.</p>';
        return;
      }
      if (wrap) wrap.style.display = 'block';
      var html = estimates.map(function (e) {
        return '<div class="saved-item">' +
          '<div class="saved-info">' +
          '<span class="saved-date">' + new Date(e.date).toLocaleDateString('en-IN') + '</span>' +
          '<span class="saved-city">' + e.city + ' · ' + e.type + '</span>' +
          '</div>' +
          '<div class="saved-value">' + money(Math.round(e.cost)) + '</div>' +
          '<button class="saved-load" type="button">Load</button>' +
          '</div>';
      }).join('');
      list.innerHTML = html;
      list.querySelectorAll('.saved-load').forEach(function (btn, index) {
        btn.addEventListener('click', function () {
          loadSaved(estimates[index].id);
        });
      });
    } catch (e) {}
  }

  function loadSaved(id) {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      var estimates = stored ? JSON.parse(stored) : [];
      var entry = estimates.find(function (e) { return e.id === id; });
      if (!entry) return;
      inputs.bill.value = entry.bill;
      inputs.type.value = entry.type;
      inputs.city.value = entry.city;
      if (calculateBtn) calculateBtn.disabled = !allFilled();
      var res = {
        type: entry.type,
        city: entry.city,
        bill: entry.bill,
        systemKwp: entry.systemKwp,
        panelCount: entry.panelCount,
        cost: entry.cost,
        annualSavings: entry.annualSavings,
        payback: entry.payback,
        roofNeeded: entry.roofNeeded
      };
      paint(res);
    } catch (e) {}
  }

  /* ---------- Print / Download PDF ---------- */
  function printEstimate(res) {
    var win = window.open('', '_blank');
    win.document.write('<!DOCTYPE html><html><head><title>Solar Estimate</title>' +
      '<style>body{font-family:Inter,sans-serif;max-width:600px;margin:40px auto;padding:20px;color:#0F1E2A;}' +
      'h1{font-size:22px;margin:0 0 6px;}' +
      '.sub{font-size:13px;color:#5B6B80;margin-bottom:24px;}' +
      '.card{border:1px solid #E4E8EE;border-radius:16px;padding:24px;margin-bottom:16px;background:#fff;}' +
      '.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}' +
      '.label{font-size:11px;font-weight:700;letter-spacing:.12em;color:#8A90A2;text-transform:uppercase;margin-bottom:4px;}' +
      '.value{font-size:20px;font-weight:800;}' +
      '.unit{font-size:12px;color:#5B6B80;}' +
      '.disclaimer{font-size:10px;color:#8A90A2;margin-top:24px;line-height:1.6;border-top:1px solid #E4E8EE;padding-top:16px;}' +
      '@media print{body{margin:0;}button{display:none;}}</style></head><body>' +
      '<button onclick="window.print();window.close()">Print / Download PDF</button>' +
      '<h1>Solar Estimate</h1>' +
      '<p class="sub"><strong>' + res.city + '</strong> · ' + res.type + ' · Bill ₹' + fmt(res.bill) + '/month</p>' +
      '<div class="card grid">' +
      '<div><div class="label">Recommended System</div><div class="value">' + res.systemKwp.toFixed(1) + '</div><div class="unit">kWp</div></div>' +
      '<div><div class="label">Solar Panels</div><div class="value">' + res.panelCount + '</div><div class="unit">550Wp each</div></div>' +
      '<div><div class="label">Estimated Cost</div><div class="value">' + money(res.cost) + '</div><div class="unit">(all-inclusive)</div></div>' +
      '<div><div class="label">Annual Savings</div><div class="value">' + money(Math.round(res.annualSavings)) + '</div><div class="unit">/ yr</div></div>' +
      '<div><div class="label">Payback Period</div><div class="value">' + res.payback.toFixed(1) + '</div><div class="unit">years</div></div>' +
      '<div><div class="label">Roof Space</div><div class="value">' + Math.round(res.roofNeeded) + '</div><div class="unit">sq ft</div></div>' +
      '</div>' +
      '<div class="disclaimer"><strong>Indicative only.</strong> Figures use Maharashtra-average solar yield (≈4.2 kWh/kWp/day), ₹7.50/kWh grid rate. Actual output depends on roof orientation, shading, structure and local DISCOM tariff. A site visit confirms the real design and price.</div>' +
      '</body></html>');
    win.document.close();
  }

  if (printBtn) {
    printBtn.addEventListener('click', function () {
      if (!lastRes) return;
      printEstimate(lastRes);
    });
  }

  /* Start with results hidden - calculate only on button click. */
  if (calculateBtn) calculateBtn.disabled = true;
  paint(null);
  renderSavedList();

  root.EstimateCalculator = { compute: compute, loadSaved: loadSaved };
})(window);