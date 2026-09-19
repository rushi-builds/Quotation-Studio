/* Unit tests for the Quotation Studio finance engine (run: node qa/finance.test.js) */
'use strict';
const F = require('../assets/js/finance.js');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name, extra !== undefined ? '→ ' + extra : ''); }
}

console.log('— Subsidy slabs (PM Surya Ghar) —');
t('1 kW → ₹30,000', F.calcSubsidy(1) === 30000);
t('2 kW → ₹60,000', F.calcSubsidy(2) === 60000);
t('2.5 kW → ₹69,000', F.calcSubsidy(2.5) === 69000);
t('3 kW → ₹78,000 (cap)', F.calcSubsidy(3) === 78000);
t('10 kW → ₹78,000 (cap)', F.calcSubsidy(10) === 78000);
t('0 kW → 0', F.calcSubsidy(0) === 0);

console.log('— Formatting —');
t('INR grouping', F.fmtINR(1234567) === '₹12,34,567', F.fmtINR(1234567));
t('short lakh', F.fmtINRshort(670000) === '₹6.7 L', F.fmtINRshort(670000));
t('short crore', F.fmtINRshort(12400000) === '₹1.24 Cr', F.fmtINRshort(12400000));
t('date', F.fmtDate('2026-09-19') === '19th September 2026', F.fmtDate('2026-09-19'));
t('addDays 15', F.addDays('2026-09-19', 15) === '2026-10-04', F.addDays('2026-09-19', 15));

console.log('— Core compute (7 kWp, ₹90k/kWp, 8.9% GST, ₹15 tariff) —');
const base = {
  capacity: 7, genFactor: 1460, costPerKwp: 90000, gstPercent: 8.9,
  tariff: 15, escalation: 6, degradation: 0.5, customerType: 'residential',
  moduleWattage: 545, moduleLengthMm: 2278, moduleWidthMm: 1134,
  payAdvance: 50, payDispatch: 40, payCompletion: 10, monthlyBill: ''
};
const f = F.compute(base);

t('projectCost = 7×90,000 = ₹6,30,000', f.projectCost === 630000);
t('gst = ₹56,070', Math.round(f.gstAmount) === 56070, f.gstAmount);
t('gross = ₹6,86,070', Math.round(f.grossTotal) === 686070, f.grossTotal);
t('subsidy auto (residential, capped) = ₹78,000', f.subsidy === 78000, f.subsidy);
t('net = ₹6,08,070', Math.round(f.netInvestment) === 608070, f.netInvestment);
t('annualGen = 10,220 kWh', Math.round(f.annualGen) === 10220, f.annualGen);
t('annualSaving = 10,220×15 = ₹1,53,300', Math.round(f.annualSaving) === 153300, f.annualSaving);
t('25-year series length', f.series.years.length === 25);
t('degradation applied (Yr2 gen < Yr1)', f.series.gen[1] < f.series.gen[0]);
t('escalation applied (Yr2 saving > Yr1 if esc > deg effect)', f.series.saving[1] > f.series.saving[0]);
t('cumulative monotonic', f.series.cumSaving.every((v, i, a) => i === 0 || v > a[i - 1]));
t('lifetime = sum of yearly savings',
  Math.abs(f.lifetimeSaving - f.series.saving.reduce((a, b) => a + b, 0)) < 0.01);
t('payback between 3 and 6 years (7kWp case)', isFinite(f.payback) && f.payback > 3 && f.payback < 6, f.payback);
t('payback ≈ net / yr1 for zero escalation+degradation', (() => {
  const flat = F.compute({ ...base, escalation: 0, degradation: 0 });
  return Math.abs(flat.payback - 608070 / 153300) < 0.01;
})(), 'interpolated check');
t('IRR positive & sane (20–60%)', f.irr > 20 && f.irr < 60, f.irr);
t('costPerWp = ₹90', Math.abs(f.costPerWp - 90) < 0.001);
t('moduleCount = ceil(7000/545) = 13', f.moduleCount === 13, f.moduleCount);
t('arrayArea = 13 × 2.5832 ≈ 33.6 m²', Math.abs(f.arrayArea - 33.58) < 0.05, f.arrayArea);
t('effective ₹/unit = net / lifetimeGen', Math.abs(f.effectivePerUnit - f.netInvestment / f.lifetimeGen) < 0.001);

console.log('— Customer type & subsidy logic —');
t('commercial → subsidy 0', F.compute({ ...base, customerType: 'commercial' }).subsidy === 0);
t('industrial → subsidy 0', F.compute({ ...base, customerType: 'industrial' }).subsidy === 0);
t('commercial with override → override wins',
  F.compute({ ...base, customerType: 'commercial', subsidyOverride: '50000' }).subsidy === 50000);
t('residential override wins over slabs',
  F.compute({ ...base, subsidyOverride: '10000' }).subsidy === 10000);

console.log('— Payments & BOM —');
t('payment % sum 100', f.pay.sumPct === 100);
t('advance amount = 50% of gross', Math.abs(f.pay.advance.amount - 686070 / 2) < 1);
const fBom = F.compute({ ...base, bomModules: '300000', bomInverter: '80000', bomStructure: '70000' });
t('bomSum = 4,50,000', fBom.bomSum === 450000, fBom.bomSum);
t('bomDelta = 630000−450000 = 180000', fBom.bomDelta === 180000, fBom.bomDelta);
t('bomItems filtered to 3', fBom.bomItems.length === 3);

console.log('— Bill offset —');
const fBill = F.compute({ ...base, monthlyBill: '12000' });
t('offset = 153300/144000 = 106% → capped 100', Math.round(fBill.billOffset) === 106 && fBill.billOffsetCapped === 100,
  fBill.billOffset);

console.log('— Environment factors —');
t('co2Annual = 10220×0.79/1000 = 8.07 t', Math.abs(f.co2Annual - 8.0738) < 0.01, f.co2Annual);
t('treesAnnual uses editable factor', Math.abs(f.treesAnnual - (f.co2Annual * 1000) / 58.4) < 0.01);
const fEnv = F.compute({ ...base, co2Factor: '0.71' });
t('custom CO₂ factor respected', Math.abs(fEnv.co2Annual - 10220 * 0.71 / 1000) < 0.01);

console.log('— Edge cases —');
const zero = F.compute({});
t('zero inputs do not crash', isFinite(zero.projectCost) && zero.projectCost === 0);
t('zero payback is NaN not 0-clone', !isFinite(zero.payback));
const neg = F.compute({ ...base, costPerKwp: '0' });
t('zero cost → payback NaN', !isFinite(neg.payback));
const huge = F.compute({ ...base, capacity: '500' });
t('500 kWp: subsidy still ₹78,000 (capped slab) — documentable', huge.subsidy === 78000, huge.subsidy);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
