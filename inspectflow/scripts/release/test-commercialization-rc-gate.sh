#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_TMP="$(mktemp -d)"
trap 'rm -rf "${TEST_TMP}"' EXIT

assert_contains() {
  local file_path="$1"
  local expected_text="$2"

  if ! grep -Fq "${expected_text}" "${file_path}"; then
    printf 'Expected to find "%s" in %s\n' "${expected_text}" "${file_path}" >&2
    exit 1
  fi
}

write_status_fixture() {
  local file_path="$1"
  local dependency_state="$2"

  cat > "${file_path}" <<EOF
# Status

| Rank | Item ID | Priority | Status | Owner | Updated | Work Item |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | BL-092 | P0 | Claimed | @codex | 2026-03-31T10:00:00-04:00 | Commercialization RC gate automation. |

## Handoff Notes

| Date | Item ID | From | To | Note |
| --- | --- | --- | --- | --- |
| 2026-03-31 | BL-084 | @codex | @owner | ${dependency_state} runtime regression recovery. |
| 2026-03-31 | BL-085 | @codex | @owner | Completed backend test gate repair. |
| 2026-03-31 | BL-091 | @codex | @owner | Completed AS9102 regression repair. |
EOF
}

write_worklog_fixture() {
  local file_path="$1"

  cat > "${file_path}" <<'EOF'
# Work Log

| Date | Change | Owner | Reference |
| --- | --- | --- | --- |
| 2026-03-31 | Completed BL-084 runtime regression recovery and BL-085 backend test gate repair. | @codex | PR/Issue link |
| 2026-03-31 | Completed BL-091 AS9102 regression repair. | @codex | PR/Issue link |
EOF
}

run_success_case() {
  local case_dir="${TEST_TMP}/success"
  local status_file="${case_dir}/STATUS.md"
  local worklog_file="${case_dir}/WORKLOG.md"
  local evidence_dir="${case_dir}/evidence"
  local evidence_file="${evidence_dir}/success.txt"

  mkdir -p "${case_dir}" "${evidence_dir}"
  write_status_fixture "${status_file}" "Completed"
  write_worklog_fixture "${worklog_file}"

  (
    cd "${ROOT_DIR}"
    COMMERCIALIZATION_RC_STATUS_FILE="${status_file}" \
    COMMERCIALIZATION_RC_WORKLOG_FILE="${worklog_file}" \
    COMMERCIALIZATION_RC_EVIDENCE_DIR="${evidence_dir}" \
    COMMERCIALIZATION_RC_EVIDENCE_FILE="${evidence_file}" \
    COMMERCIALIZATION_RC_STAMP="2026-03-31T120000Z" \
    COMMERCIALIZATION_RC_STANDARDIZED_CMD="printf 'standardized gate ok\n'" \
    bash scripts/release/run-commercialization-rc-gate.sh
  )

  assert_contains "${evidence_file}" "PASS: BL-084 is marked completed in STATUS.md."
  assert_contains "${evidence_file}" "PASS: BL-085 has a matching WORKLOG.md record."
  assert_contains "${evidence_file}" "standardized gate ok"
  assert_contains "${evidence_file}" "Commercialization RC gate passed."
}

run_dependency_failure_case() {
  local case_dir="${TEST_TMP}/dependency-failure"
  local status_file="${case_dir}/STATUS.md"
  local worklog_file="${case_dir}/WORKLOG.md"
  local evidence_dir="${case_dir}/evidence"
  local evidence_file="${evidence_dir}/dependency-failure.txt"

  mkdir -p "${case_dir}" "${evidence_dir}"
  write_status_fixture "${status_file}" "Blocked"
  write_worklog_fixture "${worklog_file}"

  if (
    cd "${ROOT_DIR}"
    COMMERCIALIZATION_RC_STATUS_FILE="${status_file}" \
    COMMERCIALIZATION_RC_WORKLOG_FILE="${worklog_file}" \
    COMMERCIALIZATION_RC_EVIDENCE_DIR="${evidence_dir}" \
    COMMERCIALIZATION_RC_EVIDENCE_FILE="${evidence_file}" \
    COMMERCIALIZATION_RC_STAMP="2026-03-31T120100Z" \
    COMMERCIALIZATION_RC_STANDARDIZED_CMD="printf 'should not run\n'" \
    bash scripts/release/run-commercialization-rc-gate.sh
  ); then
    printf 'Expected dependency failure case to exit non-zero.\n' >&2
    exit 1
  fi

  assert_contains "${evidence_file}" "FAIL: BL-084 must be marked completed in STATUS.md before the RC gate can close."
}

run_standardized_failure_case() {
  local case_dir="${TEST_TMP}/standardized-failure"
  local status_file="${case_dir}/STATUS.md"
  local worklog_file="${case_dir}/WORKLOG.md"
  local evidence_dir="${case_dir}/evidence"
  local evidence_file="${evidence_dir}/standardized-failure.txt"

  mkdir -p "${case_dir}" "${evidence_dir}"
  write_status_fixture "${status_file}" "Completed"
  write_worklog_fixture "${worklog_file}"

  if (
    cd "${ROOT_DIR}"
    COMMERCIALIZATION_RC_STATUS_FILE="${status_file}" \
    COMMERCIALIZATION_RC_WORKLOG_FILE="${worklog_file}" \
    COMMERCIALIZATION_RC_EVIDENCE_DIR="${evidence_dir}" \
    COMMERCIALIZATION_RC_EVIDENCE_FILE="${evidence_file}" \
    COMMERCIALIZATION_RC_STAMP="2026-03-31T120200Z" \
    COMMERCIALIZATION_RC_STANDARDIZED_CMD="printf 'standardized gate failed\n'; exit 3" \
    bash scripts/release/run-commercialization-rc-gate.sh
  ); then
    printf 'Expected standardized command failure case to exit non-zero.\n' >&2
    exit 1
  fi

  assert_contains "${evidence_file}" "standardized gate failed"
}

run_required_artifact_failure_case() {
  local case_dir="${TEST_TMP}/required-artifact-failure"
  local status_file="${case_dir}/STATUS.md"
  local worklog_file="${case_dir}/WORKLOG.md"
  local evidence_dir="${case_dir}/evidence"
  local evidence_file="${evidence_dir}/required-artifact-failure.txt"
  local missing_report="${case_dir}/2026-04-01-C8-run-report.md"

  mkdir -p "${case_dir}" "${evidence_dir}"
  write_status_fixture "${status_file}" "Completed"
  write_worklog_fixture "${worklog_file}"

  if (
    cd "${ROOT_DIR}"
    COMMERCIALIZATION_RC_STATUS_FILE="${status_file}" \
    COMMERCIALIZATION_RC_WORKLOG_FILE="${worklog_file}" \
    COMMERCIALIZATION_RC_EVIDENCE_DIR="${evidence_dir}" \
    COMMERCIALIZATION_RC_EVIDENCE_FILE="${evidence_file}" \
    COMMERCIALIZATION_RC_STAMP="2026-03-31T120300Z" \
    COMMERCIALIZATION_RC_CYCLE_REPORT_FILE="${missing_report}" \
    COMMERCIALIZATION_RC_STANDARDIZED_CMD="printf 'should not run\n'" \
    bash scripts/release/run-commercialization-rc-gate.sh
  ); then
    printf 'Expected required artifact failure case to exit non-zero.\n' >&2
    exit 1
  fi

  assert_contains "${evidence_file}" "FAIL: Required artifact not found at ${missing_report}."
}

run_success_case
run_dependency_failure_case
run_standardized_failure_case
run_required_artifact_failure_case

printf 'Commercialization RC gate self-test passed.\n'
