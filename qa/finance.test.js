/* Unit tests for the Quotation Studio finance engine (run: node qa/finance.test.js) */
'use strict';
const F = require('../assets/js/finance.js');

let pass = 0, fail = 0;
function t(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓', name); }
  else { fail++; console.error('  ✗ FAIL:', name, extra !== undefined ? '→ ' + extra : ''); }
}

console.log('- Subsidy slabs (PM Surya Ghar) -');
t('1 kW → ₹30,000', F.calcSubsidy(1) === 30000);
t('2 kW → ₹60,000', F.calcSubsidy(2) === 60000);
t('2.5 kW → ₹69,000', F.calcSubsidy(2.5) === 69000);
t('3 kW → ₹78,000 (cap)', F.calcSubsidy(3) === 78000);
t('10 kW → ₹78,000 (cap)', F.calcSubsidy(10) === 78000);
t('0 kW → 0', F.calcSubsidy(0) === 0);

console.log('- Formatting -');
t('INR grouping', F.fmtINR(1234567) === '₹12,34,567', F.fmtINR(1234567));
t('short lakh', F.fmtINRshort(670000) === '₹6.7 L', F.fmtINRshort(670000));
t('short crore', F.fmtINRshort(12400000) === '₹1.24 Cr', F.fmtINRshort(12400000));
t('date', F.fmtDate('2026-09-19') === '19th September 2026', F.fmtDate('2026-09-19'));
t('addDays 15', F.addDays('2026-09-19', 15) === '2026-10-04', F.addDays('2026-09-19', 15));

console.log('- Core compute (7 kWp, ₹90k/kWp, 8.9% GST, ₹15 tariff) -');
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
t('annualGen = installed 7.085 kWp × 1460 = 10,344 kWh',
  Math.round(f.annualGen) === 10344, f.annualGen);
t('annualSaving = 10,344×15 = ₹1,55,162', Math.round(f.annualSaving) === 155162, f.annualSaving);
t('25-year series length', f.series.years.length === 25);
t('degradation applied (Yr2 gen < Yr1)', f.series.gen[1] < f.series.gen[0]);
t('escalation applied (Yr2 saving > Yr1 if esc > deg effect)', f.series.saving[1] > f.series.saving[0]);
t('cumulative monotonic', f.series.cumSaving.every((v, i, a) => i === 0 || v > a[i - 1]));
t('lifetime = sum of yearly savings',
  Math.abs(f.lifetimeSaving - f.series.saving.reduce((a, b) => a + b, 0)) < 0.01);
t('payback between 3 and 6 years (7kWp case)', isFinite(f.payback) && f.payback > 3 && f.payback < 6, f.payback);
t('payback ≈ net / yr1 for zero escalation+degradation', (() => {
  const flat = F.compute({ ...base, escalation: 0, degradation: 0 });
  return Math.abs(flat.payback - 608070 / 155161.5) < 0.01;
})(), 'interpolated check');
t('IRR positive & sane (20–60%)', f.irr > 20 && f.irr < 60, f.irr);
t('costPerWp = ₹90', Math.abs(f.costPerWp - 90) < 0.001);
t('moduleCount = ceil(7000/545) = 13', f.moduleCount === 13, f.moduleCount);
t('arrayArea = 13 × 2.5832 ≈ 33.6 m²', Math.abs(f.arrayArea - 33.58) < 0.05, f.arrayArea);
t('effective ₹/unit = net / lifetimeGen', Math.abs(f.effectivePerUnit - f.netInvestment / f.lifetimeGen) < 0.001);

console.log('- Installed vs contracted capacity (whole modules) -');
t('contracted stays 7 kWp, installed is 7.085 kWp (13 × 545 Wp)',
  f.contractedKwp === 7 && Math.abs(f.installedKwp - 7.085) < 1e-9);
t('generation follows the installed array, not the contract',
  Math.abs(f.annualGen - 7.085 * 1460) < 1e-9);
t('quoted investment follows the contracted capacity (price cannot move)',
  f.projectCost === 630000);
t('delivered ₹/Wp is reported beside the quoted rate',
  Math.abs(f.costPerWpDelivered - 630000 / 7085) < 1e-9 && Math.abs(f.costPerWp - 90) < 1e-9);
t('capacityExact is false when whole modules overshoot the contract', f.capacityExact === false);
t('an exact whole-module capacity reports capacityExact', (() => {
  const exact = F.compute({ ...base, capacity: 8.175 });
  return exact.capacityExact === true && exact.installedKwp === 8.175;
})());
t('no module wattage → installed falls back to the contracted figure', (() => {
  const bare = F.compute({ ...base, moduleWattage: 0, moduleLengthMm: 0, moduleWidthMm: 0 });
  return bare.installedKwp === 7 && bare.annualGen === 7 * 1460;
})());

console.log('- Subsidy follows the installed DC capacity -');
t('2.5 kWp contracted = 2.725 kWp installed → ₹73,050 (not ₹69,000)', (() => {
  const s = F.compute({ ...base, capacity: 2.5 });
  return s.moduleCount === 5 && Math.abs(s.installedKwp - 2.725) < 1e-9 && s.subsidy === 73050;
})(), F.compute({ ...base, capacity: 2.5 }).subsidy);
t('2 kWp contracted = 2.18 kWp installed → ₹63,240', (() => {
  return F.compute({ ...base, capacity: 2 }).subsidy === 63240;
})(), F.compute({ ...base, capacity: 2 }).subsidy);
t('above the 3 kWp slab the ₹78,000 cap still applies', (() => {
  return F.compute({ ...base, capacity: 5 }).subsidy === 78000 &&
    F.compute({ ...base, capacity: 10 }).subsidy === 78000;
})());
t('commercial stays nil regardless of installed capacity',
  F.compute({ ...base, capacity: 2.5, customerType: 'commercial' }).subsidy === 0);
t('an explicit override still wins over the installed-capacity slab',
  F.compute({ ...base, capacity: 2.5, subsidyOverride: '90000' }).subsidy === 90000);
t('a Maharashtra state top-up adds to the central slab (2 kWp + ₹25,000 → ₹85,000)', (() => {
  const s = F.compute({ ...base, capacity: 2, stateTopUp: '25000' });
  return s.subsidy === 63240 + 25000 && s.stateTopUp === 25000;
})(), F.compute({ ...base, capacity: 2, stateTopUp: '25000' }).subsidy);
t('the top-up respects the same residential-only rule',
  F.compute({ ...base, capacity: 2, stateTopUp: '25000', customerType: 'commercial' }).subsidy === 0);
t('blank, zero or invalid top-up changes nothing',
  F.compute({ ...base, capacity: 2, stateTopUp: '' }).subsidy === 63240 &&
  F.compute({ ...base, capacity: 2, stateTopUp: '0' }).subsidy === 63240 &&
  F.compute({ ...base, capacity: 2, stateTopUp: 'abc' }).subsidy === 63240);
t('an explicit override wins over central plus top-up',
  F.compute({ ...base, capacity: 2, stateTopUp: '25000', subsidyOverride: '90000' }).subsidy === 90000);

console.log('- Roof area clearance -');
t('required area = module area × clearance factor (default 1.4)',
  Math.abs(f.requiredArea - f.arrayArea * 1.4) < 1e-9 && f.roofClearanceFactor === 1.4);
t('a roof equal to bare module area does not fit once clearance is applied',
  Math.ceil(f.arrayArea) < Math.ceil(f.requiredArea));
t('a flush-mount clearance of 1.1 is honoured', (() => {
  const s = F.compute({ ...base, roofClearanceFactor: '1.1' });
  return Math.abs(s.requiredArea - s.arrayArea * 1.1) < 1e-9;
})());
t('a clearance factor below 1 is clamped to bare module area', (() => {
  const s = F.compute({ ...base, roofClearanceFactor: '0.5' });
  return s.roofClearanceFactor === 1 && Math.abs(s.requiredArea - s.arrayArea) < 1e-9;
})());
t('zero capacity has zero required area, not NaN',
  F.compute({ capacity: 0 }).requiredArea === 0);

console.log('- Generation transparency -');
t('units/kWp/day and CUF derive from the generation factor',
  Math.abs(f.unitsPerKwpDay - 4) < 1e-9 && Math.abs(f.cufPercent - 16.6667) < 0.001);
t('no generation factor → no derived rate, no NaN', (() => {
  const z = F.compute({ capacity: 7, genFactor: 0 });
  return z.unitsPerKwpDay === 0 && z.cufPercent === 0 && z.annualGen === 0;
})());

console.log('- Customer type & subsidy logic -');
t('commercial → subsidy 0', F.compute({ ...base, customerType: 'commercial' }).subsidy === 0);
t('industrial → subsidy 0', F.compute({ ...base, customerType: 'industrial' }).subsidy === 0);
t('commercial with override → override wins',
  F.compute({ ...base, customerType: 'commercial', subsidyOverride: '50000' }).subsidy === 50000);
t('residential override wins over slabs',
  F.compute({ ...base, subsidyOverride: '10000' }).subsidy === 10000);

console.log('- Payments & BOM -');
t('payment % sum 100', f.pay.sumPct === 100);
t('advance amount = 50% of gross', Math.abs(f.pay.advance.amount - 686070 / 2) < 1);
const fBom = F.compute({ ...base, bomModules: '300000', bomInverter: '80000', bomStructure: '70000' });
t('bomSum = 4,50,000', fBom.bomSum === 450000, fBom.bomSum);
t('bomDelta = 630000−450000 = 180000', fBom.bomDelta === 180000, fBom.bomDelta);
t('bomItems filtered to 3', fBom.bomItems.length === 3);

console.log('- Bill offset -');
const fBill = F.compute({ ...base, monthlyBill: '12000' });
t('offset = 155162/144000 = 108% → capped 100', Math.round(fBill.billOffset) === 108 && fBill.billOffsetCapped === 100,
  fBill.billOffset);

console.log('- Environment factors -');
t('co2Annual = 10,344×0.71/1000 = 7.34 t (CEA v21.0 default)',
  Math.abs(f.co2Annual - 7.3443) < 0.01, f.co2Annual);
t('tree factor defaults to 22 kg (not the retired 58.4)',
  Math.abs(f.treesAnnual - (f.co2Annual * 1000) / 22) < 0.01, f.treesAnnual);
const fEnv = F.compute({ ...base, co2Factor: '0.5' });
t('custom CO₂ factor respected', Math.abs(fEnv.co2Annual - 10344.1 * 0.5 / 1000) < 0.01);
t('custom tree factor respected', Math.abs(F.compute({ ...base, treeFactor: '30' }).treesAnnual - 244.81) < 0.05);

console.log('- Financing & EMI -');
const fLoan = F.compute({ ...base, loanAmt: '500000', loanRate: '9', loanYears: '10' });
/* independent EMI formula: P·r / (1 − (1+r)^−n) */
(() => {
  const r = 0.09 / 12, n = 120;
  const expected = 500000 * r / (1 - Math.pow(1 + r, -n));
  t('EMI matches reducing-balance formula (±₹1)',
    Math.abs(fLoan.financing.emi - expected) < 1, fLoan.financing.emi.toFixed(2) + ' vs ' + expected.toFixed(2));
})();
t('tenure in months = 120', fLoan.financing.months === 120);
t('totalInterest = totalPaid − loan', Math.abs(fLoan.financing.totalInterest - (fLoan.financing.totalPaid - 500000)) < 0.01);
t('monthly savings series length = tenure', fLoan.financing.monthlySavings.length === 120);
t('monthlySavingY1 = annualSaving / 12',
  Math.abs(fLoan.financing.monthlySavingY1 - 155161.5 / 12) < 0.01, fLoan.financing.monthlySavingY1);
t('netMonthlyY1 = savingY1 − EMI',
  Math.abs(fLoan.financing.netMonthlyY1 - (155161.5 / 12 - fLoan.financing.emi)) < 0.01);
/* Y1 saving/12 = 12,930 > EMI 6,333 → crossing month 1 */
t('savings exceed EMI from month 1 (this scenario)', fLoan.financing.crossingMonth === 1,
  fLoan.financing.crossingMonth);
const fLoan2 = F.compute({ ...base, loanAmt: '900000', loanRate: '11', loanYears: '5' });
t('bigger loan: crossing beyond month 1 or absent', isNaN(fLoan2.financing.crossingMonth) ||
  fLoan2.financing.crossingMonth > 1, fLoan2.financing.crossingMonth);
t('no financing inputs → financing null',
  F.compute({ ...base, loanAmt: '', loanRate: '', loanYears: '' }).financing === null);
t('partial financing inputs → financing null',
  F.compute({ ...base, loanAmt: '500000', loanRate: '', loanYears: '10' }).financing === null);
t('zero rate gives principal-only EMI without division by zero',
  Math.abs(F.compute({ ...base, loanAmt: '500000', loanRate: '0', loanYears: '10' }).financing.emi - 500000 / 120) < 1e-9);

console.log('- Edge cases -');
const zero = F.compute({});
t('zero inputs do not crash', isFinite(zero.projectCost) && zero.projectCost === 0);
t('zero payback is NaN not 0-clone', !isFinite(zero.payback));
const neg = F.compute({ ...base, costPerKwp: '0' });
t('zero cost → payback NaN', !isFinite(neg.payback));
const huge = F.compute({ ...base, capacity: '500' });
t('500 kWp: subsidy still ₹78,000 (capped slab) - documentable', huge.subsidy === 78000, huge.subsidy);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
