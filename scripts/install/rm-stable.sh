#!/usr/bin/env bash
# Remove production rp1 from all platforms incl. installed native app.
# Prompts unless FORCE=1.
set -euo pipefail

if [ "${FORCE:-0}" != "1" ]; then
    echo "This removes rp1 from Claude Code, OpenCode, Codex, Copilot,"
    echo "Antigravity, and Gemini; plus bin/rp1 and the installed"
    echo "~/Applications/rp1 Arcade dev.app. User project files are preserved."
    echo "Set FORCE=1 to skip this prompt."
    printf "Continue? [y/N] "
    read -r reply
    case "$reply" in
        y|Y|yes|YES) ;;
        *) echo "Aborted."; exit 1 ;;
    esac
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bash "${script_dir}/rm-stable-impl.sh"

dev_app="${HOME}/Applications/rp1 Arcade dev.app"
if [ -d "$dev_app" ]; then
    lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
    if [ -x "$lsregister" ]; then
        "$lsregister" -u "$dev_app" >/dev/null 2>&1 || true
    fi
    rm -rf "$dev_app"
    echo "Removed ${dev_app}"
fi
