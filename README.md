# Quotation Studio — Solar EPC Proposal System

A single-page web app that builds a premium **15-page rooftop-solar sales
proposal** — live A4 preview on the right, input form on the left, charts,
financial analytics and one-click PDF export. Fully offline after checkout:
no build step, no CDN, all libraries and fonts bundled locally.

Open `quotation.html` in a browser, or serve the folder with any static server.

## The 15-page proposal journey

The journey is now **15–17 pages**: two conditional pages appear only when
their data exists and all later pages renumber automatically — in the
preview, the exported PDF and the customer share view.

- **System Options** (page 3): appears when a proposal carries two or more
  saved system options (Good / Better / Best).
- **Financing & EMI** (page 11): appears when loan amount, interest rate and
  tenure are entered — reducing-balance EMI, total interest, monthly savings
  vs EMI over the tenure with the crossover month, net monthly outgo. Leave
  the loan fields blank for a cash-purchase proposal.

| # | Page | Purpose |
|---|------|---------|
| 1 | Cover | Personalised, capacity badge, validity date, version chip |
| 2 | Executive Summary | Hero numbers (net investment → 25-yr earnings), KPI dashboard, investment journey, "what you are getting" |
| 3 | About Us | Company story, stats, differentiators |
| 4 | Why Rooftop Solar | Benefits + live savings metrics |
| 5 | Proposed Solution | System highlights incl. auto module count & generation |
| 6 | Technical Specification | Visual system diagram (array → inverter → meter → grid/home), full component tables, DC/AC ratio, area fit-check |
| 7 | EPC Scope | Deliverables, client responsibilities, additional scope |
| 8 | Installation Quality | Standards + six-point handover checklist |
| 9 | Generation & Savings Analysis | Cumulative-savings-vs-investment chart, annual savings bars, milestone table, assumptions strip |
| 10 | Investment & Cost Breakdown | Cost cards with ₹/Wp, cost build-up chart, optional BOM donut, payment schedule with ₹ amounts, "what the price includes" |
| 11 | Financing & EMI *(optional)* | Loan recap, EMI/interest/savings cards, savings-vs-EMI chart, crossover callout |
| 12 | Why Choose Us | Differentiators + five commitments |
| 13 | Projects Portfolio | 9 reference projects across 3 sectors |
| 14 | Warranty & Installation Journey | Warranty cards + 6-step journey |
| 15 | Terms & Conditions | 12 plain-language terms, auto-filled validity/duration/jurisdiction |
| 16 | Acceptance & Contact | Next steps, urgency highlight, CTA band, signature blocks |

## Architecture

```
quotation.html          Slim shell: form panel + 15 A4 page skeletons (no inline CSS/JS)
assets/
  css/app.css           Tokens, form, A4 pages, components, responsive, print
  js/content.js         ALL brochure text (CONTENT) + portfolio data — data only
  js/finance.js         Calculation engine (pure, UMD) — no DOM access
  js/icons.js           Inline-SVG icon set (emoji-free: safe for html2canvas PDF)
  js/charts.js          Dependency-free canvas charts (payback, bars, bridge, donut)
  js/model.js           Proposal store: object model, statuses, immutable versions
  js/state.js           Form defaults + collect/apply + proposal file import/export
  js/equipment.js       Company equipment catalog (modules/inverters/structures/cables)
  js/render.js          Page renderers + PAGES[] registry (order, numbering, nav, PDF loop)
  js/editor.js          "Advanced Edit" panel — every text element on all 15 pages
  js/export.js          html2canvas → jsPDF pipeline + PDF metadata
  js/app.js             Bootstrap: wiring, proposal manager, autosave, nav, scaling
  images/  fonts/  vendor/   Bundled photos, Inter/Poppins, html2canvas + jsPDF
docs/ROADMAP.md         Master product vision & phased plan
qa/
  finance.test.js       47 unit tests for the calculation engine (node qa/finance.test.js)
  integration.test.js   95 end-to-end tests in jsdom (node qa/integration.test.js)
  browser.test.js       Real-browser QA (charts, overflow, PDF, mobile) — needs Chromium
```

**Every customer-facing number traces back to form inputs or a documented
calculation.** Charts are drawn from the same finance object as the text, so
they can never disagree. Values that are not entered (BOM breakdown, monthly
bill, available roof area) cause the related UI section to hide or show a
clearly-marked placeholder — nothing is invented.

## Proposal management (Phase 1 foundation)

- **Multiple proposals** with a manager at the top of the form: New /
  Duplicate / New version / Delete, status workflow (Draft → Internal Review →
  Ready → Sent → Viewed → Negotiation → Accepted/Rejected/Expired/Archived)
- **Immutable versioning** — "New version" clones the proposal, bumps v1.0 →
  v1.1 and links back; historical versions are never overwritten
- **Everything autosaves** per proposal (form + text edits + photos), with
  export/import of proposal files for sharing between sales reps
- **Equipment catalog** — company-level master data driving the System Design
  dropdowns; electrical datasheet fields stay blank until entered
- Storage is a thin `Proposals` store over localStorage today; the same API
  maps 1:1 onto a backend when the platform goes multi-user (see ROADMAP.md)

## Financial engine (`finance.js`)

- Project cost = capacity × ₹/kWp; GST on top; Indian number formatting.
- Subsidy: PM Surya Ghar slabs (₹30,000/kW × 2 + ₹18,000 × 1, capped ₹78,000)
  **for residential projects only** — commercial/industrial show nil unless an
  override is entered. The subsidy caption always states how it was derived.
- Payback: interpolated crossing of the *escalated/degraded* cumulative
  savings curve (same curve as the chart). IRR via bisection on 25-year flows.
- Engineering: module count (ceil of array size), installed kWp, array area,
  DC/AC ratio, effective ₹/unit over 25 years, CO₂/tree equivalents with
  editable factors.
- Bill-offset % only when the customer's average bill is entered (capped 100%).
- Payment schedule: ₹ amounts per milestone, with a warning when % ≠ 100.

## Key features

- **Live A4 preview** with page navigator (auto scroll-spy) and mobile scaling
- **Autosave** to localStorage + **proposal files** (.json export/import)
- **Versioning**: live reference number on the cover; reference/version metadata on the inner pages
- **Advanced Edit**: every headline/paragraph/card across all 15 pages
- **Per-page photo uploads**; the approved cover logo is locked consistently across all pages
- **PDF export**: html2canvas (2×) → jsPDF, metadata set, smart filename
  `Proposal_<Customer>_<kWp>_<Ref>.pdf`; native browser print also produces
  exactly 15 A4 sheets (`@media print`, headers/footers/page numbers included)
- **Validation without nagging**: payment-total and BOM-coverage warnings,
  area fit-check, N/A states for subsidy by connection type

## Testing

```
node qa/finance.test.js        # engine unit tests
node qa/integration.test.js    # full app boot + interactions in jsdom
```

## Replacing photos

Use the per-page upload buttons in the form, or drop files into
`assets/images/` keeping the same filenames. Project thumbnails are mapped in
`PROJECT_IMAGES` (`content.js`) and replaceable per project via Advanced Edit.

## Roadmap-ready

The `PAGES[]` registry, pure finance module and single CONTENT object make it
straightforward to add: multiple system options/packages, proposal comparison,
revision history, reusable templates and other customer types without a rebuild.


### Live cover values

Page 1 keeps the supplied artwork, with visible HTML fields for customer name,
location, system size, proposal reference/date, project capacity, and calculated
25-year savings. These use the existing form state and Finance calculation, so
control-panel edits, saved proposals, print and PDF all share the same values.
Long values wrap/shrink inside their allotted areas. The artwork's logo, headings
and fixed labels are not text-editable; the advanced editor explains this rather
than presenting ineffective cover-copy controls.

The original upload is archived unchanged at `assets/ktm-cover-page-1.png`.
`assets/images/cover-editable-background.png` clears only the seven variable-value
areas. To regenerate it, run `python qa/build-cover-template.py` (requires
ImageMagick). If the original artwork dimensions/layout change, recalibrate the
rectangles and matching CSS positions before regenerating.

Cover regression: `node qa/cover-sync.test.js` against the dev server on port 8080
(or set `QA_BASE`). Uses the QA Puppeteer/Chromium dependencies and requires the
standard Chromium shared libraries. Screenshots are written to ignored `qa/shots/`.


### Reviewed PR #7 features

- Quick presets are indicative starting points, not verified offers. Applying one
  asks for confirmation, preserves customer data, and clears stale report links,
  BOM, financing, subsidy overrides and unspecified module dimensions. Equipment
  values not in the local catalog are preserved through save/reload.
- Before/After is an **energy-value offset illustration**, shown only with an
  entered monthly bill. It is not a DISCOM fixed-charge or export-settlement model.
- Commercial/industrial tax figures are explicitly illustrative, with editable
  depreciation/tax rates under **All settings**. Eligibility and asset basis need
  tax-adviser confirmation; they do not reduce investment or change payback.
- One end-of-proposal customer panel opens supplied HTTP(S) Arka/PVsyst links. After confirming interest, the customer can prepare a WhatsApp request for selected engineering services. It does not create a 3D design or run
  PVsyst, and it never invents a contact number.
- Customer acceptance is a **local typed acknowledgement**, requiring name and
  consent. It is not a verified digital signature or server-side workflow. The
  customer must send the WhatsApp message to notify the team. Stale/expired
  proposals and failed browser-storage writes cannot report success.
- `share.html?p=...` still reads **this browser's localStorage**. A URL alone does
  not deliver proposal data to another device; use the PDF/file-import workflow
  until authenticated shared storage and a real acceptance backend are implemented.

QA: `npm --prefix qa install --legacy-peer-deps` then `npm --prefix qa test`.
For browser tests, start a server and set `QA_BASE` for `npm --prefix qa run test:browser`.
Chromium needs its shared libraries (`LD_LIBRARY_PATH` may be needed for Lambda bundles).
See `docs/audit-2026-09-21.md` for the reviewed commits, findings and verification.


### Consistent branding and qualified engineering requests

The approved cover mark has transparent surface-aware variants:
`assets/images/ktm-logo-light.png` uses navy/orange ink on white headers;
`assets/images/ktm-logo-dark.png` uses white/orange ink on the closing photograph.
The original navy-backed crop is retained only as an archive, not a displayed logo.
No separate logo-upload override can leave the cover and the remaining pages with
different identities. To regenerate the crop: `python qa/build-cover-logo.py`
(requires ImageMagick). The source cover and its live fields are unchanged.

The customer action hub appears **once, after the proposal**:

1. Review the proposal, then select an interested/ready decision stage.
2. Select site feasibility/survey, missing Arka layout, and/or missing PVsyst report.
3. Confirm site locality and optionally a preferred discussion/visit window.
4. Review the prepared message; open WhatsApp and **send it yourself**, or copy it.

Existing report links are not offered as duplicate requests. The team must confirm
required data, feasibility, engineering scope, any fees and schedule. Preparing a
message does not book a survey, generate a simulation, accept an order or mark a
request delivered. Site documents are attached manually in WhatsApp, not uploaded
by this app. The local acknowledgement remains separate, optional and collapsed.
The browser-local sharing limitation documented above still applies.

Duplicate financial strips, repeated company-stat cards and duplicate inclusion
blocks were removed. Customer-screen report actions and paper signatures have one
visible home; print/PDF still includes its technical references and paper signature.
See `docs/branding-and-engineering-flow.md` for ownership and verification.


### Finding customer requests / latest visual refinement

- In the builder, the prominent **Customer requests: survey / 3D / PVsyst** button
  above the page preview saves the current proposal and opens Customer View at the
  actual request form (`#shareAcceptWrap`).
- In Customer View, **Request survey / 3D / PVsyst** in the header jumps instantly
  to that same form. The closing page also has an **Open request form** shortcut.
- The closing page shows the four-step process in the ordinary proposal and PDF;
  interactive buttons stay out of the exported PDF. The form itself is not duplicated.
- Selected story-page photos are larger; the portfolio prioritizes nine larger site
  photos instead of an extra stock hero. Dense engineering pages remain uncluttered.

Transparent logo generation, A4 photo/text/footer layout, popup/deep-link navigation,
mobile discovery, and print visibility are covered by `qa/visual-discovery.test.js`.
All original cover artwork remains untouched. Browser-local sharing limitations
still apply; these navigation changes are not a hosted customer portal.


### Illustrated system overview

Technical Specification now shows inline rooftop/component illustrations and
colour-coded wiring: **PV → DCDB → inverter → ACDB → property load bus**, with
local loads on the bus and a **bidirectional meter ↔ MSEDCL (MSEB)** service branch.
It is a conceptual grid-tied overview, not an installation wiring/approval drawing.
Module quantity/wattage and inverter rating follow the live inputs. Advanced Edit
retains custom labels; bounded wrapping/ellipsis prevents overflow and SVG titles
retain the full copy. No remote illustration assets are required.

`qa/system-diagram.test.js` covers topology, values, editable/safe text, label bounds,
print/PDF capture and desktop/mobile Customer View. The existing Tech Spec tests
still check A4 fit with no, one or both engineering reference links.

### Visual customer tools and PDF formats

Choose **Power Proposal — 2-page summary** or the existing **Detailed proposal**
from the PDF dropdown in the builder or Customer View. The short report uses the
same live equipment, financial model and system diagram; the detailed report keeps
all applicable pages. Export captures a consistent snapshot and refuses clipped
short summaries rather than silently hiding content.

Customer View now includes a **separate tariff/savings explorer**. It does not change
the saved quotation or PDF figures. On the closing page, **Explore Our Projects**
provides a scannable/clickable gallery QR. Set **Public destination URL** under **All settings → Customer experience — QR & audio**
in the builder; the QR stays hidden until a destination is supplied. `gallery.html`
is ready to publish, but preview deployments can require a Vercel login. Use a
permanent public URL for issued proposals and test it on another phone.

The bundled gallery currently contains published project **photographs**. Actual
approved video links can be added through `assets/js/gallery-media.js`, or the QR can
point to an existing public video playlist. No video, site-specific simulation or
subsidy approval is fabricated. Private quotation edits are not public-gallery edits.
See [the feature and verification guide](docs/proposal-experience.md).


### Advanced QR settings and optional spoken briefing

Open **All settings → Customer experience — QR & audio** to choose whether the QR
opens a project gallery, video/playlist or company website. Add the public HTTPS
URL whenever ready; no placeholder is printed in the meantime. The same choice
and link are used on the closing page and two-page Power Proposal.

The screen-only **Listen to your proposal** player offers English, Hindi and Marathi
scripts derived from current quotation values, with play/pause/stop and a readable
transcript. It uses available device/browser speech voices—not a hosted AI service.
Missing language voices are clearly reported, never silently replaced. The scenario
slider does not change narration. See `docs/proposal-experience.md` for privacy,
voice availability, persistence and test coverage.
