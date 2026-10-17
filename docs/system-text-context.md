# Text-only main-report linkage and compact supplement heroes

> Subsequent photo-lighting and headline/breathline changes are documented in
> [system-hero-polish.md](system-hero-polish.md). The owner separately authorised
> that later batch's feature-branch push and Vercel Preview.

Status: owner authorised feature-branch push and a fresh Vercel Preview on
17 October 2026 ("preview vercel") after local verification. This correction
supersedes published checkpoint a54ee51. No PR merge or manual production
deployment is authorised. The linked Cloudflare Git auto-build may also run
on push; its outcome is separate from Vercel Preview.

## Owner correction

Connecting an additional system does **not** mean replacing/repeating its image
on the ordinary proposal pages. Its substantive overview, scope and optional
rainwater assessment stay dedicated; the main report should identify and refer
to the selected scope through concise text, not look like an unrelated report
with an unrelated attachment. Later owner clarification also requires additional
system image height to match the existing BESS presentation, not the tall
full-photo layout introduced in the previous batch.

## Changed

- Executive Summary and Proposed Solution retain their original approved photos.
  Automatic managed photo substitutions from the previous renderer are restored.
  Actual customer-uploaded photo overrides remain untouched. About, portfolio,
  company branding and other normal report imagery are unchanged.
- Power Proposal uses its normal category/photo selection, not the additional
  system illustration. Its optional-scope disclosure is a compact paragraph,
  not a second illustrated/styled package card. No extra image is inserted.
- Compact text in the cover's customer metadata, executive subtitle, solution
  scope note, EPC closing note and investment disclosure connects the selection.
  Battery-only proposals get meaningful text linkage too. Custom names and
  legacy combined selections remain supported. Rainwater quantities/methodology
  stay on the system/collection pages rather than being repeated in the main
  solution note. Ordinary warranty, savings and technical-spec headings are no
  longer replaced just for selecting an additional system.
- Removed the floating cover label over the middle/right photographic area.
  A quiet, unboxed **Additional scope** row now sits in the left customer-details
  area beneath the date and above the artwork divider, without moving customer
  identity, address, capacity, reference, date or approved artwork.
- Picker sequence: **No Advanced System → Leak Proof → Carport → BESS → Energy
  Monitoring → DG–Solar Coordination → Zero Export → EV → PFC → Canopy → Pergola
  → Custom**. The hidden saved combined-package compatibility option remains.
- **Advanced Systems** is the normal input section immediately **after QR &
  links**, before the expert-settings drawer. Canonical input IDs, protected
  switching, pricing controls, persistence and review workflow are retained.
- All system overview hero frames are now **303 CSS px, matching BESS**, using
  the same left/top transparent title overlay and gradient direction. The old
  auto-height/3:2 layout and 390/330px density caps are gone. Images fill the
  compact frame without stretching or a solid side partition. This intentionally
  uses a BESS-style **cover crop**, superseding the previous uncropped/tall-photo
  requirement. Actual image boxes preserve native aspect ratio, so html2canvas
  cannot stretch the photograph while ignoring `object-fit`. Original image
  assets and the BESS engine are unchanged. Long custom names shrink within the
  fixed frame rather than growing it or clipping the title.

No automatic cost additions, changed generation factors, invented measurements
or new assumptions. Rainwater-enabled detailed Leak Proof remains three pages,
system short remains one, ordinary system detail two, Power Proposal six. Main
proposal still conditionally inserts the selected supplements and numbers them
as part of the full report. Customer View derives from that same saved state.

## Verification

- `qa/system-text-context.test.cjs`: exact picker/section sequence; 40 category ×
  system cases preserve every ordinary-page and Power photograph; all hero
  frames match BESS 303px; actual image geometry preserves native proportions;
  cover label is within left metadata bounds, below date/above artwork divider,
  with no background box; text links survive, including battery-only. Older
  automatic images restore, user overrides remain, disabled context clears and
  mobile has no horizontal overflow.
- Updated only superseded photo/fit assertions in package matrix, rainwater,
  input-hierarchy and minimal browser tests; original system-hero sources,
  prices, custom scope and report-count assertions remain.
- Water browser: actual **3/1/18/6-page PDFs**, reload/Customer View, literal
  custom text, strict flags, review invalidation, dense full-report investment/
  financing and Power fit, mobile and removal/reset pass.
- Minimal and unified browser suites pass, including catalogue-backed BESS,
  legacy combined state, independent additions and actual system/short PDFs.
- Package matrix passed 72 category/price cases + 8 dense cases after the compact
  frame/text correction; final native-ratio image sizing was then additionally
  verified by the 40-case context test and actual water/full/Power PDF exports.
- Duplicate → JSON → New → file import preserves 19 scope/water/reference/price/
  strict-acknowledgement fields. Integration 117, render 123, supplements 63,
  Finance 82 and knowledge/voice 13 checks pass.
- Legacy `control-panel.test.js` stops at its all-defaults-have-inputs assertion:
  `custSalutation`, `custSalutationCustom`, `custSpokenName` have no DOM input.
  Those same IDs are absent in the published a54ee51 markup too. No unrelated
  salutation controls were added, and no whole-repository green claim is made.
- Finance.js, genFactor1460, cloud-bridge.js, BESS engine and app.css are unchanged
  from this correction's starting SHA-256 baseline.

Ignored proof artifacts: `qa/shots/system-text-context/` and
`qa/shots/rainwater/`. They are illustrative examples, not customer site records.
Verify the new preview against the exact correction commit in GitHub deployment
metadata; the older a54ee51 preview must not be presented as this correction.
