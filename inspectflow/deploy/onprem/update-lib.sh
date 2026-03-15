#!/usr/bin/env bash
set -euo pipefail

if [[ "${INSPECTFLOW_UPDATE_LIB_LOADED:-false}" == "true" ]]; then
  return 0
fi
INSPECTFLOW_UPDATE_LIB_LOADED="true"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_FILE="${INSPECTFLOW_ENV_FILE:-${SCRIPT_DIR}/.env}"

load_onprem_env() {
  local source_file=""
  if [[ -f "${ENV_FILE}" ]]; then
    source_file="${ENV_FILE}"
  elif [[ -f "${SCRIPT_DIR}/.env.example" ]]; then
    source_file="${SCRIPT_DIR}/.env.example"
  fi
  if [[ -z "${source_file}" ]]; then
    return 0
  fi

  while IFS= read -r line; do
    if [[ -z "${line}" || "${line}" =~ ^[[:space:]]*# ]]; then
      continue
    fi
    if [[ "${line}" != *"="* ]]; then
      continue
    fi
    local key="${line%%=*}"
    local value="${line#*=}"
    if [[ -z "${!key+x}" ]]; then
      export "${key}=${value}"
    fi
  done < "${source_file}"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
}

sha256_file() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file}" | awk '{print $1}'
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${file}" | awk '{print $1}'
    return
  fi
  require_cmd openssl
  openssl dgst -sha256 "${file}" | awk '{print $NF}'
}

sign_hmac_file() {
  local file="$1"
  local key="$2"
  require_cmd openssl
  openssl dgst -sha256 -hmac "${key}" "${file}" | awk '{print $NF}'
}

require_signing_key() {
  local key_file="${INSPECTFLOW_UPDATE_SIGNING_KEY_FILE:-}"
  local inline_key="${INSPECTFLOW_UPDATE_SIGNING_KEY:-}"
  if [[ -n "${key_file}" ]]; then
    if [[ ! -f "${key_file}" ]]; then
      echo "Signing key file not found: ${key_file}" >&2
      exit 1
    fi
    tr -d '\r\n' < "${key_file}"
    return
  fi
  if [[ -n "${inline_key}" ]]; then
    printf "%s" "${inline_key}"
    return
  fi
  echo "Signing key is required. Set INSPECTFLOW_UPDATE_SIGNING_KEY_FILE or INSPECTFLOW_UPDATE_SIGNING_KEY." >&2
  exit 1
}

now_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}
