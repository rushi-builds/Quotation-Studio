# Terms & Conditions — reference treatment

Presentation-only update based on the four supplied reference images:

- Twelve terms in a two-column, row-major numbered list (odd left, even right), with orange vector corner tabs, pale cream icon tiles, fine orange separators and soft neutral cards.
- Existing authored titles, legal descriptions, template substitutions, project validity, duration and jurisdiction are unchanged. Existing numeric day/week/month phrases are highlighted only after HTML escaping.
- Icons are inline SVG with explicit export-safe colours. Default term objects retain their icon when reordered; older saved objects without the property use the previous positional defaults. Extra terms fall back to a document icon.
- The Terms-only footer has four free-standing value icons, a thin rule, a solar-panel/sun line sketch, a short editable promise and the existing brand handwriting recoloured navy for white paper. `terms-clean-energy-lettering.png` is derived from the existing transparent lettering, preserving its alpha and orange underline; the original closing asset is unchanged. No newly generated installation image or external font is used.
- Terms footer labels/promise remain editable in Advanced Edit. Legacy quotations receive defaults. All authored text remains escaped. Standard company contact, website and page numbering are retained.
- `terms.css` is scoped to `#pageTerms`; the approved closing wave/footer, feedback form, other photography, financial calculations, export engine and backend contracts are untouched. Builder, local customer viewer and secure portal load the same presentation assets.

## Focused proof

`LD_LIBRARY_PATH=/tmp/chromium-libs/lib node qa/terms-page.test.cjs`

Covers legal-copy/template parity, safe text rendering, footer editing/legacy defaults, finance parity, odd/even layout, twelve term icons/four value icons, intrinsic A4 and edited normal-flow fit, mobile customer view, and an actual single-page html2canvas/jsPDF export. Local intercepted API only, no production calls. Generated screenshots and PDF stay under ignored `qa/shots/terms-page/`.

Closing-page and customer feedback browser regressions are also run separately. Vercel frontend preview is not a production backend release.
