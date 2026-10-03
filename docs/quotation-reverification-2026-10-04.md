# Quotation reverification — 4 October 2026

## Scope

Quotation work only; no new Studio features, storage, authentication or business workflows. Review covers changes of customer segment, capacity, module rating, inverter rating, pricing/GST, subsidy, finance, save/reopen, Customer View, published portal and PDF outputs. This is software regression testing and a bounded source review, not an installation compliance certificate or an exhaustive review of all amendments/local DISCOM rules.

## Confirmed defects corrected

1. **Wind height factor:** the calculator previously clamped k2 to the 15 m row even for taller buildings. A staff note did not prevent the understated pressure calculation. It now uses all four terrain columns of IS 875 (Part 3):2015 Table 2 through 500 m, interpolates linearly and refuses to calculate outside the supported height range. High-rise static screening explicitly requires specialist dynamic/structural review. The obsolete “Class A” explanation has been removed.
2. **Customer-output consistency:** share.html and portal.html omitted engineering.js while the builder loaded it. Finance could therefore use a fallback roof-area factor rather than the builder's geometry calculation. All three entry points now load the same version before Finance. A browser regression compares saved Customer View roof area with the builder.
3. **Cable input validity:** negative cable lengths could return a negative voltage drop and a passing result; zero/negative conductor cross-sections were also accepted for calculation. The screen now requires non-negative length and positive cross-section. A genuine zero-length run remains valid. Invalid data returns an uncalculated result for staff review.
4. **Standards wording:** retained AC 3% / DC 2% as project screening targets, not asserted universal IS 732 limits. Removed the unsupported “roughly three” module test-load safety-factor explanation and incorrect IS 875 clause attribution. The module selector now expressly requires a certified uplift/rear test load for the mounting arrangement, not a front snow rating. Updated the obsolete CEA 2010 earthing citation to the checked 2023 regulation 43(vii), with bonding/fault-loop/protection qualifications.

Financial rates, subsidy logic, commercial prices and existing saved inputs were not changed. The customer-facing editable proposal-stage engineering note remains; internal missing-data lists and the Excel reminder are not reintroduced into PDFs.

## Verification

- Existing core suite: **993 assertions passed**, including **54,600 sizing scenarios** (and the battery suite's 2,540 configuration scenarios).
- Independent financial audit: **720 combinations** of customer segment, capacity, wattage, GST and price; subsidy caps, GST, annual/lifetime energy and savings, payment totals and payback reconcile.
- Additional arithmetic checks cover household-limited RWA examples, manual zero subsidy, inverter-independent rated-DC CFA and zero/positive-interest finance.
- New live browser matrix: **30 transitions** across residential → commercial → industrial → RWA → residential, capacities 1 / 2.5 / 8.175 / 8.175001 / 100 / 600 kWp, and 500 / 545 / 620 Wp modules. Each is independently calculated, saved and reloaded; five saved Customer Views are checked. The repeated residential pass catches stale segment state.
- New engineering regressions: independent wind-table rows/interpolation/pressure; unsupported-height and zero-speed guards; negative/zero cable-input guards; all three HTML entry points load Engineering before Finance.
- Real export regression: saved builder, Customer View, print, **16-page Detailed (with financing) and six-page Power** output agree on pricing; zero-interest financing and zero/excessive subsidy rendering remain correct.
- Published anonymous portal regression: saved values, custom proposal note, six-page PDF, metadata/links and download failure recovery passed after the dependency fix.
- Proposal-stage note and Advanced panel regressions passed, including actual blockers/reference warnings, HTML escaping, keyboard operation and mobile geometry.
- Reference/browser regression passed: repeated cloud reopen, local preservation, versions, concurrent creates and reference identity.
- Power fixtures passed for residential, commercial, industrial, provisional/confirmed RWA, zero tariff, decreasing value, override edge cases, custom equipment and battery/additional systems.

Older browser tests contained obsolete expectations (installed-array display now includes contracted capacity; changed default prices; a removed closing CTA property), omitted the now-required customer name, assumed synchronous reference issuance, and tried to operate controls inside a closed Advanced drawer. Updated the tests to use explicit inputs, await the real operation and open the drawer; production calculations were not changed to satisfy old hardcoded totals.

Final additional browser results: array-size **69 passed** including a real 15-page Detailed download without financing; custom-equipment **40 passed**, including catalogue/manual transitions, new/duplicate/reset, saved options, backup/import, mobile and actual PDF; brand/engineering request **42 passed**; system-diagram **36 passed** on rerun (an initial mobile screenshot parity failure was not reproduced). Session persistence/conflict handling: **35 passed**. These are named suites, not a claim that every historical browser script in the repository was run.

## Sources and boundaries

### Subsidy

MNRE operational guidelines with 7 July 2025 amendment:
https://cdnbbsr.s3waas.gov.in/s3716e1b8c6cd17b771da77391355749f3/uploads/2025/07/202507081690964295.pdf

Section 5: general-state residential ₹30,000/kWp for the first 2 kWp, ₹18,000/kWp for the next kWp, no additional CFA beyond 3 kWp; no standard non-residential CFA. RWA common-facility rate ₹18,000/kWp, at most 500 kWp and 3 kWp per household inclusive of individual plants. CFA uses rated module DC, not inverter capacity. The 20-house/100-kWp and 50-house/100-kWp worked examples were tested. DCR, eligible connection, DISCOM approval, previously installed capacity and current portal eligibility require verification. Special-category states have different rates; this audit does not add automatic state classification. Existing explicit overrides remain available.

### Wind

Original BIS IS 875 (Part 3):2015 scan, Table 2 / clause 6.3.2.2, pressure clause 7.2:
https://archive.org/download/gov.in.is.875.3.2015/is.875.3.2015.pdf

The 2015 foreword removes the previous structure-class selection. Table 2 provides 10–500 m rows and specifies linear interpolation. This review does not establish that every amendment or dynamic-response provision is implemented. Generic roof-zone multipliers, pressure coefficients, mounting loads and anchor distribution are screening assumptions, not a complete structural design. Cladding, terrain fetch, topography, cyclone factors, load combinations, anchors, ballast and roof capacity require engineering confirmation.

### Earthing / electrical safety

Official CEA (Measures relating to Safety and Electric Supply) Regulations 2023, regulation 43, particularly (vii), (ix) and (xii):
https://cea.nic.in/wp-content/uploads/notification/2023/06/pdf_100_183_English.pdf

Two connections for the specified apparatus above 250 V and up to 650 V are not a substitute for equipotential bonding, fault-loop impedance, protective disconnection and on-site testing. Electrode resistance and parallel-electrode efficiency remain preliminary estimates, not proof of full IS 3043 compliance.

### GST

The software's 8.9% calculation is arithmetically consistent with 70% goods at 5% plus 30% services at 18%, where that valuation treatment applies. The reviewed official announcement concerns renewable-device goods rates; it alone does not establish the tax classification of every EPC contract:
https://www.pib.gov.in/PressReleasePage.aspx?PRID=2167486&reg=48&lang=2

No rate was changed on the basis of snippets or secondary commentary. Invoice classification/valuation, contract scope and current notifications require tax review.

### Other engineering limitations

- Cable voltage-drop screening is not cable ampacity, derating, short-circuit withstand or protective-device coordination. AC reactance/power-factor and complete installation limits need a detailed cable schedule.
- String estimates require actual module temperature coefficients and inverter limits; per-MPPT topology/current allocation must be professionally designed.
- IEC mechanical-load certification is direction- and mounting-dependent. A front 5400 Pa snow test is not automatically a 5400 Pa rear/uplift rating.
- Lightning-risk, soil, electrode interaction, shading/layout and roof-bearing verification are not replaced by these proposal estimates.
- No unverified 2026 news claim has been implemented as a new regulation. The planned Excel engineering workbook remains a future integration, not part of this audit.
