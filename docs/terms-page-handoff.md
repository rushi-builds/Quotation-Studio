# Terms and consistent navy page footers

## Revised direction (supersedes the literal reference treatment)

The references are inspiration, not two banners to stack. The previous Terms-only illustration/handwriting strip and derived lettering file have been removed. The approved closing wave, lettering, values, images and logo remain unchanged.

### Terms

- Twelve terms in a two-column, row-major list, with **one integrated square icon-and-number badge, with a small superscript-style number inside its upper-right corner** per term. No disconnected orange corner flags or separate icon tiles.
- Original two-tone vector marks, navy ink and restrained warm/sage/lavender/blue pastels; explicit SVG colours for PDF export. No emoji/system-glyph dependency or replacement company logos.
- Existing authored titles, legal descriptions, substitutions, validity, duration, jurisdiction and note stay unchanged. Numeric day/week/month phrases are highlighted only after HTML escaping.
- Icon metadata stays with default term objects if reordered. Older saved objects retain positional defaults. Unknown/prototype icon names fall back safely.

### Full-bleed wave with icons and metadata inside (latest correction)

The user clarified that the wave/icons were wanted; only their placement and the separate white metadata baseline were wrong. The quiet-footer removal is superseded. The approved wave artwork and page-specific vector values are restored on business pages, with **left: 0, right: 0, bottom: 0**. No rounded capsule, inset gap, drop shadow or separate white contact strip is used.

Every standard content/optional/continuation footer and all six Power footers have a **794 × 78 px full-bleed footprint** on the 794 × 1123 A4 canvas. The SVG preserves the approved closing wave paths, gradients, copper ribbon and leaf; only its navy base is extended from y=142 to y=174 so the phone, website, shared tagline and page number fit **inside the dark design**, below the icons. The original closing page and cover are untouched.

Bottom whitespace is reserved at 104 px, keeping existing larger reservations. Notes/disclaimers sit above the design. Only whitespace/padding is adjusted on Savings and compact Power About; charts, body type sizes, calculations, technical values and legal copy remain unchanged. The existing continuation/export mechanisms are unchanged.

Per-page value-label editor fields are restored, along with existing stored values. Value copy is escaped; unsafe icon names fall back safely. Blank or oversized optional value rows can be omitted without removing the wave or metadata. There is one footer per page, not stacked banners.

The shared assets are loaded by the builder, local viewer and secure customer portal. Company contact/website/page numbering, financial calculations, export engine, backend/auth contracts, original photography and closing page are untouched. This is frontend presentation, not a production backend release.

## Focused proof

- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/terms-page.test.cjs`: legal-copy/template parity, safe text, legacy icon/value defaults and live footer editing, finance parity, integrated marks/two columns, A4/normal-flow/mobile fit and actual one-page PDF.
- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/proposal-values.test.cjs`: flush edge geometry, closing-wave path reuse with base extension, icons and live metadata inside the navy area, default/Power/continuation clearance, safe copy/icon fallbacks, finance parity, mobile fit and actual three-page PDF.
- Closing-page and customer-feedback browser regression suites separately protect the approved closing/footer and real disposable save/retry/inbox path.

All fixtures are local and disposable, with production API calls intercepted or absent. Screenshots/PDFs stay under ignored `qa/shots/terms-page/` and `qa/shots/proposal-values/`.
