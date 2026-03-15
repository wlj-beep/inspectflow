#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_LOG="/tmp/inspectflow-backend-ui-live.log"
BACKEND_PID=""

cleanup() {
  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" >/dev/null 2>&1 || true
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT

cd "${ROOT_DIR}"

if [[ -z "${DATABASE_URL_TEST:-}" ]]; then
  echo "DATABASE_URL_TEST is required for live UI tests."
  exit 1
fi

echo "[ui-live] Preparing test database..."
npm run db:test:setup

export DATABASE_URL="${DATABASE_URL:-${DATABASE_URL_TEST}}"
export VITE_API_URL="${VITE_API_URL:-http://127.0.0.1:4000}"
export PLAYWRIGHT_API_URL="${PLAYWRIGHT_API_URL:-${VITE_API_URL}}"

echo "[ui-live] Starting backend API..."
ALLOW_LEGACY_ROLE_HEADER=true npm run dev --prefix backend > "${BACKEND_LOG}" 2>&1 &
BACKEND_PID=$!

for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:4000/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:4000/health" >/dev/null 2>&1; then
  echo "[ui-live] Backend failed to start."
  cat "${BACKEND_LOG}" || true
  exit 1
fi

echo "[ui-live] Running live Playwright suite..."
PLAYWRIGHT_LIVE=1 npm run test:ui --prefix frontend -- --grep @live
