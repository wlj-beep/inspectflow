#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./update-lib.sh
source "${SCRIPT_DIR}/update-lib.sh"

usage() {
  cat <<'EOF'
Usage:
  verify-update-bundle.sh <bundle-directory>
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
require_cmd node

manifest_file="${bundle_dir}/manifest.json"
payload_file="${bundle_dir}/payload.tar.gz"
checksums_file="${bundle_dir}/checksums.sha256"
signature_file="${bundle_dir}/checksums.sha256.sig"

for f in "${manifest_file}" "${payload_file}" "${checksums_file}" "${signature_file}"; do
  if [[ ! -f "${f}" ]]; then
    echo "Missing bundle file: ${f}" >&2
    exit 1
  fi
done

echo "Verifying manifest format..."
node -e '
const fs = require("fs");
const file = process.argv[1];
const m = JSON.parse(fs.readFileSync(file, "utf8"));
const required = ["bundleId", "releaseId", "contractId", "createdAt", "payloadFile", "payloadSha256"];
for (const key of required) {
  if (!m[key]) {
    throw new Error(`manifest missing ${key}`);
  }
}
if (m.contractId !== "PLAT-DEPLOY-v1") {
  throw new Error(`unexpected contractId ${m.contractId}`);
}
' "${manifest_file}"

echo "Verifying checksums..."
while IFS= read -r line; do
  expected="$(printf "%s" "${line}" | awk '{print $1}')"
  file_name="$(printf "%s" "${line}" | awk '{print $2}')"
  if [[ -z "${expected}" || -z "${file_name}" ]]; then
    echo "Invalid checksum line: ${line}" >&2
    exit 1
  fi
  file_path="${bundle_dir}/${file_name}"
  if [[ ! -f "${file_path}" ]]; then
    echo "Checksum references missing file: ${file_name}" >&2
    exit 1
  fi
  actual="$(sha256_file "${file_path}")"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "Checksum mismatch for ${file_name}" >&2
    echo "Expected: ${expected}" >&2
    echo "Actual:   ${actual}" >&2
    exit 1
  fi
done < "${checksums_file}"

echo "Verifying signature..."
signing_key="$(require_signing_key)"
expected_signature="$(tr -d '\r\n[:space:]' < "${signature_file}")"
actual_signature="$(sign_hmac_file "${checksums_file}" "${signing_key}")"
if [[ "${actual_signature}" != "${expected_signature}" ]]; then
  echo "Signature verification failed." >&2
  exit 1
fi

echo "Bundle verification passed."
