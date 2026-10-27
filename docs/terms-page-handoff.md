# Terms and light contextual footer accents

## Revised direction (supersedes the literal reference treatment)

The references are inspiration, not two banners to stack. The previous Terms-only illustration/handwriting strip and derived lettering file have been removed. The approved closing wave, lettering, values, images and logo remain unchanged.

### Terms

- Twelve terms in a two-column, row-major list, with **one integrated square icon-and-number badge, with a small superscript-style number inside its upper-right corner** per term. No disconnected orange corner flags or separate icon tiles.
- Original two-tone vector marks, navy ink and restrained warm/sage/lavender/blue pastels; explicit SVG colours for PDF export. No emoji/system-glyph dependency or replacement company logos.
- Existing authored titles, legal descriptions, substitutions, validity, duration, jurisdiction and note stay unchanged. Numeric day/week/month phrases are highlighted only after HTML escaping.
- Icon metadata stays with default term objects if reordered. Older saved objects retain positional defaults. Unknown/prototype icon names fall back safely.

### Uniform Terms-format rows and quiet page-corner backgrounds (latest correction)

The user selected the Terms footer as the common format: inline icon + label cells, faint short vertical dividers, and no separate left-side heading. Contextual wording and icon choices remain different on each page. The same seven default fitting rows remain visible (About, Why Solar, Scope, Quality, Why KTM, Warranty and Terms); every row uses the same 42 px height, 26 px marks and Terms-style spacing. Terms retains its four cells; other rows retain their existing three values. Empty authored cells collapse instead of leaving an artificial empty column.

**The contact footer is flush to the exact bottom, left and right page edges.** Corner decoration never lifts the footer. The icon row ends at the contact footer's top edge; closing source notes remain in normal flow above the icons. Main text/photo/card/chart geometry is unchanged. Optional rows still require 24 px content clearance and never force content upward.

The user separately requested reference-like background detailing growing from the page corner. Three small hand-drawn SVG stationery variants—soft fan leaves, nested arcs, and overlapping leaf folds—are assigned across business pages in muted peach/lavender/sage. They are CSS page backgrounds at the lower-right content corner, 170 × 170 px, ending 76 px above the physical bottom, outside the footer cells. They paint behind content, not over text/photos, are noninteractive, and do not participate in layout or clearance measurements. The earlier footer-row petals/headings and their segmented rules are removed. Cover and the approved original closing design remain untouched.

Legacy/custom value labels remain editable and escaped. No source wording, calculations, photos, export engine, production backend or live data changed.

The shared assets are loaded by the builder, local viewer and secure customer portal. Company contact/website/page numbering, financial calculations, export engine, backend/auth contracts, original photography and closing page are untouched. This is frontend presentation, not a production backend release.

## Focused proof

- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/terms-page.test.cjs`: legal-copy/template parity, safe text, legacy icon/value defaults and live footer editing, finance parity, integrated marks/two columns, A4/normal-flow/mobile fit and actual one-page PDF.
- `LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/proposal-values.test.cjs`: unchanged main-text/photo/card/chart geometry, closing text above icons, same Terms-format row throughout, contextual safe copy/icons, three page-corner background variants, protected cover/closing, exact bottom/left/right footer geometry, mobile/continuation fit, finance parity and actual three-page PDF.
- Closing-page and customer-feedback browser regression suites separately protect the approved closing/footer and real disposable save/retry/inbox path.

All fixtures are local and disposable, with production API calls intercepted or absent. Screenshots/PDFs stay under ignored `qa/shots/terms-page/` and `qa/shots/proposal-values/`.
