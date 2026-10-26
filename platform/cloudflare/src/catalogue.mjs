/* ============================================================================
   Quotation Studio — equipment catalogue sync (Google Drive .xlsm -> D1)
   ----------------------------------------------------------------------------
   Explicit data sync: POST /api/catalogue/sync reads the Excel
   workbook from Drive, extracts the three catalogue tables and stores
   them in D1. The app's built-in catalogue-data.js stays as the fallback.

   Column mappings retain extract_catalogue.ps1; named tables expand these
   legacy baseline row ranges:
     MODULE_DB   tblModule  rows 5..316,   cols 1..22
     INVERTER_DB tblInv     rows 6..145,   cols 1..23
     CABLE_DB    tblCable   rows 6..113,   cols 1..11
   ============================================================================ */
'use strict';

import { createHash } from 'node:crypto';

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

function extractTable(rowsByRow, kind, bounds) {
  const spec = bounds || KIND_SPECS[kind];
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
  // Follow expanded Excel tables, not historical row ceilings. Do not scan
  // unrelated factor/operational tables below the whitelisted product tables.
  const tableNames = { modules: 'tblModule', inverters: 'tblInv', cables: 'tblCable' };
  const bounds = (kind) => {
    for (const [path, bytes] of entries) {
      if (!/^xl\/tables\/[^/]+\.xml$/.test(path)) continue;
      const tag = /<table\b([^>]+)>/.exec(decodeXml(bytes));
      if (!tag) continue;
      const a = attrsOf(tag[1]);
      if (a.name !== tableNames[kind] && a.displayName !== tableNames[kind]) continue;
      const range = /^\$?[A-Z]+\$?(\d+):\$?[A-Z]+\$?(\d+)$/.exec(a.ref || '');
      if (!range) throw new Error('Invalid catalogue table range.');
      const from = Number(range[1]) + 1, to = Number(range[2]) - Number(a.totalsRowCount || 0);
      if (to < from || to - from + 1 > 5000) throw new Error('Catalogue table must contain 1–5000 product rows.');
      return { from, to };
    }
    return KIND_SPECS[kind]; // Older workbooks without named-table XML.
  };
  const modules = extractTable(read('modules'), 'modules', bounds('modules'));
  const inverters = extractTable(read('inverters'), 'inverters', bounds('inverters'));
  const cables = extractTable(read('cables'), 'cables', bounds('cables'));
  if (!modules.length || !inverters.length || !cables.length) {
    throw new Error('Catalogue extraction came back empty (modules=' + modules.length + ', inverters=' + inverters.length + ', cables=' + cables.length + '). Wrong workbook?');
  }
  const sha = createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
  return { modules, inverters, cables, sha, fileName: fileName || '' };
}

/* ---------------- Google Drive fetch ---------------- */

function notConfigured(what) {
  const e = new Error('Catalogue sync is not configured: ' + what +
    '. Set the GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON worker secret (full service-account JSON; use GDRIVE_FOLDER_ID or GDRIVE_FILE_ID to point at the workbook), or GDRIVE_MODE=public with GDRIVE_FILE_ID.');
  e.code = 'NOT_CONFIGURED';
  return e;
}

function b64url(s) { return Buffer.from(s).toString('base64url'); }

/* Workers' node:crypto has no createSign; sign the Drive JWT with WebCrypto. */
function pemToDer(pem) {
  const body = String(pem || '').replace(/\\n/g, '\n')
    .replace(/-----BEGIN [^-]+-----|-----END [^-]+-----/g, '')
    .replace(/\s/g, '');
  if (!body) throw new Error('Google Drive service account private key is missing.');
  const binary = atob(body);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

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
  const unsigned = header + '.' + claims;
  let key;
  try {
    key = await crypto.subtle.importKey('pkcs8', pemToDer(pem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch (_) { throw new Error('Google Drive service account private key is unusable.'); }
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const assertion = unsigned + '.' + Buffer.from(new Uint8Array(signature)).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(10000),
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
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Google Drive search failed (' + res.status + '): ' + (data.error && data.error.message || 'unknown'));
  const hit = (data.files || []).find((f) => /\.xlsm$/i.test(f.name));
  if (!hit) throw new Error('No Solar_EPC *.xlsm workbook found in the Drive folder. Check that the Desktop → Drive sync has run.');
  return hit.id;
}

const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;
const sourceChecks = new Map(); // Isolate-local metadata cache only; no workbook polling/writes.
function configuredFileId(env) {
  return [env.GOOGLE_DRIVE_PRODUCT_CATALOG_FILE_ID, env.GOOGLE_DRIVE_MODULE_CATALOG_FILE_ID, env.GDRIVE_FILE_ID]
    .map(value => String(value || '').trim()).find(Boolean) || '';
}
async function resolveSource(env) {
  const mode = String(env.GDRIVE_MODE || 'service').toLowerCase();
  let id = configuredFileId(env);
  if (mode === 'public') {
    if (!id) throw notConfigured('catalogue file ID missing');
    return { id, mode, headers: {} };
  }
  let account;
  try { account = JSON.parse(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '{}'); }
  catch (_) { throw notConfigured('service account configuration invalid'); }
  if (!account.client_email || !account.private_key) throw notConfigured('service account configuration missing');
  const token = await serviceAccountToken(account.client_email, account.private_key);
  if (!id && env.GDRIVE_FOLDER_ID) id = await findInFolder(env.GDRIVE_FOLDER_ID, token);
  if (!id) throw notConfigured('catalogue file ID missing');
  return { id, mode, headers: { Authorization: 'Bearer ' + token } };
}
async function sourceMetadata(source) {
  const { id, mode, headers } = source;
  const base = { fileId: id, workbookUrl: 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view',
    fileName: 'Connected Excel workbook', revision: '', modifiedAt: '', checkedAt: new Date().toISOString() };
  if (mode === 'public') return { ...base, reason: 'Public-link mode cannot verify workbook changes. Sync manually.' };
  const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) +
    '?supportsAllDrives=true&fields=id,name,mimeType,modifiedTime,md5Checksum,version,size,trashed';
  const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('The connected workbook is unavailable. Check its file-scoped Viewer access.');
  const meta = await response.json();
  if (meta.id !== id || meta.trashed || !/\.xls[mx]$/i.test(meta.name || '') || Number(meta.size) > MAX_WORKBOOK_BYTES) {
    throw new Error('The connected file must be an available Excel workbook of at most 10 MB.');
  }
  return { ...base, fileName: meta.name, modifiedAt: meta.modifiedTime || '', checksum: meta.md5Checksum || '',
    revision: String(meta.md5Checksum || meta.version || meta.modifiedTime || '') };
}
async function boundedBytes(response) {
  if (Number(response.headers.get('content-length')) > MAX_WORKBOOK_BYTES) throw new Error('Excel workbook exceeds 10 MB.');
  const reader = response.body.getReader(), chunks = []; let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > MAX_WORKBOOK_BYTES) { await reader.cancel(); throw new Error('Excel workbook exceeds 10 MB.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
/* A metadata check never downloads the workbook or mutates the saved catalogue. */
export async function catalogueStatus(env, db, fresh = false) {
  const meta = await readCatalogueMeta(db);
  const cacheKey = JSON.stringify([configuredFileId(env), env.GDRIVE_FOLDER_ID || '', env.GDRIVE_MODE || 'service']);
  let checked = sourceChecks.get(cacheKey);
  if (fresh || !checked || Date.now() - checked.at >= 60000) {
    const source = await resolveSource(env);
    const current = await sourceMetadata(source);
    checked = { at: Date.now(), current };
    if (sourceChecks.size >= 8) sourceChecks.clear();
    sourceChecks.set(cacheKey, checked);
  }
  const current = checked.current;
  const unverified = !current.revision || !meta.fileId || !meta.sourceRevision;
  const status = !meta.syncedAt ? 'not-synced' : unverified ? 'unknown'
    : meta.fileId !== current.fileId || meta.sourceRevision !== current.revision ? 'outdated' : 'up-to-date';
  return { ...current, status, syncedAt: meta.syncedAt || '', sha: meta.sha || '', counts: meta.counts || {},
    reason: current.reason || (meta.syncedAt && unverified ? 'Sync once to verify the existing catalogue against the connected Excel workbook.' : ''), sourceSelection: configuredFileId(env) ? 'file' : 'folder-latest' };
}
/* Returns verified bytes from the same exact file exposed by the metadata route.
   Never mark bytes current if the file changes while being downloaded. */
export async function fetchCatalogueWorkbook(env) {
  const source = await resolveSource(env);
  const before = await sourceMetadata(source);
  const url = source.mode === 'public'
    ? 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(source.id)
    : 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(source.id) + '?alt=media&supportsAllDrives=true';
  const response = await fetch(url, { headers: source.headers, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('The connected Excel workbook could not be downloaded.');
  const bytes = await boundedBytes(response);
  const after = source.mode === 'public' ? before : await sourceMetadata(source);
  if (before.revision !== after.revision || (before.checksum && createHash('md5').update(bytes).digest('hex') !== before.checksum)) {
    throw new Error('Excel changed during sync. Save the workbook and sync again. The previous catalogue has been kept.');
  }
  return { bytes, name: before.fileName, sourceMeta: before };
}

/* ---------------- D1 storage ---------------- */

export async function storeCatalogue(db, catalogue, meta) {
  const rows = [];
  // Excel can legitimately repeat a model name across rating bins, or even
  // repeat an identical row. Keep every row using a snapshot-local row key;
  // the original make/model/ratings remain untouched in row_json.
  const add = (kind, list) => list.forEach((r, index) => rows.push([kind, String(r.make || r.label || ''), String(index).padStart(5, '0') + '|' + String(r.model || r.make || ''), JSON.stringify(r)]));
  add('modules', catalogue.modules);
  add('inverters', catalogue.inverters);
  add('cables', catalogue.cables);
  // D1 bind() returns a NEW statement: retain every row, not just one per chunk.
  // One batch transaction replaces rows + metadata atomically; failed writes roll back.
  const stmts = [db.prepare('DELETE FROM equipment_catalogue')];
  // 25 rows = 100 bind parameters, within D1's per-statement bound. A typical
  // 500-row catalogue takes about 20 queries rather than 500 per request.
  for (let i = 0; i < rows.length; i += 25) {
    const chunk = rows.slice(i, i + 25);
    const sql = 'INSERT INTO equipment_catalogue (kind, make, model, row_json) VALUES ' + chunk.map(() => '(?, ?, ?, ?)').join(', ');
    stmts.push(db.prepare(sql).bind(...chunk.flat()));
  }
  const metaRows = [
    ['sha', String(catalogue.sha || '')],
    ['syncedAt', String(meta.syncedAt || new Date().toISOString())],
    ['source', String(meta.source || catalogue.fileName || '')],
    ['fileId', String(meta.fileId || '')],
    ['sourceRevision', String(meta.revision || '')],
    ['sourceModifiedAt', String(meta.modifiedAt || '')],
    ['counts', JSON.stringify({ modules: catalogue.modules.length, inverters: catalogue.inverters.length, cables: catalogue.cables.length })]
  ];
  stmts.push(...metaRows.map(([k, v]) => db.prepare('INSERT OR REPLACE INTO equipment_catalogue_meta (key, value) VALUES (?, ?)').bind(k, v)));
  await db.batch(stmts);
  return { modules: catalogue.modules.length, inverters: catalogue.inverters.length, cables: catalogue.cables.length };
}

export async function readCatalogueMeta(db) {
  const metaRes = await db.prepare("SELECT key, value FROM equipment_catalogue_meta").all();
  const meta = {};
  for (const r of metaRes.results || []) meta[r.key] = r.value;
  try { meta.counts = JSON.parse(meta.counts || '{}'); } catch (_) { meta.counts = {}; }
  return meta;
}

export async function readCatalogue(db) {
  const meta = await readCatalogueMeta(db);
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
  out.counts = meta.counts;
  return out;
}

/* Convenience: full sync pipeline used by the POST route. */
export async function syncCatalogue(env, db) {
  const { bytes, name, sourceMeta } = await fetchCatalogueWorkbook(env);
  const catalogue = await extractCatalogue(bytes, name);
  const syncedAt = new Date().toISOString();
  const counts = await storeCatalogue(db, catalogue, { ...sourceMeta, source: name, syncedAt });
  sourceChecks.clear();
  return {
    syncedAt,
    source: name,
    sha: catalogue.sha,
    counts,
    catalogue: {
      syncedAt,
      source: name,
      sha: catalogue.sha,
      modules: catalogue.modules,
      inverters: catalogue.inverters,
      cables: catalogue.cables
    }
  };
}
