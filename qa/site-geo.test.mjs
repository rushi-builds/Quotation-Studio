/* Site location resolve + NASA POWER route contract (worker level).
   Run: node qa/site-geo.test.mjs
   Asserts: resolve geocodes via Nominatim (Google when a key exists) with a
   policy-compliant User-Agent, caches in D1, 400/404/502 failures, resource
   fetch aggregates NASA POWER daily data skipping the -999 fill value,
   caches per grid point, and both routes require a signed-in user. */
import assert from 'node:assert/strict';
import worker from '../platform/cloudflare/src/worker.js';

function memDb() {
  const users = {
    'owner-id': { id: 'owner-id', email: 'rushi@example.test', name: 'Rushi', role: 'owner' }
  };
  const sessions = { 'owner-token': { user_id: 'owner-id' } };
  const geo = new Map();
  const resource = new Map();
  return {
    geo, resource,
    prepare(sql) {
      const stmt = {
        sql, bindings: [],
        bind(...params) { stmt.bindings.push(params); return stmt; },
        async first() {
          const p = stmt.bindings[0] || [];
          if (sql.includes('FROM sessions')) return sessions[p[0]] || null;
          if (sql.includes('FROM users')) return users[p[0]] || null;
          if (sql.includes('site_geo_cache')) return geo.get(p[0]) || null;
          if (sql.includes('site_resource_cache')) return resource.get(p[0]) || null;
          return null;
        },
        async run() {
          for (const p of stmt.bindings) {
            if (sql.includes('INSERT OR REPLACE INTO site_geo_cache')) {
              geo.set(p[0], { lat: p[1], lng: p[2], display_name: p[3], source: p[4], created_at: p[5] });
            } else if (sql.includes('INSERT OR REPLACE INTO site_resource_cache')) {
              resource.set(p[0], {
                lat: p[1], lng: p[2], ghi_annual: p[3], wind_ms: p[4], days: p[5],
                window_start: p[6], window_end: p[7], elevation_m: p[8], created_at: p[9]
              });
            }
          }
          return { success: true };
        }
      };
      return stmt;
    }
  };
}

const call = (env, route, method = 'GET', token) => worker.fetch(
  new Request('https://workspace.test/api/' + route, {
    method,
    headers: { ...(token ? { 'X-QS-Session': token } : {}) }
  }), env);

const realFetch = globalThis.fetch;
let fetchCount = 0;
let lastUrl = '';
let lastInit = null;
let nasaResponse = () => new Response(JSON.stringify({
  properties: { parameter: {
    ALLSKY_SFC_SW_DWN: { '20250101': 5.2, '20250102': 5.0, '20250103': -999 },
    WS10M: { '20250101': 3.4, '20250102': -999, '20250103': 3.0 }
  } },
  geometry: { coordinates: [74.435, 17.99], elevation: 655.86 }
}), { status: 200 });
let nominatimResponse = () => new Response(JSON.stringify([
  { lat: '17.99', lon: '74.434', display_name: 'Phaltan, Satara, Maharashtra, India' }
]), { status: 200 });

function stubFetch(handler) {
  fetchCount = 0;
  globalThis.fetch = async (url, init) => {
    fetchCount++;
    lastUrl = String(url);
    lastInit = init || null;
    return handler(url, init);
  };
}

try {
  const db = memDb();
  const env = { DB: db };

  await stubFetch((url) => {
    if (url.includes('nominatim.openstreetmap.org')) return nominatimResponse();
    if (url.includes('power.larc.nasa.gov')) return nasaResponse();
    throw new Error('unexpected fetch ' + url);
  });

  const anon = await call(env, 'site/resolve?q=Phaltan');
  assert.equal(anon.status, 401, 'unauthenticated resolve is 401');
  const anonRes = await call(env, 'site/resource?lat=17.99&lng=74.434');
  assert.equal(anonRes.status, 401, 'unauthenticated resource is 401');

  const bad = await call(env, 'site/resolve?q=ab', 'GET', 'owner-token');
  assert.equal(bad.status, 400, 'too-short query is 400');
  assert.equal((await bad.json()).code, 'BAD_QUERY');

  const r1 = await call(env, 'site/resolve?q=Phaltan%20Satara', 'GET', 'owner-token');
  assert.equal(r1.status, 200, 'Nominatim resolve succeeds');
  const g1 = await r1.json();
  assert.equal(g1.lat, 17.99);
  assert.equal(g1.lng, 74.434);
  assert.equal(g1.source, 'OpenStreetMap Nominatim');
  assert.equal(g1.cached, false);
  assert.match(g1.displayName, /Phaltan/);
  assert.ok(lastInit && lastInit.headers && lastInit.headers['User-Agent'], 'Nominatim policy: identifying User-Agent sent');
  assert.equal(lastUrl.includes('format=jsonv2'), true);

  const r2 = await call(env, 'site/resolve?q=PHALTAN   SATARA', 'GET', 'owner-token');
  assert.equal(r2.status, 200);
  const g2 = await r2.json();
  assert.equal(g2.cached, true, 'same location (case/whitespace-insensitive) is served from cache');
  assert.equal(g2.lat, 17.99);
  const fetchesAfterGeo = fetchCount;

  const res1 = await call(env, 'site/resource?lat=17.99&lng=74.434', 'GET', 'owner-token');
  assert.equal(res1.status, 200, 'NASA resource fetch succeeds');
  const n1 = await res1.json();
  assert.equal(n1.ghiAnnualKwhM2, 1862.74, 'annual GHI = mean of valid daily GHI × 365.2425, -999 fill skipped');
  assert.equal(n1.windMeanMs, 3.2, 'mean wind skips the -999 fill value');
  assert.equal(n1.days, 3);
  assert.equal(n1.elevationM, 655.86);
  assert.equal(n1.cached, false);
  assert.match(lastUrl, /power\.larc\.nasa\.gov\/api\/temporal\/daily\/point/);
  assert.match(lastUrl, /ALLSKY_SFC_SW_DWN/);
  assert.match(lastUrl, /community=RE/);
  assert.match(n1.windowStart, /^\d{4}-\d{2}-\d{2}$/);

  const res2 = await call(env, 'site/resource?lat=17.9901&lng=74.4344', 'GET', 'owner-token');
  const n2 = await res2.json();
  assert.equal(n2.cached, true, 'same grid point (3-decimals) is served from cache');
  assert.equal(n2.ghiAnnualKwhM2, 1862.74);
  assert.equal(fetchCount, fetchesAfterGeo + 1, 'cached resource hit makes no upstream call');

  const badCoords = await call(env, 'site/resource?lat=99&lng=0', 'GET', 'owner-token');
  assert.equal(badCoords.status, 400, 'out-of-range coordinates are 400');
  assert.equal((await badCoords.json()).code, 'BAD_COORDINATES');
} finally {
  globalThis.fetch = realFetch;
}

{
  await stubFetch(() => new Response('[]', { status: 200 }));
  const missing = await call({ DB: memDb() }, 'site/resolve?q=Nowhereville', 'GET', 'owner-token');
  assert.equal(missing.status, 404, 'no geocode results is 404');
  assert.equal((await missing.json()).code, 'NOT_FOUND');
}

{
  await stubFetch(() => new Response('boom', { status: 500 }));
  const up = await call({ DB: memDb() }, 'site/resolve?q=Phaltan', 'GET', 'owner-token');
  assert.equal(up.status, 502, 'upstream failure is 502');
  assert.match((await up.json()).error, /Location resolve failed/);
}

{
  const db = memDb();
  await stubFetch((url) => {
    if (url.includes('maps.googleapis.com')) {
      return new Response(JSON.stringify({
        status: 'OK',
        results: [{ formatted_address: 'Satara, Maharashtra, India', geometry: { location: { lat: 17.68, lng: 74.01 } } }]
      }), { status: 200 });
    }
    throw new Error('unexpected fetch ' + url);
  });
  const r = await call({ DB: db, GOOGLE_GEOCODING_API_KEY: 'test-key' }, 'site/resolve?q=Satara', 'GET', 'owner-token');
  const g = await r.json();
  assert.equal(r.status, 200);
  assert.equal(g.source, 'Google Geocoding API', 'Google is used when the key exists (same key as the Excel SETTINGS sheet)');
  assert.equal(g.lat, 17.68);
  assert.match(lastUrl, /maps\.googleapis\.com\/maps\/api\/geocode\/json/);
  assert.match(lastUrl, /key=test-key/);
}

{
  await stubFetch(() => new Response(JSON.stringify({ properties: { parameter: { ALLSKY_SFC_SW_DWN: { '20250101': -999 }, WS10M: { '20250101': 2 } } } }), { status: 200 }));
  const allFill = await call({ DB: memDb() }, 'site/resource?lat=18&lng=74', 'GET', 'owner-token');
  assert.equal(allFill.status, 502, 'all-fill NASA response fails closed, not with junk numbers');
}

console.log('PASS: site geo routes — auth-gated, Nominatim/Google resolve with UA, NASA POWER aggregation skips fill, D1 caching, honest 400/404/502.');
