#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PID_DIR="${ROOT_DIR}/var/runtime/pids"

stop_pid() {
  local pid_file="$1"
  if [[ ! -f "${pid_file}" ]]; then
    return 0
  fi
  local pid
  pid="$(cat "${pid_file}")"
  if kill -0 "${pid}" >/dev/null 2>&1; then
    kill "${pid}"
    sleep 1
    if kill -0 "${pid}" >/dev/null 2>&1; then
      kill -9 "${pid}"
    fi
  fi
  rm -f "${pid_file}"
}

stop_pid "${PID_DIR}/imports-worker.pid"
stop_pid "${PID_DIR}/frontend.pid"
stop_pid "${PID_DIR}/backend.pid"

echo "Stop complete."
