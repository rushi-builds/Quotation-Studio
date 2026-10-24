-- Equipment catalogue sync (on-demand from Google Drive .xlsm).
-- Apply: wrangler d1 execute quotation-studio-db --remote --file=platform/migrations/006-catalogue.sql
CREATE TABLE IF NOT EXISTS equipment_catalogue (
  kind     TEXT NOT NULL CHECK (kind IN ('modules', 'inverters', 'cables')),
  make     TEXT NOT NULL,
  model    TEXT NOT NULL,
  row_json TEXT NOT NULL,
  PRIMARY KEY (kind, make, model)
);

CREATE TABLE IF NOT EXISTS equipment_catalogue_meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
