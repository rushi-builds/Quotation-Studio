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

