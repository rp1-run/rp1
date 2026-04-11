#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

forwarded_env=()
worktree_git_mounts=()

abs_path() {
    local target="$1"
    if [ -d "$target" ]; then
        (
            cd "$target"
            pwd -P
        )
        return
    fi

    local dir
    dir="$(dirname "$target")"
    (
        cd "$dir"
        printf '%s/%s\n' "$(pwd -P)" "$(basename "$target")"
    )
}

add_env_if_set() {
    local name="$1"
    if [ -n "${!name-}" ]; then
        forwarded_env+=(-e "$name")
    fi
}

add_worktree_git_mounts() {
    local git_dir
    local git_common_dir
    local git_dir_abs
    local git_common_dir_abs

    if ! git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        return
    fi

    git_dir="$(git -C "$repo_root" rev-parse --git-dir)"
    git_common_dir="$(git -C "$repo_root" rev-parse --git-common-dir)"
    git_dir_abs="$(cd "$repo_root" && abs_path "$git_dir")"
    git_common_dir_abs="$(cd "$repo_root" && abs_path "$git_common_dir")"

    if [ "$git_dir_abs" = "$git_common_dir_abs" ]; then
        return
    fi

    worktree_git_mounts+=(
        -v
        "${repo_root}:${repo_root}"
        -v
        "${git_common_dir_abs}:${git_common_dir_abs}"
    )
}

add_env_if_set ANTHROPIC_API_KEY
add_env_if_set OPENAI_API_KEY
add_env_if_set GITHUB_TOKEN
add_worktree_git_mounts

docker_run_args=(
    run
    --rm
    --platform
    linux/arm64
    -v
    "${repo_root}:/src/rp1"
    -v
    "rp1-dev-evals-node_modules:/src/rp1/evals/node_modules"
    "${worktree_git_mounts[@]}"
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
