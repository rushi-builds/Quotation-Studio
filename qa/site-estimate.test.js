'use strict';
/* Unit checks for assets/js/site-estimate.js. Run: node qa/site-estimate.test.js */
const assert = require('node:assert/strict');
const S = require('../assets/js/site-estimate.js');

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };
const NOW = Date.parse('2026-10-12T00:00:00Z');

check('generation: GHI 5.0 kWh/m2/day x 365 x PR 0.78 = 1423.5 kWh/kWp/yr', () => {
  const g = S.generationEstimate({ ghiKwhPerM2Day: 5.0, pr: 0.78 });
  assert.ok(Math.abs(g.kwhPerKwpYear - 1423.5) < 1e-9, 'got ' + g.kwhPerKwpYear);
  assert.equal(g.status, 'ESTIMATE');
});

check('generation uses the 0.75 default PR when none is given', () => {
  const g = S.generationEstimate({ ghiKwhPerM2Day: 4.0 });
  assert.equal(g.pr, S.DEFAULT_PR);
  assert.ok(Math.abs(g.kwhPerKwpYear - 4.0 * 365 * 0.75) < 1e-9);
});

check('generation is null without GHI (no invented yield)', () => {
  assert.equal(S.generationEstimate({ ghiKwhPerM2Day: '', pr: 0.78 }), null);
  assert.equal(S.generationEstimate({ ghiKwhPerM2Day: 0, pr: 0.78 }), null);
});

check('generation is null when PR is outside 0.5 - 0.9', () => {
  assert.equal(S.generationEstimate({ ghiKwhPerM2Day: 5, pr: 1.2 }), null);
  assert.equal(S.generationEstimate({ ghiKwhPerM2Day: 5, pr: 0.3 }), null);
});

check('sourced value keeps source and date and reports ESTIMATE when fresh', () => {
  const v = S.sourced(5.0, { unit: 'kWh/m2/day', source: 'NASA POWER', asOf: '2026-10-01', maxAgeDays: 365 }, NOW);
  assert.equal(v.status, 'ESTIMATE');
  assert.equal(v.source, 'NASA POWER');
  assert.equal(v.asOf, '2026-10-01');
});

check('sourced value becomes STALE after its maximum age', () => {
  const v = S.sourced(5.0, { source: 'Tariff table', asOf: '2025-01-01', maxAgeDays: 365 }, NOW);
  assert.equal(v.status, 'STALE');
});

check('VERIFIED value is never downgraded to STALE by age', () => {
  const v = S.sourced(5.0, { status: 'VERIFIED', source: 'Site survey', asOf: '2020-01-01', maxAgeDays: 1 }, NOW);
  assert.equal(v.status, 'VERIFIED');
});

check('sourced value with no input is MISSING, not zero', () => {
  const v = S.sourced('', { source: 'x', asOf: '2026-10-01' }, NOW);
  assert.equal(v.value, null);
  assert.equal(v.status, 'MISSING');
});

console.log(`PASS: ${passed} site estimate checks`);
