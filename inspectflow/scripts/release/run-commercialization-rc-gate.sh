#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATUS_FILE="${COMMERCIALIZATION_RC_STATUS_FILE:-${ROOT_DIR}/STATUS.md}"
WORKLOG_FILE="${COMMERCIALIZATION_RC_WORKLOG_FILE:-${ROOT_DIR}/WORKLOG.md}"
EVIDENCE_DIR="${COMMERCIALIZATION_RC_EVIDENCE_DIR:-${ROOT_DIR}/docs/operations/cycles/evidence}"
STAMP="${COMMERCIALIZATION_RC_STAMP:-$(date -u +"%Y-%m-%dT%H%M%SZ")}"
EVIDENCE_FILE="${COMMERCIALIZATION_RC_EVIDENCE_FILE:-${EVIDENCE_DIR}/${STAMP}-commercialization-rc-gate.txt}"
STANDARDIZED_CMD="${COMMERCIALIZATION_RC_STANDARDIZED_CMD:-npm run test:standardized}"
REQUIRED_DEPENDENCY_IDS=(BL-084 BL-085 BL-091)
CYCLE_REPORT_FILE="${COMMERCIALIZATION_RC_CYCLE_REPORT_FILE:-}"
REQUIRED_ARTIFACTS_RAW="${COMMERCIALIZATION_RC_REQUIRED_ARTIFACTS:-}"

mkdir -p "${EVIDENCE_DIR}"
touch "${EVIDENCE_FILE}"

log() {
  printf '%s\n' "$*" | tee -a "${EVIDENCE_FILE}"
}

fail() {
  log "FAIL: $*"
  exit 1
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "${value}"
}

required_artifact_paths() {
  local raw="${REQUIRED_ARTIFACTS_RAW}"
  if [[ -n "${CYCLE_REPORT_FILE}" ]]; then
    if [[ -n "${raw}" ]]; then
      raw="${raw},${CYCLE_REPORT_FILE}"
    else
      raw="${CYCLE_REPORT_FILE}"
    fi
  fi

  if [[ -z "$(trim "${raw}")" ]]; then
    return 0
  fi

  local item
  local artifact_paths=()
  local old_ifs="${IFS}"
  IFS=','
  read -r -a artifact_paths <<< "${raw}"
  IFS="${old_ifs}"

  if [[ "${#artifact_paths[@]}" -eq 0 ]]; then
    return 0
  fi

  for item in "${artifact_paths[@]}"; do
    item="$(trim "${item}")"
    if [[ -n "${item}" ]]; then
      printf '%s\n' "${item}"
    fi
  done
}

validate_required_artifacts() {
  local checked_any="false"
  while IFS= read -r artifact_path; do
    checked_any="true"
    if [[ ! -e "${artifact_path}" ]]; then
      fail "Required artifact not found at ${artifact_path}."
    fi
    log "PASS: required artifact is present at ${artifact_path}."
  done < <(required_artifact_paths)

  if [[ "${checked_any}" == "true" ]]; then
    log "Required evidence artifacts are present."
  fi
}

run_command_and_log() {
  (
    cd "${ROOT_DIR}"
    bash -lc "${STANDARDIZED_CMD}"
  ) 2>&1 | tee -a "${EVIDENCE_FILE}"
}

status_dependency_completed() {
  local dependency_id="$1"
  awk -F'|' -v dependency_id="${dependency_id}" '
    {
      for (i = 1; i <= NF; i += 1) {
        gsub(/^[ \t]+|[ \t]+$/, "", $i)
      }
    }
    {
      row_has_dependency = 0
      for (i = 1; i <= NF; i += 1) {
        if ($i == dependency_id) {
          row_has_dependency = 1
        }
      }
      if (row_has_dependency && $0 ~ /Completed/) {
        found = 1
      }
    }
    END {
      exit found ? 0 : 1
    }
  ' "${STATUS_FILE}"
}

worklog_mentions_dependency() {
  local dependency_id="$1"
  grep -Eq "(Completed .*${dependency_id}|${dependency_id}.*Completed)" "${WORKLOG_FILE}"
}

log "Commercialization RC gate started at ${STAMP}"
log "Repository: ${ROOT_DIR}"
log "Status file: ${STATUS_FILE}"
log "Worklog file: ${WORKLOG_FILE}"
log "Evidence file: ${EVIDENCE_FILE}"
log "Standardized command: ${STANDARDIZED_CMD}"
if [[ -n "${CYCLE_REPORT_FILE}" ]]; then
  log "Cycle report file: ${CYCLE_REPORT_FILE}"
fi

cd "${ROOT_DIR}"

for required_command in awk bash date grep npm tee; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    fail "Required command '${required_command}' is not available."
  fi
done

[[ -f "${STATUS_FILE}" ]] || fail "Status file not found at ${STATUS_FILE}."
[[ -f "${WORKLOG_FILE}" ]] || fail "Worklog file not found at ${WORKLOG_FILE}."
[[ -n "${STANDARDIZED_CMD//[[:space:]]/}" ]] || fail "Standardized command must not be empty."

log "Checking required evidence artifacts..."
validate_required_artifacts

log "Checking prerequisite backlog recoveries..."
for dependency_id in "${REQUIRED_DEPENDENCY_IDS[@]}"; do
  if ! status_dependency_completed "${dependency_id}"; then
    fail "${dependency_id} must be marked completed in STATUS.md before the RC gate can close."
  fi

  log "PASS: ${dependency_id} is marked completed in STATUS.md."

  if worklog_mentions_dependency "${dependency_id}"; then
    log "PASS: ${dependency_id} has a matching WORKLOG.md record."
  else
    log "WARN: ${dependency_id} is not yet called out in WORKLOG.md; attach this evidence file to the release record before sign-off."
  fi
done

if [[ -z "${DATABASE_URL_TEST:-}" ]]; then
  export DATABASE_URL_TEST="postgres://postgres@localhost:5432/inspectflow_test"
  log "DATABASE_URL_TEST not set; defaulting to ${DATABASE_URL_TEST} for standardized/live UI checks."
fi

log "Running standardized commercialization gate..."
run_command_and_log

log "Commercialization RC gate passed."
log "Attach this evidence file in the release runbook/worklog record for BL-092 sign-off."
log "Evidence written to ${EVIDENCE_FILE}"
