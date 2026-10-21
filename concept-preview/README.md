# Dashboard entry — latest owner clarification

The owner explicitly requested the login-after **Dashboard**: Overview, Quotations, Follow-ups and Customer activity, not the quotation builder. `/concept-preview/` now opens **dashboard.html**. Direct Studio preview remains at `/concept-preview/studio.html`; it is not the Dashboard landing page.

`dashboard.html` is a separate copy of the original dashboard from e31c8e3. Original dashboard controllers/styles are reused unchanged. The real API import is replaced only in this copy by `dashboard-fixtures.js`: memory-only sample proposals/tasks/notifications and a fake demo identity. No real sign-in, authentication bypass, cloud data or production API is involved. CSP blocks connections, early sandbox isolates browser storage, no new sidebar sections. Original assistant/OAuth/equipment imports omitted from the copy. Real app entry points and frozen sources unchanged.

The four original panels are interactive with sample data. A sample response note appears in Overview and its associated follow-up is listed in the existing task list. Opening/editing a quotation explicitly enters the isolated Studio copy. Reset/reload discards sample changes. Unsupported actions clearly report unavailable rather than falling through to production. This is not all master-backlog work.

Dashboard QA: **16 checks passed** — original four panels, sample quotation search, task completion, notifications mark-read, mobile navigation, zero API/external requests and browser errors. No credentials required to view sample data.

## Quotation summaries — current preview addition

Owner requested a concise, aesthetic **See summary** action inside the existing Quotations list, with prices, materials, charts and comparison to other quotations. No new sidebar section.

- Row customer names and **See summary** open an accessible, dismissible overlay without leaving Dashboard. Explicit Edit in Studio remains separate. Existing search/filter rendering is preserved; a solar-EPC price column is added.
- Four metrics: entered gross solar EPC price, installed capacity, gross solar ₹/Wp, and separately priced additional scope. No combined total, ROI or Finance-engine changes.
- Interactive seven-segment donut: six explicitly entered selling-price allocations plus GST. Click its legend to inspect an item. Allocations must reconcile to entered base/tax/gross; otherwise the chart is withheld, never invented from total price alone.
- Material/specification/quantity table, scope treatment, pending prices, and concise previous-revision details where an earlier sample snapshot exists.
- Comparison defaults to same-category accessible quotations; all-workspace comparison is optional. Zero-based ₹/Wp bars, peer selector and side-by-side price/capacity/materials/inverter/scope table. Peer differences are descriptive, not quality judgments or market benchmarks. Separate upgrades are excluded from solar rate.
- Previous/next browse and genuine values-only customer XLSX snapshot download. No private costs/margins, hidden sheets, formulas or write-back.
- Original System/Light/Dark appearance respected; desktop/tablet/mobile layouts, native dialog focus/Escape and keyboard tabs supported.

`quote-summary-data.js` supplies **explicit illustrative fixtures** only: entered gross/base/tax/allocation, equipment selections, scope and a few revision snapshots. These are not prices retrieved from real quotations, verified OEM compatibility, engineering recommendations or market rates. Production integration would need permission-scoped saved quotation/version data and actual BOM selling-price allocation; missing records remain unavailable. Existing mock Overview quoted-sum now reconciles to those same entered sample prices instead of an unrelated hardcoded total.

Verification: **58 summary checks PASS** plus **16 existing Dashboard checks PASS**. Five quote allocations reconcile, module quantities reconcile to capacities, ₹/Wp/peer differences correct, unknown data not fabricated, included/optional scope not double charged, XLSX parsed, search/browse/name click, mobile/tablet, dark theme and Escape/focus paths checked. Zero API/external requests and zero browser/CSP errors. Desktop Summary/Compare, mobile Summary and dark Summary screenshots reviewed. Original Finance, CloudBridge, BESS and app.css hashes unchanged; unrelated existing tracked patch unchanged. All additions/edits restricted to this preview directory.

---

# Original Studio — isolated feature preview

## Owner correction

The first concept was a separate six-screen dashboard. The owner found the extra navigation confusing and asked to see enhancements in the **original Studio layout**, quickly, while keeping the preview separate from the real app. That six-screen interface is retired. The Studio copy remains at `/concept-preview/studio.html`; the landing page now follows the Dashboard clarification above.

## What this is

`studio.html` is a copy of the original `quotation.html` at feature commit `153bc2fccd61dfc046149fc8d83f74bcf183d8f6` (its original Studio HTML is unchanged from the preceding source). All original form inputs, report pages, original design/styles, Finance/rendering modules, normal Essentials/All settings and original section order are retained. **No new sidebar or top-level navigation categories.** No root/app files are edited.

The copy adds only sandbox bootstrap, preview styling, sample data and a small UI adapter. It removes CloudBridge, PlatformAPI and assistant script imports **from the copy**, not their original source files. Original Finance, genFactor=1460 and CloudBridge remain frozen.

## First bounded slice, not the entire master backlog

1. The existing Live Quotation summary gains one compact additional-scope line. Review scope opens the existing Advanced Systems section, not a new screen. Existing system/battery/rainwater fields are the only sources; no duplicate commercial inputs.
2. Solar gross is read from `Finance.compute(Render.lastState).grossTotal`; add-on prices never change the Finance result or produce a combined total. Unpriced scope is not zero. Included scope reuses existing inclusion acknowledgements.
3. The **existing Customer view** button opens a read-only snapshot of the actual report with its current customer, prices and original artwork. The report is cloned into a scriptless sandboxed iframe; charts are captured, IDs retained only in the separate document. The open snapshot does not change if working inputs change behind it.
4. Three sample response choices: Interested/next steps, Request changes, Not proceeding. Responses are bound to the exact form snapshot in memory, not just an editable version label. They never mark the original proposal accepted/won. An edited offer requires a fresh response.
5. Customer Excel download lives inside the **existing Save, backup & reset** tools, not a new menu. Actual `.xlsx`, one public values-only sheet, no formulas, hidden sheets, internal margins/private notes or write-back. Current working quotation snapshot; not an immutable published deployment or signed document.

Further catalogue work, CRM, survey UI, automated notifications, real public response endpoints/identity checks, production version-link policy and other backlog items are **not implemented** in this preview.

## Data and safety

- Explicit sample customer/reference and illustrative Leak Proof price ₹84,000 are seeded into the isolated copy. Solar defaults/calculations are the original app's, not hardcoded new results. No rainfall/engineering/prices are inferred.
- A bootstrap runs **before** original model/state scripts and replaces localStorage/sessionStorage with fresh in-memory stores, never reading the real ones. Fails closed if isolation cannot be established. Refresh discards preview proposals, tasks and responses.
- No auth tokens, live API modules, cloud saves, server response storage or emails. CSP blocks all network connections/forms. No telemetry/external fonts.
- External navigation and original live WhatsApp/location actions are blocked. Same-origin blob downloads remain allowed for local Excel/PDF/backup exports.
- A customer snapshot iframe has no scripts/forms/editables/live links and cannot run scripts, submit forms, open popups or navigate the top window. Customer input is rendered as text, not HTML.
- Sample responses are local, unverified acknowledgements—not a server timestamp, buyer identity verification, electronic signature, order or payment authorisation.
- Preview copy only; no production deploy, integration enablement or PR merge authorised.

## Verification

`test.cjs` runs against a local static server and rejects non-local origins. Dependencies resolve from `qa/node_modules` or NODE_PATH: Playwright and @sparticuz/chromium, with suitable Linux shared libraries. Run the repo's static server, then `node concept-preview/test.cjs`. Optional `CONCEPT_TEST_OUTPUT` stores screenshots outside Git.

**45 checks passed**: redirect to original Studio, every original DOM ID retained, no six-screen sidebar, normal original cover updates, Finance gross baseline ₹484,822.80 unchanged by separate/included scope price changes, original genFactor1460, unpriced/inclusion status, real storage isolation with sentinels, frozen report snapshot, version/snapshot-specific sample responses, genuine parsed customer XLSX, 390/768px layout, refresh reset, zero API/external requests and zero browser/CSP errors.

Original Power PDF export also passed: **6 pages, 2,294,097 bytes**, zero page errors. Report/hero imagery and original financial geometry not redesigned. Desktop Studio/customer and mobile customer screenshots reviewed. Full production regression/other backlog features not claimed complete.

## Publishing / cancellation

All changes stay within `concept-preview/`. A temporary Git index based on the remote feature HEAD publishes only this directory to the fixed feature branch, preserving the unrelated pre-existing working tree, index and older local HEAD. No reset/checkout/clean/force-push.

Removing this directory later removes the preview; no original entry point imports it. Review/remove the prototype before an eventual production merge if not wanted.

## Third party

Unmodified `vendor/xlsx.mini.min.js`: SheetJS CE, npm `@e965/xlsx` 0.20.3, Apache-2.0. Licence: `vendor/SHEETJS-LICENSE.txt`. No app dependency manifests changed. Only local sample workbook writing/test readback, not untrusted file import.
