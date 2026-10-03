# Export and customer-portal audit — 4 October 2026

## Confirmed fixes

- Power selector said six pages while the main download button still said five. The existing experience regression also incorrectly expected five; corrected that assertion. A shared Power page-count property now feeds selector, download label and PDF header/footer, with an actual generated-page-count guard.
- Single-page additional-system report download used “1 Pages”; singular is now correct.
- Published customer portal referenced nonexistent `Export.downloadPdf`, leaving its PDF button disabled. It now awaits the existing `Exporter.exportPdf`, reports progress/errors and re-enables download after success/failure.
- Portal applied published fields to nonexistent editor controls, then called `Render.renderAll()` without a state override. It now renders the published form/defaults/options explicitly, including the font-ready redraw. Frozen stored snapshots are not rewritten.
- Portal briefing loaded without `salutation.js`, causing `composeGreeting` runtime errors. Its existing dependency is now included, as already done in Studio and Customer View.
- Updated asset versions so clients revalidate corrected export/portal scripts without clearing saved browser quotations.
- Corrected QA portfolio artifact paths to be relative to the test directory, avoiding an unignored nested `qa/qa` directory when run through npm.

## Verification

- Core QA: 995 assertions in 15 suites passed.
- Atomic reference allocator / Worker permissions / offline model: 3 tests passed.
- Reference browser checks: Dashboard/Studio creation, duplication, versioning, repeated clean cloud reopening, dirty local preservation, reset/deletion and offline/static hosting passed.
- Power PDF: eleven fixtures, six actual PDF pages, chart dimensions, six styled headings, finance equality, metadata, links, A4/footer bounds and cleanup passed.
- Experience: 49 checks passed, including the corrected exact download label, real PDF export, QR decoding after JPEG compression, scenario isolation and failure recovery.
- Financial fixes: 8 independent calculation/RWA tests plus real builder/Customer View/Detailed/Power PDF checks passed, including zero-interest financing and subsidy override boundaries.
- Detailed portfolio: ten photographs/card/QR fit the original page; actual 15-page PDF preserves links and QR pixels.
- New `npm --prefix qa run test:export-audit`: selectable full/Power/system labels, singular/plural counts, real anonymous published-portal rendering of non-default customer/capacity/reference/price, real six-page portal PDF and metadata/links, failure recovery, and no browser runtime errors.

Browser/API tests used an isolated temporary local-server store, not production. The approved design, calculation engine, existing quotations, publication access controls and database schema are unchanged. This is a targeted regression audit, not a claim that every possible issue in the application has been ruled out.
