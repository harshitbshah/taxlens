#!/usr/bin/env bash
# HM-12: copy local TaxLens data files into the server's taxlens-data volume.
# Refuses to overwrite existing server data unless --force (which snapshots it first).
#
# Usage: ./scripts/push-data-to-server.sh [--dry-run] [--force]
set -euo pipefail
source "$(dirname "$0")/lib-deploy.sh"

DRY_RUN=false; FORCE=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --force) FORCE=true ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$DEPLOY_ROOT"
present=()
for f in "${DATA_FILES[@]}"; do [ -f "$f" ] && present+=("$f"); done
[ ${#present[@]} -gt 0 ] || { echo "No local data files found in $DEPLOY_ROOT" >&2; exit 1; }

# Runs inside the app image so no extra image is pulled; the image's bun user owns /data.
in_volume() { ssh "$TAXLENS_SSH_HOST" "docker run --rm -i -v taxlens-data:/data --entrypoint sh taxlens:latest -c '$1'"; }

echo "Local files to push:"; printf '  %s\n' "${present[@]}"
remote_existing=$(in_volume 'ls -A /data' || true)
if [ -n "$remote_existing" ]; then
  echo "Server volume already contains:"; printf '  %s\n' $remote_existing
  if ! $FORCE; then echo "Refusing to overwrite without --force." >&2; exit 1; fi
fi

if $DRY_RUN; then echo "(dry run — nothing changed)"; exit 0; fi

if [ -n "$remote_existing" ]; then
  snapshot="taxlens-snapshots/pre-push-$(date +%Y%m%d-%H%M%S).tar"
  ssh "$TAXLENS_SSH_HOST" "mkdir -p taxlens-snapshots && docker run --rm -v taxlens-data:/data --entrypoint tar taxlens:latest -C /data -cf - . > $snapshot"
  echo "Snapshot of previous server data: ~/$snapshot"
fi

was_running=$(ssh "$TAXLENS_SSH_HOST" "docker ps -q -f name=^taxlens$")
# Stop the app so it can't write a file mid-copy.
[ -n "$was_running" ] && ssh "$TAXLENS_SSH_HOST" "docker stop taxlens >/dev/null"

tar -cf - "${present[@]}" | in_volume 'tar -xf - -C /data'

[ -n "$was_running" ] && ssh "$TAXLENS_SSH_HOST" "docker start taxlens >/dev/null"

echo "Checksums (local vs server):"
remote_sums=$(in_volume "cd /data && sha256sum ${present[*]}")
mismatch=0
for f in "${present[@]}"; do
  l=$(sha256sum "$f" | cut -d' ' -f1)
  r=$(grep " $f\$" <<<"$remote_sums" | cut -d' ' -f1)
  if [ "$l" = "$r" ]; then echo "  OK        $f"; else echo "  MISMATCH  $f"; mismatch=1; fi
done
exit $mismatch
