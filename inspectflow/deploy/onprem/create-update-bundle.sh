#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./update-lib.sh
source "${SCRIPT_DIR}/update-lib.sh"

usage() {
  cat <<'EOF'
Usage:
  create-update-bundle.sh [output-directory] [--release-id <id>]

Examples:
  create-update-bundle.sh
  create-update-bundle.sh var/update-bundles/r1-rc2 --release-id r1-rc2
EOF
}

load_onprem_env
require_cmd tar

output_dir=""
release_id="${INSPECTFLOW_RELEASE_ID:-manual}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --release-id)
      release_id="${2:-}"
      if [[ -z "${release_id}" ]]; then
        echo "Missing value for --release-id" >&2
        exit 1
      fi
      shift 2
      ;;
    *)
      if [[ -z "${output_dir}" ]]; then
        output_dir="$1"
        shift
      else
        echo "Unexpected argument: $1" >&2
        usage
        exit 1
      fi
      ;;
  esac
done

timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
output_dir="${output_dir:-${ROOT_DIR}/var/update-bundles/${timestamp}}"
mkdir -p "${output_dir}"

bundle_id="inspectflow-update-${timestamp}"
payload_file="${output_dir}/payload.tar.gz"
manifest_file="${output_dir}/manifest.json"
checksums_file="${output_dir}/checksums.sha256"
signature_file="${output_dir}/checksums.sha256.sig"

git_commit="$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || echo "unknown")"

echo "Creating payload archive..."
(
  cd "${ROOT_DIR}"
  tar -czf "${payload_file}" \
    --exclude="./.git" \
    --exclude="./.DS_Store" \
    --exclude="./node_modules" \
    --exclude="./backend/node_modules" \
    --exclude="./frontend/node_modules" \
    --exclude="./backend/.env" \
    --exclude="./deploy/onprem/.env" \
    --exclude="./var" \
    package.json \
    package-lock.json \
    backend \
    frontend \
    deploy \
    scripts \
    docs
)

payload_sha256="$(sha256_file "${payload_file}")"
payload_bytes="$(wc -c < "${payload_file}" | tr -d '[:space:]')"

cat > "${manifest_file}" <<EOF
{
  "bundleId": "${bundle_id}",
  "releaseId": "${release_id}",
  "contractId": "PLAT-DEPLOY-v1",
  "createdAt": "$(now_utc)",
  "gitCommit": "${git_commit}",
  "payloadFile": "payload.tar.gz",
  "payloadSha256": "${payload_sha256}",
  "payloadBytes": ${payload_bytes},
  "requiredCommands": ["bash", "node", "npm", "tar", "openssl", "psql", "pg_dump", "pg_restore"],
  "preflightCommand": "npm run deploy:onprem:update:preflight -- <bundle-directory>",
  "verifyCommand": "npm run deploy:onprem:update:bundle:verify -- <bundle-directory>",
  "applyCommand": "npm run deploy:onprem:update:apply -- <bundle-directory>",
  "rollbackCommand": "npm run deploy:onprem:rollback -- <backup-directory>"
}
EOF

manifest_sha256="$(sha256_file "${manifest_file}")"

cat > "${checksums_file}" <<EOF
${manifest_sha256}  manifest.json
${payload_sha256}  payload.tar.gz
EOF

signing_key="$(require_signing_key)"
signature="$(sign_hmac_file "${checksums_file}" "${signing_key}")"
printf "%s\n" "${signature}" > "${signature_file}"

echo "Bundle created: ${output_dir}"
echo "Release ID: ${release_id}"
echo "Git commit: ${git_commit}"
echo "Next:"
echo "  1) Verify: bash deploy/onprem/verify-update-bundle.sh ${output_dir}"
echo "  2) Preflight: bash deploy/onprem/preflight-update.sh ${output_dir}"
echo "  3) Apply: bash deploy/onprem/apply-update-bundle.sh ${output_dir}"
