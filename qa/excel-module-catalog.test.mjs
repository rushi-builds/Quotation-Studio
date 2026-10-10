import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  MODULE_CATALOG_MAX_BYTES,
  parseModuleCatalogWorkbook,
  parseProductCatalogWorkbook,
  syncModuleCatalogFromDrive
} from '../platform/cloudflare/src/excel-module-catalog.mjs';

const require = createRequire(new URL('../platform/cloudflare/package.json', import.meta.url));
const requireQa = createRequire(new URL('./package.json', import.meta.url));
const XLSX = require('@e965/xlsx');
const { JSDOM } = requireQa('jsdom');
const headers = [
  'MODULE MAKE', 'Series', 'MODEL', 'CELL TYPE', 'MODULE TYPE', 'WATT (Wp)',
  'Voc (V)', 'Vmp (V)', 'Isc (A)', 'Imp (A)', 'EFFICIENCY (%)',
  'LENGTH (mm)', 'WIDTH (mm)', 'MAX SYSTEM VOLTAGE (V)',
  'TEMP COEFF VOC (%/°C)', 'TEMP COEFF PMAX (%/°C)', 'MAX SERIES FUSE (A)',
  'OPERATING TEMP (°C)+', 'WEIGHT (kg)', 'WARRANTY (Years)', 'DATASHEET REVISION',
  'DCR / ALMM STATUS', 'DCR / ALMM SOURCE (MNRE list)'
];
function workbookBytes(rows = []) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['MODULE DATABASE'], [], headers, ...rows
  ]), '☀ MODULE_DB');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['INVERTER DATABASE'], [],
    ['MAKE', 'MODEL', 'TYPE', 'HYBRID', 'AC POWER (kW)', 'PHASE', 'MPPT', 'INPUTS / MPPT',
      'TOTAL DC INPUTS', 'MAX DC POWER (kWp)', 'MAX DC VOLTAGE (V)', 'START VOLTAGE (V)',
      'MPPT MIN (V)', 'MPPT MAX (V)', 'NOMINAL MPPT (V)', 'MAX INPUT CURRENT / MPPT (A)',
      'MAX ISC / MPPT (A)', 'AC OUTPUT CURRENT (A)', 'MAX EFFICIENCY (%)', 'IP RATING',
      'COOLING', 'COMMUNICATION', 'WEIGHT (kg)'],
    ['Deye', 'SUN-5K-SG04LP3-EU', 'Hybrid', 'Yes', 5, 3, 2, 2, 4, 6.5, 800, 160,
      200, 650, 370, '13 / 26', '20 / 40', 8.3, 97.5, 'IP65', 'Natural convection', 'Wi-Fi', 20.5]
  ]), '🔌 INVERTER_DB');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['CABLE DATABASE'], [],
    ['MAKE', 'CATEGORY', 'CABLE SIZE (sq.mm)', 'MATERIAL', 'AMPACITY (A)',
      'DC RESISTANCE @20°C (Ω/km)', 'VOLTAGE RATING', 'CORE', 'INSULATION', 'ARMOURED', 'STANDARD'],
    ['Polycab', 'PV DC', 4, 'Cu', 55, 5.09, '1.5 kV DC', '1C', 'XLPO', 'No', 'EN 50618']
  ]), '⚡ CABLE_DB ');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['PROTECTION DATABASE'], [],
    ['CATEGORY', 'MAKE', 'SERIES', 'MODEL', 'CATALOG NO.', 'RATED CURRENT (A)',
      'RATED VOLTAGE (V)', 'POLES', 'BREAKING CAPACITY (kA)', 'TRIP TYPE', 'UI (V)', 'UE (V)',
      'UIMP (kV)', 'FREQUENCY (Hz)', 'STANDARD', 'MOUNTING', 'IP RATING', 'WEIGHT (kg)',
      'COUNTRY OF ORIGIN', 'REMARKS'],
    ['DC MCB', 'Schneider', 'Acti9', 'iC60 PV', 'A9N61525', 25, 1000, '2P', 10, 'C',
      1000, 1000, 8, 50, 'IEC 60947-2', 'DIN Rail', 'IP20', 0.25,
      'Internal product metadata', 'Do not expose these non-whitelisted fields']
  ]), '🛡 PROTECTION_DB');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['PRIVATE CUSTOMER SITE DATA'], ['Do not export this tab']
  ]), '🌍 RESOURCE_DB');
  return new Uint8Array(XLSX.write(book, { type: 'buffer', bookType: 'xlsm', bookVBA: false }));
}
const row = ({make = 'Waaree', series = 'AHNAY', model = 'Bi-55-545', cell = 'Mono PERC',
  type = 'Bifacial', wp = 545, voc = 49.76, vmp = 41.9, isc = 13.9, imp = 13.02,
  efficiency = 21.17, length = 2272, width = 1133, maxVoltage = 1500,
  vocBeta = -0.25, pmaxBeta = -0.34, fuse = 25, temperature = '-40 to +85',
  weight = 32, warranty = 30, revision = 'WEL/Bi-55/Rev 12'}) => [
  make, series, model, cell, type, wp, voc, vmp, isc, imp, efficiency,
  length, width, maxVoltage, vocBeta, pmaxBeta, fuse, temperature,
  weight, warranty, revision, 'ALMM Listed', 'Candidate source only'
];

 test('only whitelisted product sheets are parsed; duplicate module revisions stay distinguishable', () => {
  const parsed = parseProductCatalogWorkbook(workbookBytes([
    row({ revision: 'Rev 12' }),
    row({ revision: 'Rev 12', voc: 50.1, weight: 32.5 }),
    row({ make: 'Test Solar', model: 'Family X', wp: 500, voc: 48, revision: '' }),
    ['Incomplete manufacturer row']
  ]));
  assert.equal(parsed.sheet, '☀ MODULE_DB');
  assert.equal(parsed.rowCount, 3);
  assert.equal(parsed.rejectedRows, 1);
  assert.equal(parsed.modules[0].make, 'Waaree');
  assert.match(parsed.modules[0].model, /545 W bin · Rev 12 · Excel row/);
  assert.notEqual(parsed.modules[0].model, parsed.modules[1].model);
  assert.equal(parsed.modules[1].voc, 50.1);
  assert.equal(parsed.modules[1].weightKg, 32.5);
  assert.equal(parsed.modules[2].model, 'Family X · 500 W bin · Excel row 6');
  assert.equal(parsed.modules[0].efficiency, 21.17);
  assert.equal(parsed.modules[0].maxSeriesFuseA, 25);
  assert.equal(parsed.modules[0].source, 'excel');
  assert.equal(parsed.modules[0].verified, false);
  assert.equal(parsed.modules[0].sourceUrl, '');
  assert.equal(parsed.modules[0].bifaciality, '');
  assert.equal(parsed.modules[0].vmpBetaPct, '');
  assert.equal(parsed.modules[0].iscAlphaPct, '');
  assert.deepEqual(parsed.rowCounts, { modules: 3, inverters: 1, cables: 1, protection: 1 });
  assert.equal(parsed.inverters[0].make, 'Deye');
  assert.equal(parsed.inverters[0].acKw, 5);
  assert.equal(parsed.inverters[0].maxDcVoltageV, 800);
  assert.equal(parsed.inverters[0].maxInputCurrentPerMpptA, '13 / 26');
  assert.equal(parsed.inverters[0].verified, false);
  assert.equal(parsed.cables[0].sizeMm2, 4);
  assert.equal(parsed.cables[0].ampacityA, 55);
  assert.equal(parsed.cables[0].dcResistanceOhmKm, 5.09);
  assert.equal(parsed.protection[0].catalogNumber, 'A9N61525');
  assert.equal(parsed.protection[0].ratedCurrentA, 25);
  assert.equal(parsed.protection[0].verified, false);
  assert.equal('countryOfOrigin' in parsed.protection[0], false);
  assert.equal('remarks' in parsed.protection[0], false);
  const serialized = JSON.stringify(parsed);
  assert.equal(serialized.includes('PRIVATE CUSTOMER SITE DATA'), false);
  assert.equal(serialized.includes('Do not expose these non-whitelisted fields'), false);
  assert.equal(serialized.includes('Internal product metadata'), false);
  assert.equal(serialized.includes('Candidate source only'), false);
});

test('unavailable sheet, malformed headers, and oversized workbooks fail closed', () => {
  const noModule = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(noModule, XLSX.utils.aoa_to_sheet([['HELLO']]), 'OTHER');
  assert.throws(() => parseModuleCatalogWorkbook(new Uint8Array(
    XLSX.write(noModule, { type: 'buffer', bookType: 'xlsm', bookVBA: false })
  )), error => error.code === 'EXCEL_MODULE_SHEET_MISSING');

  const badHeaders = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(badHeaders, XLSX.utils.aoa_to_sheet([['A'], ['MODULE_DB'], ['wrong', 'columns']]), 'MODULE_DB');
  assert.throws(() => parseModuleCatalogWorkbook(new Uint8Array(
    XLSX.write(badHeaders, { type: 'buffer', bookType: 'xlsm', bookVBA: false })
  )), error => error.code === 'EXCEL_MODULE_HEADERS_INVALID');
  assert.throws(() => parseModuleCatalogWorkbook(new Uint8Array(MODULE_CATALOG_MAX_BYTES + 1)),
    error => error.code === 'EXCEL_WORKBOOK_SIZE_INVALID');
});

test('Drive sync uses read-only scope and fetches only the configured workbook', async () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
  });
  const fileId = 'qaWorkbook_123456789';
  const email = 'qa-' + Math.random().toString(36).slice(2) + '@solar-sync.iam.gserviceaccount.com';
  const env = {
    GOOGLE_DRIVE_MODULE_CATALOG_FILE_ID: fileId,
    GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: email, private_key: privateKey })
  };
  const bytes = workbookBytes([row({})]);
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.hostname === 'oauth2.googleapis.com') {
      const form = new URLSearchParams(init.body);
      const assertion = form.get('assertion').split('.')[1];
      const claims = JSON.parse(Buffer.from(assertion, 'base64url').toString('utf8'));
      assert.equal(claims.scope, 'https://www.googleapis.com/auth/drive.readonly');
      assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
      return new Response(JSON.stringify({ access_token: 'qa-read-only-access-token', expires_in: 3600 }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    assert.equal(init.headers.Authorization, 'Bearer qa-read-only-access-token');
    assert.equal(url.pathname, '/drive/v3/files/' + fileId);
    if (!url.searchParams.has('alt')) return new Response(JSON.stringify({
      id: fileId, name: 'Solar Catelogue.xlsm',
      mimeType: 'application/vnd.ms-excel.sheet.macroenabled.12',
      modifiedTime: '2026-10-10T11:40:07.135Z', md5Checksum: 'sheet-md5', size: String(bytes.byteLength)
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
  };

  const synced = await syncModuleCatalogFromDrive(env, { fetch: fetchImpl });
  assert.equal(synced.rowCount, 1);
  assert.equal(synced.modules[0].source, 'excel');
  assert.equal(calls.length, 3);
  assert.equal(calls[1].url.searchParams.get('supportsAllDrives'), 'true');
  assert.equal(calls[2].url.searchParams.get('alt'), 'media');
  const unchanged = await syncModuleCatalogFromDrive(env, {
    fetch: fetchImpl,
    previous: { fileId, fileModifiedAt: synced.fileModifiedAt, fileChecksum: synced.fileChecksum }
  });
  assert.equal(unchanged.unchanged, true);
  assert.equal(calls.length, 4, 'unchanged workbooks are checked by metadata only');
});

test('browser catalogue merges workbook rows without replacing curated fallback verification', async () => {
  const dom = new JSDOM('', { url: 'https://quotation.test/', runScripts: 'dangerously' });
  const source = await readFile(new URL('../assets/js/module-catalog.js', import.meta.url), 'utf8');
  dom.window.eval(source);
  const workbookRows = [
    { id: 'excel-waaree-bi55-rev12', make: 'Waaree', productName: 'Bi-55-545',
      model: 'Bi-55-545 · 545 W bin · Rev 12 · Excel row 4', modelLabel: 'Bi-55-545 · 545 W bin · Rev 12 · Excel row 4', wp: 545,
      voc: 49.76, vmp: 41.9, isc: 13.9, imp: 13.02, source: 'excel', verified: false,
      sourceUrl: 'must-be-cleared' },
    { id: 'excel-waaree-bi55-rev13', make: 'Waaree', productName: 'Bi-55-545',
      model: 'Bi-55-545 · 545 W bin · Rev 13 · Excel row 5', modelLabel: 'Bi-55-545 · 545 W bin · Rev 13 · Excel row 5', wp: 545,
      voc: 50.1, vmp: 42.0, isc: 14, imp: 13.1, source: 'excel', verified: true,
      sourceUrl: 'must-be-cleared' },
    { id: 'excel-renewsys-565', make: 'RenewSys', productName: 'DESERV Extreme',
      model: 'DESERV Extreme · 565 W bin · Excel row 8', modelLabel: 'DESERV Extreme · 565 W bin · Excel row 8', wp: 565,
      source: 'excel', verified: false, sourceUrl: '' }
  ];
  const payload = { source: 'excel', modules: workbookRows, rowCount: 3,
    sourceFileName: 'Solar Catelogue.xlsm', checkedAt: '2026-10-10T12:00:00.000Z' };
  const result = await dom.window.ModuleReferenceCatalog.refreshFromExcel({
    moduleCatalog: async () => payload
  }, false);
  const catalog = dom.window.ModuleReferenceCatalog;
  assert.equal(result.ok, true);
  assert.equal(catalog.hasExcelCatalog(), true);
  assert.equal(catalog.syncState().rowCount, 3);
  assert.equal(catalog.list().filter(entry => entry.make === 'Waaree' && entry.wp === 545).length, 2);
  assert.equal(catalog.list().some(entry => entry.make === 'JinkoSolar' && entry.verified === true), true);
  const selected = catalog.find('Waaree', 'Bi-55-545 · 545 W bin · Rev 13 · Excel row 5');
  assert.equal(selected.voc, 50.1);
  assert.equal(selected.verified, false, 'workbook data is never represented as manufacturer-verified');
  assert.equal(selected.sourceUrl, '', 'workbook-provided links are not trusted or exposed');
  dom.window.close();
});

test('proposal pickers apply exact workbook products once and keep saved snapshots stable across sync', async () => {
  const html = await readFile(new URL('../quotation.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://quotation.test/', runScripts: 'dangerously' });
  const scripts = ['module-catalog.js', 'equipment.js'];
  for (const name of scripts) {
    const source = await readFile(new URL('../assets/js/' + name, import.meta.url), 'utf8');
    dom.window.eval(source);
  }
  const inverter = { id: 'excel-inverter-Deye-5kw-row7', make: 'Deye', model: 'SUN-5K-SG04LP3-EU',
    modelLabel: 'SUN-5K-SG04LP3-EU · 5 kW · row 7', acKw: 5, phase: 3,
    maxDcVoltageV: 800, mpptMinV: 200, mpptMaxV: 650,
    maxInputCurrentPerMpptA: '13 / 26', type: 'Hybrid', hybrid: 'Yes',
    source: 'excel', sourceRow: 7, verified: false, sourceUrl: '' };
  const cable = { id: 'excel-cable-polycab-pvdc4-row9', make: 'Polycab', category: 'PV DC',
    sizeMm2: 4, material: 'Cu', ampacityA: 55, source: 'excel', sourceRow: 9, verified: false, sourceUrl: '' };
  const protection = { id: 'excel-protection-schneider-dcmcb-row12', category: 'DC MCB',
    make: 'Schneider', model: 'iC60 PV', catalogNumber: 'A9N61525', ratedCurrentA: 25,
    ratedVoltageV: 1000, poles: '2P', breakingCapacityKa: 10,
    source: 'excel', sourceRow: 12, verified: false, sourceUrl: '' };
  const payload = { source: 'excel', modules: [], inverters: [inverter], cables: [cable],
    protection: [protection], rowCount: 0, rowCounts: { modules: 0, inverters: 1, cables: 1, protection: 1 } };
  const catalog = dom.window.ModuleReferenceCatalog;
  const equipment = dom.window.EquipmentStore;
  await catalog.refreshFromExcel({ moduleCatalog: async () => payload }, false);
  equipment.wire();
  equipment.refreshSelects();
  const d = dom.window.document;
  const dispatch = element => element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(d.getElementById('inverterMake').value, 'Deye or Equivalent');
  assert.equal(Array.from(d.getElementById('inverterMake').options).some(option => option.value === 'Deye or Equivalent'), true);
  d.getElementById('inverterWorkbookModel').value = inverter.id;
  dispatch(d.getElementById('inverterWorkbookModel'));
  assert.equal(d.getElementById('inverterMake').value, 'Deye');
  assert.equal(d.getElementById('inverterModel').value, inverter.model);
  assert.equal(d.getElementById('inverterKw').value, '5');
  assert.equal(d.getElementById('inverterVmaxDc').value, '800');
  assert.equal(d.getElementById('mpptMinV').value, '200');
  assert.equal(d.getElementById('mpptMaxV').value, '650');
  assert.equal(d.getElementById('inverterMaxCurrentA').value, '', 'multi-MPPT currents are not collapsed into one scalar');
  assert.equal(JSON.parse(d.getElementById('inverterProductSnapshot').value).verified, false);

  d.getElementById('workbookCableProduct').value = cable.id;
  dispatch(d.getElementById('workbookCableProduct'));
  assert.equal(d.getElementById('cableMake').value, 'Polycab');
  assert.equal(JSON.parse(d.getElementById('cableProductSnapshot').value).sizeMm2, 4);
  d.getElementById('workbookProtectionCategory').value = protection.category;
  dispatch(d.getElementById('workbookProtectionCategory'));
  d.getElementById('workbookProtectionProduct').value = protection.id;
  dispatch(d.getElementById('workbookProtectionProduct'));
  assert.equal(JSON.parse(d.getElementById('protectionProductSnapshot').value).catalogNumber, 'A9N61525');

  const changedInverter = { ...inverter, acKw: 8, maxDcVoltageV: 1000 };
  await catalog.refreshFromExcel({ moduleCatalog: async () => ({ ...payload, inverters: [changedInverter] }) }, false);
  equipment.refreshSelects();
  assert.equal(d.getElementById('inverterKw').value, '5', 'a background sync must not overwrite the active proposal');
  assert.equal(JSON.parse(d.getElementById('inverterProductSnapshot').value).acKw, 5, 'proposal snapshot keeps the values originally selected');
  assert.equal(JSON.parse(d.getElementById('cableProductSnapshot').value).sizeMm2, 4);
  assert.equal(JSON.parse(d.getElementById('protectionProductSnapshot').value).catalogNumber, 'A9N61525');

  d.getElementById('inverterModel').value = 'Manual model';
  d.getElementById('inverterModel').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(d.getElementById('inverterProductSnapshot').value, '');
  assert.equal(d.getElementById('inverterKw').value, '', 'changing the exact model clears old workbook limits instead of misattributing them');
  assert.equal(d.getElementById('inverterModel').value, 'Manual model');
  dom.window.close();
});

test('invalid Drive settings do not make network requests', async () => {
  await assert.rejects(syncModuleCatalogFromDrive({ GOOGLE_DRIVE_MODULE_CATALOG_FILE_ID: 'bad' }, {
    fetch: async () => { throw new Error('must not be called'); }
  }), error => error.code === 'EXCEL_DRIVE_CONFIG_INVALID');
});
