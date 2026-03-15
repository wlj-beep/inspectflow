#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${INSPECTFLOW_ENV_FILE:-${SCRIPT_DIR}/.env}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck source=/dev/null
  source "${ENV_FILE}"
elif [[ -f "${SCRIPT_DIR}/.env.example" ]]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/.env.example"
fi

BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:${BACKEND_PORT:-4000}}"
FRONTEND_URL="${FRONTEND_URL:-http://127.0.0.1:${FRONTEND_PORT:-4173}}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for health checks." >&2
  exit 1
fi

backend_health="$(curl -fsS "${BACKEND_URL}/health")"
frontend_status="$(curl -sS -o /dev/null -w "%{http_code}" "${FRONTEND_URL}")"

if [[ "${frontend_status}" -lt 200 || "${frontend_status}" -ge 400 ]]; then
  echo "Frontend health failed (HTTP ${frontend_status})." >&2
  exit 1
fi

echo "Backend health: ${backend_health}"
echo "Frontend health: HTTP ${frontend_status}"
echo "Health check passed."
