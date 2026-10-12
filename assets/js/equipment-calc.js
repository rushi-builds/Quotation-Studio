/* ==========================================================================
   Quotation Studio - Equipment calculations (pure, no DOM)
   --------------------------------------------------------------------------
   Derives values that are physics or standard-table arithmetic from the
   equipment inputs. Returns null when an input is missing. It never invents
   a datasheet value: nothing here fills Voc/Isc/Vmp/Imp, which must come
   from the catalogue or the user.

   Formulas
     Module efficiency (STC)  η % = Pmax / (1000 W/m² × L × W) × 100
     Conductor resistance     R(T) = R20 × (1 + α × (T − 20)), α = 0.00393 /°C (copper)
     DC cable voltage drop    ΔV = 2 × I × R(T) × L / 1000   (round trip, L in m)
     Voc at temperature       Voc(T) = Voc × (1 + β × (T − 25)), β in %/°C

   Conductor values: IEC 60228 maximum DC resistance at 20 °C, plain copper
   (Ω/km), classes 1–2.
   ========================================================================== */
(function (root) {
  'use strict';

  const R20_OHM_PER_KM = Object.freeze({
    1.5: 12.1, 2.5: 7.41, 4: 4.61, 6: 3.08, 10: 1.83, 16: 1.15, 25: 0.727,
    35: 0.524, 50: 0.387, 70: 0.268, 95: 0.193, 120: 0.153, 150: 0.124,
    185: 0.0991, 240: 0.0754
  });
  const ALPHA_COPPER = 0.00393;   // per °C
  const STC_IRRADIANCE = 1000;    // W/m²
  const DEFAULT_CABLE_TEMP_C = 70; // XLPE/PVC operating conductor temperature

  const num = (v) => {
    if (v === '' || v === null || v === undefined) return NaN;
    return Number(v);
  };
  const positive = (v) => Number.isFinite(num(v)) && num(v) > 0;

  /* Module efficiency at STC, in percent. */
  function moduleEfficiency(m) {
    if (!m || !positive(m.wp) || !positive(m.lengthMm) || !positive(m.widthMm)) return null;
    const areaM2 = (num(m.lengthMm) / 1000) * (num(m.widthMm) / 1000);
    return (num(m.wp) / (STC_IRRADIANCE * areaM2)) * 100;
  }

  /* Conductor DC resistance (Ω/km) at the given temperature. */
  function conductorResistance(sizeMm2, tempC) {
    const r20 = R20_OHM_PER_KM[num(sizeMm2)];
    if (r20 === undefined) return null;
    const t = Number.isFinite(num(tempC)) ? num(tempC) : DEFAULT_CABLE_TEMP_C;
    return r20 * (1 + ALPHA_COPPER * (t - 20));
  }

  /* Round-trip DC voltage drop for a string/array cable. */
  function dcCableVoltageDrop(c) {
    if (!c || !positive(c.currentA) || !positive(c.lengthM)) return null;
    const r = conductorResistance(c.sizeMm2, c.tempC);
    if (r === null) return null;
    const volts = 2 * num(c.currentA) * r * num(c.lengthM) / 1000;
    return { volts, resistanceOhmPerKm: r };
  }

  /* Open-circuit voltage corrected to a cell temperature. */
  function vocAtTemperature(p) {
    if (!p || !positive(p.voc) || !Number.isFinite(num(p.tcVocPctPerC)) || !Number.isFinite(num(p.tempC))) return null;
    return num(p.voc) * (1 + (num(p.tcVocPctPerC) / 100) * (num(p.tempC) - 25));
  }

  const api = { moduleEfficiency, conductorResistance, dcCableVoltageDrop, vocAtTemperature, R20_OHM_PER_KM };
  root.EquipmentCalc = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
