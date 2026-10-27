# Terms and light contextual footer accents

## Revised direction (supersedes the literal reference treatment)

The references are inspiration, not two banners to stack. The previous Terms-only illustration/handwriting strip and derived lettering file have been removed. The approved closing wave, lettering, values, images and logo remain unchanged.

### Terms

- Twelve terms in a two-column, row-major list, with **one integrated square icon-and-number badge, with a small superscript-style number inside its upper-right corner** per term. No disconnected orange corner flags or separate icon tiles.
- Original two-tone vector marks, navy ink and restrained warm/sage/lavender/blue pastels; explicit SVG colours for PDF export. No emoji/system-glyph dependency or replacement company logos.
- Existing authored titles, legal descriptions, substitutions, validity, duration, jurisdiction and note stay unchanged. Numeric day/week/month phrases are highlighted only after HTML escaping.
- Icon metadata stays with default term objects if reordered. Older saved objects retain positional defaults. Unknown/prototype icon names fall back safely.

### FOUR Terms-format icons and petals from the actual page-number corner

The user clarified that “same Terms format” explicitly means **four icons**, not three cells with similar styling. All fifteen contextual definitions now contain four icon/value pairs. Every visible default row uses four equal cells, 26 px marks, two-line default labels, faint dividers and the unchanged 42 px footprint. The seven previously fitting rows remain visible; dense pages are not pushed upward to force decoration. Authored labels are preserved; older three-value quotations obtain a safe contextual fourth default, which is also live-editable. Terms' original four values remain unchanged.

The petals must begin at the **physical bottom-right corner beside the page number**, not a body corner 76 px above it. The previous fan/arcs/fold assets and variants are removed. One three-colour peach/lavender/sage petal SVG has all three paths starting at its exact bottom-right point. It is a 170 × 170 px page background positioned at **100% 100%**. The contact footer is transparent so the petals remain visible behind the fully opaque live page number; text stays dark and readable. No overlay is painted on top of text or photographs.

The footer remains flush with the exact bottom, left and right page edges. Icon rows attach to the contact footer, and closing notes remain above them in normal flow. Main text, photographs, cards, charts, finance/export logic, original cover and closing design are untouched. Existing safety/blank-label/overflow behaviour remains intact.

The shared assets are loaded by the builder, local viewer and secure customer portal. Company contact/website/page numbering, financial calculations, export engine, backend/auth contracts, original photography and closing page are untouched. This is frontend presentation, not a production backend release.

## Focused proof

- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/terms-page.test.cjs`: legal-copy/template parity, safe text, legacy icon/value defaults and live footer editing, finance parity, integrated marks/two columns, A4/normal-flow/mobile fit and actual one-page PDF.
- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/proposal-values.test.cjs`: four items in all definitions and four equal default visible cells; live fourth-value editing; saved three-value compatibility; exact bottom-right petal origin with three gradients; readable live page number; unchanged main-text/photo/card/chart geometry; exact edge contact; closing notes above icons; safe text, mobile/continuation fit, finance parity and actual three-page PDF.
- Closing-page and customer-feedback browser regression suites separately protect the approved closing/footer and real disposable save/retry/inbox path.

All fixtures are local and disposable, with production API calls intercepted or absent. Screenshots/PDFs stay under ignored `qa/shots/terms-page/` and `qa/shots/proposal-values/`.
