'use strict';
// Independent arithmetic audit. Run: node --test qa/calculation-verification.test.cjs
// Expected values below are calculated from inputs, not copied from Finance outputs.
const assert = require('node:assert/strict');
const test = require('node:test');
const F = require('../assets/js/finance.js');
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= Math.max(1e-6, Math.abs(expected) * 1e-10), `${label}: ${actual} != ${expected}`);

test('720 explicit-input scenarios reconcile price, GST, DC, subsidy, energy, savings, payments and payback', () => {
  let scenarios = 0;
  for (const capacity of [1, 2.5, 7, 20, 100, 600])
    for (const watts of [500, 545, 620])
      for (const type of ['residential', 'commercial', 'industrial', 'rwa'])
        for (const gst of [0, 8.9])
          for (const rate of [0, 45000, 63600, 90000, 120000]) {
            const state = {capacity, moduleWattage: watts, customerType: type, costPerKwp: rate, gstPercent: gst,
              genFactor: 1460, tariff: 15, escalation: 6, degradation: 0.5, payAdvance: 50, payDispatch: 40, payCompletion: 10};
            const f = F.compute(state);
            const count = Math.ceil(capacity * 1000 / watts);
            const dc = count * watts / 1000;
            const subsidy = type === 'residential' ? Math.min(dc, 2) * 30000 + Math.max(0, Math.min(dc - 2, 1)) * 18000
              : type === 'rwa' ? Math.min(dc, 500) * 18000 : 0;
            const gross = capacity * rate * (1 + gst / 100), net = gross - subsidy;
            assert.equal(f.moduleCount, count);
            close(f.installedKwp, dc, 'installed DC');
            close(f.projectCost, capacity * rate, 'contracted price');
            close(f.gstAmount, capacity * rate * gst / 100, 'GST');
            close(f.grossTotal, gross, 'gross'); close(f.subsidy, subsidy, 'subsidy'); close(f.netInvestment, net, 'net');
            let cumulative = 0, energy = 0, payback = NaN;
            for (let y = 0; y < 25; y++) {
              const generation = dc * 1460 * (0.995 ** y), saving = generation * 15 * (1.06 ** y);
              close(f.series.gen[y], generation, 'year generation'); close(f.series.saving[y], saving, 'year saving');
              if (net > 0 && !Number.isFinite(payback) && cumulative + saving >= net) payback = y + (net - cumulative) / saving;
              cumulative += saving; energy += generation;
              close(f.series.cumSaving[y], cumulative, 'cumulative');
            }
            close(f.lifetimeSaving, cumulative, 'lifetime savings'); close(f.lifetimeGen, energy, 'lifetime generation');
            if (Number.isFinite(payback)) close(f.payback, payback, 'payback'); else assert.ok(Number.isNaN(f.payback));
            close(f.pay.advance.amount + f.pay.dispatch.amount + f.pay.completion.amount, gross, 'payments on gross');
            scenarios++;
          }
  assert.equal(scenarios, 720);
});

test('RWA household-limited MNRE examples reconcile when eligibility is entered', () => {
  for (const [houses, expected] of [[20, 1080000], [50, 1800000]]) {
    const f = F.compute({capacity:100, moduleWattage:500, customerType:'rwa', rwaEligibleKwp:houses * 3});
    assert.equal(f.subsidy, expected);
  }
  assert.equal(F.compute({capacity:55,moduleWattage:550,inverterKw:50,customerType:'rwa'}).subsidy,990000);
});

test('EMI independently reconciles for positive rates; zero interest amortizes principal without interest', () => {
  for (const loan of [100000, 500000, 1000000]) for (const rate of [1, 9, 15]) for (const years of [1, 5, 10]) {
    const f = F.compute({loanAmt:loan, loanRate:rate, loanYears:years}).financing;
    const monthlyRate = rate / 1200, months = years * 12;
    const emi = loan * monthlyRate / (1 - (1 + monthlyRate) ** -months);
    close(f.emi, emi, 'EMI'); close(f.totalInterest, emi * months - loan, 'interest');
  }
  const zero = F.compute({loanAmt:100000,loanRate:0,loanYears:5}).financing;
  close(zero.emi, 100000 / 60, 'zero-interest EMI');
  close(zero.totalInterest, 0, 'zero interest');
  for (const loanRate of ['', undefined, null, -1, 'invalid']) assert.equal(F.compute({loanAmt:100000,loanRate,loanYears:5}).financing,null);
});

test('saved ₹/Wp state and engine ₹/kWp state produce identical finances', () => {
  for (const rate of [0, 60, 63.6, 90]) {
    const base = {capacity:10,moduleWattage:500,gstPercent:8.9,customerType:'residential',genFactor:1460,tariff:15};
    assert.deepEqual(F.compute({...base,costPerWp:rate}), F.compute({...base,costPerKwp:rate*1000}));
  }
  assert.equal(F.compute({capacity:10,costPerWp:60,costPerKwp:0}).projectCost,0);
  assert.equal(F.compute({capacity:10,costPerWp:60,costPerKwp:90000}).projectCost,900000);
});
