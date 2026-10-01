#!/usr/bin/env bash
# Copy front-end from repo root into ./public for Workers Assets deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PUB="$(cd "$(dirname "$0")" && pwd)/public"
rm -rf "$PUB"
mkdir -p "$PUB/assets"
for f in index.html dashboard.html quotation.html portal.html share.html gallery.html; do
  [ -f "$ROOT/$f" ] && cp -f "$ROOT/$f" "$PUB/"
done
cp -a "$ROOT/assets/." "$PUB/assets/"
echo "Synced public/ from repo root ($(find "$PUB" -type f | wc -l) files)"
