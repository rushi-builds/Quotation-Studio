# HANDOFF - Quotation Studio (KTM Energy Experts)

Written so any engineer or AI assistant (another Claude account, Arena, Lovable, Cursor...) can pick the work up
exactly where it stopped. State as of `main` = `be429df` (PR #62 merged). Owner: **rushi-builds**. Language the owner
uses: Hinglish; keep replies short and practical. **Never put tokens/passwords in this repo or in chats.**

## 1. What this is
Solar EPC proposal builder. Form on the left, live A4 preview on the right, 15 pages, exported as PDF.
- Frontend: static HTML/CSS/JS (no build step), hosted on **Vercel**. `vercel.json` rewrites `/api/*` to the
  Cloudflare Worker `qs-studio-rushi.ktmenergyexperts.workers.dev`.
- Backend: Cloudflare Worker `platform/cloudflare/src/worker.js` (+ D1 database). Auth helper: `requireUser(request, db, env)`.
- Owner is on the **Cloudflare FREE plan**.
- Pages 5 & 6 (Solution / Technical Specification) are rendered by `assets/js/proposal-v2.js` + `assets/css/proposal-v2.css`.
  Brand logos: `assets/images/equipment/brands/`. Page-6 photos: `assets/images/equipment/cards/`.

## 2. What is already merged (do not redo)
- #56 page-6 / CTA fixes; #57-#60 page 5/6 redesign rounds; **#61** page 5/6 polish (consistent hero, boxed system overview,
  aligned photo tiles, calmer note, composite photo for card 03 `mount-cabling-protection.webp`);
  **#62** PDF text printed in serif because the SVG-based native capture has no `<body>`: the body typography is now
  copied onto the frame (`svgDocument()` in `assets/js/export.js`).

## 3. Rules of this repo (CI will block you otherwise)
- `qa/pr-scope-guard.cjs` limits which files a PR may touch. Run
  `node -e "const g=require('./qa/pr-scope-guard.cjs');console.log(g.scopeOffenders(['<file>',...]))"` before pushing. Frozen files
  are pinned by blob hash; `assets/js/export.js` is covered by `FROZEN_EDIT_ALLOWANCE` (edits allowed). Changes to deploy
  config (`wrangler*.toml`, `vercel.json`) are flagged and need the owner's explicit approval.
- Tests: `qa/` (jsdom + Chromium via puppeteer). `qa/package.json` ERESOLVEs on `npm install`; install deps in a separate
  folder (`jsdom@24 jsqr playwright@1.64.1 puppeteer-core@23 @sparticuz/chromium@153`), symlink it as `qa/node_modules`
  (delete the symlink before committing), set `NODE_PATH`, `CHROMIUM_PATH`, `QA_BASE=http://localhost:<port>`.
- **Already red on main, not your fault:** browser tests `tech-spec`, `system-diagram`, `page-spacing` (stale after the redesign),
  and the Cloudflare check `Workers Builds: qs-studio-rushi` (check why - the Worker may not be deploying at all).
- Always compare a failing test against untouched `main` before blaming your change.
- Page 5/6 tests: `node qa/page56-marks.test.cjs` (52 pass). They pin design intent; rewrite assertions to the new intent, never delete.

## 4. Open work, in order

### A. Custom module / custom inverter upload (owner request)
The input panel already has "Custom..." for module make and inverter make. When "Custom" is chosen show an upload area
(drag & drop + click + paste):
- **Custom module:** logo only.  **Custom inverter:** logo + inverter photo.
- The app does the cropping, the user never has to pre-crop:
  - Logo: auto-trim empty margins (transparent or near-white), fit inside the card's logo box (height 30px, max-width 132px),
    keep transparency (PNG/WebP/SVG), downscale to <= 400px wide.
  - Inverter photo: show a crop frame locked to the tile aspect ratio of page-6 cards (the tile stretches to the height of its
    rows, roughly 1.3-1.9:1), default smart "cover" crop, drag to reposition, slider to zoom, "fit without cropping" toggle.
    Downscale to <= 1200px, encode WebP/JPEG q~0.9.
  - Limits: <= 5 MB in, <= ~400 KB stored per image, friendly errors for unsupported files.
- Store as data URLs in the proposal state (new keys, e.g. `customModuleLogo`, `customInverterLogo`, `customInverterPhoto`) so they
  survive save/load/share and are inlined into the PDF automatically. Check the autosave/localStorage size budget.
- Render on page 6 where the brand logo / `photoFor('inverter', brand)` is chosen in `proposal-v2.js` (fall back to the
  current text brand + generic photo when nothing is uploaded). Keep brand-based images unchanged.
- Tests: add jsdom/Chromium checks (upload -> card shows the image; clearing falls back; oversized file rejected).

### B. One-click vector PDF with NO print dialog (owner request, Cloudflare Free plan)
Why: current export = one JPEG per page (~12.5 MB, 288 ppi, 8-30 s, text not selectable). The owner wants the existing
"Generate & Download PDF" button to download directly, sharp (vector text/icons), same layout, **no new button, no print dialog**.
Design:
1. Browser builds the same self-contained page HTML the print engine would use (inline CSS, fonts as data URIs, user images as
   data URIs, site assets as absolute URLs) and POSTs `{html}` to the Worker route `POST /api/pdf`.
2. Worker: `requireUser`, per-user rate limit, body size cap, then calls Cloudflare Browser Run `/pdf` (quick action) with
   `{html, pdfOptions:{preferCSSPageSize:true, printBackground:true}, allowRequestPattern/rejectRequestPattern}` so Chrome
   only loads this site's assets (the endpoint renders arbitrary HTML: lock it down). Stream the PDF back (the Free plan CPU
   limit is ~10 ms, so never buffer/parse big bodies in the Worker). Either the Workers binding `BROWSER` (needs a few lines in
   `platform/cloudflare/wrangler.toml`: owner approval) or the REST API with `CF_ACCOUNT_ID` + an API token (Browser Rendering - Edit) as secrets.
3. Browser saves the returned PDF. **On any failure (429 daily limit, timeout, offline, not logged in) fall back silently to the
   existing image export** and show one line of status. The old path must stay intact and remain the default for tests.
- Free plan limits (Cloudflare docs, Nov 2026): 10 browser-minutes/day (about 40-60 PDFs at 10-15 s), 3 concurrent browsers.
  Request body limit of `/pdf` is 50 MB. Paid plan ($5/mo) includes 10 browser hours/month.
- Learnings from the prototype (print engine run in Chromium via `page.pdf()`):
  - Real vector PDF: 15 pages A4, ~24k selectable chars, embedded Inter/Poppins, 2-7 s, 6.3 MB; layout matched the preview on page 1 and 6.
  - Raw images blow the size up (lossless PNG posters): re-encode large opaque artwork to JPEG q0.92 at 300 ppi of its printed size,
    keep transparent logos as PNG, lock each `<img>` to its measured box so layout cannot move. Cover artwork is only 1588x2223 px.
  - Wait for images to decode + 2 animation frames before rendering; with `window.print()` also release the busy lock after the call
    returns (headless/stubbed print never fires `afterprint`).
  - Print CSS (in `assets/css/experience.css`): only the detached snapshot prints, exact colours, one A4 per `.page`, `height:1122px`.
  - Verify with a 15-page pixel diff against the current export, plus the Power Proposal and BESS/system reports.
- Prototype branch/patch files are not in the repo; re-create from this description.

### C. Small known items
- Power Proposal diagram: narrow nodes break words ("MSEDC/L", "Bi-/Direction/al Meter"). Pre-existing since #60.
- Module photo on page 6 is one generic image for all module brands (logo and inverter photo do follow the brand).
- Stale browser tests listed above; ~58 old `arena/*` branches can be deleted.
- Cover artwork resolution cannot be raised by code; needs a higher-resolution image.

## 5. Gotchas that cost hours
- A static server started in the sandbox dies between tool calls: start it again inside the same command.
- Playwright `page.evaluate("window.x=...; window.print=()=>{...}")` as a *string* that evaluates to a function is CALLED; use `()=>{...}`.
- In `/bin/sh` (dash) `echo "$JSON"` rewrites `\n` escapes; read API responses from a file.
- Fine-grained GitHub tokens need Resource owner = the user, repository selected, and *Repository* permissions
  Contents + Pull requests = Read and write. A classic token with `repo` scope is simpler. Revoke tokens after use.
- app.css has id rules (e.g. `#pageSolution .photo-top{height:260px}`) that beat class selectors; use an id selector to override.
- `fit()` in `proposal-v2.js` tightens pages through `pv2-fit-N` classes; the footer needs >= ~15 px clearance on page 6.

## 6. Decisions already made by the owner
No new buttons or UI for the PDF; the existing download button does everything. Free Cloudflare plan. Never break the existing export
(always keep the fallback). Do not merge or deploy without telling the owner; open a PR and let them merge. Page 5 hero stays the
same rounded photo as the other pages.

## 7. Prompt to continue in another assistant
"Read docs/HANDOFF.md in rushi-builds/Quotation-Studio (main). Continue with section 4 item <A or B>. Branch from main, keep changes
inside the scope guard, run the relevant qa tests against untouched main first, open a PR (do not merge), and write what you did
and what is left at the bottom of docs/HANDOFF.md under 'Progress log'."

## 8. Progress log (append here, newest last)
- 2026-11-18 - Handoff created. Vector PDF branch `feat/vector-pdf-beta` was created locally from `be429df` but no code was committed. Nothing for A or B is in the repo yet.

---

# ROUND 2 — Arena session (branch `arena/951bce1b-quotation-studio`)

Started from `main` = `68ae7db`. Working on **section 4-A (custom module/inverter upload)** first,
**section 4-B (vector PDF)** second. This section exists so work can continue on a different
assistant/account when credits run out. **Read this before touching anything.**

## Owner's exact words for 4-A (2026-11-19)

> "custom select karne pr input side ek aur option dikhega upload image wahaa upload hoga drag and
> drop hoga ... modules me hame bs logo chahiye and inverter me logo and inverter image ...
> system khud crop wagera kArega ya hm khud input me sidha croped exact dimensions ka drop karenge"
>
> "but inverter ki yaha likha hoga ye do drops ka option bcz waha do alg si images dalnihogi ek logo
> ki and ek inverter ki he na ya ek hi kaisa bhi konsa bhi ?"
>
> "drop wagera and image fit crop wagera and input side bhi accha bana ha bhaii please"

**Decision taken (both images, two separate drop zones):** an inverter card needs two different
things - a transparent logo and a photographic product shot. They have opposite requirements
(transparency vs crop-to-fill), so they are two separate drop zones, not one. Each zone does exactly
one job and can be left empty independently. A module card needs only the logo, so it shows only the
logo zone.

**Cropping: the app does it, the user never pre-crops.** But each zone offers both behaviours:
- Logo zone: "Fit (no crop)" is the default - auto-trim empty margins, scale to fit, keep transparency.
  Nothing is ever cut from a logo.
- Photo zone: "Cover (fill the tile)" is the default with a drag-to-position + zoom slider, plus a
  "Fit (no crop)" toggle that letterboxes instead.

## Current state of the code (verified, do not re-derive)

- `quotation.html` already has a working "Custom…" option (`value="" data-custom`) for
  `moduleMake`, `moduleModel`, `moduleTech`, `inverterMake`. Each is followed by a
  `<div id="<id>CustomWrap" class="equipment-custom" data-equipment-custom hidden>` block holding
  a text input `<id>Custom`.
- `assets/js/equipment.js:204-211` - `isCustom(sel)` and `syncCustom(sel)` toggle `wrap.hidden` /
  `input.disabled` from the selected option's `data-custom` attribute. **Hook new UI in here.**
- `assets/js/state.js:186-187` - `collectForm()` **skips** any element with `data-equipment-custom`.
  Image uploads must therefore be stored on the proposal blob, NOT scraped from the form.
- `assets/js/app.js:581-599` - the existing photo-upload precedent: `input[data-photo]` reads a File
  with `FileReader` into a data URL, writes `window.__qsPageImages[id]`, then `Render.renderAll()` +
  `scheduleSave()`. Deliberately refuses the write when the active proposal changed mid-read
  (`uploadToken()`). Copy this pattern.
- `assets/js/app.js:283,379` - `Proposals.saveActive(form, CONTENT, PROJECT_IMAGES,
  window.__qsOptions, window.__qsPageImages)` - the 5th argument is the page-image map, already
  persisted. **Add custom equipment images to that same map** (`customModuleLogo`,
  `customInverterLogo`, `customInverterPhoto`) so save/load/share/PDF all keep working with no new
  plumbing.
- `assets/js/proposal-v2.js:286` - `BRAND_LOGOS` maps a slug to `assets/images/brands/<name>.webp`.
- `assets/js/proposal-v2.js:365-370` - `brandMark(kind, brand)` returns the logo `<img>` or a plain
  text badge when the make has no logo. **This is where a custom module/inverter logo is injected.**
- `assets/js/proposal-v2.js:324-330` - `photoFor(kind, brand)` picks the card photo; the inverter
  brand map `INVERTER_PHOTO` is at `:306`. **This is where a custom inverter photo is injected.**
- `assets/js/proposal-v2.js:410` - the card renderer reads `brand = val(/^(make|brand)$/i)` and then
  calls `photoFor` / `brandMark`. A custom make arrives here as the typed text.

## Scope guard - the files this round may touch

Run before every push:
```
node -e "const g=require('./qa/pr-scope-guard.cjs');console.log(g.scopeOffenders(['<files you touched>']))"
```
Already allowed by `ALLOWED_SCOPE_RE`: `quotation.html`, `assets/css/app.css`, `assets/css/experience.css`,
`assets/js/{app,equipment,state,render,experience,export,proposal-values}.js`, `qa/*`, `docs/*.md`.
Already allowed by `PAGE56_PATHS`: `assets/css/proposal-v2.css`, `assets/js/proposal-v2.js`.
**Not allowed by name:** `assets/css/control-panel.css`. A stylesheet for the new upload UI must go
into `app.css` or `experience.css`, or a new exact path must be added to the guard **with a
regression test** (the repo rule: no silent widening of the guard).

## 4-A design - what to build

1. Two drop zones under the existing Custom inputs, `equipment-custom` styling so they inherit the
   amber left rule:
   - `#moduleMakeCustomWrap` gains a **logo** zone only.
   - `#inverterMakeCustomWrap` gains a **logo** zone and a **photo** zone.
2. Each zone: click to browse, drag & drop, and paste (Ctrl+V) - all three. Accept
   `image/png,image/webp,image/jpeg,image/svg+xml`. Reject > 5 MB with a one-line friendly message.
3. Processing, all in the browser, before storing:
   - Logo: draw to canvas, auto-trim near-transparent / near-white margins, fit inside **30 px tall x
     132 px wide** box (the sizes the page-6 badge already uses - verify), keep alpha, export WebP
     (PNG fallback) <= 400 px on the long edge, target <= ~60 KB.
   - Photo: show a crop frame locked to the tile aspect ratio, drag + zoom slider, "Fit (no crop)"
     toggle, export WebP/JPEG q~0.9 <= 1200 px, target <= ~400 KB.
4. Store the resulting data URL in the page-image map (see above). Show a thumbnail + a small
   "Remove" so the owner can undo. Empty zone = current behaviour, unchanged.
5. Render: `brandMark()` prefers the custom logo, else the existing brand sheet; `photoFor()` prefers
   the custom photo, else the existing inverter shot; otherwise the current generic photo.
6. Tests in `qa/` (jsdom is enough for the state/render half; Chromium for canvas):
   upload -> card shows the image; remove -> falls back to the brand image; oversized file rejected;
   a proposal without custom images renders byte-identically to today.

## 4-B design - vector PDF (read section 4-B above first)

The earlier note "vector PDF is impossible" is **wrong at the product level and right at the
library level**. `jsPDF.addImage()` cannot take the `<foreignObject>` SVG that `export.js` builds,
and there is no `svg2pdf` in `assets/vendor/`. Real vector needs a **print engine**, which is what
the owner's Cloudflare Browser Run plan in section 4-B already describes: build the same HTML,
`POST /api/pdf`, render with Chrome's `page.pdf()`, stream back. Prototype measured 15 pages A4,
~24k selectable chars, 2-7 s, 6.3 MB. **Do that, not a client-side hack.** Always keep the current
image export as the silent fallback.

Free-plan caveat: 10 browser-minutes/day ~ 40-60 PDFs, 3 concurrent. Say this to the owner before
building, and get an explicit yes (it needs `wrangler.toml` + secrets = deploy-config change, which
the scope guard flags and which needs owner approval).

## Progress log - round 2

- 2026-11-19 - Branch created from `68ae7db`. `docs/HANDOFF.md` brought onto this branch. Design for
  4-A settled (two drop zones, app-side crop, page-image map for storage) and written above.

- 2026-11-19 - **4-A BUILT (logo and photo zones).** What landed:
  - `assets/js/custom-art.js` (NEW) - `root.CustomArt = { wire, sync, state, logoFrom, photoFrom,
    openCrop, paintCrop, crops, say }`. Decodes a dropped/pasted/picked file, trims a logo's empty
    margin (`isMargin`: alpha < 12, or a >= 250 and all channels >= 246) and fits it inside
    30x132 px at 4x (so 120x528 working px), exports WebP q0.9 inside a 60 KB budget; for a photo it
    opens a crop session (aspect 1.45, drag + zoom + "fit without cropping"), exports <= 1200 px
    JPEG/WebP inside 400 KB. Refuses > 5 MB and non-images with one plain sentence.
  - `quotation.html` - three zones: `#customArtModuleLogo` inside `#moduleMakeCustomWrap`, and
    `#customArtInverterLogo` + `#customArtInverterPhoto` inside `#inverterMakeCustomWrap`. One shared
    crop panel (`#customArtCrop`) and one status line (`#customArtStatus`) before `</form>`.
    `assets/js/custom-art.js` is loaded just before `app.js`.
  - `assets/css/app.css` - the upload UI (dashed zone, drag state, sticker plate behind a white logo,
    tile-shaped ghost for a photo zone, crop panel, status line).
  - `assets/js/equipment.js` - `syncCustom()` calls `root.CustomArt.wire()` when the make becomes
    custom. It lives there because that function already owns the show/hide of the wrapper.
  - `assets/js/app.js` - `CustomArt.wire()` at boot; and **a real bug fixed**: `loadActiveIntoUI()`
    only restored page images that have a template entry, so uploaded artwork came back blank after
    reopening a proposal. `customModuleLogo` / `customInverterLogo` / `customInverterPhoto` are now
    restored too, data-URLs only.
  - `assets/js/proposal-v2.js` - `brandMark()` prefers a supplied logo for a make the sheet lacks;
    `photoFor()` prefers a supplied inverter photo **only when the brand sheet has no shot for that
    make** (so choosing Sungrow still shows the Sungrow render); `focusFor()`/`isSupplied()` stop the
    tile cropping a photo the owner already cropped.
  - `assets/css/proposal-v2.css` - `.pv2-photo.is-custom img{object-fit:contain}` and the custom
    badge sizing.
  - `qa/custom-art.test.cjs` (NEW, 29 checks) and `qa/pr-scope-guard.cjs` gained `custom-art` as an
    exact filename inside the existing `assets/js/(...)` list - **no wildcard**, and a random new
    `assets/js/*.js` still fails the guard (negative-tested).
  - `qa/HANDOFF` note: **Chromium canvas work is NOT verified locally** - the sandbox cannot download
    a browser (`npx playwright install chromium` fails). The crop/trim maths is unit-reachable through
    `logoFrom`/`photoFrom`/`paintCrop` but has not been exercised in a real browser. **First thing to
    do next: open the page, choose Custom for module and inverter, drop a real PNG and a real JPphoto,
    and confirm the badge and the tile look right.** That is the one gap in this round.
  - Suites at the time of writing: `page56-marks` 52/52, `custom-art` 29/29, `pr-scope` 52/52,
    offline `npm test` 5/5, assistant 24/24, scope guard `offenders: []`.

- 2026-11-19 - **4-B not started.** Blocked on an owner decision, not on code: the Cloudflare plan
  question in section 4-B (free = 10 browser-minutes/day, about 40-60 PDFs; needs `wrangler.toml` +
  secrets, which the scope guard flags as a deploy-config change and which the owner must approve
  explicitly). Ask before building.


- 2026-11-10 - **Power Proposal: page 3 now carries page 6's cards; report is 7 pages.**

  The owner's requirement was exact parity: the technical page of the Power Proposal must look the
  same as page 6 of the Detailed Proposal, including a custom make's uploaded logo and photo, with
  **no duplication and no filler pages**. Three approaches were tried and two were thrown away.

  1. *Re-drawn cards inside the report.* `cardMarkup`/`cardsFromTable` were exported from
     `proposal-v2.js` and the report built its own copy from the same rows. Same data, but the
     report's column is ~700px against the sheet's ~800, so the cards only fitted at 8px type and
     page 3 still ran **368px** past the footer. "Same as the full proposal" was false. **Abandoned.**
  2. *Clone the whole sheet.* Correct sizes, but it carried the sheet's own company head, title,
     orange rule and intro paragraph, so page 3 printed two heads and two titles above four cards -
     exactly the duplication the owner ruled out. **Abandoned.**
  3. *Clone the card block only* - current. `powerSpecCards()` in `experience.js` asks
     `ProposalV2.sync()` to paint the sheet, then takes `#pageTechSpec .pv2-spec`, strips its ids and
     wraps it in `<div class="pv2 pv2-tech power-spec-sheet">`. That wrapper repeats the sheet's own
     class chain, so **every page-6 card rule applies unchanged** and there is no second set of card
     styles. Change the cards in `proposal-v2.css` and both pages follow; that is the property that
     makes "exactly the same" survive future work.

  **Fit.** The block draws at 794px (the sheet's width) and is then scaled by a single factor,
  `min(1, availW/W, availH/H)`, measured in `buildPowerPages` *after* the host is in the document -
  one factor for width and height, so a badge, a row and a photo tile keep page-6 proportions. Capped
  at 1 so a wide window does not enlarge it. **Two gotchas, both hit:** a `transform` paints smaller
  but lays out at full size, so the wrapper is given the *scaled* width/height and `overflow:hidden` -
  without that the page looks right and the export refuses it on horizontal overflow; and the
  measurement must happen post-insert, because before that there is no layout to measure and the
  scale is silently NaN. Applied scale is recorded on the block as `data-power-scale`.

  **Seven pages, nothing duplicated.** `POWER_PAGE_COUNT = 6 → 7`, and the heading-emphasis array
  grew to seven entries. Page 3 = the sheet's cards (kicker `03 / TECHNICAL SPECIFICATION`). Page 4 =
  the design content that used to share page 3 (connection diagram, caption, three site metrics,
  engineering note) - moved, not copied. Generation/savings, investment/payment and delivery/support
  shift to 05/06/07. `power-lead` is no longer printed when empty, so page 3 has no blank paragraph.

  **Everything renumbered that needed it**, including the tests that name a page id:
  `powerPage4→5`, `powerPage5→6`, `powerPage6→7` in `experience.test.js`, `power-five.test.cjs`,
  `bess-browser.test.js`; page counts 6→7 in `proposal-review`, `review-format-state`, `export-audit`
  (`(6 Pages)` / `6-page` label), `footer-website` (walks `.power-foot`), `supplements-browser`,
  `system-packages-browser`. The cross-reference "identified separately on page 6" became page 7.

  **Checks added** (`qa/custom-art.test.cjs`, 41 → **51**): card drawing defined once and the report
  clones rather than redraws; the wrapper keeps the sheet class chain and adds **no** card styles;
  the block renders at sheet width; one scale factor and the layout box matches the paint; no ids
  duplicated; the sheet's own head/title/paragraph does **not** travel; seven pages from one constant;
  no technical content left behind on the design page; no empty lead. Negative-tested three ways -
  a second copy of the card markup, the card class on the design page, and dropping the height term
  from the `min()` each fail the right check.

  Suites: `custom-art` **51/51**, `page56-marks` **52/52**, `pr-scope` **52/52**, `sync` **106/106**,
  scope guard `offenders: []`.

  **CI browser suite is at 18/25; `main` is at 19/25 and the difference is not this work.** The six
  files that fail on `main` still fail. `experience.test.js` fails one check
  (`full: already-failed images abort export and clean up the snapshot`) and `page-spacing`,
  `tech-spec`, `array-size`, `system-diagram`, `equipment-entry`, `browser` are the pre-existing red.
  `bess-browser` and `supplements-browser` - which were failing on page 3 overflow through this
  change - now pass.

  **Not verified locally:** the sandbox has no working Chromium (`libnspr4.so` missing, no root to
  install it), so nobody has *looked* at page 3. The scale maths, the clone and the class chain are
  all reachable by reading and by the offline suite, but the honest status is: **open the preview,
  download a Power Proposal, and confirm page 3 shows four cards with the uploaded logo and photo at
  a legible size.** That is the one gap in this round.

- 2026-11-10 (later) - **Page 3 printed half a card. Three causes, none of them layout.**

  The owner sent a screenshot of page 3: card 04 visible, its last two rows sliced off, and large
  white space below. Everything up to this point had been treating it as a geometry problem - a
  height bound, then a uniform transform - and both made it worse.

  The bed had two real faults underneath, and they only became visible once a browser could
  actually be run in this sandbox:

  **Running Chromium locally (this used to be impossible).** `@sparticuz/chromium` bundles
  `bin/al2023.tar.br`, which contains the shared libraries the binary needs (`libnspr4.so`,
  `libnss3.so`, 9 objects in total). Extract it and point `LD_LIBRARY_PATH` at it:

  ```bash
  node -e "const fs=require('fs'),z=require('zlib');fs.createReadStream('qa/node_modules/@sparticuz/chromium/bin/al2023.tar.br').pipe(z.createBrotliDecompress()).pipe(fs.createWriteStream('/tmp/al2023.tar'))"
  mkdir -p /tmp/al2023 && tar -xf /tmp/al2023.tar -C /tmp/al2023
  # then launch puppeteer with env LD_LIBRARY_PATH=/tmp/al2023/lib
  ```

  That is how the numbers below were obtained. Do this before trusting any claim about
  page geometry - the offline suite reads source, it does not lay anything out.

  **Cause 1 - the block was in the wrong width.** Page 6 is 794px with a 38px gutter, so its cards
  live in 718px. The report's `.power-body` is *already* 718px, because the page's own padding is
  outside it. The block needed `width:100%` and nothing else. An intermediate attempt added the
  gutter a second time → cards at **642px**, every value wrapped onto an extra line, every card
  ~40px taller.

  **Cause 2 - the fit classes did not travel.** Page 6 does not print at its base type. Its fit
  ladder adds `pv2-fit-2`, and that class is what makes the rows **9.4px with 2px padding**. The
  markup was copied without it, so the same rows were laid out at the base **10.2px / 3px**, and
  each card grew ~17px. `powerSpecBlock()` now reads `pv2-fit-\d` off `#pageTechSpec` and puts it
  on the wrapper, so a denser system picks up the same step the sheet picked.

  **Cause 3 - the font was different, and this one is the sneaky one.**
  `proposal-v2.css` sets **no** `font-family` on the cards, so page 6 inherits **Inter from `body`**.
  `experience.css` sets `.power-page{font-family:Arial,sans-serif}`, and that inherited straight into
  the block. Inter and Arial do not wrap these values the same way: cards 02 and 04 came out **19px
  and 20px taller** on page 3. Fixed by putting Inter back on `.power-spec-sheet` only - scoped, so
  pages 1, 2 and 4-7 keep the report's type.

  **What was removed.** The height bound and the `transform: scale()`. Both were hiding the symptom.
  Page 3 now only *measures*: it records `data-spec-avail`, `data-spec-block` and `data-spec-fits`
  on `#powerPage3`, so an overrun is visible instead of clipped, and `export.js` refuses the
  download rather than shipping a cut-off card.

  **Result, measured in Chromium:**
  ```
  page 6   718x205  718x205  718x184  718x166   @9.4px
  page 3   718x205  718x205  718x184  718x166   @9.4px
  page 3   avail 718x918 · block 718x813 · fits=1 · gap above footer 106px
  ```

  **Checks.** Three added to `qa/experience.test.js` (browser), comparing page 3 to page 6 element by
  element - width, height, font size, row padding - plus no clip, no transform, `fits=1`. This is
  the class of check that was missing: every earlier failure here passed the offline suite because
  the markup was right and only the laid-out result was wrong.

  Suites: `custom-art` 48/48, `experience` **53/53**, `page56` 52/52, `pr-scope` 52/52, `sync` 106/106.

  **Lesson for the next assistant:** when the owner says "it looks wrong", believe the screenshot and
  get a browser running before touching CSS. Three of the four attempts at this page were fixes to a
  problem that had not been measured.

---

### 2026-11-10 - Page 3 is now page 6, whole page, not just the cards

  The owner's words were "as exact same as proposal understood" - the cards alone were never going to
  satisfy him. Page 3 now carries the **entire** `#pageTechSpec` section: the report header, the
  "Technical System Specification" title, the subtitle, the DETAILED SPECIFICATION block, the four
  spec cards, the note box under them, and the report footer. Nothing is drawn on top of it.

  **The bug that stood in the way, and the rule it leaves behind.** The first attempt cloned the
  section and stripped the ids so the copy would not duplicate `#pageTechSpec`. That silently
  un-styled the whole thing, because the sheet was styled *by* those ids
  (`#v_tsTable{display:none}`, `#pageTechSpec .pg-body`). Result: the raw spec table reappeared
  below the cards and the note fell back to app.css defaults.

  So: **every sheet selector is now class-based** - `.pv2-sheet` instead of `#pageTechSpec`,
  `.v_tsTable` / `.v_tsHeading` / `.v_tsPara` / `.v_tsGroupsLabel` / `.v_tsRefsWrap` instead of
  `#v_ts*` (86 + 8 and 12 + 18 rules across `app.css` and `proposal-v2.css`). `quotation.html`
  mirrors all 14 `v_ts*` ids as same-named classes, so nothing that targets an id breaks. The clone
  then keeps its structure and simply **prefixes every id with `pw3-`** instead of deleting them.

  **Never strip ids from that clone again. Prefix them.** A copied section needs no particular id
  once the styling is class-based.

  **Export guard.** A carried page has no report footer, so the "too much text" preflight was
  measuring page 3's `pg-foot` against a missing `.power-foot` and refusing to export. The
  footer-clearance test now only runs against `:scope > footer.power-foot`, and a carried sheet is
  instead checked for sheet edge and horizontal overflow. Export produces the full 7-page Power
  Proposal again.

  **Measured, in Chromium, after the change** (`/tmp/whole.cjs`):
  ```
  head 1 · kicker 0 · h1 1 · cardCount 4 · noteBox 1 · foot 1
  cards  718x205  718x205  718x184  718x166     (identical to page 6)
  bodyH 1123 = exactly one A4                   (fits)
  ```
  A side-by-side screenshot of page 3 and page 6 at the same scale is indistinguishable.

  **Tests retargeted, none deleted:** `page56-marks` moved to the class selectors (52/52),
  `custom-art` section 5b rewritten to the whole-sheet intent including "ids are made unique, never
  stripped" and "styles itself through classes" (48/48), `experience` exempts the carried page from
  the footer-gap floor since it has no report footer (53/53). In the browser suites, `financial-fixes`
  had two stale expectations from when the power proposal was 6 pages and investment lived on page 5
  (now 7 pages, investment on page 6), and `footer-website` now expects 6 `.power-foot` plus page 3's
  carried `.pg-foot`. Both pass.

  Full local set: `experience` 53/53 · `page56-marks` 52/52 · `custom-art` 48/48 · `sync` 106/106 ·
  `financial-fixes-browser` 2/2 · `footer-website` PASS · `pr-scope-guard` clean.
  `power-five` still fails on its `₹83.33k` tick label - confirmed pre-existing on `main`, unrelated.

  **Follow-up: two more suites were holding the old selectors or the old page map.**
  `qa/engineering-standards.test.js` was grepping `assets/css/app.css` for the literal
  `#pageTechSpec.is-lead-trim …` rules that the class rename removed - the page rendered correctly and the
  test failed anyway. Its five assertions now read `.pv2-sheet.is-lead-trim …`. `qa/bess-browser.test.js`
  measures "content bottom above the footer" on every power page; page 3 has no `.power-foot` to measure
  against, so the carried sheet is checked for staying inside the page instead. Both green.

  The full offline suite (`qa/npm test`) passes end to end: exit 0. Note for anyone running it locally:
  `platform/cloudflare` needs its own `npm install` first, or `excel-module-catalog.test.mjs` dies on a
  missing `@e965/xlsx` - CI installs both trees, the local box does not.

  **One thing the screenshot caught that the tests did not: the footer number.** The carried sheet brought
  the report's own footer number with it, so page 3 of a seven-page Power Proposal announced "Page 6 of 15".
  The design has to be page 6's, but the number has to be true, so `powerSpecSheet()` rewrites only
  `#powerSpecSheet .pg-foot-page` to `Page 3 of 7` - the footer markup gained a `pg-foot-page` class on
  `#v_pgnum_pageTechSpec` as a stable hook, and nothing else in the footer moved. `experience.test.js` now
  asserts that the carried footer prints this document's number and never "of 15", so it cannot regress.

  Visual proof, full-proposal page 6 beside power-proposal page 3 at the same scale:
  `page3-vs-page6.png` in the repo root (not committed - regenerate with the recipe below).

  **CI status at this point.** Offline suite green on CI. Browser suite is at the baseline set of failures
  (`page-spacing`, `tech-spec`, `array-size`, `system-diagram`, `equipment-entry`, `browser`) plus one
  time-of-day flake: `release-audit`'s "proposal date follows local India date" passes locally in any
  timezone and fails on a runner whose clock is in the small window the fixture does not pin. It is not
  related to the page-3 work and it is not touched by it.

---

### 2026-11-19 - The download dialog blamed the wrong page

  The owner sent two screenshots: **both** PDFs opened the pre-flight with "The Technical Specification
  page is too full ... remove a reference link", on a proposal whose Technical Specification page was
  measured at exactly one A4 (1123 of 1123) and overflowing by nothing.

  Two independent faults, and either one alone was enough to show the message.

  1. **`overflowIssues()` hard-coded the spec page.** It returned the Tech Specification wording for
     *whatever* was in `window.__qsPageOverflow`, so any page overflowing anywhere in the proposal was
     reported as the spec page being full. It now maps every entry to its own page: the spec page keeps
     its actionable reference-link wording, every other page says which page it is
     (`OVERFLOW_PAGE_NAMES` in `control-panel.js`).

  2. **The list itself could be stale.** `fitPages()` measures `scrollHeight` on every page, but a hidden
     page keeps the height it had when it was last laid out, so an old overflow could outlive the state
     that caused it. `fitPages()` now measures only pages that are actually displayed, and
     `Exporter.preflight()` re-runs `Render.fitPages()` immediately before asking, so the dialog always
     describes the sheet as it stands at that moment.

  Three checks added to `qa/export-preflight.test.js`: another page's overflow never borrows the spec
  wording, the spec page keeps its own wording, and a cleared overflow is not still reported.

  Also worth knowing for the next run: `financial-fixes-browser` built **both** the 16-page and the 7-page
  PDF inside one `evaluate`, keeping the first PDF's page canvases alive while capturing the second. That
  is what had been taking the renderer down mid-run in this sandbox. Each format now exports in its own
  `evaluate`.
