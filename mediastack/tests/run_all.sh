#!/usr/bin/env bash
# Run all infrastructure validation tests.
# Usage: bash tests/run_all.sh   (from the mediastack/ directory)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

run_test() {
    local name="$1"
    local script="$2"
    echo "─── $name"
    if bash "$script"; then
        PASS=$((PASS + 1))
    else
        FAIL=$((FAIL + 1))
    fi
    echo
}

run_test "Env completeness"    "$SCRIPT_DIR/test_env_completeness.sh"
run_test "Port conflicts"      "$SCRIPT_DIR/test_port_conflicts.sh"
run_test "Security assertions" "$SCRIPT_DIR/test_security.sh"
run_test "Override coverage"   "$SCRIPT_DIR/test_override_coverage.sh"
run_test "Image pinning"       "$SCRIPT_DIR/test_image_pinning.sh"

echo "════════════════════════════════════════"
echo "Results: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ] || exit 1
