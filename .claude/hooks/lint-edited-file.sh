#!/usr/bin/env bash
# PostToolUse hook: run eslint --fix on the single file that was just edited.
#
# `npm run lint` globs all of app/src and app/internal_packages, which is far too
# slow to run after every edit. eslint's cost here is startup-dominated (~4s to
# load the @typescript-eslint, react, import and jsx-a11y plugins), so linting one
# file costs about the same as linting three -- but a fraction of the full pass.
#
# Exits 2 with eslint's report on stderr when unfixable problems remain, which
# feeds the errors back to Claude rather than leaving them to be discovered later.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
file=$(jq -r '.tool_input.file_path // .tool_response.filePath // ""')

case "$file" in
  */app/src/*.ts | */app/src/*.tsx | \
  */app/internal_packages/*.ts | */app/internal_packages/*.tsx) ;;
  *) exit 0 ;;
esac

[ -f "$file" ] || exit 0
cd "$root" || exit 0

if ! output=$("./node_modules/.bin/eslint" --fix -c .eslintrc "$file" 2>&1); then
  printf 'eslint found problems it could not fix in %s:\n%s\n' "$file" "$output" >&2
  exit 2
fi
exit 0
