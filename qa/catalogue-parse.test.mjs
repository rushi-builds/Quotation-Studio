/* Catalogue sync pipeline tests (worker side).
   Run: node qa/catalogue-parse.test.mjs
   Covers: xlsm zip/XML parsing, PS-exact extraction mapping, D1 store/read
   round-trip, Drive fetch (public mode via stubbed fetch), and failure paths. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  parseSheetXml, parseSharedStrings, resolveSheets,
  extractCatalogue, fetchCatalogueWorkbook, storeCatalogue, readCatalogue, syncCatalogue
} from '../platform/cloudflare/src/catalogue.mjs';

const FIXTURE = readFileSync(new URL('./fixtures/catalogue-fixture.xlsm', import.meta.url));
const FIXTURE_SHA = createHash('sha256').update(FIXTURE).digest('hex');

/* In-memory stand-in for the D1 binding contract used by storeCatalogue.
   Like real D1, one prepared statement accumulates bind() sets and run()
   applies every set. */
function memDb() {
  const rows = [];
  const meta = new Map();
  return {
    rows, meta,
    prepare(sql) {
      const stmt = {
        sql, bindings: [],
        bind(...params) { stmt.bindings.push(params); return stmt; },
        async run() {
          for (const p of stmt.bindings) {
            if (sql.includes('DELETE FROM equipment_catalogue')) rows.length = 0;
            else if (sql.includes('INSERT INTO equipment_catalogue')) rows.push({ kind: p[0], make: p[1], model: p[2], row_json: p[3] });
            else if (sql.includes('INSERT OR REPLACE INTO equipment_catalogue_meta')) meta.set(p[0], p[1]);
          }
          return { success: true };
        },
        async all() {
          if (sql.includes('equipment_catalogue_meta')) return { results: [...meta.entries()].map(([key, value]) => ({ key, value })) };
          if (sql.includes('FROM equipment_catalogue')) return { results: [...rows].sort((a, b) => a.kind.localeCompare(b.kind) || a.make.localeCompare(b.make) || a.model.localeCompare(b.model)) };
          return { results: [] };
        },
        async first() { return (await stmt.all()).results[0] || null; }
      };
      return stmt;
    },
    async batch(stmts) { for (const s of stmts) await s.run(); }
  };
}

test('extractCatalogue mirrors the PowerShell mapping on the fixture workbook', async () => {
  const cat = await extractCatalogue(FIXTURE, 'catalogue-fixture.xlsm');
  assert.equal(cat.modules.length, 2, 'orphan row (model but no make) skipped');
  assert.equal(cat.inverters.length, 2, 'pre-table junk row ignored');
  assert.equal(cat.cables.length, 1, 'empty-make cable row skipped');

  const m0 = cat.modules[0];
  assert.deepEqual(
    { make: m0.make, series: m0.series, model: m0.model, cellType: m0.cellType, moduleType: m0.moduleType },
    { make: 'Waaree', series: 'AHNAY', model: 'Bi-55-520', cellType: 'Mono PERC', moduleType: 'Bifacial' }
  );
  assert.equal(m0.wp, 520); assert.equal(m0.voc, 49.01); assert.equal(m0.vmp, 41.9);
  assert.equal(m0.isc, 13.9); assert.equal(m0.imp, 13.02); assert.equal(m0.efficiency, 21.17);
  assert.equal(m0.lengthMm, 2272); assert.equal(m0.widthMm, 1133); assert.equal(m0.maxSystemV, 1500);
  assert.equal(m0.tempCoefVoc, -0.25); assert.equal(m0.tempCoefPmax, -0.34);
  assert.equal(m0.maxSeriesFuse, 30); assert.equal(m0.weightKg, 32); assert.equal(m0.warrantyYr, 30);
  assert.equal(m0.almm, 'ALMM Listed');
  assert.equal(cat.modules[1].model, 'Bi-55-545');
  assert.equal(cat.modules[1].wp, 545);

  const i0 = cat.inverters[0];
  assert.equal(i0.make, 'Sungrow'); assert.equal(i0.model, 'SG7.0RT');
  assert.equal(i0.invType, 'String'); assert.equal(i0.hybrid, 'No');
  assert.equal(i0.kw, 7); assert.equal(i0.phase, 3); assert.equal(i0.mppt, 2);
  assert.equal(i0.inputsPerMppt, 2); assert.equal(i0.totalDcInputs, 4); assert.equal(i0.maxDcKw, 10.5);
  assert.equal(i0.vmaxDc, 1100); assert.equal(i0.startV, 160); assert.equal(i0.mpptMin, 160);
  assert.equal(i0.mpptMax, 1000); assert.equal(i0.nominalMppt, 585);
  /* PS keeps these as Clean() strings, even when they look numeric. */
  assert.equal(i0.maxCurrentA, '26'); assert.equal(i0.maxIscA, '54');
  assert.equal(i0.acOutputA, 10.6); assert.equal(i0.efficiency, 98.2);
  assert.equal(i0.ip, 'IP66'); assert.equal(i0.weightKg, 16);
  assert.equal(cat.inverters[1].make, 'Growatt');
  assert.equal(cat.inverters[1].model, 'MOD 7000TL3-X');
  assert.equal(cat.inverters[1].mpptMin, 140); assert.equal(cat.inverters[1].maxIscA, '16');

  const c0 = cat.cables[0];
  assert.equal(c0.make, 'Polycab'); assert.equal(c0.category, 'DC Cable');
  assert.equal(c0.size, 4); assert.equal(c0.material, 'Copper');
  assert.equal(c0.ampacity, 44); assert.equal(c0.resistance, 4.61);
  assert.equal(c0.voltage, '1.5 kV'); assert.equal(c0.core, '1C');
  assert.equal(c0.insulation, 'XLPE'); assert.equal(c0.armoured, 'No'); assert.equal(c0.standard, 'IS 694');
  assert.equal(cat.sha, FIXTURE_SHA, 'sha256 pinned to the fixture bytes');
});

test('parser primitives: shared strings, inline strings, entities, sheet resolution', () => {
  const shared = parseSharedStrings('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3"><si><t>Waaree</t></si><si><t>1C</t></si><si><t>Fish &amp; chips &#62; &#x3E;</t></si></sst>');
  assert.equal(shared[0], 'Waaree');
  assert.equal(shared[1], '1C');
  assert.equal(shared[2], 'Fish & chips > >', 'numeric and named entities decoded');
  const enc = (s) => new TextEncoder().encode(s);
  const workbook = '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="CABLE_DB" sheetId="3" r:id="rId3"/><sheet name="MODULE_DB" sheetId="1" r:id="rId1"/><sheet name="INVERTER_DB" sheetId="2" r:id="rId2"/></sheets></workbook>';
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/></Relationships>';
  const sheets = resolveSheets(new Map([['xl/workbook.xml', enc(workbook)], ['xl/_rels/workbook.xml.rels', enc(rels)]]));
  assert.deepEqual([...sheets.keys()].sort(), ['CABLE_DB', 'INVERTER_DB', 'MODULE_DB']);
  assert.equal(sheets.get('MODULE_DB'), 'xl/worksheets/sheet1.xml');
  assert.equal(sheets.get('INVERTER_DB'), 'xl/worksheets/sheet2.xml', 'leading-slash target normalised');
  const rows = parseSheetXml('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="5"><c r="A5" t="s"><v>0</v></c><c r="F5"><v>520</v></c><c r="V5" t="inlineStr"><is><t>ALMM &amp; DCR</t></is></c><c r="W5" s="1"/></row></sheetData></worksheet>', shared);
  assert.equal(rows.get(5).get(1), 'Waaree', 'shared-string cell decoded');
  assert.equal(rows.get(5).get(6), '520', 'numeric cell kept as string, numOf converts later');
  assert.equal(rows.get(5).get(22), 'ALMM & DCR', 'inlineStr cell with entity decoded');
  assert.equal(rows.get(5).has(23), false, 'empty self-closing cell dropped');
});

test('storeCatalogue -> readCatalogue round-trips rows and meta through the D1 contract', async () => {
  const db = memDb();
  const cat = await extractCatalogue(FIXTURE, 'catalogue-fixture.xlsm');
  const counts = await storeCatalogue(db, cat, { syncedAt: '2026-10-13T10:00:00.000Z', source: 'fixture' });
  assert.deepEqual(counts, { modules: 2, inverters: 2, cables: 1 });
  assert.equal(db.rows.length, 5);
  assert.deepEqual(db.meta.get('counts'), JSON.stringify({ modules: 2, inverters: 2, cables: 1 }));
  assert.equal(db.meta.get('sha'), FIXTURE_SHA);
  const back = await readCatalogue(db);
  assert.equal(back.syncedAt, '2026-10-13T10:00:00.000Z');
  assert.equal(back.source, 'fixture');
  assert.equal(back.sha, FIXTURE_SHA);
  assert.equal(back.modules.length, 2);
  assert.equal(back.modules[1].model, 'Bi-55-545');
  assert.equal(back.inverters.find((r) => r.make === 'Sungrow').maxIscA, '54');
  assert.equal(back.inverters.find((r) => r.make === 'Growatt').maxIscA, '16');
  assert.equal(back.cables[0].standard, 'IS 694');
  assert.deepEqual(back.counts, { modules: 2, inverters: 2, cables: 1 });
  assert.equal(await readCatalogue(memDb()), null, 'never-synced db reads as null');
});

test('syncCatalogue full pipeline with a stubbed public Drive download', async () => {
  const realFetch = globalThis.fetch;
  const db = memDb();
  let requested = '';
  globalThis.fetch = async (url) => {
    requested = String(url);
    if (requested.includes('drive.google.com/uc')) return new Response(FIXTURE, { status: 200 });
    throw new Error('unexpected fetch ' + requested);
  };
  try {
    const result = await syncCatalogue({ GDRIVE_MODE: 'public', GDRIVE_FILE_ID: 'fixture-file-id' }, db);
    assert.ok(requested.includes('export=download&id=fixture-file-id'));
    assert.equal(result.counts.modules, 2);
    assert.equal(result.counts.inverters, 2);
    assert.equal(result.counts.cables, 1);
    assert.equal(result.sha, FIXTURE_SHA);
    assert.ok(result.syncedAt);
    assert.equal(result.catalogue.modules.length, 2);
    assert.equal((await readCatalogue(db)).modules.length, 2);
  } finally { globalThis.fetch = realFetch; }
});

test('service-account mode parses GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON and signs the token', async () => {
  const realFetch = globalThis.fetch;
  const { generateKeyPairSync } = await import('node:crypto');
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = { client_email: 'catalogue@project.iam.gserviceaccount.com', private_key: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), project_id: 'proj' };
  let tokenBody = '', driveAuth = '';
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      tokenBody = String(options.body);
      return Response.json({ access_token: 'drive-token' });
    }
    if (String(url).includes('drive/v3/files/fixture-file-id')) {
      driveAuth = String((options.headers || {}).Authorization || '');
      return new Response(FIXTURE, { status: 200 });
    }
    throw new Error('unexpected fetch ' + url);
  };
  try {
    const result = await syncCatalogue({ GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: JSON.stringify(sa), GDRIVE_FILE_ID: 'fixture-file-id' }, memDb());
    const assertion = new URLSearchParams(tokenBody).get('assertion');
    const payload = JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString());
    assert.equal(payload.iss, sa.client_email);
    assert.equal(payload.scope, 'https://www.googleapis.com/auth/drive.readonly');
    assert.equal(driveAuth, 'Bearer drive-token');
    assert.equal(result.counts.modules, 2);
    assert.equal(result.sha, FIXTURE_SHA);
  } finally { globalThis.fetch = realFetch; }
});

test('fetchCatalogueWorkbook fails closed without configuration', async () => {
  await assert.rejects(() => fetchCatalogueWorkbook({}), (e) => e.code === 'NOT_CONFIGURED' && /GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON secret missing/.test(e.message));
  await assert.rejects(() => fetchCatalogueWorkbook({ GDRIVE_MODE: 'public' }), (e) => e.code === 'NOT_CONFIGURED' && /GDRIVE_FILE_ID missing/.test(e.message));
  await assert.rejects(() => fetchCatalogueWorkbook({ GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: 'not json' }), (e) => e.code === 'NOT_CONFIGURED' && /not valid JSON/.test(e.message));
  await assert.rejects(() => fetchCatalogueWorkbook({ GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: '{}', GDRIVE_FILE_ID: 'x' }), (e) => e.code === 'NOT_CONFIGURED' && /secret missing/.test(e.message));
});

test('corrupt input and missing sheets are rejected with clear errors', async () => {
  await assert.rejects(() => extractCatalogue(new Uint8Array([1, 2, 3, 4]), 'junk'), /Not a zip file/);
  /* A store-only zip whose workbook has no *_DB sheets. */
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (const b of u8) c = crcTable[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const zipStore = (entries) => {
    const enc = new TextEncoder();
    const parts = []; const central = []; let offset = 0;
    for (const { name, data } of entries) {
      const nb = enc.encode(name);
      const local = new Uint8Array(30 + nb.length);
      const dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true);
      dv.setUint32(14, crc32(data), true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
      dv.setUint16(26, nb.length, true);
      local.set(nb, 30);
      const cd = new Uint8Array(46 + nb.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint32(16, crc32(data), true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, nb.length, true); cv.setUint32(42, offset, true);
      cd.set(nb, 46);
      parts.push(local, data); central.push(cd);
      offset += local.length + data.length;
    }
    let cdSize = 0; for (const c of central) cdSize += c.length;
    const tail = new Uint8Array(22);
    const tv = new DataView(tail.buffer);
    tv.setUint32(0, 0x06054b50, true); tv.setUint16(8, central.length, true); tv.setUint16(10, central.length, true);
    tv.setUint32(12, cdSize, true); tv.setUint32(16, offset, true);
    return new Uint8Array([...parts.flatMap((p) => [...p]), ...central.flatMap((c) => [...c]), ...tail]);
  };
  const workbook = '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="OTHER" sheetId="1" r:id="rId1"/></sheets></workbook>';
  const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
  const sheet = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>';
  const bytes = zipStore([
    { name: 'xl/workbook.xml', data: enc2(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc2(rels) },
    { name: 'xl/worksheets/sheet1.xml', data: enc2(sheet) }
  ]);
  await assert.rejects(() => extractCatalogue(bytes, 'wrong-book'), /MODULE_DB sheet not found/);
  function enc2(s) { return new TextEncoder().encode(s); }
});
