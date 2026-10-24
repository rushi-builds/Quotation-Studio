# Unified Select system — local implementation

> Subsequent input hierarchy and image changes, with their separate owner
> authorisation for a Vercel Preview, are documented in
> [system-input-hierarchy.md](system-input-hierarchy.md).

Status: **owner authorised feature-branch publishing and a Vercel Preview on
17 October 2026 ("verce through preview de") after local verification**.
No PR merge or manual production deployment is authorised. The existing linked
Cloudflare Git auto-build may also run on push; report its result separately.
This supersedes the independent Off/Add / nested-BESS UI described in
`advanced-systems-polish.md`. The earlier 929545f preview remains a separate checkpoint; the owner has now
explicitly authorised publishing this subsequent unified-selector feature.

## One selection workflow

- Advanced Systems starts with **Select system**: none, Battery Energy Storage
  (BESS), the nine existing presets, or Custom. No separate BESS choice group.
- A contextual card shows the selected concept illustration, useful explanation
  and quotation/pricing context. Photographs remain fully visible, not cropped
  or masked with text. For BESS it also shows module configuration, rated bank,
  usable AC scenario, design output limit and a catalogue source link.
- Package pricing and the selected battery model/sizing goal are routine inputs.
  Scope/site details, manual overrides, commercial assumptions and report
  preferences stay folded. Selecting Custom battery opens its manual specs.
- Essential load and required backup duration appear when backup-target sizing
  is selected. Advanced options retain their existing controls.
- Related-page navigation targets the BESS overview for battery-only proposals.

The picker is transient workflow state (`data-system-picker`), excluded from
both collection and application of saved form data. Existing canonical template,
enable/include flags and model fields remain the source of truth. Existing
combined package + BESS saves are displayed explicitly as **Saved package +
battery**, without silently disabling either report. Picking a single system
then changes enable flags but preserves dormant system/battery data. New or reset
proposals still start with no advanced system.

## Custom additions and useful reports

Every package, including Custom, has optional project additions. BESS has its own
independently saved additions. Normal UI entry allows 450 characters per field.
Package additions sit with the proposed assembly in the overview, so they also
appear in the one-page system report. Battery additions sit with the battery
configuration and commercial basis in the assessment. All customer text is
escaped and long words wrap. Newlines are separated inline for compact layout;
no entered words are silently truncated.

Nine presets now include a short, system-specific functional explanation, in
addition to the existing proposed assembly, illustrated workflow, scope,
exclusions, site methods and linked solar equipment. These are explanatory
proposal narratives, not measured site facts, structural calculations or new
performance guarantees. The existing tailored diagrams and concept photos are
retained. No filler appendix or extra report pages are introduced.

Custom additions participate in preset edit protection. A confirmed template
replacement clears stale additions, pricing and site entries; cancellation
preserves them. Switching to BESS/none does not erase the dormant package.
Package additions invalidate scope/base acknowledgements. Battery additions
have an explicit review acknowledgement, strictly boolean and false by default;
changes to battery technical/operating inputs or quotation capacity/inverter
size invalidate it. Neither selection nor autofill acknowledges anything.

A bounded two-level spacing adjustment fits additions on the existing A4 pages,
both live and in export snapshots. The PDF footer/overflow checks remain active:
unreasonably long imported scopes fail explicitly rather than clipping text,
shrinking indefinitely or hiding content.

## Automatic BESS configuration: exact boundary

A new empty BESS choice starts with **Pylontech US5000 as a proposed catalogue
starting point**, not a compatibility endorsement. An existing manually entered
battery is never replaced by that default. Changing model, sizing goal or
quotation reuses the existing versioned catalogue and BESS sizing engine:
whole module count, rated energy, usable energy and design power follow their
existing formulas, limits and reserve/conversion/derating assumptions. No new
engineering formula or generation factor was introduced.

Catalogue selection is not a live manufacturer API, stock check, market-price
fetch, measured-load survey or hybrid/PCS/BMS approval. Model-specific catalogue
ratings are distinct from editable design assumptions. Price and guaranteed
outage support are not guessed; the existing reset/reconfirmation rules remain
in force. Backup runtime is withheld until the required design information is
explicitly supplied and confirmed. Solar Finance does not incorporate these
separately priced upgrades automatically.

Source basis: `storage-catalog.js` and `storage-catalogue.md` retain versioned
manufacturer/distributor references and caveats. A supplementary source review
of Victron's public system-calculation README
(https://github.com/victronenergy/dbus-systemcalc-py/blob/master/README.md)
describes voltage/current/power/SOC readings and battery measurement selection;
it is not a source of new battery ratings or compatibility claims, and no live
telemetry integration is implied. Two unsuccessful research URLs provided no
usable technical evidence and were not used. No newly fetched OEM datasheet,
live availability or current price verification is claimed.

## Verification

- New `qa/unified-systems.test.cjs`: real unified selection; catalogue-derived
  capacity/module arithmetic; backup-target sizing; quote-linked recalculation
  and price reset; manual battery controls; literal/escaped custom text; nine
  preset explanations with 450-character additions; A4 geometry; cancellation;
  persistence and Customer View; legacy combined saves; dormant-data protection;
  mobile cards; actual 2-page battery, 2-page system and 1-page short PDFs.
- Updated minimal/review suites pass with the new UI, including four uncropped
  architectural images, review invalidation, safe cancellation, private review,
  linked hardware and actual two-page system export.
- Package browser matrix: 72 category/preset/price-mode scenarios + 8 dense
  commercial/BOM/payment/financing cases pass; actual 2/1/6/17-page PDFs pass.
- Supplements browser: 94 passed, 0 failed, including actual 21-page combined
  Detailed report, six-page Power geometry, standalone exports, Customer View,
  disabled reports and explicit overlong-text failure.
- Duplicate → JSON backup → New → actual file import preserves 18 fields,
  including both custom additions and the battery additions acknowledgement.
- Pure checks: packages 16, BESS 70, supplements 63; Finance 82, integration 117,
  render reconciliation 123; knowledge/voices 13. These are targeted passes, not
  a claim that every historic whole-repository browser harness is current.
- Finance, CloudBridge, BESS engine and app.css match start-of-batch SHA-256
  hashes byte-for-byte. genFactor1460 is unchanged. Syntax and scoped whitespace
  checks pass. Generated assistant knowledge is refreshed from source.

Use the local :8080 Live Preview. In this sandbox browser QA needs
`LD_LIBRARY_PATH=/tmp/al2023/lib`. `npm run test:systems` in `qa/` includes the new
suite. Ignored proofs live under `qa/shots/unified-systems/`; sample PDFs are
illustrative, not live quotations or confirmed installation designs.
