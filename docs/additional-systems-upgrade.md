# Additional Systems upgrade — local review

Status: implemented and validated. On 17 October 2026 the owner authorised a new checkpoint commit and feature-branch push for a Vercel preview. **After being informed of the existing Cloudflare Git auto-build, the owner explicitly instructed the feature-branch push and requested a Cloudflare deployment handoff for OpenCode. No merge or manual production deployment by Arena is authorised.**
Previous pushed checkpoint: `f9efb04f4293b7adba2acd82c66ade67391263d9`.

## Scope

Four new presets join Zero Export, Monitoring, EV Charging, Power-Factor Correction and DG–Solar Coordination:

- Weatherproof Solar Roof
- Solar Carport
- Elevated Solar Canopy
- Solar Pergola

Custom remains available. One Additional Systems package is selected per proposal. Existing enable and include-in-main controls remain independent.

A selected, included package supplies relevant cover/Solution imagery, customer-facing scope, Investment/payment disclosures, options/terms and Power Proposal context. It reuses the existing two-page system report and one-page system Power report; it does not append another set of pages.

The four new illustrations are AI concept images, not verified project photographs or construction drawings. Their source resolution is 1536 × 1024; no native-4K claim is made. The approved Residential About image, ordinary Investment pastel cards and six equipment logos are preserved. Uploaded page images and custom narrative retain priority. Disabling the package or removing it from the main proposal restores the ordinary main presentation.

## Safe pricing

- **Separately quoted** is the default, including legacy/unknown values. Its tax-inclusive amount stays outside solar totals, solar payment milestones and savings/payback calculations. Agree separate payments.
- **Included in solar rate** means the preparer has already incorporated this scope in the entered solar rate/BOM. It hides/ignores the secondary system price; no extra charge is added. The application does not automatically modify that rate/BOM.
- Changing templates requests confirmation when existing scope would be replaced. Accepted changes clear template-specific dimensions, commercial terms and price to prevent accidental carryover. Cancelling preserves them. Switching to Custom preserves narrative for editing.

Covered area, clear height, parking bays, roofing, drainage and acceptance checks are preparer-entered requirements. No structure, wind loading, foundation size, guaranteed weatherproofness, extra generation, EV savings or subsidy is inferred from an illustration or selected template. Engineering and contractual warranty remain site-specific.

`assets/js/finance.js`, generation factor 1460 and `assets/js/cloud-bridge.js` are unchanged. `assets/css/app.css` is also unchanged; additional layout spacing is scoped in `bess.css` to selected-system Investment pages, including dense tax/BOM/payment-warning cases.

## Validation completed

- New package pure checks: **9 passed**; existing supplements pure checks: **63 passed**.
- Real Duplicate → JSON backup → New → file import: all **13** structural/pricing/include fields preserved.
- Browser matrix: **72 combinations** (9 presets × 4 customer categories × 2 price modes), plus **8 dense commercial cases** with tax, BOM, payment warning and financing. Main and six-page Power geometry, imagery, price disclosures and Finance isolation checked.
- Actual new PDF exports: **2-page system, 1-page system Power, 6-page Power, 17-page Detailed**; snapshot cleanup and standalone numbering verified.
- Existing optional-systems browser regression: **94 passed, 0 failed**; lifecycle/import, BESS-linked calculations, actual 21-page combined Detailed and six-page Power PDFs, mobile/print, Customer View, long-content export rejection, disabled-export protection and Reset checked.
- Approved About-image browser regression: all four categories, manual-photo priority, reload, Customer View, mobile, print and export passed.
- Investment presentation browser regression: 15 fixtures plus reload, Customer View, print/mobile and actual PDF canvas rendering passed.
- Finance: **82 passed**. Integration: **117 passed**. Render reconciliation: **123 passed**. Assistant knowledge and briefing voice Node checks: **13 passed**. JS syntax and whitespace checks passed.

Static-server QA has no backend. The old optional-systems browser harness now ignores only expected localhost:8080 404 probes for `/api/health` and `/api/auth/me`; missing assets, other console errors and runtime exceptions still fail. Other harness corrections align installed-generation/tariff expectations, async New-proposal timing, nine presets plus Custom, and the established six-page Power format. These are not production Finance or CloudBridge changes.

Reproduction: run the normal local static server on port 8080, install the existing QA dependencies, then `cd qa && npm run test:systems`. Browser tests need a working Chromium environment; this sandbox uses `LD_LIBRARY_PATH=/tmp/al2023/lib`. Set `QA_BASE` to test another explicitly authorised environment.

Artifacts (ignored QA output): `qa/shots/system-packages/` contains the four real PDFs, five main/report PNGs and a reviewed dense commercial Investment PNG. These use **test customer/pricing inputs**, not a real customer quotation. The previous Vercel preview is still the f9efb04 checkpoint and does **not** contain this local upgrade.

This is targeted regression evidence, not a claim that every repository test or every possible future input has passed.

## Publishing boundary

The new checkpoint is a normal descendant of f9efb04, so its complete source tree contains both the approved presentation fixes and this upgrade; published history is not squashed or rewritten. Publish only `arena/d435d7ac-quotation-studio`; PR #21 stays open against `merge/reconcile-v1`.

The f9efb04 GitHub checks show a failed **Workers Builds: studio** check linked to a Cloudflare **production** build (`3a549f77-3814-41bc-a5a2-9d07d5ecea24`), as well as the successful Vercel Preview deployment. GitHub contains no Actions workflow controlling that integration. A future failed build cannot be assumed. Arena initially paused publishing and informed the owner of this automatic-build risk. The owner subsequently explicitly instructed the push and asked for a Cloudflare deployment handoff for OpenCode. Report any automatic Cloudflare build separately from the Vercel preview result. Arena must not run Wrangler, change cloud settings, merge the PR or manually deploy production as part of this request. OpenCode/owner must inspect the latest build/deployment before deciding whether a manual deployment is needed.
