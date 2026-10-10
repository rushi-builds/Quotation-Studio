/* Manufacturer-datasheet-backed PV module reference data.
   Keep this list small and reviewable: product claims are included only when
   a specific maker/model or model-family + power bin was checked against the
   manufacturer's own datasheet. Bifacial rear-side gain is never folded into
   front-side STC power or efficiency.
*/
'use strict';

(function (root) {
  const MODULES = Object.freeze([
    {
      id: 'waaree-bi-55-545', make: 'Waaree', model: 'Bi-55-545',
      modelLabel: 'Bi-55-545 · 545 Wp', series: 'AHNAY',
      tech: 'Mono PERC', cellType: 'Mono PERC',
      moduleType: 'Bifacial dual-glass', bifaciality: '70 ± 10%',
      wp: 545, efficiency: 21.17,
      lengthMm: 2272, widthMm: 1133, thicknessMm: 35, weightKg: 32.5,
      voc: 49.76, vmp: 41.90, isc: 13.90, imp: 13.02,
      vocBetaPct: -0.25, vmpBetaPct: '', iscAlphaPct: 0.05, pmaxBetaPct: -0.34,
      maxSystemVoltageV: 1500, maxSeriesFuseA: 25,
      verified: true,
      sourceTitle: 'Waaree AHNAY Bi-55 520–550 W manufacturer datasheet',
      sourceRevision: 'Version 12 · 03 Jan 2025',
      sourceUrl: 'https://www.waaree.com/upload/media/datasheet_bi_55_520_550_12_03012025_1756379026.pdf'
    },
    {
      id: 'waaree-bin-08-580', make: 'Waaree', model: 'BiN-08-580',
      modelLabel: 'BiN-08-580 · 580 Wp', series: 'ELITE',
      tech: 'N-type TOPCon', cellType: 'M10/M10R N-type TOPCon',
      moduleType: 'Bifacial dual-glass', bifaciality: '80 ± 10%',
      wp: 580, efficiency: 22.45,
      lengthMm: 2278, widthMm: 1134, thicknessMm: 33, weightKg: 32.5,
      voc: 52.50, vmp: 44.01, isc: 13.93, imp: 13.18,
      vocBetaPct: -0.26, vmpBetaPct: '', iscAlphaPct: 0.046, pmaxBetaPct: -0.30,
      maxSystemVoltageV: 1500, maxSeriesFuseA: 30,
      verified: true,
      sourceTitle: 'Waaree ELITE BiN-08 565–600 W manufacturer datasheet',
      sourceRevision: '09 · 03 Jan 2025',
      sourceUrl: 'https://www.waaree.com/upload/media/elite_series_bin_08_565_600_wel_epd_565_600_144_bin_hc_09_03012025_1756378918.pdf'
    },
    {
      id: 'adani-asb-m10-144-580', make: 'Adani Solar', model: 'ASB-M10-144-AAA · 580 W bin',
      modelLabel: 'ASB-M10-144-AAA · 580 W bin', series: 'ELAN SHINE TOPCon G2G Gen-II',
      tech: 'N-type TOPCon', cellType: 'N-type TOPCon',
      moduleType: 'Bifacial dual-glass', bifaciality: '80 ± 5%',
      wp: 580, efficiency: 22.5,
      lengthMm: 2278, widthMm: 1133, thicknessMm: 30, weightKg: 31.3,
      voc: 52.50, vmp: 43.98, isc: 13.95, imp: 13.19,
      vocBetaPct: -0.24, vmpBetaPct: '', iscAlphaPct: 0.028, pmaxBetaPct: -0.32,
      maxSystemVoltageV: 1500, maxSeriesFuseA: 30,
      verified: true,
      sourceTitle: 'Adani Solar ELAN SHINE TOPCon G2G Gen-II manufacturer datasheet',
      sourceRevision: 'Gen-II',
      sourceUrl: 'https://www.adanisolar.com/-/media/Project/AdaniSolar/Downloads/pdf/newdatasheet1/Shine-TOPCon-G2G-modules-Gen-II.pdf'
    },
    {
      id: 'jinkosolar-jkm580-72hl4-mono', make: 'JinkoSolar',
      model: 'JKM580-605N-72HL4-(V) · 580 W bin',
      modelLabel: 'JKM580-605N-72HL4-(V) · 580 W monofacial bin',
      series: 'Tiger Neo 72HL4-(V)',
      tech: 'N-type TOPCon', cellType: 'N-type monocrystalline',
      moduleType: 'Monofacial', bifaciality: '',
      wp: 580, efficiency: 22.45,
      lengthMm: 2278, widthMm: 1134, thicknessMm: 30, weightKg: 27,
      voc: 52.31, vmp: 43.35, isc: 14.01, imp: 13.38,
      vocBetaPct: -0.25, vmpBetaPct: '', iscAlphaPct: 0.045, pmaxBetaPct: -0.29,
      maxSystemVoltageV: '1000 / 1500', maxSeriesFuseA: 25,
      verified: true,
      sourceTitle: 'JinkoSolar Tiger Neo 72HL4-(V) 580–605 W monofacial manufacturer datasheet',
      sourceRevision: 'F8-EN',
      sourceUrl: 'https://www.jinkosolar.com/uploads/JKM580-605N-72HL4-(V)-F8-EN.pdf'
    },
    {
      id: 'vikram-eldora-330-poly', make: 'Vikram Solar',
      model: 'VSP.72.AAA.03.04 · 330 W bin',
      modelLabel: 'ELDORA VSP.72.AAA.03.04 · 330 W bin',
      series: 'ELDORA GRAND 72-cell',
      tech: 'Polycrystalline', cellType: 'Polycrystalline silicon',
      moduleType: '', bifaciality: '',
      wp: 330, efficiency: 17.01,
      lengthMm: 1956, widthMm: 992, thicknessMm: 35.3, weightKg: 20.7,
      voc: 46.3, vmp: 38.0, isc: 9.24, imp: 8.70,
      vocBetaPct: -0.31, vmpBetaPct: '', iscAlphaPct: 0.052, pmaxBetaPct: -0.41,
      maxSystemVoltageV: 1000, maxSeriesFuseA: 15,
      verified: true,
      sourceTitle: 'Vikram Solar ELDORA GRAND 72-cell polycrystalline manufacturer datasheet',
      sourceRevision: 'Dec 2018 · 315–335 W range; 330 W bin',
      sourceUrl: 'https://www.vikramsolar.com/wp-content/uploads/2015/12/DS-5BB-72-Eld-Grand-1000V-Dec18.pdf'
    }
  ].map(Object.freeze));

  root.ModuleReferenceCatalog = Object.freeze({
    list: () => MODULES.map((entry) => Object.assign({}, entry)),
    find: (make, model) => MODULES.find((entry) => entry.make === make && entry.model === model) || null
  });
})(typeof self !== 'undefined' ? self : this);
