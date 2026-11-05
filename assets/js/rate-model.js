/* ==========================================================================
   Quotation Studio — the rate model (₹/Wp by capacity and by consumer type)

   ONE model, TWO surfaces. The gallery's quick estimate and the quotation
   editor both answer "what does a kWp cost?" and must never answer it
   differently, so the curve lives here and nowhere else:

     assets/js/estimate-calculator.js  prices the customer-facing estimate
     assets/js/pricing-auto.js         offers the same rate in the quotation
                                       editor (editable, resettable)

   Owner's model (stated 2026-11-05):
     - the whole business lives in a ₹45–₹63.6/Wp band, never outside it;
     - the rate softens with capacity by a PERCENTAGE (degradation-style),
       never as a straight line "1 kW = 63, 100 kW = 45";
     - subsidy and non-subsidy work on separate curves with their own floors;
     - 100 kW, 500 kW and anything larger sit exactly on the floor, so a bad
       retune can never produce a ₹30 or ₹20 rate;
     - slowing the drop matters as much as the floor: the first version reached
       ₹45 by 20 kW, which was too steep, so both bands now spend their whole
       runway reaching the floor at 100 kW.

   A band is described ONLY by the numbers the business owns:

       anchor             ₹/Wp at 1 kW — the top of the band
       floor              the lowest ₹/Wp the band may ever reach
       reachesFloorAtKwp  the capacity at which the floor is reached

   and the percentage is SOLVED from them, never typed:

       step = 1 - (floor / anchor) ^ (1 / (breakpoint - 1))
       rate(kWp) = anchor × (1 - step) ^ (kWp - 1)

   so the curve lands exactly on its own floor at its own breakpoint, and a
   retune is editing a floor or a breakpoint. A double clamp then pins every
   answer inside [floor, anchor] for every input, including a broken one.
   ========================================================================== */
'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) { module.exports = factory(); }
  else { root.RateModel = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {

  /* ₹/Wp at 1 kW, ex-GST — the top of both bands, and the quotation's default. */
  const ANCHOR = 63.6;

  const BANDS = {
    /* residential + RWA / housing society: subsidy applies, floor ₹60/Wp */
    subsidy: { floor: 60, reachesFloorAtKwp: 100 },
    /* commercial + industrial: no subsidy, floor ₹45/Wp */
    nonsubsidy: { floor: 45, reachesFloorAtKwp: 100 }
  };

  /* The quotation spells the housing society as `rwa`; the gallery spells it
     `society`. Both are subsidy band. */
  function bandOf(type) {
    return (type === 'residential' || type === 'society' || type === 'rwa') ? 'subsidy' : 'nonsubsidy';
  }

  /** ₹/Wp for a capacity in kWp, always inside the band's floor..anchor. */
  function ratePerWp(type, kwp) {
    const band = BANDS[bandOf(type)];
    let size = Number(kwp);
    /* An unknown, negative or sub-1 capacity prices at the anchor, never NaN. */
    if (!Number.isFinite(size) || size < 1) size = 1;
    /* At and beyond the breakpoint the answer IS the floor - not the floor plus
       a floating-point crumb. Stated, not left to luck. */
    if (size >= band.reachesFloorAtKwp) return band.floor;
    const span = Math.max(band.reachesFloorAtKwp - 1, 1);      /* 1 kW is the anchor */
    const step = 1 - Math.pow(band.floor / ANCHOR, 1 / span);
    const rate = ANCHOR * Math.pow(1 - step, size - 1);
    /* Hard band: whatever the size, whatever the band, whatever a future edit
       does to the maths above, the rate cannot leave [floor, anchor]. */
    return Math.min(Math.max(rate, band.floor), ANCHOR);
  }

  return { anchor: ANCHOR, bands: BANDS, bandOf: bandOf, ratePerWp: ratePerWp };
}));
