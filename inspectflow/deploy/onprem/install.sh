#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${INSPECTFLOW_ENV_FILE:-${SCRIPT_DIR}/.env}"
RUNTIME_DIR="${ROOT_DIR}/var/runtime"
LOG_DIR="${ROOT_DIR}/var/log"
RELEASE_META="${ROOT_DIR}/var/runtime/release.json"

required_cmds=(node npm psql pg_dump pg_restore)
for cmd in "${required_cmds[@]}"; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
done

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck source=/dev/null
  source "${ENV_FILE}"
elif [[ -f "${SCRIPT_DIR}/.env.example" ]]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/.env.example"
fi

mkdir -p "${RUNTIME_DIR}/pids" "${LOG_DIR}"

echo "Installing npm dependencies..."
npm install
npm install --prefix backend
npm install --prefix frontend

echo "Building frontend static assets..."
npm run build --prefix frontend

echo "Applying database schema..."
npm run db:migrate --prefix backend

if [[ "${INSPECTFLOW_SEED_ON_INSTALL:-true}" == "true" ]]; then
  echo "Seeding baseline data and local auth credentials..."
  npm run db:seed --prefix backend
fi

cat > "${RELEASE_META}" <<EOF
{
  "installedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "nodeVersion": "$(node -v)",
  "backendPort": "${BACKEND_PORT:-4000}",
  "frontendPort": "${FRONTEND_PORT:-4173}",
  "envFile": "${ENV_FILE}"
}
EOF

echo "Install complete."
echo "Next:"
echo "  1) Copy deploy/onprem/.env.example to deploy/onprem/.env and review values."
echo "  2) Start services: npm run deploy:onprem:start"
echo "  3) Validate health: npm run deploy:onprem:health"
