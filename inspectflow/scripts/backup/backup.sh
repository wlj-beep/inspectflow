#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

load_env_if_present
require_cmd pg_dump
require_cmd find
require_database_url

retention_days="${BACKUP_RETENTION_DAYS:-14}"
run_id="$(date -u +"%Y%m%dT%H%M%SZ")"
backup_dir="${BACKUP_ROOT}/${run_id}"
db_dump_file="${backup_dir}/database.dump"
manifest_file="${backup_dir}/manifest.json"
config_archive="${backup_dir}/config.tgz"

mkdir -p "${backup_dir}"

log_event "info" "backup" "started" "Backup started" "run_id=${run_id}"

pg_dump --format=custom --file="${db_dump_file}" "${DATABASE_URL}"

config_items=()
[[ -f "${ROOT_DIR}/backend/.env" ]] && config_items+=("backend/.env")
[[ -f "${ROOT_DIR}/deploy/onprem/.env" ]] && config_items+=("deploy/onprem/.env")
if [[ "${#config_items[@]}" -gt 0 ]]; then
  (
    cd "${ROOT_DIR}"
    tar -czf "${config_archive}" "${config_items[@]}"
  )
fi

cat > "${manifest_file}" <<EOF
{
  "runId": "${run_id}",
  "createdAt": "$(now_utc)",
  "databaseDump": "$(basename "${db_dump_file}")",
  "configArchive": "$(basename "${config_archive}")",
  "retentionDays": ${retention_days}
}
EOF

if [[ "${retention_days}" =~ ^[0-9]+$ ]] && [[ "${retention_days}" -gt 0 ]]; then
  while IFS= read -r stale_dir; do
    log_event "info" "backup_prune" "started" "Pruning stale backup" "${stale_dir}"
    rm -rf "${stale_dir}"
    log_event "info" "backup_prune" "ok" "Pruned stale backup" "${stale_dir}"
  done < <(find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +"${retention_days}" -print)
fi

log_event "info" "backup" "ok" "Backup completed" "path=${backup_dir}"
echo "${backup_dir}"
