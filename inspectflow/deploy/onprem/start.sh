#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${INSPECTFLOW_ENV_FILE:-${SCRIPT_DIR}/.env}"
PID_DIR="${ROOT_DIR}/var/runtime/pids"
LOG_DIR="${ROOT_DIR}/var/log"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck source=/dev/null
  source "${ENV_FILE}"
elif [[ -f "${SCRIPT_DIR}/.env.example" ]]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/.env.example"
fi

mkdir -p "${PID_DIR}" "${LOG_DIR}"

backend_pid_file="${PID_DIR}/backend.pid"
frontend_pid_file="${PID_DIR}/frontend.pid"

is_running() {
  local pid_file="$1"
  if [[ ! -f "${pid_file}" ]]; then
    return 1
  fi
  local pid
  pid="$(cat "${pid_file}")"
  kill -0 "${pid}" >/dev/null 2>&1
}

if is_running "${backend_pid_file}"; then
  echo "Backend already running (pid $(cat "${backend_pid_file}"))."
else
  echo "Starting backend on port ${BACKEND_PORT:-4000}..."
  (
    cd "${ROOT_DIR}"
    PORT="${BACKEND_PORT:-4000}" NODE_ENV="${NODE_ENV:-production}" nohup npm run start --prefix backend >> "${LOG_DIR}/backend.log" 2>&1 &
    echo $! > "${backend_pid_file}"
  )
fi

if is_running "${frontend_pid_file}"; then
  echo "Frontend already running (pid $(cat "${frontend_pid_file}"))."
else
  echo "Starting frontend preview on ${FRONTEND_HOST:-0.0.0.0}:${FRONTEND_PORT:-4173}..."
  (
    cd "${ROOT_DIR}"
    nohup npm run preview --prefix frontend -- --host "${FRONTEND_HOST:-0.0.0.0}" --port "${FRONTEND_PORT:-4173}" >> "${LOG_DIR}/frontend.log" 2>&1 &
    echo $! > "${frontend_pid_file}"
  )
fi

echo "Start complete."
