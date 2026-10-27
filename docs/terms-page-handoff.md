# Terms and consistent navy page footers

## Revised direction (supersedes the literal reference treatment)

The references are inspiration, not two banners to stack. The previous Terms-only illustration/handwriting strip and derived lettering file have been removed. The approved closing wave, lettering, values, images and logo remain unchanged.

### Terms

- Twelve terms in a two-column, row-major list, with **one integrated square icon-and-number badge, with a small superscript-style number inside its upper-right corner** per term. No disconnected orange corner flags or separate icon tiles.
- Original two-tone vector marks, navy ink and restrained warm/sage/lavender/blue pastels; explicit SVG colours for PDF export. No emoji/system-glyph dependency or replacement company logos.
- Existing authored titles, legal descriptions, substitutions, validity, duration, jurisdiction and note stay unchanged. Numeric day/week/month phrases are highlighted only after HTML escaping.
- Icon metadata stays with default term objects if reordered. Older saved objects retain positional defaults. Unknown/prototype icon names fall back safely.

### One footer family on every page (latest direction)

Every standard detailed-proposal page—including optional supplements and continuation pages—now has a **slim navy running footer** with muted copper edge, light contact/page-number text and a small line-art brand flourish. The company footer remains at its original 34 px footprint; no extra space is taken from the business content. The protected cover and closing already have their own designed finishes and remain unchanged. All six Power pages use the same compact navy family at the bottom edge.

Where there is genuine room, a shallow SVG navy curve and page-specific values **join directly into that same running footer**, rather than stacking a separate banner above it. Three restrained curve profiles keep one family, with no repeated handwriting or big leaf illustration. In the default fixture, the expanded finish fits on **About, Why Solar, Why KTM and Terms**. Dense pages, and pages with anchored legal/service notes, keep the slim designed footer—not a missing footer. Blank/oversized authored value labels remove only the optional expansion; the base navy finish always remains.

The module runs after normal rendering/document reflow, measures actual content descendants and requires 16 px breathing room above any expansion. It does **not** resize, move, hide, truncate or rewrite business content. Footer labels remain editable in each page's Advanced Edit group. Notes, photos, figures and legal copy take priority. Footers are rechecked on render, fonts, image loads and viewport resize. Continued pages receive the compact running finish without duplicating decorative value bands.

The shared assets are loaded by the builder, local viewer and secure customer portal. Company contact/website/page numbering, financial calculations, export engine, backend/auth contracts, original photography and closing page are untouched. This is frontend presentation, not a production backend release.

## Focused proof

- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/terms-page.test.cjs`: legal-copy/template parity, safe text, editing/legacy defaults, finance parity, integrated marks/two columns, A4/normal-flow/mobile fit and actual one-page PDF.
- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/proposal-values.test.cjs`: a designed running footer on every standard page and all six Power pages, four fitting default expansions, distinct copy and three curve treatments, real-space omission without resizing content, unknown-icon/XSS safety, empty-label removal, no duplicate renders, A4/mobile/continuation geometry, finance parity and actual three-page PDF covering both expanded and compact footer designs.
- Closing-page and customer-feedback browser regression suites separately protect the approved closing/footer and real disposable save/retry/inbox path.

All fixtures are local and disposable, with production API calls intercepted or absent. Screenshots/PDFs stay under ignored `qa/shots/terms-page/` and `qa/shots/proposal-values/`.
