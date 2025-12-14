#!/bin/bash
# rp1 version check hook for Claude Code
# Outputs JSON for additionalContext injection when update is available
# Exits silently (0) when no update, on error, or for non-startup events

# Read hook input from stdin
INPUT=$(cat)

# Extract source field from JSON input
# Hook input format: {"source": "startup|resume|clear|compact", ...}
SOURCE=$(echo "$INPUT" | grep -o '"source"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

# Only check on startup (not resume, clear, or compact)
if [ "$SOURCE" != "startup" ]; then
  exit 0
fi

# Check if rp1 CLI is available
if ! command -v rp1 &> /dev/null; then
  exit 0
fi

# Run version check with timeout and capture result
# Use timeout if available (Linux), otherwise rely on CLI's internal timeout
RESULT=""
if command -v timeout &> /dev/null; then
  RESULT=$(timeout 8s rp1 check-update --json 2>/dev/null) || RESULT=""
else
  RESULT=$(rp1 check-update --json 2>/dev/null) || RESULT=""
fi

# Exit silently if result is empty or check failed
if [ -z "$RESULT" ]; then
  exit 0
fi

# Check if update is available
UPDATE_AVAILABLE=$(echo "$RESULT" | grep -o '"update_available"[[:space:]]*:[[:space:]]*true' || true)

# Exit silently if no update available
if [ -z "$UPDATE_AVAILABLE" ]; then
  exit 0
fi

# Extract version information
CURRENT=$(echo "$RESULT" | grep -o '"current_version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
LATEST=$(echo "$RESULT" | grep -o '"latest_version"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)

# Validate extracted versions
if [ -z "$CURRENT" ] || [ -z "$LATEST" ]; then
  exit 0
fi

# Output hookSpecificOutput JSON for Claude Code context injection
cat << EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "rp1 Update Available: v${CURRENT} -> v${LATEST}. Run /self-update to update."
  }
}
EOF

exit 0
