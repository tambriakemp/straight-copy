#!/usr/bin/env bash
#
# Typecheck every edge function that compiles today, and keep it that way.
#
# Run locally exactly as CI runs it:
#   ./scripts/deno-check-functions.sh
#
# Files listed in supabase/functions/.deno-check-exempt are skipped, because
# they already fail for pre-existing reasons (see that file). Anything else
# must pass. A file that leaves the exempt list can never quietly return to it:
# the list is checked in, so removing a line is a reviewed change.

set -uo pipefail

cd "$(dirname "$0")/.."

EXEMPT_FILE="supabase/functions/.deno-check-exempt"
DENO="${DENO:-deno}"

if ! command -v "$DENO" >/dev/null 2>&1; then
  echo "error: deno not found on PATH. Install it: https://deno.land/#installation" >&2
  exit 1
fi

# Strip comments and blank lines, and normalise to paths relative to
# supabase/functions so the ledger reads as function names.
exempt=""
if [ -f "$EXEMPT_FILE" ]; then
  exempt=$(sed 's/#.*//' "$EXEMPT_FILE" | tr -d '\r' | awk 'NF')
fi

is_exempt() {
  [ -n "$exempt" ] && printf '%s\n' "$exempt" | grep -qxF "$1"
}

failed=""
checked=0
skipped=""
recovered=""

# _shared is checked implicitly: it has no entrypoint of its own, but every
# function imports it, so a break there fails many of these at once.
for path in supabase/functions/*/index.ts; do
  rel="${path#supabase/functions/}"

  if is_exempt "$rel"; then
    # Still check it, but only to notice when it starts passing.
    if "$DENO" check --node-modules-dir=auto "$path" >/dev/null 2>&1; then
      recovered="$recovered $rel"
    fi
    skipped="$skipped $rel"
    continue
  fi

  echo "::group::deno check $rel"
  if "$DENO" check --node-modules-dir=auto "$path"; then
    checked=$((checked + 1))
  else
    failed="$failed $rel"
  fi
  echo "::endgroup::"
done

summary() {
  echo "## Edge function typecheck"
  echo
  echo "Checked **$checked** functions clean."
  if [ -n "$failed" ]; then
    echo
    echo "**Failed:**"
    for f in $failed; do echo "- \`$f\`"; done
  fi
  if [ -n "$recovered" ]; then
    echo
    echo "**Now passing but still exempt** — delete these lines from"
    echo "\`$EXEMPT_FILE\`:"
    for f in $recovered; do echo "- \`$f\`"; done
  fi
  if [ -n "$skipped" ]; then
    echo
    echo "<details><summary>Exempt (pre-existing errors)</summary>"
    echo
    for f in $skipped; do echo "- \`$f\`"; done
    echo
    echo "</details>"
  fi
}

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  summary >> "$GITHUB_STEP_SUMMARY"
fi

for f in $recovered; do
  echo "::warning::$f now passes deno check — remove it from $EXEMPT_FILE."
done

if [ -n "$failed" ]; then
  echo "::error::deno check failed for:$failed"
  exit 1
fi

echo "deno check clean for $checked functions."
