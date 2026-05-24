#!/usr/bin/env bash
# Kill any running promptfoo view server and start a fresh one so the dashboard
# picks up evals written since the last start. `promptfoo view` caches its
# in-memory result index at startup and does not invalidate on new DB writes,
# so recent evals appear missing until the view is bounced.
set -e

repo_root="$(pwd)"
promptfoo_config_dir="${PROMPTFOO_CONFIG_DIR:-${repo_root}/.rp1/tmp/promptfoo}"
export PROMPTFOO_DISABLE_WAL_MODE="${PROMPTFOO_DISABLE_WAL_MODE:-true}"

# Kill any existing `promptfoo view` processes (there can be more than one
# stacked on different ports). pkill returns 1 when nothing matches, which
# is fine for a reload from a cold state.
pkill -f "promptfoo view" 2>/dev/null || true
sleep 1

mkdir -p "$promptfoo_config_dir"
bash "${repo_root}/evals/scripts/prepare-promptfoo-config.sh" "$promptfoo_config_dir"
export PROMPTFOO_CONFIG_DIR="$promptfoo_config_dir"

# Start the view server as a detached child process. Plain shell backgrounding
# leaves promptfoo tied to the launching shell on macOS, so it can disappear
# as soon as just exits.
log_file="${promptfoo_config_dir}/logs/dashboard.log"
mkdir -p "$(dirname "$log_file")"
PROMPTFOO_DASHBOARD_LOG="$log_file" bun --eval '
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";

const logFile = process.env.PROMPTFOO_DASHBOARD_LOG;
if (!logFile) {
    throw new Error("PROMPTFOO_DASHBOARD_LOG is required");
}

const logFd = openSync(logFile, "w");
const child = spawn("bunx", ["promptfoo", "view", "-n"], {
    cwd: "evals",
    detached: true,
    env: process.env,
    stdio: ["ignore", logFd, logFd],
});
child.unref();
closeSync(logFd);
'

dashboard_ready=false
for _ in {1..10}; do
    if lsof -nP -iTCP:15500 -sTCP:LISTEN >/dev/null 2>&1; then
        dashboard_ready=true
        break
    fi
    sleep 1
done
if [ "$dashboard_ready" != "true" ]; then
    echo "Dashboard failed to stay running; log: $log_file"
    tail -n 40 "$log_file" 2>/dev/null || true
    exit 0
fi
echo "Dashboard restarting; log: $log_file"
echo "Default URL: http://localhost:15500/"
