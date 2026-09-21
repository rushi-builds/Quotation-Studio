'use strict';
const assert = require('node:assert/strict');
const F = require('../assets/js/finance.js');
let passed = 0;
function check(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }
const base = {capacity:7,genFactor:1460,tariff:15,costPerKwp:90000,gstPercent:8.9,escalation:6,degradation:0.5};
check('no entered bill means no invented bill', () => assert.equal(F.compute(base).monthlyBill, 0));
check('blank bill has no claimed bill savings', () => assert.equal(F.compute(base).monthlyBillSaving, 0));
check('negative bill clamped to zero', () => assert.equal(F.compute({...base,monthlyBill:-1}).monthlyBill,0));
for (const bill of [100, 500, 1000, 50000]) {
  check('bill balance and nonnegative figures at ₹' + bill, () => {
    const f = F.compute({...base, monthlyBill:bill});
    assert(f.monthlyBillAfter >= 0 && f.monthlyBillAfter <= bill);
    assert.equal(f.monthlyBillAfter + f.monthlyBillSaving, bill);
    assert(f.monthlyBillSaving <= f.annualSaving / 12);
  });
}
check('zero tariff produces zero offset', () => assert.equal(F.compute({...base,tariff:0,monthlyBill:500}).monthlyBillSaving,0));
check('zero capacity produces zero offset', () => assert.equal(F.compute({...base,capacity:0,monthlyBill:500}).monthlyBillSaving,0));
check('negative tariff cannot increase bill comparison', () => assert.equal(F.compute({...base,tariff:-10,monthlyBill:500}).monthlyBillAfter,500));
check('residential has no tax illustration', () => assert.equal(F.compute({...base,customerType:'residential'}).taxShield,0));
for (const type of ['commercial','industrial']) {
  check(type + ' explicit default assumptions', () => {
    const f = F.compute({...base,customerType:type}); assert.equal(f.taxDepreciationYear1,252000); assert.equal(f.taxShield,63000);
  });
}
check('zero tax rate respected', () => assert.equal(F.compute({...base,customerType:'commercial',corpTaxRate:0}).taxShield,0));
check('zero depreciation respected', () => assert.equal(F.compute({...base,customerType:'commercial',depreciationRate:0}).taxShield,0));
check('custom rates used', () => assert.equal(F.compute({...base,customerType:'commercial',depreciationRate:20,corpTaxRate:30}).taxShield,37800));
check('rates bounded 0 to 100', () => {
  const f=F.compute({...base,customerType:'commercial',depreciationRate:200,corpTaxRate:-10}); assert.equal(f.depreciationRatePct,100); assert.equal(f.corpTaxRatePct,0);
});
check('no negative project tax deduction', () => assert.equal(F.compute({...base,costPerKwp:-1,customerType:'commercial'}).taxShield,0));
check('tax illustration never alters investment/payback/savings', () => {
  const a=F.compute({...base,customerType:'commercial',corpTaxRate:0}); const b=F.compute({...base,customerType:'commercial',corpTaxRate:30});
  for(const k of ['netInvestment','payback','lifetimeSaving','irr']) assert.equal(a[k],b[k]);
});
console.log(`\n${passed} passed, 0 failed`);
