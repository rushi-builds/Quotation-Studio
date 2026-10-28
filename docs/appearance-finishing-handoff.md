# Appearance finishing audit

## Preserved approvals

- Petal asset and size are unchanged: 170 × 170 px, originating at the physical bottom-right page-number corner.
- The four-icon Terms-format rows, faint dividers, exact page-edge contact footer and source closing copy above icons remain intact.
- Cover, closing artwork/lettering, logos, photo sources/cropping/geometry, business/legal wording, chart dimensions and calculation engine are unchanged.
- No production backend, auth, catalogue Sync, provider, DNS or export-engine changes/deployments.

## Presentation changes

`assets/css/proposal-polish.css` is loaded in builder, Customer View and portal, after the approved footer stylesheet.

- Standard marketing cards share a restrained 12 px radius and neutral border, without extra shadows or backgrounds. Financial cards and Terms icon tiles retain their approved treatments.
- Why Solar's no-bill benefit cards use available vertical space: the measured final content-to-icon-row gap drops from 125 px to 65 px. Entering a real monthly bill automatically restores the original compact 170 px cards. Edited/continued pages keep normal-flow sizing.
- Warranty journey padding reduces its bottom gap from about 90 px to 64 px; Why KTM's commitment padding reduces 67 px to 61 px. This fills avoidable gaps without lifting photos or forcing dense pages to fit.
- Closing notes are 9.2 px, 1.5 line height, with readable #647386 ink. Other fine/disclaimer notes receive the same readable ink, without financial/legal wording changes.
- Power page 6's legacy 52 px bottom padding alone could extend its scroll height to 1132 px in a report-heavy fixture, although the content cleared the footer. A 34 px trailing reservation removes that overflow without shrinking content.

## Input/editor finishing and sync

- Helper text and control corners are consistent; textareas retain vertical resizing and cannot exceed their container.
- Toolbar actions use consistent heights; Customer feedback no longer stretches like a full-width input.
- The live chip no longer repeats “Live” for an unnamed customer. It uses the same existing **gross project cost** as the sidebar, not net investment, and retains the solar-project scope qualifier for battery/additional-system proposals. Calculation outputs are untouched.
- A real overlap was found: both the live summary and the legacy Essentials/All switch were sticky near the top. The summary now remains the sole pinned element; the mode switch stays in normal flow and is no longer hidden/unresponsive beneath it.
- Focus/anchor scroll clearances account for pinned desktop furniture, with smaller mobile clearances. Inputs, IDs, handlers, validation, mode permissions and source ownership are retained.

## Verified

Browser commands use `LD_LIBRARY_PATH=/tmp/chromium-libs/lib` in this sandbox.

- `node qa/appearance-polish.test.cjs`: all 17 detailed pages, all six Power pages, default/optional bill/loan/BOM/options/reports, real customer/capacity/contact input events, live cost basis, reversing optional states, print, 390/360 px layouts and opened editor sections. Protected photo/artwork/petal geometry and finance parity checked.
- `node qa/page-spacing.test.js`: **29 passed**, including an actual 17-page stress-case PDF download and raster checks, long equipment names, customer view and mobile.
- `node qa/control-panel.test.js`: **41 passed**, including real search/navigation, local saving, proposal switching/isolation, mode reload persistence, storage failure/recovery, backups and customer view.
- `node qa/editor-groups.test.cjs`: all 13 tinted input sections at desktop/mobile, unchanged form/Finance/PDF content, conditional fields and saved edits.
- `node qa/cover-sync.test.js`: visible live cover values, long/empty/escaped inputs, reload, mobile and PDF canvas.
- `node qa/proposal-values.test.cjs`, `qa/terms-page.test.cjs`, `qa/closing-page.test.cjs`, `qa/proposal-feedback-browser.test.cjs`: pass, including real PDFs and disposable local feedback persistence/retry checks.
- `node qa/investment-presentation.test.cjs`: 15 residential/commercial/industrial/RWA/BOM/override/battery/additional-system fixtures; builder gross summary and live-chip scope agreement; saved/customer/print/mobile/PDF checks.
- `node qa/financial-fixes-browser.test.cjs`: actual detailed/Power PDF parity, 0% EMI, preflight and subsidy edge cases.
- `node qa/finance.test.js`: **82 passed**. `node qa/integration.test.js`: **116 passed**.
- Syntax and `git diff --check` pass. Finance, export, cloud bridge and the petal SVG remain unchanged.

## QA fixture maintenance

The wider audit exposed stale expectations, not reasons to revert the product: retired audio controls must remain absent; QR destination is already in Essentials; exact search targets and unobscured real mouse clicks are used; mode persistence explicitly selects a mode; Investment's current 240/300 px chart design replaces obsolete 180/340 px expectations. The jsdom loader now includes the real ProposalMarks dependency used by Terms. Editor snapshots canonicalise attribute order (while retaining values and visibility) and await decoration/image readiness. No assertions are disabled.

Proof PNGs, spacing measurements and PDFs are under ignored `qa/shots/appearance-polish/` and `qa/shots/page-spacing/`; generated artifacts are not committed. Production feedback release/smoke verification remains a separate coordinated step. Keep this work in the existing PR; do not auto-merge.

## Solution page follow-up

The user requested the four-value footer on Solution (page 5) too. Only the second spacer, immediately after `#v_soSpecs`, is capped at 16 px instead of 32 px on non-edited pages. This lifts the equipment/scope note by 16 px, without moving the hero photograph, introduction or equipment cards. Note wording and styling are untouched; the existing footer's measured 24 px clearance remains enforced. All eight fitting standard pages now show their four contextual values. Edited/dense custom content retains the existing overflow and continuation safeguards.

The footer regression explicitly compares the note/grid/photo geometry with the finishing stylesheet disabled, verifies four visible values and clearance, and includes Solution in the actual three-page PDF proof. The broader appearance audit still passes all 17 detailed and six Power pages, optional input reversal, print and mobile layouts.
