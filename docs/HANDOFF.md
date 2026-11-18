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
