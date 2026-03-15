#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./update-lib.sh
source "${SCRIPT_DIR}/update-lib.sh"

usage() {
  cat <<'EOF'
Usage:
  preflight-update.sh <bundle-directory>

Runs command, bundle, and disk-space checks before applying an offline update.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

bundle_dir="${1:-}"
if [[ -z "${bundle_dir}" ]]; then
  usage
  exit 1
fi

load_onprem_env

required_cmds=(bash node npm tar openssl psql pg_dump pg_restore df)
for cmd in "${required_cmds[@]}"; do
  require_cmd "${cmd}"
done

if [[ ! -d "${bundle_dir}" ]]; then
  echo "Bundle directory not found: ${bundle_dir}" >&2
  exit 1
fi

echo "Running signature and checksum verification..."
bash "${SCRIPT_DIR}/verify-update-bundle.sh" "${bundle_dir}"

echo "Checking writable runtime paths..."
mkdir -p "${ROOT_DIR}/var/runtime" "${ROOT_DIR}/var/log" "${ROOT_DIR}/var/backups"
for path in "${ROOT_DIR}/var/runtime" "${ROOT_DIR}/var/log" "${ROOT_DIR}/var/backups"; do
  if [[ ! -w "${path}" ]]; then
    echo "Path is not writable: ${path}" >&2
    exit 1
  fi
done

min_free_mb="${UPDATE_MIN_FREE_MB:-1024}"
if ! [[ "${min_free_mb}" =~ ^[0-9]+$ ]]; then
  echo "UPDATE_MIN_FREE_MB must be an integer." >&2
  exit 1
fi

available_kb="$(df -Pk "${ROOT_DIR}" | awk 'NR==2 {print $4}')"
available_mb="$((available_kb / 1024))"
if (( available_mb < min_free_mb )); then
  echo "Insufficient free space: ${available_mb}MB available, ${min_free_mb}MB required." >&2
  exit 1
fi

echo "Preflight passed."
echo "Available disk: ${available_mb}MB"
