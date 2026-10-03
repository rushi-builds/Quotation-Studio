-- Persistent cross-isolate Gemini rate limits. Contains counters only, never prompts.
CREATE TABLE IF NOT EXISTS assistant_usage (
  scope TEXT NOT NULL,
  bucket TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, bucket)
);
CREATE INDEX IF NOT EXISTS idx_assistant_usage_expiry ON assistant_usage(expires_at);
