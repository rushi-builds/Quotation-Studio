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
  within the frame, native aspect ratio, no text overlap, no shade on the image,
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
- Finance: 82 pass; public packaging: 29 pass; role/build/frozen parity: 310 pass;
  scope guard and negative controls: 43 pass.
- Packaging now independently byte-checks `bess.css`, with negative tamper
  coverage. Scope guard adds only this exact owner-authorised CSS path.

Run browser suites against an isolated static `QA_BASE`, not production. In the
sandbox, Playwright/Chromium and its shared libraries must be installed first.
For scope/parity, use this new branch's real comparison base:

```sh
QS_PR_BASE=1ae392d5e875fc6888e9c7e7d0b67e2af4db9219 node qa/pr-scope.test.cjs
QS_PR_BASE=1ae392d5e875fc6888e9c7e7d0b67e2af4db9219 node qa/roles-parity.test.js
```

No production deploy, main merge or D1/provider operation is implied by local
verification.
