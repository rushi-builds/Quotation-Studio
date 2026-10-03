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
