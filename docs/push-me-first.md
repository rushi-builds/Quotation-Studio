```
```
# PUSH ME — one patch, one commit, one PR

**Read this whole file first, then follow the steps.** Nothing here has to be re-derived:
the patch is verified against a clean `origin/main`, and the full suite passes on the patched
tree.

---

## TRANSFER — how the patch gets into this session

The patch lives in the *previous* session's workspace. Sandboxes are isolated, and the
previous session's preview URL **cannot be fetched from another sandbox** (it is served only
to the user's own browser; `curl` against it returns an empty reply — that is expected, not a
broken server). So the transfer is user-mediated. There are three sizes of the same change;
any one of them is enough:

| File (in the previous session's workspace) | Size | How the receiving session gets the patch |
|---|---|---|
| `handoff/patch-b64.txt` | 73 KB, one line of plain text | attach it, then `base64 -d patch-b64.txt | gunzip > /tmp/engineering.patch` |
| `handoff/part1.txt` + `part2.txt` + `part3.txt` | 62 / 89 / 35 KB, plain text | attach all three, then `cat part1.txt part2.txt part3.txt > /tmp/engineering.patch` |
| `handoff/engineering-marathi.patch.gz` | 55 KB binary | attach it, then `gunzip -c engineering-marathi.patch.gz > /tmp/engineering.patch` |

Try `patch-b64.txt` first (one file), then the three parts, then the `.gz`. If the attachment
arrives as 0 bytes, do not guess — ask the user to try the next option.

All four paths end at the **same bytes**:

```
sha256 = fdb6fd754f83741b811b934773df888a89c0dab75a46ea350e0d635f6bd531bc
```

Verify before doing anything else:

```bash
sha256sum /tmp/engineering.patch        # must equal the line above
grep -c "^diff --git" /tmp/engineering.patch   # must be 23
```

**If the hash does not match, stop and tell the user.** Do not hand-edit a patch.

### Fallback that needs no attachment pipeline at all

The user owns the repository, so they can put the file on GitHub themselves and this session
can fetch it with git:

1. On github.com → repository → **Add file → Upload files** → drag
   `engineering-marathi.patch` (the plain 187 KB file) → commit to a new branch
   named `handoff-patch`.
2. In this session:

```bash
git fetch origin handoff-patch
git show origin/handoff-patch:engineering-marathi.patch > /tmp/engineering.patch
sha256sum /tmp/engineering.patch
```

3. After the PR is merged, delete the `handoff-patch` branch on GitHub.

---

## What is being delivered

| | |
|---|---|
| Change | 23 files, **+2608 / −79** |
| Base | `cf1e72b` = `origin/main` |
| Verified | applied to a clean `cf1e72b` worktree → **812 passed / 0 failed** (`npm --prefix qa test`); the three-part split rebuilds a byte-identical tree |
| Commit message | step 3 below, ready to paste |
| PR body | step 4 below, ready to paste |

Contents: the engineering design basis (winter-solstice row pitch, IEC 62548 / IEC 62109
strings, IS 875 (Part 3):2015 wind, IS 732 cable drop, IS 3043 earthing, IS/IEC 62305
lightning, MNRE/UPNEDA roof load) with three-level findings (blocking / advisory / notes);
the A4 print fit ladder for the Technical Specification page; the Marathi briefing voice
chain; and `docs/proposal-input-checklist.md` sections 0 and 2A.

## Step 1 — apply

```bash
cd /home/user/Quotation-Studio
git log --oneline -1        # expect cf1e72b
git status --porcelain      # expect clean; if dirty, stop and ask the user
git apply --check /tmp/engineering.patch && git apply /tmp/engineering.patch
git diff --stat | tail -1   # 23 files changed, 2608 insertions(+), 79 deletions(-)

cd qa && npm install --legacy-peer-deps     # plain npm install fails with ERESOLVE
```

## Step 2 — tests (do not skip)

```bash
cd /home/user/Quotation-Studio && npm --prefix qa test
# expect: 812 passed, 0 failed
# 78 / 83 / 13 / 54 / 13 / 116 / 113 / 44 / 40 / 106 / 19 / 70 / 63
```

If any test fails: **stop, do not push**, and tell the user what failed.

## Step 3 — commit

```bash
cd /home/user/Quotation-Studio
git checkout -B arena/01a0e947-quotation-studio
git add -A
git status --short                                    # 23 files, nothing else
git commit -F- <<'MSG'
feat(engineering): derive the design basis from standards, and fix the Marathi briefing

Engineering — every printed figure comes from arithmetic a named standard
defines, or it says DATA REQUIRED: winter-solstice row pitch (replaces the flat
1.4x clearance factor, which understated the roof needed from 15 degrees of tilt
upward); IEC 62548 / IEC 62109 string checks against the inverter DC limits, MPPT
floor and DC input current; IS 875 (Part 3):2015 wind as N/m2 and N per anchor
against the module's IEC 61215 class; IS 732 cable drop; IS 3043 earthing;
IS/IEC 62305 lightning; MNRE/UPNEDA roof dead load.

Findings are reported at three levels: blocking (the arithmetic already proves
the design wrong — no PDF), advisory (a real suspicion, Download anyway), notes
(a missing input, printed as DATA REQUIRED, never gated). Four claims the sheet
could not substantiate are retired and migrated for saved proposals.

Print — the Technical Specification page is a fixed A4 box with overflow hidden,
so an overfull sheet printed with its last rows cut off. A fit ladder now measures
the rendered page and takes the cheapest room back first (tighter cells, then a
smaller table, then a smaller drawing), stopping at the first step that fits and
never dropping a figure, a unit or a clause citation; a page that still does not
fit is reported to the panel as an advisory.

Briefing — Chrome desktop ships no Marathi voice, so the player refused to play
on most laptops. Playback now follows a stated chain (Marathi, else Hindi, and the
reverse) and the status line names the voice actually speaking; voices still being
enumerated say "checking" instead of "unavailable".

Docs — docs/proposal-input-checklist.md gains the three-level contract (section 0)
and the design basis (section 2A).

Tests: jsdom 812 passed, 0 failed; browser briefing 44, tech-spec 31,
system-diagram 36, brand-engineering 42.
MSG
git log --oneline -2                        # your commit, parent cf1e72b
git diff origin/main HEAD --stat | tail -1  # 23 files changed
```

## Step 4 — push and open the PR

```bash
git push -u origin arena/01a0e947-quotation-studio

gh pr create --base main --head arena/01a0e947-quotation-studio \
  --title "Derive the engineering design basis from standards; fix the Marathi briefing" \
  --body-file - <<'BODY'
## What this changes

Every engineering figure the proposal prints is now derived from a named standard, or it
prints **DATA REQUIRED** instead of a plausible-looking number.

- **Row spacing / roof area** — row pitch from the site's winter-solstice sun angle, replacing
  the flat 1.4x clearance factor (which understated the roof needed from 15° of tilt upward;
  Pune at 15° / 18.52°N needs 1.428x).
- **Strings** — IEC 62548 / IEC 62109: cold-morning Voc against the inverter DC limit,
  hot-afternoon Vmp against the MPPT floor, 1.25 x Isc x strings against its DC input current,
  including the case where one module alone already exceeds the limit.
- **Wind** — IS 875 (Part 3):2015: Vz = Vb·k1·k2·k3·k4, pz = 0.6·Vz², net coefficient and
  roof-zone factor, as N/m² and N per anchor against the module's IEC 61215 class.
- **Cables** — IS 732: ΔU = 2ρLI/A for the DC and AC runs (2 % design, 3 % IS 732 power).
- **Earthing / lightning** — IS 3043 electrode design to a target resistance; IS/IEC 62305
  expected-strike count and LPL parameters.
- **Roof load** — MNRE/UPNEDA dead-load benchmark.

Findings are reported at three levels: **blocking** (the arithmetic already proves the design
wrong — no PDF), **advisory** (a real suspicion, "Download anyway"), **notes** (a missing
input, printed as DATA REQUIRED, never gated). Four claims the sheet could not substantiate
are retired and migrated for previously saved proposals.

## Print fix

The Technical Specification page is a fixed A4 box with `overflow: hidden`, so an overfull sheet
printed as missing text with the footer over the last rows. A fit ladder now measures the
rendered page and takes the cheapest room back first — tighter cells, then a smaller table,
then a smaller system drawing — stopping at the first step that fits, and never dropping a
figure, a unit or a clause citation. A page that still cannot fit is reported in the panel as
an advisory before the sheet reaches a customer.

## Marathi briefing fix

Chrome desktop ships no Marathi voice, and Windows installs one only with the Marathi language
pack, so the audio player refused to play on most laptops. Playback now follows a stated chain —
Marathi, else Hindi (same script), and the reverse — the status line and the playing note name
the voice actually speaking, voices still being enumerated say "checking" instead of
"unavailable", and the recovery button switches to the language it advertises. Deliberately
unchanged: English text is never read by an Indic voice, and Marathi is never read by an
English one.

## Tests

- `npm --prefix qa test` — 812 passed, 0 failed; new `qa/briefing-voices.test.js` (13 checks),
  `qa/engineering-standards.test.js` at 54 checks re-deriving every printed figure.
- Browser: `briefing` 44, `tech-spec` 31 (8 new layout checks), `system-diagram` 36,
  `brand-engineering` 42 — all green.
BODY
```

Then **ask the user before merging** — no merge without a fresh instruction. After the merge,
verify production at https://quotation-studio-taupe.vercel.app and show the user the link.

## Invariants — do not break

- Cost rate default **₹63.63/Wp**; the document prints it to **one decimal** (₹63.6).
- Blocking issue → **no PDF**; the dialog names the real issue with a *Fix this →* link.
- Advisory → **Download anyway**. Notes (`DATA REQUIRED — `) never gate, and never raise the
  feedback strip on their own.
- Success notice fades by itself; no dismissal click.
- Every engineering number: derived from a named standard, or `DATA REQUIRED`. No guesses.
- Apply the patch exactly as received. Do not "fix" files afterwards — the tree is verified.

## Notes for whoever runs the browser suites

`qa/node_modules` and `/tmp` are not persisted between sessions. Chromium comes from
`@sparticuz/chromium` and needs its own libraries:

```bash
cd /home/user/Quotation-Studio/qa
node -e "const fs=require('fs'),z=require('zlib');fs.writeFileSync('/tmp/al2023.tar',z.brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))"
mkdir -p /tmp/al2023 && tar -xf /tmp/al2023.tar -C /tmp/al2023
cd /home/user/Quotation-Studio && python3 -m http.server 8080 --bind 0.0.0.0 &
cd qa && LD_LIBRARY_PATH=/tmp/al2023/lib QA_BASE=http://127.0.0.1:8080 node briefing.test.js
```

**Already red before this work** (verified on the pre-work tree, so not a regression):
`page-spacing`, `bess-browser` (dense Tech Spec page), `audit-browser`, `array-size`,
`experience`, `supplements-browser`, `control-panel` (related-page navigation check),
`equipment-entry` (timeout). Ask the user before spending time there.

## Open items (after the merge)

1. A fully dense Tech Spec page (roof area + reference links + the whole design basis) still
   overflows by ~50 px. It is no longer silent — the panel shows an advisory and the fit ladder
   runs — but the real answer is a dedicated design-basis page or a two-column table. Ask the
   user.
2. `qa/engineering.test.js` (176 checks) was lost with a non-persistent sandbox; its coverage
   now lives in `qa/engineering-standards.test.js`.
3. Parked by the user: Cloudflare/backend work; optional-fields discussion only;
   typing-debounce and the three native `confirm()` migrations after the user's own test.   
```




```
