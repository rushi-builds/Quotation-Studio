# Non-financial opening pages

- Cover: Year-1 Generation replaces Project Cost; original artwork retained, sun overlay replaces rupee overlay.
- Summary: annual energy, precise installed kWp, annual CO₂ and turnkey delivery replace money/payback/subsidy highlights. Eight supporting system metrics, equipment/inclusions, artwork and a short estimates note remain.
- Investment still renders unchanged engine-derived base, GST, subsidy, net investment, rate and milestones. Finance/engineering/exports were not modified.
- Saved legacy default subtitles migrate; new caption keys prevent old financial captions being attached to technical numbers. Editor fields, customer share assets and generated assistant knowledge match.

Verification:
- Finance: 82 passed; reconciliation render: 113 passed; integration: 117 passed; sync: 106 passed; options/share: 40 passed; export preflight: 50 passed.
- Cover sync real-browser PASS (including print/PDF canvas/mobile/reload).
- Opening-pages browser PASS: 3/9.5/20/100 kWp, no price/IRR/payback/subsidy figures in opening, installed precision, investment totals, price-edit isolation, legacy saved content, print/screenshots.
- Tech-spec browser: 31 passed.
- Page-spacing: opening/default and 10/20/100 kWp checks pass. The dense commercial scenario fails on Tech Spec references/footer and Investment payment-note overflow. Identical failure reproduced with all changed presentation files served from pre-change HEAD through request interception; pre-existing and outside this two-page change.
- Screenshots (ignored): qa/shots/opening-pages/pageCover.png and pageExec.png.

## Monthly hero and Investment payback follow-up

- Summary hero now uses annual generation / 12, labeled Estimated Monthly Generation. Annual generation moves to a supporting system card; cover remains annual. The note explicitly calls monthly generation a year-one average, not a seasonal forecast.
- Investment has a fifth Estimated Payback card using Finance.payback (the existing cumulative-savings crossing), with no recalculation or engine change. Non-recovery shows Not reached; nonpositive net investment shows Not applicable. Battery quotes label the result solar-only.
- Legacy saved captions and Advanced Edit fields updated. Current screenshots include the rendered canvas chart rather than blank cloned canvases.
- Reconciliation 113, integration 117, sync 106, options/share 40, export preflight 50 all passed. Focused browser coverage tests monthly/annual distinction, price updates, payback and missing-recovery states, legacy saved content, and print output.
- Dense commercial layout comparison against pre-change HEAD: Investment card row remains 92px high, zero overflowing card values, existing payment-note footer overlap remains identical at 9.27px (not worsened by the fifth card).
