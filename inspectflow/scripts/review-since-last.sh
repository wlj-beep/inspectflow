#!/usr/bin/env bash
# review-since-last.sh
# Extracts the last review commit hash from docs/reviews/review-log.md and
# outputs the list of files changed since that commit — the scope manifest
# for the next delta review session.
#
# Usage:
#   bash scripts/review-since-last.sh
#   npm run review:delta

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REVIEW_LOG="$REPO_ROOT/docs/reviews/review-log.md"

# ── helpers ──────────────────────────────────────────────────────────────────

red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

# ── locate review log ─────────────────────────────────────────────────────────

if [[ ! -f "$REVIEW_LOG" ]]; then
  red "ERROR: Review log not found at $REVIEW_LOG"
  exit 1
fi

# ── extract last commit hash ──────────────────────────────────────────────────
# The log table has columns: Date | Session ID | Mode | Scope | Commit Hash | ...
# Commit Hash is the 5th pipe-delimited column. We skip the header/separator rows
# and grab the last data row.

LAST_HASH=$(grep -E '^\| [0-9]{4}-[0-9]{2}-[0-9]{2}' "$REVIEW_LOG" \
  | tail -1 \
  | awk -F'|' '{gsub(/[[:space:]]/, "", $6); print $6}' || true)

if [[ -z "$LAST_HASH" ]]; then
  yellow "No completed review sessions found in $REVIEW_LOG."
  echo ""
  bold  "ACTION REQUIRED: Run a full review first."
  echo  "  1. Start a review session scoped to the entire codebase."
  echo  "  2. After the approval pass, log the session in docs/reviews/review-log.md"
  echo  "     with the current HEAD commit hash."
  echo  "  3. Then run this script again to get delta scope for future sessions."
  echo ""
  echo  "See docs/reviews/review-protocol.md for the full workflow."
  exit 0
fi

# ── validate the hash exists in git ──────────────────────────────────────────

cd "$REPO_ROOT"

if ! git cat-file -e "${LAST_HASH}^{commit}" 2>/dev/null; then
  red "ERROR: Commit hash '$LAST_HASH' from review log was not found in git history."
  red "The repository may have been rebased, or the hash was recorded incorrectly."
  exit 1
fi

HEAD_HASH=$(git rev-parse HEAD)

if [[ "$LAST_HASH" == "$HEAD_HASH" ]]; then
  green "No changes since last review (last review hash = HEAD)."
  echo  "Nothing to review in delta mode."
  exit 0
fi

# ── produce delta manifest ────────────────────────────────────────────────────

bold "Delta Review Scope"
echo "Last review commit : $LAST_HASH"
echo "Current HEAD       : $HEAD_HASH"
echo ""

CHANGED_FILES=$(git diff --name-only "$LAST_HASH" HEAD)
FILE_COUNT=$(echo "$CHANGED_FILES" | grep -c . || true)

ADDITIONS=$(git diff --shortstat "$LAST_HASH" HEAD | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo 0)
DELETIONS=$(git diff --shortstat "$LAST_HASH" HEAD | grep -oE '[0-9]+ deletion'  | grep -oE '[0-9]+' || echo 0)

bold "Changed files ($FILE_COUNT):"
echo "$CHANGED_FILES" | sed 's/^/  /'
echo ""
echo "Lines added: $ADDITIONS  |  Lines removed: $DELETIONS"
echo ""
bold "Next steps:"
echo "  1. Review the files listed above using all six lenses"
echo "     (see docs/reviews/review-protocol.md)"
echo "  2. Write findings to:"
echo "     docs/reviews/sessions/$(date +%Y-%m-%d)-delta-findings.md"
echo "  3. After the approval pass, append a row to docs/reviews/review-log.md"
echo "     with commit hash: $HEAD_HASH"
