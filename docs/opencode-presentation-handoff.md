# OpenCode — consolidated presentation handoff

## Source and deployment boundary

- Feature branch: `arena/d435d7ac-quotation-studio`.
- Existing PR: https://github.com/rushi-builds/Quotation-Studio/pull/21 — base **`merge/reconcile-v1`**, never `main`. Leave it open until the owner approves the merge.
- This release is a direct descendant of remote `601e6af`, preserving all previous feature work. Use the latest release commit referenced in PR #21, not an older image iteration or preview.
- Owner authorized pushing all pending session work. Arena did not manually deploy production or merge the PR. Existing push-triggered CI may run automatically; inspect its result separately.
- No backend/schema/config changes or DB migrations in this release. Do not run historical migrations or reset any database for these presentation changes.

## What is included

1. Final Residential About image: the owner's solar-pergola/outdoor-dining reference, AI-enhanced with restrained warm glow and cleaner detail. This supersedes all rejected six-post canopy iterations. Commercial and RWA use their distinct new artwork; Industrial's original `page-about.jpg` is unchanged.
2. Lightweight web images; four 4096px-long-edge WebP masters used only in the detached Detailed PDF snapshot. Manual uploads retain priority and are not replaced by print defaults. Print masters are **upscales, not native 4K or verified KTM project photos**. Residential native source is 848 × 1264; its 2748 × 4096 master derives from the same preserved PNG.
3. Investment page: spacious 3+2 card layout, prominent gross payable, properly proportioned taller chart, retained GST/subsidy/BOM/payment/scope qualifications and custom copy. Builder Total Project Cost intentionally means gross, not subsidy-reduced net; Annual Energy remains unchanged.
4. Earlier feature work remains included: Warranty introduction (`601e6af`), inline company/phone/full website footer, shorter tagline and cover-only QR removal. Later-page QRs and customer links remain.
5. Generated assistant knowledge synchronized with current source. Two historical repository-review documents are included for context only, not claims that every finding remains current or is repaired here.

## Safeguards

- `assets/js/finance.js`, `genFactor = 1460`, `assets/js/cloud-bridge.js`, and the original Industrial image are unchanged against `601e6af`.
- No new pricing, subsidy, authorization or sync behavior was introduced.
- Do not reintroduce an earlier Residential canopy image, remove customer-upload priority, or label illustrative artwork as a real KTM installation.

## Latest verification

**Passed:**
- Finance 82/0; Integration 117/0; Experience 49/0.
- All 15 Investment fixtures, save/reload, Customer View, custom-copy migration, mobile/print and an actual 15-page Detailed PDF export.
- About images for all four categories; manual-upload priority; saved reload/Customer View; PDF snapshot loads the 4096px master.
- Warranty introduction, footer/full website and cover-only QR regression suites.
- Remaining unit commands: Excel product API, reconcile-render, export-preflight, options, sync, audit-finance, BESS, supplements, platform API, role access, equipment calculation and site estimate.
- Cloudflare `sync-public.js` packaged 148 files, including the new image assets. Assistant knowledge: 12/12 tests.

**Not green — do not suppress or describe full CI as passed:**
- `excel-module-catalog.test.mjs`: 5/6 pass; stale default expectation (`Deye or Equivalent` vs actual `Sungrow`).
- `module-autofill.test.js`: 8 failures (missing legacy EquipmentStore methods).
- `product-match.test.js`: 19 failures (legacy product-matching expectations).
- Those three failures were independently reproduced in an isolated archive of untouched remote `601e6af`; they predate this presentation refresh.
- `roles-parity.test.js`: after static-asset sync, 297 pass / 2 fail. Its historical `git diff origin/main` guard forbids render/export changes and does not allow the new image assets. It is not a full runtime authorization verdict. Do not relax the guard indiscriminately; handle the baseline/policy mismatch explicitly.

## Owner/OpenCode next steps

1. Fetch the feature branch and inspect the release commit/PR #21 diff against `601e6af`. Preserve the correct PR base and all existing reconciled work.
2. Review the recorded non-green tests. Resolve or explicitly accept/defer existing catalogue and historical scope-guard issues through the owner's normal release gate; do not blindly claim all tests pass.
3. Use the approved owner-managed merge/deployment route only. No direct-to-main push, force-push, database reset or unrelated backend changes are needed.
4. Build/sync static assets and verify all four About images/masters exist in the deployed asset bundle. Re-run presentation checks and export a real Detailed PDF after deployment.
5. Smoke-test saved/custom-upload proposals, gross/net amounts, Warranty intro, footer website, Customer View, mobile and first-page-only QR removal. Check the latest Residential artwork is live, not a cached prior iteration.
6. Report the deployed commit, actual deployment/version ID, current preview/production URL and smoke-test results. A Git push or successful build alone is not proof of a production deployment.

Detailed provenance/validation: `docs/pending-presentation-refresh.md`.
