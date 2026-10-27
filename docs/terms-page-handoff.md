# Terms and light contextual footer accents

## Revised direction (supersedes the literal reference treatment)

The references are inspiration, not two banners to stack. The previous Terms-only illustration/handwriting strip and derived lettering file have been removed. The approved closing wave, lettering, values, images and logo remain unchanged.

### Terms

- Twelve terms in a two-column, row-major list, with **one integrated square icon-and-number badge, with a small superscript-style number inside its upper-right corner** per term. No disconnected orange corner flags or separate icon tiles.
- Original two-tone vector marks, navy ink and restrained warm/sage/lavender/blue pastels; explicit SVG colours for PDF export. No emoji/system-glyph dependency or replacement company logos.
- Existing authored titles, legal descriptions, substitutions, validity, duration, jurisdiction and note stay unchanged. Numeric day/week/month phrases are highlighted only after HTML escaping.
- Icon metadata stays with default term objects if reordered. Older saved objects retain positional defaults. Unknown/prototype icon names fall back safely.

### Light icon rows, faint dividers and outer petals (latest approved direction)

The user approved returning to the earlier light icon layout on selected pages, with original text/images restored (not moved up), the contact footer at the bottom, short faint vertical dividers between icons, and two subtle outer-corner petals. The heavy business-page waves and copied wave SVG are removed. The original cover and approved closing wave/lettering remain untouched.

The pre-wave lightweight layout is restored: default icon rows fit on **About, Why Solar, EPC Scope, Installation Quality, Why KTM, Warranty and Terms**. Other standard-page variants are considered only if actual space permits. No content is lifted, shrunk or hidden to make a row fit. The contact/website/tagline/page-number footer stays full-width at the bottom with its quiet navy/copper finish.

Each visible icon group has **one lavender petal at the left outer corner and one peach petal at the right outer corner**, as aria-hidden, noninteractive SVG. There are no per-icon petal backplates, card backgrounds or shadows. Between adjacent icon cells are short 1 × 18 px, 50%-opacity neutral dividers. The previous horizontal rails and extra full-row top rule are removed. Icon palette and page-specific wording remain unchanged.

All large footer reservations, lifted note positions, and Savings/Power spacing-tightening overrides are removed. The optional-row module measures remaining space after the ordinary source layout and skips the row if there is insufficient clearance. Legacy/custom value labels remain editable and escaped; blank/oversized optional rows can be omitted while the contact footer remains visible. No calculation, source business wording or export-engine change is made.

The shared assets are loaded by the builder, local viewer and secure customer portal. Company contact/website/page numbering, financial calculations, export engine, backend/auth contracts, original photography and closing page are untouched. This is frontend presentation, not a production backend release.

## Focused proof

- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/terms-page.test.cjs`: legal-copy/template parity, safe text, legacy icon/value defaults and live footer editing, finance parity, integrated marks/two columns, A4/normal-flow/mobile fit and actual one-page PDF.
- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/proposal-values.test.cjs`: compares every default page's text/photo/chart geometry against the original template with footer presentation disabled; verifies seven fitting icon groups, two outer decorative petals, short faint dividers, no card backgrounds, real-space omission, safe editable copy, finance parity, mobile/continuation fit and actual three-page PDF.
- Closing-page and customer-feedback browser regression suites separately protect the approved closing/footer and real disposable save/retry/inbox path.

All fixtures are local and disposable, with production API calls intercepted or absent. Screenshots/PDFs stay under ignored `qa/shots/terms-page/` and `qa/shots/proposal-values/`.
