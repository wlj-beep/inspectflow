#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${ROOT_DIR}/docs/operations/cycles/evidence"
STAMP_UTC="$(date -u +"%Y-%m-%d")"
RUN_ID="$(date -u +"%Y%m%dT%H%M%SZ")"
LOG_FILE="${R1_ACCEPTANCE_LOG_FILE:-${EVIDENCE_DIR}/${STAMP_UTC}-r1-acceptance-matrix.txt}"
DEFAULT_DATABASE_URL_TEST="postgres://postgres@localhost:5432/inspectflow_test"
DEFAULT_DATABASE_URL="postgres://postgres@localhost:5432/inspectflow"

mkdir -p "${EVIDENCE_DIR}"
cd "${ROOT_DIR}"

if ! command -v psql >/dev/null 2>&1 || ! command -v pg_dump >/dev/null 2>&1 || ! command -v pg_restore >/dev/null 2>&1; then
  if [[ -d "/Applications/Postgres.app/Contents/Versions/15/bin" ]]; then
    export PATH="/Applications/Postgres.app/Contents/Versions/15/bin:${PATH}"
  fi
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "Missing required command: psql" >&2
  exit 1
fi
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Missing required command: pg_dump" >&2
  exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "Missing required command: pg_restore" >&2
  exit 1
fi

export DATABASE_URL_TEST="${DATABASE_URL_TEST:-${DEFAULT_DATABASE_URL_TEST}}"
export DATABASE_URL="${DATABASE_URL:-${DEFAULT_DATABASE_URL}}"
if [[ -z "${INSPECTFLOW_UPDATE_SIGNING_KEY:-}" && -z "${INSPECTFLOW_UPDATE_SIGNING_KEY_FILE:-}" ]]; then
  export INSPECTFLOW_UPDATE_SIGNING_KEY="$(openssl rand -hex 32)"
  echo "Generated ephemeral update signing key for this acceptance run."
fi

exec > >(tee "${LOG_FILE}") 2>&1

run_step() {
  local label="$1"
  shift
  echo ""
  echo "== ${label} =="
  "$@"
  echo "== PASS: ${label} =="
}

echo "R1 acceptance matrix started at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Repository: ${ROOT_DIR}"
echo "Evidence log: ${LOG_FILE}"
echo "DATABASE_URL_TEST=${DATABASE_URL_TEST}"
echo "DATABASE_URL=${DATABASE_URL}"

run_step "Standardized gate (coordination + API + UI mock + UI live)" npm run test:standardized
bundle_dir="${ROOT_DIR}/var/update-bundles/r1-acceptance-${RUN_ID}"
run_step "Offline update bundle create" bash deploy/onprem/create-update-bundle.sh "${bundle_dir}" --release-id "r1-acceptance-${RUN_ID}"
run_step "Offline update bundle verify" bash deploy/onprem/verify-update-bundle.sh "${bundle_dir}"
run_step "Offline update preflight" bash deploy/onprem/preflight-update.sh "${bundle_dir}"

echo ""
echo "== Backup create =="
backup_output="$(bash scripts/backup/backup.sh)"
echo "${backup_output}"
backup_dir="$(printf "%s\n" "${backup_output}" | tail -n 1)"
if [[ -z "${backup_dir}" || ! -d "${backup_dir}" ]]; then
  echo "Backup script did not return a valid backup directory." >&2
  exit 1
fi
echo "Captured backup directory: ${backup_dir}"
echo "== PASS: Backup create =="

run_step "Backup restore verification" bash scripts/backup/verify-restore.sh "${backup_dir}"

echo ""
echo "R1 acceptance matrix completed at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
