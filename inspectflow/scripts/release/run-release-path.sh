#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NPM_BIN="${RELEASE_PATH_NPM_BIN:-npm}"
STAMP="${RELEASE_PATH_STAMP:-$(date -u +"%Y-%m-%dT%H%M%SZ")}"
EVIDENCE_ROOT="${RELEASE_PATH_EVIDENCE_ROOT:-${ROOT_DIR}/docs/operations/cycles/evidence}"
BUNDLE_NAME="${RELEASE_PATH_BUNDLE_NAME:-${STAMP}-release-path}"
BUNDLE_DIR="${RELEASE_PATH_BUNDLE_DIR:-${EVIDENCE_ROOT}/${BUNDLE_NAME}}"
SUMMARY_LOG="${BUNDLE_DIR}/release-path.log"
MANIFEST_FILE="${BUNDLE_DIR}/manifest.md"
LOAD_SUMMARY_FILE="${BUNDLE_DIR}/commercialization-load-summary.json"
LOAD_EVIDENCE_FILE="${BUNDLE_DIR}/commercialization-load-gate.txt"
RC_EVIDENCE_FILE="${BUNDLE_DIR}/commercialization-rc-gate.txt"
CYCLE_REPORT_FILE="${BUNDLE_DIR}/cycle-report.md"
USAGE_FILE="${BUNDLE_DIR}/release-path-usage.json"

STEP_NAMES=()
STEP_STATUSES=()
STEP_LOGS=()
FAILED_STEP=""
FAILED_EXIT_CODE=0

mkdir -p "${BUNDLE_DIR}"
touch "${SUMMARY_LOG}"

timestamp_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log_summary() {
  printf '%s\n' "$*" | tee -a "${SUMMARY_LOG}"
}

record_step() {
  STEP_NAMES+=("$1")
  STEP_STATUSES+=("$2")
  STEP_LOGS+=("$3")
}

format_command() {
  local formatted=""
  local part
  for part in "$@"; do
    if [[ -n "${formatted}" ]]; then
      formatted+=" "
    fi
    formatted+="$(printf '%q' "${part}")"
  done
  printf '%s' "${formatted}"
}

write_manifest() {
  local exit_code="${1:-0}"
  local overall_status="PASS"
  if [[ "${exit_code}" -ne 0 ]]; then
    overall_status="FAIL"
  fi

  {
    printf '# Release Path Bundle\n\n'
    printf -- '- `Generated`: `%s`\n' "$(timestamp_utc)"
    printf -- '- `Bundle`: `%s`\n' "${BUNDLE_DIR}"
    printf -- '- `Overall Status`: `%s`\n' "${overall_status}"
    if [[ -n "${FAILED_STEP}" ]]; then
      printf -- '- `Failed Step`: `%s`\n' "${FAILED_STEP}"
      printf -- '- `Failed Exit Code`: `%s`\n' "${FAILED_EXIT_CODE}"
    fi
    printf '\n## Steps\n'

    local i
    for (( i = 0; i < ${#STEP_NAMES[@]}; i += 1 )); do
      printf -- '- `%s`: `%s` (`%s`)\n' "${STEP_NAMES[$i]}" "${STEP_STATUSES[$i]}" "${STEP_LOGS[$i]}"
    done

    printf '\n## Key Artifacts\n'
    printf -- '- `Manifest`: `%s`\n' "${MANIFEST_FILE}"
    printf -- '- `Summary Log`: `%s`\n' "${SUMMARY_LOG}"
    printf -- '- `Load Gate Evidence`: `%s`\n' "${LOAD_EVIDENCE_FILE}"
    printf -- '- `Load Gate Summary`: `%s`\n' "${LOAD_SUMMARY_FILE}"
    printf -- '- `RC Gate Evidence`: `%s`\n' "${RC_EVIDENCE_FILE}"
    printf -- '- `Cycle Report`: `%s`\n' "${CYCLE_REPORT_FILE}"
    printf -- '- `Release Path Usage`: `%s`\n' "${USAGE_FILE}"
  } > "${MANIFEST_FILE}"
}

finish() {
  local exit_code="$1"
  write_manifest "${exit_code}"
  if [[ "${exit_code}" -eq 0 ]]; then
    log_summary "Release path completed successfully."
    log_summary "Bundle written to ${BUNDLE_DIR}"
  else
    log_summary "Release path failed."
    log_summary "Bundle written to ${BUNDLE_DIR}"
  fi
}

trap 'release_path_exit_code=$?; trap - EXIT; finish "${release_path_exit_code}"; exit "${release_path_exit_code}"' EXIT

run_step() {
  local slug="$1"
  shift
  local step_log="${BUNDLE_DIR}/${slug}.log"
  local started_at
  started_at="$(timestamp_utc)"

  : > "${step_log}"
  printf 'Step: %s\n' "${slug}" >> "${step_log}"
  printf 'Started: %s\n' "${started_at}" >> "${step_log}"
  printf 'Command: %s\n\n' "$(format_command "$@")" >> "${step_log}"

  log_summary "Running ${slug}: $(format_command "$@")"

  local exit_code=0
  set +e
  (
    cd "${ROOT_DIR}"
    "$@"
  ) >> "${step_log}" 2>&1
  exit_code=$?
  set -e

  if [[ "${exit_code}" -eq 0 ]]; then
    record_step "${slug}" "PASS" "${step_log}"
    log_summary "PASS: ${slug}"
    return 0
  fi

  FAILED_STEP="${slug}"
  FAILED_EXIT_CODE="${exit_code}"
  record_step "${slug}" "FAIL" "${step_log}"
  log_summary "FAIL: ${slug}"
  return "${FAILED_EXIT_CODE}"
}

run_required_step() {
  run_step "$@" || exit "${FAILED_EXIT_CODE}"
}

for required_command in bash date mkdir tee "${NPM_BIN}"; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "${required_command}" >&2
    exit 1
  fi
done

export COMMERCIALIZATION_LOAD_EVIDENCE_DIR="${BUNDLE_DIR}"
export COMMERCIALIZATION_LOAD_OUTPUT_DIR="${BUNDLE_DIR}"
export COMMERCIALIZATION_LOAD_SUMMARY_FILE="${LOAD_SUMMARY_FILE}"
export COMMERCIALIZATION_LOAD_EVIDENCE_FILE="${LOAD_EVIDENCE_FILE}"
export COMMERCIALIZATION_LOAD_STAMP="${STAMP}"

export COMMERCIALIZATION_RC_EVIDENCE_DIR="${BUNDLE_DIR}"
export COMMERCIALIZATION_RC_EVIDENCE_FILE="${RC_EVIDENCE_FILE}"
export COMMERCIALIZATION_RC_STAMP="${STAMP}"

log_summary "Release path bundle directory: ${BUNDLE_DIR}"

run_required_step "01-test-coordination" "${NPM_BIN}" run test:coordination
run_required_step "02-test-api" "${NPM_BIN}" run test:api
run_required_step "03-test-ui-mock" "${NPM_BIN}" run test:ui:mock
run_required_step "04-test-ui-live" "${NPM_BIN}" run test:ui:live
run_required_step "05-gate-commercialization-load" "${NPM_BIN}" run gate:commercialization:load
run_required_step "06-gate-commercialization-rc" "${NPM_BIN}" run gate:commercialization:rc

cat > "${USAGE_FILE}" <<EOF
{
  "usage": {
    "prompt_tokens": 1,
    "completion_tokens": 0,
    "total_tokens": 1,
    "cost": 0
  }
}
EOF

run_required_step "07-cycle-report" "${NPM_BIN}" run ops:cycle:report:auto -- \
  --cycle "${RELEASE_PATH_REPORT_CYCLE:-${STAMP}-release-path}" \
  --window "${RELEASE_PATH_REPORT_WINDOW:-release path}" \
  --controller "${RELEASE_PATH_REPORT_CONTROLLER:-release-path}" \
  --bl "${RELEASE_PATH_REPORT_BL:-BL-114,BL-115,BL-116,BL-117,BL-118}" \
  --tracks "${RELEASE_PATH_REPORT_TRACKS:-release-path,bundle}" \
  --usage "${USAGE_FILE}" \
  --requireArtifact "${LOAD_EVIDENCE_FILE}" \
  --requireArtifact "${RC_EVIDENCE_FILE}" \
  --out "${CYCLE_REPORT_FILE}" \
  --controllerPromptTokens "${RELEASE_PATH_CONTROLLER_PROMPT_TOKENS:-1}" \
  --acceptedChanges "${RELEASE_PATH_ACCEPTED_CHANGES:-5}" \
  --inputRatePerMillion "${RELEASE_PATH_INPUT_RATE_PER_MILLION:-0}" \
  --outputRatePerMillion "${RELEASE_PATH_OUTPUT_RATE_PER_MILLION:-0}"
