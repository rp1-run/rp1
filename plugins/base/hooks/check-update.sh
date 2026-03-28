#!/usr/bin/env bash
set -euo pipefail

input="$(cat 2>/dev/null || true)"

case "$input" in
  *'"source"'*'"startup"'*) ;;
  *) exit 0 ;;
esac

rp1_bin="${RP1_BINARY:-rp1}"
if ! command -v "$rp1_bin" >/dev/null 2>&1; then
  exit 0
fi

set +e
message="$("$rp1_bin" update --check --format hook-text 2>/dev/null)"
status=$?
set -e

case "$status" in
  0)
    [ -n "$message" ] || exit 0
    ;;
  *)
    exit 0
    ;;
esac

json_escape() {
  local s="${1//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

escaped_message="$(json_escape "🚀 $message")"
escaped_context="$(json_escape "An $message. Suggest running /self-update if the user asks about updates.")"

printf '{'
printf '"systemMessage":"%s",' "$escaped_message"
printf '"hookSpecificOutput":{'
printf '"hookEventName":"SessionStart",'
printf '"additionalContext":"%s"' "$escaped_context"
printf '}'
printf '}\n'
