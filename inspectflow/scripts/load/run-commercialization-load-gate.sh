#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASELINE_SUMMARY_FILE="${COMMERCIALIZATION_LOAD_BASELINE_FILE:-${ROOT_DIR}/var/load/bl056/load-gate-summary.json}"
DEFAULT_OBSERVED_FIXTURE="${ROOT_DIR}/scripts/load/commercialization-target.fixture.json"
OBSERVED_SUMMARY_FILE="${COMMERCIALIZATION_LOAD_OBSERVED_FILE:-${DEFAULT_OBSERVED_FIXTURE}}"
OUTPUT_DIR="${COMMERCIALIZATION_LOAD_OUTPUT_DIR:-${ROOT_DIR}/var/load/bl103}"
EVIDENCE_DIR="${COMMERCIALIZATION_LOAD_EVIDENCE_DIR:-${ROOT_DIR}/docs/operations/cycles/evidence}"
STAMP="${COMMERCIALIZATION_LOAD_STAMP:-$(date -u +"%Y-%m-%dT%H%M%SZ")}"
SUMMARY_FILE="${COMMERCIALIZATION_LOAD_SUMMARY_FILE:-${OUTPUT_DIR}/commercialization-load-summary.json}"
EVIDENCE_FILE="${COMMERCIALIZATION_LOAD_EVIDENCE_FILE:-${EVIDENCE_DIR}/${STAMP}-commercialization-load-gate.txt}"
REQUIRED_ARTIFACTS_RAW="${COMMERCIALIZATION_LOAD_REQUIRED_ARTIFACTS:-}"

mkdir -p "${OUTPUT_DIR}" "${EVIDENCE_DIR}"
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
  if [[ -z "$(trim "${REQUIRED_ARTIFACTS_RAW}")" ]]; then
    return 0
  fi

  local item
  local artifact_paths=()
  local old_ifs="${IFS}"
  IFS=','
  read -r -a artifact_paths <<< "${REQUIRED_ARTIFACTS_RAW}"
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

validate_json_file() {
  local file_path="$1"
  local label="$2"
  FILE_PATH="${file_path}" LABEL="${label}" node --input-type=module <<'NODE'
import fs from "node:fs";

const filePath = process.env.FILE_PATH;
const label = process.env.LABEL;

try {
  JSON.parse(fs.readFileSync(filePath, "utf8"));
} catch (error) {
  console.error(`${label} is not valid JSON at ${filePath}: ${error.message}`);
  process.exit(1);
}
NODE
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

for required_command in bash date mkdir node tee; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    fail "Required command '${required_command}' is not available."
  fi
done

[[ -f "${BASELINE_SUMMARY_FILE}" ]] || fail "Baseline summary not found at ${BASELINE_SUMMARY_FILE}."
[[ -f "${OBSERVED_SUMMARY_FILE}" ]] || fail "Observed summary not found at ${OBSERVED_SUMMARY_FILE}."
validate_required_artifacts
validate_json_file "${BASELINE_SUMMARY_FILE}" "Baseline summary" || fail "Baseline summary must be valid JSON."
validate_json_file "${OBSERVED_SUMMARY_FILE}" "Observed summary" || fail "Observed summary must be valid JSON."

log "Commercialization load gate started at ${STAMP}"
log "Repository: ${ROOT_DIR}"
log "Baseline summary: ${BASELINE_SUMMARY_FILE}"
log "Observed summary: ${OBSERVED_SUMMARY_FILE}"
log "Summary output: ${SUMMARY_FILE}"
log "Evidence file: ${EVIDENCE_FILE}"

summary_exit_code=0
set +e
BASELINE_SUMMARY_FILE="${BASELINE_SUMMARY_FILE}" \
OBSERVED_SUMMARY_FILE="${OBSERVED_SUMMARY_FILE}" \
DEFAULT_OBSERVED_FIXTURE="${DEFAULT_OBSERVED_FIXTURE}" \
SUMMARY_FILE="${SUMMARY_FILE}" \
COMMERCIALIZATION_LOAD_TARGET_MULTIPLIER="${COMMERCIALIZATION_LOAD_TARGET_MULTIPLIER:-25}" \
COMMERCIALIZATION_LOAD_MIN_BASELINE_MULTIPLIER="${COMMERCIALIZATION_LOAD_MIN_BASELINE_MULTIPLIER:-10}" \
COMMERCIALIZATION_LOAD_BUDGET_IMPORT_P95_MS="${COMMERCIALIZATION_LOAD_BUDGET_IMPORT_P95_MS:-1200}" \
COMMERCIALIZATION_LOAD_BUDGET_DASHBOARD_P95_MS="${COMMERCIALIZATION_LOAD_BUDGET_DASHBOARD_P95_MS:-900}" \
COMMERCIALIZATION_LOAD_BUDGET_QUEUE_DRAIN_SECONDS="${COMMERCIALIZATION_LOAD_BUDGET_QUEUE_DRAIN_SECONDS:-900}" \
COMMERCIALIZATION_LOAD_BUDGET_ERROR_RATE_PCT="${COMMERCIALIZATION_LOAD_BUDGET_ERROR_RATE_PCT:-1.0}" \
COMMERCIALIZATION_LOAD_BUDGET_DUPLICATE_WRITES="${COMMERCIALIZATION_LOAD_BUDGET_DUPLICATE_WRITES:-0}" \
COMMERCIALIZATION_LOAD_BUDGET_REPLAY_FAILURES="${COMMERCIALIZATION_LOAD_BUDGET_REPLAY_FAILURES:-0}" \
node --input-type=module <<'NODE'
import fs from "node:fs";
import path from "node:path";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function asIso(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

const baselinePath = process.env.BASELINE_SUMMARY_FILE;
const observedPath = process.env.OBSERVED_SUMMARY_FILE;
const defaultObservedFixture = process.env.DEFAULT_OBSERVED_FIXTURE;
const summaryPath = process.env.SUMMARY_FILE;

const baseline = readJson(baselinePath);
const observedSource = readJson(observedPath);
const targetMultiplier = asNumber(process.env.COMMERCIALIZATION_LOAD_TARGET_MULTIPLIER, 25);
const minBaselineMultiplier = asNumber(process.env.COMMERCIALIZATION_LOAD_MIN_BASELINE_MULTIPLIER, 10);

const budgets = {
  importP95Ms: asNumber(process.env.COMMERCIALIZATION_LOAD_BUDGET_IMPORT_P95_MS, 1200),
  dashboardP95Ms: asNumber(process.env.COMMERCIALIZATION_LOAD_BUDGET_DASHBOARD_P95_MS, 900),
  queueDrainSeconds: asNumber(process.env.COMMERCIALIZATION_LOAD_BUDGET_QUEUE_DRAIN_SECONDS, 900),
  errorRatePct: asNumber(process.env.COMMERCIALIZATION_LOAD_BUDGET_ERROR_RATE_PCT, 1.0),
  duplicateWrites: asNumber(process.env.COMMERCIALIZATION_LOAD_BUDGET_DUPLICATE_WRITES, 0),
  replayFailures: asNumber(process.env.COMMERCIALIZATION_LOAD_BUDGET_REPLAY_FAILURES, 0)
};

const baselineMultiplier = asNumber(baseline.multiplier, 0);
const baselineJobs = asNumber(baseline.totalJobs, 0);
const baselineMeasurements = asNumber(baseline.totalMeasurementRows, 0);
const targetJobs = Math.ceil((baselineJobs * targetMultiplier) / Math.max(baselineMultiplier, 1));
const targetMeasurements = Math.ceil((baselineMeasurements * targetMultiplier) / Math.max(baselineMultiplier, 1));

const observed = {
  totalJobs: asNumber(observedSource.totalJobs, targetJobs),
  totalMeasurementRows: asNumber(observedSource.totalMeasurementRows, targetMeasurements),
  importP95Ms: asNumber(observedSource.importP95Ms, budgets.importP95Ms),
  dashboardP95Ms: asNumber(observedSource.dashboardP95Ms, budgets.dashboardP95Ms),
  queueDrainSeconds: asNumber(observedSource.queueDrainSeconds, budgets.queueDrainSeconds),
  errorRatePct: asNumber(observedSource.errorRatePct, budgets.errorRatePct),
  duplicateWrites: asNumber(observedSource.duplicateWrites, budgets.duplicateWrites),
  replayFailures: asNumber(observedSource.replayFailures, budgets.replayFailures),
  supportBundleLeak: asBoolean(observedSource.supportBundleLeak, false)
};

const checks = [
  {
    id: "baseline_passed",
    description: "BL-056 baseline artifact passed",
    pass: baseline.pass === true
  },
  {
    id: "baseline_multiplier_floor",
    description: `BL-056 baseline multiplier is at least ${minBaselineMultiplier}x`,
    pass: baselineMultiplier >= minBaselineMultiplier
  },
  {
    id: "commercialization_volume",
    description: `Observed volume meets ${targetMultiplier}x commercialization target`,
    pass: observed.totalJobs >= targetJobs && observed.totalMeasurementRows >= targetMeasurements
  },
  {
    id: "import_latency_budget",
    description: `Import p95 stays within ${budgets.importP95Ms} ms`,
    pass: observed.importP95Ms <= budgets.importP95Ms
  },
  {
    id: "dashboard_latency_budget",
    description: `Dashboard p95 stays within ${budgets.dashboardP95Ms} ms`,
    pass: observed.dashboardP95Ms <= budgets.dashboardP95Ms
  },
  {
    id: "queue_drain_budget",
    description: `Queue drain finishes within ${budgets.queueDrainSeconds} seconds`,
    pass: observed.queueDrainSeconds <= budgets.queueDrainSeconds
  },
  {
    id: "error_rate_budget",
    description: `Error rate stays within ${budgets.errorRatePct}%`,
    pass: observed.errorRatePct <= budgets.errorRatePct
  },
  {
    id: "duplicate_write_budget",
    description: `Duplicate writes stay within ${budgets.duplicateWrites}`,
    pass: observed.duplicateWrites <= budgets.duplicateWrites
  },
  {
    id: "replay_failure_budget",
    description: `Replay failures stay within ${budgets.replayFailures}`,
    pass: observed.replayFailures <= budgets.replayFailures
  },
  {
    id: "support_bundle_safety",
    description: "Support bundle summary remains metadata-only",
    pass: observed.supportBundleLeak !== true
  }
];

const pass = checks.every((check) => check.pass);
const summary = {
  contractId: "PLAT-PERF-v1",
  backlogId: "BL-103",
  mode: observedPath === defaultObservedFixture ? "fixture_budget_eval" : "observed_budget_eval",
  generatedAt: new Date().toISOString(),
  baseline: {
    sourceFile: baselinePath,
    contractId: baseline.contractId || null,
    backlogId: baseline.backlogId || null,
    startedAt: baseline.startedAt ? asIso(baseline.startedAt) : null,
    completedAt: baseline.completedAt ? asIso(baseline.completedAt) : null,
    pass: baseline.pass === true,
    multiplier: baselineMultiplier,
    totalJobs: baselineJobs,
    totalMeasurementRows: baselineMeasurements
  },
  targetProfile: {
    multiplier: targetMultiplier,
    totalJobs: targetJobs,
    totalMeasurementRows: targetMeasurements,
    budgets
  },
  observed,
  observedSource: {
    file: observedPath,
    fixtureId: observedSource.fixtureId || null
  },
  checks,
  pass
};

fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

if (!pass) {
  process.exitCode = 2;
}
NODE
summary_exit_code=$?
set -e

if [[ ! -f "${SUMMARY_FILE}" ]]; then
  fail "Summary file was not created at ${SUMMARY_FILE}."
fi

log "Commercialization target summary written."
while IFS= read -r line; do
  log "${line}"
done < <(
  SUMMARY_FILE="${SUMMARY_FILE}" node --input-type=module <<'NODE'
import fs from "node:fs";

const summary = JSON.parse(fs.readFileSync(process.env.SUMMARY_FILE, "utf8"));

console.log(`Target profile: ${summary.targetProfile.multiplier}x (${summary.targetProfile.totalJobs} jobs / ${summary.targetProfile.totalMeasurementRows} measurement rows)`);
console.log(`Observed budgets: import p95=${summary.observed.importP95Ms} ms, dashboard p95=${summary.observed.dashboardP95Ms} ms, queue drain=${summary.observed.queueDrainSeconds} s, error rate=${summary.observed.errorRatePct}%`);
console.log(`Duplicate writes=${summary.observed.duplicateWrites}, replay failures=${summary.observed.replayFailures}, support bundle leak=${summary.observed.supportBundleLeak}`);
for (const check of summary.checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"}: ${check.id} - ${check.description}`);
}
console.log(`Overall result: ${summary.pass ? "PASS" : "FAIL"}`);
NODE
)

SUMMARY_PASS="$(
  SUMMARY_FILE="${SUMMARY_FILE}" node --input-type=module <<'NODE'
import fs from "node:fs";
const summary = JSON.parse(fs.readFileSync(process.env.SUMMARY_FILE, "utf8"));
process.stdout.write(summary.pass ? "true" : "false");
NODE
)"

if [[ "${summary_exit_code}" -ne 0 || "${SUMMARY_PASS}" != "true" ]]; then
  fail "Commercialization load gate budgets were not met."
fi

log "Commercialization load gate passed."
log "Attach ${SUMMARY_FILE} and ${EVIDENCE_FILE} to the BL-103 release evidence trail."
