/* Quick solar estimate calculator — one aesthetic glass card.

   Public-facing tool: enter monthly electricity bill, consumer type and
   place - get an instant estimate of recommended system size, panel count,
   cost, annual savings and payback period. Includes 5-year savings chart,
   WhatsApp share and print/download PDF. All figures are indicative only -
   a real proposal follows after a site visit. No data leaves the browser.
 */
'use strict';
(function (root) {
  /* ------------------------------------------------------------------------
     THE SAME NUMBERS THE QUOTATION USES. Not a copy of them - a mirror that CI
     holds against the source.

     This card sits in front of a customer and so does the quotation sheet. Both
     must answer the same question with the same arithmetic, otherwise a customer
     reads one price here and a different one on the proposal and the only thing
     that changed is which file did the maths.

     Every value below therefore equals a default in assets/js/state.js, and
     qa/estimate-calculator.test.cjs loads the real state.js and the real
     finance.js and fails if any of them ever drifts apart:

       costPerWp      state.js costPerWp      - ₹/Wp, EX-GST
       gstPercent     state.js gstPercent     - finance.js: gst = cost * pct/100
       moduleWattage  state.js moduleWattage  - modules on the roof
       genFactor      state.js genFactor      - kWh per kWp per year, net of
                                                every loss (the quotation's
                                                annualGen = kWp * genFactor)
       tariff         state.js tariff         - ₹ per unit, blended

     `areaPerKwp` is the only assumption this card owns: it is a roof-practical
     allowance (modules + walkways + inter-row shadow), not a price.          */
  var SHARED = {
    costPerWp: 63.6,        /* ₹/Wp ex-GST - also the top of the rate band */
    gstPercent: 8.9,        /* finance.js applies it to the ex-GST cost */
    moduleWattage: 545,     /* Wp per module */
    genFactor: 1460,        /* kWh per kWp per year */
    tariff: 10              /* ₹ per unit */
  };

  var DEFAULTS = {
    /* Roof area needed per kWp (sq ft) - practical allowance incl. spacing. */
    areaPerKwp: 80
  };

  /* Installed cost rate, sliding by capacity — one percentage curve, two bands.
     The percentage is DERIVED, never hand-typed.

     A band is described only by the two numbers the business actually owns:
       floor               the lowest ₹/Wp this band may ever reach
       reachesFloorAtKwp   the capacity at which it reaches that floor
     and the curve between them is exponential (degradation-style): every extra
     kW multiplies the rate by the same factor, so the softening is a constant
     percentage and never a straight line.

     Because the step is solved FROM the floor and the breakpoint —
         step = 1 - (floor / anchor) ^ (1 / (breakpoint - 1))
     the curve lands exactly on its floor at the breakpoint. Nothing can drift:
     a retune means editing a floor or a breakpoint, and the percentage follows
     on its own. That is what stops the failure mode a hand-typed percentage
     allows — "3 kW priced at 63, 500 kW quietly landing on 30 or 20".
     A belt-and-braces clamp then pins the result inside [floor, anchor] for
     every possible input, including a broken or missing capacity.

     Bands (owner decision, 2026-11-05):
       - Residential / society (subsidy):    ₹60/Wp floor, reached by 3 kW
       - Commercial / industrial (no subsidy): ₹45/Wp floor, reached by 20 kW
     So 100 kW and 500 kW both sit on 45 (or 60) — never below. */
  var RATE_ANCHOR = SHARED.costPerWp;  /* ₹/Wp at 1 kW, ex-GST - top of the band. */
  var RATE_BANDS = {
    subsidy:    { floor: 60, reachesFloorAtKwp: 3  },  /* residential + society */
    nonsubsidy: { floor: 45, reachesFloorAtKwp: 20 }   /* commercial + industrial */
  };

  function rateBandOf(type) {
    return (type === 'residential' || type === 'society') ? 'subsidy' : 'nonsubsidy';
  }

  /** ₹/Wp for a capacity in kWp, inside the band's floor..anchor forever. */
  function ratePerWp(type, kwp) {
    var band = RATE_BANDS[rateBandOf(type)];
    var size = Number(kwp);
    /* An unknown, negative or sub-1 capacity prices at the anchor, never NaN. */
    if (!isFinite(size) || size < 1) size = 1;
    var span = Math.max(band.reachesFloorAtKwp - 1, 1);   /* 1 kW is the anchor */
    var step = 1 - Math.pow(band.floor / RATE_ANCHOR, 1 / span);
    var rate = RATE_ANCHOR * Math.pow(1 - step, size - 1);
    /* Hard band: whatever the size, whatever the band, whatever a future edit
       does to the maths above, the rate cannot leave [floor, anchor]. */
    return Math.min(Math.max(rate, band.floor), RATE_ANCHOR);
  }


  /* The panel used for the module count. Inline figures for the roof note:
     ~2272 mm × 1133 mm ≈ 27.7 sq ft per 545 Wp module. Real roofs need
     spacing, tilt rows and access, so the practical roof allowance stays at
     80 sq ft/kWp (areaPerKwp above). */

  /* Government subsidy, on the SAME basis the quotation engine uses.
     finance.js assesses CFA on the capacity actually installed (modules on the
     roof), not the contracted figure, because that is what the DISCOM
     registers - so 3 kWp contracted at 545 Wp is 6 modules = 3.27 kWp and the
     subsidy follows 3.27, exactly as the proposal does. Slabs are Finance's:
       - Residential: ₹30,000/kW for the first 2 kW, ₹18,000 for the 3rd kW,
         flat ₹78,000 from 3 kW up.
       - Housing society: ₹18,000/kWp, RWA capped at 500 kWp.
       - Commercial / industrial: no subsidy - the card shows a dash.
     qa/estimate-calculator.test.cjs sweeps this against Finance.calcSubsidy. */
  var RWA_SUBSIDY_PER_KWP = 18000;
  var RWA_MAX_KWP = 500;

  function calcSubsidy(type, installedKwp) {
    var kwp = Number(installedKwp);
    if (!isFinite(kwp) || kwp <= 0) return type === 'commercial' || type === 'industrial' ? null : 0;
    if (type === 'residential') {
      if (kwp <= 2) return 30000 * kwp;
      if (kwp < 3) return 60000 + 18000 * (kwp - 2);
      return 78000;
    }
    if (type === 'society') {
      return Math.min(kwp, RWA_MAX_KWP) * RWA_SUBSIDY_PER_KWP;
    }
    return null; /* commercial / industrial - not applicable */
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

  /* The price block, in the quotation engine's order of operations:
       rate        ₹/Wp for this capacity - ex-GST, hard 45-63.6 band
       projectCost capacity x rate x 1000                       (ex-GST)
       gstAmount   projectCost x gstPercent / 100               (finance.js)
       cost        projectCost + gstAmount                      (what the card
                                                                 calls "GST
                                                                 included")
       subsidy     on the INSTALLED capacity, Finance's slabs
       net         cost - subsidy

     Pure: capacity and type in, numbers out, no DOM. That is what lets the QA
     suite price a capacity here and hand the same capacity + rate to the real
     finance.js, then compare the two answers to the rupee. */
  function quote(capacityKwp, type) {
    var size = Number(capacityKwp);
    if (!isFinite(size) || size <= 0) return null;

    var rateWp = ratePerWp(type, size);
    if (!isFinite(rateWp) || rateWp <= 0) return null;

    /* Module count and installed capacity exactly as finance.js derives them
       from the contracted capacity, including the epsilon guard that keeps
       8.175 kWp / 545 Wp from evaluating as 15.000000000000002 modules. */
    var requiredModules = (size * 1000) / SHARED.moduleWattage;
    var panelCount = Math.ceil(requiredModules - 2 * Number.EPSILON * requiredModules);
    if (!(panelCount > 0) || !isFinite(panelCount)) panelCount = 1;
    var installedKwp = (panelCount * SHARED.moduleWattage) / 1000;

    var projectCost = size * rateWp * 1000;
    var gstAmount = projectCost * SHARED.gstPercent / 100;
    var cost = projectCost + gstAmount;
    var subsidy = calcSubsidy(type, installedKwp);
    var net = cost - (subsidy || 0);

    return {
      rateWp: rateWp,
      capacityKwp: size,
      panelCount: panelCount,
      installedKwp: installedKwp,
      projectCost: projectCost,
      gstAmount: gstAmount,
      cost: cost,
      subsidy: subsidy,
      net: net,
      /* Year-1 generation, the same installed x genFactor the quotation uses. */
      annualGen: installedKwp * SHARED.genFactor
    };
  }

  function compute() {
    var bill = Number(inputs.bill.value) || 0;
    var type = inputs.type ? inputs.type.value : 'residential';
    var city = inputs.city ? inputs.city.value : 'Pune';
    if (!bill || !type || !city) return null;

    /* Units the bill buys in a month, at the quoted tariff, then the year. */
    var monthlyUnits = bill / SHARED.tariff;
    var annualUnits = monthlyUnits * 12;

    /* Size the array at the quotation's own specific yield (genFactor), so a
       bill and a capacity mean the same thing on both surfaces. No per-type
       multiplier here: the engine has one yield assumption, and a second one
       invented for this card is how the two surfaces drift apart. */
    var systemKwp = Math.max(annualUnits / SHARED.genFactor, 1);

    /* The rate depends on the size, so it MUST be read after the size is
       known. These two lines were once swapped: `var` hoisting handed
       ratePerWp() an `undefined` size, Math.max(undefined, 1) returned NaN and
       every cost on the card, in the WhatsApp message and in the PDF came out
       as "₹—" / "NaN years". quote() returns null on a non-finite rate, so a
       future reordering degrades to an honest "—" instead of a NaN that
       reaches a customer document. */
    var priced = quote(systemKwp, type);
    if (!priced) return null;

    var roofNeeded = systemKwp * DEFAULTS.areaPerKwp;

    /* Solar offsets the customer's consumption, and only up to consumption.
       finance.js does not need the cap because a quotation starts from a
       capacity the dealer chose; here the size comes from the bill. */
    var offsetUnits = Math.min(priced.annualGen, annualUnits);
    var annualSavings = offsetUnits * SHARED.tariff;

    /* Payback on the money the customer actually puts in, after subsidy -
       which is how finance.js defines it (netInvestment / year-1 saving). */
    var payback = annualSavings > 0 ? priced.net / annualSavings : 99;

    return {
      type: type,
      city: city,
      bill: bill,
      systemKwp: systemKwp,
      installedKwp: priced.installedKwp,
      panelCount: priced.panelCount,
      roofNeeded: roofNeeded,
      rateWp: priced.rateWp,
      projectCost: priced.projectCost,
      gstAmount: priced.gstAmount,
      gstPercent: SHARED.gstPercent,
      cost: priced.cost,
      subsidy: priced.subsidy,
      net: priced.net,
      annualSavings: annualSavings,
      payback: payback,
      monthlyUnits: monthlyUnits,
      annualUnits: annualUnits
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
      outputs.panels.textContent = res ? '≈' + res.panelCount + ' panels (' + SHARED.moduleWattage + 'Wp)' : '—';
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
    outputs.payback.textContent = res ? fmt(res.payback, 1) + ' years' : '—';
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
      var text = 'Solar Estimate — ' + lastRes.city + ' · ' + lastRes.type + ' · Monthly bill ₹' + fmt(lastRes.bill) + '/month.\nRecommended: ' + lastRes.systemKwp.toFixed(1) + ' kWp · ≈' + lastRes.panelCount + ' panels (' + SHARED.moduleWattage + 'Wp) · Cost ' + money(lastRes.cost) + ' (GST included) · ' + subsidyText + ' · Net cost ' + money(lastRes.net) + ' · Savings ' + money(Math.round(lastRes.annualSavings)) + '/yr · Payback ' + fmt(lastRes.payback, 1) + ' years.\nGet in touch for a detailed proposal.';
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
      '<div><div class="label">Solar Panels</div><div class="value">' + res.panelCount + '</div><div class="unit">' + SHARED.moduleWattage + 'Wp each</div></div>' +
      '<div><div class="label">Estimated Cost</div><div class="value">' + money(res.cost) + '</div><div class="unit">(GST included)</div></div>' +
      '<div><div class="label">Govt Subsidy</div><div class="value">' + (res.subsidy == null ? '—' : money(res.subsidy)) + '</div><div class="unit">' + (SUBSIDY_CAPTION[res.type] || '') + '</div></div>' +
      '<div><div class="label">Your Net Cost</div><div class="value">' + money(res.net) + '</div><div class="unit">after subsidy</div></div>' +
      '<div><div class="label">Annual Savings</div><div class="value">' + money(Math.round(res.annualSavings)) + '</div><div class="unit">/ yr</div></div>' +
      '<div><div class="label">Payback Period</div><div class="value">' + fmt(res.payback, 1) + '</div><div class="unit">years</div></div>' +
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

  /* Public surface. ratePerWp/rateBands exist so qa/estimate-calculator.test.cjs
     can sweep thousands of capacities against the REAL curve instead of a copy of
     it inside the test. Nothing on the page reads them. */
  root.EstimateCalculator = {
    compute: compute,
    quote: quote,
    ratePerWp: ratePerWp,
    rateAnchor: RATE_ANCHOR,
    rateBands: RATE_BANDS,
    assumptions: SHARED,
    calcSubsidy: calcSubsidy
  };
})(window);