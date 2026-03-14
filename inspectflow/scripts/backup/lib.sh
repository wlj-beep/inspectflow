#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUP_ROOT_DEFAULT="${ROOT_DIR}/var/backups"
LOG_FILE_DEFAULT="${ROOT_DIR}/var/log/backup-workflow.log"
ENV_FILE_DEFAULT="${ROOT_DIR}/deploy/onprem/.env"

BACKUP_ROOT="${BACKUP_ROOT:-${BACKUP_ROOT_DEFAULT}}"
BACKUP_LOG_FILE="${BACKUP_LOG_FILE:-${LOG_FILE_DEFAULT}}"

mkdir -p "${BACKUP_ROOT}" "$(dirname "${BACKUP_LOG_FILE}")"

now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

json_escape() {
  printf "%s" "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

log_event() {
  local level="$1"
  local action="$2"
  local status="$3"
  local message="$4"
  local details="${5:-}"
  printf '{"ts":"%s","level":"%s","action":"%s","status":"%s","message":"%s","details":"%s"}\n' \
    "$(now_utc)" \
    "$(json_escape "${level}")" \
    "$(json_escape "${action}")" \
    "$(json_escape "${status}")" \
    "$(json_escape "${message}")" \
    "$(json_escape "${details}")" >> "${BACKUP_LOG_FILE}"
}

load_env_if_present() {
  local env_file="${INSPECTFLOW_ENV_FILE:-${ENV_FILE_DEFAULT}}"
  if [[ -f "${env_file}" ]]; then
    # shellcheck source=/dev/null
    source "${env_file}"
  fi
}

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    log_event "error" "preflight" "failed" "Missing command ${cmd}" ""
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
}

require_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    log_event "error" "preflight" "failed" "DATABASE_URL is required" ""
    echo "DATABASE_URL is required" >&2
    exit 1
  fi
}
