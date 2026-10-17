# Lighter system photographs and editorial hero copy

Status: owner authorised feature-branch push and a fresh Vercel Preview on
17 October 2026 ("preview with vercel please") after local verification. This
batch follows published 7fb1824. No PR merge or manual production deployment is
authorised. The linked Cloudflare Git auto-build may also trigger on push; its
outcome is separate from the Vercel Preview.

## Owner request and scope

The left overlay hid too much of the photo. Reduce it, style the system identity
more deliberately, and add a brief, motivating line beneath it. Preserve the
compact BESS-sized frame, text-only main-report linkage and established controls.

- Shared supplement gradient now starts at 38% opacity, falling to 16% around
  the centre and transparent toward the right (previously 97% / 78%). This also
  lightens the BESS photograph; its approved headline and descriptive copy remain.
- Readability comes from a local text shadow, not a solid panel or a near-black
  wash over the photograph. Native asset colours are not changed with a filter.
- Standard system heroes now have a small canonical system identity, an editorial
  two-line headline, and a one/two-line benefit-oriented breathline. These are
  presentation text only: saved system names, cover/summary names, scope, prices,
  equipment, assumptions and engineering conditions are unchanged.
- Custom projects keep the actual entered custom name as the headline, escaped
  literally. An unnamed custom project gets neutral editorial copy rather than
  an invented specification. Whole-copy fitting accounts for the new breathline
  and long names without increasing the 303px frame or clipping the paragraph.
- The compact full-width cover-fit, transparent layout and original photo files
  remain. No extra image is added to the main report or Power Proposal; no cover
  placement, picker sequence, panel order, page count or calculation is changed.

## Editorial copy

| System identity | Headline | Breathline |
|---|---|---|
| Leak Proof Solar Roof | A roof. / Reimagined. | Solar above. A considered space below. |
| Solar Carport | Park below. / Think beyond. | Give everyday parking a brighter purpose. |
| Energy Monitoring | See the energy. / Understand the story. | Bring generation and consumption into clearer view. |
| DG–Solar Coordination | Two sources. / One considered plan. | A thoughtful approach to solar and generator coordination. |
| Zero Export Control | Solar power. / Thoughtfully controlled. | A considered approach at the point of grid connection. |
| EV Charging Integration | A place to charge. / A reason to move. | Connect your next journey to a considered charging plan. |
| Power-Factor Correction | Better balance. / By design. | A considered approach to reactive-power management. |
| Elevated Solar Canopy | Lift the roof. / Reimagine the space. | An elevated solar concept with room for what comes next. |
| Solar Pergola | Room to gather. / Space for solar. | Bring everyday rooftop moments and solar design together. |

These are editorial aspirations, not guaranteed savings, zero-transient export,
backup, water-tightness, measured site data or manufacturer/project verification.
All existing exclusions, engineering-review requirements and cost treatment stay.

## Verification

- New `qa/system-hero-polish.test.cjs`: nine presets, BESS and custom (11 cases),
  lighter gradient values, distinct identity/headline, one/two-line paragraph,
  whole-copy/A4 fit, fixed 303px frame, unchanged Finance, literal custom text,
  80-character name fitting, mobile overflow and no runtime errors.
- Existing 40-case text-context suite passes: ordinary report and Power photos
  unchanged, no extra cards, correct dropdown/section order, left cover placement,
  image proportions and explicit user-photo priority preserved.
- Unified systems suite passes: BESS catalogue sizing, quote recalculation,
  price invalidation, 450-character additions, legacy combined state, actual
  two/one-page PDFs, reload and Customer View.
- Full water browser passes: actual **3/1/18/6-page PDFs**, detailed rainfall/
  event/tank arithmetic, strict state, private reviews, dense investment/
  financing/Power layout, mobile, switching and clean removal.
- Actual Duplicate → JSON → New → file import preserves 19 scoped fields.
- Finance 82, supplements 63, packages 16, water 12 + 256 bounded scenarios and
  knowledge/voice 13 checks pass. This is targeted verification, not a claim
  that every legacy repository harness passes.
- Finance.js, cloud-bridge.js, BESS engine and app.css match this batch's starting
  hashes; genFactor1460 remains unchanged.

Ignored proof screenshots: `qa/shots/hero-polish/{weatherproof,carport,bess,
monitoring,dg,zero,ev,pfc,canopy,pergola,custom}.png`. Representative roof, carport,
controls and BESS renders were visually inspected. Actual report PDFs are under
`qa/shots/rainwater/`. Figures are labelled illustrative, not measured site data.
Verify the new preview against this batch's exact commit in GitHub deployment
metadata; the old 7fb1824 preview does not contain these corrections.
