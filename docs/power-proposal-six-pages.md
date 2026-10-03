# Six-page Power Proposal

Updated 4 October 2026 after the portfolio-card and structured-closing review. The Power format now contains six A4 pages; the Detailed Proposal, calculations, saved quotation data, category cover imagery and separate system reports retain their existing behaviour.

## Page order

1. **Project overview** — original benefits-first opening and selected customer-category image. No opening-page pricing.
2. **About KTM** — company introduction from existing editable content, existing EPC capability titles, and three existing portfolio photographs/details (one from each category). Includes a clickable gallery action and a scannable QR. The configured public destination takes precedence; when blank, this Power report uses the verified public KTM portfolio at `https://studio.rushidhumal-04.workers.dev/gallery.html`. It never guesses a sandbox/preview URL. Invalid explicit destinations remain hidden. No new project counts, certifications or performance claims were invented.
3. **Equipment and system design** — selected equipment, DC/AC capacity, system connection, roof requirement and engineering basis. External report links have moved to the closing page.
4. **Generation and savings** — three energy milestone cards (Year 1, first 10 years, 25 years) replace the extra generation line chart. MWh totals are running sums of `Finance.compute().series.gen`, divided by 1,000 and displayed to one decimal; no new yield model. Only the existing cumulative energy-value chart remains on this page. Annual degradation remains visible in the assumptions and the year-by-year table. Cumulative monetary value and investment reference remain unchanged.
5. **Investment and payments** — source pricing, GST, subsidy, payment milestones and optional financing. Cost-chart currency ticks now have a measured left gutter rather than sharing plotting space with the first bar, fixing overwritten suffixes such as the `k` in `₹83.33k`. This shared chart correction also protects Detailed Proposal exports. No-loan placeholder commentary is omitted.
6. **Delivery, warranty and support** — two numbered scope panels, four icon-led warranty cards, a delivery/validity panel, site-readiness tags and a branded contact block, plus any relevant additional systems. Removed the “Review → discuss → confirm scope” CTA and redundant delivery sequence. Supplied PVsyst and ARKA links appear once each in the final engineering-reports block, with clickable PDF annotations. No report links or claims of prepared reports are invented when URLs are absent.

Professional customer-facing headings replace internal/preparer-style captions. Necessary engineering, subsidy and financial limitations remain; they are not removed as marketing cleanup.

## Checks

- `npm --prefix qa test`: 995 assertions across 15 suites passed, plus the engineering sizing scenarios.
- `npm --prefix qa run test:power`: the historical `power-five.test.cjs` filename now tests **six** pages. Eleven financial/customer/equipment fixtures pass A4 bounds, footer separation, series equality, escaping, unchanged source state/finances and unchanged Detailed Proposal DOM. Added the exact `₹83.33k` label-gutter regression and assertions for project cards/report-link placement.
- Actual Customer View six-page PDF generated: six PDF pages, visible chart pixels, clickable gallery/PVsyst/ARKA links and snapshot cleanup verified.
- Experience suite: 49 checks, including QR decoding after PDF JPEG compression, scenario isolation, overlong-content rejection and error cleanup.
- `npm --prefix qa run test:financial-fixes`: 8 independent calculation/RWA checks and browser/PDF equality, zero-interest and subsidy-override checks passed. Updated only the Power page number/count expectations.
- Rendered pages 2, 4, 5 and 6 inspected visually. Review artifacts are under ignored `qa/shots/power-six/`; no customer/test records or generated PDFs are committed.

The previous five-page specification is historical. Download selectors in Studio, Customer View and the portal now read “Power Proposal — 6-page report”.


## Detailed Proposal portfolio card (4 October)

The Projects page now uses the same shared `portfolioCard` markup as the Power report. It replaces the old small gallery button, retains all ten projects and the original 132px photo frames, and fits the existing page without adding a page. Only inter-section whitespace was tightened. The configured public URL is respected; blank uses the known public KTM gallery, invalid explicit URLs produce no link. Export waits for both project and closing QR generation before cloning their canvas pixels.

Checks: core 995 assertions; Power eleven-fixture/actual six-page PDF suite; experience 49 checks; portfolio regression 36 checks; new `npm --prefix qa run test:portfolio-card` verifies A4 bounds, ten records, default/custom QR decoding, invalid URL handling and actual 15-page Detailed PDF link/QR preservation. The legacy tracking test's investment expectation was corrected to the already-established contracted-capacity basis (`7 × 63,600 × 1.089 − 78,000`); finance code was not changed.

## Heading and waterfall refinement (4 October)

The Power investment waterfall now uses a 340px canvas, matching the generous Detailed Proposal chart height (previously 180px). Payment milestones remain in normal document flow below it. For dense financing/subsidy cases, the measured A4 space can reduce it to no less than 240px; the canvas is drawn at its final size, not stretched. Existing overflow rejection remains in place for excessive custom text.

All six Power page headings retain their exact wording and use a shared navy/amber treatment with a fine amber underline beneath the emphasized phrase. Detailed Proposal headings and all financial calculations are unchanged. The eleven-fixture Power suite now asserts all six heading accents, a 340px standard waterfall, minimum 240px dense-page height and payment separation; actual PDF generation and the 49-check experience suite pass. Rendered investment and About pages were visually reviewed.
