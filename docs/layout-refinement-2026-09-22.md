# Tracking image and restrained A4 layout refinement

## Requested image

Copied **only** `assets/images/Tracking.png` from GitHub `origin/main` commit
`cfdf9b0df2c4197f38397731ae9593110dd52673`. The local and upstream Git blob hashes
both equal `b876c635488fccbf11217838e7baf6899e2e1557`. No regeneration, crop or
re-encoding was applied. The existing asset path means the portfolio and gallery
use the new image; saved proposal-specific photo overrides remain respected.
The 500 kWp ground-mounted tracking reference remains separate from the 1,700 kWp
rooftop reference. The ten normal portfolio cards and 132px photo frames are unchanged.

## Whitespace approach

Reviewed every default A4 page before changing sizes. Retained breathing room
rather than adding filler or repeating content. Changes are scoped to spacious
story pages and the executive summary:

- Modest text increases: selected body paragraphs 11.4 → 12.2px; card descriptions
  generally around 10–11.5px, depending on the page.
- Slightly larger existing photographs: About 292 → 340px; benefits/solution/Why
  KTM 230 → 260px; scope 180 → 210px; quality/warranty 180 → 230px.
- Benefits, solution and quality cards use two columns for more readable copy.
- Shorter gaps between related sections; clearer terms and warranty text.
- No new claims, filler copy, new stock imagery or financial assumptions.

Selected default-page content endpoints, measured in unscaled A4 pixels from the
page top (footer begins at 1089px):

| Page / final content block | Before | After |
| --- | ---: | ---: |
| Executive summary / trace note | 819 | 905 |
| Why Solar / benefits | 744 | 922 |
| Proposed solution / scope note | 908 | 1013 |
| Installation quality / checklist | 758 | 968 |

The approved cover artwork/background, small-house system diagram, savings tables
and gallery layout are preserved. Financial computation code is unchanged.

## Additional PDF findings corrected

The optional-content stress check exposed pre-existing overflow with site-area
rows plus report links, and with the full commercial BOM/cost breakdown. These
combinations now use tighter spacing. Chart canvases redraw at explicit compact
dimensions when a BOM is present, then return to their full size when it is cleared;
text is not scaled down and no disclaimers/rows are omitted.

PDF inspection also caught a GST chart caption reading `undefined%`. The chart now
uses the engine's actual `gstPercent` field. The tax banner's emoji was replaced
with the existing building SVG icon to avoid missing-font glyphs. Explicit stacking
order keeps white SVG pictograms above their orange chip backgrounds in full-page
html2canvas captures; an actual canvas-pixel regression checks this, not just DOM
presence.

## Regression coverage

`qa/page-spacing.test.js` checks default/10/20/100 kWp layouts, commercial bill,
all six BOM entries, loan, two system options, site-area and report rows, long custom
makes, print, mobile scaling and Customer View. It downloads a real **17-page PDF**,
checks the actual capture path for footer collisions, saves selected page rasters
for visual inspection, and verifies the GST caption and visible PDF icon pixels.

`qa/tracking-project.test.js` now pins the updated image hash. The existing visual
layout test retains collision assertions and checks the intentional new photograph
sizes. Test screenshots and PDFs remain ignored QA artifacts, not repository assets.

No merge or production deployment is authorized by this refinement.

### Executed checks

- Full unit chain: **341 checks passed**.
- Full browser chain: **518 numbered checks passed**, plus live-cover checks and
  real 2-/15-/16-/17-page PDF exports.
- After the final SVG paint-order correction, reran the expanded layout suite:
  **23 checks passed**, including the 17-page stress-case download and actual
  white-pictogram pixel check. Also reran live-cover, visual-discovery, tracking
  and technical-specification regressions (85 numbered checks plus live-cover).
- Updated tracking-file identity and approved cover/background hashes verified.
- No browser runtime errors reported by the export suite.

This verifies the listed cases, not arbitrarily long custom copy or every possible
combination of user inputs. Changes remain preview-only for user review.
