/* ==========================================================================
   Quotation Studio — Financial & Engineering Engine
   --------------------------------------------------------------------------
   Pure calculation layer. No DOM access. Every value returned is derived
   ONLY from the state passed in (form inputs) — nothing is invented here.

   State fields consumed (all optional-safe):
     capacity, genFactor, costPerKwp, gstPercent, tariff, escalation,
     degradation, subsidyOverride, customerType, monthlyBill,
     moduleWattage, moduleLengthMm, moduleWidthMm, inverterKw,
     payAdvance, payDispatch, payCompletion, co2Factor, treeFactor,
     bom { modules, inverter, structure, bos, install, liaison }
   ========================================================================== */
'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.Finance = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {

  const YEARS = 25;
  const PROJECTION_YEARS = 25; // horizon used for cash-flow projections

  /* ---------- number formatting helpers ---------- */
  function fmtINR(n) {
    if (!isFinite(n)) return '—';
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }
  /** Compact Indian format for tight tiles: ₹6.7L / ₹1.24Cr / ₹8,450 */
  function fmtINRshort(n) {
    if (!isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e7) return '₹' + trimDec(n / 1e7) + ' Cr';
    if (abs >= 1e5) return '₹' + trimDec(n / 1e5) + ' L';
    return fmtINR(n);
  }
  function trimDec(v) { v = Math.round(v * 100) / 100; return String(v); }
  function fmtNum(n) {
    if (!isFinite(n)) return '—';
    return Math.round(n).toLocaleString('en-IN');
  }
  function fmtDate(dstr) {
    if (!dstr) return '';
    const d = new Date(dstr + 'T00:00:00');
    if (isNaN(d)) return '';
    const day = d.getDate();
    const suf = (day % 10 === 1 && day !== 11) ? 'st'
      : (day % 10 === 2 && day !== 12) ? 'nd'
      : (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return day + suf + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }
  function addDays(dstr, days) {
    if (!dstr) return '';
    const d = new Date(dstr + 'T00:00:00');
    if (isNaN(d)) return '';
    d.setDate(d.getDate() + (parseInt(days, 10) || 0));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  /* ---------- engineering helpers ---------- */
  /** PM Surya Ghar subsidy slabs: ₹30,000/kW for first 2 kW, ₹18,000 for the
      3rd kW, capped at ₹78,000 for 3 kW and above. Residential only. */
  function calcSubsidy(kwp) {
    if (!isFinite(kwp) || kwp <= 0) return 0;
    if (kwp <= 2) return 30000 * kwp;
    if (kwp < 3) return 60000 + 18000 * (kwp - 2);
    return 78000;
  }
  const SUBSIDY_MAX = 78000;

  /** Internal rate of return via bisection (percent per annum). */
  function calcIRR(cashflows) {
    // Without an investment/outflow and a return/inflow, IRR is not defined.
    // More than one sign change can have multiple roots, not a unique IRR.
    if (!cashflows || cashflows.length < 2 || !cashflows.every(Number.isFinite)) return NaN;
    const signs = cashflows.filter(v => v !== 0).map(Math.sign);
    if (signs.filter((v, i) => i > 0 && v !== signs[i - 1]).length !== 1) return NaN;
    const npv = (rate) => {
      let v = 0;
      for (let i = 0; i < cashflows.length; i++) v += cashflows[i] / Math.pow(1 + rate, i);
      return v;
    };
    if (npv(0) === 0) return 0;
    let low = -0.95, high = 10, mid = 0;
    let lowValue = npv(low), highValue = npv(high);
    // Expand the bounds rather than returning an arbitrary boundary as IRR.
    if (Math.sign(lowValue) === Math.sign(highValue)) { low = -0.9999; lowValue = npv(low); }
    for (let i = 0; i < 20 && Math.sign(lowValue) === Math.sign(highValue); i++) {
      high *= 2; highValue = npv(high);
    }
    if (lowValue === 0) return low * 100;
    if (highValue === 0) return high * 100;
    if (!Number.isFinite(lowValue) || !Number.isFinite(highValue) || Math.sign(lowValue) === Math.sign(highValue)) return NaN;
    for (let i = 0; i < 200; i++) {
      mid = (low + high) / 2;
      const val = npv(mid);
      if (Math.abs(val) < 1) break;
      if (Math.sign(val) === Math.sign(lowValue)) { low = mid; lowValue = val; } else high = mid;
    }
    return mid * 100;
  }

  /* ---------- main engine ---------- */
  function compute(s) {
    s = s || {};
    const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : (d || 0); };

    const capacity = num(s.capacity);
    const genFactor = num(s.genFactor);
    const costPerKwp = num(s.costPerKwp);
    const gstPercent = num(s.gstPercent);
    const tariff = num(s.tariff);
    const escalation = num(s.escalation) / 100;
    const degradation = num(s.degradation) / 100;

    /* ----- system engineering (derived, traceable) ----- */
    const moduleWattage = num(s.moduleWattage) || 0;
    const requiredModules = (moduleWattage > 0 && capacity > 0)
      ? (capacity * 1000) / moduleWattage : 0;
    // Suppress only floating-point round-off at whole-module boundaries:
    // 8.175 kWp / 545 Wp can evaluate as 15.000000000000002 modules.
    // A real shortfall must still round UP to the next whole module.
    const moduleCount = Math.ceil(requiredModules - 2 * Number.EPSILON * requiredModules);
    const installedKwp = (moduleCount && moduleWattage)
      ? (moduleCount * moduleWattage) / 1000 : capacity;
    const moduleAreaEach = (num(s.moduleLengthMm) / 1000) * (num(s.moduleWidthMm) / 1000);
    const arrayArea = (moduleCount > 0 && moduleAreaEach > 0) ? moduleCount * moduleAreaEach : 0;
    const inverterKw = num(s.inverterKw) || (capacity > 0 ? capacity : 0);
    const dcAcRatio = (installedKwp > 0 && inverterKw > 0) ? installedKwp / inverterKw : 0;

    /* ----- costs ----- */
    const projectCost = capacity * costPerKwp;               // ex-GST
    const gstAmount = projectCost * gstPercent / 100;
    const grossTotal = projectCost + gstAmount;              // incl. GST

    const bom = s.bom || {
      modules: s.bomModules, inverter: s.bomInverter, structure: s.bomStructure,
      bos: s.bomBos, install: s.bomInstall, liaison: s.bomLiaison
    };
    const bomItems = [
      { key: 'modules',  label: 'Solar Modules',            value: num(bom.modules) },
      { key: 'inverter', label: 'Inverter(s)',              value: num(bom.inverter) },
      { key: 'structure', label: 'Mounting Structure',      value: num(bom.structure) },
      { key: 'bos',      label: 'BOS — Cables & Protection', value: num(bom.bos) },
      { key: 'install',  label: 'Installation & Commissioning', value: num(bom.install) },
      { key: 'liaison',  label: 'Net-Metering & Liaisoning', value: num(bom.liaison) }
    ].filter((it) => it.value > 0);
    const bomSum = bomItems.reduce((t, it) => t + it.value, 0);
    const bomDelta = projectCost - bomSum; // >0 means BOM does not yet cover the base cost

    /* ----- subsidy ----- */
    const customerType = s.customerType || 'residential';
    let subsidy;
    const overrideRaw = (s.subsidyOverride === '' || s.subsidyOverride === null ||
      s.subsidyOverride === undefined) ? NaN : parseFloat(s.subsidyOverride);
    if (isFinite(overrideRaw)) {
      subsidy = overrideRaw;                                   // explicit override wins
    } else if (customerType === 'residential') {
      subsidy = calcSubsidy(capacity);
    } else {
      subsidy = 0;                                             // PM Surya Ghar is residential
    }
    const subsidyAuto = (customerType === 'residential' && !isFinite(overrideRaw));
    const netInvestment = grossTotal - subsidy;
    const costPerWp = capacity > 0 ? projectCost / (capacity * 1000) : 0;

    /* Optional illustration only: eligibility, asset basis and first-year
       allowance must be confirmed by the customer's tax adviser. Never net
       this assumed shield off investment, payback or projected savings. */
    const isCommercialOrInd = (customerType === 'commercial' || customerType === 'industrial');
    const percent = (v, fallback) => Math.min(100, Math.max(0, num(v, fallback)));
    const corpTaxRatePct = percent(s.corpTaxRate, 25);
    const depreciationRatePct = percent(s.depreciationRate, 40);
    const taxDepreciationYear1 = isCommercialOrInd ? Math.round(Math.max(0, projectCost) * depreciationRatePct / 100) : 0;
    const taxShield = Math.round(taxDepreciationYear1 * corpTaxRatePct / 100);

    /* ----- generation & savings projection ----- */
    const annualGen = capacity * genFactor;                    // year-1 kWh
    let gen = annualGen, t = tariff;
    const series = {
      years: [], gen: [], tariff: [], saving: [], cumSaving: [], netPosition: []
    };
    let lifetimeSaving = 0, lifetimeGen = 0;
    const cashflows = [-netInvestment];
    for (let y = 1; y <= PROJECTION_YEARS; y++) {
      const yearSaving = gen * t;
      lifetimeSaving += yearSaving;
      lifetimeGen += gen;
      series.years.push(y);
      series.gen.push(gen);
      series.tariff.push(t);
      series.saving.push(yearSaving);
      series.cumSaving.push(lifetimeSaving);
      series.netPosition.push(lifetimeSaving - netInvestment);
      cashflows.push(yearSaving);
      gen *= (1 - degradation);
      t *= (1 + escalation);
    }

    /* payback: interpolated crossing of cumulative savings over net
       investment (uses the same escalated/degraded curve as the chart) */
    let payback = NaN;
    if (annualSaving0(series) > 0 && netInvestment > 0) {
      const cum = series.cumSaving;
      if (cum[0] >= netInvestment) {
        payback = netInvestment / cum[0];
      } else {
        for (let i = 1; i < cum.length; i++) {
          if (cum[i] >= netInvestment) {
            const lo = cum[i - 1], hi = cum[i];
            payback = i + (netInvestment - lo) / (hi - lo); // cum[i] is end of year i+1
            break;
          }
        }
      }
    }
    const annualSaving = series.saving[0] || 0;
    const irr = calcIRR(cashflows);

    /* bill offset (only when the customer's average bill is entered) */
    const monthlyBill = Math.max(0, num(s.monthlyBill));
    const monthlyBillSaving = Math.min(monthlyBill, Math.max(0, annualSaving / 12));
    const monthlyBillAfter = monthlyBill - monthlyBillSaving;
    const billOffset = (monthlyBill > 0 && annualSaving > 0)
      ? (annualSaving / (monthlyBill * 12)) * 100 : 0;
    const billOffsetCapped = Math.min(billOffset, 100);

    /* effective solar cost per unit over the 25-year life */
    const effectivePerUnit = lifetimeGen > 0 ? netInvestment / lifetimeGen : 0;

    /* ----- environmental equivalents (editable factors, stated on page) ----- */
    const co2Factor = Math.max(0, num(s.co2Factor, 0.79));          // kg CO₂ / kWh (grid)
    const treeFactor = Math.max(0, num(s.treeFactor, 58.4));        // kg CO₂ absorbed / tree / yr
    const co2Annual = (annualGen * co2Factor) / 1000;          // tonnes
    const co2Lifetime = (lifetimeGen * co2Factor) / 1000;
    const treesAnnual = treeFactor > 0 ? (co2Annual * 1000) / treeFactor : NaN;
    const treesLifetime = treeFactor > 0 ? (co2Lifetime * 1000) / treeFactor : NaN;

    /* ----- payment schedule (₹ against gross total incl. GST) ----- */
    const pay = {
      advance: { pct: num(s.payAdvance), amount: grossTotal * num(s.payAdvance) / 100 },
      dispatch: { pct: num(s.payDispatch), amount: grossTotal * num(s.payDispatch) / 100 },
      completion: { pct: num(s.payCompletion), amount: grossTotal * num(s.payCompletion) / 100 }
    };
    pay.sumPct = pay.advance.pct + pay.dispatch.pct + pay.completion.pct;

    /* ----- financing (EMI) — only when all three loan inputs are entered;
       standard reducing-balance formula, nothing else assumed ----- */
    const loanAmt = num(s.loanAmt);
    const loanRate = num(s.loanRate);
    const loanYears = num(s.loanYears);
    let financing = null;
    if (loanAmt > 0 && loanRate > 0 && loanYears > 0) {
      const r = loanRate / 1200;                    // monthly interest rate
      const n = Math.max(1, Math.round(loanYears * 12)); // tenure in months
      const pow = Math.pow(1 + r, n);
      const emi = loanAmt * r * pow / (pow - 1);    // reducing-balance EMI
      const totalPaid = emi * n;
      /* month-wise savings across the tenure (step-wise from yearly series) */
      const monthlySavings = [];
      for (let m = 0; m < n; m++) {
        const y = Math.min(Math.floor(m / 12), series.saving.length - 1);
        monthlySavings.push(series.saving[y] / 12);
      }
      let crossingMonth = NaN;                      // first month savings ≥ EMI
      for (let m = 0; m < n; m++) {
        if (monthlySavings[m] >= emi) { crossingMonth = m + 1; break; }
      }
      financing = {
        loan: loanAmt, ratePct: loanRate, years: loanYears, months: n,
        emi, totalPaid, totalInterest: totalPaid - loanAmt,
        monthlySavingY1: monthlySavings[0] || 0,
        netMonthlyY1: (monthlySavings[0] || 0) - emi,
        monthlySavings, crossingMonth
      };
    }

    return {
      // engineering
      capacity, moduleWattage, moduleCount, installedKwp, arrayArea,
      inverterKw, dcAcRatio,
      // costs
      projectCost, gstAmount, grossTotal, subsidy, subsidyAuto, netInvestment,
      costPerWp, bomItems, bomSum, bomDelta, gstPercent,
      taxDepreciationYear1, taxShield, corpTaxRatePct, depreciationRatePct, isCommercialOrInd,
      monthlyBillSaving, monthlyBillAfter,
      // performance
      annualGen, annualSaving, series, lifetimeSaving, lifetimeGen,
      payback, irr, effectivePerUnit,
      // environment
      co2Factor, treeFactor, co2Annual, co2Lifetime, treesAnnual, treesLifetime,
      // billing
      monthlyBill, billOffset, billOffsetCapped,
      // payments
      pay,
      financing,
      constants: { YEARS: PROJECTION_YEARS, SUBSIDY_MAX }
    };
  }

  /* tiny helper used before `series` exists in the payback block */
  function annualSaving0(series) { return series.saving[0] || 0; }

  return {
    YEARS, calcSubsidy, calcIRR, compute,
    fmtINR, fmtINRshort, fmtNum, fmtDate, addDays, SUBSIDY_MAX
  };
}));
