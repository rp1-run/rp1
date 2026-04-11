#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

container_args=()
forwarded_env=()
worktree_git_mounts=()
do_commit=false
attest=false
host_commit_outputs_file=""
container_commit_outputs_file=""

for arg in "$@"; do
    case "$arg" in
        --commit)
            do_commit=true
            ;;
        --attest)
            attest=true
            container_args+=("$arg")
            ;;
        *)
            container_args+=("$arg")
            ;;
    esac
done

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

host_commit_eval_results() {
    local outputs_file="$1"

    git -C "$repo_root" add evals/attestation.json

    if [ -f "$outputs_file" ]; then
        while IFS= read -r output; do
            [ -n "$output" ] || continue
            git -C "$repo_root" add "evals/${output}"
        done < "$outputs_file"
    fi

    if git -C "$repo_root" diff --cached --quiet 2>/dev/null; then
        echo "No attestation changes to commit"
        return
    fi

    git -C "$repo_root" commit -m "$(printf 'chore: attest evals\n\nGenerated with AI\n\nCo-Authored-By: rp1 <bot@rp1.run>')"
    echo "Attestation committed"
}

cleanup() {
    if [ -n "$host_commit_outputs_file" ] && [ -f "$host_commit_outputs_file" ]; then
        rm -f "$host_commit_outputs_file"
    fi
}

if [ "$do_commit" = "true" ] && [ "$attest" = "true" ]; then
    mkdir -p "$repo_root/.rp1/tmp"
    host_commit_outputs_file="$(mktemp "$repo_root/.rp1/tmp/eval-run-outputs.XXXXXX")"
    container_commit_outputs_file="/src/rp1/.rp1/tmp/$(basename "$host_commit_outputs_file")"
    forwarded_env+=(-e "RP1_EVAL_PASSED_SUITES_FILE=${container_commit_outputs_file}")
fi

trap cleanup EXIT

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
    "${container_args[@]}"
)

echo "Building dev image (cached layers reused)..."
(
    cd "$repo_root"
    docker build --platform linux/arm64 --target dev -t rp1-dev -f docker/Dockerfile .
)

echo "Starting dockerized eval run..."
cd "$repo_root"
if env -u RP1_DB -u RP1_EVAL_MODE docker "${docker_run_args[@]}"; then
    docker_exit=0
else
    docker_exit=$?
fi

if [ "$do_commit" = "true" ] && [ "$attest" = "true" ]; then
    host_commit_eval_results "$host_commit_outputs_file"
elif [ "$do_commit" = "true" ]; then
    echo "--commit requested without --attest; skipping commit"
fi

exit "$docker_exit"
