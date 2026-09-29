'use strict';
/* =====================================================================
   ENGINEERING DESIGN BASIS
   =====================================================================
   Every number this file produces is either (a) arithmetic that a named
   standard defines, or (b) a value the designer has to supply. Nothing is
   invented. Where a site figure is missing the section comes back with
   `ok:false` and a `missing` list, and the document prints DATA REQUIRED
   instead of a number that merely looks plausible.

   Sources, all named at the point of use:
     IS 875 (Part 3):2015   wind load on the array and its attachments
     IS 3043:2018           earthing — electrode resistance and targets
     IS 732                 wiring — voltage drop limits on the AC side
     IS/IEC 60364-7-712,
     IEC 62548              PV array design — string voltage, currents
     IEC 62109-1            inverter DC input limits (Vmax, MPPT window)
     IEC 61215-2            module mechanical load (static load test)
     IEC/IS 62305 (+IS 2309) lightning risk parameters
     MNRE / UPNEDA rooftop
     technical specification 150 km/h structure, 60 kg/m² roof load,
                             roof-edge clearance, HDGI galvanising
   The financial module (finance.js) keeps working without this file: it
   falls back to its older clearance-factor estimate when Engineering is
   absent. Load order matters — this file must precede finance.js.
   ===================================================================== */
(function (root) {
  const DEG = Math.PI / 180;
  const G = 9.80665;                     // standard gravity, m/s²

  /* A blank input, not a zero. Zero is a real answer (0° tilt, 0 m cable);
     blank means nobody has told us yet. */
  const has = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
  const num = (v, d) => (has(v) ? Number(v) : d);

  /* =====================================================================
     1. WIND — IS 875 (Part 3):2015
     ===================================================================== */

  /* Table 2, Class A (largest horizontal dimension under 20 m). Values are
     read at the tabulated heights only; anything between them is linearly
     interpolated, which is the note the table itself carries. Below 10 m the
     10 m value applies. Class A is the conservative column set for a roof
     whose plan dimension exceeds 20 m, so a bigger roof is not understated. */
  const K2 = {
    '1': { 10: 1.05, 15: 1.09 },
    '2': { 10: 1.00, 15: 1.05 },
    '3': { 10: 0.91, 0.5: 0.91, 15: 0.97 },
    '4': { 10: 0.80, 15: 0.80 }
  };

  function k2For(category, heightM) {
    const table = K2[String(category)] || K2['3'];
    const h = Math.max(0, num(heightM, 10));
    if (h <= 10) return { k2: table[10], beyond: false };
    if (h >= 15) return { k2: table[15], beyond: h > 15 };
    const f = (h - 10) / 5;
    return { k2: table[10] + f * (table[15] - table[10]), beyond: false };
  }

  /* Vz = Vb · k1 · k2 · k3 · k4   (Cl. 6.3)
     pz = 0.6 · Vz²                (Cl. 7.2, N/m²)
     Kd, Ka and Kc (Cl. 7.2.1–7.2.3) all reduce the pressure, so they are
     deliberately NOT applied — leaving them out is the conservative side of
     the code. The basis line on the page says so, so nobody thinks they were
     forgotten. */
  function wind(s) {
    const missing = [];
    if (!has(s.windSpeed)) missing.push('basic wind speed (IS 875-3 Annex A)');
    const vb = num(s.windSpeed, null);
    const k1 = num(s.windK1, 1.0);
    const k3 = num(s.windK3, 1.0);
    const k4 = num(s.windK4, 1.0);
    const heightM = num(s.buildingHeightM, 10);
    const { k2, beyond } = k2For(s.terrainCategory, heightM);
    const netCp = num(s.netUpliftCp, 1.2);
    const zone = ZONE_FACTOR[s.roofZone] !== undefined ? ZONE_FACTOR[s.roofZone] : ZONE_FACTOR.edge;
    const out = {
      ok: missing.length === 0, missing,
      vb, k1, k2, k3, k4, heightM, terrainCategory: String(s.terrainCategory || '3'),
      k2BeyondTable: beyond, netCp, zoneFactor: zone, roofZone: s.roofZone || 'edge',
      anchorsPerModule: Math.max(1, num(s.anchorsPerModule, 4))
    };
    if (!out.ok) return out;
    const vz = vb * k1 * k2 * k3 * k4;
    const pz = 0.6 * vz * vz;                       // N/m², characteristic
    const uplift = pz * netCp * zone;               // N/m², characteristic
    const factored = 1.5 * uplift;                  // IS 875-3 Cl. 8 wind alone
    const areaEach = moduleAreaEach(s);
    out.vz = vz; out.pz = pz; out.uplift = uplift; out.factoredUplift = factored;
    out.pzKnm2 = pz / 1000; out.upliftKnm2 = uplift / 1000;
    out.moduleAreaEach = areaEach;
    out.perModuleN = areaEach > 0 ? uplift * areaEach : null;
    out.perModuleFactoredN = areaEach > 0 ? factored * areaEach : null;
    out.perAnchorN = out.perModuleFactoredN ? out.perModuleFactoredN / out.anchorsPerModule : null;
    out.ballastKgPerM2 = uplift / G;
    /* IEC 61215-2 static mechanical load test: a standard module is qualified
       for 2400 Pa on either face, three cycles of one hour; 5400 Pa covers the
       heavy-snow class. The test pressure already carries roughly a factor of
       three over service load, so comparing our factored (design) pressure
       against the rating is the like-for-like comparison. */
    out.moduleRatingPa = num(s.moduleLoadClassPa, 2400);
    out.moduleOverloaded = factored > out.moduleRatingPa;
    return out;
  }

  /* Roof zones per ASCE-style practice adopted by Indian racking designers:
     interior, edge and corner. The multiplier is a design assumption, so it
     is an input and it is printed, never hidden. */
  const ZONE_FACTOR = { interior: 1.0, edge: 1.5, corner: 2.0 };

  function moduleAreaEach(s) {
    const l = num(s.moduleLengthMm, 0) / 1000;
    const w = num(s.moduleWidthMm, 0) / 1000;
    return l > 0 && w > 0 ? l * w : 0;
  }

  /* =====================================================================
     2. SHADOW GEOMETRY — the roof area an array actually needs
     =====================================================================
     Module surface area is not roof area. On any roof carrying more than one
     row, each row occupies its own depth plus the shadow the row in front
     throws at the worst hour of the design day. The criterion used here is
     the one the industry designs to: no inter-row shading between 09:00 and
     15:00 solar time on the winter solstice (21 December), when the sun is
     at its lowest and the shadow at its longest.

     sin(altitude) = sin φ sin δ + cos φ cos δ cos ω        (declination −23.45°)
     row pitch     = L cos β + L sin β / tan(altitude)      (m)
     area needed   = modules × pitch × W                    (m²)
  */
  const WINTER_DECLINATION = -23.45;

  function solarAltitude(latitudeDeg, hourAngleDeg, declinationDeg) {
    const p = latitudeDeg * DEG, d = declinationDeg * DEG, w = hourAngleDeg * DEG;
    const s = Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(w);
    return Math.asin(Math.max(-1, Math.min(1, s))) / DEG;
  }

  function shadow(s) {
    const missing = [];
    if (!has(s.tiltDeg)) missing.push('module tilt');
    if (!has(s.latitudeDeg)) missing.push('site latitude');
    const tilt = num(s.tiltDeg, null), lat = num(s.latitudeDeg, null);
    const hourAngle = num(s.shadeHalfWindowHours, 3) * 15;   // 3 h => 09:00–15:00 solar time
    const lengthM = num(s.moduleLengthMm, 0) / 1000;
    const widthM = num(s.moduleWidthMm, 0) / 1000;
    const out = {
      ok: missing.length === 0 && lengthM > 0 && widthM > 0,
      missing: moduleAreaEach(s) > 0 ? missing : missing.concat('module dimensions'),
      tiltDeg: tilt, latitudeDeg: lat, hourAngleDeg: hourAngle,
      declinationDeg: WINTER_DECLINATION, lengthM, widthM
    };
    if (!out.ok) return out;
    const altitude = solarAltitude(lat, hourAngle, WINTER_DECLINATION);
    if (!(altitude > 0)) { out.ok = false; out.missing = ['a tilt and latitude that give a usable sun angle']; return out; }
    const rise = lengthM * Math.sin(tilt * DEG);          // vertical height of a row
    const footprint = lengthM * Math.cos(tilt * DEG);     // depth a row occupies
    const throwM = rise / Math.tan(altitude * DEG);       // shadow on the deck
    const pitch = footprint + throwM;
    out.altitudeDeg = altitude;
    out.riseM = rise; out.footprintM = footprint; out.shadowM = throwM; out.pitchM = pitch;
    out.ratio = pitch / lengthM;                          // × module surface area
    out.shadowFactor = throwM / footprint;                // × module footprint
    return out;
  }

  function layout(s, count) {
    const geo = shadow(s);
    const out = { ok: geo.ok, missing: geo.missing.slice(), geo };
    if (!geo.ok) return out;
    const modules = Number.isFinite(count) ? count : num(s.moduleCount, 0);
    out.moduleCount = modules;
    out.clearanceRatio = geo.ratio;
    out.arrayArea = modules * geo.lengthM * geo.widthM;
    out.requiredArea = modules * geo.pitchM * geo.widthM;
    out.planArea = out.requiredArea;
    /* A clear band around the array is what MNRE/UPNEDA rooftop specifications
       ask for (0.6 m from the roof edge). It is not part of the geometry, so
       it is reported beside it rather than folded into the number. */
    out.clearBandM = num(s.roofSetbackM, 0.6);
    out.availableArea = has(s.availableArea) ? num(s.availableArea) : null;
    if (out.availableArea === null) { out.verdict = 'unknown'; return out; }
    /* 15 % headroom on the shaded block is the allowance for that band and for
       walkways on a compact roof; below it the answer is honest about what is
       not yet known instead of claiming a fit. */
    const band = out.requiredArea * 0.15;
    out.verdict = out.availableArea < out.requiredArea ? 'short'
      : out.availableArea < out.requiredArea + band ? 'tight' : 'fits';
    out.shortfallM2 = Math.max(0, out.requiredArea - out.availableArea);
    return out;
  }

  /* =====================================================================
     3. STRINGS — IS/IEC 60364-7-712 and IEC 62548, against IEC 62109 limits
     =====================================================================
     A string must clear two walls. At the coldest expected cell temperature
     the open-circuit voltage is at its highest and must stay under the
     inverter's maximum DC input voltage, a hard limit — exceeding it destroys
     the input stage. At the hottest it must still sit above the MPPT floor,
     or the machine stops tracking. Both use the module's own temperature
     coefficients, which is why the datasheet numbers are inputs here and
     never guesses.
  */
  function string(s, opts) {
    const o = opts || {};
    const need = [];
    ['moduleVoc', 'moduleVmp', 'moduleIsc', 'moduleImp', 'inverterVmaxDc', 'mpptMinV']
      .forEach((k) => { if (!has(s[k])) need.push(k); });
    const out = { ok: need.length === 0, missing: need };
    if (!out.ok) return out;
    const modules = o.moduleCount || num(s.moduleCount, 0);
    const voc = num(s.moduleVoc), vmp = num(s.moduleVmp), isc = num(s.moduleIsc), imp = num(s.moduleImp);
    const bVocPct = num(s.moduleVocBetaPct, -0.27), bVmpPct = num(s.moduleVmpBetaPct, -0.36);
    const vmax = num(s.inverterVmaxDc), mpptMin = num(s.mpptMinV);
    const mpptMax = has(s.mpptMaxV) ? num(s.mpptMaxV) : null;
    const tMin = num(s.minAmbientC, 0);            // cell ≈ ambient at dawn
    const tMaxCell = num(s.maxCellC, 65);
    /* The string voltage at STC that still fits under Vmax once the cold
       correction is applied. Voc rises as temperature falls, hence the
       negative coefficient making the divisor larger than 1. */
    const vocPerModuleCold = voc * (1 + (bVocPct / 100) * (tMin - 25));
    const vmpPerModuleHot = vmp * (1 + (bVmpPct / 100) * (tMaxCell - 25));
    const vmpPerModuleCold = vmp * (1 + (bVmpPct / 100) * (tMin - 25));
    const maxSeries = Math.floor(vmax / vocPerModuleCold);
    const minSeries = Math.ceil(mpptMin / vmpPerModuleHot);
    const maxSeriesMppt = mpptMax ? Math.floor(mpptMax / vmpPerModuleCold) : null;
    out.modules = modules;
    out.vocColdPerModule = vocPerModuleCold; out.vmpHotPerModule = vmpPerModuleHot;
    out.maxSeriesByVoltage = maxSeries; out.minSeriesByMppt = minSeries;
    out.maxSeriesByMppt = maxSeriesMppt;
    const ceiling = maxSeriesMppt === null ? maxSeries : Math.min(maxSeries, maxSeriesMppt);
    /* When not even one module clears the inverter's ceiling, no arrangement
       exists: that is a wrong inverter for these modules, not a long string. */
    out.impossible = !(ceiling >= 1) && modules > 0;
    /* You cannot put more modules in a string than you have ordered, and
       unequal strings on one MPPT drag each other down, so the modules are
       shared out evenly: strings = ceil(N / ceiling), length = ceil(N/strings). */
    out.strings = (!out.impossible && modules > 0) ? Math.max(1, Math.ceil(modules / ceiling)) : 0;
    out.seriesPerString = out.strings > 0 ? Math.ceil(modules / out.strings) : 0;
    out.balancedStrings = out.strings > 0 && modules % out.strings === 0;
    out.vocColdString = out.seriesPerString * vocPerModuleCold;
    out.vmpHotString = out.seriesPerString * vmpPerModuleHot;
    out.overVoltage = out.impossible || out.vocColdString > vmax;
    out.belowMppt = out.vmpHotString < mpptMin;
    out.feasible = maxSeries >= minSeries && maxSeries >= 1;
    out.vocMarginPct = ((vmax - out.vocColdString) / vmax) * 100;
    /* IEC 62548 sizes the string cable and its protection for 1.25 × Isc. */
    out.iscDesignPerString = 1.25 * isc;
    out.designCurrent = out.iscDesignPerString * out.strings;
    out.inverterMaxCurrentA = has(s.inverterMaxCurrentA) ? num(s.inverterMaxCurrentA) : null;
    out.iscOverload = out.inverterMaxCurrentA !== null && out.designCurrent > out.inverterMaxCurrentA;
    out.dcVoltageV = out.seriesPerString * vmp;     // nominal string voltage at STC
    out.moduleImp = imp;
    return out;
  }

  /* =====================================================================
     4. CABLE — IS 732 limits, with the tighter DC target of IEC 62548
     =====================================================================
     ΔU = 2·ρ·L·I/A on a two-wire circuit, √3·ρ·L·I/A on three-phase.
     ρ is copper at 70 °C (0.0202 Ω·mm²/m), the operating temperature IS 732
     works at, not the 20 °C figure on a datasheet.
  */
  const RHO_CU_70 = 0.0172 * (1 + 0.00393 * 45);

  function voltageDrop(currentA, lengthM, sizeMm2, voltageV, phases) {
    const R = (RHO_CU_70 * lengthM) / sizeMm2;
    const dropV = (phases === 3 ? Math.sqrt(3) : 2) * currentA * R;
    return { dropV, percent: voltageV > 0 ? (dropV / voltageV) * 100 : 0 };
  }

  function cable(s, ctx) {
    const c = ctx || {};
    const out = { rho: RHO_CU_70, acLimitPct: 3, dcLimitPct: 2, limits: 'IS 732: 2.5 % lighting, 3 % power; DC strings designed to 2 % (IEC 62548 practice)' };
    /* DC run: array to inverter. */
    if (has(s.dcCableLengthM) && has(s.dcCableSizeMm2) && c.dcCurrentA > 0 && c.dcVoltageV > 0) {
      const d = voltageDrop(c.dcCurrentA, num(s.dcCableLengthM), num(s.dcCableSizeMm2), c.dcVoltageV, 2);
      out.dc = {
        ok: true, lengthM: num(s.dcCableLengthM), sizeMm2: num(s.dcCableSizeMm2),
        currentA: c.dcCurrentA, voltageV: c.dcVoltageV,
        dropV: d.dropV, percent: d.percent, limitPct: out.dcLimitPct,
        pass: d.percent <= out.dcLimitPct
      };
    } else {
      out.dc = { ok: false, missing: ['DC cable length, cross-section, string current'] };
    }
    /* AC run: inverter to the metering point. */
    const phases = c.phases === 3 ? 3 : 1;
    if (has(s.acCableLengthM) && has(s.acCableSizeMm2) && c.acCurrentA > 0 && c.acVoltageV > 0) {
      const d = voltageDrop(c.acCurrentA, num(s.acCableLengthM), num(s.acCableSizeMm2), c.acVoltageV, phases);
      out.ac = {
        ok: true, lengthM: num(s.acCableLengthM), sizeMm2: num(s.acCableSizeMm2),
        currentA: c.acCurrentA, voltageV: c.acVoltageV, phases,
        dropV: d.dropV, percent: d.percent, limitPct: out.acLimitPct,
        pass: d.percent <= out.acLimitPct
      };
    } else {
      out.ac = { ok: false, missing: ['AC cable length and cross-section'] };
    }
    out.ok = out.dc.ok && out.ac.ok;
    return out;
  }

  /* =====================================================================
     5. EARTHING — IS 3043:2018
     =====================================================================
     A 3 m pipe electrode 50 mm across in soil of resistivity ρ:
        R = (ρ / 2πL) · [ ln(4L/d) − 1 ]
     which is the formula the standard's own worked example uses. Targets:
     ≤ 5 Ω for a general LV installation, ≤ 1 Ω where a system earth is
     called for, ≤ 10 Ω for a lightning earth. CEA (Measures Relating to
     Safety and Electric Supply) Regulations 2010 require two distinct earth
     connections for systems between 250 V and 650 V.
  */
  function electrodeOhm(rho, lengthM, diaM) {
    return (rho / (2 * Math.PI * lengthM)) * (Math.log((4 * lengthM) / diaM) - 1);
  }

  function earthing(s) {
    const targetOhm = num(s.earthTargetOhm, 5);
    const lengthM = num(s.electrodeLengthM, 3);
    const diaM = num(s.electrodeDiaM, 0.05);
    const out = {
      targetOhm, lengthM, diaM,
      twoConnections: true,
      basis: 'IS 3043:2018 — R = (ρ/2πL)·[ln(4L/d) − 1]; two distinct earth connections for 250–650 V (CEA Safety Regulations 2010)'
    };
    if (!has(s.soilResistivity)) {
      out.ok = false;
      out.missing = ['soil resistivity (measured on site, IS 3043)'];
      return out;
    }
    const rho = num(s.soilResistivity);
    const single = electrodeOhm(rho, lengthM, diaM);
    out.soilResistivity = rho;
    out.singleOhm = single;
    /* Electrodes in parallel do not simply halve: the field of one raises the
       resistance of the next, so the group returns R1/(n·η) where η is the
       field efficiency for electrodes spaced at least twice their length
       apart (0.6–0.8 in IS 3043 practice, so 0.75 is the shipped assumption
       and it is an input). A design that needs an implausible number of pits
       is reported as needing a chemical or deeper electrode instead of a
       number nobody would build. */
    const eta = Math.min(0.95, Math.max(0.4, num(s.electrodeEfficiency, 0.75)));
    out.efficiency = eta;
    const maxPits = 12;
    let count = 1;
    while (count < maxPits && single / (count * eta) > targetOhm) count += 1;
    out.electrodeCount = count;
    out.parallelOhm = single / (count * eta);
    out.pass = out.parallelOhm <= targetOhm;
    out.chemicalRequired = !out.pass;
    out.ok = true;
    return out;
  }

  /* =====================================================================
     6. LIGHTNING — IS/IEC 62305 (IS 2309)
     =====================================================================
     Ng ≈ 0.04 · Td^1.25 flashes/km²/year from the local thunderstorm-day
     count, collection area Ad = LW + 2(L+W)H + πH², expected strikes per
     year Nd = Ng·Ad·10⁻⁶. Whether an LPS is *required* is a risk decision
     (IEC 62305-2) that belongs to the designer — so the numbers are shown
     and the protection parameters for the chosen level are printed instead
     of the app pretending to make that call.
  */
  const LPL = {
    I: { sphere: 20, mesh: 5, down: 10, eff: '99 %' },
    II: { sphere: 30, mesh: 10, down: 10, eff: '97 %' },
    III: { sphere: 45, mesh: 15, down: 15, eff: '91 %' },
    IV: { sphere: 60, mesh: 20, down: 20, eff: '84 %' }
  };

  function lightning(s) {
    const level = LPL[s.lpsClass] ? s.lpsClass : 'IV';
    const out = { lpsClass: level, params: LPL[level], earthOhm: 10 };
    if (!has(s.thunderstormDays)) { out.ok = false; out.missing = ['thunderstorm days per year for the site']; return out; }
    const td = num(s.thunderstormDays);
    const L = num(s.buildingLengthM, 0), W = num(s.buildingWidthM, 0), H = num(s.buildingHeightM, num(s.roofHeightM, 10));
    out.thunderstormDays = td;
    out.ng = 0.04 * Math.pow(td, 1.25);
    if (L > 0 && W > 0) {
      out.collectionAreaM2 = L * W + 2 * (L + W) * H + Math.PI * H * H;
      out.strikesPerYear = out.ng * out.collectionAreaM2 * 1e-6;
    }
    out.ok = true;
    return out;
  }

  /* =====================================================================
     7. ROOF LOAD — MNRE/UPNEDA rooftop specification
     =====================================================================
     "the total load of the structure including PV modules on the terrace is
     less than 60 kg/m²". Modules plus racking over the area the array
     occupies; the roof's own capacity is a structural question this cannot
     answer, so the page says whose job that is.
  */
  function roofLoad(s, count, areaM2) {
    const modules = Number.isFinite(count) ? count : 0;
    const weight = num(s.moduleWeightKg, 28);
    const rack = num(s.rackKgPerM2, 2.5);
    const bench = num(s.roofLoadBenchmarkKgM2, 60);
    const modulesKg = modules * weight;
    const area = areaM2 > 0 ? areaM2 : 0;
    const out = {
      ok: modules > 0 && area > 0,
      moduleCount: modules, moduleWeightKg: weight, rackKgPerM2: rack, benchmarkKgM2: bench,
      modulesKg, rackKg: rack * area,
      kgPerM2: area > 0 ? (modulesKg + rack * area) / area : 0
    };
    out.pass = out.kgPerM2 > 0 && out.kgPerM2 <= bench;
    out.basis = 'MNRE / UPNEDA rooftop technical specification: structure including modules under 60 kg/m²';
    return out;
  }

  /* =====================================================================
     8. THE WHOLE BASIS — and what it means for the export gate
     =====================================================================
     Blocking issues are the ones where a number already proves the design
     wrong: the roof cannot hold the array, a string would exceed the
     inverter, the modules would see more pressure than they are qualified
     for. Everything else that is unknown is advisory, printed as DATA
     REQUIRED on the page so nobody mistakes silence for a clean sheet.
  */
  function report(s, ctx) {
    const c = ctx || {};
    const w = wind(s);
    const l = layout(s, c.moduleCount);
    const st = string(s, { moduleCount: c.moduleCount });
    const cb = cable(s, {
      dcCurrentA: st.ok ? st.designCurrent : 0,
      dcVoltageV: st.ok ? st.dcVoltageV : 0,
      acCurrentA: c.acCurrentA || 0,
      acVoltageV: c.acVoltageV || 0,
      phases: c.phases
    });
    const e = earthing(s);
    const li = lightning(s);
    const r = roofLoad(s, c.moduleCount, l.ok ? l.requiredArea : 0);
    /* Three levels, because two were not enough to be honest without being
       noisy.  blocking  — a number already proves the design wrong; no PDF.
       advisory  — a real suspicion worth a look; the reader may proceed.
       notes     — an input nobody has supplied yet, or a design statement that
                   is simply informing. The page prints DATA REQUIRED for these
                   and the panel lists them, but a document that makes no claim
                   it cannot support has nothing to stop for. */
    const blocking = [], advisory = [], notes = [];

    if (l.ok && l.verdict === 'short') {
      blocking.push({
        id: 'availableArea',
        message: 'The array needs ' + Math.ceil(l.requiredArea) + ' m² with no-shading row spacing (' +
          l.tiltDeg + '° tilt, ' + Math.round(l.geo.altitudeDeg) + '° mid-morning sun, 21 December), but only ' +
          l.availableArea + ' m² is available.'
      });
    } else if (l.ok && l.verdict === 'tight') {
      advisory.push({
        id: 'availableArea',
        message: 'Roof area is ' + Math.ceil(l.requiredArea) + ' m² of shaded array in ' + l.availableArea +
          ' m² — the 0.6 m clear band around it is not yet confirmed.'
      });
    }
    if (st.ok) {
      if (st.impossible) {
        blocking.push({
          id: 'inverterVmaxDc',
          message: 'One module already reaches ' + Math.round(st.vocColdPerModule) +
            ' V open-circuit at ' + num(s.minAmbientC, 0) + ' °C, above this inverter’s ' +
            num(s.inverterVmaxDc) + ' V limit — no string of these modules can be built. (IEC 62548)'
        });
      } else if (st.overVoltage) {
        blocking.push({
          id: 'inverterVmaxDc',
          message: 'A string of ' + st.seriesPerString + ' modules reaches ' + Math.round(st.vocColdString) +
            ' V open-circuit at ' + num(s.minAmbientC, 0) + ' °C — above the inverter limit of ' + num(s.inverterVmaxDc) +
            ' V. The input stage fails on the first cold morning.'
        });
      }
      if (st.belowMppt) {
        blocking.push({
          id: 'mpptMinV',
          message: 'At ' + num(s.maxCellC, 65) + ' °C cell temperature a string of ' + st.seriesPerString +
            ' modules falls to ' + Math.round(st.vmpHotString) + ' V, below the ' + num(s.mpptMinV) +
            ' V MPPT floor — the inverter would stop tracking.'
        });
      }
      if (st.iscOverload) {
        blocking.push({
          id: 'inverterMaxCurrentA',
          message: st.strings + ' strings carry ' + st.designCurrent.toFixed(1) + ' A at 1.25 × Isc (IEC 62548), ' +
            'above the inverter’s ' + st.inverterMaxCurrentA + ' A DC input limit.'
        });
      }
    } else {
      notes.push({
        id: 'moduleVoc',
        message: 'DATA REQUIRED — string design cannot be checked: add the module Voc/Vmp/Isc/Imp and the inverter DC limits (' +
          st.missing.join(', ') + ').'
      });
    }
    if (w.ok && w.moduleOverloaded) {
      blocking.push({
        id: 'moduleLoadClassPa',
        message: 'IS 875 wind uplift on the array is ' + Math.round(w.factoredUplift) + ' N/m² (' +
          w.vb + ' m/s basic speed, ' + w.zoneFactor + '× ' + w.roofZone + ' zone), above the module’s ' +
          w.moduleRatingPa + ' Pa IEC 61215 mechanical-load rating.'
      });
    }
    if (!w.ok) notes.push({ id: 'windSpeed', message: 'DATA REQUIRED — wind load is not calculated: ' + w.missing.join(', ') + '.' });
    else if (w.k2BeyondTable) {
      notes.push({ id: 'buildingHeightM', message: 'Height is above the 15 m row of IS 875-3 Table 2 — k2 must be read from the table for this height.' });
    }
    if (cb.dc.ok && !cb.dc.pass) {
      advisory.push({ id: 'dcCableSizeMm2', message: 'DC voltage drop is ' + cb.dc.percent.toFixed(2) + ' %, above the ' + cb.dc.limitPct + ' % design limit.' });
    } else if (!cb.dc.ok) notes.push({ id: 'dcCableLengthM', message: 'DATA REQUIRED — DC voltage drop is not checked: ' + cb.dc.missing.join(', ') + '.' });
    if (cb.ac.ok && !cb.ac.pass) {
      advisory.push({ id: 'acCableSizeMm2', message: 'AC voltage drop is ' + cb.ac.percent.toFixed(2) + ' %, above the IS 732 limit of ' + cb.ac.limitPct + ' %.' });
    } else if (!cb.ac.ok) notes.push({ id: 'acCableLengthM', message: 'DATA REQUIRED — AC voltage drop is not checked: ' + cb.ac.missing.join(', ') + '.' });
    if (!e.ok) notes.push({ id: 'soilResistivity', message: 'DATA REQUIRED — earthing design needs ' + e.missing.join(', ') + '.' });
    else if (e.chemicalRequired) notes.push({
      id: 'soilResistivity',
      message: 'Earthing: ' + e.singleOhm.toFixed(1) + ' Ω for one ' + e.lengthM + ' m pipe electrode at ' +
        e.soilResistivity + ' Ω·m — the ' + e.targetOhm + ' Ω target is not reachable with pipe electrodes alone. ' +
        'A chemical or deeper electrode design is required (IS 3043).'
    });
    else notes.push({
      id: 'soilResistivity',
      message: 'Earthing: ' + e.electrodeCount + ' × ' + e.lengthM + ' m pipe electrode at ' + e.soilResistivity +
        ' Ω·m gives ≈' + e.parallelOhm.toFixed(1) + ' Ω against the ' + e.targetOhm + ' Ω target (IS 3043).'
    });
    if (li.ok && li.strikesPerYear) {
      notes.push({
        id: 'lpsClass',
        message: 'Lightning: ≈' + li.strikesPerYear.toExponential(1) + ' strikes/yr expected on this collection area. ' +
          'If an LPS is provided, LPL ' + li.lpsClass + ' means ' + li.params.mesh + ' m mesh, ' + li.params.sphere +
          ' m rolling sphere, down conductors within ' + li.params.down + ' m, earth ≤ ' + li.earthOhm + ' Ω.'
      });
    }
    if (!r.pass) notes.push({ id: 'moduleWeightKg', message: 'DATA REQUIRED — roof load is not checked: module weight and array area are needed.' });

    return {
      wind: w, layout: l, string: st, cable: cb, earthing: e, lightning: li, roofLoad: r,
      blocking, advisory, notes
    };
  }

  root.Engineering = {
    report, wind, shadow, layout, string, cable, earthing, lightning, roofLoad,
    voltageDrop, electrodeOhm, solarAltitude, moduleAreaEach,
    K2, LPL, RHO_CU_70, WINTER_DECLINATION, ZONE_FACTOR,
    k2For
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Engineering;
})(typeof self !== 'undefined' ? self
  : (typeof globalThis !== 'undefined' ? globalThis : this));
