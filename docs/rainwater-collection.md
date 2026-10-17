# Full-image system heroes and optional Leak Proof rainwater collection

Status: **owner authorised feature-branch push and Vercel Preview on 17 October
2026** ("vercel through link please"), after local verification. No PR merge or
manual production deployment is authorised. The linked Cloudflare Git auto-build
may also trigger on push; report its outcome separately. c83b3a3 is the previous
published checkpoint, not the new rainwater preview.

## Presentation

System overview heroes now use a full-width photograph and a transparent gradient
behind a left-side title, matching the BESS visual direction. There is no hard
left/right partition. Images retain `object-fit: contain`: page-fit adjustments
can reduce image height but do not crop the photograph. Bounded spacing/image
height adjustments keep long custom text on the existing A4 pages, with export
preflight still rejecting unreasonably overlong content rather than clipping it.

The visible AI/concept/manufacturer image badges and the small under-image
caption were removed as requested. This is a presentation change, not a claim
that generated images are verified projects or manufacturer photographs. Asset
provenance remains documented in `system-input-hierarchy.md`. Existing engineering
and scope limitations remain; they are not replaced by an authenticity badge.

Pricing and important configuration cards stay open. Expert settings stay folded.
The previous colour roles and price-first input order are preserved.

## Optional collection scope

Leak Proof alone exposes a **Rainwater harvesting & drainage** card immediately
below its pricing card. The collection option starts **off**, so old quotations
retain their page count and scope. Roof drainage continues to follow the agreed
Leak Proof scope; selecting harvesting is not automatic inclusion of a tank,
filter, recharge works or a second installation price.

When enabled, routine inputs are route, price basis, catchment area, annual
rainfall, runoff/recovery assumptions and rainfall reference. Storm/event checks,
first flush, proposed storage capacity and custom collection interfaces are
folded. No climate, runoff coefficient, recovery percentage, catchment area,
tank volume, pipe size, rainfall source or price is guessed or defaulted.

A blank collection-area override follows the **entered covered roof footprint**.
An invalid explicit override does not fall back silently. Solar kWp, module count
and sloping PV area are not used as a fabricated collection footprint.

The deterministic SVG shows roof/gutter → downpipe → first-flush branch → filter
→ the chosen storage/recharge/pending route, with overflow. It is a schematic,
not a pipe fabrication or hydraulic-capacity drawing. No generated image or
manufacturer API is required for the drawing.

## Calculation contract (`assets/js/rainwater.js`)

Only entered, finite, dimensionally compatible values are used:

- 1 mm rain over 1 m² equals 1 litre.
- Annual collection potential (L/year) = footprint (m²) × annual rainfall
  (mm/year) × runoff fraction × recovery fraction.
- This annual figure is **before event-wise first-flush and storage overflow
  losses**, not guaranteed annual water delivered or financial savings.
- Storm runoff (L/s) = area × entered intensity (mm/hour) × runoff fraction / 3600.
  This is runoff before filtration, not a claim about gutter/downpipe capacity.
- Event runoff (L) = area × event rain × runoff fraction.
- First-flush diversion target (L) = area × entered diversion depth.
- Event delivery (L) = max(0, event runoff − diversion target) × recovery fraction.
- Storage capture for that event = min(event delivery, entered tank capacity),
  explicitly assuming an empty tank. Storage is not automatically sized.

Missing/invalid inputs produce pending values, not zero-filled estimates. Explicit
zero rainfall/runoff/recovery can produce zero potential. Coefficients must be
0–100%; areas and tank capacity positive. Negative/boolean/nonfinite inputs and
arithmetic overflow are rejected. Disabled/wrong-template options expose no
volume/flow result. Recharge routing does not infer infiltration, groundwater
quality, permissions or achievable recharge volume. Water quality/potability,
roofing weather-tightness and hydraulic design remain separate site checks.

## Commercial and document linkage

Harvesting is either a separately quoted add-on, outside the entered solar and
system totals, or explicitly intended within the preparer's entered system/base
quote. Included mode needs its own strict preparer acknowledgement; changing
technical assumptions, roof scope, base pricing or system price invalidates it.
No price is automatically added to Finance/BOM or assumed incorporated.

The selected collection scope appears on the cover, executive/solution/EPC scope
context and investment scope note. The overview and one-page system PDF identify
its scenario and commercial basis. With collection enabled, the detailed system
report adds one substantive **Rainwater Collection** page: the diagram, volume/
flow metrics, entered references, event limits, scope, pricing and calculation
method. The normal two-page system report becomes three pages; the standard
six-page Power Proposal stays six and includes explicit collection disclosure.

Main navigation, page numbers, download names/menu counts, Customer View and
PDF snapshots derive from the same state. Standalone-only system reports retain
the collection page even when excluded from the main solar proposal. The cover
also now identifies a selected BESS-only option instead of omitting its title.

JSON/normal form persistence uses the new default keys; old proposals default
collection off. Cancellation protects entered water scope. A confirmed actual
system-template replacement clears stale collection values/acknowledgements.
Switching to BESS/none preserves dormant values, consistent with existing system
behaviour. Private review rows expose missing collection, rainfall-reference,
storm/first-flush and commercial inputs without certifying engineering approval.

Builder, share and portal entry points load the new dependency. Explicit legacy
QA script loaders were updated likewise; integration and Customer View shell-count
assertions change from 21 to 22 because of the new hidden optional page. The
ordinary initial visible proposal remains 15 pages.

## Verification

- `qa/rainwater.test.cjs`: 12 focused checks + 256 bounded scenarios: units,
  annual/event/flow arithmetic, first-flush/tank caps, area linkage, strict flags,
  missing/invalid/overflow behaviour, no automatic financial effects and reviews.
- `qa/rainwater-browser.test.cjs`: all nine image overlays, removed badges,
  opt-in card/route diagram, literal custom text, acknowledgement invalidation,
  cancellation, reload and Customer View; actual 3/1/18/6-page PDFs. Dense
  commercial/BOM/loan + long custom text and reference fit both the full report
  (including investment/financing) and Power Proposal, with no mobile overflow.
- Existing minimal, unified and review browser workflows pass, including custom
  additions, independent BESS and legacy combined proposals, photo priority and
  actual system PDFs.
- Package matrix: 72 category/preset/price-mode combinations + 8 dense cases,
  with actual 2/1/6/17-page reports for non-harvesting cases, passes.
- Actual Duplicate → JSON export → New → file import preserves 19 scope, water,
  reference, commercial and acknowledgement fields; the new proposal resets off.
- Finance 82, integration 117, render reconciliation 123, supplements 63,
  knowledge/voices 13 and pure package 16 checks pass. Additional options 40,
  sync 106, export-preflight 50, catalogue-sync 27 and engineering-standards 58
  checks pass, as does the existing input-hierarchy browser suite.
- Two legacy catalogue harnesses remain red: module-autofill (8) and product-match
  (19). Both were run against archived c83b3a3 code/markup too and fail with the
  same counts/missing APIs; these are not introduced by this batch and were not
  repaired as unrelated catalogue work.
- Finance, CloudBridge, BESS engine and app.css match this batch's starting
  SHA-256 hashes. genFactor1460 is unchanged.

Ignored proofs and illustrative PDFs: `qa/shots/rainwater/`. The sample's 100 m²,
800 mm/year, 85% capture and 90% recovery produce 61,200 L/year potential; a 30 mm
event, 1 mm first flush and 2,000 L tank produce 2,205 L event delivery capped at
2,000 L storage. These are **test inputs, not Pune climate data or measured site
values**. Run through :8080; sandbox Chromium needs
`LD_LIBRARY_PATH=/tmp/al2023/lib`. No whole-repository green claim is made.
