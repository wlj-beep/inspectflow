#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

load_env_if_present
require_cmd pg_restore
require_cmd psql
require_database_url

backup_dir="${1:-}"
if [[ -z "${backup_dir}" ]]; then
  echo "Usage: $0 <backup-directory>" >&2
  exit 1
fi

dump_file="${backup_dir}/database.dump"
if [[ ! -f "${dump_file}" ]]; then
  log_event "error" "restore" "failed" "Missing database dump" "${dump_file}"
  echo "Missing database dump: ${dump_file}" >&2
  exit 1
fi

log_event "info" "restore" "started" "Restore started" "source=${backup_dir}"

# Validate target connection before restore.
psql "${DATABASE_URL}" -c "SELECT 1;" >/dev/null

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="${DATABASE_URL}" \
  "${dump_file}"

log_event "info" "restore" "ok" "Restore completed" "source=${backup_dir}"
echo "Restore completed from ${backup_dir}"
