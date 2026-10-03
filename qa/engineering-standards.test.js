/* ==========================================================================
   Engineering standards - every figure the design basis prints is checked
   against the standard that defines it, and against arithmetic worked out
   here independently of the module that produced it.

     IS 875 (Part 3):2015   wind pressure and the k2 terrain table
     IS 3043:2018           earth electrode resistance (the standard's own
                            worked example is reproduced at the bottom of it)
     IS 732 / IEC 62548     voltage drop and string current
     IEC 62548 / IEC 62109  string voltage against the inverter's limits
     IEC 61215-2            module mechanical-load class
     IEC/IS 62305           lightning risk parameters
     MNRE / UPNEDA rooftop  terrace load benchmark

   Run: node qa/engineering-standards.test.js
   ========================================================================== */
'use strict';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const E = require('../assets/js/engineering.js');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const check = (name, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.error('  ✗ FAIL:', name, '→', e.message); }
};
const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

/* the shipped defaults, in the form's own units */
const SITE = {
  capacity: '7', moduleWattage: '545', moduleLengthMm: '2278', moduleWidthMm: '1134',
  tiltDeg: '15', latitudeDeg: '18.52', shadeHalfWindowHours: '3', roofSetbackM: '0.6',
  windSpeed: '39', terrainCategory: '3', buildingHeightM: '10',
  windK1: '1', windK3: '1', windK4: '1', netUpliftCp: '1.2', roofZone: 'edge',
  anchorsPerModule: '4', moduleLoadClassPa: '2400',
  moduleVoc: '', moduleVmp: '', moduleIsc: '', moduleImp: '',
  moduleVocBetaPct: '-0.27', moduleVmpBetaPct: '-0.36',
  inverterVmaxDc: '1100', mpptMinV: '200', mpptMaxV: '1000', inverterMaxCurrentA: '',
  minAmbientC: '0', maxCellC: '65',
  dcCableLengthM: '', dcCableSizeMm2: '', acCableLengthM: '', acCableSizeMm2: '',
  soilResistivity: '', earthTargetOhm: '5', electrodeLengthM: '3', electrodeDiaM: '0.05',
  electrodeEfficiency: '0.75', thunderstormDays: '30', lpsClass: 'IV',
  moduleWeightKg: '28', rackKgPerM2: '2.5', roofLoadBenchmarkKgM2: '60'
};

/* ==========================================================================
   IS 875 (Part 3):2015 - wind
   ========================================================================== */
console.log('- IS 875 (Part 3):2015 - wind load -');

check('k2 at 10 m is the 2015 table\'s terrain row: 1.05 / 1.00 / 0.91 / 0.80', () => {
  assert.equal(E.k2For('1', 10).k2, 1.05);
  assert.equal(E.k2For('2', 10).k2, 1.00);
  assert.equal(E.k2For('3', 10).k2, 0.91);
  assert.equal(E.k2For('4', 10).k2, 0.80);
});

check('k2 at 15 m is the table\'s next row, exactly', () => {
  assert.equal(E.k2For('1', 15).k2, 1.09);
  assert.equal(E.k2For('2', 15).k2, 1.05);
  assert.equal(E.k2For('3', 15).k2, 0.97);
  assert.equal(E.k2For('4', 15).k2, 0.80);
});

check('between the tabulated heights k2 is linearly interpolated, as the table notes', () => {
  /* 12.5 m is halfway from 10 m to 15 m: 0.91 + 0.5 × (0.97 − 0.91) = 0.94 */
  near(E.k2For('3', 12.5).k2, 0.94, 1e-12);
  near(E.k2For('2', 11).k2, 1.00 + (1 / 5) * (1.05 - 1.00), 1e-12);
  /* and the interpolation is monotonic in height */
  assert.ok(E.k2For('3', 14).k2 > E.k2For('3', 11).k2);
});

check('below 10 m the first row stands; taller roofs use their actual table row', () => {
  assert.equal(E.k2For('3', 4).k2, 0.91);
  assert.equal(E.k2For('3', 10).beyond, false);
  assert.equal(E.k2For('3', 20).beyond, false);
  assert.equal(E.k2For('3', 20).k2, 1.01, 'do not clamp taller roofs to 15 m');
});

check('Pune 39 m/s in a suburban terrain: Vz and pz worked out independently', () => {
  /* Vz = 39 × 1.00 × 0.91 × 1.00 × 1.00 = 35.49 m/s ; pz = 0.6 × Vz² */
  const vz = 39 * 1.00 * 0.91 * 1.00 * 1.00;
  const pz = 0.6 * vz * vz;
  const w = E.wind(SITE);
  near(w.vz, vz, 1e-9);
  near(w.pz, pz, 1e-9);
  near(w.pz, 755.7, 0.1);
  assert.equal(w.ok, true);
});

check('the pressure is 0.6 Vz² - nothing else is folded in', () => {
  /* Kd, Ka and Kc all reduce pressure. Leaving them out is the conservative
     side of the code, and the page says so rather than looking forgetful. */
  const w = E.wind(SITE);
  near(w.pz, 0.6 * w.vz * w.vz, 1e-9);
  const doubled = E.wind({ ...SITE, windSpeed: '78' });
  near(doubled.pz, 4 * w.pz, 1e-6); // pressure goes with the square
});

check('uplift carries the coefficient and the roof-zone multiplier, and gets the IS load factor', () => {
  const w = E.wind(SITE);
  near(w.uplift, w.pz * 1.2 * 1.5, 1e-9);
  near(w.factoredUplift, 1.5 * w.uplift, 1e-9);
  const interior = E.wind({ ...SITE, roofZone: 'interior' });
  const corner = E.wind({ ...SITE, roofZone: 'corner' });
  assert.equal(interior.zoneFactor, 1.0);
  assert.equal(corner.zoneFactor, 2.0);
  assert.ok(corner.factoredUplift > interior.factoredUplift, 'a corner is the worst place to put an array');
});

check('a missing wind speed is DATA REQUIRED, never a zero-pressure pass', () => {
  const w = E.wind({ ...SITE, windSpeed: '' });
  assert.equal(w.ok, false);
  assert.equal(w.pz, undefined);
  assert.ok(w.missing.join(' ').includes('wind speed'));
});

check('a corner-zone array can overload a 2400 Pa module and says so', () => {
  const w = E.wind({ ...SITE, roofZone: 'corner' });
  near(w.factoredUplift, 2720.6, 0.5);
  assert.ok(w.factoredUplift > 2400, 'IEC 61215 standard class is 2400 Pa');
  assert.equal(w.moduleOverloaded, true);
  const heavy = E.wind({ ...SITE, roofZone: 'corner', moduleLoadClassPa: '5400' });
  assert.equal(heavy.moduleOverloaded, false, 'a 5400 Pa module is the fix');
});

check('the same array on the roof interior stays inside the standard class', () => {
  const w = E.wind({ ...SITE, roofZone: 'interior' });
  near(w.factoredUplift, 1360.3, 0.5);
  assert.equal(w.moduleOverloaded, false);
});

/* ==========================================================================
   Shadow geometry - the roof area an array actually needs
   ========================================================================== */
console.log('- row spacing on the winter solstice -');

check('the sun angle is the standard elevation formula for Pune on 21 December', () => {
  /* sin α = sin φ sin δ + cos φ cos δ cos ω, with ω = 45° (±3 h) and δ = −23.45° */
  const toRad = (d) => (d * Math.PI) / 180;
  const sin = Math.sin(toRad(18.52)) * Math.sin(toRad(-23.45)) +
    Math.cos(toRad(18.52)) * Math.cos(toRad(-23.45)) * Math.cos(toRad(45));
  const alpha = (Math.asin(sin) * 180) / Math.PI;
  near(E.solarAltitude(18.52, 45, -23.45), alpha, 1e-9);
  near(alpha, 29.26, 0.01);
});

check('row pitch = module depth + the shadow the row throws', () => {
  const s = E.shadow({ ...SITE });
  const L = 2.278, W = 1.134, tilt = 15;
  const toRad = (d) => (d * Math.PI) / 180;
  const footprint = L * Math.cos(toRad(tilt));
  const rise = L * Math.sin(toRad(tilt));
  const throwM = rise / Math.tan(toRad(E.solarAltitude(18.52, 45, -23.45)));
  near(s.footprintM, footprint, 1e-9);
  near(s.riseM, rise, 1e-9);
  near(s.shadowM, throwM, 1e-9);
  near(s.pitchM, footprint + throwM, 1e-9);
});

check('at the shipped 15° tilt, one module needs 1.43 × its own area of roof', () => {
  const s = E.shadow({ ...SITE });
  near(s.ratio, 1.428, 0.001);
  near(s.pitchM, 3.25, 0.01);
});

check('the old fixed 1.4 factor corresponds to about a 14° tilt, which is why it was a guess', () => {
  let found = null;
  for (let tilt = 5; tilt <= 30; tilt += 0.1) {
    const r = E.shadow({ ...SITE, tiltDeg: String(tilt) }).ratio;
    if (Math.abs(r - 1.4) < 0.002) { found = tilt; break; }
  }
  assert.ok(found !== null && Math.abs(found - 14.2) < 0.5, `1.4 fits a ${found}° tilt`);
});

check('a steeper array needs more roof, and a flat one needs exactly its own area', () => {
  const at = (t) => E.shadow({ ...SITE, tiltDeg: String(t) }).ratio;
  assert.ok(at(22) > at(18) && at(18) > at(15) && at(15) > at(10));
  near(at(0), 1, 1e-9);
  near(at(22), 1.596, 0.001);
});

check('required area is modules × pitch × width - the shaded block, not the module area', () => {
  const lay = E.layout(SITE, 13);
  const pitch = lay.geo.pitchM;
  near(lay.requiredArea, 13 * pitch * 1.134, 1e-9);
  near(lay.requiredArea, 47.96, 0.02);
  near(lay.arrayArea, 13 * 2.278 * 1.134, 1e-9);
  assert.ok(lay.requiredArea > lay.arrayArea);
});

check('a roof between the module area and the shaded block is not called a fit', () => {
  assert.equal(E.layout({ ...SITE, availableArea: '30' }, 13).verdict, 'short');
  assert.equal(E.layout({ ...SITE, availableArea: '49' }, 13).verdict, 'tight');
  assert.equal(E.layout({ ...SITE, availableArea: '60' }, 13).verdict, 'fits');
  assert.equal(E.layout({ ...SITE, availableArea: '' }, 13).verdict, 'unknown');
  near(E.layout({ ...SITE, availableArea: '40' }, 13).shortfallM2, 7.96, 0.02);
});

check('no tilt or latitude means no geometry - and no verdict', () => {
  const lay = E.layout({ ...SITE, tiltDeg: '', latitudeDeg: '' }, 13);
  assert.equal(lay.ok, false);
  assert.ok(lay.missing.length >= 1);
});

/* ==========================================================================
   IS 3043:2018 - earthing
   ========================================================================== */
console.log('- IS 3043:2018 - earthing -');

check('the standard\'s own worked example: 3 m pipe, 50 mm dia, 50 Ω·m → 11.8 Ω', () => {
  /* R = (ρ/2πL)·[ln(4L/d) − 1] with ρ=50, L=3, d=0.0508 */
  const expected = (50 / (2 * Math.PI * 3)) * (Math.log((4 * 3) / 0.0508) - 1);
  near(E.electrodeOhm(50, 3, 0.0508), expected, 1e-12);
  near(E.electrodeOhm(50, 3, 0.0508), 11.84, 0.01);
});

check('resistance falls as the electrode goes deeper, and rises with resistivity', () => {
  assert.ok(E.electrodeOhm(50, 4.5, 0.05) < E.electrodeOhm(50, 3, 0.05));
  assert.ok(E.electrodeOhm(100, 3, 0.05) > E.electrodeOhm(50, 3, 0.05));
});

check('electrodes in parallel give R1/(n·η), and the count is the smallest that meets the target', () => {
  const e = E.earthing({ ...SITE, soilResistivity: '50' });
  assert.equal(e.ok, true);
  near(e.singleOhm, 11.9, 0.1);
  assert.equal(e.electrodeCount, 4);
  near(e.parallelOhm, e.singleOhm / (4 * 0.75), 1e-9);
  assert.ok(e.parallelOhm <= 5, 'and it meets the 5 Ω general LV target');
  assert.equal(e.pass, true);
  /* one fewer electrode must miss the target, or the count is not minimal */
  assert.ok(e.singleOhm / (3 * 0.75) > 5);
});

check('better soil needs fewer pits; the 1 Ω system earth needs more', () => {
  const good = E.earthing({ ...SITE, soilResistivity: '30' });
  const poor = E.earthing({ ...SITE, soilResistivity: '120' });
  assert.ok(good.electrodeCount <= poor.electrodeCount);
  const system = E.earthing({ ...SITE, soilResistivity: '50', earthTargetOhm: '1' });
  assert.ok(system.electrodeCount > good.electrodeCount);
});

check('soil that cannot reach the target says so instead of printing a number nobody would build', () => {
  const rocky = E.earthing({ ...SITE, soilResistivity: '200' });
  assert.equal(rocky.pass, false);
  assert.equal(rocky.chemicalRequired, true);
  assert.ok(rocky.electrodeCount <= 12);
});

check('no soil test means DATA REQUIRED - the app will not guess a number of pits', () => {
  const e = E.earthing({ ...SITE, soilResistivity: '' });
  assert.equal(e.ok, false);
  assert.ok(e.missing.join(' ').includes('soil resistivity'));
  assert.equal(e.electrodeCount, undefined);
});

/* ==========================================================================
   IS 732 / IEC 62548 - cable and string
   ========================================================================== */
console.log('- IS 732 / IEC 62548 - cable and string -');

check('copper at 70 °C is the resistivity used, not the 20 °C datasheet figure', () => {
  near(E.RHO_CU_70, 0.0172 * (1 + 0.00393 * 45), 1e-12);
  near(E.RHO_CU_70, 0.0202, 0.0001);
});

check('a two-wire DC run drops 2·ρ·L·I/A', () => {
  const d = E.voltageDrop(10, 30, 4, 600, 2);
  near(d.dropV, (2 * E.RHO_CU_70 * 30 * 10) / 4, 1e-12);
  near(d.dropV, 3.04, 0.01);
  near(d.percent, 0.506, 0.002);
});

check('a three-phase AC run drops √3·ρ·L·I/A, which is less than the same two-wire load', () => {
  const single = E.voltageDrop(20, 40, 6, 230, 1);
  const three = E.voltageDrop(20, 40, 6, 415, 3);
  near(three.dropV, (Math.sqrt(3) * E.RHO_CU_70 * 40 * 20) / 6, 1e-12);
  assert.ok(three.percent < single.percent);
});

check('voltage-drop screening targets remain AC 3 % and DC 2 %, not universal code limits', () => {
  const c = E.cable(SITE, { dcCurrentA: 10, dcVoltageV: 600, acCurrentA: 20, acVoltageV: 230, phases: 1 });
  assert.equal(c.acLimitPct, 3);
  assert.equal(c.dcLimitPct, 2);
  assert.ok(c.limits.includes('IS 732'));
});

check('a 30 m 4 mm² DC run passes; 2.5 mm² over 60 m does not', () => {
  const ok = E.cable({ ...SITE, dcCableLengthM: '30', dcCableSizeMm2: '4' },
    { dcCurrentA: 10, dcVoltageV: 600, acCurrentA: 0, acVoltageV: 0 });
  assert.equal(ok.dc.pass, true);
  const thin = E.cable({ ...SITE, dcCableLengthM: '80', dcCableSizeMm2: '2.5' },
    { dcCurrentA: 12, dcVoltageV: 600, acCurrentA: 0, acVoltageV: 0 });
  assert.equal(thin.dc.pass, false);
  assert.ok(thin.dc.percent > 2, thin.dc.percent);
});

check('a cable nobody has sized reports DATA REQUIRED rather than a clean bill of health', () => {
  const c = E.cable(SITE, { dcCurrentA: 10, dcVoltageV: 600, acCurrentA: 20, acVoltageV: 230 });
  assert.equal(c.dc.ok, false);
  assert.equal(c.ac.ok, false);
  assert.ok(c.dc.missing.length >= 1 && c.ac.missing.length >= 1);
});

check('string voltage is checked at the coldest temperature, using the module\'s own coefficient', () => {
  const mod = { ...SITE, moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0' };
  const st = E.string(mod, { moduleCount: 26 });
  const vocCold = 49.7 * (1 + (-0.27 / 100) * (0 - 25));
  near(st.vocColdPerModule, vocCold, 1e-12);
  assert.equal(st.maxSeriesByVoltage, Math.floor(1100 / vocCold));
  assert.equal(st.maxSeriesByVoltage, 20);
});

check('a string is never longer than the array, and the strings are balanced', () => {
  const mod = { ...SITE, moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0' };
  const one = E.string(mod, { moduleCount: 13 });
  assert.equal(one.strings, 1);
  assert.equal(one.seriesPerString, 13, 'thirteen modules cannot make a twenty-module string');
  const two = E.string(mod, { moduleCount: 26 });
  assert.equal(two.strings, 2);
  assert.equal(two.seriesPerString, 13, 'equal strings, or one drags the other');
  assert.equal(two.balancedStrings, true);
  const three = E.string(mod, { moduleCount: 46 });
  assert.equal(three.strings, 3);
  assert.equal(three.seriesPerString, 16);
});

check('the string that fits is inside the inverter limit, with the margin shown', () => {
  const mod = { ...SITE, moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0' };
  const st = E.string(mod, { moduleCount: 13 });
  assert.equal(st.overVoltage, false);
  /* 49.7 × (1 + 0.0027 × 25) = 53.05475 V per module, × 13 = 689.71 V */
  near(st.vocColdString, 49.7 * 1.0675 * 13, 1e-9);
  near(st.vocColdString, 689.71, 0.01);
  assert.ok(st.vocMarginPct > 30);
});

check('a 600 V inverter makes the same array two short strings instead of one long one', () => {
  const mod = { ...SITE, moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0', inverterVmaxDc: '600' };
  const st = E.string(mod, { moduleCount: 13 });
  assert.equal(st.maxSeriesByVoltage, 11);
  assert.equal(st.strings, 2);
  assert.equal(st.seriesPerString, 7);
  assert.equal(st.overVoltage, false, 'seven modules at 53 V is 371 V - inside the limit');
  assert.ok(st.vocColdString < 600);
  assert.equal(st.impossible, false);
});

check('a module that cannot fit under the inverter at all is reported, not silently mangled', () => {
  const mod = { ...SITE, moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0', inverterVmaxDc: '40' };
  const st = E.string(mod, { moduleCount: 13 });
  assert.equal(st.impossible, true);
  assert.equal(st.overVoltage, true);
  assert.equal(st.strings, 0);
});

check('a string that falls under the MPPT floor at midday is caught too', () => {
  const hot = E.string({ ...SITE, moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0', mpptMinV: '400' },
    { moduleCount: 13 });
  assert.equal(hot.belowMppt, false, '13 × 35.52 V = 461.8 V still clears a 400 V floor');
  const mod = { ...SITE, moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0', mpptMinV: '500' };
  const st = E.string(mod, { moduleCount: 13 });
  assert.equal(st.belowMppt, true, 'but not a 500 V one');
});

check('IEC 62548 sizes the conductor for 1.25 × Isc per string', () => {
  const mod = { ...SITE, moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0' };
  const st = E.string(mod, { moduleCount: 26 });
  near(st.iscDesignPerString, 1.25 * 13.9, 1e-12);
  near(st.designCurrent, 1.25 * 13.9 * 2, 1e-12);
});

check('more strings than the inverter input allows is reported', () => {
  const mod = { ...SITE, moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0', inverterMaxCurrentA: '26' };
  const st = E.string(mod, { moduleCount: 46 });
  assert.equal(st.iscOverload, true);
  assert.ok(st.designCurrent > 26);
});

check('without datasheet figures the string check is DATA REQUIRED, never a silent pass', () => {
  const st = E.string(SITE, { moduleCount: 13 });
  assert.equal(st.ok, false);
  assert.equal(st.overVoltage, undefined);
  assert.ok(st.missing.includes('moduleVoc'));
});

/* ==========================================================================
   IEC/IS 62305 and the MNRE/UPNEDA roof-load benchmark
   ========================================================================== */
console.log('- IEC 62305 - lightning, and the terrace load benchmark -');

check('Ng follows 0.04 × Td^1.25 from the local thunderstorm-day count', () => {
  const li = E.lightning({ ...SITE, thunderstormDays: '30' });
  near(li.ng, 0.04 * Math.pow(30, 1.25), 1e-12);
  near(li.ng, 2.808, 0.001);
  const stormier = E.lightning({ ...SITE, thunderstormDays: '60' });
  assert.ok(stormier.ng > li.ng);
});

check('the collection area is LW + 2(L+W)H + πH²', () => {
  const li = E.lightning({ ...SITE, buildingLengthM: '10', buildingWidthM: '8' });
  const area = 10 * 8 + 2 * (10 + 8) * 10 + Math.PI * 100;
  near(li.collectionAreaM2, area, 1e-9);
  near(li.strikesPerYear, li.ng * area * 1e-6, 1e-15);
});

check('the LPL parameters are the standard\'s: sphere / mesh / down-conductor / 10 Ω earth', () => {
  assert.deepEqual(E.LPL.I, { sphere: 20, mesh: 5, down: 10, eff: '99 %' });
  assert.deepEqual(E.LPL.II, { sphere: 30, mesh: 10, down: 10, eff: '97 %' });
  assert.deepEqual(E.LPL.III, { sphere: 45, mesh: 15, down: 15, eff: '91 %' });
  assert.deepEqual(E.LPL.IV, { sphere: 60, mesh: 20, down: 20, eff: '84 %' });
  assert.equal(E.lightning(SITE).earthOhm, 10);
  assert.equal(E.lightning({ ...SITE, lpsClass: 'nonsense' }).lpsClass, 'IV', 'an unknown level falls back, it does not invent one');
});

check('terrace load is modules plus racking over the array, against the 60 kg/m² benchmark', () => {
  const lay = E.layout(SITE, 13);
  const r = E.roofLoad(SITE, 13, lay.requiredArea);
  near(r.kgPerM2, (13 * 28 + 2.5 * lay.requiredArea) / lay.requiredArea, 1e-9);
  near(r.kgPerM2, 10.1, 0.1);
  assert.equal(r.pass, true);
  assert.ok(r.basis.includes('60 kg/m²'));
  /* the benchmark is a shared rooftop figure, not a structural design */
  assert.ok(r.basis.includes('MNRE'));
});

/* ==========================================================================
   The export gate - which level each finding lands on
   ========================================================================== */
console.log('- the gate: block, warn, or note -');

check('a sheet with everything specified and compliant reports nothing to stop for', () => {
  const done = {
    ...SITE, soilResistivity: '50', dcCableLengthM: '30', dcCableSizeMm2: '4',
    acCableLengthM: '20', acCableSizeMm2: '6', inverterMaxCurrentA: '26',
    moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0',
    buildingLengthM: '10', buildingWidthM: '8', availableArea: '60'
  };
  const r = E.report(done, { moduleCount: 13, acCurrentA: 10, acVoltageV: 230, phases: 1 });
  assert.equal(r.blocking.length, 0, JSON.stringify(r.blocking));
  assert.equal(r.advisory.length, 0, JSON.stringify(r.advisory));
});

check('missing inputs are notes, so a page that says DATA REQUIRED still downloads', () => {
  const r = E.report(SITE, { moduleCount: 13 });
  assert.equal(r.blocking.length, 0);
  assert.equal(r.advisory.length, 0);
  assert.ok(r.notes.length >= 3, JSON.stringify(r.notes));
  assert.ok(r.notes.every((n) => /DATA REQUIRED/.test(n.message)), 'and each one says so');
});

check('a roof too small for the shaded rows blocks the download', () => {
  const r = E.report({ ...SITE, availableArea: '30' }, { moduleCount: 13 });
  assert.equal(r.blocking.length, 1);
  assert.equal(r.blocking[0].id, 'availableArea');
  assert.ok(r.blocking[0].message.includes('48 m²'), r.blocking[0].message);
});

check('an over-voltage string blocks, and the message carries both numbers', () => {
  const r = E.report({
    ...SITE, availableArea: '', moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0',
    inverterVmaxDc: '40'
  }, { moduleCount: 13 });
  const vol = r.blocking.find((i) => i.id === 'inverterVmaxDc');
  assert.ok(vol, 'must block on string voltage: ' + JSON.stringify(r.blocking));
  assert.ok(/53 V/.test(vol.message) && /40 V/.test(vol.message), vol.message);
});

check('wind that exceeds the module\'s own rating blocks', () => {
  const r = E.report({ ...SITE, roofZone: 'corner' }, { moduleCount: 13 });
  const wind = r.blocking.find((i) => i.id === 'moduleLoadClassPa');
  assert.ok(wind, JSON.stringify(r.blocking));
  assert.ok(wind.message.includes('2721') && wind.message.includes('2400'), wind.message);
});

check('a marginal cable drop warns but does not stop the document', () => {
  const r = E.report({
    ...SITE, moduleVoc: '49.7', moduleVmp: '41.5', moduleIsc: '13.9', moduleImp: '13.0',
    dcCableLengthM: '80', dcCableSizeMm2: '2.5', soilResistivity: '50'
  }, { moduleCount: 13, acCurrentA: 0, acVoltageV: 0 });
  assert.equal(r.blocking.length, 0, JSON.stringify(r.blocking));
  assert.ok(r.advisory.some((i) => i.id === 'dcCableSizeMm2'));
});

/* ==========================================================================
   finance.js follows the geometry, and the page prints the basis
   ========================================================================== */
console.log('- the engine and the printed page -');

check('finance derives the clearance, and a typed factor still overrides it', () => {
  delete require.cache[require.resolve('../assets/js/engineering.js')];
  require('../assets/js/engineering.js');            // puts Engineering on globalThis
  const F = require('../assets/js/finance.js');
  const base = {
    capacity: '7', genFactor: '1460', costPerKwp: '63630', gstPercent: '8.9', tariff: '10',
    escalation: '4', degradation: '0.5', customerType: 'residential',
    moduleWattage: '545', moduleLengthMm: '2278', moduleWidthMm: '1134',
    tiltDeg: '15', latitudeDeg: '18.52'
  };
  const derived = F.compute(base);
  assert.equal(derived.clearanceSource, 'derived');
  near(derived.roofClearanceFactor, 1.428, 0.001);
  near(derived.requiredArea, 13 * derived.roofClearanceFactor * 2.278 * 1.134, 1e-6);
  const manual = F.compute({ ...base, roofClearanceFactor: '1.1' });
  assert.equal(manual.clearanceSource, 'manual');
  near(manual.requiredArea, manual.arrayArea * 1.1, 1e-9);
  /* the money must not move because the roof geometry changed */
  assert.equal(derived.netInvestment, F.compute({ ...base, roofClearanceFactor: '1.1' }).netInvestment);
});

check('the printed design basis uses the proposal-stage note, not unverified calculations', () => {
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const mockCtx = () => new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 42 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof p === 'string') { if (!(p in t)) t[p] = () => {}; return t[p]; }
      return undefined;
    },
    set() { return true; }
  });
  const dom = new JSDOM(html, {
    url: 'http://localhost/quotation.html', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => mockCtx();
      w.Element.prototype.scrollIntoView = function () {};
      Object.defineProperty(w.HTMLImageElement.prototype, 'complete', { get: () => true });
      Object.defineProperty(w.HTMLImageElement.prototype, 'naturalWidth', { get: () => 100 });
      Object.defineProperty(w.HTMLImageElement.prototype, 'naturalHeight', { get: () => 100 });
      w.devicePixelRatio = 2;
      w.confirm = () => true;
    }
  });
  const w = dom.window;
  const src = ['content.js', 'engineering.js', 'finance.js', 'storage-catalog.js', 'bess.js',
    'additional-systems.js', 'supplement-design.js', 'icons.js', 'charts.js', 'model.js', 'state.js',
    'equipment.js', 'render.js', 'editor.js', 'experience.js', 'export.js', 'app.js']
    .map((f) => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n;\n');
  w.eval(src);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  const text = w.document.getElementById('v_tsTable').textContent;

  assert.ok(text.includes('ENGINEERING DESIGN BASIS'), 'the design basis is printed');
  assert.ok(text.includes(w.StateStore.DEFAULTS.engineeringDesignNote), 'the proposal-stage qualification is printed');
  assert.ok(!/DATA REQUIRED|row pitch|Net uplift|per anchor|Excel integration/.test(text), 'internal assumptions and integration status stay out of the PDF');

  /* the claims that could not be supported are gone */
  const flat = text.replace(/\s+/g, ' ');
  assert.ok(!/engineered for monsoon wind loads/i.test(flat), 'no unbacked wind claim');
  assert.ok(!/IS\/IEC-compliant installations/i.test(flat), 'no blanket compliance claim');
  assert.ok(!/Included \(as per EPC scope\)/.test(flat), 'earthing is a design, not a phrase');
});

check('the engineering basis is kept inside its page, and an overflowing page is not silent', () => {
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const mockCtx = () => new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 42 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof p === 'string') { if (!(p in t)) t[p] = () => {}; return t[p]; }
      return undefined;
    },
    set() { return true; }
  });
  const dom = new JSDOM(html, {
    url: 'http://localhost/quotation.html', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => mockCtx();
      w.Element.prototype.scrollIntoView = function () {};
      Object.defineProperty(w.HTMLImageElement.prototype, 'complete', { get: () => true });
      Object.defineProperty(w.HTMLImageElement.prototype, 'naturalWidth', { get: () => 100 });
      Object.defineProperty(w.HTMLImageElement.prototype, 'naturalHeight', { get: () => 100 });
      w.devicePixelRatio = 2;
      w.confirm = () => true;
    }
  });
  const w = dom.window;
  w.eval(['content.js', 'engineering.js', 'finance.js', 'storage-catalog.js', 'bess.js',
    'additional-systems.js', 'supplement-design.js', 'icons.js', 'charts.js', 'model.js', 'state.js',
    'equipment.js', 'render.js', 'editor.js', 'experience.js', 'export.js', 'app.js']
    .map((f) => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));
  const page = w.document.getElementById('pageTechSpec');

  /* the design basis is the one variable-length group, so it is the one that
     can be asked to give up a little room */
  const engRows = w.document.querySelectorAll('#v_tsTable tr.is-eng').length;
  assert.ok(engRows === 1, `the design-basis rows are tagged for compaction, found ${engRows}`);

  /* jsdom lays nothing out (scrollHeight is always 0), so the fit ladder is
     exercised by handing the element a height, which is exactly the branch a
     real browser takes */
  assert.deepEqual([...w.Render.fitPages()], [], 'nothing overflows when the page is short');
  assert.ok(!page.className.includes('is-tight'), 'and nothing is tightened unnecessarily');

  /* jsdom lays nothing out (scrollHeight is always 0), so the fit ladder is
     driven by handing the element a height: each tightening step is modelled as
     the compression it actually is - content that fits after a step stops the
     ladder, content that cannot be helped is reported instead of clipped. */
  /* every dial the fit ladder can turn, counted as one step each */
  const steps = () => ['is-tight-spec', 'is-tighter-spec', 'is-diagram-spec', 'is-diagram-tighter']
    .filter((c) => page.className.includes(c)).length;
  const model = (base, perStep) => Object.defineProperty(page, 'scrollHeight', {
    get: () => base - perStep * steps(), configurable: true,
  });

  model(1200, 150);                       /* a little long: one step is enough */
  assert.deepEqual([...w.Render.fitPages()], [], 'a page that can be tightened is not reported as broken');
  assert.ok(page.className.includes('is-tight-spec'),
    'and it is tightened - the cheapest step that makes it fit, never simply everything');
  assert.ok(/is-tight-spec/.test(page.className), 'the specification table compacts before the diagram gives up size');

  page.className = 'page';                /* too long to save: say so */
  model(1600, 100);
  assert.deepEqual([...w.Render.fitPages()], ['pageTechSpec'], 'a page that stays long after every step is reported');
  assert.ok(page.className.includes('is-tighter-spec') && page.className.includes('is-table-min') &&
    page.className.includes('is-diagram-min'),
    'only after every step has been tried, the smallest drawing included');
  page.className = 'page';

  const other = w.document.getElementById('pageExec');
  Object.defineProperty(other, 'scrollHeight', { get: () => 1300, configurable: true });
  const over = w.Render.fitPages();
  assert.ok(over.includes('pageExec'), 'any other overflowing page is reported too');
  assert.deepEqual([...w.__qsPageOverflow], [...over], 'and the report is readable after the render');
});

check('every engineering input in the form reaches the engine, and no id is a phantom', () => {
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(path.join(ROOT, 'quotation.html'), 'utf8')
    .replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const mockCtx = () => new Proxy({}, {
    get(t, p) {
      if (p === 'measureText') return () => ({ width: 42 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof p === 'string') { if (!(p in t)) t[p] = () => {}; return t[p]; }
      return undefined;
    },
    set() { return true; }
  });
  const dom = new JSDOM(html, {
    url: 'http://localhost/quotation.html', runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.HTMLCanvasElement.prototype.getContext = () => mockCtx();
      w.Element.prototype.scrollIntoView = function () {};
      Object.defineProperty(w.HTMLImageElement.prototype, 'complete', { get: () => true });
      Object.defineProperty(w.HTMLImageElement.prototype, 'naturalWidth', { get: () => 100 });
      Object.defineProperty(w.HTMLImageElement.prototype, 'naturalHeight', { get: () => 100 });
      w.devicePixelRatio = 2;
      w.confirm = () => true;
    }
  });
  const w = dom.window;
  w.eval(['content.js', 'engineering.js', 'finance.js', 'storage-catalog.js', 'bess.js',
    'additional-systems.js', 'supplement-design.js', 'icons.js', 'charts.js', 'model.js', 'state.js',
    'equipment.js', 'render.js', 'editor.js', 'experience.js', 'export.js', 'app.js']
    .map((f) => fs.readFileSync(path.join(ROOT, 'assets/js', f), 'utf8')).join('\n;\n'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

  /* readState() is a hand-written list, so a field the form shows but the list
     omits is silently ignored by every calculation downstream of it. That
     failure is invisible on screen: the input looks live and changes nothing. */
  const fields = [...w.document.querySelectorAll('fieldset.eng-basis input[id], fieldset.eng-basis select[id], fieldset.eng-basis textarea[id]')];
  assert.ok(fields.length >= 40, `the design-basis panel is present (${fields.length} fields)`);
  const state = w.Render.readState();
  const unread = fields.filter((el) => !Object.prototype.hasOwnProperty.call(state, el.id)).map((el) => el.id);
  assert.deepEqual(unread, [], 'no design-basis field is invisible to the engine');

  /* and the value that arrives is the value on screen */
  const probe = fields.find((el) => el.id === 'tiltDeg');
  probe.value = '27';
  probe.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(w.Render.readState().tiltDeg, '27', 'an edited field reaches the engine unchanged');
});

check('missing datasheet values remain internal informational notes', () => {
  const src = fs.readFileSync(path.join(ROOT, 'assets/js/control-panel.js'), 'utf8');
  /* The strip is the builder's "fix this" area; DATA REQUIRED notes belong on
     the page. Re-deriving the rule from the source keeps the two from drifting
     apart without a browser. */
  assert.ok(/feedback\.hidden = notesOnly \|\| !messages\.length/.test(src),
    'the feed hides itself when the only findings are notes');
  assert.ok(/const notesOnly = !list\.blocking\.length && !list\.advisory\.length/.test(src),
    'notes are recognised as informational only');
  const eng = require('../assets/js/engineering.js');
  const clean = eng.report(SITE, { moduleCount: 13 });
  assert.equal(clean.blocking.length, 0, 'the shipped defaults raise nothing that blocks');
  assert.ok(clean.notes.length > 0, 'and they still report the figures nobody has supplied');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
