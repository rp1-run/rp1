#!/usr/bin/env bash
# Launch the macOS native Arcade shell in Electrobun dev mode.
# Args (positional, may be empty strings):
#   $1: default rp1 executable (e.g. "bin/rp1")
#   $2: default project path
#   $3: launch arg in form PROJECT=/path/to/project OR RP1_EXECUTABLE=/path/to/rp1 (or empty)
#   $4: same as $3 (allows passing two overrides)
set -euo pipefail

repo_root="$(pwd)"
default_rp1_executable="${1:-bin/rp1}"
project_path="${2:-}"
project_arg="${3:-}"
rp1_arg="${4:-}"

rp1_executable="$default_rp1_executable"

apply_native_app_arg() {
    local launch_arg="$1"
    if [ -z "$launch_arg" ]; then
        return
    fi
    case "$launch_arg" in
        PROJECT=*)
            project_path="${launch_arg#PROJECT=}"
            ;;
        RP1_EXECUTABLE=*)
            rp1_executable="${launch_arg#RP1_EXECUTABLE=}"
            ;;
        *)
            echo "Unknown native-app-dev argument: ${launch_arg}"
            echo "Use PROJECT=/path/to/project or RP1_EXECUTABLE=/path/to/rp1."
            exit 2
            ;;
    esac
}

apply_native_app_arg "$project_arg"
apply_native_app_arg "$rp1_arg"

if [[ "$rp1_executable" != /* ]]; then
    rp1_executable="${repo_root}/${rp1_executable}"
fi

app_args=(--rp1-executable "$rp1_executable")
if [ -n "$project_path" ]; then
    if [[ "$project_path" != /* ]]; then
        project_path="${repo_root}/${project_path}"
    fi
    app_args+=(--project "$project_path")
fi

cd native-app
RP1_NATIVE_RP1_EXECUTABLE="$rp1_executable" \
    RP1_NATIVE_PROJECT_PATH="$project_path" \
    bun run dev -- "${app_args[@]}"
