#!/usr/bin/env bash
# Install local rp1 build to all platforms; install a user-local shim at
# ~/.local/bin/rp1; restart the Arcade daemon if a restart marker is present.
#
# Assumes `bin/rp1` is already built (the justfile recipe enforces this via
# the `build` dependency).
set -e

if [ "$(uname)" = "Darwin" ]; then
    config_dir="${HOME}/Library/Application Support/rp1"
else
    config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/rp1"
fi
restart_marker="${config_dir}/restart-arcade-after-install"

echo ""
echo "━━━ Installing to all platforms ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
./bin/rp1 install -y

dev_bin="$(pwd -P)/bin/rp1"
shim_dir="${HOME}/.local/bin"
shim_path="${shim_dir}/rp1"
mkdir -p "$shim_dir"
install -m 0755 "$dev_bin" "$shim_path"
if [ ! -x "$shim_path" ]; then
    echo "Failed to install executable at ${shim_path}"
    exit 1
fi

resolved="$(command -v rp1 || true)"
if [ "$resolved" != "$shim_path" ] && [ "$resolved" != "$dev_bin" ]; then
    echo "WARNING: rp1 currently resolves to ${resolved:-<not found>}, not ${shim_path}."
    echo "Put ${shim_dir} before other rp1 locations in PATH for project workflows to use the installed dev binary."
fi

echo ""
echo "Installed local rp1 executable: ${shim_path}"

if [ -f "$restart_marker" ]; then
    port=$(cat "$restart_marker" 2>/dev/null | tr -d '[:space:]')
    if [ -z "$port" ]; then port=7710; fi
    echo ""
    echo "Restarting Arcade daemon on port ${port}..."
    ./bin/rp1 arcade --daemon-only --port "$port" --no-open 2>&1 || echo "Warning: daemon restart failed (port ${port} may be in use)"
    rm -f "$restart_marker"
fi
