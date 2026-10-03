# Quotation Studio verification — 3 October 2026

## Fix follow-up — same date

The four confirmed issues below have now been fixed in the workspace:

- `Finance.compute()` accepts saved ₹/Wp and legacy/engine ₹/kWp states, with explicit ₹/kWp (including zero) taking precedence. Saved Customer View and its detailed/Power Proposal exports now match builder totals.
- The bridge chart includes negative investment in its axis range and normalizes signed rectangle geometry. It uses its actual compact display height. Zero and oversized manual overrides are preserved; the existing advisory warns about subsidy exceeding gross.
- Removed a high-specificity table-padding rule that prevented the measured technical-page fit ladder from working. The fit uses the actual footer boundary. Dense BOM investment charts are 180 px high, leaving the payment note above the footer. Standard layout is preserved.
- Explicit 0% financing computes principal divided by months, zero interest and exact principal total. Blank/invalid/negative rates remain incomplete/invalid. Export preflight accepts 0%.

Validation after fixes:

- Existing `npm --prefix qa test`: all 995 checks passed.
- Independent arithmetic + RWA + assistant knowledge + Gemini: 32 tests passed, including 720 arithmetic scenarios.
- New `qa/financial-fixes-browser.test.cjs`: passed builder/save/reload/Customer View/print equality and **actual** html2canvas/jsPDF detailed (16 pages with financing) and Power Proposal (2 pages) exports from Customer View. Independent expected fixture net: ₹5,75,400, not −₹78,000.
- New browser regression also passes 0% EMI/preflight, blank-rate behavior, zero/exact-gross/excessive subsidy override safety, advisory retention, RWA and clearing override, with no runtime errors.
- `qa/page-spacing.test.js`: 29 checks passed, including actual 17-page dense PDF, desktop, print, mobile and long-equipment fixtures.
- `qa/experience.test.js`: 48 checks passed, including customer scenario, actual two-page PDF, snapshot isolation and Customer View format forwarding.
- Technical Specifications: 32 checks passed, including the previously overflowing site-area/reference combination and explicit reporting for truly excessive content. System diagram: 36 passed. Release audit: 41 passed.
- Existing RWA and opening-pages browser regressions passed.
- Run the new focused regression with `npm --prefix qa run test:financial-fixes` against `QA_BASE` (defaults to local port 8080), with the repository browser dependencies installed.

The export tests now explicitly handle the real preflight dialog; they do not disable validation. The layout test supplies a customer name only before export and checks the current standard 340 px chart height instead of an obsolete 252 px expectation.

This follow-up does **not** claim that every unrelated legacy browser failure in the original audit has been repaired. RWA household eligibility still requires preparer input; applicable GST/subsidy rates still require project-specific verification. No database/customer-data migration is required.

---

## Original audit verdict (before the fixes)

**Core arithmetic passed the tested cases, but the complete Studio is NOT fully verified/correct.** A reproducible Customer View pricing bug and chart/layout edge cases remain. Do not treat passing engine tests as an end-to-end approval.

This audit tested the current workspace using a local server, not the deployed Cloudflare Worker or live customer records. No production logic, customer data or deployment was changed. Added only an independent arithmetic regression and this report.

## Confirmed issues

### High priority: saved Customer View loses the pricing conversion

- Builder input: 10 kWp, 500 Wp modules, ₹60/Wp, GST 8.9%, residential, automatic central subsidy, no state top-up.
- Builder correctly displays base ₹6,00,000, GST ₹53,400, net ₹5,75,400.
- Save with `Proposals.saveActive(StateStore.collectForm(), CONTENT, PROJECT_IMAGES)` and open `share.html?p=<saved ID>` in the same browser context.
- Customer View incorrectly displays base ₹0, GST ₹0, net −₹78,000.
- Saved form contains `costPerWp: '60'` but no `costPerKwp`. Builder `Render.readState()` performs the ×1000 conversion. The read-only share state bypasses that conversion, while `Finance.compute()` consumes `costPerKwp` only.
- This also affects derived payback and financial illustrations in that view. The tariff scenario test exposed NaN payback; its initial failure was not merely an outdated expected price.
- Requires consistent normalization at the saved-state/engine boundary and independent builder-versus-share financial assertions, including share PDF paths. Existing unit share/options tests do not detect this actual browser path.
- Authenticated portal/cloud delivery paths were not established to have this bug; do not generalize this result to them without testing.

### Chart failure with an excessive manual subsidy

Entering a very large subsidy override (reproduced with ₹99,999,999) makes investment negative and causes `Charts.bridge()` → `roundRect()` to throw an `IndexSizeError` because `arcTo` receives a negative radius. The render call aborts.

The manual override must remain available, including zero. Any fix should safely handle negative chart values and provide input/eligibility warnings rather than silently changing the user's amount.

### Dense A4 document overflow

`qa/page-spacing.test.js` passes the ordinary 7, 10, 20 and 100 kWp fixtures, but fails its commercial fixture with bill/BOM/loan/options/technical reports:

- Technical Specifications: page overflow; references about 11 px below footer boundary; note about 65 px below.
- Investment: payment note about 9 px below footer boundary.

This is an export/layout risk, not evidence of incorrect arithmetic. Existing known dense-layout issue reproduced in this audit.

### Zero-interest financing limitation

A positive loan amount and tenure with `loanRate: 0` returns `financing: null`. Positive-interest EMI calculations reconcile to the standard reducing-balance formula. Zero-interest support would require a separate principal/months branch; current behavior is a limitation, not a valid zero-interest EMI result.

## Subsidy and calculation qualifications

- RWA automatic basis is installed module DC capacity, ₹18,000/eligible kWp, capped at 500 kWp. General-category rate is appropriate for Maharashtra; this is not a location-aware special-category-state rate engine.
- Household allowance (3 kWp/house) and individual resident rooftop systems are **not automatically derived**. The preparer must enter remaining eligible common-facility capacity. Blank means a provisional estimate, not government approval.
- Explicit subsidy override takes precedence, including zero. An override can exceed normal eligibility and must be reviewed.
- MNRE government-hosted guidelines, clauses 5(e), 5(f), 5(h), 5(k), confirm RWA limits/rate and rated DC module basis, not inverter size: https://cdnbbsr.s3waas.gov.in/s3716e1b8c6cd17b771da77391355749f3/uploads/2025/07/202507081690964295.pdf
- Pricing uses contracted capacity; physical module count and generation use installed DC capacity. This is intentional and independently reconciled.
- GST tests verify arithmetic against the **entered percentage**. They do not certify the statutory applicability of the default 8.9% or any other rate for a particular supply/invoice. That needs current tax classification review.
- Generation = installed DC × entered yield; savings are modelled energy value with entered tariff/escalation/degradation. They are not a site simulation or guaranteed bill reduction and do not model full O&M/replacement/export-settlement/financing cash flows.
- Payment milestones are on gross including GST, not net after subsidy. Commercial tax benefit is an illustration and is not deducted from investment/payback.

## Executed tests

### Existing non-browser suite: 995 checks passed, zero failed

| Suite | Passed |
| --- | ---: |
| Finance | 82 |
| Reconciliation | 83 |
| Engineering boundaries | 13 (also exercises 54,600 sizing scenarios) |
| Engineering standards | 54 |
| Briefing voices | 15 |
| Salutation | 54 |
| Integration | 117 |
| Render reconciliation | 113 |
| Export preflight | 50 |
| Options | 40 |
| Sync | 106 |
| Finance audit | 19 |
| BESS | 70 |
| Supplements | 63 |
| Platform API | 116 |

Additional RWA/Gemini/assistant-action tests: 19 passed. Assistant knowledge: 12 passed. These are targeted tests, not verification of live Gemini credentials, production services or every dashboard action.

### New independent arithmetic test: all 3 groups passed

Run `node --test qa/calculation-verification.test.cjs` (no external dependencies).

- 720 explicit-input combinations: 6 capacities × 3 module wattages × 4 customer types × 2 GST rates × 5 prices.
- Independent expected price, GST, installed DC, automatic subsidy, annual/25-year generation/savings, milestone totals and interpolated payback.
- MNRE RWA examples: 100 kWp/20 houses → ₹10.80 lakh; 100 kWp/50 houses → ₹18 lakh, when eligible capacity is supplied. 55 kWp DC with 50 kW inverter → ₹9.90 lakh, assuming full eligibility.
- 27 positive-interest loan combinations independently reconcile EMI and interest; zero-interest limitation explicitly recorded.

### Browser suite: 21 files attempted, 10 passed, 11 failed

Passed: RWA, opening pages, cover sync, visual discovery, technical specifications, system diagram, briefing, session isolation, blank defaults, release audit.

Failed and triaged:

| File | Observed failure / status |
| --- | --- |
| `experience.test.js` | Real Customer View pricing-conversion bug; savings matched but investment/payback did not represent the saved price. Independently reproduced. |
| `page-spacing.test.js` | Real dense-layout overflow, described above. |
| `audit-browser.test.js` | Expects ₹37,800 tax shield without setting the ₹90/Wp fixture. Current default is ₹63.6/Wp. Explicit ₹90/Wp reproduction produced ₹37,800 correctly. Remaining assertions were not reached. |
| `tracking-project.test.js`, `equipment-entry.test.js` | Hard-code old default net ₹4,07,051.49. Current ₹63.6/Wp default correctly yields ₹4,06,822.80. Remaining assertions were not reached. |
| `array-size.test.js` | Expects `0 kWp` where current zero-capacity technical row shows `-`; zero module count is correct. Later assertions were not reached. |
| `bess-browser.test.js` | Requires literal `Solar-only` in summary; current summary says `Solar system highlights • battery supplement on pages 7–8`. Investment/savings/terms retain separate-storage disclosures. Later assertions were not reached. |
| `control-panel.test.js` | Expects an element for every default-state key. Three salutation/spoken-name keys have no matching control. Requires UI compatibility review; later assertions were not reached. |
| `brand-engineering.test.js` | Legacy copy migration equality failed; requires migration/content review. Later browser assertions were not reached. |
| `supplements-browser.test.js` | Quotation-linked battery assumptions assertion failed; not fully diagnosed. Do not claim this flow passed. |
| `browser.test.js` | Old default-price assertion, then hidden BOM interaction and non-clickable control failure. Did not finish; cannot certify its later export checks. |

No failing legacy test was weakened or rewritten to make the audit appear green.

## Recommended order

1. Fix saved Customer View price normalization and add real browser financial/share-PDF regression.
2. Make negative-investment charts safe without removing manual subsidy override.
3. Fix dense quotation A4 overflow and re-run export/layout tests.
4. Resolve remaining migration, battery-linking and control tests; update genuinely stale price/text fixtures with explicit inputs.
5. Add zero-interest financing if supported; retain clear RWA provisional eligibility and verify project-specific tax/subsidy inputs before sending.

Audit logs were written outside the repository under `/home/user/studio-audit/logs`; generated browser images/PDFs remain under ignored `qa/shots/`. No real customer data was used.
