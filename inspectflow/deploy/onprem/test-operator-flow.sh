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

write_stub() {
  local file_path="$1"
  local body="$2"

  printf '%s\n' "${body}" > "${file_path}"
  chmod +x "${file_path}"
}

run_success_case() {
  local case_dir="${TEST_TMP}/success"
  local bundle_dir="${case_dir}/bundle"
  local backup_root="${case_dir}/var/backups"
  local rollback_dir="${backup_root}/2026-04-01-good"
  local preflight_stub="${case_dir}/preflight.sh"
  local start_stub="${case_dir}/start.sh"
  local health_stub="${case_dir}/health.sh"
  local rollback_stub="${case_dir}/rollback.sh"
  local output_file="${case_dir}/output.txt"

  mkdir -p "${bundle_dir}" "${rollback_dir}"
  write_stub "${preflight_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\nprintf "preflight ok for %s\\n" "$1"\n'
  write_stub "${start_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\necho "start ok"\n'
  write_stub "${health_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\necho "health ok"\n'
  write_stub "${rollback_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\necho "rollback stub"\n'

  (
    cd "${ROOT_DIR}"
    INSPECTFLOW_OPERATOR_PREFLIGHT_CMD="${preflight_stub}" \
    INSPECTFLOW_OPERATOR_START_CMD="${start_stub}" \
    INSPECTFLOW_OPERATOR_HEALTH_CMD="${health_stub}" \
    INSPECTFLOW_OPERATOR_ROLLBACK_CMD="${rollback_stub}" \
    bash deploy/onprem/run-operator-flow.sh "${bundle_dir}" --rollback-dir "${rollback_dir}"
  ) > "${output_file}"

  assert_contains "${output_file}" "Step 1/4: Preflight validation"
  assert_contains "${output_file}" "preflight ok for ${bundle_dir}"
  assert_contains "${output_file}" "start ok"
  assert_contains "${output_file}" "health ok"
  assert_contains "${output_file}" "Rollback-ready backup: ${rollback_dir}"
  assert_contains "${output_file}" "Rollback command: bash ${rollback_stub} ${rollback_dir}"
}

run_auto_backup_detection_case() {
  local case_dir="${TEST_TMP}/auto-detect"
  local bundle_dir="${case_dir}/bundle"
  local repo_root="${case_dir}/repo"
  local backup_root="${repo_root}/var/backups"
  local older_backup="${backup_root}/2026-03-31-good"
  local newer_backup="${backup_root}/2026-04-01-good"
  local deploy_dir="${repo_root}/deploy/onprem"
  local preflight_stub="${case_dir}/preflight.sh"
  local start_stub="${case_dir}/start.sh"
  local health_stub="${case_dir}/health.sh"
  local rollback_stub="${case_dir}/rollback.sh"
  local output_file="${case_dir}/output.txt"

  mkdir -p "${bundle_dir}" "${older_backup}" "${newer_backup}" "${deploy_dir}"
  write_stub "${preflight_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\necho "preflight ok"\n'
  write_stub "${start_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\necho "start ok"\n'
  write_stub "${health_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\necho "health ok"\n'
  write_stub "${rollback_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\necho "rollback stub"\n'

  ln -s "/Users/joshlane/Documents/Playground 2/inspectflow/deploy/onprem/run-operator-flow.sh" "${deploy_dir}/run-operator-flow.sh"

  (
    cd "${case_dir}"
    INSPECTFLOW_OPERATOR_PREFLIGHT_CMD="${preflight_stub}" \
    INSPECTFLOW_OPERATOR_START_CMD="${start_stub}" \
    INSPECTFLOW_OPERATOR_HEALTH_CMD="${health_stub}" \
    INSPECTFLOW_OPERATOR_ROLLBACK_CMD="${rollback_stub}" \
    bash "${deploy_dir}/run-operator-flow.sh" "${bundle_dir}"
  ) > "${output_file}"

  assert_contains "${output_file}" "Rollback-ready backup: ${newer_backup}"
}

run_missing_backup_case() {
  local case_dir="${TEST_TMP}/missing-backup"
  local bundle_dir="${case_dir}/bundle"
  local repo_root="${case_dir}/repo"
  local deploy_dir="${repo_root}/deploy/onprem"
  local preflight_stub="${case_dir}/preflight.sh"
  local start_stub="${case_dir}/start.sh"
  local health_stub="${case_dir}/health.sh"
  local rollback_stub="${case_dir}/rollback.sh"
  local output_file="${case_dir}/output.txt"

  mkdir -p "${bundle_dir}" "${deploy_dir}"
  write_stub "${preflight_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\necho "preflight ok"\n'
  write_stub "${start_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\necho "start ok"\n'
  write_stub "${health_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\necho "health ok"\n'
  write_stub "${rollback_stub}" $'#!/usr/bin/env bash\nset -euo pipefail\necho "rollback stub"\n'

  ln -s "/Users/joshlane/Documents/Playground 2/inspectflow/deploy/onprem/run-operator-flow.sh" "${deploy_dir}/run-operator-flow.sh"

  if (
    cd "${case_dir}"
    INSPECTFLOW_OPERATOR_PREFLIGHT_CMD="${preflight_stub}" \
    INSPECTFLOW_OPERATOR_START_CMD="${start_stub}" \
    INSPECTFLOW_OPERATOR_HEALTH_CMD="${health_stub}" \
    INSPECTFLOW_OPERATOR_ROLLBACK_CMD="${rollback_stub}" \
    bash "${deploy_dir}/run-operator-flow.sh" "${bundle_dir}"
  ) > "${output_file}" 2>&1; then
    printf 'Expected missing backup case to fail.\n' >&2
    exit 1
  fi

  assert_contains "${output_file}" "No rollback backup directory found under"
}

run_success_case
run_auto_backup_detection_case
run_missing_backup_case

printf 'Operator flow self-test passed.\n'
