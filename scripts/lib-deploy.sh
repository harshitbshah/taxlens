# Shared by the hosted-mode scripts (HM-11…HM-14). Source, don't execute.
# Real host/domain live in deploy/local.env (gitignored) so they never reach the public repo.
DEPLOY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV="$DEPLOY_ROOT/deploy/local.env"

if [ ! -f "$LOCAL_ENV" ]; then
  echo "Missing $LOCAL_ENV — copy deploy/local.env.example and fill it in." >&2
  exit 1
fi
# shellcheck source=/dev/null
source "$LOCAL_ENV"
: "${TAXLENS_SSH_HOST:?set in deploy/local.env}"
: "${TAXLENS_DOMAIN:?set in deploy/local.env}"
: "${TAXLENS_REMOTE_DIR:?set in deploy/local.env}"

# One list of data files for migration and backups. .env is deliberately absent: the server key
# lives in deploy/.env on the server, and the laptop's .env must never be copied anywhere.
DATA_FILES_LIST="$DEPLOY_ROOT/scripts/data-files.txt"
mapfile -t DATA_FILES < <(grep -vE '^\s*(#|$)' "$DATA_FILES_LIST")
