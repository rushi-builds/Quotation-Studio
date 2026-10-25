# Excel-first equipment catalogue

Owner-approved replacement for the local equipment Add/Edit/Delete manager,
25 October 2026. **Code/isolated tests only: no production Worker deployment or
live workbook mutation has been performed by Arena.**

## Compact presentation update

The panel now has a subtle periwinkle interior, one instruction line, a short
status, the actual filename when verified, and **Add / edit ↗ / Sync** actions.
Verbose explanations, timestamps/counts and archive notes no longer fill the
card; diagnostic details remain in status tooltips/hidden metadata. Header
labels are **System up to date / Excel updated · Sync now**, with short neutral/error states when
verification is unavailable. Source/auth/manual-sync boundaries are preserved;
the later correction adds a fresh metadata check after returning from Excel.

## Workflow

1. Open **Advanced settings → Excel catalogue**, or use the small blue arrow
   next to the workspace tagline. This opens/scrolls to the section; it never
   executes sync or changes an input.
2. **Add / edit ↗** opens the exact configured Drive workbook in a
   new tab. This is the original file, not a generated spreadsheet, folder,
   upload or converted Google Sheet. Human edit rights remain Drive-controlled.
   A `.xlsm` may open in Drive's file preview: use Excel to edit the original
   file and save back to that same connected file. The app does not launch or
   control desktop Excel, grant edit permissions, or write to the workbook.
3. Add/edit rows inside the existing catalogue tables, preserving their columns
   and original Excel format. Wait for the file to finish saving/uploading.
4. Click **Sync**. Only the existing owner/elevated-admin permission
   can perform this action. Other signed-in staff can check status/open the
   original file subject to their independent Drive permissions.
5. Select/reselect the product under **Equipment & design** to apply its latest
   source values. Sync does not rewrite saved quotation input values.

The library's local CRUD controls and duplicate footer sync button are removed.
Search still finds the Excel actions—including unavailable actions—without
activating them. The existing manual Custom fields are quotation-specific,
not a second reusable catalogue editor.

## Truthful status

| State | Header | Meaning |
|---|---|---|
| Never synced | Sync needed | Connected source known, no saved shared catalogue |
| Source revision differs | Excel updated · Sync now | File ID/revision no longer matches last sync |
| Verified match | System up to date | Workbook revision, shared snapshot SHA and browser row counts match at last check |
| Checking | Checking… | A read-only verification is in progress |
| Sync failure | Retry sync | Last browser copy stays usable; failed transactions roll back |
| Unavailable/unverified | Not verified | No claim of freshness; reason in the status tooltip |

A small soft-red colour pulse runs three cycles for attention; no opacity,
halo or page artwork animation. Reduced-motion disables it. Up-to-date is
subtle green; navigation arrow stays blue. Checked/last-synced time and counts
are separate. Up-to-date is a version match, not manufacturer/design approval.

While the tab is visible, status is checked every minute and on focus/return.
The Worker caches **metadata only** for up to one minute per source/isolate.
No scheduled workbook download, automatic data sync or background D1 write is
introduced. If another owner/browser synced, the saved JSON copy is loaded by
GET, with SHA and all three row counts validated. This also repairs older
partial browser caches even when the workbook SHA has not changed.

Historic snapshots without source-revision metadata remain unverified/neutral;
they are not falsely labelled “Excel updated”. Public-link mode cannot verify Drive revisions and never displays a verified
up-to-date state after sync. Missing connection, sign-in, network failure or
unisolated Vercel Preview also remain neutral/explicitly unavailable.

## Source, safety and implementation

- New UI/controller: `assets/js/excel-catalogue.js`, using the existing
  authenticated same-origin `PlatformAPI` and its production-preview guard.
- `GET /api/catalogue/status`: signed-in status/exact original-file URL,
  revision and timestamps; metadata only, no catalogue replacement.
- `POST /api/catalogue/sync`: explicit owner/admin sync. The existing
  `POST /api/catalogue` alias is retained. The old UI used `/sync` but the
  Worker previously only matched the alias; both now use the same gate.
- `GET /api/catalogue`: reads the existing sanitized saved snapshot. Its legacy
  access contract is unchanged; no workbook binary/cost/customer sheets added.
- File selection follows the already-connected product catalogue configuration:
  `GOOGLE_DRIVE_PRODUCT_CATALOG_FILE_ID`, then the older module alias, then
  `GDRIVE_FILE_ID`. Legacy folder selection remains supported, but pinning the
  existing file-ID setting is recommended for exact-file control. No config
  or secrets have been changed by this implementation.
- Existing service-account scope stays **drive.readonly**. Metadata is checked
  before/after download; content checksum is verified. A changing/oversized/
  invalid workbook aborts before replacing the snapshot.
- Only `MODULE_DB`, `INVERTER_DB`, `CABLE_DB` are imported here. Named
  `tblModule`, `tblInv`, `tblCable` ranges grow with table additions; old fixed
  ranges are compatibility fallback for workbooks without named-table XML.
  Unrelated cable-factor/operational sheets are excluded. Structures, BESS,
  protection and other optional-system catalogues are not newly imported.
- D1 immutable `bind()` results are retained (the previous chunked code lost
  rows). Batches use at most 100 parameters per insert statement and replace
  rows + metadata in one transaction. Row keys retain same-name rating bins
  and identical source rows. All 531 shipped rows survive the fixture test.
- No new migration: metadata uses the existing key/value catalogue-meta table.
  Existing migration 006/table availability must be checked by the operator.
- `qstudio.equipment` remains intact as a legacy archive, including structures.
  It no longer overlays Excel or seeds new reusable makes. Existing saved
  proposal fields are preserved and can still display as Custom. The complete
  synced snapshot replaces the bundled source, so Excel deletions are not
  resurrected from the bundled/local lists. Before first sync/offline, the
  last saved or bundled catalogue remains usable without a freshness claim.
- Retired public `cat().push()/save()` write behavior is not a supported editing
  path anymore. Compatibility `save()` only preserves archived rows; the
  compatibility manager renderer is a read-only notice.
- Finance/genFactor, cloud bridge, calculation/render/export engines, artwork,
  role authority, DNS, Worker/D1 bindings, credentials and deploy configs are
  untouched. No main merge or production connection is implied by this build.

## Verification

Run `LD_LIBRARY_PATH=/tmp/al2023/lib npm --prefix qa run test:excel-catalogue`
with the disposable static server at QA_BASE (default `http://127.0.0.1:8080`)
and an installed Chromium; library path is sandbox-specific.

- UI/unit: archived local rows, Excel-only source replacement, same-SHA partial
  cache repair, exact safe link, source controls unchanged by passive sync,
  state/error/permission/storage/malformed-data handling; authenticated API
  headers and real Vercel Preview production guard.
- Worker: read-only checks, identity/revision comparison/cache, owner/admin-only
  POST and anonymous/viewer denial, explicit sync, changing-file race, last-good
  retention/atomic rollback, immutable bindings/chunk limits, all 531 rows,
  expanded named-table rows beyond old ceilings and cable variants.
- Real browser: original-workbook link/new tab, no local CRUD, arrow navigation,
  status/retry, GET-only refresh from another completed sync, preserved legacy
  proposal inputs/Finance/archive, explicit product selection, reload/New/switch,
  390/360px, reduced motion, Customer View and actual technical-sheet PDF.
- Regression: integration 116, Finance 82, equipment calculation 9, API 172,
  package 40, engineering standards 58, preflight 50, scope 43, parity 316,
  search 264 source controls, section groups and preparer/cover browser/PDF pass.
  Document lifecycle, all 11 system report selections and multi-page
  document-studio browser/Customer View/PDF regressions also pass.

The former local-CRUD/merged-overlay QA contracts have been intentionally
replaced with the owner-approved Excel-only contract, not silently skipped.
Legacy test command entry points remain available.

**Known independent legacy failure:** `qa/equipment-entry.test.js` still fails
at its unchanged custom text/specification reload assertion (now line 127).
Its fixture was updated from the intentionally retired `cat().push()/save()`
write path to model-backed Excel rows; preceding selection/manual-input checks
pass. The same reload assertion failed on the earlier released baseline, as
recorded in the equipment-library history. This is not an all-suite-green claim.

**Additional baseline failure found during the auto-refresh audit:**
`node --test qa/excel-module-catalog.test.mjs` passes five cases but its old
proposal-picker case expects `Deye or Equivalent`/retired workbook-picker IDs;
the current Excel-master picker defaults to `Sungrow`. The identical first
assertion failure was reproduced from clean parent commit `6d7bbc0` in an
isolated temporary source tree. This older UI contract was not rewritten in
this status-only correction; parser/read-only Drive cases pass. The current
`test:excel-catalogue` suite covers the supported UI and passes.

See [operator handoff](excel-catalogue-opencode-handoff.md) for live boundaries.

## Workbook-status correction and existing auto-refresh audit

- Header explicitly identifies **Excel workbook**. Green **System up to date**
  requires verified source revision and a complete matching browser catalogue.
  A changed source shows **Excel updated · Sync now** in both places, with three
  short soft-red colour pulses (disabled for reduced motion). First sync is
  **Sync needed**; an unavailable/unverified check is never green. There is no
  user-facing “Preview only” label. The existing production-preview API guard
  remains in force: an isolated preview cannot prove live workbook freshness.
- The card's single instruction is “Add or update equipment in Excel. Save,
  then sync.” **Add / edit ↗** opens the exact configured original workbook.
  It does not grant Drive/Excel editing rights or upload local Excel changes.
- On return from opening that workbook, the owner/admin requests
  `GET /api/catalogue/status?fresh=1`: a metadata-only cache bypass, so a saved
  Drive revision can be detected without waiting for the ordinary 60-second
  cache. Viewers retain the ordinary read-only cached check. This does not
  download workbook bytes, write D1 or POST sync. The recurring/focus checks
  remain, and a later Drive upload is detected on a subsequent check.
- Audit: legacy `worker.js:getExcelProductCatalog()` checks Drive on
  `/api/catalog/products` GET after its TTL (default 300 seconds). It writes
  a **separate** `excel_product_catalog_cache`, not `equipment_catalogue`.
  `module-catalog.js:refreshFromExcel()` exposes this reader, but repository
  search found no runtime call to it. `share.html` loads the module script;
  the current `quotation.html` does not. Do not present this dormant/request-
  driven path as an always-on quotation catalogue sync. It was not removed.
- No continuous scheduler/cron or desktop-to-Drive uploader was found in this
  repository. An externally configured Drive Desktop/save-back process may
  exist, but its operation is **not verified** by this code audit or fixtures.
  Only changes that have actually reached the configured Drive workbook are
  observable here; unsaved/offline/local-only edits cannot be detected.
- Isolated tests cover fresh owner metadata inside the normal cache TTL,
  viewer cache protection, zero writes/downloads from status checks, return
  from workbook editing, real change → explicit sync → verified green,
  preserved quote values and unchanged production-preview guard. Live Worker
  deployment and original Excel save → Drive arrival → status → sync still
  require the owner-approved operator verification below/in the handoff.
