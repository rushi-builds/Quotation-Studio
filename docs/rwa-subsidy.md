# RWA / Housing Society subsidy

Customer type `rwa` represents common-facility RWA/GHS projects, not an individual flat connection.

The user explicitly confirmed **₹18,000 per kW**, not a fixed ₹18,000 project total.

Reference: PM Surya Ghar CFA sheet, https://pmsg-production-public.s3.ap-south-1.amazonaws.com/CFA_structure20240307.pdf . This describes common facilities including EV charging, up to 500 kW, at 3 kW per house with the limit inclusive of individual residents' rooftop plants. Verify current policy and actual eligibility before committing a quotation.

Implementation:
- `Finance.compute` applies ₹18,000 per **installed DC kWp** eligible for subsidy, capped at 500 kW.
- Optional `rwaEligibleKwp` is the preparer's confirmed remaining common-facility capacity after household/individual-installation checks. Effective capacity is min(installed, 500, entered). Zero is valid.
- Without that field, min(installed, 500) is a **provisional** upper estimate, not eligibility approval. Investment caption and disclosure explicitly require verification. No dwelling count or existing individual capacity is invented.
- Entered eligible capacity is a preparer assertion, not server verification. All subsidy remains subject to approval.
- A finite explicit `subsidyOverride` amount takes precedence, including zero, in every customer category. Clearing it restores automatic calculation.
- Individual-household Maharashtra top-up and commercial depreciation treatment are not automatically applied to RWA.
- Residential slabs and commercial/industrial zero-auto-subsidy behavior remain unchanged.
- UI state, local/cloud form persistence, options, customer-facing print view and AI calculations use the same field and engine.

Tests: `node --test qa/rwa-subsidy.test.cjs`; `node qa/rwa-browser.test.cjs` (local server on QA_BASE/default port 8080); existing finance, reconciliation, integration and options/share tests.
