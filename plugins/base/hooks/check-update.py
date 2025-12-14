#!/usr/bin/env python3
"""
rp1 version check hook for Claude Code

Checks for rp1 updates on session startup and shows a notification
when an update is available.

Exits silently (0) when:
- Not a startup event (resume, clear, compact)
- rp1 CLI is not available
- No update is available
- Any error occurs
"""

import json
import os
import shutil
import subprocess
import sys

TIMEOUT_SECONDS = 8


def main():
    # Read hook input from stdin
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    # Only check on startup (not resume, clear, or compact)
    if input_data.get("source") != "startup":
        sys.exit(0)

    # Check if rp1 CLI is available
    rp1_binary = os.environ.get("RP1_BINARY", "rp1")
    if not shutil.which(rp1_binary):
        sys.exit(0)

    # Run version check and capture result
    try:
        result = subprocess.run(
            [rp1_binary, "check-update", "--json"],
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
        if result.returncode != 0:
            sys.exit(0)
    except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError):
        sys.exit(0)

    # Parse the JSON result
    try:
        check_result = json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        sys.exit(0)

    # Check if update is available
    if not check_result.get("update_available", False):
        sys.exit(0)

    # Extract version information
    current = check_result.get("current_version", "")
    latest = check_result.get("latest_version", "")

    if not current or not latest:
        sys.exit(0)

    # Output notification - systemMessage shows to user, additionalContext for Claude
    message = f"🔄 rp1 update available: v{current} → v{latest}  |  Run /self-update to update"

    hook_output = {
        "systemMessage": message,
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": f"An rp1 update is available (v{current} → v{latest}). Suggest running /self-update if the user asks about updates.",
        },
    }
    print(json.dumps(hook_output))


if __name__ == "__main__":
    main()
