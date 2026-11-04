/* Quick solar estimate calculator — one aesthetic glass card.

   Public-facing tool: enter monthly electricity bill, consumer type and
   place - get an instant estimate of recommended system size, panel count,
   cost, annual savings and payback period. Includes 5-year savings chart,
   WhatsApp share and print/download PDF. All figures are indicative only -
   a real proposal follows after a site visit. No data leaves the browser.
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

  /* Installed cost rate, sliding by capacity — matches the quotation engine's
     ₹63.6/Wp anchor at 1 kW (owner decision, 2026-11-05):
     - Residential / society (subsidy band): ₹63.6/Wp at 1 kW sliding to
       ₹60/Wp by 3 kW, flat ₹60 above — small systems carry fixed costs.
     - Commercial / industrial (no subsidy): ₹63.6/Wp at 1 kW sliding
       linearly to ₹45/Wp at 20 kW, flat ₹45 above — economies of scale.
     All rates GST-inclusive, same treatment as the quotation. */
  function ratePerWp(type, kwp) {
    if (type === 'residential' || type === 'society') {
      if (kwp >= 3) return 60;
      return 63.6 - 3.6 * ((kwp - 1) / 2); /* 63.6 → 60 across 1–3 kW */
    }
    if (kwp <= 1) return 63.6;
    if (kwp >= 20) return 45;
    return 63.6 - 18.6 * ((kwp - 1) / 19); /* 63.6 → 45 across 1–20 kW */
  }

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

  /* Government subsidy, matching the quotation engine's treatment.
     - Residential: PM Surya Ghar — ₹30,000/kW for the first 2 kW, ₹18,000 for
       the 3rd kW, capped at ₹78,000.
     - Housing society: ₹18,000/kWp (common-facility/RWA rate).
     - Commercial and industrial: no subsidy — the card shows a dash. */
  function calcSubsidy(type, kwp) {
    if (type === 'residential') {
      if (!isFinite(kwp) || kwp <= 0) return 0;
      if (kwp <= 2) return kwp * 30000;
      if (kwp <= 3) return 60000 + (kwp - 2) * 18000;
      return 78000;
    }
    if (type === 'society') {
      if (!isFinite(kwp) || kwp <= 0) return 0;
      return Math.min(kwp, 500) * 18000;
    }
    return null; /* commercial / industrial — not applicable */
  }

  var SUBSIDY_CAPTION = {
    residential: 'PM Surya Ghar',
    society: 'RWA scheme',
    commercial: 'not applicable',
    industrial: 'not applicable'
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
    bill: el('estBill'),
    type: el('estType'),
    city: el('estCity')
  };
  var outputs = {
    system: el('estSystem'),
    panels: el('estPanels'),
    cost: el('estCost'),
    subsidy: el('estSubsidy'),
    subsidyUnit: el('estSubsidyUnit'),
    net: el('estNet'),
    savings: el('estSavings'),
    payback: el('estPayback'),
    roof: el('estRoof')
  };
  var resultPanel = el('estimateResult');
  var calculateBtn = el('estCalculate');
  var printBtn = el('estPrint');
  var whatsappBtn = el('estWhatsApp');
  var chartCanvas = el('estChart');
  var chartCtx = chartCanvas ? chartCanvas.getContext('2d') : null;

  var lastRes = null;

  /* Card color map - every result card gets its own colored border. */
  var CARD_COLORS = {
    system: '#16405F',
    panels: '#2E7D32',
    roof: '#00838F',
    cost: '#F2811D',
    subsidy: '#1B5E20',
    net: '#0D47A1',
    savings: '#6A1B9A',
    payback: '#C62828'
  };

  function allFilled() {
    return inputs.bill.value && inputs.type.value && inputs.city.value;
  }

  function compute() {
    var bill = Number(inputs.bill.value) || 0;
    var type = inputs.type ? inputs.type.value : 'residential';
    var city = inputs.city ? inputs.city.value : 'Pune';
    if (!bill || !type || !city) return null;

    var costPerKwp = ratePerWp(type, systemKwp) * 1000;
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

    var subsidy = calcSubsidy(type, systemKwp);

    return {
      type: type,
      city: city,
      bill: bill,
      systemKwp: systemKwp,
      panelCount: panelCount,
      roofNeeded: roofNeeded,
      cost: cost,
      rateWp: costPerKwp / 1000,
      subsidy: subsidy,
      net: cost - (subsidy || 0),
      annualSavings: annualSavings,
      payback: payback,
      monthlyUnits: monthlyUnits
    };
  }

  function drawChart(res) {
    if (!chartCtx || !res) return;
    var canvas = chartCanvas;
    var wrap = canvas.parentElement;
    if (!wrap || wrap.clientWidth < 40) return; /* not laid out yet - the observer retries */
    var width = wrap.clientWidth;
    var height = 170;
    var dpr = window.devicePixelRatio || 1;
    /* Only the bitmap is sized here. The element itself stays glued to the
       card via CSS width:100%, so it can never freeze at a stale width. */
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = height + 'px';

    var ctx = chartCtx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    var years = 5;
    var annualSavings = res.annualSavings;
    var maxVal = annualSavings * years;
    var leftPad = 14, rightPad = 14, topPad = 18, bottomPad = 34;
    var chartWidth = width - leftPad - rightPad;
    var chartHeight = height - topPad - bottomPad;
    var slot = chartWidth / years;
    var barWidth = slot * 0.64; /* even gaps between the bars */
    var gap = slot - barWidth;

    /* Single subtle baseline - no grid lines, keeps the chart minimal. */
    ctx.strokeStyle = '#D8DEE6';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(leftPad, topPad + chartHeight);
    ctx.lineTo(leftPad + chartWidth, topPad + chartHeight);
    ctx.stroke();

    /* Bars: cumulative savings per year - wide flat solid orange, clean rounded corners. */
    for (var i = 0; i < years; i++) {
      var cumulative = annualSavings * (i + 1);
      var barHeight = (cumulative / maxVal) * chartHeight;
      var x = leftPad + i * slot + gap / 2;
      var y = topPad + chartHeight - barHeight;

      ctx.fillStyle = '#F2811D';
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 10);
      ctx.fill();

      /* Year label. */
      ctx.fillStyle = '#8A90A2';
      ctx.font = '10.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Year ' + (i + 1), x + barWidth / 2, topPad + chartHeight + 16);

      /* Value label on top of bar. */
      ctx.fillStyle = '#0F1E2A';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('₹' + fmt(Math.round(cumulative)), x + barWidth / 2, y - 6);
    }
  }

  function paint(res) {
    lastRes = res;
    outputs.system.textContent = res ? res.systemKwp.toFixed(1) + ' kWp' : '—';
    if (outputs.panels) {
      outputs.panels.textContent = res ? '≈' + res.panelCount + ' panels (550Wp)' : '—';
    }
    outputs.cost.textContent = res ? money(res.cost) : '—';
    if (outputs.subsidy) {
      outputs.subsidy.textContent = res ? (res.subsidy == null ? '—' : money(res.subsidy)) : '—';
    }
    if (outputs.subsidyUnit) {
      outputs.subsidyUnit.textContent = res ? (SUBSIDY_CAPTION[res.type] || 'PM Surya Ghar') : 'PM Surya Ghar';
    }
    if (outputs.net) {
      outputs.net.textContent = res ? money(res.net) : '—';
    }
    outputs.savings.textContent = res ? money(Math.round(res.annualSavings)) + ' / yr' : '—';
    outputs.payback.textContent = res ? res.payback.toFixed(1) + ' years' : '—';
    outputs.roof.textContent = res ? Math.round(res.roofNeeded) + ' sq ft' : '—';

    /* Colored borders on ALL result cards. */
    var cardMap = {
      system: document.getElementById('cardSystem'),
      panels: document.getElementById('cardPanels'),
      roof: document.getElementById('cardRoof'),
      cost: document.getElementById('cardCost'),
      subsidy: document.getElementById('cardSubsidy'),
      net: document.getElementById('cardNet'),
      savings: document.getElementById('cardSavings'),
      payback: document.getElementById('estPaybackCard')
    };
    Object.keys(cardMap).forEach(function (key) {
      var card = cardMap[key];
      if (!card) return;
      card.className = 'result-card';
      if (res) {
        card.style.borderColor = CARD_COLORS[key];
        card.style.background = 'rgba(255,255,255,0.5)';
      }
    });

    /* Payback card - always green. Override inline styles with CSS class. */
    if (res) {
      var paybackCard = cardMap.payback;
      paybackCard.classList.add('payback-green');
      paybackCard.style.borderColor = '#2E7D32';
      paybackCard.style.background = 'rgba(46,125,50,0.08)';
    }

    drawChart(res);

    var printBtnEl = el('estPrint');
    if (printBtnEl) printBtnEl.style.display = res ? 'inline-flex' : 'none';

    var waBtn = el('estWhatsApp');
    var waWrap = el('estWhatsAppWrap');
    if (waBtn) waBtn.style.display = res ? 'inline-flex' : 'none';
    if (waWrap) waWrap.style.display = res ? 'flex' : 'none';

    /* Show chart section only after a calculation. Draw on the NEXT frame so
       the wrap is fully laid out before the bitmap is measured. */
    var estChartWrap = el('estChartWrap');
    if (estChartWrap) {
      estChartWrap.hidden = !res;
      if (res) window.requestAnimationFrame(function () { drawChart(lastRes); });
    }
  }

  function onInput() {
    if (calculateBtn) calculateBtn.disabled = !allFilled();
  }

  if (calculateBtn) {
    calculateBtn.addEventListener('click', function (event) {
      event.preventDefault();
      var res = compute();
      paint(res);
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

  /* ---------- WhatsApp share (small icon button) ---------- */
  if (whatsappBtn) {
    whatsappBtn.addEventListener('click', function () {
      if (!lastRes) return;
      var subsidyText = lastRes.subsidy == null ? 'Not applicable' : 'Govt subsidy ' + money(lastRes.subsidy);
      var text = 'Solar Estimate — ' + lastRes.city + ' · ' + lastRes.type + ' · Monthly bill ₹' + fmt(lastRes.bill) + '/month.\nRecommended: ' + lastRes.systemKwp.toFixed(1) + ' kWp · ≈' + lastRes.panelCount + ' panels (550Wp) · Cost ' + money(lastRes.cost) + ' (GST included) · ' + subsidyText + ' · Net cost ' + money(lastRes.net) + ' · Savings ' + money(Math.round(lastRes.annualSavings)) + '/yr · Payback ' + lastRes.payback.toFixed(1) + ' years.\nGet in touch for a detailed proposal.';
      var waUrl = 'https://wa.me/?text=' + encodeURIComponent(text);
      var win = window.open(waUrl, '_blank');
      if (!win) alert('Could not open WhatsApp — please allow pop-ups for this site.');
    });
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
      '<div><div class="label">Estimated Cost</div><div class="value">' + money(res.cost) + '</div><div class="unit">(GST included)</div></div>' +
      '<div><div class="label">Govt Subsidy</div><div class="value">' + (res.subsidy == null ? '—' : money(res.subsidy)) + '</div><div class="unit">' + (SUBSIDY_CAPTION[res.type] || '') + '</div></div>' +
      '<div><div class="label">Your Net Cost</div><div class="value">' + money(res.net) + '</div><div class="unit">after subsidy</div></div>' +
      '<div><div class="label">Annual Savings</div><div class="value">' + money(Math.round(res.annualSavings)) + '</div><div class="unit">/ yr</div></div>' +
      '<div><div class="label">Payback Period</div><div class="value">' + res.payback.toFixed(1) + '</div><div class="unit">years</div></div>' +
      '<div><div class="label">Roof Space</div><div class="value">' + Math.round(res.roofNeeded) + '</div><div class="unit">sq ft</div></div>' +
      '</div>' +
      '<div class="disclaimer"><strong>Indicative only.</strong> All prices and figures may vary as per site conditions and equipment. A site visit confirms the real design and price.</div>' +
      '</body></html>');
    win.document.close();
  }

  if (printBtn) {
    printBtn.addEventListener('click', function () {
      if (!lastRes) return;
      printEstimate(lastRes);
    });
  }

  /* ---------- Modal open / close ---------- */
  var modal = el('estimate');
  function openCalc() {
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    /* Repaint once the modal is laid out so the chart spans the full card. */
    if (lastRes) {
      window.requestAnimationFrame(function () { drawChart(lastRes); });
      window.setTimeout(function () { drawChart(lastRes); }, 60);
    }
  }
  function closeCalc() {
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = '';
  }
  var openBtn = el('calcOpen');
  if (openBtn) openBtn.addEventListener('click', openCalc);
  Array.prototype.forEach.call(document.querySelectorAll('[data-calc-close]'), function (node) {
    node.addEventListener('click', closeCalc);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && modal && !modal.hidden) closeCalc();
  });
  window.addEventListener('resize', function () {
    if (lastRes && modal && !modal.hidden) drawChart(lastRes);
  });
  /* Zoom, window resize, modal entry animation - any change to the chart
     wrap's size redraws the bitmap at the true card width. */
  if (typeof ResizeObserver !== 'undefined' && chartCanvas) {
    new ResizeObserver(function () {
      if (lastRes && modal && !modal.hidden && chartCanvas.clientWidth > 40) drawChart(lastRes);
    }).observe(chartCanvas.parentElement);
  }

  /* Start with results hidden - calculate only on button click. */
  if (calculateBtn) calculateBtn.disabled = true;
  paint(null);

  root.EstimateCalculator = { compute: compute };
})(window);