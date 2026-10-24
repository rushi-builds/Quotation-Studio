'use strict';
/* Unit checks for assets/js/equipment-calc.js. Run: node qa/equipment-calc.test.js */
const assert = require('node:assert/strict');
const C = require('../assets/js/equipment-calc.js');

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('  ✓ ' + name); };

check('module efficiency: 545 Wp on 2278 x 1134 mm = 21.10 %', () => {
  const eff = C.moduleEfficiency({ wp: 545, lengthMm: 2278, widthMm: 1134 });
  assert.ok(Math.abs(eff - 21.096) < 0.01, 'got ' + eff);
});

check('module efficiency returns null when a dimension is missing', () => {
  assert.equal(C.moduleEfficiency({ wp: 545, lengthMm: '', widthMm: 1134 }), null);
  assert.equal(C.moduleEfficiency({ wp: 0, lengthMm: 2278, widthMm: 1134 }), null);
  assert.equal(C.moduleEfficiency(null), null);
});

check('conductor resistance: 4 mm2 copper at 20 C = 4.61 ohm/km', () => {
  assert.equal(C.conductorResistance(4, 20), 4.61);
});

check('conductor resistance rises with temperature (4 mm2 at 70 C)', () => {
  const r = C.conductorResistance(4, 70);
  assert.ok(Math.abs(r - 4.61 * (1 + 0.00393 * 50)) < 1e-9, 'got ' + r);
});

check('unknown cable size returns null (no invented value)', () => {
  assert.equal(C.conductorResistance(3.3, 70), null);
});

check('DC voltage drop: 10 A, 50 m, 4 mm2 at 70 C = 5.52 V round trip', () => {
  const d = C.dcCableVoltageDrop({ currentA: 10, lengthM: 50, sizeMm2: 4 });
  assert.ok(Math.abs(d.volts - 2 * 10 * 4.61 * (1 + 0.00393 * 50) * 50 / 1000) < 1e-9, 'got ' + d.volts);
  assert.ok(Math.abs(d.volts - 5.516) < 0.01);
});

check('DC voltage drop returns null without current or length', () => {
  assert.equal(C.dcCableVoltageDrop({ currentA: 0, lengthM: 50, sizeMm2: 4 }), null);
  assert.equal(C.dcCableVoltageDrop({ currentA: 10, lengthM: '', sizeMm2: 4 }), null);
});

check('Voc at -5 C with -0.28 %/C from 49.5 V = 53.66 V', () => {
  const v = C.vocAtTemperature({ voc: 49.5, tcVocPctPerC: -0.28, tempC: -5 });
  assert.ok(Math.abs(v - 49.5 * (1 + (-0.28 / 100) * (-30))) < 1e-9, 'got ' + v);
});

check('Voc temperature correction returns null without a datasheet Voc', () => {
  assert.equal(C.vocAtTemperature({ voc: '', tcVocPctPerC: -0.28, tempC: -5 }), null);
});

console.log(`PASS: ${passed} equipment calculation checks`);
