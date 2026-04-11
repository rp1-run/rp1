#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

forwarded_env=()

add_env_if_set() {
    local name="$1"
    if [ -n "${!name-}" ]; then
        forwarded_env+=(-e "$name")
    fi
}

add_env_if_set ANTHROPIC_API_KEY
add_env_if_set OPENAI_API_KEY
add_env_if_set GITHUB_TOKEN

docker_run_args=(
    run
    --rm
    --platform
    linux/arm64
    -v
    "${repo_root}:/src/rp1"
)

if [ -t 0 ] && [ -t 1 ]; then
    docker_run_args+=(-it)
fi

docker_run_args+=(
    "${forwarded_env[@]}"
    -e
    RP1_EVAL_DOCKER=1
    rp1-dev
    zsh
    -lc
    'cd /src/rp1 && just eval-run-local "$@"'
    --
    "$@"
)

echo "Building dev image (cached layers reused)..."
(
    cd "$repo_root"
    docker build --platform linux/arm64 --target dev -t rp1-dev -f docker/Dockerfile .
)

echo "Starting dockerized eval run..."
cd "$repo_root"
exec env -u RP1_DB -u RP1_EVAL_MODE docker "${docker_run_args[@]}"
