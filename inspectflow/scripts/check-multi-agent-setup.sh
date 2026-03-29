#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_PATH="${CODEX_CONFIG_PATH:-${HOME}/.codex/config.toml}"
RESTART_MARKER_PATH="${HOME}/.codex/multi-agent-restart.ack"
TARGET_BL=""
RUN_CONTEXT_VALIDATE=false
MARK_RESTART=false

usage() {
  cat <<'USAGE'
Usage: scripts/check-multi-agent-setup.sh [--bl BL-###] [--run-context-validate] [--mark-restart]

Options:
  --bl BL-###              Require a matching In Progress claim for this backlog item in STATUS.md.
  --run-context-validate   Run `npm run context:validate` as part of preflight.
                           The preflight also runs a dry-run `npm run var:cleanup` preview.
  --mark-restart           Write/update ~/.codex/multi-agent-restart.ack after Codex restart.
  -h, --help               Show this help.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bl)
      TARGET_BL="${2:-}"
      shift 2
      ;;
    --run-context-validate)
      RUN_CONTEXT_VALIDATE=true
      shift
      ;;
    --mark-restart)
      MARK_RESTART=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "FAIL: unknown argument '$1'"
      usage
      exit 1
      ;;
  esac
done

if [[ "${MARK_RESTART}" == true ]]; then
  mkdir -p "$(dirname "${RESTART_MARKER_PATH}")"
  date -u +"%Y-%m-%dT%H:%M:%SZ" > "${RESTART_MARKER_PATH}"
  echo "PASS: restart marker updated at ${RESTART_MARKER_PATH}"
fi

failures=0
pass() { echo "PASS: $1"; }
fail() { echo "FAIL: $1"; failures=$((failures + 1)); }

echo "InspectFlow multi-agent deployment preflight"
echo "Repo: ${ROOT_DIR}"
echo "Config: ${CONFIG_PATH}"
echo

if [[ ! -f "${CONFIG_PATH}" ]]; then
  fail "Codex config not found at ${CONFIG_PATH}. Add [features].multi_agent = true."
else
  if python3 - "${CONFIG_PATH}" <<'PY'
import sys
from pathlib import Path
try:
    import tomllib
except Exception:
    tomllib = None

path = Path(sys.argv[1])
text = path.read_bytes()
if tomllib is not None:
    data = tomllib.loads(text.decode("utf-8"))
    features = data.get("features", {})
    enabled = bool(features.get("multi_agent", False))
else:
    enabled = False
    in_features = False
    for raw_line in text.decode("utf-8").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line:
            continue
        if line.startswith("[") and line.endswith("]"):
            in_features = line.strip("[]").strip().lower() == "features"
            continue
        if in_features and line.lower().startswith("multi_agent"):
            value = line.split("=", 1)[1].strip().strip('"').strip("'").lower()
            enabled = value == "true"
if not enabled:
    raise SystemExit(1)
PY
  then
    pass "multi_agent = true detected in [features]."
  else
    fail "multi_agent is not enabled in ${CONFIG_PATH} under [features]."
  fi
fi

if [[ -f "${CONFIG_PATH}" ]]; then
  if [[ ! -f "${RESTART_MARKER_PATH}" ]]; then
    fail "restart marker not found (${RESTART_MARKER_PATH}). Restart Codex and run this script with --mark-restart."
  elif [[ "${RESTART_MARKER_PATH}" -ot "${CONFIG_PATH}" ]]; then
    fail "restart marker is older than config. Restart Codex and run with --mark-restart."
  else
    pass "restart marker present and newer than config."
  fi
fi

required_files=(
  "STATUS.md"
  "WORKLOG.md"
  "docs/backlog.md"
  "docs/operations/multi-agent-playbook.md"
  "docs/operations/controller-prompts.md"
  "docs/operations/launch-checklist.md"
)
for rel_path in "${required_files[@]}"; do
  if [[ -f "${ROOT_DIR}/${rel_path}" ]]; then
    pass "required file exists: ${rel_path}"
  else
    fail "required file missing: ${rel_path}"
  fi
done

if command -v node >/dev/null 2>&1; then
  pass "node is installed."
else
  fail "node is not installed."
fi
if command -v npm >/dev/null 2>&1; then
  pass "npm is installed."
else
  fail "npm is not installed."
fi

claim_result="$(
  python3 - "${ROOT_DIR}/STATUS.md" "${TARGET_BL}" <<'PY'
import sys
from pathlib import Path

status_path = Path(sys.argv[1])
target_bl = (sys.argv[2] or "").strip()

in_progress = []
if status_path.exists():
    for raw in status_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 7:
            continue
        if cells[0].lower() == "rank" or set(cells[0]) == {"-"}:
            continue
        item_id = cells[1]
        status = cells[3].lower()
        owner = cells[4].lower()
        if status == "in progress" and "@codex" in owner:
            in_progress.append(item_id)

has_any = bool(in_progress)
target_ok = (not target_bl) or (target_bl in in_progress)
print("1" if has_any else "0")
print("1" if target_ok else "0")
print(",".join(in_progress))
PY
)"
claim_any="$(echo "${claim_result}" | sed -n '1p')"
claim_target="$(echo "${claim_result}" | sed -n '2p')"
claim_items="$(echo "${claim_result}" | sed -n '3p')"

if [[ "${claim_any}" == "1" ]]; then
  pass "active In Progress claim(s) owned by @codex: ${claim_items:-none}"
else
  fail "no In Progress claim owned by @codex in STATUS.md"
fi

if [[ -n "${TARGET_BL}" ]]; then
  if [[ "${claim_target}" == "1" ]]; then
    pass "target backlog item is actively claimed: ${TARGET_BL}"
  else
    fail "target backlog item is not In Progress for @codex: ${TARGET_BL}"
  fi
fi

if [[ "${RUN_CONTEXT_VALIDATE}" == true ]]; then
  echo
  echo "Running context validation..."
  if (cd "${ROOT_DIR}" && npm run context:validate >/tmp/inspectflow-context-validate.log 2>&1); then
    pass "context validation passed."
  else
    fail "context validation failed. See /tmp/inspectflow-context-validate.log."
  fi
fi

echo
echo "Running var cleanup dry-run..."
if (cd "${ROOT_DIR}" && npm run var:cleanup); then
  pass "var cleanup dry-run completed."
else
  fail "var cleanup dry-run failed."
fi

echo
if [[ "${failures}" -gt 0 ]]; then
  echo "Preflight result: FAIL (${failures} check(s) failed)"
  exit 1
fi

echo "Preflight result: PASS"
echo "Next: launch controller session, spawn bounded sub-agents, and merge evidence per docs/operations/multi-agent-playbook.md."
