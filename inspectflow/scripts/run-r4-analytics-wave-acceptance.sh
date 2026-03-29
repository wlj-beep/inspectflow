#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${ROOT_DIR}/docs/operations/cycles/evidence"
RUN_DATE="$(date +%F)"
LOG_FILE="${EVIDENCE_DIR}/${RUN_DATE}-r4-analytics-wave-matrix.txt"

mkdir -p "${EVIDENCE_DIR}"
: > "${LOG_FILE}"

log_step() {
  local label="$1"
  echo "== ${label} ==" | tee -a "${LOG_FILE}"
}

run_step() {
  local label="$1"
  shift
  log_step "${label}"
  "$@" 2>&1 | tee -a "${LOG_FILE}"
}

cd "${ROOT_DIR}"

run_step "Coordination gate" npm run test:coordination
run_step "Backend test DB setup" npm run db:test:setup --prefix backend
log_step "Backend analytics wave tests"
(cd backend && NODE_ENV=test npx vitest run --poolOptions.threads.singleThread --no-file-parallelism \
  test/analytics-incremental-refresh.test.js \
  test/analytics-workforce-performance.test.js \
  test/analytics-spc.test.js \
  test/record-attachments.test.js) 2>&1 | tee -a "${LOG_FILE}"
run_step "Frontend mocked mobile coverage" npm run test:ui --prefix frontend -- --grep "@mock|tablet viewport|mobile viewport|mobile operator"

echo "PASS: R4 analytics + mobile wave acceptance matrix completed." | tee -a "${LOG_FILE}"
