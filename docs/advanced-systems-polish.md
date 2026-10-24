# Advanced Systems — final local workflow polish

> Historical checkpoint (published 929545f). The subsequent **unified-selector**
> implementation is documented in [unified-system-workflow.md](unified-system-workflow.md)
> and supersedes the independent / nested-BESS UI described below.

The owner subsequently authorised publishing this completed local work as a
feature-branch commit and Vercel Preview. No PR merge or manual production
deployment by Arena is authorised. Existing Cloudflare Git auto-builds may run
on push and must be reported separately from the Vercel Preview result.
Preserve all pre-existing working-tree changes; this batch does not modify the
frozen Finance, generation factor or CloudBridge sources.

## User flow

Advanced Systems has two independent choices: **Solar roof & other upgrades**,
and a folded **Battery storage (BESS)** group. Off/Add labels no longer imply
that disabling one disables the other. Routine package inputs remain template,
price mode and price (or the base-rate acknowledgement for Included mode).
Scope, site requirements and report preferences remain folded and editable.

An empty new package starts with Leak Proof Solar Roof. Known templates fill
useful proposed narrative without inventing site dimensions, price, warranty or
engineering approval. Unmodified generated presets switch without a modal;
actual edits, commercial amounts, measured requirements or prior review trigger
confirmation. Cancel preserves those values and acknowledgements. Template
replacement clears stale commercial/site values and review acknowledgements.
Custom scope and uploaded photos remain protected.

Structural package overview pages additionally show the selected solar module
make/model/count/wattage and solar inverter make/model/rating from the existing
quotation and Finance result. This is reference equipment, not a new sizing rule,
additional supply charge or a battery compatibility assessment. All content is
escaped. Whole concept photos and the approved About images remain unchanged.

## Before sharing

One folded, private preparer checklist replaces scattered new warnings:

- Separate price missing/invalid, or explicit confirmation that the entered
  base rate/BOM includes the package for Included mode.
- Proposed scope and exclusions needing preparer review.
- Missing/invalid structural requirements; entered dimensions never constitute
  a structural certificate.
- Battery price, specification/sizing gaps and unestablished outage backup.
- Missing storage operating assumptions before making savings claims.

Rows open/focus the corresponding existing input, including nested disclosures.
The acknowledgement booleans are strict, default false and persist through the
normal JSON/duplicate/save paths. Editing scope, site requirements or solar
hardware clears scope/base review; changing pricing/BOM/tax inputs clears base
review. Nothing checks a box or approves compatibility automatically.

The checklist is a review aid, not a new PDF blocker, installation authorisation,
engineering certificate or guaranteed Ready-to-send badge. It remains outside
customer pages and export snapshots. The ordinary download path is unchanged.
On mobile the existing floating PDF shortcut is hidden only while this checklist
and its containing section are open, preventing text obstruction; collapsing
Advanced Systems restores it, and the footer download remains available.

## Verification

- Package pure checks: **16 passed** (pricing isolation, missing/invalid review
  states, strict acknowledgements, battery caveats, linked hardware and safe
  template-switch detection).
- New `qa/system-review.test.cjs`: real review links, pending/completed states,
  cancellation, invalidation, strict imported flags, reload, independent BESS,
  model-change resets, mobile/no overflow, PDF shortcut restoration, private
  Customer View and an actual two-page Carport report.
- Existing minimal workflow: all four concept photos and automatically filled
  package pages, conservative measured facts, legacy naming, reload and mobile.
- Package browser matrix: **72** preset/category/mode cases + **8** dense
  commercial tax/BOM/payment-warning/financing cases passed. Actual 2/1/6/17-page
  PDFs passed with snapshot cleanup and standalone numbering.
- Existing supplements browser regression: **94 passed, 0 failed**, including
  actual 21-page combined Detailed and six-page Power reports.
- Finance **82/0**, Integration **117/0**, supplements pure **63/0**, render
  reconciliation **123/0**, assistant knowledge/voices **13/0**.
- Actual Duplicate → JSON backup → New → file import preserves all **15**
  structural/pricing/include/review fields.

Reviewed screenshots and the fresh sample two-page PDF are ignored QA artifacts
in `qa/shots/system-review/`. They use illustrative inputs, not a real contract.
The earlier old control-panel harness limitations remain documented in
`docs/additional-systems-upgrade.md`; this is not a whole-repository green claim.
A pre-existing whitespace error in `index.html` is outside this batch and was
left untouched. Modified files for this feature receive scoped syntax/whitespace
checks. The frozen files are compared with their start-of-batch SHA-256 hashes,
not the unrelated cumulative working-tree diff.

Reproduce through the existing local server on :8080 with QA dependencies and a
working Chromium environment. In this sandbox browser QA uses
`LD_LIBRARY_PATH=/tmp/al2023/lib`. `npm run test:systems` in `qa/` includes the new
review test. Dependency installation may need `--legacy-peer-deps` because of
the existing chrome-aws-lambda / puppeteer-core peer-version conflict.
