#!/usr/bin/env bash
# Warn on :latest image tags. Unpinned images can silently break the stack
# when upstream publishes a breaking release.
# This is a warning only — it does not fail CI.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT_DIR/docker-compose.yml"

LATEST_COUNT=$(grep -c 'image:.*:latest' "$COMPOSE" || true)

if [ "$LATEST_COUNT" -eq 0 ]; then
    echo "PASS: No unpinned :latest images found"
else
    echo "WARN: $LATEST_COUNT service(s) use unpinned :latest images:"
    grep 'image:.*:latest' "$COMPOSE" | sed 's/^[[:space:]]*/  /'
fi
