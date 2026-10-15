'use strict';
// Authenticated local API coverage for the read-only product snapshot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const ROOT = path.join(__dirname, '..');
(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'qs-excel-products-'));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['platform/local-server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', QS_DATA_DIR: data,
      GEMINI_ENABLED: 'false', GOOGLE_DRIVE_PRODUCT_CATALOG_FILE_ID: '',
      GOOGLE_DRIVE_MODULE_CATALOG_FILE_ID: '', GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('local server startup timeout ' + stderr)), 10000);
      child.stdout.on('data', chunk => {
        if (String(chunk).includes('Quotation Studio platform') || String(chunk).includes('Dash:')) {
          clearTimeout(timer); resolve();
        }
      });
      child.once('error', reject);
      child.once('exit', code => reject(new Error('local server exited ' + code + ' ' + stderr)));
    });
    const base = `http://127.0.0.1:${port}`;
    const request = async (method, route, body, token) => {
      const response = await fetch(base + route, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      return { status: response.status, json: await response.json() };
    };
    const email = 'catalog-owner-' + randomUUID() + '@example.test';
    const signup = await request('POST', '/api/auth/register', {
      email, name: 'Catalogue QA', password: 'ValidPassword-123!', role: 'Viewer'
    });
    assert.equal(signup.status, 201, JSON.stringify(signup.json));
    assert.equal(signup.json.user.role, 'viewer');

    const fixturePath = path.join(data, 'db.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const user = fixture.users.find(row => row.id === signup.json.user.id);
    user.role = 'viewer';
    fixture.excelProductCatalog = {
      fileId: 'private-test-file-id', fileName: 'Solar_EPC_Software_FINAL_v0.2.xlsm',
      fileModifiedAt: '2026-10-10T11:40:07.135Z', fileChecksum: 'test-checksum',
      syncedAt: new Date().toISOString(), checkedAt: new Date().toISOString(), rowCount: 1,
      rowCounts: { modules: 1, inverters: 1, cables: 1, protection: 1 }, rejectedRows: 0,
      modules: [{ make: 'Waaree', model: 'Bi-55-545 · row 4', wp: 545, source: 'excel', verified: false, sourceUrl: '' }],
      inverters: [{ make: 'Deye', model: 'SUN-5K', acKw: 5, source: 'excel', verified: false, sourceUrl: '' }],
      cables: [{ make: 'Polycab', category: 'PV DC', sizeMm2: 4, source: 'excel', verified: false, sourceUrl: '' }],
      protection: [{ make: 'Schneider', category: 'DC MCB', model: 'iC60 PV', catalogNumber: 'A9N61525', source: 'excel', verified: false, sourceUrl: '' }],
      rejectedRowsBySheet: {}, sheets: { modules: 'MODULE_DB', inverters: 'INVERTER_DB', cables: 'CABLE_DB', protection: 'PROTECTION_DB' }
    };
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));

    assert.equal((await request('GET', '/api/catalog/products')).status, 401, 'catalogue requires staff sign-in');
    const response = await request('GET', '/api/catalog/products', undefined, signup.json.token);
    assert.equal(response.status, 200);
    assert.deepEqual(response.json.rowCounts, { modules: 1, inverters: 1, cables: 1, protection: 1 });
    assert.equal(response.json.inverters[0].model, 'SUN-5K');
    assert.equal(response.json.modules[0].verified, false);
    assert.equal(JSON.stringify(response.json).includes('COST_DB'), false);
    assert.equal(JSON.stringify(response.json).includes('RESOURCE_DB'), false);
    assert.equal((await request('GET', '/api/catalog/modules', undefined, signup.json.token)).status, 200,
      'legacy module route remains a compatible alias to the product payload');
    assert.equal((await request('POST', '/api/catalog/products/sync', {}, signup.json.token)).status, 403,
      'a viewer cannot force a Drive sync');

    user.role = 'owner'; // trusted offline fixture, not a public registration option
    fs.writeFileSync(fixturePath, JSON.stringify(fixture));
    const ownerSync = await request('POST', '/api/catalog/products/sync', {}, signup.json.token);
    assert.equal(ownerSync.status, 200, 'owner may request sync; without private Drive config the saved snapshot stays available');
    assert.equal(ownerSync.json.stale, true);
    assert.equal(ownerSync.json.inverters[0].make, 'Deye');
    console.log('PASS: private product snapshot requires staff auth; only the owner may force sync; saved snapshot survives missing Drive credentials.');
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    fs.rmSync(data, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
