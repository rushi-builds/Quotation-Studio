# Proposal-local document editing

## Use

Open **Advanced Edit / Content & Photography → Pages, sections & text**.

- Select Detailed proposal/system reports or the independent Power proposal,
  then select a page. The list includes the 22 native Detailed page definitions
  and the six native Power pages, plus your own added pages.
- **Sections & cards:** Remove/Restore a section, card, list item or table row.
  Remove/Restore page controls affect document inclusion, not the calculation.
- **Every rendered text:** edit ordinary DOM wording, including captions and
  labels outside the legacy CONTENT editor. Search within the page's wording;
  the main settings search also navigates to native editable text on other
  Detailed pages without changing inputs or enabling optional systems.
- Grey entries are protected: linked customer/company inputs, calculated or
  source-controlled figures, page furniture, diagram/chart output and ambiguous
  numeric output. Use the original quotation controls; linked entries offer a
  jump where an individual source input is identifiable. This is not permission
  to override prices, engineering outputs or calculations as arbitrary text.
- Add paragraphs, bullet lists, photograph sections or a new page after the
  selected page. New pages can be renamed. Original photograph replacement and
  legacy structured copy controls remain in **Template wording & project
  photographs**. PNG/JPEG/WebP section uploads are capped at 1 MB and decoded
  before insertion; source artwork files are never rewritten.
- Undo/Redo are proposal-local session history (up to 30 changes). Removed
  native and added sections/pages have explicit Restore actions.
- View page navigates the Detailed document; Power has a modal preview of the
  edited report rather than pretending its pages belong to the Detailed report.

## Flow and preservation

Only modified pages enter document-flow layout. Removing items closes their
normal-flow gaps; card grids redistribute remaining children and empty wrappers
collapse. Approved pristine page layouts, original artwork files and the full
cover artwork remain untouched. Extra cover copy starts on a continuation page.
Edited photographic introductions and pinned closing/investment elements are
placed in normal flow so additional text does not overlap them.

Overflow creates additional A4 continuation pages without shrinking the new
text. Paragraphs/headings split on words; exceptionally long unbroken strings
can split on grapheme boundaries. Tables continue by row/cell with repeated
headers. Graphics are indivisible. If a single graphic or unsupported composite
cannot fit, an explicit layout error blocks edited-document export instead of
silently clipping it. Practical bounds: 20,000 characters per native text entry,
100,000 per programmatically added section, 30 custom pages, 60 continuations
per source page and a bounded document-extension budget.

Page labels, navigation, page counts, report-selection counts, footer numbering
and the Executive Summary's battery page reference are recalculated. New pages
inherit their source page's conditional inclusion and standalone report family.
BESS/system/system-power exports include their own added pages and continuations,
with local numbering. Power additions do not leak into Detailed documents.

## Persistence and implementation boundary

`CONTENT.documentStudio` version 1 stores page exclusions, scoped text overrides,
removed-block paths, added text/list/image sections and custom-page descriptors.
The existing proposal persistence/import/export/duplicate lifecycle carries this
metadata; new proposals do not inherit another proposal's edits. Conditional
BESS/additional-system/rainwater overrides are scoped to the selected system and
battery context. Stale native wording overrides apply only when the canonical
`from` text still matches; changed source wording must be reviewed.

`assets/js/document-studio.js` is a presentation adapter around the public Render
registry and Exporter API, loaded by both builder and Customer View. Before each
canonical render it reverses presentation mutations and removes temporary page
descriptors. Original calculation/render/export file bytes are unchanged.
Static DOM wording provenance is indexed from the template; Customer View verifies
static captions from the same-origin quotation template before edited export.
User text is inserted with text nodes/textContent, not interpreted as HTML; nav
labels are escaped for the existing navigation renderer.

Edited export snapshots the canonical proposal (not the customer scenario slider),
waits for fonts/images/QR generation,
and cancels if the proposal changes during preparation instead of exporting a
different customer. It then captures a detached document. Later source edits cannot remove the snapshot
or rewrite its live bindings. Builder download retains blocking/advisory review;
Customer View's normal PDF button uses the same edited-document export adapter.
Pristine quotations continue through the existing exporter.

No finance.js, genFactor, cloud-bridge.js, provider/authority, deployment config,
DNS, database or artwork changes are part of this feature. This does not enable
cloud sharing or any live provider connection.

## Verification

From `qa`, with the existing browser dependencies and an isolated static QA_BASE:

```
npm run test:document-studio
npm run test:editor-discovery
```

- `document-studio.test.cjs`: native text vs protected prices, all native page
  definitions, remove/restore, exact added-prose preservation, measured A4 bounds,
  reload, Customer View/page-list parity, Customer View PDF-button adapter,
  actual multi-page PDF and independent six-page Power inventory.
- `document-lifecycle.test.cjs`: exact original paragraph/table text preservation,
  cover/closing/scope/investment additions, actual list/image controls, advisory
  and blocking download gates, new pages, undo/redo, literal HTML-like content,
  scoped DG wording, Power preview/custom pages/actual PDF, source edits during
  capture, new-proposal isolation and proposal-switch restoration.
- `document-reports.test.cjs`: independently traversed visible-word coverage over
  all eleven system selections, standalone report selection/numbering, inherited
  conditional visibility, battery cross-reference and malformed optional metadata.
  This report matrix uses a cheap canvas stub for contract checks; actual raster
  PDFs are independently exercised in the first two suites and existing system
  hierarchy/full-image browser suites.

Generated screenshots/PDFs stay in ignored `qa/shots/document-studio/`, not Git.

## Prepared by and internal review follow-up

The optional preparer is rendered from the existing `prepName` input in a quiet
navy footer row on the cover, above the company line. Blank/whitespace input
hides the entire row (including the label). The original renderer-compatible
IDs are retained, but moved out of hidden compatibility markup. The presentation
adapter trims the displayed value and fits the name on each render; no artwork
is edited and the additional-scope badge keeps its own space. This is shared by
builder, Customer View and both pristine/edited PDF paths.

Internal engineering findings are generated check results, not proposal copy.
Each finding now has an **Edit inputs** action linking to the existing source
controls; DC/AC findings additionally link to string data/inverter rating. This
opens the correct advanced groups and focuses the real input without inserting
assumptions or changing values. Measured/site/datasheet inputs recalculate the
findings. Warning text, safety severity and export blockers are not overridden.
The findings and their edit actions remain outside customer pages/PDFs.

`npm run test:preparer-review` checks the four cover categories, whitespace, long
names, scope separation, mobile, saving/reload/Customer View, pristine export
contract, actual edited cover PDF, source navigation and genuine recalculation.
