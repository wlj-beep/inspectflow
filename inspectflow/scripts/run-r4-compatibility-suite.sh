#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${ROOT_DIR}/docs/operations/cycles/evidence"
RUN_DATE="$(date +%F)"
LOG_FILE="${EVIDENCE_DIR}/${RUN_DATE}-r4-compatibility-suite.txt"

mkdir -p "${EVIDENCE_DIR}"

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
log_step "Backend R4 focused tests"
(cd backend && NODE_ENV=test npx vitest run --poolOptions.threads.singleThread --no-file-parallelism \
  test/extensions-runtime.test.js \
  test/partner-connector-kit.test.js \
  test/edge-sync.test.js \
  test/module-policy.test.js \
  test/r4-ecosystem-compatibility.test.js) 2>&1 | tee -a "${LOG_FILE}"
run_step "Standardized gate" env DATABASE_URL_TEST=postgres://postgres@localhost:5432/inspectflow_test npm run test:standardized

echo "PASS: R4 compatibility suite completed." | tee -a "${LOG_FILE}"
