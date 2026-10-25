# OpenCode handoff — Excel-first catalogue live verification

## State / access boundary

Arena implemented and tested the feature on
`arena/60c22a73-quotation-studio`. **No Worker has been deployed by Arena;
no live Drive workbook, D1, secrets, bindings, DNS or domain settings have been
modified.** The Vercel branch preview deliberately blocks production API calls;
its neutral connection state is not proof of a broken/configured live source.

Use the reviewed branch tip, not an older main checkout. Review
`docs/excel-catalogue.md` and its isolated tests first. This handoff does not
itself authorize a main merge, production deployment, source edit or live sync;
obtain the owner's normal release approval for those steps.

## Review and deploy only into the owner's existing target

1. Verify the existing target/account through the owner's approved setup.
   `vercel.json` currently points at **qs-studio-rushi**. The repository's generic
   Wrangler defaults must NOT accidentally create/deploy a different Worker.
   Use the existing owner-reviewed target/configuration; if they do not match,
   stop and ask. Do not rename/create/move Workers or D1 databases.
2. Confirm the existing D1 binding has `equipment_catalogue` and
   `equipment_catalogue_meta` from migration 006. **No new migration is required.**
   If absent, stop for review of that existing additive migration; never reset
   schema, delete rows manually, replay destructive migrations, or change DB IDs.
3. Confirm the existing product-catalogue file-ID setting resolves to the same
   intended original workbook as the current connected product catalogue. The
   new controller uses the product file-ID variable first, then compatibility
   aliases. Do not retarget a folder/new file to make a smoke test pass.
4. Reuse the existing `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` secret and file-scoped
   **Viewer** permission. Never expose, rotate, print, paste or commit the JSON,
   tokens, cookies or private keys. Do not make the workbook public or expand
   Drive scope/edit access. No new credential/setup is inherently required.
5. Compare the currently deployed Worker version/source with this branch. Do
   not overwrite newer live fixes with an older source checkout; stop for review
   if the histories differ. Build/package/test through the existing approved path. Following explicit
   production release approval, deploy the reviewed branch assets + Worker
   together using the existing target, without changing protected configuration.
   Report exact Git SHA, Worker deployment/version and smoke outcome—not secret
   values or customer JSON. Main remains a separate owner approval.

## Live smoke (existing authorized account; no disposable production users)

- Sign in through the normal browser flow. Unauthenticated
  `GET /api/catalogue/status` must return 401. Signed-in status must show the
  exact source filename/URL, checked time and truthful state. Inspect locally;
  do not share auth headers or session values in chat.
- **Edit Excel ↗** must open that original file, not a folder,
  duplicate or converted sheet. Human edit permission is independent of the
  service account. For `.xlsm`, verify the owner's Excel/Drive save-back flow;
  Drive's preview does not mean browser/desktop Excel was automatically launched.
- Metadata/focus/one-minute checks must not POST sync or download the workbook.
  No connection → neutral explanation, not green. Public-link mode remains
  unverifiable; do not enable public mode as a workaround.
- A first live **Sync catalogue** updates shared D1 catalogue data. Do this only
  with the owner's approval. Verify all category counts/rows, not just the API's
  success flag. Same-model rating-bin rows must not disappear.
- After an **owner-approved legitimate Excel update**, verify soft-red
  “Please sync”; arrow only navigates; manual sync then verifies
  “Up to date”. Do not add/delete fake QA products in the production
  workbook. If there is no approved real edit, report changed-file detection as
  fixture-tested but not live-smoked instead of manufacturing production changes.
- A connection failure must retain the last valid snapshot and never show a
  fresh up-to-date claim. A workbook saved during download must abort cleanly.
- A second authorized browser should load the saved snapshot by GET, including
  row-count repair when an old partial cache has the same workbook SHA.
- Verify an existing quote's source input values and Finance do not change just
  from checking/syncing; explicit product reselection applies new values.
  Check reload, proposal switch, Customer View, mobile and a normal PDF locally.
- Existing owner/elevated-admin sync gate remains; use existing approved test
  accounts only if live role checks are needed. Do not change real users' roles
  or create production users to test denial.

## Explicit limits

Only the three existing equipment tables are in this sync. Structures,
protection/BESS/other system tables need separately verified source mapping and
owner scope approval; do not invent them or modify the frozen engines. Archived
browser entries remain preserved, not auto-uploaded into Excel. Existing product
catalogue APIs outside this source-control sync are not refactored here.

Finance/genFactor 1460, cloud-bridge, render/export/calculation files and artwork
must retain their approved byte identity. The pre-existing legacy manual
Custom-entry reload/spec edge-case was not part of this Excel-first repair;
see the earlier equipment-library history. Do not claim an all-suite or live
production pass based solely on the new isolated fixtures.
