# Terms and consistent navy page footers

## Revised direction (supersedes the literal reference treatment)

The references are inspiration, not two banners to stack. The previous Terms-only illustration/handwriting strip and derived lettering file have been removed. The approved closing wave, lettering, values, images and logo remain unchanged.

### Terms

- Twelve terms in a two-column, row-major list, with **one integrated square icon-and-number badge, with a small superscript-style number inside its upper-right corner** per term. No disconnected orange corner flags or separate icon tiles.
- Original two-tone vector marks, navy ink and restrained warm/sage/lavender/blue pastels; explicit SVG colours for PDF export. No emoji/system-glyph dependency or replacement company logos.
- Existing authored titles, legal descriptions, substitutions, validity, duration, jurisdiction and note stay unchanged. Numeric day/week/month phrases are highlighted only after HTML escaping.
- Icon metadata stays with default term objects if reordered. Older saved objects retain positional defaults. Unknown/prototype icon names fall back safely.

### Uniform floating panels (supersedes edge-attached strips and expansions)

Every standard content-page footer is now **718 × 46 px on the 794 × 1123 A4 canvas**, inset **38 px from either side and 6 px from the bottom**. Optional/system pages and automatic continuation pages use the same dimensions, as do all six Power pages. The protected cover and approved closing wave retain their dedicated designs; they are not given a second panel.

There are no full-bleed bars or variable-height value expansions. One rounded floating navy panel holds the page-specific vector values and the original live company/contact/website/tagline/page-number metadata. A restrained copper curve, soft shadow and small line-art flourish reference the closing palette without copying its signature/large wave. The panel is always present and always the same size. Blank or oversized optional value labels may suppress only that row, not the panel or contact metadata. Stored authored copy is retained, never cut or rewritten.

Business text size, chart dimensions and calculations are unchanged. Default body bottom whitespace is reserved at 66 px; existing larger reservations are retained. Anchored notes/disclaimers are raised into that reserved whitespace. The dense Savings page recovers a few pixels by reducing rule/chart margins only. The existing continuation engine observes the real footer bounds for authored longer content; the export engine is unchanged. All default content-page descendants are checked for a clear gap above the panel.

Value labels remain editable in each page's Advanced Edit group. Rendering does not accumulate wrapper/label rows, and continuation panels preserve the same live metadata. Footer geometry stays consistent at mobile preview scales.

The shared assets are loaded by the builder, local viewer and secure customer portal. Company contact/website/page numbering, financial calculations, export engine, backend/auth contracts, original photography and closing page are untouched. This is frontend presentation, not a production backend release.

## Focused proof

- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/terms-page.test.cjs`: legal-copy/template parity, safe text, editing/legacy defaults, finance parity, integrated marks/two columns, A4/normal-flow/mobile fit and actual one-page PDF.
- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/proposal-values.test.cjs`: exact identical floating dimensions/offsets, default content/Power/continuation fit, no duplicate panels, unknown-icon/XSS safety, optional-row overflow/blank handling, finance parity, mobile fit and an actual three-page PDF across dense and spacious pages.
- Closing-page and customer-feedback browser regression suites separately protect the approved closing/footer and real disposable save/retry/inbox path.

All fixtures are local and disposable, with production API calls intercepted or absent. Screenshots/PDFs stay under ignored `qa/shots/terms-page/` and `qa/shots/proposal-values/`.
