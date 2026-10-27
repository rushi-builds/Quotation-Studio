# Terms and light contextual footer accents

## Revised direction (supersedes the literal reference treatment)

The references are inspiration, not two banners to stack. The previous Terms-only illustration/handwriting strip and derived lettering file have been removed. The approved closing wave, lettering, values, images and logo remain unchanged.

### Terms

- Twelve terms in a two-column, row-major list, with **one integrated square icon-and-number badge, with a small superscript-style number inside its upper-right corner** per term. No disconnected orange corner flags or separate icon tiles.
- Original two-tone vector marks, navy ink and restrained warm/sage/lavender/blue pastels; explicit SVG colours for PDF export. No emoji/system-glyph dependency or replacement company logos.
- Existing authored titles, legal descriptions, substitutions, validity, duration, jurisdiction and note stay unchanged. Numeric day/week/month phrases are highlighted only after HTML escaping.
- Icon metadata stays with default term objects if reordered. Older saved objects retain positional defaults. Unknown/prototype icon names fall back safely.

### Attached icon rows with closing text above (latest correction)

The user rejected the petals and requested that all closing copy, specifically the “Every KTM rooftop solar system…” paragraph, sit above the icons. The icon rows must attach directly to the contact footer, with left-side contextual headings on Why Solar and Installation Quality. The original cover and approved closing wave/lettering remain untouched.

The same seven default rows remain visible: **About, Why Solar, EPC Scope, Installation Quality, Why KTM, Warranty and Terms**. Every fitting row ends exactly at the contact footer's top edge (no detached 12 px gap). The contact/website/tagline/page-number footer remains full-width at the bottom. Optional rows require at least 24 px clearance from all real content, including closing notes; they never displace or shrink main text, cards, photographs or charts.

**Why Solar: THE SOLAR ADVANTAGE. Installation Quality: BUILT WITH CARE.** Both headings start on the left, before their three inline icon/label cells. All petal SVG/code/CSS are removed. A short copper/pale-sage segmented rule above each existing footer heading replaces the artwork. The short faint 1 × 18 px vertical dividers remain between icon cells. There are no icon backplates, footer cards, heavy waves or shadows.

The three source closing notes (Scope, Quality and Warranty) now follow their content in normal flow, above the icon row, rather than being absolutely anchored below it. Their wording, font size and colour are unchanged. This is the only intentional body-layout movement; all other main text, photo, card and chart positions are checked against the original template. The quoted Warranty paragraph remains the exact source string.

Legacy/custom value labels remain editable and escaped; blank/oversized optional rows can be omitted while the contact footer remains visible. No calculation, business/legal wording, image, export-engine or production-runtime change is made.

The shared assets are loaded by the builder, local viewer and secure customer portal. Company contact/website/page numbering, financial calculations, export engine, backend/auth contracts, original photography and closing page are untouched. This is frontend presentation, not a production backend release.

## Focused proof

- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/terms-page.test.cjs`: legal-copy/template parity, safe text, legacy icon/value defaults and live footer editing, finance parity, integrated marks/two columns, A4/normal-flow/mobile fit and actual one-page PDF.
- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/proposal-values.test.cjs`: verifies unchanged main-text/photo/card/chart geometry against the original template, normal-flow closing copy above icons, exact source Warranty paragraph, seven icon groups attached to the contact footer, the new left-side headings, removal of all petals, faint dividers, safe editable copy, finance parity, mobile/continuation fit and actual three-page PDF.
- Closing-page and customer-feedback browser regression suites separately protect the approved closing/footer and real disposable save/retry/inbox path.

All fixtures are local and disposable, with production API calls intercepted or absent. Screenshots/PDFs stay under ignored `qa/shots/terms-page/` and `qa/shots/proposal-values/`.
