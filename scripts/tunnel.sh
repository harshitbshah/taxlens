#!/usr/bin/env bash
# HM-13: forward localhost:3005 to the hosted TaxLens so /parse-return and /analyze-taxes
# (tax-planner) can POST to it unchanged. Requests over the tunnel skip Caddy's basic_auth
# and carry no Origin/Sec-Fetch-Site headers, so the HM-8 guard allows them.
#
# Usage: ./scripts/tunnel.sh   (Ctrl-C to close)
set -euo pipefail
source "$(dirname "$0")/lib-deploy.sh"

if ss -ltn 'sport = :3005' | grep -q LISTEN; then
  echo "Port 3005 is already in use locally — stop the local dev server first." >&2
  exit 1
fi
echo "Tunnel up: http://127.0.0.1:3005 → $TAXLENS_SSH_HOST (hosted TaxLens). Ctrl-C to close."
exec ssh -N -o ExitOnForwardFailure=yes -L 3005:127.0.0.1:3005 "$TAXLENS_SSH_HOST"
