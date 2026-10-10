# Manufacturer-verified module reference data

The editable company equipment library and this reference list are separate.
Entries in `assets/js/module-catalog.js` are included only when a specific
manufacturer product, or a stated model family and power bin, has been checked
against the manufacturer's own datasheet. The quotation links that datasheet.

| Make and selected model | Technology / construction | STC power | Module efficiency | Bifaciality |
|---|---|---:|---:|---|
| Waaree Bi-55-545 | Mono PERC, bifacial dual-glass | 545 Wp | 21.17% | 70 ± 10% |
| Waaree BiN-08-580 | N-type TOPCon, bifacial dual-glass | 580 Wp | 22.45% | 80 ± 10% |
| Adani Solar ASB-M10-144-AAA · 580 W bin | N-type TOPCon, bifacial dual-glass | 580 Wp | 22.5% | 80 ± 5% |
| JinkoSolar JKM580-605N-72HL4-(V), 580 W bin | N-type TOPCon, monofacial | 580 Wp | 22.45% | Not applicable |
| Vikram Solar ELDORA VSP.72.AAA.03.04, 330 W bin | Polycrystalline; module construction not stated here | 330 Wp | 17.01% | Not specified |

The Vikram datasheet gives a 315–335 W family range, not a separate full SKU
for the 330 W bin; the model selector and quote say so rather than presenting a
bin as a distinct manufacturer part number. Likewise, Jinko's source is a
580–605 W monofacial family datasheet; the quotation identifies the selected
580 W bin.

The reference data includes each product's published STC Voc/Vmp/Isc/Imp,
dimensions and available temperature coefficients. When an exact model is
selected, a coefficient not stated in its source is cleared and is not supplied
from a technology label. The untouched template's Voc/Vmp coefficient values
are explicitly labelled screening assumptions, not product claims; a blank
also uses the engineering screen's disclosed calculation fallback. Neither is
presented as manufacturer data in the quotation.

For bifacial products, the datasheet's front-side STC nameplate power and
module efficiency remain the quoted values. Bifaciality is printed separately;
no rear-side gain is silently added to the quotation or performance estimate.

## Manufacturer sources

- [Waaree AHNAY Bi-55 520–550 W datasheet](https://www.waaree.com/upload/media/datasheet_bi_55_520_550_12_03012025_1756379026.pdf)
- [Waaree ELITE BiN-08 565–600 W TOPCon datasheet](https://www.waaree.com/upload/media/elite_series_bin_08_565_600_wel_epd_565_600_144_bin_hc_09_03012025_1756378918.pdf)
- [Adani Solar ELAN SHINE TOPCon G2G Gen-II datasheet](https://www.adanisolar.com/-/media/Project/AdaniSolar/Downloads/pdf/newdatasheet1/Shine-TOPCon-G2G-modules-Gen-II.pdf)
- [JinkoSolar Tiger Neo 72HL4-(V) 580–605 W monofacial datasheet](https://www.jinkosolar.com/uploads/JKM580-605N-72HL4-(V)-F8-EN.pdf)
- [Vikram Solar ELDORA GRAND 72-cell polycrystalline datasheet](https://www.vikramsolar.com/wp-content/uploads/2015/12/DS-5BB-72-Eld-Grand-1000V-Dec18.pdf)

## Workbook catalogue review

The separate workbook-backed catalogue sync uses the private Drive file
`Solar_EPC_Software_FINAL_v0.2.xlsm` (the local copy has a different filename
but was verified to have the same byte size and MD5 checksum). Its `MODULE_DB` has
295 model/bin rows from 10 manufacturers, but does not provide a direct
manufacturer URL for each row. Only the four approved product tabs are parsed;
other operational/customer/cost sheets, macros, and unrelated content are not
loaded into the quotation catalogue.

Workbook rows are now available as a distinct, read-only, **unverified** source
when a person explicitly selects a product. They are not merged into the
manufacturer-verified table above, and the quotation asks staff to verify the
current datasheet. For example, at least two Waaree fields differ from the
manufacturer sources above (the workbook shows 32 kg where the datasheets show
32.5 kg; for BiN-08-580 it shows a Voc coefficient of −0.25%/°C where the
source sheet shows −0.26%/°C). Those discrepancies are why the workbook values
remain visibly unverified rather than being silently treated as manufacturer
claims.
