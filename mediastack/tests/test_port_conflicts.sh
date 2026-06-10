#!/usr/bin/env bash
# Detect duplicate host-side port bindings across services.
# A port collision causes one service to silently fail to start.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT_DIR/docker-compose.yml"

# Extract host-side port from "HOST:CONTAINER" mappings
PORTS=$(grep -oE '"[0-9]+:[0-9]+"' "$COMPOSE" | cut -d: -f1 | tr -d '"' | sort)
DUPES=$(echo "$PORTS" | uniq -d)

if [ -z "$DUPES" ]; then
    echo "PASS: No port conflicts detected"
else
    echo "FAIL: Duplicate host port bindings found: $DUPES"
    exit 1
fi
