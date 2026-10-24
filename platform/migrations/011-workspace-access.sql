-- Additive only. Apply to the intended workspace DB before enabling access APIs.
-- Never use the reset-schema command. One company per existing Studio DB.
CREATE TABLE IF NOT EXISTS workspace_access (
  id TEXT PRIMARY KEY CHECK (id = 'workspace'),
  revision INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL
);
INSERT OR IGNORE INTO workspace_access (id,revision,payload)
VALUES ('workspace',0,'{"revision":0,"connections":[],"grants":[],"requests":[],"audit":[]}');
