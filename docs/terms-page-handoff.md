# Terms and consistent navy page footers

## Revised direction (supersedes the literal reference treatment)

The references are inspiration, not two banners to stack. The previous Terms-only illustration/handwriting strip and derived lettering file have been removed. The approved closing wave, lettering, values, images and logo remain unchanged.

### Terms

- Twelve terms in a two-column, row-major list, with **one integrated square icon-and-number badge, with a small superscript-style number inside its upper-right corner** per term. No disconnected orange corner flags or separate icon tiles.
- Original two-tone vector marks, navy ink and restrained warm/sage/lavender/blue pastels; explicit SVG colours for PDF export. No emoji/system-glyph dependency or replacement company logos.
- Existing authored titles, legal descriptions, substitutions, validity, duration, jurisdiction and note stay unchanged. Numeric day/week/month phrases are highlighted only after HTML escaping.
- Icon metadata stays with default term objects if reordered. Older saved objects retain positional defaults. Unknown/prototype icon names fall back safely.

### Actual closing-wave design (supersedes rounded floating panels)

The user rejected the rounded navy capsule: they meant the flowing footer from the approved closing page, not a new boxed interpretation. Content-page footers now use **the exact closing SVG paths, navy gradients, copper ribbon/edge, faint grid and right-hand leaf** exported as `assets/images/proposal-footer-wave.svg`. This is reused vector artwork, not a new generated image or CSS approximation. No rectangular card fill, rounded border or drop shadow remains. The closing page itself and its unique handwritten lettering remain untouched.

All standard content-page footers—including optional/system and continuation pages—and all six Power pages share **754 × 78 px**, inset **20 px horizontally and 6 px above the bottom** on the 794 × 1123 A4 canvas. The vector wave occupies the top 64 px. Page-specific values sit directly on its lower navy section, with the original live company/contact/website/tagline/page number on the clean baseline beneath. No duplicate banner or capsule is stacked with it. Blank/oversized optional labels suppress only that row, not the wave or original metadata.

Bottom whitespace is reserved at 104 px, retaining existing larger reservations. Anchored notes/disclaimers are positioned above the wave. On Savings and the compact Power About page, only spacing/padding is tightened; business type sizes, chart dimensions and calculations are unchanged. The existing continuation engine observes the larger real footer bounds for long authored content; the export engine is unchanged. All default content descendants and all six Power page bodies are checked for a clear gap above the wave.

Value labels remain editable in each page's Advanced Edit group. Rendering does not accumulate metadata wrappers or value rows. The cover and approved closing retain their dedicated designs, with no second wave added.

The shared assets are loaded by the builder, local viewer and secure customer portal. Company contact/website/page numbering, financial calculations, export engine, backend/auth contracts, original photography and closing page are untouched. This is frontend presentation, not a production backend release.

## Focused proof

- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/terms-page.test.cjs`: legal-copy/template parity, safe text, editing/legacy defaults, finance parity, integrated marks/two columns, A4/normal-flow/mobile fit and actual one-page PDF.
- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/proposal-values.test.cjs`: exact closing-path/gradient identity and uniform wave dimensions/offsets, default content/Power/continuation fit, no duplicate panels, unknown-icon/XSS safety, optional-row overflow/blank handling, finance parity, mobile fit and an actual three-page PDF across dense and spacious pages.
- Closing-page and customer-feedback browser regression suites separately protect the approved closing/footer and real disposable save/retry/inbox path.

All fixtures are local and disposable, with production API calls intercepted or absent. Screenshots/PDFs stay under ignored `qa/shots/terms-page/` and `qa/shots/proposal-values/`.
