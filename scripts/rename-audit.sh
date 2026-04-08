#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$ROOT_DIR"

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
report_path="${1:-$ROOT_DIR/plans/rename-audit-baseline.md}"
include_docs="${INCLUDE_DOCS:-0}"

SEARCH_PATHS=(
  "app/src"
  "app/static"
  "app/internal_packages"
)
if [[ "$include_docs" == "1" ]]; then
  SEARCH_PATHS+=("docs" "README.md" "CONTRIBUTING.md")
fi

RG_EXCLUDES=(
  "-g" "!**/node_modules/**"
  "-g" "!**/specs/**"
  "-g" "!**/fixtures/**"
  "-g" "!**/docs/**"
  "-g" "!**/*.md"
)

scan() {
  local label="$1"
  local pattern="$2"
  echo "## ${label}"
  echo

  local all_results
  all_results="$(rg -n --hidden -S "${RG_EXCLUDES[@]}" "$pattern" "${SEARCH_PATHS[@]}" 2>/dev/null || true)"

  if [[ -z "$all_results" ]]; then
    echo "- Count: 0 (total)"
    echo "- Matches: none"
  else
    local total_count
    total_count="$(printf "%s\n" "$all_results" | wc -l | tr -d ' ')"
    local results
    # Avoid SIGPIPE (exit 141) under `set -o pipefail` when truncating output.
    results="$(printf "%s\n" "$all_results" | sed -n '1,200p')"
    local shown_count
    shown_count="$(printf "%s\n" "$results" | wc -l | tr -d ' ')"
    echo "- Count: ${total_count} (total)"
    echo "- Shown: ${shown_count} (first matches)"
    echo "- Sample Matches:"
    echo '```text'
    printf "%s\n" "$results"
    echo '```'
  fi
  echo
}

{
  echo "# Rename Audit Report"
  echo
  echo "- Generated: ${timestamp}"
  echo "- Root: ${ROOT_DIR}"
  echo "- Scope: runtime-only (set INCLUDE_DOCS=1 to include docs and markdown)"
  echo
  scan "Cloud URLs And Hosts" 'getmailspring|id\.getmailspring|updates\.getmailspring|community\.getmailspring|support@getmailspring|link\.getmailspring'
  scan "User-Facing Branding" '\bMailspring\b'
  scan "Legacy Protocol Usage" 'mailspring://|mailspring:'
  scan "Legacy Identifiers And Module Names" '\bmailspring[-_.]|mailspring-exports|mailspring-store|mailspring-component-kit|MailspringStore|MailspringAPIRequest'
} > "$report_path"

echo "Wrote report: $report_path"
