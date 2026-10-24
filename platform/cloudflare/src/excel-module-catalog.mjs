/* Read-only importer for the whitelisted quotation-facing product sheets in a
   private Excel workbook. The workbook is never returned to clients; VBA is
   not loaded or executed, and operational/cost/customer sheets are not parsed. */
import * as XLSX from '@e965/xlsx';
import { createHash } from 'node:crypto';

export const PRODUCT_CATALOG_MAX_BYTES = 10 * 1024 * 1024;
export const MODULE_CATALOG_MAX_BYTES = PRODUCT_CATALOG_MAX_BYTES;
export const MODULE_CATALOG_MAX_ROWS = 1000;
export const INVERTER_CATALOG_MAX_ROWS = 1000;
export const CABLE_CATALOG_MAX_ROWS = 1000;
export const PROTECTION_CATALOG_MAX_ROWS = 5000;
const MODULE_SHEET_KEY = 'MODULEDB';
const PRODUCT_SHEET_KEYS = Object.freeze({
  modules: 'MODULEDB', inverters: 'INVERTERDB', cables: 'CABLEDB', protection: 'PROTECTIONDB'
});
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_API_ORIGIN = 'https://www.googleapis.com';
const tokenCache = new Map();

function catalogError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
function bytesOf(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw catalogError('EXCEL_WORKBOOK_INVALID');
}
function normalizeKey(value) {
  return String(value == null ? '' : value).trim().toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
function textCell(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}
function numberCell(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  const normalized = String(value).trim().replace(/,/g, '');
  if (!normalized) return '';
  const match = normalized.match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i);
  if (!match) return '';
  const number = Number(normalized);
  return Number.isFinite(number) ? number : '';
}
function displayVoltage(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  const text = String(value).trim();
  if (!text || /^(?:n\/a|na|not specified|not available|-)$/i.test(text)) return '';
  return numberCell(text) === '' ? text.slice(0, 80) : numberCell(text);
}
function headerMap(row) {
  const map = new Map();
  row.forEach((value, index) => {
    const key = normalizeKey(value);
    if (key && !map.has(key)) map.set(key, index);
  });
  return map;
}
function column(map, name, aliases = []) {
  for (const candidate of [name, ...aliases]) {
    const index = map.get(normalizeKey(candidate));
    if (index !== undefined) return index;
  }
  return -1;
}
function stableSlug(value) {
  return String(value || '').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 72) || 'item';
}
function cleanRecord(raw, rowNumber) {
  const make = textCell(raw.make), productName = textCell(raw.model);
  const wp = numberCell(raw.wp);
  if (!make || !productName || !(wp > 0)) return null;
  const revision = textCell(raw.revision).slice(0, 120);
  const baseModel = productName + ' · ' + wp + ' W bin';
  const model = baseModel + (revision ? ' · ' + revision : ' · Excel row ' + rowNumber);
  return {
    id: 'excel-' + stableSlug(make) + '-' + stableSlug(model) + '-' + rowNumber,
    make: make.slice(0, 100),
    model: model.slice(0, 220),
    modelLabel: model.slice(0, 220),
    productName: productName.slice(0, 140),
    series: textCell(raw.series).slice(0, 100),
    tech: textCell(raw.cellType).slice(0, 100),
    cellType: textCell(raw.cellType).slice(0, 100),
    moduleType: textCell(raw.moduleType).slice(0, 100),
    bifaciality: '',
    wp,
    efficiency: numberCell(raw.efficiency),
    lengthMm: numberCell(raw.lengthMm),
    widthMm: numberCell(raw.widthMm),
    thicknessMm: '',
    weightKg: numberCell(raw.weightKg),
    voc: numberCell(raw.voc),
    vmp: numberCell(raw.vmp),
    isc: numberCell(raw.isc),
    imp: numberCell(raw.imp),
    vocBetaPct: numberCell(raw.vocBetaPct),
    vmpBetaPct: '',
    iscAlphaPct: '',
    pmaxBetaPct: numberCell(raw.pmaxBetaPct),
    maxSystemVoltageV: displayVoltage(raw.maxSystemVoltageV),
    maxSeriesFuseA: numberCell(raw.maxSeriesFuseA),
    operatingTemperature: textCell(raw.operatingTemperature).slice(0, 80),
    warrantyYears: numberCell(raw.warrantyYears),
    source: 'excel',
    sourceRow: rowNumber,
    sourceTitle: 'Connected Excel workbook · MODULE_DB',
    sourceRevision: revision,
    sourceUrl: '',
    verified: false
  };
}

/** Parse only the whitelisted MODULE_DB worksheet. Product/bin revisions and
 * conflicting duplicate rows remain separately selectable; no row wins by
 * accident. The workbook's other operational sheets are never exported. */
export function parseModuleCatalogWorkbook(input) {
  const bytes = bytesOf(input);
  if (!bytes.byteLength || bytes.byteLength > MODULE_CATALOG_MAX_BYTES) {
    throw catalogError('EXCEL_WORKBOOK_SIZE_INVALID');
  }
  let index;
  try {
    index = XLSX.read(bytes, {
      type: 'array', bookSheets: true, bookProps: false, bookVBA: false
    });
  } catch (_) {
    throw catalogError('EXCEL_WORKBOOK_INVALID');
  }
  const sheetName = (index.SheetNames || []).find(name =>
    normalizeKey(name).replace(/\s/g, '') === MODULE_SHEET_KEY
  );
  if (!sheetName) throw catalogError('EXCEL_MODULE_SHEET_MISSING');

  let workbook, sheet;
  try {
    workbook = XLSX.read(bytes, {
      type: 'array', sheets: [sheetName], bookVBA: false,
      cellFormula: false, cellHTML: false, cellStyles: false
    });
    sheet = workbook.Sheets && workbook.Sheets[sheetName];
  } catch (_) {
    throw catalogError('EXCEL_MODULE_SHEET_INVALID');
  }
  if (!sheet) throw catalogError('EXCEL_MODULE_SHEET_INVALID');

  let rows;
  try { rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }); }
  catch (_) { throw catalogError('EXCEL_MODULE_SHEET_INVALID'); }
  const headerIndex = rows.findIndex(row => {
    const headers = headerMap(row);
    return column(headers, 'MODULE MAKE') >= 0 && column(headers, 'MODEL') >= 0 &&
      column(headers, 'WATT (Wp)', ['WATT Wp', 'WATT']) >= 0;
  });
  if (headerIndex < 0) throw catalogError('EXCEL_MODULE_HEADERS_INVALID');

  const headers = headerMap(rows[headerIndex]);
  const fields = {
    make: column(headers, 'MODULE MAKE'), series: column(headers, 'SERIES'),
    model: column(headers, 'MODEL'), cellType: column(headers, 'CELL TYPE'),
    moduleType: column(headers, 'MODULE TYPE'), wp: column(headers, 'WATT (Wp)', ['WATT Wp', 'WATT']),
    voc: column(headers, 'Voc (V)', ['VOC V']), vmp: column(headers, 'Vmp (V)', ['VMP V']),
    isc: column(headers, 'Isc (A)', ['ISC A']), imp: column(headers, 'Imp (A)', ['IMP A']),
    efficiency: column(headers, 'EFFICIENCY (%)', ['EFFICIENCY']),
    lengthMm: column(headers, 'LENGTH (mm)', ['LENGTH MM']),
    widthMm: column(headers, 'WIDTH (mm)', ['WIDTH MM']),
    maxSystemVoltageV: column(headers, 'MAX SYSTEM VOLTAGE (V)', ['MAX SYSTEM VOLTAGE V']),
    vocBetaPct: column(headers, 'TEMP COEFF VOC (%/°C)', ['TEMP COEFF VOC']),
    pmaxBetaPct: column(headers, 'TEMP COEFF PMAX (%/°C)', ['TEMP COEFF PMAX']),
    maxSeriesFuseA: column(headers, 'MAX SERIES FUSE (A)', ['MAX SERIES FUSE A']),
    operatingTemperature: column(headers, 'OPERATING TEMP (°C)+', ['OPERATING TEMP']),
    weightKg: column(headers, 'WEIGHT (kg)', ['WEIGHT KG']),
    warrantyYears: column(headers, 'WARRANTY (Years)', ['WARRANTY YEARS']),
    revision: column(headers, 'DATASHEET REVISION')
  };
  for (const required of ['make', 'model', 'wp']) {
    if (fields[required] < 0) throw catalogError('EXCEL_MODULE_HEADERS_INVALID');
  }
  const startRow = XLSX.utils.decode_range(sheet['!ref'] || 'A1').s.r;
  const records = [];
  let rejectedRows = 0;
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const at = key => fields[key] >= 0 ? row[fields[key]] : '';
    const record = cleanRecord({
      make: at('make'), series: at('series'), model: at('model'),
      cellType: at('cellType'), moduleType: at('moduleType'), wp: at('wp'),
      voc: at('voc'), vmp: at('vmp'), isc: at('isc'), imp: at('imp'),
      efficiency: at('efficiency'), lengthMm: at('lengthMm'), widthMm: at('widthMm'),
      maxSystemVoltageV: at('maxSystemVoltageV'), vocBetaPct: at('vocBetaPct'),
      pmaxBetaPct: at('pmaxBetaPct'), maxSeriesFuseA: at('maxSeriesFuseA'),
      operatingTemperature: at('operatingTemperature'), weightKg: at('weightKg'),
      warrantyYears: at('warrantyYears'), revision: at('revision')
    }, startRow + i + 1);
    if (record) records.push(record);
    else if (textCell(at('make')) || textCell(at('model')) || textCell(at('wp'))) rejectedRows += 1;
    if (records.length > MODULE_CATALOG_MAX_ROWS) throw catalogError('EXCEL_MODULE_ROW_LIMIT');
  }
  if (!records.length) throw catalogError('EXCEL_MODULE_CATALOG_EMPTY');

  // Disambiguate duplicate make/model/bin/revision rows instead of silently
  // selecting one of conflicting worksheet records.
  const counts = new Map();
  records.forEach(record => {
    const key = [record.make, record.productName, record.wp, record.sourceRevision].join('\u0000').toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  records.forEach(record => {
    const key = [record.make, record.productName, record.wp, record.sourceRevision].join('\u0000').toLowerCase();
    if (counts.get(key) > 1) {
      record.model = (record.model + ' · Excel row ' + record.sourceRow).slice(0, 220);
      record.modelLabel = record.model;
      record.id += '-duplicate';
    }
  });
  return {
    sheet: sheetName,
    modules: records,
    rowCount: records.length,
    rejectedRows,
    sourceFileName: 'Solar_EPC_Software_FINAL_v0.2.xlsm'
  };
}

function sheetKey(name) { return normalizeKey(name).replace(/[^A-Z0-9]/g, ''); }
function productSheetRows(workbook, kind, requiredHeaders, maxRows, cleanRecordForRow) {
  const key = PRODUCT_SHEET_KEYS[kind];
  const sheetName = (workbook.SheetNames || []).find(name => sheetKey(name) === key);
  const tag = ({ inverters: 'INVERTER', cables: 'CABLE', protection: 'PROTECTION' })[kind] || kind.toUpperCase();
  if (!sheetName) throw catalogError('EXCEL_' + tag + '_SHEET_MISSING');
  const sheet = workbook.Sheets && workbook.Sheets[sheetName];
  if (!sheet) throw catalogError('EXCEL_' + tag + '_SHEET_INVALID');
  let rows;
  try { rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }); }
  catch (_) { throw catalogError('EXCEL_' + tag + '_SHEET_INVALID'); }
  const headerIndex = rows.findIndex(row => {
    const headers = headerMap(row);
    return requiredHeaders.every(header => header.optional || column(headers, header.name, header.aliases || []) >= 0);
  });
  if (headerIndex < 0) throw catalogError('EXCEL_' + tag + '_HEADERS_INVALID');
  const headers = headerMap(rows[headerIndex]);
  const fields = Object.fromEntries(requiredHeaders.map(header => [
    header.key, column(headers, header.name, header.aliases || [])
  ]));
  const startRow = XLSX.utils.decode_range(sheet['!ref'] || 'A1').s.r;
  const records = [];
  let rejectedRows = 0;
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] || [];
    if (!row.some(value => textCell(value))) continue;
    const raw = Object.fromEntries(Object.entries(fields).map(([field, index]) => [
      field, index >= 0 ? row[index] : ''
    ]));
    // CABLE_DB has a separate temperature/installation/grouping correction
    // factor table after the cable products. It is not a product catalogue row.
    if (kind === 'cables' && normalizeKey(raw.make) === 'PARAMETER' &&
        normalizeKey(raw.category) === 'VALUE' && normalizeKey(raw.sizeMm2) === 'FACTOR') break;
    const record = cleanRecordForRow(raw, startRow + i + 1);
    if (record) records.push(record);
    else {
      const requiredValues = requiredHeaders.filter(header => !header.optional)
        .map(header => textCell(raw[header.key])).filter(Boolean);
      const isRepeatedHeader = requiredValues.some(value => /^(?:MAKE|MODEL|CATEGORY)$/i.test(value));
      // Single-cell section labels are not product rows; partially populated
      // identities are counted so the sync status can flag them for review.
      if (requiredValues.length >= 2 && !isRepeatedHeader) rejectedRows += 1;
    }
    if (records.length > maxRows) throw catalogError('EXCEL_' + tag + '_ROW_LIMIT');
  }
  if (!records.length) throw catalogError('EXCEL_' + tag + '_CATALOG_EMPTY');
  return { sheet: sheetName, records, rejectedRows };
}
function makeProductId(kind, make, model, rowNumber) {
  return 'excel-' + kind + '-' + stableSlug(make) + '-' + stableSlug(model) + '-' + rowNumber;
}
function cleanInverter(raw, rowNumber) {
  const make = textCell(raw.make), model = textCell(raw.model);
  const acKw = numberCell(raw.acKw);
  if (!make || !model || !(acKw > 0) || make.toUpperCase() === 'MAKE' || model.toUpperCase() === 'MODEL') return null;
  return {
    id: makeProductId('inverter', make, model, rowNumber), make: make.slice(0, 100), model: model.slice(0, 140),
    modelLabel: model.slice(0, 140), type: textCell(raw.type).slice(0, 60),
    hybrid: textCell(raw.hybrid).slice(0, 30), acKw, phase: displayVoltage(raw.phase),
    mpptCount: numberCell(raw.mpptCount), inputsPerMppt: displayVoltage(raw.inputsPerMppt),
    totalDcInputs: numberCell(raw.totalDcInputs), maxDcPowerKwp: numberCell(raw.maxDcPowerKwp),
    maxDcVoltageV: numberCell(raw.maxDcVoltageV), startVoltageV: numberCell(raw.startVoltageV),
    mpptMinV: numberCell(raw.mpptMinV), mpptMaxV: numberCell(raw.mpptMaxV),
    nominalMpptV: numberCell(raw.nominalMpptV),
    maxInputCurrentPerMpptA: displayVoltage(raw.maxInputCurrentPerMpptA),
    maxIscPerMpptA: displayVoltage(raw.maxIscPerMpptA), acOutputCurrentA: displayVoltage(raw.acOutputCurrentA),
    maxEfficiencyPct: numberCell(raw.maxEfficiencyPct), ipRating: textCell(raw.ipRating).slice(0, 40),
    cooling: textCell(raw.cooling).slice(0, 80), communication: textCell(raw.communication).slice(0, 120),
    weightKg: numberCell(raw.weightKg), source: 'excel', sourceRow: rowNumber,
    sourceTitle: 'Connected Excel workbook · INVERTER_DB', sourceRevision: '', sourceUrl: '', verified: false
  };
}
function cleanCable(raw, rowNumber) {
  const make = textCell(raw.make), category = textCell(raw.category);
  const sizeMm2 = displayVoltage(raw.sizeMm2), material = textCell(raw.material);
  if (!make || !category || !sizeMm2 || !material || make.toUpperCase() === 'MAKE') return null;
  const model = [category, sizeMm2 + ' sq.mm', material, textCell(raw.cores)].filter(Boolean).join(' · ');
  return {
    id: makeProductId('cable', make, model, rowNumber), make: make.slice(0, 100), category: category.slice(0, 80),
    sizeMm2, material: material.slice(0, 40), ampacityA: displayVoltage(raw.ampacityA),
    dcResistanceOhmKm: numberCell(raw.dcResistanceOhmKm), voltageRating: textCell(raw.voltageRating).slice(0, 60),
    cores: textCell(raw.cores).slice(0, 40), insulation: textCell(raw.insulation).slice(0, 60),
    armoured: textCell(raw.armoured).slice(0, 30), standard: textCell(raw.standard).slice(0, 80),
    model, modelLabel: make + ' · ' + model, source: 'excel', sourceRow: rowNumber,
    sourceTitle: 'Connected Excel workbook · CABLE_DB', sourceRevision: '', sourceUrl: '', verified: false
  };
}
function cleanProtection(raw, rowNumber) {
  const category = textCell(raw.category), make = textCell(raw.make), model = textCell(raw.model);
  if (!category || !make || !model || category.toUpperCase() === 'CATEGORY' || make.toUpperCase() === 'MAKE' || model.toUpperCase() === 'MODEL') return null;
  const catalogNumber = textCell(raw.catalogNumber);
  const identity = [category, make, model, catalogNumber].filter(Boolean).join(' · ');
  return {
    id: makeProductId('protection', make, identity, rowNumber), category: category.slice(0, 80),
    make: make.slice(0, 100), series: textCell(raw.series).slice(0, 80), model: model.slice(0, 120),
    catalogNumber: catalogNumber.slice(0, 100), ratedCurrentA: displayVoltage(raw.ratedCurrentA),
    ratedVoltageV: displayVoltage(raw.ratedVoltageV), poles: textCell(raw.poles).slice(0, 30),
    breakingCapacityKa: displayVoltage(raw.breakingCapacityKa), tripType: textCell(raw.tripType).slice(0, 40),
    standard: textCell(raw.standard).slice(0, 100),
    source: 'excel', sourceRow: rowNumber,
    sourceTitle: 'Connected Excel workbook · PROTECTION_DB', sourceRevision: '', sourceUrl: '', verified: false
  };
}

/** Parse the quotation-facing product tabs only. Customer/site, costing,
 * macros, formulas, rules and report sheets are deliberately never returned. */
export function parseProductCatalogWorkbook(input) {
  const bytes = bytesOf(input);
  const moduleData = parseModuleCatalogWorkbook(bytes);
  let sheetIndex;
  try { sheetIndex = XLSX.read(bytes, { type: 'array', bookSheets: true, bookVBA: false }); }
  catch (_) { throw catalogError('EXCEL_WORKBOOK_INVALID'); }
  const selectedNames = Object.values(PRODUCT_SHEET_KEYS).map(key =>
    (sheetIndex.SheetNames || []).find(name => sheetKey(name) === key)
  );
  if (selectedNames.some(name => !name)) {
    const missingKey = Object.entries(PRODUCT_SHEET_KEYS).find(([_, key]) =>
      !sheetIndex.SheetNames.some(name => sheetKey(name) === key)
    )?.[1] || 'PRODUCT';
    const kind = Object.keys(PRODUCT_SHEET_KEYS).find(name => PRODUCT_SHEET_KEYS[name] === missingKey) || 'product';
    const tag = ({ modules: 'MODULE', inverters: 'INVERTER', cables: 'CABLE', protection: 'PROTECTION' })[kind] || 'PRODUCT';
    throw catalogError('EXCEL_' + tag + '_SHEET_MISSING');
  }
  let workbook;
  try {
    workbook = XLSX.read(bytes, {
      type: 'array', sheets: selectedNames, bookVBA: false,
      cellFormula: false, cellHTML: false, cellStyles: false
    });
  } catch (_) { throw catalogError('EXCEL_PRODUCT_SHEET_INVALID'); }
  const inverter = productSheetRows(workbook, 'inverters', [
    { key: 'make', name: 'MAKE' }, { key: 'model', name: 'MODEL' }, { key: 'type', name: 'TYPE', optional: true },
    { key: 'hybrid', name: 'HYBRID', optional: true }, { key: 'acKw', name: 'AC POWER (kW)', aliases: ['AC POWER KW'] },
    { key: 'phase', name: 'PHASE', optional: true }, { key: 'mpptCount', name: 'MPPT', optional: true },
    { key: 'inputsPerMppt', name: 'INPUTS / MPPT', optional: true }, { key: 'totalDcInputs', name: 'TOTAL DC INPUTS', optional: true },
    { key: 'maxDcPowerKwp', name: 'MAX DC POWER (kWp)', optional: true },
    { key: 'maxDcVoltageV', name: 'MAX DC VOLTAGE (V)', optional: true }, { key: 'startVoltageV', name: 'START VOLTAGE (V)', optional: true },
    { key: 'mpptMinV', name: 'MPPT MIN (V)', optional: true }, { key: 'mpptMaxV', name: 'MPPT MAX (V)', optional: true },
    { key: 'nominalMpptV', name: 'NOMINAL MPPT (V)', optional: true },
    { key: 'maxInputCurrentPerMpptA', name: 'MAX INPUT CURRENT / MPPT (A)', optional: true },
    { key: 'maxIscPerMpptA', name: 'MAX ISC / MPPT (A)', optional: true },
    { key: 'acOutputCurrentA', name: 'AC OUTPUT CURRENT (A)', optional: true },
    { key: 'maxEfficiencyPct', name: 'MAX EFFICIENCY (%)', optional: true }, { key: 'ipRating', name: 'IP RATING', optional: true },
    { key: 'cooling', name: 'COOLING', optional: true }, { key: 'communication', name: 'COMMUNICATION', optional: true },
    { key: 'weightKg', name: 'WEIGHT (kg)', aliases: ['WEIGHT KG'], optional: true }
  ], INVERTER_CATALOG_MAX_ROWS, cleanInverter);
  const cables = productSheetRows(workbook, 'cables', [
    { key: 'make', name: 'MAKE' }, { key: 'category', name: 'CATEGORY' },
    { key: 'sizeMm2', name: 'CABLE SIZE (sq.mm)', aliases: ['CABLE SIZE SQ MM'] },
    { key: 'material', name: 'MATERIAL' }, { key: 'ampacityA', name: 'AMPACITY (A)', optional: true },
    { key: 'dcResistanceOhmKm', name: 'DC RESISTANCE @20°C (Ω/km)', optional: true },
    { key: 'voltageRating', name: 'VOLTAGE RATING', optional: true }, { key: 'cores', name: 'CORE', optional: true },
    { key: 'insulation', name: 'INSULATION', optional: true }, { key: 'armoured', name: 'ARMOURED', optional: true },
    { key: 'standard', name: 'STANDARD', optional: true }
  ], CABLE_CATALOG_MAX_ROWS, cleanCable);
  const protection = productSheetRows(workbook, 'protection', [
    { key: 'category', name: 'CATEGORY' }, { key: 'make', name: 'MAKE' },
    { key: 'series', name: 'SERIES', optional: true }, { key: 'model', name: 'MODEL' },
    { key: 'catalogNumber', name: 'CATALOG NO.', optional: true },
    { key: 'ratedCurrentA', name: 'RATED CURRENT (A)', optional: true }, { key: 'ratedVoltageV', name: 'RATED VOLTAGE (V)', optional: true },
    { key: 'poles', name: 'POLES', optional: true }, { key: 'breakingCapacityKa', name: 'BREAKING CAPACITY (kA)', optional: true },
    { key: 'tripType', name: 'TRIP TYPE', optional: true }, { key: 'uiV', name: 'UI (V)', optional: true }, { key: 'ueV', name: 'UE (V)', optional: true },
    { key: 'uimpKv', name: 'UIMP (kV)', optional: true }, { key: 'frequencyHz', name: 'FREQUENCY (Hz)', optional: true },
    { key: 'standard', name: 'STANDARD', optional: true }, { key: 'mounting', name: 'MOUNTING', optional: true },
    { key: 'ipRating', name: 'IP RATING', optional: true }, { key: 'weightKg', name: 'WEIGHT (kg)', optional: true }
    // COUNTRY OF ORIGIN and REMARKS are intentionally excluded.
  ], PROTECTION_CATALOG_MAX_ROWS, cleanProtection);

  const rowCounts = {
    modules: moduleData.modules.length, inverters: inverter.records.length,
    cables: cables.records.length, protection: protection.records.length
  };
  return {
    sourceFileName: moduleData.sourceFileName,
    sheet: moduleData.sheet,
    modules: moduleData.modules,
    inverters: inverter.records,
    cables: cables.records,
    protection: protection.records,
    rowCount: moduleData.modules.length,
    rowCounts,
    rejectedRows: moduleData.rejectedRows + inverter.rejectedRows + cables.rejectedRows + protection.rejectedRows,
    rejectedRowsBySheet: {
      modules: moduleData.rejectedRows, inverters: inverter.rejectedRows,
      cables: cables.rejectedRows, protection: protection.rejectedRows
    },
    sheets: {
      modules: moduleData.sheet, inverters: inverter.sheet, cables: cables.sheet, protection: protection.sheet
    }
  };
}

function base64url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64urlText(value) { return base64url(new TextEncoder().encode(value)); }
function decodePem(pem) {
  const body = String(pem || '').replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, '').replace(/\s/g, '');
  if (!body || body.length > 12000) throw catalogError('EXCEL_DRIVE_CONFIG_INVALID');
  try {
    const binary = atob(body);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch (_) { throw catalogError('EXCEL_DRIVE_CONFIG_INVALID'); }
}
async function serviceAccountToken(serviceAccount, fetchImpl) {
  const email = String(serviceAccount.client_email || '').trim();
  const privateKeyPem = String(serviceAccount.private_key || '');
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(email) || !privateKeyPem) {
    throw catalogError('EXCEL_DRIVE_CONFIG_INVALID');
  }
  const cached = tokenCache.get(email);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.accessToken;

  const now = Math.floor(Date.now() / 1000);
  const header = base64urlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64urlText(JSON.stringify({
    iss: email,
    scope: DRIVE_SCOPE,
    aud: DRIVE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + '.' + claims;
  let key;
  try {
    key = await crypto.subtle.importKey('pkcs8', decodePem(privateKeyPem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch (_) { throw catalogError('EXCEL_DRIVE_CONFIG_INVALID'); }
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const assertion = unsigned + '.' + base64url(signature);
  let response;
  try {
    response = await fetchImpl(DRIVE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion
      }),
      signal: AbortSignal.timeout(10000),
      redirect: 'error'
    });
  } catch (_) { throw catalogError('EXCEL_DRIVE_UNAVAILABLE'); }
  if (!response.ok) throw catalogError('EXCEL_DRIVE_AUTH_FAILED');
  let payload;
  try { payload = await response.json(); } catch (_) { throw catalogError('EXCEL_DRIVE_AUTH_FAILED'); }
  if (typeof payload.access_token !== 'string' || !payload.access_token || payload.access_token.length > 8192) {
    throw catalogError('EXCEL_DRIVE_AUTH_FAILED');
  }
  const expiresAt = Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000;
  tokenCache.set(email, { accessToken: payload.access_token, expiresAt });
  return payload.access_token;
}
async function boundedArrayBuffer(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw catalogError('EXCEL_WORKBOOK_SIZE_INVALID');
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength || buffer.byteLength > maxBytes) throw catalogError('EXCEL_WORKBOOK_SIZE_INVALID');
  return new Uint8Array(buffer);
}

/** Fetch one configured, read-only Drive file. The service account should be
 * granted Viewer access to this file only; no Drive file is made public. */
export async function syncModuleCatalogFromDrive(env, options = {}) {
  let serviceAccount;
  const fileId = String(env.GOOGLE_DRIVE_PRODUCT_CATALOG_FILE_ID || env.GOOGLE_DRIVE_MODULE_CATALOG_FILE_ID || '').trim();
  try { serviceAccount = JSON.parse(String(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '')); }
  catch (_) { throw catalogError('EXCEL_DRIVE_CONFIG_INVALID'); }
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(fileId)) throw catalogError('EXCEL_DRIVE_CONFIG_INVALID');
  const fetchImpl = options.fetch || fetch;
  const accessToken = await serviceAccountToken(serviceAccount, fetchImpl);
  const headers = { Authorization: 'Bearer ' + accessToken };
  const metaUrl = new URL('/drive/v3/files/' + encodeURIComponent(fileId), GOOGLE_API_ORIGIN);
  metaUrl.searchParams.set('supportsAllDrives', 'true');
  metaUrl.searchParams.set('fields', 'id,name,mimeType,modifiedTime,md5Checksum,size');
  let metaResponse;
  try {
    metaResponse = await fetchImpl(metaUrl.toString(), {
      headers, signal: AbortSignal.timeout(10000), redirect: 'error'
    });
  } catch (_) { throw catalogError('EXCEL_DRIVE_UNAVAILABLE'); }
  if (metaResponse.status === 404 || metaResponse.status === 403) throw catalogError('EXCEL_DRIVE_FILE_UNAVAILABLE');
  if (!metaResponse.ok) throw catalogError('EXCEL_DRIVE_UNAVAILABLE');
  let metadata;
  try { metadata = await metaResponse.json(); } catch (_) { throw catalogError('EXCEL_DRIVE_UNAVAILABLE'); }
  if (metadata.id !== fileId || !/\.xlsm$/i.test(String(metadata.name || '')) ||
      Number(metadata.size) > MODULE_CATALOG_MAX_BYTES) throw catalogError('EXCEL_DRIVE_FILE_INVALID');
  const sameRevision = options.previous && options.previous.fileId === fileId &&
    options.previous.fileModifiedAt === metadata.modifiedTime &&
    options.previous.fileChecksum === metadata.md5Checksum;
  const checkedAt = new Date().toISOString();
  if (sameRevision) return {
    unchanged: true, checkedAt, fileId, fileName: metadata.name,
    fileModifiedAt: metadata.modifiedTime || '', fileChecksum: metadata.md5Checksum || ''
  };

  const fileUrl = new URL('/drive/v3/files/' + encodeURIComponent(fileId), GOOGLE_API_ORIGIN);
  fileUrl.searchParams.set('alt', 'media');
  let fileResponse;
  try {
    fileResponse = await fetchImpl(fileUrl.toString(), {
      headers, signal: AbortSignal.timeout(20000), redirect: 'error'
    });
  } catch (_) { throw catalogError('EXCEL_DRIVE_UNAVAILABLE'); }
  if (fileResponse.status === 404 || fileResponse.status === 403) throw catalogError('EXCEL_DRIVE_FILE_UNAVAILABLE');
  if (!fileResponse.ok) throw catalogError('EXCEL_DRIVE_UNAVAILABLE');
  const bytes = await boundedArrayBuffer(fileResponse, MODULE_CATALOG_MAX_BYTES);
  const parsed = parseProductCatalogWorkbook(bytes);
  const checkedChecksum = createHash('sha256').update(bytes).digest('hex');
  return {
    unchanged: false,
    fileId,
    fileName: metadata.name,
    fileModifiedAt: metadata.modifiedTime || '',
    fileChecksum: metadata.md5Checksum || checkedChecksum,
    checkedAt,
    syncedAt: checkedAt,
    ...parsed
  };
}
