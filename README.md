# Quotation Studio — KTM Energy Experts

A single-page web app that builds a professional **10-page rooftop-solar quotation**:
live A4 preview on the right, input form on the left, one-click PDF export.

Open `quotation.html` in a browser (or serve the folder with any static server).
No build step, no CDN — all libraries, fonts, and images are bundled locally,
so it works fully offline after checkout.

## Project structure

```
quotation.html          Slim shell: form panel + 10 A4 preview pages (no inline CSS/JS)
assets/
  css/app.css           All styles: theme tokens, form, A4 pages, components, responsive
  js/content.js         All editable brochure text (CONTENT) + project portfolio data
  js/app.js             App logic: financial engine, renderers, editor, PDF export
  images/               Logo + one photo per page + project thumbnails (no baked-in text)
  fonts/                Self-hosted Inter + Poppins (woff2, latin + latin-ext, ₹ support)
  vendor/               html2canvas 1.4.1 + jsPDF 4.2.1 (pinned, offline)
```

## The 10 pages

1. About KTM (stats + differentiators) · 2. Cover (customer, capacity, date, ref)
3. Why Rooftop Solar (benefits + live savings metrics) · 4. Proposed Solution
5. EPC Scope (deliverables, responsibilities) · 6. Investment & Specification
7. Why Choose KTM · 8. Warranty & Installation Journey · 9. Projects Portfolio
10. Contact / Closing (banner, contact card, CTA band)

## Editing text

- **Quick edits** — "Advanced Edit" panel at the bottom of the form edits every
  headline, paragraph, and card on all 10 pages (grouped: Shared + Page 1…10).
- **Source edits** — change defaults in `assets/js/content.js` (`CONTENT` object).
- **Labels** — static labels live in `quotation.html`; dynamic values render via
  `assets/js/app.js` (`renderAll()` re-renders every page on any input change).

## Financial engine (`computeFinancials` in `app.js`)

- Project cost = capacity × ₹/kWp; GST added on top; totals in Indian numbering.
- Subsidy follows the PM Surya Ghar slabs (₹30,000/kW × 2 + ₹18,000 × 1,
  capped at ₹78,000 for 3 kW+), overridable from the form.
- Payback (discounted cash-flow with tariff escalation + panel degradation),
  IRR (Newton–Raphson on 25-year cash-flows), lifetime CO₂/trees equivalents.

## Replacing photos

Use the per-page **Photos** upload buttons in the form (each replaces one page
only), or drop new files into `assets/images/` keeping the same filenames.
Project thumbnails on page 9 are mapped in `PROJECT_IMAGES` (`content.js`) and
are individually replaceable from Advanced Edit → Page 9 → each project block.

## PDF export

"Generate & Download PDF" waits for fonts, rasterizes each A4 page with
html2canvas (2× scale), and saves `KTM_Quotation_<Customer>_<capacity>kWp.pdf`
via jsPDF. No server round-trip — everything runs in the browser.
