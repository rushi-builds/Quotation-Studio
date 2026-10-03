# Six-page Power Proposal

Updated 3 October 2026 following review of the five-page export. The Power format now contains six A4 pages; the Detailed Proposal, calculations, saved quotation data, category cover imagery and separate system reports retain their existing behaviour.

## Page order

1. **Project overview** — original benefits-first opening and selected customer-category image. No opening-page pricing.
2. **About KTM** — company introduction from existing editable content, existing EPC capability titles, and three existing portfolio photographs/details (one from each category). Includes a clickable gallery action and a scannable QR. The configured public destination takes precedence; when blank, this Power report uses the verified public KTM portfolio at `https://studio.rushidhumal-04.workers.dev/gallery.html`. It never guesses a sandbox/preview URL. Invalid explicit destinations remain hidden. No new project counts, certifications or performance claims were invented.
3. **Equipment and system design** — selected equipment, DC/AC capacity, system connection, roof requirement and engineering basis. External report links have moved to the closing page.
4. **Generation and savings** — cumulative solar generation in MWh replaces the declining annual-generation chart. Values are running sums of `Finance.compute().series.gen`, divided by 1,000; no new yield model. Annual degradation remains visible in the assumptions and the year-by-year table. Cumulative monetary value and investment reference remain unchanged.
5. **Investment and payments** — source pricing, GST, subsidy, payment milestones and optional financing. Cost-chart currency ticks now have a measured left gutter rather than sharing plotting space with the first bar, fixing overwritten suffixes such as the `k` in `₹83.33k`. This shared chart correction also protects Detailed Proposal exports. No-loan placeholder commentary is omitted.
6. **Delivery, warranty and support** — scope, warranty highlights, relevant additional systems, delivery/validity, customer responsibilities and company contact. Removed the “Review → discuss → confirm scope” CTA and redundant delivery sequence. Supplied PVsyst and ARKA links appear once each in the final engineering-reports block, with clickable PDF annotations. No report links or claims of prepared reports are invented when URLs are absent.

Professional customer-facing headings replace internal/preparer-style captions. Necessary engineering, subsidy and financial limitations remain; they are not removed as marketing cleanup.

## Checks

- `npm --prefix qa test`: 995 assertions across 15 suites passed, plus the engineering sizing scenarios.
- `npm --prefix qa run test:power`: the historical `power-five.test.cjs` filename now tests **six** pages. Eleven financial/customer/equipment fixtures pass A4 bounds, footer separation, series equality, escaping, unchanged source state/finances and unchanged Detailed Proposal DOM. Added the exact `₹83.33k` label-gutter regression and assertions for project cards/report-link placement.
- Actual Customer View six-page PDF generated: six PDF pages, visible chart pixels, clickable gallery/PVsyst/ARKA links and snapshot cleanup verified.
- Experience suite: 49 checks, including QR decoding after PDF JPEG compression, scenario isolation, overlong-content rejection and error cleanup.
- `npm --prefix qa run test:financial-fixes`: 8 independent calculation/RWA checks and browser/PDF equality, zero-interest and subsidy-override checks passed. Updated only the Power page number/count expectations.
- Rendered pages 2, 4, 5 and 6 inspected visually. Review artifacts are under ignored `qa/shots/power-six/`; no customer/test records or generated PDFs are committed.

The previous five-page specification is historical. Download selectors in Studio, Customer View and the portal now read “Power Proposal — 6-page report”.
