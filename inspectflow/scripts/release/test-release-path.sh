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

write_fake_npm() {
  local script_path="$1"
  cat <<'EOF' > "${script_path}"
#!/usr/bin/env bash
set -euo pipefail

CALLS_FILE="${RELEASE_PATH_TEST_CALLS_FILE:?}"
printf '%s\n' "$*" >> "${CALLS_FILE}"

if [[ "${1:-}" != "run" ]]; then
  echo "Unexpected invocation: $*" >&2
  exit 1
fi

case "${2:-}" in
  test:coordination|test:api|test:ui:mock|test:ui:live)
    printf 'simulated %s\n' "${2}"
    ;;
  gate:commercialization:load)
    printf 'simulated %s\n' "${2}"
    printf 'load evidence\n' > "${COMMERCIALIZATION_LOAD_EVIDENCE_FILE:?}"
    printf '{ "pass": true }\n' > "${COMMERCIALIZATION_LOAD_SUMMARY_FILE:?}"
    ;;
  gate:commercialization:rc)
    if [[ "${RELEASE_PATH_TEST_FAIL_STEP:-}" == "gate:commercialization:rc" ]]; then
      printf 'simulated failure %s\n' "${2}"
      printf 'rc evidence before failure\n' > "${COMMERCIALIZATION_RC_EVIDENCE_FILE:?}"
      exit 7
    fi
    printf 'simulated %s\n' "${2}"
    printf 'rc evidence\n' > "${COMMERCIALIZATION_RC_EVIDENCE_FILE:?}"
    ;;
  ops:cycle:report:auto)
    out_file=""
    shift 2
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --out)
          out_file="${2:-}"
          shift 2
          ;;
        --)
          shift
          ;;
        *)
          shift
          ;;
      esac
    done
    if [[ -z "${out_file}" ]]; then
      echo "Missing cycle report output file" >&2
      exit 1
    fi
    printf 'simulated %s\n' "${2:-ops:cycle:report:auto}"
    printf '# cycle report\n' > "${out_file}"
    ;;
  *)
    echo "Unexpected npm run target: ${2:-}" >&2
    exit 1
    ;;
esac
EOF
  chmod +x "${script_path}"
}

run_success_case() {
  local case_dir="${TEST_TMP}/success"
  local evidence_root="${case_dir}/evidence"
  local fake_npm="${case_dir}/fake-npm.sh"
  local calls_file="${case_dir}/calls.log"
  local bundle_dir="${evidence_root}/2026-04-01T120000Z-release-path"
  local manifest_file="${bundle_dir}/manifest.md"

  mkdir -p "${case_dir}" "${evidence_root}"
  write_fake_npm "${fake_npm}"

  (
    cd "${ROOT_DIR}"
    RELEASE_PATH_TEST_CALLS_FILE="${calls_file}" \
    RELEASE_PATH_NPM_BIN="${fake_npm}" \
    RELEASE_PATH_EVIDENCE_ROOT="${evidence_root}" \
    RELEASE_PATH_STAMP="2026-04-01T120000Z" \
    bash scripts/release/run-release-path.sh
  )

  assert_contains "${calls_file}" "run test:coordination"
  assert_contains "${calls_file}" "run test:api"
  assert_contains "${calls_file}" "run test:ui:mock"
  assert_contains "${calls_file}" "run test:ui:live"
  assert_contains "${calls_file}" "run gate:commercialization:load"
  assert_contains "${calls_file}" "run gate:commercialization:rc"
  assert_contains "${calls_file}" "run ops:cycle:report:auto"

  assert_contains "${manifest_file}" '`Overall Status`: `PASS`'
  assert_contains "${manifest_file}" '`05-gate-commercialization-load`: `PASS`'
  assert_contains "${manifest_file}" '`06-gate-commercialization-rc`: `PASS`'
  assert_contains "${manifest_file}" '`07-cycle-report`: `PASS`'
  assert_contains "${bundle_dir}/commercialization-load-gate.txt" 'load evidence'
  assert_contains "${bundle_dir}/commercialization-load-summary.json" '"pass": true'
  assert_contains "${bundle_dir}/commercialization-rc-gate.txt" 'rc evidence'
  assert_contains "${bundle_dir}/cycle-report.md" '# cycle report'
  assert_contains "${bundle_dir}/release-path-usage.json" '"prompt_tokens": 1'
}

run_failure_case() {
  local case_dir="${TEST_TMP}/failure"
  local evidence_root="${case_dir}/evidence"
  local fake_npm="${case_dir}/fake-npm.sh"
  local calls_file="${case_dir}/calls.log"
  local bundle_dir="${evidence_root}/2026-04-01T120500Z-release-path"
  local manifest_file="${bundle_dir}/manifest.md"

  mkdir -p "${case_dir}" "${evidence_root}"
  write_fake_npm "${fake_npm}"

  if (
    cd "${ROOT_DIR}"
    RELEASE_PATH_TEST_CALLS_FILE="${calls_file}" \
    RELEASE_PATH_TEST_FAIL_STEP="gate:commercialization:rc" \
    RELEASE_PATH_NPM_BIN="${fake_npm}" \
    RELEASE_PATH_EVIDENCE_ROOT="${evidence_root}" \
    RELEASE_PATH_STAMP="2026-04-01T120500Z" \
    bash scripts/release/run-release-path.sh
  ); then
    printf 'Expected release path failure case to exit non-zero.\n' >&2
    exit 1
  fi

  assert_contains "${manifest_file}" '`Overall Status`: `FAIL`'
  assert_contains "${manifest_file}" '`Failed Step`: `06-gate-commercialization-rc`'
  assert_contains "${manifest_file}" '`06-gate-commercialization-rc`: `FAIL`'
  assert_contains "${bundle_dir}/commercialization-rc-gate.txt" 'rc evidence before failure'
  if [[ -f "${bundle_dir}/cycle-report.md" ]]; then
    printf 'Cycle report should not be created when RC gate fails.\n' >&2
    exit 1
  fi
}

run_success_case
run_failure_case

printf 'Release path self-test passed.\n'
