#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./update-lib.sh
source "${SCRIPT_DIR}/update-lib.sh"

usage() {
  cat <<'EOF'
Usage:
  apply-update-bundle.sh <bundle-directory> [--dry-run]

Applies a verified update bundle with automatic backup and rollback on failure.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

bundle_dir=""
dry_run="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      dry_run="true"
      shift
      ;;
    *)
      if [[ -z "${bundle_dir}" ]]; then
        bundle_dir="$1"
        shift
      else
        echo "Unexpected argument: $1" >&2
        usage
        exit 1
      fi
      ;;
  esac
done

if [[ -z "${bundle_dir}" ]]; then
  usage
  exit 1
fi

load_onprem_env

payload_file="${bundle_dir}/payload.tar.gz"
if [[ ! -f "${payload_file}" ]]; then
  echo "Missing payload archive: ${payload_file}" >&2
  exit 1
fi

echo "Running update preflight..."
bash "${SCRIPT_DIR}/preflight-update.sh" "${bundle_dir}"

if [[ "${dry_run}" == "true" ]]; then
  echo "Dry run requested. Preflight passed; update not applied."
  exit 0
fi

rollback_on_failure() {
  local failed_step="$1"
  local backup_dir="$2"
  echo "Update step failed: ${failed_step}" >&2
  if [[ -z "${backup_dir}" ]]; then
    echo "No backup directory available. Manual recovery required." >&2
    exit 1
  fi
  echo "Attempting rollback from ${backup_dir}..."
  if bash "${SCRIPT_DIR}/rollback.sh" "${backup_dir}"; then
    echo "Rollback completed."
  else
    echo "Rollback failed. Manual intervention required." >&2
  fi
  exit 1
}

echo "Creating pre-update backup..."
backup_dir="$(bash "${ROOT_DIR}/scripts/backup/backup.sh")"
echo "Backup created: ${backup_dir}"

echo "Stopping services..."
if ! bash "${SCRIPT_DIR}/stop.sh"; then
  rollback_on_failure "stop-services" "${backup_dir}"
fi

echo "Extracting payload..."
if ! tar -xzf "${payload_file}" -C "${ROOT_DIR}"; then
  rollback_on_failure "extract-payload" "${backup_dir}"
fi

if [[ "${INSPECTFLOW_UPDATE_RUN_INSTALL:-false}" == "true" ]]; then
  echo "Running npm install steps..."
  if ! npm install || ! npm install --prefix backend || ! npm install --prefix frontend; then
    rollback_on_failure "npm-install" "${backup_dir}"
  fi
fi

echo "Applying database migrations..."
if ! npm run db:migrate --prefix backend; then
  rollback_on_failure "db-migrate" "${backup_dir}"
fi

echo "Building frontend assets..."
if ! npm run build --prefix frontend; then
  rollback_on_failure "frontend-build" "${backup_dir}"
fi

echo "Starting services..."
if ! bash "${SCRIPT_DIR}/start.sh"; then
  rollback_on_failure "start-services" "${backup_dir}"
fi

echo "Running health checks..."
if ! bash "${SCRIPT_DIR}/healthcheck.sh"; then
  rollback_on_failure "healthcheck" "${backup_dir}"
fi

echo "Update applied successfully."
echo "Backup retained for fallback: ${backup_dir}"
