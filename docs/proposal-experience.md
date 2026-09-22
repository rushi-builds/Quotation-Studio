# Public gallery, Power Proposal and savings explorer

## What is available

- **Builder:** the PDF-format dropdown above the download button offers the existing
  detailed report (default) or a dedicated **two-page Power Proposal**.
- **Customer View:** the same choice is available beside Download PDF. A tariff
  explorer compares modelled 25-year cumulative savings and payback.
- **Closing page:** a high-resolution gallery QR sits over the existing photograph,
  clear of the heading. It is also a clickable link in either PDF format.
- **Public gallery:** `gallery.html` shows the existing nine references plus the 500 kWp ground-mounted tracking
  project, category filters and keyboard-accessible enlarged photographs.
  It does not read proposal storage or expose customer details. Hosting access
  protection still applies; publish it on an unauthenticated public host before
  using it as a customer QR destination.

The approved first-page cover and small-house system diagram are preserved. No
second power-flow diagram is added to the full report; the short report reuses the
same live illustration.

## QR destination and actual videos

Under **All settings → Customer experience — QR & audio**, select the destination
type and enter its public URL. These controls determine what the QR opens.
It persists with the proposal, its file export/import and Customer View.

- Blank: keep the QR hidden. Deployment origins are never assumed to be public.
- Supplied public HTTPS URL: open that exact gallery or video playlist directly.
- Invalid / local / credentialled URL, or a browser-local `share.html` link: hide
  the QR, clear the previous destination and show a builder explanation.

QR generation has a quiet zone, error correction and a 320px source canvas. A
revision guard prevents an older asynchronous draw from publishing a stale URL.
Tests decode both the actual canvas and the JPEG-compressed PDF capture.

**Use a permanent public URL before issuing proposals.** The current Vercel preview
was externally checked and redirects to Vercel login. Deployment protection has
not been changed. Preview / sandbox URLs may also expire. Test the destination on another phone without
being signed in; syntax validation cannot prove public reachability.

No real video URLs were supplied, so the bundled gallery currently shows photos,
not an invented 4K walkthrough or customer-specific simulation. To publish approved
videos, add their title, public HTTPS URL and optional local poster to
`assets/js/gallery-media.js` and deploy. Alternatively, set the proposal gallery URL
to an existing public video gallery / playlist. No automatic uploads, external video
embeds, autoplay, customer tracking or generated video claims are introduced.

The gallery is the **published company portfolio**. Private per-proposal photo/text
edits do not publish themselves to it. That separation is intentional.

## Financial isolation and synchronization

The explorer calls `Finance.compute` with a copy of the saved state and only changes
its tariff. It never writes form values, proposal storage or the export state. Its
initial value is the actual quotation tariff; the nominal ₹10–₹18 range expands to
include tariffs outside that range. Reset returns to that exact baseline.

Both the chart and figures are labelled estimates. The dashed line is the quotation;
the amber line is the scenario. There is no guaranteed return, subsidy approval or
zero-bill promise. The tool stays outside the A4 pages and is hidden from print/PDF.

## Two-page document

Page 1: customer, visual system overview, illustrative installation image, capacity,
module/inverter values, estimated investment/generation/savings/payback and financial
assumptions. Page 2: equipment, GST/subsidy/net investment, payment milestones, scope
highlights, additional scope, warranty highlights, validity/delivery, supplied report
links, contact and gallery QR. All figures use the same finance engine; selected
scope/warranty copy comes from the live content.

The brief is explicitly a summary, not an installation order. Full conditions,
financing and alternative-system illustrations remain in the detailed report.
Payment percentages not totalling 100% trigger a visible warning. Unusually long
content that cannot fit two pages fails with a helpful message rather than exporting
clipped text. Use the detailed report for these proposals.

## Export safeguards

Before capture, export freezes the selected pages and state. Chart/QR canvas pixels
are copied, and document-wide live chrome bindings are detached from the snapshot.
Later edits cannot mix metadata and amounts across pages. Concurrent exports are
blocked; temporary pages and the lock are cleaned up after success or failure.
Images/fonts are awaited; already-failed images (complete but without natural dimensions) abort export rather than leaving blank artwork. Payback is labelled as an estimate based on the cumulative-savings model, not a simple first-year savings ratio. Screen elevation shadows are removed from printed surfaces
(the canvas renderer otherwise paints grey artefacts). Public/report links remain
clickable in the resulting PDF.

## Verification

`qa/experience.test.js` exercises real QR decoding, JPEG resilience, A4 geometry,
state isolation, source-value synchronization, persistence, actual two-page PDF
creation, link annotations, immutable full-report snapshots, concurrency/error
cleanup, overlong-copy guards, commercial assumptions, optional-page counts,
Customer View format selection, mobile layout and an empty-storage gallery visit.

`npm --prefix qa test` still runs all 332 existing unit/DOM/finance checks. The jsdom
integration fixture explicitly mocks image completion because it has no image
loader; real loading/capture is exercised in the browser suites. Run the complete
browser suite with `QA_BASE` pointing at a static server; Lambda Chromium bundles
may also need `LD_LIBRARY_PATH`.

Browser-local proposal sharing remains unchanged. The public gallery is portable;
an ID-only customer proposal URL is **not** a hosted cross-device customer portal.
Ambient drone video and animated monetary counters are not included. Optional
multilingual device-voice narration is described below.

Verified for this implementation: **332 unit/DOM/finance checks**, **48 new
experience checks**, all existing cover/branding/discovery/audit/technical/diagram
browser suites, and actual **2-, 16- and 17-page PDFs**. The full-report browser test
now checks the downloaded files' actual page counts, not only a status string or an
older file's presence. The original cover and editable background hashes are
unchanged. Preview deployment remains separate from production approval.


## Optional English / Hindi / Marathi briefing

A collapsed **Listen to your proposal** player is available above the first page
in both the builder and Customer View. Play, pause/resume and stop are explicit;
there is no autoplay. The Advanced/All-settings checkbox controls visibility and
is persisted with the proposal. Player, transcript and controls are screen-only.

Scripts are deterministic translations populated from the same `Finance.compute`
results as the quotation, not a generative model inventing claims. They cover
capacity, modules, first-year generation, gross/net investment, potential subsidy,
25-year savings, payback and qualifications. Customer name/address are excluded.
Changing the language, updating the proposal, disabling/closing the player or
leaving the page stops playback and invalidates stale speech callbacks. The
exploratory tariff does not change narration. An unavailable voice or a playback
error leaves a readable transcript and clear feedback.

**Voice limitation:** this version uses the Web Speech API and available device /
browser voices. It is not a hosted AI-voice service or a prerecorded audio file.
Hindi and Marathi require matching voices exposed by the browser; the app never
automatically substitutes an English voice. Missing voices now reveal the written
briefing, a manual **Check voices again** action and an explicit English-language
switch when an English voice is available. Installing a language pack alone does
not guarantee a usable speech voice. Some device voices use an online provider, disclosed before playback.
Voice quality and actual language availability must be checked on the target device.
Self-hosted Poppins Devanagari fonts (OFL license in `assets/fonts/Poppins-OFL.txt`)
keep the transcripts readable without a font CDN.

QR destination choices are Project gallery, Video or playlist, and Company website.
The type changes card/PDF copy but never invents or rewrites the URL. An empty URL
keeps all customer QR cards hidden. Earlier proposals with no type retain the
project-gallery default. The existing separately configured cover-proposal QR is
unchanged.

`qa/briefing.test.js` adds **35 browser checks** covering configuration, persistence,
matching-language routing, financial script sync, stale-callback cancellation,
pause/resume/stop, missing voices, errors, empty/unsafe text, scenario isolation,
mobile layout and print exclusion. Speech routing tests use a mock engine; they do
not claim to validate the sound or availability of an actual OS voice. No deployment
or production merge is required for these changes.


## Agarwal project distinction

The 1,700 kWp industrial rooftop reference is retained unchanged. The new
reference is **Agarwal Technoplast Pvt. Ltd. — 500 kWp — Ground-Mounted Solar
Tracking**, located in **Pune, Maharashtra** as confirmed by the owner. No axis type, commissioning date,
generation or performance gain is inferred. The supplied `Tracking.png` is kept
byte-for-byte (Git blob `213b1702f20304fd8b43b3ca54af4e730a29a7af`).

The detailed proposal uses ten regular project cards, all with 132px-high thumbnail
frames. The industrial row has four columns; the other two rows keep their three
original references. The gallery uses the same standard card treatment for all ten
entries. Both Agarwal projects appear in the Industrial filter, without a special
tracking filter or banner. The tracking thumbnail preserves the complete supplied
image; the enlarged-image viewer is still available. Its hover zoom uses the same
1.03 scale and 0.25-second transition as the other gallery photographs.

For compatibility with previously saved proposals, the tracking data retains its
internal `featured` key. `portfolioCategories()` folds it into the industrial group
for rendering, gallery and Advanced Edit without changing stored custom values.

Legacy proposal content receives the new reference without overwriting custom
rooftop values. The original blank tracking location is upgraded to Pune, Maharashtra;
custom names and non-empty locations are preserved. Advanced Edit is rebound when switching proposals, and an old
proposal missing the tracking-photo key cannot inherit another proposal's private
upload. Private overrides remain local to that proposal, not the public gallery.
`qa/tracking-project.test.js` covers exact image identity, distinct capacities,
migration, live edits, proposal isolation, A4/PDF capture and desktop/mobile gallery.
No financial calculation, cover artwork, audio behaviour or deployment is changed.
