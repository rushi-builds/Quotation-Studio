> Historical specification. Superseded by [the six-page Power Proposal](power-proposal-six-pages.md).

# Five-page Power Proposal

The existing `power` PDF format now produces exactly five A4 pages, replacing the former two-page summary. The full Detailed Proposal and standalone BESS/additional-system reports retain their existing structure and page counts.

## Pages

1. **Project overview:** benefits-first opening, selected-category imagery, customer/site, contracted capacity, actual installed DC, average monthly/year-one/25-year generation, monitoring qualification and report guide. No pricing on the opening page.
2. **Equipment and system design:** selected makes, ratings, module count, installed array, roof/area basis, DC/AC ratio, system connection diagram, engineering qualifications and supplied report links.
3. **Generation and savings:** two charts (25 annual-generation bars; cumulative energy-value line with positive net-investment reference), year 1/5/10/15/25 table, payback and explicit yield/tariff/escalation/degradation assumptions. Savings are modelled energy value, not guaranteed bill reduction.
4. **Investment and payments:** base, GST, gross, subsidy, net investment, base rate and validity; existing cost bridge chart; payment milestones; optional loan principal/rate/term/EMI/total repayment/interest. Includes RWA eligibility, manual-override and negative-investment qualifications.
5. **Scope and next steps:** included scope, additional scope, warranty highlights, delivery/validity/jurisdiction, customer responsibilities, contact and gallery QR/link. Optional battery/additional-system costs are separately identified, never added silently to solar totals. For a solar-only proposal, a six-step delivery sequence fills this space instead.

## Calculation and export integrity

- All figures and projections come from the existing `Finance.compute()` result. No changes to finance.js, subsidy rules, loan math, or source pricing.
- Generation and cumulative charts use the exact existing 25-year series; the table uses the same series. Chart scales consider all values and handle zero or decreasing series.
- Undefined/nonpositive-investment payback is not displayed as a fabricated return. A negative investment retains its entered value and warns that it is not a promised payout.
- Zero-interest financing is preserved, as are manual subsidy overrides including zero.
- Prices/payments/chart totals exclude separately priced optional systems. Actual bills depend on self-consumption/export settlement, fixed charges and site performance; projections exclude O&M/replacements/financing interest/discounting.
- Power export is a detached snapshot. It cannot modify the saved state, detailed-page DOM, category cover or calculator. Customer View scenario sliders do not change exported quotation assumptions.
- Real canvas cost charts and SVG projection charts are rasterised by the existing html2canvas/jsPDF pipeline. All five pages use the existing A4 dimensions.
- Excessively long user-authored content fails with a clear message rather than silently clipping. Horizontal overflow is checked as well as footer/vertical boundaries.
- Builder, Customer View and portal selectors say “Power Proposal — 5-page report”. Separate two-page BESS/system report selectors are intentionally unchanged.

## Tests

Run `npm --prefix qa run test:power` with browser dependencies installed and `QA_BASE` pointing to the app (default local port 8080).

- `qa/power-five.test.cjs`: 11 fixtures covering all categories, RWA provisional/confirmed eligibility, zero-interest financing, zero tariff, decreasing value, zero/excessive subsidy overrides, custom equipment, and combined battery/additional-system disclosures. Asserts five pages, footer geometry, chart series equality, correct net investment, markup escaping, and unchanged full-proposal DOM/state/finances. Saves an actual five-page PDF from Customer View and verifies its chart pixels, page count and gallery link.
- `qa/experience.test.js`: 49 checks pass, including actual five-page PDF generation, original QR decoding, snapshot isolation, scenario independence, optional financing, failure cleanup and too-long-content rejection.
- `npm --prefix qa test`: existing 995 non-browser checks pass.
- `npm --prefix qa run test:financial-fixes`: passes independent calculation/RWA checks and real Customer View detailed/Power PDF amount equality, 0% loans and override safety.
- Opening-pages and category-cover browser regressions pass, including actual 15-page Detailed Proposal export.

Generated QA PDFs/screenshots are under ignored `qa/shots/power-five/`; no sample customer records or test figures are shipped as application defaults.
