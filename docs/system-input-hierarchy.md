# Input-first Advanced Systems and fresh report visuals

Status: **owner authorised feature-branch publishing and a Vercel Preview on
17 October 2026** ("sandox through nahi vercel through dikha please").
No PR merge or manual production deployment is authorised. The linked Cloudflare
Git auto-build can also run on push; report it separately. The existing published
37adca4 preview is the previous unified-selector checkpoint, not these changes.

## Builder hierarchy

The owner requested important fields above expert controls, fewer repeated hints
and consistent colour roles across all advanced systems. Selected-system cards
are now compact text/metric summaries without a large photograph; full concept
images remain on customer report pages.

BESS routine order:

1. Pricing (installed battery price, including tax).
2. Battery model and sizing goal; essential load/duration when applicable.
3. Optional custom additions.
4. Battery sizing and advanced options.
5. Specifications, efficiencies and manual overrides.
6. Operating assumptions and savings.
7. Report preferences, related-page navigation and the private review.

All package choices use the same amber pricing group and green scope/custom
sections. BESS technical disclosures are blue, operating/economic assumptions
light purple and report preferences neutral. Colour is supplementary: every
section has a visible text heading, so finding a setting never depends on colour
alone. Existing input IDs, labels, model selection, sizing, review links and
save/import semantics are preserved. Duplicate autofill copy is removed, the
price hint is shorter, and compatibility/design assumptions remain explicit.

## Fresh customer-report images

Six distinct new assets replace shared or reused illustrations for their
specific selected system:

| System | Asset | Visual direction |
| --- | --- | --- |
| Energy Monitoring | `system-monitoring-concept.jpg` | Meter, antenna-equipped gateway, LAN switch/cables and fictional dashboard in one control-room scene |
| DG–Solar Coordination | `system-dg-concept.jpg` | Enclosed generator, LT/control panels and rooftop PV together |
| EV Charging Integration | `system-ev-concept.jpg` | Dedicated charging pedestals/cables and vehicles; not the old carport/EV photo |
| Zero Export Control | `system-zero-concept.jpg` | Controller, meter and solar inverter interfaces |
| Power-Factor Correction | `system-pfc-concept.jpg` | Capacitor-bank / APFC enclosure and LT switchgear |
| Solar Carport | `system-carport-concept.jpg` | Pitched PV parking structure, silver/blue cars and understated post-mounted chargers, inspired by the owner's references |

These are **AI-generated concept illustrations**, not verified KTM installations,
OEM product photographs, real dashboard telemetry or engineering drawings.
Carport imagery does not include EV supply in the scope automatically. Original
About/cover pictures and approved Leak Proof, Canopy and Pergola images are not
changed. Existing uploaded solution-photo priority and disable/restore behaviour
remain in force.

Images were visually reviewed, compressed as high-quality JPEGs without cropping
or artificial upscaling, and retain approximately 1.3–1.5k native width. No native
4K claim is made. Large generation outputs and the owner's low-resolution source
references remain in ignored `tmp/`, not committed source assets. Unbranded
vehicle detailing was corrected in the generated carport illustration. Report
captioning, full-image `contain` sizing and A4 page counts are unchanged.

## Verification

- New `qa/system-input-hierarchy.test.cjs`: price precedes battery/model/advanced
  controls; short hints; compact photo-free input card; matching colour roles
  on all ten package choices; retained canonical IDs; model-change price reset;
  backup target inputs; six unique, decoded, uncropped report images; mobile
  screenshots; unchanged solar Finance; actual 2/2/1-page monitoring/DG/EV PDFs.
- Unified workflow suite: automatic module/energy arithmetic, quote linkage,
  manual battery mode, custom text placement/escaping, 450-character additions,
  cancellation, legacy combined saves, reload/Customer View and actual PDFs.
- Existing minimal and review suites pass, including four architectural report
  images, strict acknowledgements, private review and real system export.
- Duplicate → JSON → New → actual file import retains all 18 tested fields.
- Package browser matrix: 72 category/preset/price-mode cases + 8 dense cases;
  actual 2/1/6/17-page exports; custom photo priority and disable/restore pass.
- Finance 82, integration 117, supplements 63, render reconciliation 123,
  knowledge/voices 13, pure packages 16 pass.
- Finance, CloudBridge, BESS engine and app.css match this batch's starting
  SHA-256 hashes. genFactor1460 and pricing maths are unchanged.

Run `npm run test:systems` in `qa/` with the local server on :8080. Sandbox browser
runs require `LD_LIBRARY_PATH=/tmp/al2023/lib`. These are targeted regressions,
not a claim that every historic repository harness is current. Ignored visual
proofs and PDFs are in `qa/shots/system-input-hierarchy/`.
