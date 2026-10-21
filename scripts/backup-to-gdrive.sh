#!/usr/bin/env bash
# Backs up TaxLens data files (gitignored JSON) to Google Drive. They are not in git.
#
# Usage:
#   ./scripts/backup-to-gdrive.sh                # local data dir → DEST/ (pre-hosting behaviour)
#   ./scripts/backup-to-gdrive.sh --from-server  # server volume → DEST/snapshots/<timestamp>/, then latest/ (HM-14)
#
# Destination: ~/gdrive/Important Documents/Documents/Tax Return/USA/taxlens/
# Google Drive must be mounted (check: ls ~/gdrive). Uses cp, never mv: on the rclone mount
# mv silently fails to delete the source.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/gdrive/Important Documents/Documents/Tax Return/USA/taxlens"
KEEP_SNAPSHOTS=30

if [ ! -d "$HOME/gdrive/Important Documents" ]; then
  echo "ERROR: Google Drive not mounted or destination not found. Check: ls ~/gdrive" >&2
  exit 1
fi
mkdir -p "$DEST"

if [ "${1:-}" != "--from-server" ]; then
  mapfile -t DATA_FILES < <(grep -vE '^\s*(#|$)' "$PROJECT_DIR/scripts/data-files.txt")
  echo "Backing up local data files: $PROJECT_DIR → $DEST"
  for FILE in "${DATA_FILES[@]}"; do
    if [ -f "$PROJECT_DIR/$FILE" ]; then cp -v "$PROJECT_DIR/$FILE" "$DEST/$FILE"; else echo "  (skipped — not found: $FILE)"; fi
  done
  exit 0
fi

source "$PROJECT_DIR/scripts/lib-deploy.sh"
SNAPSHOT="$DEST/snapshots/$(date +%Y-%m-%d-%H%M%S)"
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT

echo "Pulling data from $TAXLENS_SSH_HOST (volume taxlens-data)…"
# Read-only mount: a backup must never be able to modify server data.
ssh "$TAXLENS_SSH_HOST" "docker run --rm -v taxlens-data:/data:ro --entrypoint sh taxlens:latest -c 'cd /data && tar -cf - \$(ls -A | grep -E \"^\\.[a-z-]+\\.json\$\")'" \
  | tar -xf - -C "$STAGING"
[ -n "$(ls -A "$STAGING")" ] || { echo "ERROR: nothing pulled from server" >&2; exit 1; }

mkdir -p "$SNAPSHOT" "$DEST/latest"
cp -v "$STAGING"/.[a-z]*.json "$SNAPSHOT/"
cp "$STAGING"/.[a-z]*.json "$DEST/latest/"
for f in "$STAGING"/.[a-z]*.json; do
  cmp -s "$f" "$SNAPSHOT/$(basename "$f")" || { echo "ERROR: verify failed for $(basename "$f")" >&2; exit 1; }
done

# Retention: keep the newest $KEEP_SNAPSHOTS snapshot directories.
mapfile -t old < <(ls -1d "$DEST/snapshots"/*/ 2>/dev/null | sort | head -n -"$KEEP_SNAPSHOTS")
for d in "${old[@]}"; do rm -rf "$d"; [ ! -e "$d" ] || echo "WARN: could not remove $d" >&2; done

echo "Snapshot: $SNAPSHOT"
echo "Latest:   $DEST/latest/"
