# Private Excel product catalogue sync

Quotation Studio reads a **sanitized, read-only product snapshot** from the private Google Drive workbook `Solar_EPC_Software_FINAL_v0.2.xlsm` (file ID `17V9Os-1ZV-_0dpoHQwvTcNwLdAdQz_Gh`). The local workspace copy named `Solar Catelogue.xlsm` was verified to have the same byte size and MD5 checksum as the Drive file; the filename difference does not affect parsing. The app does not download the workbook into the browser and never runs its macros.

## Workbook tabs used

Only these product tabs are parsed:

- `MODULE_DB` — module/bin ratings and dimensions
- `INVERTER_DB` — inverter make/model, AC rating and available DC/MPPT limits
- `CABLE_DB` — cable category, size, material and available electrical data
- `PROTECTION_DB` — category, make/model/catalog number and core device ratings

Workbook values are marked as **not independently manufacturer-verified**. There are no trusted per-row datasheet links in the imported rows. Staff must check the current manufacturer datasheet and final design before procurement. Cable and protection selections are proposal references only: they do not calculate conductor size, route, protection coordination, or price.

The service does **not** parse or return customer/site/resource data, drawings, cost sheets, BOM/rules/standards engines, reports, settings, VBA, or other workbook tabs. The cable temperature/installation/grouping factor table below the product rows is also excluded. The workbook binary and its macros are not stored in D1 or the local cache. `PROTECTION_DB`'s `COUNTRY OF ORIGIN` and `REMARKS` columns are excluded.

## Private Google Drive setup

1. Create a Google Cloud service account for this read-only sync and enable the Google Drive API for its project.
2. Share **only the workbook file** with the service account's `client_email` as **Viewer**. Do not make the file public or share its parent folder unless that is specifically required.
3. Put the service-account JSON in the Cloudflare Worker secret store as `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` (Wrangler: `npx wrangler secret put GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`). Never commit the JSON or paste it into chat.
4. The provided Drive file ID is already set as the non-secret Worker variable `GOOGLE_DRIVE_PRODUCT_CATALOG_FILE_ID` in `platform/cloudflare/wrangler.toml`. Wrangler local runs use that value too; put it in the ignored `platform/cloudflare/.dev.vars` only if overriding the source file. The local server reads `GOOGLE_DRIVE_PRODUCT_CATALOG_FILE_ID` from its process environment. The older variable `GOOGLE_DRIVE_MODULE_CATALOG_FILE_ID` is accepted as a compatibility alias.
5. Optional: set `EXCEL_CATALOG_SYNC_TTL_SECONDS` from 30 to 3600; default is 300 seconds. A catalogue GET checks Drive after the cached snapshot expires. The workspace owner can also use **Sync Excel catalogue now**.

The service-account grant must remain file-scoped and Viewer-only. The app's normal login/OAuth session does not grant Drive access. The application backend—not the user's browser—uses the service-account secret with the `drive.readonly` OAuth scope.

## Local server

Set the same variables in the environment used to start `platform/local-server/server.js`. Keep secrets out of source control. The local JSON cache is stored under the configured `QS_DATA_DIR` and is not a workbook copy.

## Saved proposal behavior

A successful sync refreshes the shared read-only catalog but does **not** edit existing proposal fields or browser `qstudio.equipment` data. Selecting an exact module or inverter is an explicit proposal edit; cable and protection rows can be added as optional references. The selected product values are saved with that proposal so its displayed snapshot remains stable if the workbook changes. A later workbook revision requires a person to reselect a product to apply its new values.

Only signed-in staff can read the product catalogue; forcing a Drive sync is owner-only. The cached snapshot is returned if a later Drive check fails, with a stale warning. Non-production Vercel previews intentionally do not call the production API.
