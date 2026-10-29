# Proposal Review Centre + page overview

## Scope

First increment of the post-PR #30 UI roadmap. Builder-only navigation and review, not a new approval system, financial calculation, version-comparison service or backend workflow.

The **Review & pages** button sits below setting search. It opens a native labelled modal with two keyboard-accessible tabs:

- **Review:** existing export blockers, advisories, collapsible internal engineering input notes and saved Document Studio presentation edits.
- **Page overview:** searchable included/conditional/removed pages, saved page edits, added pages and continuation sheet numbers. View uses the existing preview navigation; Edit page opens the existing document editor. Removed/conditional page actions do not restore pages or enable systems.

The sidebar names the currently selected PDF format, actual A4 sheet count, document-edit counts and save status. The PDF selector exists only once in the builder footer. The sidebar's separate Excel review-sheet action downloads a local snapshot of current quote values, finance-engine estimates, existing checks and the page manifest; it never imports data back into the builder.

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

- `qa/proposal-review.test.cjs`: **78 PASS** — exact preflight parity, live key details/default reminders, source focus, resolving findings, page/title search, keyboard/modal behavior, view/edit routing, conditional pages not enabled, page counts, selector ownership, Excel snapshot card, responsive layouts, Customer View isolation, no runtime errors or API/auth writes.
- `qa/device-compatibility.test.cjs`: **309 PASS** — nine Chromium laptop/Android/iPhone/iPad emulated profiles, existing builder/storage/Customer View/feedback and ten dashboard panels each.
- `qa/review-format-state.test.cjs`: **23 PASS** — Excel-ready CSV download, formula-injection escaping, SHA-256 checksum verification, no quotation/A4 mutation, PDF selector remains in the original footer, real six-page Power PDF, responsive download taps, and actual editor wording → save → reload → JSON backup. No browser errors or API/auth writes.
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

## Historical implementation note: PDF format action + point-6 persistence verification

An earlier iteration temporarily hosted the original `#pdfFormat` control inside the review. The user clarified that this duplicated the selector already at the builder footer. That in-review format action has since been removed; the selector is now kept in its original position, and the sidebar slot has a different purpose. The persistence verification below remains relevant.

The serializer fix already in PR #31 was additionally verified end-to-end rather
than rewritten: a real Document Studio textarea edit survives Save now, reload and
JSON backup, while `docTextSearch`/generated `docEdit-*` keys are absent from saved
form/backup. A simulated old saved blob carrying those keys cannot restore them
into editor UI, and its next ordinary save drops the stale keys. Real quote fields
and `CONTENT.documentStudio` wording are preserved.

At the time, focused tests passed 24/24, existing review 55/55 and control panel 41/41.
Actual selected-Power download produced a valid six-page PDF (not just an event).
Ignored proofs: `qa/shots/review-format-state/`. A Chromium launch attempt exited
with SIGSEGV before page creation; rerun passed without application workarounds.
PR #31 remains unmerged; no production deployment or production data access.

## Follow-up: live key-details checklist

The Review tab now shows current customer name, site address, customer category,
capacity, module and inverter details directly from `Render.lastState`, with Open source actions to
the original fields. Blank name/address and missing module/inverter models are
spelled out. Capacity equal to the quotation template's starting value is marked
**Template default · confirm or change**; other populated values still ask for
confirmation/verification without implying they have been site-verified. These
are reminders, not new PDF blockers. The list re-renders from `qs:rendered`; it
adds no form keys, saved approval marks, financial calculations or A4 content.
The page-level-only count is now titled **Presentation edits**, so it is not
mistaken for a full audit of live quotation data. The top-right **Items to review**
count now tracks unique actionable detail groups plus unrepresented blockers /
advisories. A customer-name blocker is shown once on its source row, not again
as a duplicate alert; the summary separately reports the PDF-blocker count.
Missing site address is marked optional when unavailable and is not counted. The PDF format selector remains
only in the builder footer. Excel input extraction/autofill remains out of scope.

Verification: Review Centre **78 PASS** including default-capacity/category
warnings, source navigation, live name/address/capacity updates, unchanged
form/CONTENT/Finance/A4, key-detail layout on four viewport profiles and zero API writes. Spreadsheet/persistence **23 PASS**;
control panel **41 PASS**. `qa/shots/proposal-review/review-desktop.png` shows the
new checklist.

## Follow-up: Excel review-sheet export replaces duplicate PDF control

The sidebar now has one distinct **Excel review sheet** action instead of another PDF-format selector. It downloads a UTF-8, Excel-compatible CSV built from current customer/system inputs, current Finance engine estimates (clearly labelled estimates), existing preflight messages and the selected-output page manifest. A SHA-256 fingerprint covers all CSV rows above its integrity line; customer-controlled text is formula-escaped before export. The action is local-only, makes no API/auth calls, changes no quote or saved state, and does not populate builder fields. The PDF selector remains solely at the builder footer.

Focused QA verified the actual download, checksum, formula-injection protection, no A4/finance/state mutations and mobile/touch use.

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
