/* ==========================================================================
   Quotation Studio — Chart Engine (dependency-free, canvas-based)
   --------------------------------------------------------------------------
   Charts are drawn on <canvas> because html2canvas rasterises canvas
   bitmaps with perfect fidelity during PDF export (unlike SVG/CSS tricks).

   Every chart is computed ONLY from the finance object passed in — the
   same object rendered as text elsewhere in the proposal, so charts can
   never disagree with the numbers.

   Charts:
     Charts.cumulative(canvas, f)  — cumulative savings vs net investment
     Charts.annual(canvas, f)      — annual savings bars over 25 years
     Charts.bridge(canvas, f)      — cost build-up (base → GST → subsidy → net)
     Charts.donut(canvas, f)       — BOM composition (only when BOM is entered)
   ========================================================================== */
'use strict';

(function (root) {

  const NAVY = '#1C2B3F';
  const NAVY_SOFT = '#5B6B80';
  const ORANGE = '#F2811D';
  const ORANGE_DARK = '#D96A0E';
  const LINE = '#E5E9EF';
  const GRID = '#EDF0F4';
  const TEXT = '#5B6472';
  const GREEN = '#2E8B57';

  const FONT = "'Inter', Arial, sans-serif";
  const FONT_DISPLAY = "'Poppins', 'Inter', Arial, sans-serif";

  function shortINR(n) {
    if (!isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e7) return '₹' + trim((n / 1e7)) + 'Cr';
    if (abs >= 1e5) return '₹' + trim((n / 1e5)) + 'L';
    if (abs >= 1000) return '₹' + trim((n / 1000)) + 'k';
    return '₹' + Math.round(n);
  }
  function trim(v) {
    v = Math.round(v * 100) / 100;
    return (v % 1 === 0) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  }

  /* Prepare a canvas for crisp drawing; returns 2d ctx in CSS-pixel space. */
  function setup(canvas, cssW, cssH) {
    const dpr = Math.min((root.devicePixelRatio || 1) * 1.75, 3);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.__W = cssW; ctx.__H = cssH;
    return ctx;
  }

  function emptyNote(ctx, msg) {
    ctx.fillStyle = '#F7F9FB';
    ctx.fillRect(0, 0, ctx.__W, ctx.__H);
    ctx.strokeStyle = LINE; ctx.strokeRect(0.5, 0.5, ctx.__W - 1, ctx.__H - 1);
    ctx.fillStyle = TEXT;
    ctx.font = '500 12px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(msg, ctx.__W / 2, ctx.__H / 2);
  }

  function niceCeil(v) {
    if (v <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(v)));
    return Math.ceil(v / (mag / 2)) * (mag / 2);
  }

  /* ------------------------------------------------------------------ */
  /* 1. Cumulative savings vs net investment                             */
  /* ------------------------------------------------------------------ */
  function cumulative(canvas, f) {
    if (!canvas) return;
    const W = canvas.clientWidth || 700, H = canvas.clientHeight || 300;
    const ctx = setup(canvas, W, H);
    const s = f.series;
    if (!s || f.netInvestment <= 0 || f.lifetimeSaving <= 0) {
      emptyNote(ctx, 'Enter capacity, generation and cost inputs to see the payback projection.');
      return;
    }
    const pad = { l: 58, r: 18, t: 26, b: 30 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const years = s.years.length;
    const maxY = niceCeil(Math.max(s.cumSaving[years - 1], f.netInvestment) * 1.06);
    const X = (i) => pad.l + (iw * i) / (years - 1);
    const Y = (v) => pad.t + ih - (ih * v) / maxY;

    /* grid + y labels */
    ctx.font = '500 10px ' + FONT;
    ctx.fillStyle = TEXT;
    ctx.textAlign = 'right';
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (maxY / ticks) * i;
      const y = Y(v) + 3;
      ctx.strokeStyle = GRID; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
      ctx.fillText(shortINR(v), pad.l - 8, y);
    }
    /* x labels */
    ctx.textAlign = 'center';
    for (let yv = 0; yv <= years; yv += 5) {
      if (yv === years && yv > 0) {
        /* keep the final label inside the canvas */
        ctx.textAlign = 'right';
        ctx.fillText('Yr ' + yv, X(yv) + 2, H - 10);
        ctx.textAlign = 'center';
      } else {
        ctx.fillText('Yr ' + yv, X(yv), H - 10);
      }
    }

    /* area under cumulative savings */
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
    grad.addColorStop(0, 'rgba(242,129,29,0.22)');
    grad.addColorStop(1, 'rgba(242,129,29,0.02)');
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    s.cumSaving.forEach((v, i) => ctx.lineTo(X(i), Y(v)));
    ctx.lineTo(X(years - 1), Y(0));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    /* net investment reference line (label right-aligned, clear of the curve) */
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = NAVY_SOFT; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(pad.l, Y(f.netInvestment)); ctx.lineTo(W - pad.r, Y(f.netInvestment)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = '700 10px ' + FONT;
    ctx.fillStyle = NAVY;
    ctx.textAlign = 'right';
    ctx.fillText('Net investment ' + shortINR(f.netInvestment), W - pad.r - 4, Y(f.netInvestment) - 6);

    /* cumulative savings line */
    ctx.strokeStyle = ORANGE; ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    s.cumSaving.forEach((v, i) => { if (i === 0) ctx.moveTo(X(i), Y(v)); else ctx.lineTo(X(i), Y(v)); });
    ctx.stroke();

    /* payback marker */
    if (isFinite(f.payback) && f.payback <= years) {
      const px = X(f.payback), py = Y(f.netInvestment);
      ctx.setLineDash([3, 4]);
      ctx.strokeStyle = ORANGE_DARK; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, pad.t + ih); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = ORANGE_DARK; ctx.lineWidth = 2.4; ctx.stroke();
      /* marker label — flip above the point when it sits near the x-axis */
      const label = 'Payback — Year ' + f.payback.toFixed(1);
      ctx.font = '700 10.5px ' + FONT_DISPLAY;
      const tw = ctx.measureText(label).width;
      const lx = Math.min(Math.max(px - tw / 2, pad.l), W - pad.r - tw);
      const below = py < pad.t + ih - 46; /* enough room below? */
      const by = below ? py + 10 : py - 27;
      ctx.fillStyle = ORANGE_DARK;
      roundRect(ctx, lx - 6, by, tw + 12, 17, 8);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.fillText(label, lx, by + 12.5);
    }

    /* legend */
    ctx.textAlign = 'left';
    ctx.font = '600 10px ' + FONT;
    const ly = 14;
    ctx.fillStyle = ORANGE; roundRect(ctx, W - pad.r - 150, ly - 7, 10, 10, 2); ctx.fill();
    ctx.fillStyle = TEXT; ctx.fillText('Cumulative savings', W - pad.r - 136, ly + 1.5);
    ctx.fillStyle = NAVY_SOFT; ctx.fillRect(W - pad.r - 262, ly - 3, 14, 0);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = NAVY_SOFT; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(W - pad.r - 262, ly - 2); ctx.lineTo(W - pad.r - 248, ly - 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = TEXT; ctx.fillText('Investment', W - pad.r - 244, ly + 1.5);
  }

  /* ------------------------------------------------------------------ */
  /* 2. Annual savings bars                                              */
  /* ------------------------------------------------------------------ */
  function annual(canvas, f) {
    if (!canvas) return;
    const W = canvas.clientWidth || 700, H = canvas.clientHeight || 210;
    const ctx = setup(canvas, W, H);
    const s = f.series;
    if (!s || f.annualSaving <= 0) {
      emptyNote(ctx, 'Enter capacity, generation and tariff inputs to see annual savings.');
      return;
    }
    const pad = { l: 56, r: 14, t: 24, b: 26 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const n = s.years.length;
    const maxY = niceCeil(s.saving[n - 1] * 1.12);
    const slot = iw / n;
    const bw = Math.min(slot * 0.62, 18);

    /* grid */
    ctx.font = '500 10px ' + FONT;
    ctx.textAlign = 'right';
    const ticks = 3;
    for (let i = 0; i <= ticks; i++) {
      const v = (maxY / ticks) * i;
      const y = pad.t + ih - (ih * v) / maxY;
      ctx.strokeStyle = GRID; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillStyle = TEXT;
      ctx.fillText(shortINR(v), pad.l - 8, y + 3);
    }

    /* bars */
    for (let i = 0; i < n; i++) {
      const x = pad.l + slot * i + (slot - bw) / 2;
      const h = (ih * s.saving[i]) / maxY;
      const y = pad.t + ih - h;
      const g = ctx.createLinearGradient(0, y, 0, pad.t + ih);
      g.addColorStop(0, ORANGE);
      g.addColorStop(1, '#F7A45C');
      ctx.fillStyle = (i === 0 || i === n - 1) ? ORANGE_DARK : g;
      roundRect(ctx, x, y, bw, Math.max(h, 1.5), Math.min(3, bw / 2));
      ctx.fill();
      if (i === 0 || i === n - 1) {
        ctx.fillStyle = NAVY;
        ctx.font = '700 10px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText(shortINR(s.saving[i]), x + bw / 2, y - 5);
      }
    }
    /* x labels */
    ctx.fillStyle = TEXT;
    ctx.font = '500 10px ' + FONT;
    ctx.textAlign = 'center';
    for (let yv = 1; yv <= n; yv += 6) {
      ctx.fillText('Yr ' + yv, pad.l + slot * (yv - 1) + slot / 2, H - 8);
    }
    ctx.fillText('Yr ' + n, pad.l + slot * (n - 1) + slot / 2, H - 8);
  }

  /* ------------------------------------------------------------------ */
  /* 3. Cost build-up bridge                                             */
  /* ------------------------------------------------------------------ */
  function bridge(canvas, f) {
    if (!canvas) return;
    const W = canvas.clientWidth || 700, H = canvas.clientHeight || 230;
    const ctx = setup(canvas, W, H);
    if (f.projectCost <= 0) {
      emptyNote(ctx, 'Enter the project cost inputs to see the cost build-up.');
      return;
    }
    const steps = [
      { label: 'Project Cost', v: f.projectCost, color: NAVY, sub: 'excl. GST' },
      { label: '+ GST', v: f.gstAmount, color: NAVY_SOFT, sub: f._gstPercent + '%', start: f.projectCost },
      { label: '− Subsidy', v: -f.subsidy, color: GREEN, sub: f.subsidy > 0 ? 'PM Surya Ghar' : '—', start: f.grossTotal },
      { label: 'Net Payable', v: f.netInvestment, color: ORANGE, sub: 'your investment', total: true }
    ];
    const pad = { l: 16, r: 16, t: 30, b: 34 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const maxY = niceCeil(f.grossTotal * 1.08);
    const slot = iw / steps.length;
    const bw = Math.min(slot * 0.5, 86);

    ctx.font = '500 10px ' + FONT;
    const ticks = 3;
    for (let i = 0; i <= ticks; i++) {
      const v = (maxY / ticks) * i;
      const y = pad.t + ih - (ih * v) / maxY;
      ctx.strokeStyle = GRID;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillStyle = TEXT; ctx.textAlign = 'left';
      ctx.fillText(shortINR(v), pad.l + 2, y - 4);
    }

    let runTop = 0;
    steps.forEach((st, i) => {
      const x = pad.l + slot * i + (slot - bw) / 2;
      let y0, y1;
      if (st.total) {
        y1 = pad.t + ih; y0 = y1 - (ih * st.v) / maxY;
      } else if (i === 0) {
        y0 = pad.t + ih - (ih * st.v) / maxY; y1 = pad.t + ih;
      } else {
        y0 = pad.t + ih - (ih * (st.start + st.v)) / maxY;
        y1 = pad.t + ih - (ih * st.start) / maxY;
      }
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, st.color);
      g.addColorStop(1, st.total ? ORANGE_DARK : shade(st.color));
      ctx.fillStyle = g;
      roundRect(ctx, x, y0, bw, Math.max(y1 - y0, 2), 4);
      ctx.fill();

      /* connector to next bar */
      if (i < steps.length - 1) {
        runTop = i === 0 ? y0 : (st.v >= 0 ? y0 : y1);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#C4CBD4';
        ctx.beginPath();
        ctx.moveTo(x + bw, i === 0 ? y0 : (st.v >= 0 ? y0 : y1));
        ctx.lineTo(x + slot + (slot - bw) / 2, i === 0 ? y0 : (st.v >= 0 ? y0 : y1));
        ctx.stroke();
        ctx.setLineDash([]);
      }

      /* value + labels */
      ctx.textAlign = 'center';
      ctx.fillStyle = NAVY;
      ctx.font = '700 11px ' + FONT_DISPLAY;
      const valText = (st.v < 0 ? '− ' : '') + shortINR(Math.abs(st.v));
      ctx.fillText(valText, x + bw / 2, y0 - 7);
      ctx.fillStyle = TEXT;
      ctx.font = '600 10.5px ' + FONT;
      ctx.fillText(st.label, x + bw / 2, pad.t + ih + 15);
      ctx.font = '500 9px ' + FONT;
      ctx.fillStyle = '#8A93A0';
      ctx.fillText(st.sub, x + bw / 2, pad.t + ih + 27);
    });
  }
  function shade(hex) {
    /* slightly lighter variant for gradient bottom */
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (n >> 16) + 30), g = Math.min(255, ((n >> 8) & 255) + 30), b = Math.min(255, (n & 255) + 30);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  /* ------------------------------------------------------------------ */
  /* 4. BOM composition donut                                            */
  /* ------------------------------------------------------------------ */
  const DONUT_COLORS = ['#F2811D', '#1C2B3F', '#F7A45C', '#D96A0E', '#5B6B80', '#8FA1B5', '#3E5470', '#C4CBD4'];
  function donut(canvas, items, total) {
    if (!canvas) return;
    const W = canvas.clientWidth || 240, H = canvas.clientHeight || 240;
    const ctx = setup(canvas, W, H);
    items = (items || []).filter((it) => it.value > 0);
    if (!items.length || total <= 0) {
      emptyNote(ctx, 'Enter BOM amounts to see the cost composition.');
      return;
    }
    const cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 12, rIn = r * 0.62;
    let a = -Math.PI / 2;
    items.forEach((it, i) => {
      const frac = it.value / total;
      const a2 = a + frac * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + rIn * Math.cos(a), cy + rIn * Math.sin(a));
      ctx.arc(cx, cy, r, a, a2);
      ctx.arc(cx, cy, rIn, a2, a, true);
      ctx.closePath();
      ctx.fillStyle = DONUT_COLORS[i % DONUT_COLORS.length];
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
      a = a2;
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = NAVY;
    ctx.font = '800 15px ' + FONT_DISPLAY;
    ctx.fillText(shortINR(total), cx, cy - 1);
    ctx.fillStyle = TEXT;
    ctx.font = '600 9px ' + FONT;
    ctx.fillText('PROJECT COST', cx, cy + 13);
  }

  /* ------------------------------------------------------------------ */
  /* 5. System options comparison (grouped bars)                         */
  /* ------------------------------------------------------------------ */
  function options(canvas, list) {
    if (!canvas) return;
    const W = canvas.clientWidth || 700, H = canvas.clientHeight || 200;
    const ctx = setup(canvas, W, H);
    list = (list || []).filter((o) => o.kwp > 0);
    if (!list.length) { emptyNote(ctx, 'Enter option capacities to compare them here.'); return; }
    const pad = { l: 56, r: 12, t: 30, b: 32 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const maxV = niceCeil(Math.max.apply(null,
      list.map((o) => Math.max(o.f.lifetimeSaving, o.f.netInvestment))) * 1.08);
    ctx.font = '500 10px ' + FONT;
    const ticks = 3;
    for (let i = 0; i <= ticks; i++) {
      const v = (maxV / ticks) * i;
      const y = pad.t + ih - (ih * v) / maxV;
      ctx.strokeStyle = GRID; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
      ctx.fillStyle = TEXT; ctx.textAlign = 'right';
      ctx.fillText(shortINR(v), pad.l - 8, y + 3);
    }
    const slot = iw / list.length;
    const bw = Math.min(slot * 0.26, 52);
    list.forEach((o, i) => {
      const cx = pad.l + slot * i + slot / 2;
      const draw = (v, x, color) => {
        const h = (ih * v) / maxV;
        const y = pad.t + ih - h;
        ctx.fillStyle = color;
        roundRect(ctx, x, y, Math.max(h, 2) > 0 ? bw : bw, Math.max(h, 2), 3);
        ctx.fill();
        ctx.fillStyle = NAVY; ctx.font = '700 9.5px ' + FONT; ctx.textAlign = 'center';
        ctx.fillText(shortINR(v), x + bw / 2, y - 5);
      };
      draw(o.f.netInvestment, cx - bw - 3, NAVY);
      draw(o.f.lifetimeSaving, cx + 3, ORANGE);
      ctx.fillStyle = TEXT; ctx.font = '600 10px ' + FONT; ctx.textAlign = 'center';
      const nm = o.name + ' \u2014 ' + o.kwp + ' kWp';
      if (ctx.measureText(nm).width > slot - 6) {
        ctx.fillText(o.name, cx, pad.t + ih + 15);
        ctx.font = '500 9px ' + FONT;
        ctx.fillText(o.kwp + ' kWp', cx, pad.t + ih + 26);
      } else {
        ctx.fillText(nm, cx, pad.t + ih + 17);
      }
    });
    /* legend */
    ctx.font = '600 10px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillStyle = NAVY; ctx.fillRect(pad.l + 2, 15, 10, 10);
    ctx.fillStyle = TEXT; ctx.fillText('Net investment', pad.l + 17, 23.5);
    ctx.fillStyle = ORANGE; ctx.fillRect(pad.l + 118, 15, 10, 10);
    ctx.fillStyle = TEXT; ctx.fillText('25-year savings', pad.l + 133, 23.5);
  }

  /* ------------------------------------------------------------------ */
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  root.Charts = { cumulative, annual, bridge, donut, options, shortINR };
})(typeof self !== 'undefined' ? self : this);
