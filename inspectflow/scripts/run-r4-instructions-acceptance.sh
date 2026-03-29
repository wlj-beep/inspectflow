#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${ROOT_DIR}/docs/operations/cycles/evidence"
RUN_DATE="$(date +%F)"
LOG_FILE="${EVIDENCE_DIR}/${RUN_DATE}-r4-instructions-acceptance-matrix.txt"

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
log_step "Backend instructions + permission tests"
(cd backend && NODE_ENV=test npx vitest run --poolOptions.threads.singleThread --no-file-parallelism \
  test/instruction-versions.test.js \
  test/permissions.test.js) 2>&1 | tee -a "${LOG_FILE}"
run_step "Frontend mocked instruction + operator flow tests" npm run test:ui --prefix frontend -- tests/mocked.smoke.spec.js --grep "instruction|@mock"

echo "PASS: R4 instructions acceptance matrix completed." | tee -a "${LOG_FILE}"
