#!/usr/bin/env bash
# Verify every service in docker-compose.yml has a matching entry in
# docker-compose.override.yml. Services added to the main file but missed in the
# override will run without the AppArmor workaround on Proxmox LXC.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT_DIR/docker-compose.yml"
OVERRIDE="$ROOT_DIR/docker-compose.override.yml"

get_services() {
    awk '/^services:/{f=1; next} /^[a-zA-Z]/{f=0} f && /^  [a-z][a-z_-]*:/{
        gsub(/:.*/, ""); gsub(/^  /, ""); print
    }' "$1" | sort
}

MAIN_SERVICES=$(get_services "$COMPOSE")
OVERRIDE_SERVICES=$(get_services "$OVERRIDE")

FAIL=0
for svc in $MAIN_SERVICES; do
    if ! echo "$OVERRIDE_SERVICES" | grep -q "^${svc}$"; then
        echo "MISSING: '$svc' is in docker-compose.yml but absent from docker-compose.override.yml"
        FAIL=1
    fi
done

[ $FAIL -eq 0 ] && echo "PASS: All services are covered in docker-compose.override.yml"
exit $FAIL
