# Full Additional Systems images — 24 October 2026

## Request and fix

The owner reported that selecting Advanced Systems correctly changes the image,
but the Additional Systems overview crops its top/bottom/sides. The previous
full-width, auto-height photo was centred inside an overflowing-hidden 303px
frame. This was a framing problem, not missing source resolution.

The system-specific CSS in `assets/css/bess.css` now:

- Retains the existing 303px A4 hero height and surrounding page budget.
- Gives the existing title/breathline and photo separate 42%/58% columns, so
  text and a gradient no longer obscure the photo.
- Centres the **complete** photo using intrinsic width/height and max bounds;
  no stretch, source crop, new/generated image or source-file replacement.
- Uses `object-fit: contain` as well, but does not rely on it alone: the actual
  image element retains the source aspect ratio. This matters because the
  html2canvas export path does not reliably paint `object-fit` on a mismatched
  image box. Equal source/element proportions keep the real PDF undistorted.
- Retains the owner-preferred navy hero, white/cream text and rounded frame.
  Only a thin photo perimeter is faded into that same navy: 12px left/right
  and 10px top/bottom, with the centre fully transparent and the photo sharp.
  No whole-photo opacity, blur, border or shadow is applied.
- Leaves quiet background space where a portrait/landscape source does not fill
  its frame. A differently shaped photograph cannot fill every pixel without
  cropping or stretching; full source visibility takes priority.

Scope is the Additional Systems hero plus the BESS hero reached from the same
Advanced Systems selector. Image selection, page ordering, source image bytes,
names, pricing, Finance and every frozen JS file are unchanged. This supersedes
the earlier intentional cover-crop choice.

## Verification

New suite: `qa/system-full-image.test.cjs`.

- All ten Additional Systems presets plus BESS: Leak Proof, Carport, Monitoring,
  DG, Zero Export, EV, PFC, Canopy, Pergola, Custom and battery storage.
- Desktop, 390px mobile, print and export-clone geometry: full image element
  within the frame, native aspect ratio, no text overlap, fade bounded to the actual image edges,
  no photo border/shadow, copy contrast at least 4.5:1 on navy,
  title and A4 footer fit, no horizontal overflow, unchanged Finance output.
- Additional portrait-source probe for future uploads.
- Real two-page BESS, Canopy and Monitoring PDFs using the unchanged exporter, with
  actual export snapshot geometry checked before real canvas capture.
- Hero screenshots inspected for BESS, Canopy, DG and Leak Proof. Generated screenshots
  and PDFs remain ignored under `qa/shots/system-full-image/`.
- Existing hero-polish, minimal-input, input-hierarchy and text/context browser
  suites pass, including long custom names, BESS, saved/reloaded Customer View,
  40 category/system cases and three additional real PDF formats.
- Previous cover-fit assertions now explicitly expect the owner-requested
  containment; no Finance, source-image or page-overflow checks were removed.
- Finance: 82 pass; public packaging: 31 pass; role/build/frozen parity: 311 pass;
  scope guard and negative controls: 43 pass.
- Packaging now independently byte-checks `bess.css`, with negative tamper
  coverage for the CSS and framing helper. Scope guard adds only the exact
  owner-authorised CSS and helper paths; no directory wildcard.

Run browser suites against an isolated static `QA_BASE`, not production. In the
sandbox, Playwright/Chromium and its shared libraries must be installed first.
For scope/parity, use this new branch's real comparison base:

```sh
QS_PR_BASE=1ae392d5e875fc6888e9c7e7d0b67e2af4db9219 node qa/pr-scope.test.cjs
QS_PR_BASE=1ae392d5e875fc6888e9c7e7d0b67e2af4db9219 node qa/roles-parity.test.js
```

No production deploy, main merge or D1/provider operation is implied by local
verification.

## Aesthetic follow-up — navy retained, edges softened

A white-backed alternative was previewed. The owner clarified that the navy
version was preferred and requested a slight image-edge fade instead. Navy is
restored; the photo is still complete and undistorted, without a uniform tint.

`assets/js/system-image-frame.js` is a small presentation-only enhancement loaded
by the editor and Customer View. It wraps only these two hero types and derives
the frame ratio from each image's natural dimensions, including replacement
images. No saved form, image URL, file pixels, pricing, account state, network or
frozen renderer/exporter code is changed. Export clones retain the frame ratio.

The existing shade element now supplies four narrowly sized, non-repeating
edge gradients. Separate background layers avoid both unsupported CSS masks and
`calc()` gradient-stop differences in html2canvas. This is tested in real PDF
exports, not only in the live browser. Source-vs-capture centre-pixel averages
also reject accidental full-photo darkening (maximum mean channel delta <8).

Intrinsic source proportions are retained: resizing width/height independently
would distort the equipment and structure, not reveal more scene content.
