#!/usr/bin/env bash
# Verify all ${VAR} references in docker-compose.yml are documented in .env.example.
# Catches drift where a new service adds a variable but .env.example is not updated.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT_DIR/docker-compose.yml"
ENV_EXAMPLE="$ROOT_DIR/.env.example"

COMPOSE_VARS=$(grep -oE '\$\{[A-Z_]+\}' "$COMPOSE" | sed 's/[${}]//g' | sort -u)
ENV_KEYS=$(grep -E '^[A-Z_]+=.*' "$ENV_EXAMPLE" | cut -d= -f1 | sort -u)

FAIL=0
for var in $COMPOSE_VARS; do
    if ! echo "$ENV_KEYS" | grep -q "^${var}$"; then
        echo "MISSING: \${${var}} used in docker-compose.yml but not documented in .env.example"
        FAIL=1
    fi
done

[ $FAIL -eq 0 ] && echo "PASS: All compose variables are documented in .env.example"
exit $FAIL
