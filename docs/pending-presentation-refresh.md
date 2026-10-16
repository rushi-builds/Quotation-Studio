# Pending presentation refresh

## Deployment ledger

- Last Cloudflare deployment reported by the owner/OpenCode: `c5a5fc5` (not independently rechecked here).
- `601e6af`: Warranty-page introduction; already on the feature branch, reported pending Cloudflare deployment.
- Owner has now authorized a consolidated feature-branch push. This refresh includes the final approved About artwork and the rebalanced Investment page, on top of `601e6af`. Deployment/PR merge remain owner-managed; see `docs/opencode-presentation-handoff.md`.

## Current local changes

- Residential now uses an AI-enhanced version of the owner-supplied solar-pergola / outdoor-dining terrace image. Owner requested restrained warm glow and improved detail: softly warm pendants, richer natural contrast and clearer textures; original scene retained without intentional structural redesign. Enhanced native PNG: `assets/images/masters/about-residential-solar-source.png`; web and print copies derive from this source. It is not verified as an actual KTM project photograph. Commercial/RWA retain their dedicated illustrative artwork; Industrial retains `page-about.jpg`.
- The three new JPGs are AI-generated illustrative architecture, not verified KTM project photographs. Their accessible descriptions remain illustrative; the real project portfolio is unchanged.
- Web image source dimensions: Residential 848 × 1264 (AI-enhanced owner attachment); Commercial/RWA 928 × 1152. Print masters have a 4096px long edge (Residential 2748 × 4096; Commercial/RWA 3300 × 4096; Industrial 4096 × 2234). These are upscales, **not native-4K photography or newly recovered detail**. Lanczos resampling with mild sharpening; WebP quality 88 (Residential 90). The preserved Residential PNG source is not loaded by the app.
- Builder and Customer View keep the lightweight images. The detached Detailed PDF snapshot selects the 4K master via `data-print-src` and waits for it to load. Manual uploads clear that attribute and remain unchanged. Browser print uses the regular, already print-suitable web image.
- Investment breakdown uses three wider cost cards followed by two wider benefit cards; decorative repeated symbols removed. Gross amount remains prominent and separate from subsidy-reduced effective cost.
- The full-width cost chart is redrawn at 300px height (270px when tax/upgrade qualifications need space). Narrower itemised-BOM charts are 240px high. Canvas and CSS aspect ratios are checked together.
- Repeated marketing subtitle and decorative header rule removed on this page; exact old default subtitle migrates, customer-written subtitles are retained.
- All six price-inclusion items remain as a compact checklist. Payment terms, percentage warnings, tax qualifications, subsidy eligibility and other financial conditions remain present.
- No financial computation changes. `finance.js`, genFactor1460 and `cloud-bridge.js` remain untouched. Industrial image file is unchanged.

## Validation

- Investment regression: 15 fixtures, gross/net/subsidy/payment parity, two-row card geometry, graph aspect ratio, A4 clearance, saved reload, Customer View, print/mobile, legacy/default migration and custom copy preservation.
- Real 15-page Detailed PDF export, snapshot amount and cleanup: pass.
- About regression: all four categories, distinct new assets, manual uploaded-photo priority, reload, Customer View, print/mobile and exporter snapshot: pass.
- Warranty introduction regression: pass.
- Finance: 82/0. Integration: 117/0. Experience: 49/0.
- Latest release verification reran all presentation checks above, including the actual 15-page PDF. Footer/website and cover-only QR regressions also passed. Cloudflare static-asset sync succeeded (148 files), including all print masters; assistant knowledge regenerated and all 12 knowledge tests passed.
- Full `npm test` is **not green**: Excel catalogue selection test expects `Deye or Equivalent` but the default is `Sungrow` (5/6 passing); module-autofill has 8 failures and product-match has 19. Each was reproduced in an isolated archive of the untouched remote `601e6af` baseline. These are not silently repaired by changing equipment behavior in a presentation release.
- `roles-parity.test.js` after asset sync: 297 passing, 2 failing historical branch-scope assertions (comparison to `origin/main` disallows render/export edits and image assets). Runtime role/access checks pass (150/0); actual frozen Finance and CloudBridge blobs match `601e6af`.
- Generated QA screenshots/PDFs and public build output are ignored, not release assets.

## Preview publishing

The owner explicitly authorized this consolidated push. Existing GitHub integrations may trigger Vercel previews and automated Cloudflare builds. No manual Cloudflare/production deployment or PR merge is part of this handoff. The owner/OpenCode must review checks, handle the known baseline-test issues, and use the approved deployment workflow. Do not describe an old preview as the current release.

## Post-release visual corrections — local, not deployed

Owner reported the `f6b330c` deployment live as version `b2bb248a-674e-4e10-b4a4-d0f1b4d970fe` (reported by owner/OpenCode, not independently checked here).

Subsequent screenshot feedback is addressed locally:
- Automatic Residential About portrait uses its full image with `contain` in a matching 460px-tall frame; the text column reserves space so company statistics do not overlap it. Other categories and manual uploads retain their prior frame treatment. No artwork regenerated.
- Five Investment cards retain 3+2 placement with distinct restrained blue, cream, mint, lavender and peach fills.
- Restored all six original equipment inclusion images, previously hidden by the Investment CSS. Compact spacing preserves A4 clearance with BOM, tax notes and payment warnings.
- Validation: About all-category/upload/reload/share/print/snapshot checks pass; all 15 Investment fixtures plus real 15-page Detailed PDF pass; inclusion visibility and full-portrait framing assertions added. Visual discovery 27/0, Finance 82/0, Integration 117/0. Finance and CloudBridge unchanged.
- These corrections are NOT included in the previously reported live `f6b330c`; no subsequent push or deployment has been performed as part of this correction.
