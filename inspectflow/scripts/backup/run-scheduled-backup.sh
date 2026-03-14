#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "${SCRIPT_DIR}/lib.sh"

load_env_if_present
log_event "info" "scheduled_backup" "started" "Scheduled backup cycle started" ""

backup_dir="$(bash "${SCRIPT_DIR}/backup.sh")"
bash "${SCRIPT_DIR}/verify-restore.sh" "${backup_dir}"

log_event "info" "scheduled_backup" "ok" "Scheduled backup cycle completed" "source=${backup_dir}"
echo "Scheduled backup cycle completed (${backup_dir})."
