# Main branch and image edits

## Source consolidation — 24 October 2026

The owner requested that the current app and image folders be available on
`main`, rather than split between `main` and `merge/reconcile-v1`.

This consolidation starts with deployed release
`396b68e77277d6fa24dc3a4f33d55cf5b0febaea` and retains the existing `main`
changes through `9eaa0308c2deedbf0d2a539f52ecfe3422b2dcd8`, including the
owner's replacement `bess-concept.jpg` and five existing asset deletions.
The owner's BESS artwork is also copied to the actual BESS display asset,
`storage-evening.jpg`. No frozen JS is changed to redirect that image.

## Which image should I replace?

Keep the exact filename, path and genuine image format. Merely renaming a PNG
to `.jpg` is not an image conversion.

| Screen / report image | Actual referenced file |
| --- | --- |
| BESS overview hero | `assets/images/storage-evening.jpg` |
| Elevated Solar Canopy | `assets/images/system-elevated-canopy.jpg` |
| DG–Solar Coordination | `assets/images/system-dg-concept.jpg` |
| Residential About, screen | `assets/images/about-residential-solar.jpg` |
| Residential About, PDF master | `assets/images/masters/about-residential-solar-4k.webp` |
| Commercial About, screen | `assets/images/about-commercial-solar.jpg` |
| Commercial About, PDF master | `assets/images/masters/about-commercial-solar-4k.webp` |
| Industrial About, screen | `assets/images/page-about.jpg` |
| Industrial About, PDF master | `assets/images/masters/about-industrial-solar-4k.webp` |
| RWA About, screen | `assets/images/about-rwa-solar.jpg` |
| RWA About, PDF master | `assets/images/masters/about-rwa-solar-4k.webp` |

`bess-concept.jpg` is retained as the owner's uploaded source, but is not the
current renderer's image URL. Future edits to it alone do **not** automatically
update `storage-evening.jpg`. Replace the actual referenced file above.

For About artwork, export both the lightweight screen image and its matching
PDF master from the same source. There is no automatic master-to-web conversion
on a GitHub upload. The historical `-4k` filename is a path, not a guarantee
that a replacement has 4K dimensions. Saved proposal-specific uploads can take
priority over the category defaults; check a proposal without an image override.

## Main is not automatically the production build branch

Merging repository content into `main` does **not** change Cloudflare Workers
Builds' external branch selection. The operator's last deployment used
`merge/reconcile-v1`. Until the operator switches the existing production build
to `main`, main-only changes will not automatically reach that Worker.

The intended one-branch workflow is:

1. Operator verifies the existing Worker/account/DB identity and updates only
   that Worker's Git build branch to `main`, keeping its existing root/build/
   deploy commands, bindings, variables and secrets.
2. Trigger and verify an exact-SHA build of the merged main commit.
3. Verify live image bytes against that commit and inspect screen/PDF artwork.
4. Thereafter, commit image replacements to `main`, wait for a successful build,
   then hard-refresh the actual production URL.

This repository change does not itself perform that external setting update,
run a manual Worker deploy, reapply a D1 migration, or alter DNS/secrets.

## Verification at consolidation

- Owner's BESS source matches the latest main blob byte-for-byte; displayed BESS
  image is an identical copy.
- Latest deployed canopy and Residential screen/master images are retained.
- All ten frozen JS files are byte-identical to golden `8cc7db1`.
- Workspace visual regression: 212 pass.
- Access API, disposable local + SQLite-backed Worker: 95 pass.
- Public packaging: 27 pass; additional fresh-build image byte comparisons.
- Functional finishing: 14 pass; Pulse integration passes.
- About browser: four categories, saved/manual overrides, Customer View,
  export snapshot, print and mobile pass.

These local checks do not certify an external production build setting change
or an authenticated live owner/sales session.
