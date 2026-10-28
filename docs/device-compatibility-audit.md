# Laptop and touch-device UI audit — 28 October 2026

## Result and scope

**309/309 checks passed across nine Chromium profiles.** This is browser/device emulation, not physical-device or Safari certification. The approved proposal artwork, financial calculations, export engine, authentication, permissions, and production backend were not changed.

| Profile | CSS viewport | Checks |
| --- | --- | --- |
| Laptop | 1366 × 768 | 25/25 |
| Laptop | 1536 × 864 | 25/25 |
| Android small (touch) | 360 × 740 | 37/37 |
| Pixel 7 (touch) | 412 × 839 | 37/37 |
| iPhone SE profile (touch) | 320 × 568 | 37/37 |
| iPhone 13 profile (touch) | 390 × 664 | 37/37 |
| iPhone 13 landscape (touch) | 750 × 342 | 37/37 |
| iPad 7 portrait (touch) | 810 × 1080 | 37/37 |
| iPad 7 landscape (touch) | 1080 × 810 | 37/37 |

Viewport values are Playwright device-profile CSS dimensions, not physical screen pixels. The exact values are recorded in the generated `results.json`.

## Actual UI fixes

1. Touch-only builder fields now use **16px text and a minimum 44px height**, including search, proposal selector, Advanced Edit and engineering notes. This removes the small-font condition that causes native iOS focus zoom; pinch zoom is not disabled. Main builder mode/search/customer/PDF actions also have minimum 44px heights.
2. Touch-only dashboard fields and feedback textarea use 16px text; dashboard editing fields have minimum 44px heights. Desktop typography and button typography remain unchanged.
3. The **Versions & links** picker used an intrinsic-width grid track, causing the 320px phone page to scroll horizontally (332px document width). Its mobile track now shrinks properly; native select fits the card. Data tables retain their intentional **local** horizontal scrolling.
4. Updated the preflight test's hardcoded loader to include the real `proposal-marks.js` dependency. This fixes test-only Terms-render console errors without changing the renderer or weakening checks.

Only CSS, stylesheet cache versions, QA and this handoff changed.

## What the matrix exercised

- Real click/tap on All mode, equipment search result, form inputs and feedback rating.
- Real typing with a long housing-society customer name and Pune address; live cover/capacity update.
- Local save, browser reload and read-only Customer View using the same saved proposal.
- Expanded builder fields staying within the panel; touch typography and field heights.
- A4 page bounds and body/footer collision checks in Customer View.
- Actual Chromium print-PDF file generation on both laptop profiles.
- Feedback rating, text retention and unpublished preview remaining disabled (no fake save/receipt).
- All ten dashboard panels: overview, quotations, follow-ups, activity, send, gallery, sales, settings, reports and publish; width fit on every profile and touch-field checks.
- No browser runtime errors and no attempted API/auth writes in the matrix. Off-origin/API/auth requests are intercepted; dashboard uses the existing read-only sample frame, never a production session/permission override.

Artifacts (ignored, not shipped): `qa/shots/device-compatibility/results.json`, device screenshots and laptop PDFs.

## Additional regression results

- `appearance-polish.test.cjs`: PASS; all 17 detailed and six Power pages, live inputs, optional reversal, mobile/print, preserved artwork and finance parity.
- `control-panel.test.js`: **41/0**; search, persistence, proposal switching, storage failure honesty, Customer View and mobile.
- `workspace-fit-browser.test.cjs`: **28/0**.
- `workspace-visual-consistency.test.cjs`: **212/0** after touch fixes; three themes, contrast, keyboard focus, dialogs and touch actions.
- `editor-groups.test.cjs`: PASS; 13 sections, saved/conditional fields and 1440/390/360 grids.
- `feedback-preview.test.cjs`: PASS; actual preview, mobile, no writes or fake receipts.
- `proposal-values.test.cjs`: PASS; eight four-icon rows including Solution, footer clearance, print/mobile/continuations and actual three-page exporter PDF.
- `closing-page.test.cjs`: PASS; actual exporter PDF and link annotations, mobile, safe feedback routing and continuation.
- `page-spacing.test.js`: **29/0**, including an actual 17-page stress-case exporter PDF.
- `export-preflight.test.js`: **50/0** after loading the real marks dependency.
- `finance.test.js`: **82/0**; engine unchanged.

## Explicit limitations / remaining release checks

- **Safari/WebKit not run:** Playwright's WebKit download failed on the sandbox's blocked download hosts. iPhone/iPad names above mean Chromium with Apple device dimensions/touch/user agent, NOT Safari engine coverage.
- Physical Android Chrome and iOS Safari still need a short owner-device smoke: typing with native keyboard open, native selects/date pickers, portrait/landscape, pinch zoom, PDF download → Files/share sheet, WhatsApp and safe-area/browser toolbar behavior.
- No production login, live quote publish, catalogue Sync, provider, feedback save or backend release was exercised.
- The older `export-audit.test.cjs` cannot complete against the static server. A separate disposable local backend attempt was **blocked by the current pricing-access policy (`PRICING_ACCESS_REQUIRED`)** at proposal creation. Stopped without granting access, changing policy or bypassing authority. This is **not a passing live/published-portal end-to-end test**. Actual offline PDF rendering is independently covered by the passing tests above.
- A read-only look at the protected sign-in page found compact targets on the 320px profile (roughly 28px-high fields / 30px primary action). Authentication/login files were intentionally left unchanged under the standing protection; a login-only CSS/accessibility pass would need separate approval. No login was submitted.

## Re-run

With a local static server on port 8080 and QA dependencies installed:

```sh
LD_LIBRARY_PATH=/tmp/chromium-libs/lib npm --prefix qa run test:devices
```

The library prefix is sandbox-specific. No production credentials are needed. Tests generate disposable browser-local data only.
