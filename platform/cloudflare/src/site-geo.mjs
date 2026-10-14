/* Site location resolve + NASA POWER resource numbers.
   Mirrors the Excel workbook's flow exactly: forward geocode of the location
   text (Google when a key exists, else Nominatim) and then NASA POWER for the
   measured resource values. Both are cached in D1 so repeated resolves for
   the same site never re-hit the upstream APIs. */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_UA = 'QuotationStudio/1.0 (KTM Energy Experts; solar quotation tool; single-user)';
const NASA_DAILY_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const GEO_TTL_MS = 1000 * 60 * 60 * 24 * 180;
const RESOURCE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

let lastNominatimAt = 0;

function normalizeQuery(q) {
  return String(q || '').trim().replace(/\s+/g, ' ');
}

function geoKey(q) {
  return normalizeQuery(q).toLowerCase();
}

function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

function cacheFresh(row, ttlMs) {
  if (!row || !row.created_at) return false;
  const age = Date.now() - new Date(row.created_at).getTime();
  return Number.isFinite(age) && age < ttlMs;
}

async function geoCacheGet(db, key) {
  try {
    return await db.prepare(
      'SELECT lat, lng, display_name, source, created_at FROM site_geo_cache WHERE query_key = ?'
    ).bind(key).first();
  } catch (_) {
    return null;
  }
}

async function geoCachePut(db, key, lat, lng, displayName, source) {
  try {
    await db.prepare(
      'INSERT OR REPLACE INTO site_geo_cache (query_key, lat, lng, display_name, source, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(key, lat, lng, displayName.slice(0, 500), source, new Date().toISOString()).run();
  } catch (_) { /* cache failure never blocks the answer */ }
}

async function resourceCacheGet(db, key) {
  try {
    return await db.prepare(
      'SELECT lat, lng, ghi_annual, wind_ms, days, window_start, window_end, elevation_m, created_at FROM site_resource_cache WHERE grid_key = ?'
    ).bind(key).first();
  } catch (_) {
    return null;
  }
}

async function resourceCachePut(db, key, rec) {
  try {
    await db.prepare(
      'INSERT OR REPLACE INTO site_resource_cache (grid_key, lat, lng, ghi_annual, wind_ms, days, window_start, window_end, elevation_m, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(key, rec.lat, rec.lng, rec.ghiAnnualKwhM2, rec.windMeanMs, rec.days,
      rec.windowStart, rec.windowEnd, rec.elevationM, new Date().toISOString()).run();
  } catch (_) { /* cache failure never blocks the answer */ }
}

/* Forward geocode. Google when GOOGLE_GEOCODING_API_KEY is set (same key the
   Excel SETTINGS sheet holds), else OpenStreetMap Nominatim. */
export async function resolveLocation(env, db, query) {
  const q = normalizeQuery(query);
  if (!q || q.length < 3 || q.length > 200) {
    const e = new Error('Provide a location text between 3 and 200 characters.');
    e.code = 'BAD_QUERY';
    throw e;
  }
  const key = geoKey(q);
  const cached = await geoCacheGet(db, key);
  if (cached && cacheFresh(cached, GEO_TTL_MS)) {
    return {
      lat: cached.lat, lng: cached.lng,
      displayName: cached.display_name, source: cached.source, cached: true
    };
  }

  const gKey = String(env.GOOGLE_GEOCODING_API_KEY || '').trim();
  if (gKey) {
    const url = 'https://maps.googleapis.com/maps/api/geocode/json?address=' +
      encodeURIComponent(q) + '&key=' + encodeURIComponent(gKey);
    const res = await fetch(url);
    if (!res.ok) throw new Error('Google geocoding failed (' + res.status + ')');
    const data = await res.json().catch(() => ({}));
    const hit = (data.results || [])[0];
    if (data.status !== 'OK' || !hit) {
      const e = new Error('No coordinates found for "' + q + '". Try a nearby town or add the district/state.');
      e.code = 'NOT_FOUND';
      throw e;
    }
    const lat = Number(hit.geometry && hit.geometry.location && hit.geometry.location.lat);
    const lng = Number(hit.geometry && hit.geometry.location && hit.geometry.location.lng);
    if (!isValidLatLng(lat, lng)) throw new Error('Google geocoding returned invalid coordinates');
    const displayName = String(hit.formatted_address || q);
    await geoCachePut(db, key, lat, lng, displayName, 'Google Geocoding API');
    return { lat, lng, displayName, source: 'Google Geocoding API', cached: false };
  }

  /* Nominatim policy: identifying User-Agent, max 1 request/second. */
  const waitMs = 1100 - (Date.now() - lastNominatimAt);
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  lastNominatimAt = Date.now();
  const url = NOMINATIM_URL + '?q=' + encodeURIComponent(q) + '&format=jsonv2&limit=1';
  const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'en' } });
  if (!res.ok) throw new Error('Nominatim geocoding failed (' + res.status + ')');
  const data = await res.json().catch(() => []);
  const hit = (Array.isArray(data) ? data : [])[0];
  if (!hit) {
    const e = new Error('No coordinates found for "' + q + '". Try a nearby town or add the district/state.');
    e.code = 'NOT_FOUND';
    throw e;
  }
  const lat = Number(hit.lat), lng = Number(hit.lon);
  if (!isValidLatLng(lat, lng)) throw new Error('Nominatim returned invalid coordinates');
  const displayName = String(hit.display_name || q);
  await geoCachePut(db, key, lat, lng, displayName, 'OpenStreetMap Nominatim');
  return { lat, lng, displayName, source: 'OpenStreetMap Nominatim', cached: false };
}

function lastMonthWindow() {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  return { start: fmt(start), end: fmt(end), startISO: start.toISOString().slice(0, 10), endISO: end.toISOString().slice(0, 10) };
}

/* NASA POWER daily point API for the site's grid point. Returns the annual
   GHI (kWh/m2/yr), the mean wind speed (m/s) and the traceable window. */
export async function fetchSiteResource(env, db, lat, lng) {
  if (!isValidLatLng(lat, lng)) {
    const e = new Error('Valid latitude (-90..90) and longitude (-180..180) are required.');
    e.code = 'BAD_COORDINATES';
    throw e;
  }
  const gridKey = Number(lat).toFixed(3) + ',' + Number(lng).toFixed(3);
  const cached = await resourceCacheGet(db, gridKey);
  if (cached && cacheFresh(cached, RESOURCE_TTL_MS)) {
    return {
      lat: cached.lat, lng: cached.lng, ghiAnnualKwhM2: cached.ghi_annual,
      windMeanMs: cached.wind_ms, days: cached.days,
      windowStart: cached.window_start, windowEnd: cached.window_end,
      elevationM: cached.elevation_m, cached: true,
      source: 'NASA POWER Daily Point API (community=RE)'
    };
  }

  const window = lastMonthWindow();
  const url = NASA_DAILY_URL + '?parameters=ALLSKY_SFC_SW_DWN,WS10M&community=RE' +
    '&longitude=' + encodeURIComponent(Number(lng).toFixed(4)) +
    '&latitude=' + encodeURIComponent(Number(lat).toFixed(4)) +
    '&start=' + window.start + '&end=' + window.end + '&format=JSON';
  const res = await fetch(url, { headers: { 'User-Agent': NOMINATIM_UA } });
  if (!res.ok) throw new Error('NASA POWER request failed (' + res.status + ')');
  const data = await res.json().catch(() => ({}));
  const props = data.properties && data.properties.parameter ? data.properties.parameter : {};
  const ghiDays = props.ALLSKY_SFC_SW_DWN || {};
  const windDays = props.WS10M || {};
  const keys = Object.keys(ghiDays).filter((k) => /^\d{8}$/.test(k));
  if (!keys.length) throw new Error('NASA POWER returned no daily data for this location');

  let ghiSum = 0, ghiCount = 0, windSum = 0, windCount = 0;
  for (const k of keys) {
    const g = Number(ghiDays[k]), w = Number(windDays[k]);
    /* NASA fill value is -999; skip it instead of averaging it in. */
    if (Number.isFinite(g) && g >= 0 && g <= 12) { ghiSum += g; ghiCount++; }
    if (Number.isFinite(w) && w >= 0 && w <= 150) { windSum += w; windCount++; }
  }
  if (!ghiCount) throw new Error('NASA POWER returned no valid daily irradiance for this location');
  const ghiAnnualKwhM2 = Math.round((ghiSum / ghiCount) * 365.2425 * 100) / 100;
  const windMeanMs = windCount ? Math.round((windSum / windCount) * 100) / 100 : null;
  const gridLat = data.geometry && data.geometry.coordinates ? Number(data.geometry.coordinates[1]) : Number(lat);
  const gridLng = data.geometry && data.geometry.coordinates ? Number(data.geometry.coordinates[0]) : Number(lng);
  const elevationM = data.geometry && typeof data.geometry.elevation === 'number' ? data.geometry.elevation : null;
  const rec = {
    lat: gridLat, lng: gridLng, ghiAnnualKwhM2, windMeanMs,
    days: keys.length, windowStart: window.startISO, windowEnd: window.endISO, elevationM
  };
  await resourceCachePut(db, gridKey, rec);
  return { ...rec, cached: false, source: 'NASA POWER Daily Point API (community=RE)' };
}
