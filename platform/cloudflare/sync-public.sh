#!/usr/bin/env bash
# Delegate to the canonical cross-platform sync (single source of truth).
# The old inline copy list drifted behind sync-public.js (it missed
# oauth-complete.html and the generated _headers file).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "node is required to sync public/ (wrangler builds need it too)" >&2
  exit 1
fi
exec node "$HERE/sync-public.js"
