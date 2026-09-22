# Starter battery catalogue — sources, limits and assumptions

Catalogue version: **2026-09-22.1**. Reviewed 22 September 2026.
Implementation: `assets/js/storage-catalog.js`. This is a documented starter set,
not an endorsement, price list, availability claim or compatibility certificate.
Excel connection is deliberately deferred; it is not needed to use these models.

## Selected models

All five are LFP low-voltage modules. Capacity is **per module**, not per system.

| Stable ID / model | Rated / usable DC energy (kWh) | Nominal voltage | Current used for design estimate | Catalogue quantity ceiling |
|---|---:|---:|---:|---:|
| `pylon-us5000` — Pylontech US5000 | 4.8 / 4.56 | 48 V | 100 A normal | 16 |
| `deye-seg51` — Deye SE-G5.1 Pro-B | 5.12 / 4.6 | 51.2 V | 50 A recommended | 32 |
| `dyness-dl50c` — Dyness DL5.0C | 5.12 / 4.608 | 51.2 V | 50 A recommended | 50 |
| `pylon-us3000c` — Pylontech US3000C | 3.552 / 3.374 | 48 V | 37 A continuous | 16 |
| `pylon-us2000c` — Pylontech US2000C | 2.4 / 2.28 | 48 V | 25 A continuous | 16 |

A quantity ceiling is an application guard, not permission to connect that many
modules to any inverter. OEM wiring, communications, protection, busbar and
parallel-bank rules still govern the actual project. Never mix models or brands
in a bank based on this table. These selected editions describe IP20 products;
indoor/environmental suitability and enclosure requirements need site review.

## Source editions and differences

### Pylontech US5000

[Manufacturer English product page](https://en.pylontech.com.cn/products/us5000):
4.8 kWh rated, 4.56 kWh usable, 48 V, 100 A normal current and 16 modules/string.
This product-page edition is the application reference.

The older [manufacturer multi-model sheet, distributor hosted](https://www.pluginsolar.co.uk/wp-content/uploads/2022/05/us5000-datasheet.pdf)
lists 80 A recommended and 100 A maximum continuous for US5000. A newer linked
[PDF](https://global-site.oss-eu-central-1.aliyuncs.com/upload/2026/06/23/US%205000%20Spec_1782186290116.pdf)
has conflicting configuration/life entries, including 20 modules. We **do not
combine the most favourable values from different revisions**. Verify the exact
supplied revision and its supported inverter before procurement.

### Pylontech US3000C and US2000C

Use the same [manufacturer residential BESS sheet, distributor-hosted 2022 edition](https://www.pluginsolar.co.uk/wp-content/uploads/2022/05/us5000-datasheet.pdf).
The table supplies rated/usable energy and 37 A / 25 A continuous ratings,
respectively, with 16 modules/string. Current ratings depend on cell temperature
and must be derated outside the stated conditions. The usable energy is retained
as the published rounded figure, rather than reconstructed from rounded DoD.
Confirm current availability and the delivered edition.

**The 96% efficiency printed for Powercube X1/X2 in that multi-model document is
not a US-series specification.** It is not used as such in this application.

### Dyness DL5.0C

[Official datasheet V1.0-20241011](https://www.dyness.com/Public/Uploads/uploadfile/files/20241023/DynessDL5.0CdatasheetEN.pdf):
5.12 kWh, 51.2 V, 90% DoD, 50 A recommended charge/discharge and up to 50 parallel
modules. The 4.608 kWh usable entry is **calculated as 5.12 × 90%**. Do not substitute
DL5.0C Pro or newer product-page specifications without versioning the catalogue.
Cycle-life test conditions are not an unconditional warranty or an AC-efficiency
rating.

### Deye SE-G5.1 Pro-B

[Official product page](https://deyeess.com/product/se-g5-1-pro-b/) and
[EU/EN manual Issue 06, 26 May 2026](https://deyeess.com/wp-content/uploads/2025/12/Deye-ESS-User-Manual-SE-G5.1-Pro-B-EUEN-V06_20260526.pdf).
Use the page's 4.6 kWh usable operating energy and the manual's recommended 50 A,
not 100 A maximum or 150 A peak. The application ceiling is 32 modules without
external setup, not the 64-module larger arrangement. The manual's 5.12 kWh
usable figure refers to a 100%-DoD test; it is not substituted for practical
90%-DoD operation. Warranty is location-dependent (5/10 years on the page), so
no automatic universal 10-year warranty is filled.

## What is automatic, and what remains an assumption

Selecting a model activates automatic specification mode and supplies its name,
chemistry, rated/usable energy and current-based design estimate. It initializes
**96% DC-to-AC conversion** and **15% power derating** as explicitly editable design
assumptions. Neither is claimed to be a measured or manufacturer-guaranteed
complete-system efficiency. Actual performance depends on the battery, converter,
voltage/SOC, environment and operating point.

The solar-linked starting scenario shifts **30% of average daily generation**;
this is neither measured surplus nor a claim that every day has that energy.
Essential-load sizing requires the preparer to enter both kW and backup hours;
backup duration starts blank. Solar capacity alone cannot establish outage needs.

There is **no automatic installed price, warranty, compatibility approval or
manufacturer AC round-trip efficiency**. The separate quotation-linked economics
button offers editable scenario assumptions; missing source tariff or O&M still
withholds financial benefit. See the workflow document for equations and gates.

## Updating this data later

Check exact OEM revision, regional supply/warranty, usable-energy conditions,
continuous versus peak current and topology before editing a catalogue record.
Keep stable IDs, bump the catalogue version and rerun both supplement suites.
Changing catalogue data can resize an automatically linked saved proposal when
it is reopened; review resulting scope, converter selection and price. Existing
automatic bank/output changes invalidate backup confirmation and clear the old
storage price. Manual mode retains preparer-supplied ratings. JSON backups store
proposal inputs, not an immutable snapshot of the catalogue; retain exported PDFs
for issued documents. Excel import can be added later using these same fields
and validation boundaries.
