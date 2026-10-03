# Customer-category cover photographs

Only page 1's photographic background changes with `customerType`:

- Residential or unknown category: original `cover-editable-background.png`, unchanged.
- Commercial: premium office campus with rooftop solar.
- Industrial: modern solar-roof factory/logistics facility.
- RWA: apartment community with shared rooftop solar.

The approved navy panel, logo, gold border, text placement, upper-right slogan, KPI/footer structure and live text overlays are retained. Other pages and all calculations remain unchanged. Photos are illustrative AI-generated concepts, not evidence of actual installed projects; their alt text identifies this.

`renderCover()` derives the asset directly from existing customer type. No new saved fields or migration are required. Reload, read-only Customer View and detailed PDF snapshots retain the appropriate category. Selecting Residential restores the original PNG. The full Detailed Proposal retains the first-page-only image change. The subsequently expanded five-page Power Proposal also uses the matching category scene in its own overview.

## Assets and reproduction

Run `python scripts/build-category-covers.py` with Pillow installed. It reads the original cover without modifying it, masks only the photo region, retains the top slogan/sky and blends into the generated scene. The JPEG scene sources are committed for reproducibility.

The generated photographs are 784×1360 pixels. Final WebP covers are **2926×4096**, high-quality resampled compositions, not native-4K photography. Compressed covers are approximately 1.5 MB each; only the selected cover is requested. These dimensions do not change the existing PDF capture scale or page size.

## Validation

`qa/category-cover.test.cjs` verifies all four categories, loaded asset dimensions, unchanged images on other pages, live generation values, print/raster capture of each cover, save/reload, Customer View, an actual 15-page detailed PDF, unknown-category fallback and mobile overflow. It also verifies that the original residential file is not modified during the test.

Existing cover-sync, opening-pages and RWA browser regressions pass. Finance suite: 82 passed, zero failed. Source inspection confirms no changes to finance code, CSS, or other-page imagery.
