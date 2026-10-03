-- Additive OAuth tables. Also created idempotently by the configured routes.
CREATE TABLE IF NOT EXISTS oauth_rate_limits (scope TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_attempts (state_hash TEXT PRIMARY KEY, binding_hash TEXT NOT NULL, provider TEXT NOT NULL, expires INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_identities (provider TEXT NOT NULL, subject TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, linked_at TEXT NOT NULL, PRIMARY KEY(provider,subject), UNIQUE(user_id,provider));
