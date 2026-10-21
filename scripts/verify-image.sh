#!/usr/bin/env bash
# HM-10 acceptance test for the container image (docs/HOSTED_MODE_SPEC.md).
# Not part of `bun test`: needs Docker. Uses only dummy values — never the real API key or data.
#
# Usage: ./scripts/verify-image.sh [image-tag]
set -euo pipefail

IMAGE="${1:-taxlens:verify}"
PORT=3399
VOLUME="taxlens-verify-$$"
CONTAINER="taxlens-verify-$$"
DUMMY_KEY="sk-ant-verify-dummy"
PASS=0
FAIL=0

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

check() {
  local name="$1"; shift
  if "$@"; then echo "  PASS  $name"; PASS=$((PASS + 1)); else echo "  FAIL  $name"; FAIL=$((FAIL + 1)); fi
}

run_app() {
  docker run -d --name "$CONTAINER" -e ANTHROPIC_API_KEY="$DUMMY_KEY" \
    -v "$VOLUME:/data" -p "127.0.0.1:$PORT:3005" "$IMAGE" >/dev/null
}

wait_healthy() {
  for _ in $(seq 1 60); do
    [ "$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null)" = "healthy" ] && return 0
    sleep 1
  done
  docker logs "$CONTAINER" | tail -20
  return 1
}

echo "== 1. build"
check "image builds" bash -c "docker build -q -t '$IMAGE' . >/dev/null"
echo "  info  image size: $(docker image inspect -f '{{.Size}}' "$IMAGE" | awk '{printf "%.0f MB", $1/1e6}')"

echo "== 2. no data files or secrets baked in"
baked=$(docker run --rm --entrypoint sh "$IMAGE" -c \
  'find / -xdev \( -name ".tax-returns.json" -o -name ".india-tax-returns.json" -o -name ".filing-costs.json" -o -name ".*-cache.json" -o -name ".forecast-profile.json" -o -name ".retirement-accounts.json" -o -path "/app/.env" -o -path "/data/.env" \) 2>/dev/null' || true)
check "no data files / .env in image" test -z "$baked"
[ -n "$baked" ] && echo "$baked"

echo "== 3. refuses to start without required config"
set +e
out=$(docker run --rm "$IMAGE" 2>&1); code=$?
set -e
check "exits non-zero without ANTHROPIC_API_KEY" test "$code" -ne 0
check "names the missing variable" grep -q "ANTHROPIC_API_KEY" <<<"$out"

echo "== 4. starts healthy with valid config"
run_app
check "container becomes healthy" wait_healthy
check "process runs as non-root" test "$(docker exec "$CONTAINER" id -u)" != "0"
check "GET / serves the app" bash -c "curl -sf http://127.0.0.1:$PORT/ | grep -qi '<html'"
asset=$(curl -sf "http://127.0.0.1:$PORT/" | grep -oE '(src|href)="\./[^"]+\.(js|css)"' | head -1 | sed -E 's/^(src|href)="\.//; s/"$//')
check "index.html references a bundled asset" test -n "$asset"
check "that asset is served" test "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$asset")" = "200"
check "GET /.env is 404" test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$PORT/.env)" = "404"
check "POST /api/config/key is 403 (hosted)" test "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -d '{"apiKey":"x"}' http://127.0.0.1:$PORT/api/config/key)" = "403"

echo "== 5. data survives container replacement"
curl -sf -X POST -H 'content-type: application/json' \
  -d '{"filing":{"amount":1,"method":"verify"}}' \
  "http://127.0.0.1:$PORT/api/filing-costs?year=2099&country=us" >/dev/null
docker rm -f "$CONTAINER" >/dev/null
run_app
wait_healthy >/dev/null
check "data written before restart is still there" bash -c \
  "curl -sf 'http://127.0.0.1:$PORT/api/filing-costs?country=us' | grep -q '\"verify\"'"

echo
echo "verify-image: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
