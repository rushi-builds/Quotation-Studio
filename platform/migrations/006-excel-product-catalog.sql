-- Additive snapshot cache for sanitized quotation-facing product rows only.
-- No workbook binary, VBA, customer/site data, costs, or operational worksheets are stored.
CREATE TABLE IF NOT EXISTS excel_product_catalog_cache (
  catalog_key TEXT PRIMARY KEY,
  file_id TEXT NOT NULL,
  file_name TEXT NOT NULL DEFAULT '',
  file_modified_at TEXT NOT NULL DEFAULT '',
  file_checksum TEXT NOT NULL DEFAULT '',
  synced_at TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  rejected_rows INTEGER NOT NULL DEFAULT 0,
  products_json TEXT NOT NULL
);
