# Terms and optional page-value footers

## Revised direction (supersedes the literal reference treatment)

The references are inspiration, not two banners to stack. The previous Terms-only illustration/handwriting strip and derived lettering file have been removed. The approved closing wave, lettering, values, images and logo remain unchanged.

### Terms

- Twelve terms in a two-column, row-major list, with **one integrated square icon-and-number badge, with a small superscript-style number inside its upper-right corner** per term. No disconnected orange corner flags or separate icon tiles.
- Original two-tone vector marks, navy ink and restrained warm/sage/lavender/blue pastels; explicit SVG colours for PDF export. No emoji/system-glyph dependency or replacement company logos.
- Existing authored titles, legal descriptions, substitutions, validity, duration, jurisdiction and note stay unchanged. Numeric day/week/month phrases are highlighted only after HTML escaping.
- Icon metadata stays with default term objects if reordered. Older saved objects retain positional defaults. Unknown/prototype icon names fall back safely.

### Page-specific value footers

`proposal-values.js` defines contextual variants for the standard detailed-proposal pages, except the protected cover and closing. Footer copy is different on each page, not a repeated four-value template. Editorial / horizon / precise / assurance / continuity / quiet treatments form one restrained visual family. No extra hero art, handwritten banner, dark boxes or duplicate value strips.

In the default fixture, accents fit on **About, Why Solar, EPC Scope, Installation Quality, Why KTM, Warranty and Terms**. Dense summary, solution, engineering, savings, investment and portfolio pages omit them. Optional financing/options can show their own contextual variant only if there is real room. Existing optional battery/system supplements and Power layouts are not redesigned.

The module runs after normal rendering/document reflow, measures content descendants and anchored notes, and only shows a band with at least 16 px breathing room above it and 12 px clearance from the company footer or existing footer note. It does **not** resize, move, hide, truncate or rewrite business content. Footer labels remain editable in each page's existing Advanced Edit group; blank labels can remove an optional band. Oversized authored copy causes the decorative band to be omitted, not crammed in. Footers are rechecked on render, fonts, image loads and viewport resize. No continuation-page cloning of accents.

The shared assets are loaded by the builder, local viewer and secure customer portal. Company contact/website/page numbering, financial calculations, export engine, backend/auth contracts, original photography and closing page are untouched. This is frontend presentation, not a production backend release.

## Focused proof

- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/terms-page.test.cjs`: legal-copy/template parity, safe text, editing/legacy defaults, finance parity, integrated marks/two columns, A4/normal-flow/mobile fit and actual one-page PDF.
- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/proposal-values.test.cjs`: seven fitting default pages, distinct copy and five-plus treatments, real-space omission without resizing content, unknown-icon/XSS safety, empty-label removal, no duplicate renders, A4/mobile/continuation geometry, finance parity and actual three-page PDF with different footer designs.
- Closing-page and customer-feedback browser regression suites separately protect the approved closing/footer and real disposable save/retry/inbox path.

All fixtures are local and disposable, with production API calls intercepted or absent. Screenshots/PDFs stay under ignored `qa/shots/terms-page/` and `qa/shots/proposal-values/`.
