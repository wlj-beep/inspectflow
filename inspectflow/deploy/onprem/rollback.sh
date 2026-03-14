#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BACKUP_DIR="${1:-}"

if [[ -z "${BACKUP_DIR}" ]]; then
  echo "Usage: $0 <backup-directory>" >&2
  exit 1
fi

if [[ ! -d "${BACKUP_DIR}" ]]; then
  echo "Backup directory not found: ${BACKUP_DIR}" >&2
  exit 1
fi

echo "Stopping services..."
bash "${SCRIPT_DIR}/stop.sh"

echo "Restoring database from ${BACKUP_DIR}..."
bash "${ROOT_DIR}/scripts/backup/restore.sh" "${BACKUP_DIR}"

echo "Starting services..."
bash "${SCRIPT_DIR}/start.sh"

echo "Running post-rollback health checks..."
bash "${SCRIPT_DIR}/healthcheck.sh"

echo "Rollback completed."
