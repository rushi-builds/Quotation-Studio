# Proposal-stage engineering presentation

## Current customer-facing behaviour

The Technical Specification's Engineering Design Basis section and the Power Proposal's equipment/design page display the same saved, editable note:

> Proposal-stage design: Equipment and commercial details are presented in this quotation. Detailed engineering will be completed after site verification and before installation.

The field is **Advanced settings → Engineering design basis → Proposal-stage engineering note — customer PDF**. It is saved with each quotation, exported/imported with form data, and used by local Customer View and published portal snapshots. Older records and empty notes receive the standard fallback. Custom text is escaped, not interpreted as HTML.

The internal helper reads **(Excel integration pending — the workbook is being prepared for production.)** It is outside customer-page markup and never appears in either PDF or customer view.

## Engineering integrity

- The engineering engine, input fields, financial calculations and existing saved input values remain intact. No Excel connection or schema/storage migration was added.
- Detailed wind/anchor/string/cable/roof-load calculations and raw `DATA REQUIRED` rows are no longer printed as the customer design basis.
- Earthing and lightning rows describe verification still to be done, not assumed design results. Entered roof area and the calculated roof requirement remain explicitly indicative; an estimated shortage is still disclosed. No unverified “fits” tick or detailed winter-solstice layout assertion is printed.
- Advanced settings contains an **Internal engineering review — not printed** disclosure listing missing inputs, advisories and blockers.
- Missing-input notes no longer open the download warning dialog by themselves. Proven engineering blockers, real engineering advisories, invalid commercial inputs, duplicate references and overflow warnings retain their existing handling.
- Populating a future Excel source must not silently turn these estimates into verified site claims. Wiring that source and any change to customer engineering presentation are separate future work.

## Verification

- Core tests: 993 assertions passed across 15 suites, plus 54,600 engineering sizing scenarios. Updated presentation assertions only; engineering calculation and safety tests remain active.
- `npm --prefix qa run test:proposal-stage`: default/custom/empty note, Advanced placement, save/reload, escaped text, Technical Specification/Power/Customer View parity, internal-only reminder, internal missing-input review, safety blocker and duplicate-reference checks passed.
- Power/experience: eleven A4 fixtures, actual six-page PDF export and 49 experience checks passed.
- Financial fixes: 8 independent tests and real Detailed/Power PDF amount checks, zero-interest and subsidy-override checks passed.
- Export audit: real anonymous published portal preserves custom note and quotation values; reminder absent; real six-page PDF and failure recovery passed.

All browser/API test records were confined to temporary local QA storage. Existing production records were not deleted or renumbered.
