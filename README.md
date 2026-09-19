# Quotation Studio — Solar EPC Proposal System

A single-page web app that builds a premium **15-page rooftop-solar sales
proposal** — live A4 preview on the right, input form on the left, charts,
financial analytics and one-click PDF export. Fully offline after checkout:
no build step, no CDN, all libraries and fonts bundled locally.

Open `quotation.html` in a browser, or serve the folder with any static server.

## The 15-page proposal journey

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
| 11 | Why Choose Us | Differentiators + five commitments |
| 12 | Projects Portfolio | 9 reference projects across 3 sectors |
| 13 | Warranty & Installation Journey | Warranty cards + 6-step journey |
| 14 | Terms & Conditions | 12 plain-language terms, auto-filled validity/duration/jurisdiction |
| 15 | Acceptance & Contact | Next steps, urgency highlight, CTA band, signature blocks |

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
- **Versioning**: reference no. + version chip on cover, header meta on every page
- **Advanced Edit**: every headline/paragraph/card across all 15 pages
- **Per-page photo uploads** and logo replacement
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
