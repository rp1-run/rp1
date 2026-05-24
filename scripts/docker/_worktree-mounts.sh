#!/usr/bin/env bash
# Sourced helper: computes worktree-git mount args for docker run.
#
# Populates global array `worktree_git_mounts` with `-v src:dest` entries
# pointing at the shared git common dir, so that container-side git operations
# see history when the host is in a linked worktree.
#
# Usage:
#   source scripts/docker/_worktree-mounts.sh
#   compute_worktree_mounts "$(pwd)"
#   docker run ... "${worktree_git_mounts[@]}" image

worktree_git_mounts=()

_abs_path() {
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

compute_worktree_mounts() {
    local repo_root="$1"
    worktree_git_mounts=()

    if ! git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        return
    fi

    local git_dir git_common_dir git_dir_abs git_common_dir_abs
    git_dir="$(git -C "$repo_root" rev-parse --git-dir)"
    git_common_dir="$(git -C "$repo_root" rev-parse --git-common-dir)"
    git_dir_abs="$(cd "$repo_root" && _abs_path "$git_dir")"
    git_common_dir_abs="$(cd "$repo_root" && _abs_path "$git_common_dir")"

    if [ "$git_dir_abs" != "$git_common_dir_abs" ]; then
        worktree_git_mounts+=(
            -v "${repo_root}:${repo_root}"
            -v "${git_common_dir_abs}:${git_common_dir_abs}"
        )
    fi
}
