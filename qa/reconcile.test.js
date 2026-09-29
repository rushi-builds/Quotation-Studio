/* ==========================================================================
   Reconcile - independent recomputation of every engine output
   --------------------------------------------------------------------------
   finance.js is never trusted here. Every figure is recomputed from first
   principles with deliberately DIFFERENT methods:

     module count   ratio rounded, then ceil      (engine: epsilon-guarded ceil)
     subsidy        marginal-rate integration     (engine: slab piecewise)
     projection     closed-form geometric sums    (engine: iterative multiply)
     IRR            high-precision bisection      (engine: NPV early-exit)
     EMI            full amortisation schedule    (engine: closed form)
     payback        month-by-month simulation      (engine: curve interpolation)

   A change that moves any customer-facing number fails here even when it
   looks harmless. Numbers are hardcoded only where they come from an outside
   source (CEA, MNRE, the GST composite rule) or from the printed hand
   calculation at the end of this file.

   Run: node qa/reconcile.test.js
   ========================================================================== */
'use strict';
const assert = require('node:assert/strict');
const F = require('../assets/js/finance');

const YEARS = 25;
let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ FAIL: ' + name + ' → ' + e.message); }
}
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= (tol === undefined ? Math.max(1e-9, Math.abs(b) * 1e-9) : tol),
  a + ' ≠ ' + b);

/* ================================================================== model ===
   Independent recomputation. Deliberately shares no helper with finance.js. */
function independent(s) {
  const n = (v, d) => { const x = parseFloat(v); return Number.isFinite(x) ? x : (d === undefined ? 0 : d); };

  const cap = n(s.capacity);
  const W = n(s.moduleWattage);
  const genFactor = n(s.genFactor);
  const rate = n(s.costPerKwp);
  const gstPct = n(s.gstPercent);
  const tariff = n(s.tariff);
  const esc = n(s.escalation) / 100;
  const deg = n(s.degradation) / 100;
  /* Blank or zero means "derive it" - finance.js asks engineering.js for the
     row pitch when that module is present, and falls back to 1.4 without it.
     Any positive value is a deliberate manual override, clamped to at least
     the bare module area. */
  const clearance = Math.max(1, n(s.roofClearanceFactor, 1.4));

  /* ratio rounded to 6 dp then ceil: neutralises the same binary round-off the
     engine handles with an epsilon, by a different route (8175.0000000000007
     / 545 must read as 15 modules, not 16). */
  let count = 0;
  if (W > 0 && cap > 0) count = Math.ceil(Math.round(((cap * 1000) / W) * 1e6) / 1e6);
  const installed = (W > 0 && count > 0) ? (count * W) / 1000 : cap;

  const areaEach = (n(s.moduleLengthMm) / 1000) * (n(s.moduleWidthMm) / 1000);
  const arrayArea = (count > 0 && areaEach > 0) ? count * areaEach : 0;

  const inverter = n(s.inverterKw) || (cap > 0 ? cap : 0);
  const dcac = (installed > 0 && inverter > 0) ? installed / inverter : 0;

  const cost = cap * rate;
  const gst = cost * gstPct / 100;
  const gross = cost + gst;

  const raw = (v) => (v === '' || v === null || v === undefined) ? NaN : parseFloat(v);
  const override = raw(s.subsidyOverride);
  const type = s.customerType || 'residential';
  let subsidy;
  if (Number.isFinite(override)) subsidy = override;
  else if (type !== 'residential' || !(installed > 0)) subsidy = 0;
  else {
    /* integrate the marginal slabs instead of branching on capacity */
    let acc = 30000 * Math.min(installed, 2);
    if (installed > 2) acc += 18000 * Math.min(installed - 2, 1);
    subsidy = Math.min(acc, 78000);
  }
  const net = gross - subsidy;

  const bom = {
    modules: n(s.bomModules), inverter: n(s.bomInverter), structure: n(s.bomStructure),
    bos: n(s.bomBos), install: n(s.bomInstall), liaison: n(s.bomLiaison)
  };
  const bomSum = Object.values(bom).filter((v) => v > 0).reduce((a, b) => a + b, 0);

  const annualGen = installed * genFactor;
  const gen = [], tar = [], sav = [], cum = [];
  let running = 0;
  for (let y = 0; y < YEARS; y++) {
    const g = annualGen * Math.pow(1 - deg, y);
    const t = tariff * Math.pow(1 + esc, y);
    running += g * t;
    gen.push(g); tar.push(t); sav.push(g * t); cum.push(running);
  }
  const lifetimeSaving = running;
  const lifetimeGen = gen.reduce((a, b) => a + b, 0);

  let payback = NaN;
  if (sav[0] > 0 && net > 0) {
    for (let y = 0; y < YEARS; y++) {
      const before = y === 0 ? 0 : cum[y - 1];
      if (cum[y] >= net) { payback = y + (net - before) / (cum[y] - before); break; }
    }
  }
  /* second opinion: monthly walk, used to confirm the interpolated answer */
  let simMonth = NaN, acc2 = 0;
  for (let m = 0; m < YEARS * 12; m++) {
    acc2 += (annualGen * Math.pow(1 - deg, m / 12) * tariff * Math.pow(1 + esc, m / 12)) / 12;
    if (acc2 >= net) { simMonth = (m + 1) / 12; break; }
  }

  const co2 = Math.max(0, n(s.co2Factor, 0.71));
  const tree = Math.max(0, n(s.treeFactor, 22));
  const bill = Math.max(0, n(s.monthlyBill));
  const y1 = sav[0] || 0;

  const dep = Math.min(100, Math.max(0, n(s.depreciationRate, 40)));
  const ctr = Math.min(100, Math.max(0, n(s.corpTaxRate, 25)));
  const isCorp = (type === 'commercial' || type === 'industrial');

  return {
    cap, count, installed, arrayArea, requiredArea: arrayArea * clearance, clearance,
    inverter, dcac, cost, gst, gross, subsidy, net, bomSum, bomDelta: cost - bomSum,
    subsidyAuto: (type === 'residential' && !Number.isFinite(override)),
    costPerWp: cap > 0 ? cost / (cap * 1000) : 0,
    costPerWpDelivered: installed > 0 ? cost / (installed * 1000) : 0,
    annualGen, y1, gen, tar, sav, cum, lifetimeSaving, lifetimeGen, payback, simMonth,
    effectivePerUnit: lifetimeGen > 0 ? net / lifetimeGen : 0,
    co2Annual: annualGen * co2 / 1000,
    co2Lifetime: lifetimeGen * co2 / 1000,
    treesAnnual: tree > 0 ? (annualGen * co2) / tree : NaN,
    treesLifetime: tree > 0 ? (lifetimeGen * co2) / tree : NaN,
    billOffset: (bill > 0 && y1 > 0) ? (y1 / (bill * 12)) * 100 : 0,
    monthlyBillSaving: Math.min(bill, Math.max(0, y1 / 12)),
    unitsPerKwpDay: genFactor > 0 ? genFactor / 365 : 0,
    cufPercent: genFactor > 0 ? (genFactor / 8760) * 100 : 0,
    taxDep: isCorp ? Math.round(Math.max(0, cost) * dep / 100) : 0,
    taxShield: isCorp ? Math.round(Math.round(Math.max(0, cost) * dep / 100) * ctr / 100) : 0
  };
}

/* ---------------------------------------------------------------- compare ---
   Runs both models and asserts they agree on every returned field. */
function agree(label, s) {
  const f = F.compute(s);
  const m = independent(s);
  const p = (t) => label + ' · ' + t;
  const exact = (a, b) => assert.equal(a, b);

  /* engineering */
  exact(f.moduleCount, m.count);
  near(f.installedKwp, m.installed);
  exact(f.contractedKwp, m.cap);
  exact(f.capacityExact, Math.abs(m.installed - m.cap) < 1e-9 && m.installed > 0);
  near(f.arrayArea, m.arrayArea);
  near(f.requiredArea, m.requiredArea);
  near(f.roofClearanceFactor, m.clearance);
  near(f.inverterKw, m.inverter);
  near(f.dcAcRatio, m.dcac);

  /* costs */
  near(f.projectCost, m.cost);
  near(f.gstAmount, m.gst);
  near(f.grossTotal, m.gross);
  near(f.subsidy, m.subsidy);
  near(f.netInvestment, m.net);
  near(f.costPerWp, m.costPerWp);
  near(f.costPerWpDelivered, m.costPerWpDelivered);
  exact(f.subsidyAuto, m.subsidyAuto);
  near(f.bomSum, m.bomSum);
  near(f.bomDelta, m.bomDelta);
  near(f.taxDepreciationYear1, m.taxDep);
  near(f.taxShield, m.taxShield);

  /* performance */
  near(f.annualGen, m.annualGen);
  near(f.annualSaving, m.y1);
  near(f.unitsPerKwpDay, m.unitsPerKwpDay);
  near(f.cufPercent, m.cufPercent);
  near(f.lifetimeSaving, m.lifetimeSaving);
  near(f.lifetimeGen, m.lifetimeGen);
  near(f.effectivePerUnit, m.effectivePerUnit);

  /* the whole 25-year series, term by term */
  for (let y = 0; y < YEARS; y++) {
    const tag = p('year ' + (y + 1));
    assert.ok(Math.abs(f.series.gen[y] - m.gen[y]) <= Math.max(1e-6, Math.abs(m.gen[y]) * 1e-9), tag + ' generation');
    assert.ok(Math.abs(f.series.tariff[y] - m.tar[y]) <= Math.max(1e-12, Math.abs(m.tar[y]) * 1e-9), tag + ' tariff');
    assert.ok(Math.abs(f.series.saving[y] - m.sav[y]) <= Math.max(1e-6, Math.abs(m.sav[y]) * 1e-9), tag + ' saving');
    assert.ok(Math.abs(f.series.cumSaving[y] - m.cum[y]) <= Math.max(1e-6, Math.abs(m.cum[y]) * 1e-9), tag + ' cumulative');
  }

  /* payback */
  if (Number.isNaN(m.payback)) assert.ok(!Number.isFinite(f.payback), p('payback undefined'));
  else {
    near(f.payback, m.payback);
    if (Number.isFinite(m.simMonth) && m.simMonth > 1) {
      near(f.payback, m.simMonth, 0.15); /* monthly simulation agrees within tolerance */
    }
  }

  /* IRR, proven by the residual NPV rather than by trusting the return value */
  const flows = [-f.netInvestment].concat(f.series.saving);
  if (Number.isFinite(f.irr)) {
    let npv = 0;
    for (let i = 0; i < flows.length; i++) npv += flows[i] / Math.pow(1 + f.irr / 100, i);
    assert.ok(Math.abs(npv) <= Math.max(1, Math.abs(f.netInvestment) * 1e-6), p('IRR residual NPV') + ' = ' + npv);
  }

  /* environment */
  near(f.co2Annual, m.co2Annual);
  near(f.co2Lifetime, m.co2Lifetime);
  if (Number.isNaN(m.treesAnnual)) assert.ok(Number.isNaN(f.treesAnnual), p('treesAnnual undefined'));
  else near(f.treesAnnual, m.treesAnnual);
  if (Number.isNaN(m.treesLifetime)) assert.ok(Number.isNaN(f.treesLifetime), p('treesLifetime undefined'));
  else near(f.treesLifetime, m.treesLifetime);

  /* billing */
  near(f.monthlyBillSaving, m.monthlyBillSaving);
  near(f.monthlyBillAfter, Math.max(0, parseFloat(s.monthlyBill) || 0) - m.monthlyBillSaving);
  near(f.billOffset, m.billOffset);
  assert.ok(f.billOffsetCapped <= 100, p('billOffsetCapped ≤ 100'));

  /* payments */
  const pa = parseFloat(s.payAdvance) || 0, pd = parseFloat(s.payDispatch) || 0, pc = parseFloat(s.payCompletion) || 0;
  near(f.pay.advance.amount, m.gross * pa / 100);
  near(f.pay.dispatch.amount, m.gross * pd / 100);
  near(f.pay.completion.amount, m.gross * pc / 100);
  near(f.pay.sumPct, pa + pd + pc);
  if (pa + pd + pc === 100) {
    near(f.pay.advance.amount + f.pay.dispatch.amount + f.pay.completion.amount, m.gross, 1e-6);
  }

  return { f, m };
}

/* ================================================================ scenarios */
const BASE = {
  genFactor: '1460', costPerKwp: '90000', gstPercent: '8.9',
  tariff: '10', escalation: '4', degradation: '0.5',
  moduleWattage: '545', moduleLengthMm: '2278', moduleWidthMm: '1134',
  roofClearanceFactor: '1.4',
  payAdvance: '50', payDispatch: '40', payCompletion: '10',
  customerType: 'residential'
};
const withBase = (over) => Object.assign({}, BASE, over);

console.log('- Reconcile: capacity sweep (1 → 500 kWp at 545 Wp) -');
for (const cap of [1, 2, 2.5, 3, 5, 7, 8.175, 10, 15, 20, 25, 50, 100, 250, 500]) {
  check(cap + ' kWp reproduces independently', () => agree(cap + ' kWp', withBase({ capacity: String(cap) })));
}

console.log('- Reconcile: module wattage sweep (10 kWp) -');
for (const W of [400, 440, 500, 545, 550, 585, 600, 620, 700]) {
  check('10 kWp at ' + W + ' Wp reproduces independently', () => agree(String(W) + ' Wp', withBase({ capacity: '10', moduleWattage: String(W) })));
}

console.log('- Reconcile: subsidy, tax and connection-type edges -');
const EDGES = [
  ['1 kWp residential', { capacity: '1' }],
  ['2 kWp residential (slab step)', { capacity: '2' }],
  ['2.5 kWp residential (mid 3rd kW)', { capacity: '2.5' }],
  ['3 kWp residential (cap reached)', { capacity: '3' }],
  ['5 kWp residential (capped)', { capacity: '5' }],
  ['25 kWp commercial', { capacity: '25', customerType: 'commercial', corpTaxRate: '25', depreciationRate: '40' }],
  ['100 kWp industrial', { capacity: '100', customerType: 'industrial', corpTaxRate: '30', depreciationRate: '40' }],
  ['residential override ₹50,000', { capacity: '5', subsidyOverride: '50000' }],
  ['commercial override ₹1,00,000', { capacity: '10', customerType: 'commercial', subsidyOverride: '100000' }],
  ['explicit override of zero', { capacity: '3', subsidyOverride: '0' }],
  ['exact boundary 8.175 kWp', { capacity: '8.175' }],
  ['exact boundary 3 kWp at 600 Wp', { capacity: '3', moduleWattage: '600' }],
  ['no module wattage entered', { capacity: '7', moduleWattage: '0', moduleLengthMm: '0', moduleWidthMm: '0' }],
  ['explicit 8 kW inverter', { capacity: '10', inverterKw: '8' }],
  ['flush-mount 1.1× clearance', { capacity: '7', roofClearanceFactor: '1.1' }],
  ['wide-spacing 2.0× clearance', { capacity: '7', roofClearanceFactor: '2.0' }],
  ['clearance below 1 is clamped', { capacity: '7', roofClearanceFactor: '0.5' }],
  ['monthly bill entered', { capacity: '7', monthlyBill: '12000' }],
  ['BOM fully entered', { capacity: '7', bomModules: '300000', bomInverter: '80000', bomStructure: '70000', bomBos: '60000', bomInstall: '90000', bomLiaison: '30000' }],
  ['zero tree factor', { capacity: '7', treeFactor: '0' }],
  ['zero CO₂ factor', { capacity: '7', co2Factor: '0' }],
  ['zero capacity', { capacity: '0' }],
  ['zero tariff', { capacity: '7', tariff: '0' }],
  ['zero cost per kWp', { capacity: '7', costPerKwp: '0' }],
  ['negative tariff clamps at zero savings', { capacity: '7', tariff: '-5' }]
];
for (const [label, over] of EDGES) {
  check(label + ' reproduces independently', () => agree(label, withBase(over)));
}

console.log('- Reconcile: undefined results are never fabricated -');
check('zero tariff leaves IRR undefined rather than a fabricated percentage', () => {
  assert.ok(Number.isNaN(F.compute(withBase({ capacity: '7', tariff: '0' })).irr));
});
check('zero investment leaves IRR undefined', () => {
  assert.ok(Number.isNaN(F.compute(withBase({ capacity: '7', costPerKwp: '0' })).irr));
});
check('zero tree absorption does not invent a divisor', () => {
  assert.ok(Number.isNaN(F.compute(withBase({ capacity: '7', treeFactor: '0' })).treesAnnual));
});
check('empty state produces no NaN in the economics that should exist', () => {
  const f = F.compute({});
  for (const k of ['projectCost', 'gstAmount', 'grossTotal', 'subsidy', 'netInvestment', 'annualGen', 'annualSaving', 'lifetimeSaving', 'co2Annual']) {
    assert.ok(Number.isFinite(f[k]), k + ' must be finite, got ' + f[k]);
  }
  assert.ok(!Number.isFinite(f.payback), 'payback must stay undefined with no cost');
});

console.log('- Reconcile: financing and EMI -');
for (const [label, loan] of [
  ['₹5,00,000 @ 9 % / 10 yr', { loanAmt: '500000', loanRate: '9', loanYears: '10' }],
  ['₹9,00,000 @ 11 % / 5 yr', { loanAmt: '900000', loanRate: '11', loanYears: '5' }],
  ['₹12,00,000 @ 8.25 % / 15 yr', { loanAmt: '1200000', loanRate: '8.25', loanYears: '15' }],
  ['₹2,00,000 @ 12 % / 3 yr', { loanAmt: '200000', loanRate: '12', loanYears: '3' }]
]) {
  check(label + ' · EMI matches a full amortisation schedule', () => {
    const s = withBase({ capacity: '10' }, loan);
    const f = F.compute(Object.assign({}, withBase({ capacity: '10' }), loan));
    const fin = f.financing;
    assert.ok(fin, 'financing must exist when all three inputs are present');
    const P = parseFloat(loan.loanAmt), r = parseFloat(loan.loanRate) / 1200;
    const n = Math.round(parseFloat(loan.loanYears) * 12);
    const emi = P * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
    near(fin.emi, emi, 1e-6);
    near(fin.totalInterest, emi * n - P, 1e-6);
    assert.equal(fin.months, n);
    assert.equal(fin.monthlySavings.length, n);
    /* walk the schedule: interest each month, principal reduces, closes to 0 */
    let balance = P;
    for (let i = 0; i < n; i++) balance = balance + balance * r - emi;
    near(balance, 0, Math.max(1, P * 1e-6));
    assert.ok(fin.monthlySavings.every((v) => v >= 0), 'monthly savings cannot be negative');
    near(fin.netMonthlyY1, fin.monthlySavingY1 - fin.emi);
    assert.ok(Number.isNaN(fin.crossingMonth) || (fin.crossingMonth >= 1 && fin.crossingMonth <= n),
      'crossing month must fall inside the tenure');
  });
}
check('partial financing inputs produce no financing block', () => {
  assert.equal(F.compute(withBase({ capacity: '10', loanAmt: '500000', loanRate: '', loanYears: '10' })).financing, null);
  assert.equal(F.compute(withBase({ capacity: '10', loanAmt: '500000', loanRate: '0', loanYears: '10' })).financing, null);
});

console.log('- Reconcile: IRR agrees with a high-precision solve -');
for (const cap of [3, 7, 10, 25]) {
  check(cap + ' kWp IRR matches a 200-step bisection', () => {
    const f = F.compute(withBase({ capacity: String(cap) }));
    const flows = [-f.netInvestment].concat(f.series.saving);
    const npv = (r) => flows.reduce((v, c, i) => v + c / Math.pow(1 + r, i), 0);
    let lo = 1e-6, hi = 5;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
    /* the engine stops once |NPV| < ₹1, so allow a hair more than display precision */
    near(f.irr, lo * 100, 1e-3);
  });
}

console.log('- Reconcile: invariants that must hold for every capacity -');
const inv = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 30, 40, 50, 75, 100].map((c) => F.compute(withBase({ capacity: String(c) })));
check('installed capacity is never below the contracted figure', () => {
  inv.forEach((f, i) => assert.ok(f.installedKwp >= f.contractedKwp - 1e-9, 'failed at index ' + i));
});
check('installed capacity never exceeds the contract by one whole module', () => {
  inv.forEach((f, i) => assert.ok(f.installedKwp - f.contractedKwp < 0.545 + 1e-9, 'failed at index ' + i));
});
check('generation always equals installed array × generation factor', () => {
  inv.forEach((f, i) => near(f.annualGen, f.installedKwp * 1460, 1e-6));
});
check('subsidy stays inside ₹0 … ₹78,000', () => {
  inv.forEach((f, i) => assert.ok(f.subsidy >= 0 && f.subsidy <= 78000, 'failed at index ' + i));
});
check('net investment always equals gross total minus subsidy', () => {
  inv.forEach((f, i) => near(f.netInvestment, f.grossTotal - f.subsidy, 1e-6));
});
check('required roof area is never below bare module area', () => {
  inv.forEach((f, i) => assert.ok(f.requiredArea >= f.arrayArea - 1e-9, 'failed at index ' + i));
});
check('generation increases strictly with capacity', () => {
  for (let i = 1; i < inv.length; i++) assert.ok(inv[i].annualGen > inv[i - 1].annualGen, 'not increasing at ' + i);
});
check('payback never improves as capacity grows at a fixed ₹/kWp', () => {
  for (let i = 1; i < inv.length; i++) {
    assert.ok(inv[i].payback >= inv[i - 1].payback - 0.02, 'payback improved at index ' + i);
  }
});
check('capacity factor for 1460 kWh/kWp/yr stays between 10 % and 25 %', () => {
  inv.forEach((f, i) => assert.ok(f.cufPercent > 10 && f.cufPercent < 25, 'failed at index ' + i));
});

console.log('- Reconcile: defaults against published sources -');
check('GST default equals the 70:30 composite rule', () => {
  assert.equal(Math.round((0.7 * 5 + 0.3 * 18) * 10) / 10, 8.9);
});
check('grid CO₂ factor defaults to CEA v21.0 (0.710 tCO₂/MWh)', () => {
  assert.equal(F.compute({ capacity: 7, moduleWattage: 545 }).co2Factor, 0.71);
});
check('tree absorption defaults to 22 kg CO₂ per tree per year', () => {
  assert.equal(F.compute({ capacity: 7, moduleWattage: 545 }).treeFactor, 22);
});
check('roof clearance: derived when it can be, manual when typed, never below bare module area', () => {
  /* Without the geometry inputs (this process has no engineering.js) the old
     1.4 estimate still stands, and a typed factor still wins. */
  const plain = F.compute({ capacity: 7, moduleWattage: 545 });
  assert.equal(plain.roofClearanceFactor, 1.4);
  assert.equal(plain.clearanceSource, 'fallback');
  const manual = F.compute({ capacity: 7, moduleWattage: 545, roofClearanceFactor: '1.1' });
  assert.equal(manual.roofClearanceFactor, 1.1);
  assert.equal(manual.clearanceSource, 'manual');
  /* A zero is not a clearance factor anybody builds; the field's own min is 1,
     so it reads as "not set" rather than as an override. */
  assert.equal(F.compute({ capacity: 7, moduleWattage: 545, roofClearanceFactor: 0 }).clearanceSource, 'fallback');
  assert.ok(Math.ceil(plain.requiredArea) >= Math.ceil(plain.arrayArea));
});
check('PM Surya Ghar slabs and the ₹78,000 ceiling are unchanged', () => {
  assert.equal(F.SUBSIDY_MAX, 78000);
  assert.equal(F.calcSubsidy(0), 0);
  assert.equal(F.calcSubsidy(1), 30000);
  assert.equal(F.calcSubsidy(2), 60000);
  assert.equal(F.calcSubsidy(2.5), 69000);
  assert.equal(F.calcSubsidy(3), 78000);
  assert.equal(F.calcSubsidy(3.5), 78000);
  assert.equal(F.calcSubsidy(10), 78000);
  assert.equal(F.calcSubsidy(500), 78000);
});
check('projection horizon is 25 years', () => assert.equal(F.YEARS, 25));

console.log('- Reconcile: Indian formatting -');
check('currency groups in the Indian system', () => {
  assert.equal(F.fmtINR(1234567), '₹12,34,567');
  assert.equal(F.fmtINR(0), '₹0');
});
check('compact form picks lakh and crore correctly', () => {
  assert.equal(F.fmtINRshort(670000), '₹6.7 L');
  assert.equal(F.fmtINRshort(12400000), '₹1.24 Cr');
  assert.equal(F.fmtINRshort(8450), '₹8,450');
});
check('non-finite values render as a dash, never NaN or Infinity', () => {
  assert.equal(F.fmtINR(NaN), '-');
  assert.equal(F.fmtINR(Infinity), '-');
  assert.equal(F.fmtINRshort(NaN), '-');
  assert.equal(F.fmtNum(NaN), '-');
});
check('date ordinals handle 1st/2nd/3rd and the 11th–13th exceptions', () => {
  assert.equal(F.fmtDate('2026-09-19'), '19th September 2026');
  assert.equal(F.fmtDate('2026-05-01'), '1st May 2026');
  assert.equal(F.fmtDate('2026-05-02'), '2nd May 2026');
  assert.equal(F.fmtDate('2026-05-03'), '3rd May 2026');
  assert.equal(F.fmtDate('2026-05-11'), '11th May 2026');
  assert.equal(F.fmtDate('2026-05-12'), '12th May 2026');
  assert.equal(F.fmtDate('2026-05-13'), '13th May 2026');
  assert.equal(F.fmtDate('2026-05-21'), '21st May 2026');
});
check('addDays crosses months and years', () => {
  assert.equal(F.addDays('2026-09-19', 15), '2026-10-04');
  assert.equal(F.addDays('2026-12-25', 10), '2027-01-04');
  assert.equal(F.addDays('', 5), '');
});

/* ==========================================================================
   Printed hand calculation - 7 kWp at 545 Wp, shipping defaults.
   Every line below is arithmetic a reviewer can repeat on paper.
   ========================================================================== */
console.log('- Reconcile: printed hand calculation (7 kWp @ 545 Wp, shipped defaults) -');
check('the documented 7 kWp proposal reproduces line by line', () => {
  const f = F.compute({ capacity: 7, moduleWattage: 545, moduleLengthMm: 2278, moduleWidthMm: 1134, genFactor: 1460,
    costPerKwp: 90000, gstPercent: 8.9, tariff: 10, escalation: 4, degradation: 0.5,
    roofClearanceFactor: 1.4, customerType: 'residential',
    payAdvance: 50, payDispatch: 40, payCompletion: 10 });

  assert.equal(f.moduleCount, Math.ceil(7000 / 545));            /* 13 */
  assert.equal(f.moduleCount, 13);
  near(f.installedKwp, 13 * 545 / 1000);                          /* 7.085 */
  near(f.arrayArea, 13 * 2.278 * 1.134);                          /* 33.58 m² */
  near(f.requiredArea, 13 * 2.278 * 1.134 * 1.4);                 /* 47.02 m² */
  near(f.dcAcRatio, 7.085 / 7);                                   /* 1.012 */
  near(f.projectCost, 7 * 90000);                                 /* 6,30,000 */
  near(f.gstAmount, 630000 * 0.089);                              /* 56,070 */
  near(f.grossTotal, 630000 + 56070);                             /* 6,86,070 */
  assert.equal(f.subsidy, 78000);                                 /* capped slab */
  near(f.netInvestment, 686070 - 78000);                          /* 6,08,070 */
  near(f.costPerWp, 630000 / 7000);                               /* ₹90.00 */
  near(f.costPerWpDelivered, 630000 / 7085);                      /* ₹88.92 */
  near(f.annualGen, 7.085 * 1460);                                /* 10,344.1 kWh */
  near(f.annualSaving, 7.085 * 1460 * 10);                        /* 1,03,441 */
  near(f.series.gen[1], 7.085 * 1460 * 0.995);                    /* year 2 */
  near(f.series.tariff[1], 10 * 1.04);
  near(f.series.saving[1], 7.085 * 1460 * 0.995 * 10 * 1.04);
  near(f.series.gen[24], 7.085 * 1460 * Math.pow(0.995, 24));
  near(f.series.tariff[24], 10 * Math.pow(1.04, 24));
  /* closed-form geometric sum: Σ A·r^y with r = 0.995 × 1.04 */
  const A = 7.085 * 1460 * 10, r = 0.995 * 1.04;
  near(f.lifetimeSaving, A * (Math.pow(r, 25) - 1) / (r - 1));
  near(f.lifetimeGen, 7.085 * 1460 * (Math.pow(0.995, 25) - 1) / (0.995 - 1));
  near(f.co2Annual, 7.085 * 1460 * 0.71 / 1000);                  /* 7.344 t */
  near(f.treesAnnual, 7.085 * 1460 * 0.71 / 22);                  /* 334 trees */
  near(f.cufPercent, 1460 / 8760 * 100);                          /* 16.67 % */
  near(f.pay.advance.amount, 686070 * 0.5);
  near(f.pay.dispatch.amount, 686070 * 0.4);
  near(f.pay.completion.amount, 686070 * 0.1);
});

/* =================================================================== report */
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
