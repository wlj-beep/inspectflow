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

write_baseline_fixture() {
  local file_path="$1"
  local pass_state="$2"
  local multiplier="$3"

  cat > "${file_path}" <<EOF
{
  "contractId": "PLAT-TEST-v1",
  "backlogId": "BL-056",
  "startedAt": "2026-03-15T12:42:46Z",
  "completedAt": "2026-03-15T12:42:46Z",
  "mode": "dry_run",
  "seed": "inspectflow-bl056",
  "multiplier": ${multiplier},
  "totalJobs": 250,
  "totalMeasurementRows": 2500,
  "checks": {
    "generatorProducedRows": true,
    "liveIngestExecuted": false
  },
  "pass": ${pass_state}
}
EOF
}

write_observed_fixture() {
  local file_path="$1"
  local import_p95="$2"
  local error_rate="$3"
  local duplicate_writes="$4"

  cat > "${file_path}" <<EOF
{
  "totalJobs": 625,
  "totalMeasurementRows": 6250,
  "importP95Ms": ${import_p95},
  "dashboardP95Ms": 780,
  "queueDrainSeconds": 510,
  "errorRatePct": ${error_rate},
  "duplicateWrites": ${duplicate_writes},
  "replayFailures": 0,
  "supportBundleLeak": false
}
EOF
}

run_success_case() {
  local case_dir="${TEST_TMP}/success"
  local baseline_file="${case_dir}/bl056.json"
  local observed_file="${case_dir}/observed.json"
  local summary_file="${case_dir}/summary.json"
  local evidence_file="${case_dir}/evidence.txt"

  mkdir -p "${case_dir}"
  write_baseline_fixture "${baseline_file}" "true" "10"
  write_observed_fixture "${observed_file}" "1100" "0.4" "0"

  (
    cd "${ROOT_DIR}"
    COMMERCIALIZATION_LOAD_BASELINE_FILE="${baseline_file}" \
    COMMERCIALIZATION_LOAD_OBSERVED_FILE="${observed_file}" \
    COMMERCIALIZATION_LOAD_SUMMARY_FILE="${summary_file}" \
    COMMERCIALIZATION_LOAD_EVIDENCE_FILE="${evidence_file}" \
    COMMERCIALIZATION_LOAD_STAMP="2026-03-31T162500Z" \
    bash scripts/load/run-commercialization-load-gate.sh
  )

  assert_contains "${evidence_file}" "PASS: commercialization_volume - Observed volume meets 25x commercialization target"
  assert_contains "${evidence_file}" "Overall result: PASS"
  assert_contains "${summary_file}" "\"fixtureId\": null"
  assert_contains "${summary_file}" "\"pass\": true"
}

run_baseline_failure_case() {
  local case_dir="${TEST_TMP}/baseline-failure"
  local baseline_file="${case_dir}/bl056.json"
  local summary_file="${case_dir}/summary.json"
  local evidence_file="${case_dir}/evidence.txt"

  mkdir -p "${case_dir}"
  write_baseline_fixture "${baseline_file}" "false" "9"

  if (
    cd "${ROOT_DIR}"
    COMMERCIALIZATION_LOAD_BASELINE_FILE="${baseline_file}" \
    COMMERCIALIZATION_LOAD_SUMMARY_FILE="${summary_file}" \
    COMMERCIALIZATION_LOAD_EVIDENCE_FILE="${evidence_file}" \
    COMMERCIALIZATION_LOAD_STAMP="2026-03-31T162600Z" \
    bash scripts/load/run-commercialization-load-gate.sh
  ); then
    printf 'Expected baseline failure case to exit non-zero.\n' >&2
    exit 1
  fi

  assert_contains "${evidence_file}" "FAIL: baseline_passed - BL-056 baseline artifact passed"
  assert_contains "${evidence_file}" "FAIL: baseline_multiplier_floor - BL-056 baseline multiplier is at least 10x"
  assert_contains "${evidence_file}" "Overall result: FAIL"
}

run_budget_failure_case() {
  local case_dir="${TEST_TMP}/budget-failure"
  local baseline_file="${case_dir}/bl056.json"
  local observed_file="${case_dir}/observed.json"
  local summary_file="${case_dir}/summary.json"
  local evidence_file="${case_dir}/evidence.txt"

  mkdir -p "${case_dir}"
  write_baseline_fixture "${baseline_file}" "true" "10"
  write_observed_fixture "${observed_file}" "1450" "1.4" "1"

  if (
    cd "${ROOT_DIR}"
    COMMERCIALIZATION_LOAD_BASELINE_FILE="${baseline_file}" \
    COMMERCIALIZATION_LOAD_OBSERVED_FILE="${observed_file}" \
    COMMERCIALIZATION_LOAD_SUMMARY_FILE="${summary_file}" \
    COMMERCIALIZATION_LOAD_EVIDENCE_FILE="${evidence_file}" \
    COMMERCIALIZATION_LOAD_STAMP="2026-03-31T162700Z" \
    bash scripts/load/run-commercialization-load-gate.sh
  ); then
    printf 'Expected budget failure case to exit non-zero.\n' >&2
    exit 1
  fi

  assert_contains "${evidence_file}" "FAIL: import_latency_budget - Import p95 stays within 1200 ms"
  assert_contains "${evidence_file}" "FAIL: error_rate_budget - Error rate stays within 1%"
  assert_contains "${evidence_file}" "FAIL: duplicate_write_budget - Duplicate writes stay within 0"
  assert_contains "${evidence_file}" "Overall result: FAIL"
}

run_required_artifact_failure_case() {
  local case_dir="${TEST_TMP}/required-artifact-failure"
  local baseline_file="${case_dir}/bl056.json"
  local observed_file="${case_dir}/observed.json"
  local summary_file="${case_dir}/summary.json"
  local evidence_file="${case_dir}/evidence.txt"
  local missing_artifact="${case_dir}/missing-cycle-report.md"

  mkdir -p "${case_dir}"
  write_baseline_fixture "${baseline_file}" "true" "10"
  write_observed_fixture "${observed_file}" "1100" "0.4" "0"

  if (
    cd "${ROOT_DIR}"
    COMMERCIALIZATION_LOAD_BASELINE_FILE="${baseline_file}" \
    COMMERCIALIZATION_LOAD_OBSERVED_FILE="${observed_file}" \
    COMMERCIALIZATION_LOAD_SUMMARY_FILE="${summary_file}" \
    COMMERCIALIZATION_LOAD_EVIDENCE_FILE="${evidence_file}" \
    COMMERCIALIZATION_LOAD_REQUIRED_ARTIFACTS="${missing_artifact}" \
    COMMERCIALIZATION_LOAD_STAMP="2026-03-31T162800Z" \
    bash scripts/load/run-commercialization-load-gate.sh
  ); then
    printf 'Expected required artifact failure case to exit non-zero.\n' >&2
    exit 1
  fi

  assert_contains "${evidence_file}" "FAIL: Required artifact not found at ${missing_artifact}."
}

run_invalid_json_failure_case() {
  local case_dir="${TEST_TMP}/invalid-json-failure"
  local baseline_file="${case_dir}/bl056.json"
  local observed_file="${case_dir}/observed.json"
  local summary_file="${case_dir}/summary.json"
  local evidence_file="${case_dir}/evidence.txt"

  mkdir -p "${case_dir}"
  write_baseline_fixture "${baseline_file}" "true" "10"
  printf '{ invalid json }\n' > "${observed_file}"

  if (
    cd "${ROOT_DIR}"
    COMMERCIALIZATION_LOAD_BASELINE_FILE="${baseline_file}" \
    COMMERCIALIZATION_LOAD_OBSERVED_FILE="${observed_file}" \
    COMMERCIALIZATION_LOAD_SUMMARY_FILE="${summary_file}" \
    COMMERCIALIZATION_LOAD_EVIDENCE_FILE="${evidence_file}" \
    COMMERCIALIZATION_LOAD_STAMP="2026-03-31T162900Z" \
    bash scripts/load/run-commercialization-load-gate.sh
  ); then
    printf 'Expected invalid JSON failure case to exit non-zero.\n' >&2
    exit 1
  fi

  assert_contains "${evidence_file}" "FAIL: Observed summary must be valid JSON."
}

run_success_case
run_baseline_failure_case
run_budget_failure_case
run_required_artifact_failure_case
run_invalid_json_failure_case

printf 'Commercialization load gate self-test passed.\n'
