#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

container_args=()
forwarded_env=()
worktree_git_mounts=()
promptfoo_mounts=()
do_commit=false
attest=false
rebuild_image=false
host_commit_outputs_file=""
container_commit_outputs_file=""
host_promptfoo_config_dir=""
container_promptfoo_config_dir="/home/rp1user/.promptfoo"

for arg in "$@"; do
    case "$arg" in
        --commit)
            do_commit=true
            ;;
        --rebuild-image)
            rebuild_image=true
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

setup_promptfoo_config_mount() {
    if [ -n "${PROMPTFOO_CONFIG_DIR-}" ]; then
        case "$PROMPTFOO_CONFIG_DIR" in
            /*) host_promptfoo_config_dir="$PROMPTFOO_CONFIG_DIR" ;;
            *) host_promptfoo_config_dir="${repo_root}/${PROMPTFOO_CONFIG_DIR}" ;;
        esac
    else
        host_promptfoo_config_dir="${repo_root}/.rp1/tmp/promptfoo"
    fi

    mkdir -p "$host_promptfoo_config_dir"
    bash "${repo_root}/evals/scripts/prepare-promptfoo-config.sh" "$host_promptfoo_config_dir"
    promptfoo_mounts+=(
        -v
        "${host_promptfoo_config_dir}:${container_promptfoo_config_dir}"
    )
    forwarded_env+=(-e "PROMPTFOO_CONFIG_DIR=${container_promptfoo_config_dir}")
}

add_env_if_set ANTHROPIC_API_KEY
add_env_if_set OPENAI_API_KEY
add_env_if_set GITHUB_TOKEN
export PROMPTFOO_DISABLE_WAL_MODE="${PROMPTFOO_DISABLE_WAL_MODE:-true}"
forwarded_env+=(-e "PROMPTFOO_DISABLE_WAL_MODE=${PROMPTFOO_DISABLE_WAL_MODE}")
add_worktree_git_mounts
setup_promptfoo_config_mount

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
    "${promptfoo_mounts[@]}"
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
    # safe.directory: the mounted repo is owned by the host user, not rp1user,
    # so git otherwise fails with "dubious ownership" and the --attest step
    # cannot record which commit the eval ran against. setup-dev.sh also sets
    # this, but that script is baked into the image -- repeating it here makes
    # the fix effective on images built before it existed.
    'git config --global --add safe.directory "*" && cd /src/rp1 && just eval-run-local "$@"'
    --
    "${container_args[@]}"
)

# On TLS-intercepting networks (Cloudflare WARP), in-container downloads fail
# with SELF_SIGNED_CERT_IN_CHAIN unless the image trusts the Gateway CA. Export
# it from the macOS keychain into the build context so the Dockerfile bakes it
# into the trust store. No-op when the cert is absent (WARP not installed).
export_warp_ca_cert() {
    local certs_dir="${repo_root}/docker/certs"
    mkdir -p "$certs_dir"
    if command -v security >/dev/null 2>&1; then
        local pem
        pem="$(security find-certificate -a -c "Cloudflare Gateway CA" -p /Library/Keychains/System.keychain 2>/dev/null || true)"
        if [ -n "$pem" ]; then
            printf '%s\n' "$pem" > "${certs_dir}/cloudflare-gateway-ca.crt"
            echo "Exported Cloudflare Gateway CA into docker/certs/ for the image trust store."
        fi
    fi
}

if [ "$rebuild_image" = "true" ] || ! docker image inspect rp1-dev >/dev/null 2>&1; then
    echo "Building dev image (cached layers reused)..."
    export_warp_ca_cert
    (
        cd "$repo_root"
        docker build --platform linux/arm64 --target dev -t rp1-dev -f docker/Dockerfile .
    )
else
    echo "Reusing existing rp1-dev image; pass --rebuild-image after Dockerfile changes."
fi

echo "Starting dockerized eval run..."
cd "$repo_root"
if env -u RP1_DB -u RP1_EVAL_MODE docker "${docker_run_args[@]}"; then
    docker_exit=0
else
    docker_exit=$?
fi

if [ "$do_commit" = "true" ] && [ "$attest" = "true" ]; then
    # A non-zero container exit includes attestation failure (run-local.sh
    # exits 1 when any attestation fails), so committing here would ship eval
    # outputs without their provenance record.
    if [ "$docker_exit" -eq 0 ]; then
        host_commit_eval_results "$host_commit_outputs_file"
    else
        echo "Skipping eval-results commit: containerized run exited ${docker_exit}"
    fi
elif [ "$do_commit" = "true" ]; then
    echo "--commit requested without --attest; skipping commit"
fi

exit "$docker_exit"
