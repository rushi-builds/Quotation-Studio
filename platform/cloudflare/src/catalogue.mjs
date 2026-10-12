/* ============================================================================
   Quotation Studio — equipment catalogue sync (Google Drive .xlsm -> D1)
   ----------------------------------------------------------------------------
   On-demand sync, never polling: POST /api/catalogue/sync reads the Excel
   workbook once from Drive, extracts the three catalogue tables and stores
   them in D1. The app's built-in catalogue-data.js stays as the fallback.

   Extraction mirrors patch_work/qs_studio/extract_catalogue.ps1 exactly:
     MODULE_DB   tblModule  rows 5..316,   cols 1..22
     INVERTER_DB tblInv     rows 6..145,   cols 1..23
     CABLE_DB    tblCable   rows 6..113,   cols 1..11
   ============================================================================ */
'use strict';

import { createSign, createHash } from 'node:crypto';

export const KIND_SPECS = {
  modules:   { sheet: 'MODULE_DB',   from: 5,   to: 316 },
  inverters: { sheet: 'INVERTER_DB', from: 6,   to: 145 },
  cables:    { sheet: 'CABLE_DB',    from: 6,   to: 113 }
};

/* ---------------- tiny xlsm (zip) reader ---------------- */

async function unzipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65536; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file (no end-of-central-directory record).');
  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) throw new Error('Corrupt zip central directory.');
    const method = dv.getUint16(off + 10, true);
    const compressedSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOffset = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen));
    if (dv.getUint32(localOffset, true) !== 0x04034b50) throw new Error('Corrupt zip local header for ' + name);
    const lNameLen = dv.getUint16(localOffset + 26, true);
    const lExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    entries.push({ name, method, compressedSize, dataStart });
    off += 46 + nameLen + extraLen + commentLen;
  }
  const out = new Map();
  for (const e of entries) {
    const raw = bytes.subarray(e.dataStart, e.dataStart + e.compressedSize);
    let data;
    if (e.method === 0) data = raw;
    else if (e.method === 8) {
      const ds = new DecompressionStream('deflate-raw');
      const stream = new Blob([raw]).stream().pipeThrough(ds);
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error('Unsupported zip compression method ' + e.method + ' for ' + e.name);
    out.set(e.name, data);
  }
  return out;
}

function decodeXml(u8) { return new TextDecoder('utf-8').decode(u8); }

function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return '?'; } })
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch { return '?'; } })
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function attrsOf(tag) {
  const out = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(tag))) out[m[1]] = decodeEntities(m[2]);
  return out;
}

function colIndex(ref) {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/* Returns sheets as a Map: name -> Map(rowNumber -> Map(colNumber -> value)). */
export function parseSheetXml(xml, sharedStrings) {
  const rows = new Map();
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = cellRe.exec(xml))) {
    const attrs = attrsOf(m[1]);
    const ref = attrs.r;
    if (!ref) continue;
    const col = colIndex(ref.replace(/\d+$/, ''));
    const row = parseInt(ref.replace(/^[A-Z]+/, ''), 10);
    const inner = m[2] || '';
    let value = null;
    if (attrs.t === 'inlineStr') {
      const t = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(inner);
      if (t) value = decodeEntities(t[1]);
    } else {
      const v = /<v>([^<]*)<\/v>/.exec(inner);
      if (v) {
        if (attrs.t === 's') value = sharedStrings[parseInt(v[1], 10)] != null ? sharedStrings[parseInt(v[1], 10)] : null;
        else value = decodeEntities(v[1]);
      }
    }
    if (value === null || value === '') continue;
    let rowMap = rows.get(row);
    if (!rowMap) { rowMap = new Map(); rows.set(row, rowMap); }
    rowMap.set(col, value);
  }
  return rows;
}

export function parseSharedStrings(xml) {
  const out = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = siRe.exec(xml))) {
    let text = '';
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRe.exec(m[1]))) text += t[1];
    out.push(decodeEntities(text));
  }
  return out;
}

/* Maps workbook.xml + rels to { sheetName -> xmlPath }. */
export function resolveSheets(entries) {
  const workbook = decodeXml(entries.get('xl/workbook.xml'));
  const rels = decodeXml(entries.get('xl/_rels/workbook.xml.rels'));
  const relTargets = new Map();
  let m;
  const relRe = /<Relationship\b([^>]*?)\/?>/g;
  while ((m = relRe.exec(rels))) {
    const a = attrsOf(m[1]);
    if (a.Id && a.Target) relTargets.set(a.Id, a.Target);
  }
  const sheets = new Map();
  const sheetRe = /<sheet\b([^>]*?)\/?>/g;
  while ((m = sheetRe.exec(workbook))) {
    const a = attrsOf(m[1]);
    if (!a.name || !a['r:id']) continue;
    let target = relTargets.get(a['r:id']);
    if (!target) continue;
    target = target.replace(/^\//, '');
    if (!target.startsWith('xl/')) target = 'xl/' + target;
    sheets.set(a.name, target);
  }
  return sheets;
}

/* ---------------- extraction (mirrors extract_catalogue.ps1) ---------------- */

const CLEAN_RE = /[^\x20-\x7E]/g;

function numOf(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const d = Number(s);
  return Number.isFinite(d) ? d : s;
}
function txtOf(v) { return v == null ? '' : String(v).replace(CLEAN_RE, '?').trim(); }

function extractTable(rowsByRow, kind) {
  const spec = KIND_SPECS[kind];
  const out = [];
  for (let r = spec.from; r <= spec.to; r++) {
    const row = rowsByRow.get(r);
    if (!row) continue;
    const cell = (c) => (row.get(c) == null ? null : row.get(c));
    if (kind === 'modules') {
      const make = txtOf(cell(1)), model = txtOf(cell(3)), wp = numOf(cell(6));
      if (!make || !model || wp == null) continue;
      out.push({
        make, series: txtOf(cell(2)), model,
        cellType: txtOf(cell(4)), moduleType: txtOf(cell(5)), wp,
        voc: numOf(cell(7)), vmp: numOf(cell(8)), isc: numOf(cell(9)), imp: numOf(cell(10)),
        efficiency: numOf(cell(11)), lengthMm: numOf(cell(12)), widthMm: numOf(cell(13)),
        maxSystemV: numOf(cell(14)), tempCoefVoc: numOf(cell(15)), tempCoefPmax: numOf(cell(16)),
        maxSeriesFuse: numOf(cell(17)), weightKg: numOf(cell(19)), warrantyYr: numOf(cell(20)),
        almm: txtOf(cell(22))
      });
    } else if (kind === 'inverters') {
      const make = txtOf(cell(1)), model = txtOf(cell(2));
      if (!make || !model) continue;
      out.push({
        make, model,
        invType: txtOf(cell(3)), hybrid: txtOf(cell(4)), kw: numOf(cell(5)), phase: numOf(cell(6)),
        mppt: numOf(cell(7)), inputsPerMppt: numOf(cell(8)), totalDcInputs: numOf(cell(9)),
        maxDcKw: numOf(cell(10)), vmaxDc: numOf(cell(11)), startV: numOf(cell(12)),
        mpptMin: numOf(cell(13)), mpptMax: numOf(cell(14)), nominalMppt: numOf(cell(15)),
        maxCurrentA: txtOf(cell(16)), maxIscA: txtOf(cell(17)), acOutputA: numOf(cell(18)),
        efficiency: numOf(cell(19)), ip: txtOf(cell(20)), weightKg: numOf(cell(23))
      });
    } else {
      const make = txtOf(cell(1));
      if (!make) continue;
      out.push({
        make, category: txtOf(cell(2)), size: numOf(cell(3)), material: txtOf(cell(4)),
        ampacity: numOf(cell(5)), resistance: numOf(cell(6)), voltage: txtOf(cell(7)),
        core: txtOf(cell(8)), insulation: txtOf(cell(9)), armoured: txtOf(cell(10)),
        standard: txtOf(cell(11))
      });
    }
  }
  return out;
}

/* Full pipeline: bytes of the .xlsm -> { modules, inverters, cables }. */
export async function extractCatalogue(buffer, fileName) {
  const entries = await unzipEntries(buffer);
  const sheets = resolveSheets(entries);
  const shared = parseSharedStrings(entries.has('xl/sharedStrings.xml') ? decodeXml(entries.get('xl/sharedStrings.xml')) : '');
  const pick = (suffix) => {
    const name = [...sheets.keys()].find((n) => String(n).trim().endsWith(suffix));
    return name ? sheets.get(name) : null;
  };
  const read = (kind) => {
    const path = pick(KIND_SPECS[kind].sheet);
    if (!path || !entries.has(path)) throw new Error(KIND_SPECS[kind].sheet + ' sheet not found in ' + (fileName || 'workbook'));
    return parseSheetXml(decodeXml(entries.get(path)), shared);
  };
  const modules = extractTable(read('modules'), 'modules');
  const inverters = extractTable(read('inverters'), 'inverters');
  const cables = extractTable(read('cables'), 'cables');
  if (!modules.length || !inverters.length || !cables.length) {
    throw new Error('Catalogue extraction came back empty (modules=' + modules.length + ', inverters=' + inverters.length + ', cables=' + cables.length + '). Wrong workbook?');
  }
  const sha = createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
  return { modules, inverters, cables, sha, fileName: fileName || '' };
}

/* ---------------- Google Drive fetch ---------------- */

function notConfigured(what) {
  const e = new Error('Catalogue sync is not configured: ' + what +
    '. Set GDRIVE_SA_EMAIL + GDRIVE_SA_KEY (+ GDRIVE_FILE_ID or GDRIVE_FOLDER_ID) worker secrets, or GDRIVE_MODE=public with GDRIVE_FILE_ID.');
  e.code = 'NOT_CONFIGURED';
  return e;
}

function b64url(s) { return Buffer.from(s).toString('base64url'); }

async function serviceAccountToken(email, pem) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const sign = createSign('RSA-SHA256');
  sign.update(header + '.' + claims);
  const assertion = header + '.' + claims + '.' + sign.sign(pem, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error('Google Drive token failed (' + res.status + '): ' + (data.error_description || data.error || 'unknown'));
  return data.access_token;
}

async function findInFolder(folderId, token) {
  const q = "name contains 'Solar_EPC' and '" + folderId + "' in parents and mimeType != 'application/vnd.google-apps.folder'";
  const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
    '&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime%20desc&pageSize=10';
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Google Drive search failed (' + res.status + '): ' + (data.error && data.error.message || 'unknown'));
  const hit = (data.files || []).find((f) => /\.xlsm$/i.test(f.name));
  if (!hit) throw new Error('No Solar_EPC *.xlsm workbook found in the Drive folder. Check that the Desktop → Drive sync has run.');
  return hit.id;
}

/* Returns the raw workbook bytes; throws NOT_CONFIGURED when secrets are unset. */
export async function fetchCatalogueWorkbook(env) {
  const mode = String(env.GDRIVE_MODE || 'service').toLowerCase();
  if (mode === 'public') {
    const id = env.GDRIVE_FILE_ID;
    if (!id) throw notConfigured('GDRIVE_FILE_ID missing (public mode)');
    const res = await fetch('https://drive.google.com/uc?export=download&id=' + encodeURIComponent(id));
    if (!res.ok) throw new Error('Drive download failed (' + res.status + '). Is the file shared as "Anyone with the link"?');
    return { bytes: new Uint8Array(await res.arrayBuffer()), name: 'Solar_EPC (Drive public link)' };
  }
  const email = env.GDRIVE_SA_EMAIL, key = env.GDRIVE_SA_KEY;
  if (!email || !key) throw notConfigured('service-account secrets missing');
  const token = await serviceAccountToken(email, key);
  let id = env.GDRIVE_FILE_ID;
  let name = 'Solar_EPC (Drive file ' + String(id).slice(0, 8) + ')';
  if (!id && env.GDRIVE_FOLDER_ID) {
    id = await findInFolder(env.GDRIVE_FOLDER_ID, token);
    name = 'Solar_EPC (Drive folder search)';
  }
  if (!id) throw notConfigured('neither GDRIVE_FILE_ID nor GDRIVE_FOLDER_ID set');
  const res = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media', {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('Drive download failed (' + res.status + '). Share the workbook with the service account email.');
  return { bytes: new Uint8Array(await res.arrayBuffer()), name };
}

/* ---------------- D1 storage ---------------- */

export async function storeCatalogue(db, catalogue, meta) {
  const rows = [];
  const add = (kind, list) => list.forEach((r) => rows.push([kind, String(r.make || r.label || ''), String(r.model || r.make || ''), JSON.stringify(r)]));
  add('modules', catalogue.modules);
  add('inverters', catalogue.inverters);
  add('cables', catalogue.cables);
  await db.prepare('DELETE FROM equipment_catalogue').run();
  const stmts = [];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const stmt = db.prepare('INSERT INTO equipment_catalogue (kind, make, model, row_json) VALUES (?, ?, ?, ?)');
    chunk.forEach((r) => stmt.bind(...r));
    stmts.push(stmt);
  }
  if (stmts.length) await db.batch(stmts);
  const put = db.prepare('INSERT OR REPLACE INTO equipment_catalogue_meta (key, value) VALUES (?, ?)');
  const metaRows = [
    ['sha', String(catalogue.sha || '')],
    ['syncedAt', String(meta.syncedAt || new Date().toISOString())],
    ['source', String(meta.source || catalogue.fileName || '')],
    ['counts', JSON.stringify({ modules: catalogue.modules.length, inverters: catalogue.inverters.length, cables: catalogue.cables.length })]
  ];
  await db.batch(metaRows.map(([k, v]) => put.bind(k, v)));
  return { modules: catalogue.modules.length, inverters: catalogue.inverters.length, cables: catalogue.cables.length };
}

export async function readCatalogue(db) {
  const metaRes = await db.prepare("SELECT key, value FROM equipment_catalogue_meta").all();
  const meta = {};
  for (const r of metaRes.results || []) meta[r.key] = r.value;
  if (!meta.syncedAt) return null;
  const rowsRes = await db.prepare('SELECT kind, row_json FROM equipment_catalogue ORDER BY kind, make, model').all();
  const out = { modules: [], inverters: [], cables: [], syncedAt: meta.syncedAt, source: meta.source || '', sha: meta.sha || '', counts: {} };
  for (const r of rowsRes.results || []) {
    try {
      if (r.kind === 'modules') out.modules.push(JSON.parse(r.row_json));
      else if (r.kind === 'inverters') out.inverters.push(JSON.parse(r.row_json));
      else if (r.kind === 'cables') out.cables.push(JSON.parse(r.row_json));
    } catch { /* skip corrupt row */ }
  }
  try { out.counts = JSON.parse(meta.counts || '{}'); } catch { out.counts = {}; }
  return out;
}

/* Convenience: full sync pipeline used by the POST route. */
export async function syncCatalogue(env, db) {
  const { bytes, name } = await fetchCatalogueWorkbook(env);
  const catalogue = await extractCatalogue(bytes, name);
  const counts = await storeCatalogue(db, catalogue, { source: name });
  return {
    syncedAt: new Date().toISOString(),
    source: name,
    sha: catalogue.sha,
    counts,
    catalogue: {
      syncedAt: new Date().toISOString(),
      source: name,
      sha: catalogue.sha,
      modules: catalogue.modules,
      inverters: catalogue.inverters,
      cables: catalogue.cables
    }
  };
}
