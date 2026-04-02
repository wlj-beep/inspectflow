#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEFAULT_BACKUP_ROOT="${ROOT_DIR}/var/backups"
PREFLIGHT_CMD="${INSPECTFLOW_OPERATOR_PREFLIGHT_CMD:-${SCRIPT_DIR}/preflight-update.sh}"
START_CMD="${INSPECTFLOW_OPERATOR_START_CMD:-${SCRIPT_DIR}/start.sh}"
HEALTH_CMD="${INSPECTFLOW_OPERATOR_HEALTH_CMD:-${SCRIPT_DIR}/healthcheck.sh}"
ROLLBACK_CMD="${INSPECTFLOW_OPERATOR_ROLLBACK_CMD:-${SCRIPT_DIR}/rollback.sh}"

usage() {
  cat <<'EOF'
Usage:
  run-operator-flow.sh <bundle-directory> [--rollback-dir <backup-directory>]

Runs the on-prem operator sequence in one pass:
1. Preflight update bundle validation
2. Service start
3. Health checks
4. Rollback-ready confirmation with an exact rollback command

If --rollback-dir is omitted, the script looks for the newest directory under var/backups.
EOF
}

log() {
  printf '%s\n' "$*"
}

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

require_file() {
  local file_path="$1"
  local label="$2"
  [[ -f "${file_path}" ]] || fail "${label} not found at ${file_path}."
}

find_latest_backup_dir() {
  local backup_root="$1"
  local latest_dir=""

  if [[ ! -d "${backup_root}" ]]; then
    return 1
  fi

  while IFS= read -r candidate; do
    [[ -n "${candidate}" ]] || continue
    latest_dir="${candidate}"
    break
  done < <(find "${backup_root}" -mindepth 1 -maxdepth 1 -type d -print 2>/dev/null | sort -r)

  [[ -n "${latest_dir}" ]] || return 1
  printf '%s\n' "${latest_dir}"
}

bundle_dir=""
rollback_dir=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --rollback-dir)
      [[ $# -ge 2 ]] || fail "--rollback-dir requires a value."
      rollback_dir="$2"
      shift 2
      ;;
    --*)
      fail "Unknown option: $1"
      ;;
    *)
      if [[ -n "${bundle_dir}" ]]; then
        fail "Only one bundle directory may be provided."
      fi
      bundle_dir="$1"
      shift
      ;;
  esac
done

[[ -n "${bundle_dir}" ]] || {
  usage
  exit 1
}

require_file "${PREFLIGHT_CMD}" "Preflight script"
require_file "${START_CMD}" "Start script"
require_file "${HEALTH_CMD}" "Health script"
require_file "${ROLLBACK_CMD}" "Rollback script"
[[ -d "${bundle_dir}" ]] || fail "Bundle directory not found: ${bundle_dir}."

if [[ -z "${rollback_dir}" ]]; then
  if rollback_dir="$(find_latest_backup_dir "${DEFAULT_BACKUP_ROOT}")"; then
    :
  else
    fail "No rollback backup directory found under ${DEFAULT_BACKUP_ROOT}. Pass --rollback-dir <backup-directory> with a known-good backup."
  fi
fi

[[ -d "${rollback_dir}" ]] || fail "Rollback backup directory not found: ${rollback_dir}."

log "Running on-prem operator flow..."
log "Bundle directory: ${bundle_dir}"
log "Rollback backup: ${rollback_dir}"

log "Step 1/4: Preflight validation"
bash "${PREFLIGHT_CMD}" "${bundle_dir}"

log "Step 2/4: Start services"
bash "${START_CMD}"

log "Step 3/4: Verify health"
bash "${HEALTH_CMD}"

log "Step 4/4: Confirm rollback readiness"
log "Rollback-ready backup: ${rollback_dir}"
log "Rollback command: bash ${ROLLBACK_CMD} ${rollback_dir}"
log "Operator flow completed."
