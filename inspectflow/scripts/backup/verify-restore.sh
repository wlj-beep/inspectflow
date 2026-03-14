#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

load_env_if_present
require_cmd psql
require_cmd pg_restore
require_database_url

backup_dir="${1:-}"
if [[ -z "${backup_dir}" ]]; then
  echo "Usage: $0 <backup-directory>" >&2
  exit 1
fi

dump_file="${backup_dir}/database.dump"
if [[ ! -f "${dump_file}" ]]; then
  log_event "error" "verify_restore" "failed" "Missing database dump" "${dump_file}"
  echo "Missing database dump: ${dump_file}" >&2
  exit 1
fi

db_segment="${DATABASE_URL##*/}"
db_name="${db_segment%%\?*}"
query_segment=""
if [[ "${db_segment}" == *"?"* ]]; then
  query_segment="?${db_segment#*\?}"
fi
base_url="${DATABASE_URL%/*}"
verify_db="${db_name}_verify_$(date -u +"%Y%m%d%H%M%S")"
verify_url="${base_url}/${verify_db}${query_segment}"

cleanup() {
  psql "${DATABASE_URL}" -c "DROP DATABASE IF EXISTS \"${verify_db}\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

log_event "info" "verify_restore" "started" "Restore verification started" "source=${backup_dir};verify_db=${verify_db}"

psql "${DATABASE_URL}" -c "DROP DATABASE IF EXISTS \"${verify_db}\";" >/dev/null
psql "${DATABASE_URL}" -c "CREATE DATABASE \"${verify_db}\";" >/dev/null

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="${verify_url}" \
  "${dump_file}" >/dev/null

summary="$(
  psql "${verify_url}" -At -F ',' -c \
    "SELECT (SELECT COUNT(*) FROM users),
            (SELECT COUNT(*) FROM jobs),
            (SELECT COUNT(*) FROM records),
            (SELECT COUNT(*) FROM part_setup_revisions);"
)"

if [[ -z "${summary}" ]]; then
  log_event "error" "verify_restore" "failed" "Verification summary query returned no data" "${verify_db}"
  echo "Restore verification failed: summary query returned no data." >&2
  exit 1
fi

log_event "info" "verify_restore" "ok" "Restore verification completed" "summary=${summary}"
echo "Restore verification passed (${summary})."
