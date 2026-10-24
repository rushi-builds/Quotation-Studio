# Full Additional Systems images — final rounded finish

## Owner's latest decision

Keep the navy hero and complete, sharp photograph with rounded corners only.
Both the earlier inward fade and outward edge-colour halo are removed. No blur,
fade, tint, gradient, shadow or decorative image generation remains.

## Implementation

- `assets/css/bess.css`: existing 303px hero, 42%/58% copy/photo columns,
  navy `#13283e`, white/cream copy and 8px photo corners.
- A small inset leaves breathing room around the photo. The original photograph
  retains its native aspect ratio; no stretching or scene crop.
- `assets/js/system-image-frame.js` only wraps the photo and reads its natural
  dimensions into a CSS ratio. Canvas/PNG generation and resize painting removed.
- Existing renderer shade elements are hidden. The original image files, URLs,
  selection state, Finance, pricing and all frozen renderer/exporter code remain
  unchanged. Editor and Customer View load the same presentation helper.
- Native-ratio image elements avoid html2canvas's mismatched-box object-fit issue.
  Cloned frames retain their ratio; ordinary rounded clipping works in exports.

## Verification

`qa/system-full-image.test.cjs` checks all eleven choices including BESS, plus a
portrait probe, desktop/mobile/print/export geometry, 8px corners, hidden shade,
no generated halo, sharp untinted capture centre, no scene crop or distortion,
copy contrast, A4 fit and unchanged Finance. Actual two-page BESS, Canopy and
Monitoring PDFs and saved Customer View are covered. Screenshots/PDFs are ignored
under `qa/shots/system-full-image/`.

Regression suites: system-hero-polish, system-minimal, system-input-hierarchy,
system-text-context. Guards: Finance 82, public packaging 31, scope 43,
role/build/frozen parity 311.

Scope/parity comparison base:
`QS_PR_BASE=1ae392d5e875fc6888e9c7e7d0b67e2af4db9219`.
Run browser tests against isolated static QA, never live customer sessions.
No main merge or production/D1/provider operation is implied.
