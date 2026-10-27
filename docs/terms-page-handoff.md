# Terms and consistent navy page footers

## Revised direction (supersedes the literal reference treatment)

The references are inspiration, not two banners to stack. The previous Terms-only illustration/handwriting strip and derived lettering file have been removed. The approved closing wave, lettering, values, images and logo remain unchanged.

### Terms

- Twelve terms in a two-column, row-major list, with **one integrated square icon-and-number badge, with a small superscript-style number inside its upper-right corner** per term. No disconnected orange corner flags or separate icon tiles.
- Original two-tone vector marks, navy ink and restrained warm/sage/lavender/blue pastels; explicit SVG colours for PDF export. No emoji/system-glyph dependency or replacement company logos.
- Existing authored titles, legal descriptions, substitutions, validity, duration, jurisdiction and note stay unchanged. Numeric day/week/month phrases are highlighted only after HTML escaping.
- Icon metadata stays with default term objects if reordered. Older saved objects retain positional defaults. Unknown/prototype icon names fall back safely.

### Quiet full-width running footer (latest direction supersedes repeated waves)

After seeing the repeated waves, the user said the pages felt crowded and delegated the design decision. The content pages now use a restrained **full-width 794 × 34 px footer at the bottom edge**, matching the A4 page width. A white surface, fine neutral rule, short copper accent and 3 px navy baseline provide a consistent branded finish without a large dark block. Contact, website, shared tagline and page numbering remain live and legible. All six Power pages and continuation pages share the same quiet treatment.

Repeated value icons, handwritten labels, leaf artwork, floating cards and business-page waves have been removed. The **approved full wave and values remain only on the closing page**, where they form the document's ending. The cover and all original photography are unchanged.

The footer-only rendering module and copied wave SVG have been removed from page loads/repository. Retired per-page footer-value editor fields are removed; previously stored value data is retained untouched. The original shared footer tagline remains editable. No source data migration is performed.

The large footer space reservations and spacing-tightening overrides are removed, restoring the original business-page whitespace, table padding, chart spacing and authored-content continuation behaviour. Body type sizes, chart dimensions, calculations and legal wording remain unchanged. There is no custom footer JavaScript, render wrapper, resize listener or dynamic visibility logic.

The shared assets are loaded by the builder, local viewer and secure customer portal. Company contact/website/page numbering, financial calculations, export engine, backend/auth contracts, original photography and closing page are untouched. This is frontend presentation, not a production backend release.

## Focused proof

- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/terms-page.test.cjs`: legal-copy/template parity, safe text, legacy icon defaults and retired-field removal, finance parity, integrated marks/two columns, A4/normal-flow/mobile fit and actual one-page PDF.
- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/proposal-values.test.cjs`: full-width bottom-edge geometry, no repeated decorative content, default/Power/continuation clearance, live and safe shared footer copy, retained legacy data, finance parity, mobile fit and actual three-page PDF.
- Closing-page and customer-feedback browser regression suites separately protect the approved closing/footer and real disposable save/retry/inbox path.

All fixtures are local and disposable, with production API calls intercepted or absent. Screenshots/PDFs stay under ignored `qa/shots/terms-page/` and `qa/shots/proposal-values/`.
