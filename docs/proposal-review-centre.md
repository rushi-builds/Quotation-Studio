# Proposal Review Centre + page overview

## Scope

First increment of the post-PR #30 UI roadmap. Builder-only navigation and review, not a new approval system, financial calculation, version-comparison service or backend workflow.

The **Review & pages** button sits below setting search. It opens a native labelled modal with two keyboard-accessible tabs:

- **Review:** existing export blockers, advisories, collapsible internal engineering input notes and saved Document Studio presentation edits.
- **Page overview:** searchable included/conditional/removed pages, saved page edits, added pages and continuation sheet numbers. View uses the existing preview navigation; Edit page opens the existing document editor. Removed/conditional page actions do not restore pages or enable systems.

The sidebar names the currently selected PDF format, its actual A4 sheet count, document-edit counts and the existing save indicator. Change PDF format reveals the one existing selector inside the review. The original element is temporarily moved, not cloned; its options/listeners stay intact, selected output/counts update in-place, and closing/collapsing/source navigation returns it to its exact builder-footer position. It does not invent a second format value or save/publish/export a proposal.

**No ready/approval percentage or green design certification.** "No export blockers reported" is qualified explicitly; internal DATA REQUIRED notes remain notes, not new export blockers. Document changes refer to scoped Document Studio metadata, not a diff against a published version or a complete audit of template-wording edits.

## Sources of truth

- `__qsPreflight.issues()` supplies blocker/advisory messages, including the existing document layout wrapper. `run()` is invoked when opening review. New `notes()` returns the engineering notes already collected by the control panel; no engineering logic is copied.
- `DocumentStudio.overview(format)` supplies scoped page metadata, original conditional visibility, exclusions and actual continuation numbering. Power uses its existing document assembly/pagination and removes temporary hosts. Other formats use the same report-family membership as existing edited exports.
- `DocumentStudio.openEditor(id,format)` only selects the report/page and opens existing editor controls. It does not persist any proposal changes.
- `Render.lastVisible` and current navigation track detailed-preview pages. A continuation View targets its actual sheet. Power uses its separate existing editor/preview, not a fake link into the Detailed report.
- Customer/reference text and custom page titles use text nodes. No authored HTML is executed.

## Small state-ownership correction

Navigating to Advanced Edit exposed an existing serializer issue: generated `docEdit-*` fields and `docTextSearch` could be collected as quote form values. Document Studio already owns those edits in `CONTENT.documentStudio`; they are not quotation inputs.

`StateStore.collectForm()` and `applyForm()` now exclude descendants of `#documentStudio`, just as the existing options/proposal-manager controls are excluded. Real input IDs, imported values, calculations and document metadata stay intact. Tests verify typing editor search cannot pollute saved form data, and legacy saved editor keys cannot overwrite UI search. State script cache versions are updated in all three entrypoints.

No changes to Finance, generation defaults, renderer, export engine, CloudBridge, auth, roles, catalogue, Worker, schema, deployment configuration, artwork, petals or customer feedback routing.

## Interaction / responsive behaviour

- Native modal focus containment, Escape close, explicit close/back controls and focus return.
- Arrow/Home/End keyboard tab navigation. Filter Escape clears a query before closing the modal.
- Source navigation closes the modal before focusing the actual field. Conditional/disabled fields are never enabled; unavailable targets have explanatory text instead of a fake action.
- 320px touch layout, minimum 44px touch actions and 16px search input. Short laptop and tablet layouts scroll inside the modal body with accessible close/footer actions. Compact phone header keeps the page task visible.
- Uses reduced-motion settings. Launcher/dialog are excluded from print and never loaded by customer entrypoints.

## Verification

All tests use local disposable browser data; new review QA intercepts external/API/auth requests and records zero writes.

- `qa/proposal-review.test.cjs`: **69 PASS** — exact preflight parity, note provenance, source focus, resolving findings, page/title search, empty state, keyboard tabs/Escape/focus containment, view/edit routing, conditional pages not enabled, removals/continuations/current-preview marker, Power 6→5 removal, standalone system/system-power counts, cross-proposal isolation, serializer ownership, unchanged form/CONTENT/Finance/A4 HTML from review navigation, print exclusion, Customer View isolation, actual View taps at 320px/Android/tablet and short laptop sizes, no runtime errors or writes.
- `qa/device-compatibility.test.cjs`: **309 PASS** — nine Chromium laptop/Android/iPhone/iPad emulated profiles, existing builder/storage/Customer View/feedback and ten dashboard panels each.
- `qa/review-format-state.test.cjs`: **24 PASS** — actual format button/select interaction, real six-page Power PDF through Download, original selector identity/position/focus, desktop + Android/iPhone-size/tablet touch profiles; actual editor wording → Save now → stored proposal → reload → JSON backup, including legacy transient-key cleanup. No browser errors or API/auth writes.
- `qa/control-panel.test.js`: **41 PASS**.
- `qa/integration.test.js`: **116 PASS**.
- `qa/finance.test.js`: **82 PASS**, financial engine byte-unchanged.
- `qa/export-preflight.test.js`: **50 PASS**.
- `qa/appearance-polish.test.cjs`: PASS — all 17 detailed and six Power pages; live-input/optional reversal/mobile/print, unchanged artwork/finance.
- `qa/document-studio.test.cjs`: PASS — editing, continuation text preservation, actual multi-page PDF and Customer View.
- `qa/document-lifecycle.test.cjs`: PASS — long paragraphs/tables, scoped systems, added pages, undo/redo, snapshot isolation and saved/new-proposal behaviour.
- `qa/editor-groups.test.cjs`: PASS — 13 sections, 1440/390/360 grids, saved edits, Finance/PDF unchanged.
- `qa/proposal-values.test.cjs`: PASS — eight four-icon rows, exact Solution clearance/petals, continuation safety and actual three-page PDF.

### Existing broad-audit failures (not hidden or weakened)

Two older QA tests were additionally attempted and still fail at their pre-existing audit assumptions. Neither test nor product logic was changed to suppress them:

1. `qa/document-reports.test.cjs` stops at its visible-text inventory assertion: 32 footer-value text nodes are added after Document Studio's inventory scan. Browser route overrides loading the **unchanged main versions** of document-studio/control-panel/state reproduced the identical 32 missing nodes; current and baseline missing-node lists were asserted equal. New dedicated tests independently verify full, Power and system report overview counts; existing document/lifecycle/value exporter tests pass.
2. `qa/editor-discovery.test.cjs` expects retired `pmStatus` and `pmUpdated` controls to appear in setting search. Both are intentionally inside `#legacyProposalManagement` and excluded from the actual search. The same retired/unindexed state was confirmed with unchanged main scripts and current scripts. Do not expose retired controls to make a test green. Real search regression checks in control-panel and new review QA pass.

One initial three-browser concurrent regression run timed out while finding the launcher after heavy document edits; isolated reruns passed. Subsequent feature checks run without the other heavy document suites. No product workaround or weakened assertion was used.

Screenshots/proofs (ignored): `qa/shots/proposal-review/`.

## Re-run

```sh
# With a local static server on :8080 and QA dependencies installed:
LD_LIBRARY_PATH=/tmp/chromium-libs/lib npm --prefix qa run test:proposal-review
```

The library prefix is sandbox-specific. These are Chromium browser/device-emulation tests, not physical-device or iOS Safari certification. No production release/merge is authorised by this handoff.

## Explicitly later

Quotations saved views, Version Compare and customer mobile Reading Mode remain separate future increments. No published-history diff, legal acceptance/e-signature, provider automation or new engineering promise is introduced here.

## Follow-up: PDF format action + point-6 persistence verification

The original Change PDF format action only closed review and focused the footer
selector. That did not expose a choice in the review and could feel non-functional.
It now expands an in-review region hosting the **original** `#pdfFormat` element.
The sidebar is stable across status/count refreshes so the native selector is not
detached or defocused mid-selection. Escape, close, collapse and source navigation
restore the original control/ARIA label/position; the selected output remains set.
No new state input, dropdown clone, synthetic download, export implementation or
validation bypass was added. Touch input retains 16px text / 44px minimum height.

The serializer fix already in PR #31 was additionally verified end-to-end rather
than rewritten: a real Document Studio textarea edit survives Save now, reload and
JSON backup, while `docTextSearch`/generated `docEdit-*` keys are absent from saved
form/backup. A simulated old saved blob carrying those keys cannot restore them
into editor UI, and its next ordinary save drops the stale keys. Real quote fields
and `CONTENT.documentStudio` wording are preserved.

Focused new tests passed 24/24, existing review 55/55 and control panel 41/41.
Actual selected-Power download produced a valid six-page PDF (not just an event).
Ignored proofs: `qa/shots/review-format-state/`. A Chromium launch attempt exited
with SIGSEGV before page creation; rerun passed without application workarounds.
PR #31 remains unmerged; no production deployment or production data access.

## Follow-up: Excel input guidance

Site verification & input notes now includes one **Get input values from Excel ↗**
button when cable/soil input notes are present. Its helper points staff to the
Excel quotation/BOM software, then manual entry through the existing Open source
actions; site measurements still need verification. The button closes review and
reveals/focuses existing Excel access (including switching to All when needed).
It does not open a privileged workbook directly, alter the existing workbook
link/permissions, import values, invoke catalogue refresh/Sync, or claim automatic
calculation/verification. Live workbook calculations were not read or tested.

Verification: review **69 PASS** (14 additional Excel guidance/navigation and
four viewport checks), format/persistence **24 PASS**, control panel **41 PASS**.
Snapshots confirm unchanged form, CONTENT, Finance and byte-exact A4 markup; no
external window, browser errors or API/auth writes. Desktop, small-phone, Android,
tablet and short-laptop actions exercised. Ignored screenshots are under
`qa/shots/proposal-review/*excel-notes*` and `excel-input-notes-desktop.png`.

The first run stopped at the pre-existing byte-exact A4 snapshot assertion before
the new action was exercised: scheduled footer layout changed attribute order
after the initial snapshot. The harness now waits two animation frames after
fonts are ready before taking its initial capture. The full assertion is retained
without normalization or excluded markup. The isolated rerun and format/control
suites passed. No rendering/product workaround was made.

PR #31 remains open/unmerged. No production release, Excel Sync, backend, finance,
export, engineering calculations, customer PDF wording or artwork changes.
