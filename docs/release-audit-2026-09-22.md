# Pre-merge release audit — 22 September 2026

## Verdict

**Core quotation workflows passed the completed regression audit after the fixes below and are ready for owner review with the stated limitations. No merge or production deployment is authorized by this audit.**

The initial unit suite passed, but additional source review and edge-case reproductions found real defects. They were fixed and regression-tested; the report is not a claim that every possible input, browser or device is bug-free.

## Issues found and fixed

| Finding | Correction |
|---|---|
| New/partial legacy proposals could inherit the previous proposal's Advanced Edit content and project-image overrides. | Reset in-memory content and image maps to canonical defaults before applying the selected proposal's own overrides. Saved proposals are not rewritten or erased. |
| Page-photo uploads changed the current screen but were not part of the saved proposal. | Persist `pageImages` with the proposal; restore in builder, Customer View and JSON import/export. PDF capture uses the restored page images. |
| A FileReader callback could finish after switching proposals. | Both page-photo and project-photo upload callbacks verify their originating proposal before applying a result. |
| A duplicate/new version retained the original's sent/accepted dates and signer details despite being a new draft. | Clear cloned acknowledgement/milestone fields. Preserve the original document, its acknowledgement and version lineage. |
| Import could replace the active proposal before its pending autosave completed. | Flush current edits before importing; refuse the operation if that save fails. |
| Storage-full creation could leave a missing document in the index or activate a nonexistent copy. | Propagate write success, roll back a failed document/index pair, verify creation before activation and preserve the active proposal on failure. |
| IRR on zero/no-return inputs could report 452.5% or a solver boundary rather than an undefined result. | Require a meaningful cash-flow sign change and a valid root bracket; expand bounds where appropriate. Undefined/ambiguous IRR renders as a dash. |
| An explicit zero CO₂ factor silently reverted to the default. A zero tree-absorption divisor also silently reverted. | Respect the supplied zero CO₂ factor. A nonpositive tree divisor gives an unavailable tree equivalence rather than an invented divisor. |
| Proposal dates used UTC calendar dates, which could be yesterday shortly after midnight in India. | Use the browser's local calendar date for fresh, reset and undated proposals. Audit includes an Asia/Calcutta midnight boundary. |
| Some out-of-range numbers had no visible control-panel warning. | Extend advisory warnings to native numeric bounds, module/tree factors, degradation and subsidy overrides above the gross price. Do not silently rewrite entered values. |

Previously unsaved page-photo uploads cannot be reconstructed from old backups; re-upload those if needed. The approved built-in images and supplied tracking asset are unchanged.

## Marathi voice finding

The supplied screenshot is consistent with the Web Speech API not exposing a Marathi voice in that browser on that device. It does **not** show a broken Marathi translation or a financial synchronization failure. We cannot determine the user's installed OS/browser voices from the screenshot alone.

Voice selection already requires the requested language and listens for asynchronous `voiceschanged` events. It does not substitute Hindi or English for Marathi automatically.

The fallback has been improved:

- Clear explanation that playback depends on browser/operating-system voices, not a hosted recording.
- No promise that installing a language pack will necessarily install/expose a speech voice.
- **Check voices again** to refresh availability, including voices that appear without a browser event.
- **Use English audio**, shown only when English is available; selecting it updates the English transcript and still requires Play.
- The selected-language written briefing is exposed when its voice is unavailable.
- No autoplay, no silent language substitution, and no audio controls in PDF/print.

**Remaining limitation:** Marathi/Hindi audio cannot be guaranteed on every device with the current device-voice approach. The spoken text remains tied to the current Finance-derived quotation, not a fixed prerecorded example. Guaranteed cross-device multilingual playback would require a hosted speech service, server-side credentials, cost/rate controls and a privacy decision. That has not been added during this stabilization audit.

## Calculation reconciliation

Independent arithmetic was checked against the engine for this reference scenario: 7 kWp; ₹90,000/kWp; 8.9% GST; ₹15/kWh tariff; 1,460 kWh/kWp/year; 6% tariff escalation; 0.5% degradation; residential automatic subsidy estimate.

| Quantity | Reconciled result |
|---|---:|
| Base project price | ₹6,30,000 |
| GST | ₹56,070 |
| Gross price | ₹6,86,070 |
| Potential subsidy, subject to eligibility/approval | ₹78,000 |
| Net investment | ₹6,08,070 |
| Year-one generation | 10,220 kWh |
| Year-one modeled savings | ₹1,53,300 |
| 25-year modeled cumulative savings, before investment | ₹78,08,982 |
| Interpolated cumulative-savings payback | 3.68 years |
| Modeled IRR | 30.56% |
| 50% / 40% / 10% payments, against gross price | ₹3,43,035 / ₹2,74,428 / ₹68,607 |

EMI was independently checked against the reducing-balance formula. Residential, commercial and industrial normal-case snapshots remain numerically identical before/after these fixes. Savings and payback are assumption-based projections, not guaranteed returns. GST applicability, subsidy eligibility, technical sizing and actual site yield still require project-specific professional review.

## Verification

- Unit suite: **332 passed, 0 failed** after the fixes.
- New release edge-case suite: **40 passed, 0 failed**, covering calculations, proposal isolation, photos, import/export, draft acknowledgement cleanup, quota failures, numeric warnings and local-date boundaries.
- Audio suite: **35 checks**, including explicit language routing, asynchronous voice discovery, manual refresh, missing-language fallback, errors, pause/resume/stop, current quotation values, Customer View and print isolation. Speech engines are mocked for deterministic control tests; these checks do **not** prove audible Marathi availability on a physical device.
- Existing suites cover live cover editing, branding, engineering requests, A4 geometry, technical specification, diagram, gallery/tracking, two-page Power Proposal, scenarios, blank personal defaults, control-panel workflows, detailed PDF and financing PDF exports.
- Final complete browser regression: **passed**. All 11 numbered browser suites passed (386 checks), plus the live-cover regression and actual PDF export smoke checks. The generated 2-page summary, 16-page detailed test proposal and 17-page financing test proposal completed successfully; the full-export browser reported **0 runtime errors**.

Approved artwork is unchanged:

- Cover SHA-256: `0d8e226e919f215b2ecd4ac17c57278da6841922322455c0ccb49c11a7876961`
- Editable cover background SHA-256: `0eae307763f2befa74d16a218617432ff039914b5278c7d5c8ff9b74e0414eda`
- Supplied tracking image Git blob: `213b1702f20304fd8b43b3ca54af4e730a29a7af`

## Remaining release considerations — not hidden

1. **Browser-local storage:** proposals are not cloud-synced. A `share.html?p=…` URL alone does not transfer a quotation to another person's device. Use the PDF, or a JSON backup/import workflow. Export backups before clearing browser data. Different Vercel preview URLs have separate browser storage.
2. **Protected preview:** Vercel previews may require sign-in. Public QR destinations must be real, owner-supplied HTTPS links tested on a signed-out phone. QR URL validation is not a guarantee of public accessibility.
3. **Optional device narration:** written English/Hindi/Marathi briefings are available; audio depends on exposed voices. A physical-device check remains necessary.
4. **Warnings are advisory:** input warnings do not block every PDF download. Review the customer, capacity, pricing, tax/subsidy assumptions, payment total, equipment and report links before issuing a quotation. This audit is not tax, legal or engineering certification.
5. **Test environment:** real Chromium rendering and generated PDFs were checked, including mobile viewport sizes; this is not exhaustive testing on every iPhone, Android device, browser extension or OS speech provider.

## Recommendation

Do not add unrelated UI features during this final stabilization step. Review the updated preview and export one real quotation on the intended device. If Marathi playback on every customer's device is a release requirement, decide on hosted multilingual speech before merging. Otherwise, retain optional device audio with the now-explicit transcript fallback. A cloud quotation-sharing workflow is a separate future feature, not something the current local Customer View should be represented as providing.

**Merge remains an explicit owner decision.**


## Post-audit correction — installed-array display

A subsequent user check at **10 kWp / 545 Wp modules** exposed a missed display
bug: the calculated array size was correct (19 × 545 Wp = **10.355 kWp**), but the
renderer called `fmtNum` before completing arithmetic. The intermediate value was
formatted as `1,036`; dividing that comma-containing string yielded `NaN`.

The earlier tests checked module quantities, pricing and A4 layout but did not
assert this displayed row across the number-grouping boundary. The prior passing
results therefore did not establish that this formatter was correct.

The renderer now formats the final numeric kWp value directly, to a maximum of
three decimal places. Calculations and quotation pricing are unchanged. The new
`qa/array-size.test.js` checks 14 capacity/rating combinations, including 9.81/9.82
kWp boundary cases, 10 kWp, module-rating edits and larger systems. It checks
rendered rows and scans all proposal pages for NaN/Infinity, then verifies reload,
Customer View, print and the actual detailed-PDF capture path. The existing
technical-specification test also explicitly checks the installed-array row.

Verification after this correction: **332 unit checks**, **22 technical-specification
browser checks**, and **35 installed-array regression checks** passed. A real
**15-page detailed PDF** was downloaded through the UI; its technical-page canvas
was visually inspected and shows **10.355 kWp**. This is a targeted recheck, not a
claim that every possible input or device combination has been audited.

## Follow-up numerical consistency review

The user's request for confidence prompted a further check beyond the NaN fix.
It found three additional cases that the previous passing suites did not catch:

1. **DC/AC ratio used requested rather than installed DC capacity.** It now uses
   the actual panel total divided by inverter kW. The 10 kWp / 19 × 545 Wp / 10 kW
   example displays **1.04 : 1**, not 1.00 : 1. Ratio formatting also rounds decimal
   midpoint values consistently (10.45 / 10 displays 1.05 : 1).
2. **Floating-point rounding could add an unnecessary module.** For example,
   8.175 kWp at 545 Wp evaluates internally just above 15 modules and previously
   rounded to 16. A relative machine-precision tolerance now removes round-off
   before ceiling; genuine shortfalls still require another panel. The unit
   regression checks 300–750 Wp ratings in 5 Wp steps, 1–200 modules, at the exact
   boundary and one watt above/below: **54,600 sizing scenarios**. A further check
   confirms that even a 0.001 W shortfall still rounds up.
3. **Zero net investment had misleading financial display fallbacks.** Milestone
   ROI now shows a dash rather than an invented 0% when there is no positive
   investment denominator. With positive lifetime generation and zero net cost,
   the executive summary and savings page show **₹0.00/unit** rather than a dash.
   No pricing or savings formula was changed.

The rendered-value regression now includes exact module-count boundaries, DC/AC
ratios, manual/automatic inverter edits, and zero-investment display states.
Reload, Customer View and actual detailed-PDF capture assertions include the
corrected ratio. All three preserved ordinary-case financial baselines match
exactly, excluding only the deliberately corrected DC/AC ratio field.

**Scope and confidence:** these fixes address verified defects, not every possible
future issue. Passing automated tests is not a guarantee of a bug-free release.
Input warnings remain advisory (not an export-blocking gate); they must be resolved
before customer delivery. Device-dependent Marathi speech and browser-local
Customer View remain the previously documented limitations. No merge or production
release is authorized by this review.

**Final rerun:** all **341 unit checks** and **456 numbered browser checks across
12 suites** passed, plus the live-cover regression and the PDF/browser export
suite. Actual 2-, 15-, 16- and 17-page PDF paths passed. The 15-page quotation's
technical-page capture was visually checked: **10.355 kWp** and **1.04 : 1** are
both present. No browser runtime errors were reported by the export suite.
