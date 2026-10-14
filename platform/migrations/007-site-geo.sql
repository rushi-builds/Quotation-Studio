-- Site location resolve + NASA POWER resource cache (Quotation Studio).
-- Adds two cache tables only; no other schema changes.
-- Verify: SELECT name FROM sqlite_master WHERE name IN ('site_geo_cache','site_resource_cache');

CREATE TABLE IF NOT EXISTS site_geo_cache (
  query_key TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  display_name TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_resource_cache (
  grid_key TEXT PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  ghi_annual REAL NOT NULL,
  wind_ms REAL,
  days INTEGER NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  elevation_m REAL,
  created_at TEXT NOT NULL
);
