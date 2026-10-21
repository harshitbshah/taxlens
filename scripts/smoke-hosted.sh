#!/usr/bin/env bash
# HM-11 post-deploy smoke test against the live hosted instance (docs/HOSTED_MODE_SPEC.md).
# Read-only except for requests the server must reject. Prompts for the basic-auth password.
#
# Usage: ./scripts/smoke-hosted.sh            (uses TAXLENS_DOMAIN from deploy/local.env)
#        TAXLENS_USER=harshit ./scripts/smoke-hosted.sh
set -euo pipefail
source "$(dirname "$0")/lib-deploy.sh"

URL="https://$TAXLENS_DOMAIN"
USER_NAME="${TAXLENS_USER:-harshit}"
if [ -z "${TAXLENS_PASS:-}" ]; then
  read -r -s -p "Basic-auth password for $USER_NAME@$TAXLENS_DOMAIN: " TAXLENS_PASS; echo
fi
AUTH=(-u "$USER_NAME:$TAXLENS_PASS")
PASS=0; FAIL=0

check() {
  local name="$1"; shift
  if "$@"; then echo "  PASS  $name"; PASS=$((PASS + 1)); else echo "  FAIL  $name"; FAIL=$((FAIL + 1)); fi
}
status() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }

check "valid TLS certificate" curl -sS -o /dev/null --max-time 15 "$URL/"
check "no credentials → 401" test "$(status "$URL/api/health")" = "401"
check "wrong password → 401" test "$(status -u "$USER_NAME:wrong-$RANDOM" "$URL/api/health")" = "401"
check "credentials → /api/health 200" test "$(status "${AUTH[@]}" "$URL/api/health")" = "200"
check "credentials → app shell served" bash -c "curl -sf --max-time 15 -u '$USER_NAME:$TAXLENS_PASS' '$URL/' | grep -qi '<html'"
check "/api/config reports isHosted: true" bash -c "curl -sf --max-time 15 -u '$USER_NAME:$TAXLENS_PASS' '$URL/api/config' | grep -q '\"isHosted\":true'"
check "cross-site POST /api/clear-data → 403" test "$(status "${AUTH[@]}" -X POST -H 'Sec-Fetch-Site: cross-site' -H 'Origin: https://evil.example' "$URL/api/clear-data")" = "403"
check "POST /api/clear-data → 403 (hosted)" test "$(status "${AUTH[@]}" -X POST "$URL/api/clear-data")" = "403"
check "POST /api/config/key → 403 (hosted)" test "$(status "${AUTH[@]}" -X POST -H 'content-type: application/json' -d '{"apiKey":"x"}' "$URL/api/config/key")" = "403"
check "GET /.env → 404" test "$(status "${AUTH[@]}" "$URL/.env")" = "404"
check "GET /.tax-returns.json → 404" test "$(status "${AUTH[@]}" "$URL/.tax-returns.json")" = "404"
check "HSTS header present" bash -c "curl -sI --max-time 15 -u '$USER_NAME:$TAXLENS_PASS' '$URL/' | grep -qi '^strict-transport-security'"
check "app port 3005 not reachable from outside" bash -c "! curl -s -o /dev/null --max-time 5 'http://$TAXLENS_DOMAIN:3005/'"

echo
echo "smoke-hosted: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
