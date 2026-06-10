#!/usr/bin/env bash
# Assert security-critical configuration has not been accidentally reverted.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="$ROOT_DIR/docker-compose.yml"
FAIL=0

# Elasticsearch: authentication must stay enabled
if ! grep -q 'xpack.security.enabled=true' "$COMPOSE"; then
    echo "FAIL: Elasticsearch xpack.security.enabled is not set to true"
    FAIL=1
else
    echo "PASS: Elasticsearch security is enabled"
fi

# prowlarr and flaresolverr must route through gluetun (VPN kill-switch).
# If either is moved to the mediastack bridge network, traffic leaks outside the VPN.
for svc in prowlarr flaresolverr; do
    if ! awk "/container_name: ${svc}/{f=1} f && /network_mode:/{print; exit}" "$COMPOSE" \
            | grep -q 'service:gluetun'; then
        echo "FAIL: $svc is not routing via gluetun VPN"
        FAIL=1
    else
        echo "PASS: $svc routes via gluetun"
    fi
done

exit $FAIL
