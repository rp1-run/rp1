#!/usr/bin/env bash
# Build and start an rp1 Docker container.
#
# Usage: scripts/docker/start.sh <stable|dev>
#   stable: clean room with harness CLIs, no rp1 installed (use test-install.sh inside)
#   dev:    local rp1 source mounted at /src/rp1
set -e

target="${1:-}"
case "$target" in
    stable)
        image_tag="rp1-stable"
        build_msg="Building stable image (cached layers reused)..."
        run_msg="Starting stable container (clean room — run test-install.sh to install rp1)..."
        ;;
    dev)
        image_tag="rp1-dev"
        build_msg="Building dev image (cached layers reused)..."
        run_msg="Starting dev container with local source mounted..."
        ;;
    *)
        echo "Usage: $0 <stable|dev>" >&2
        exit 2
        ;;
esac

repo_root="$(pwd)"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/docker/_worktree-mounts.sh
source "${script_dir}/_worktree-mounts.sh"
compute_worktree_mounts "$repo_root"

echo "$build_msg"
docker build --platform linux/arm64 --target "$target" -t "$image_tag" -f docker/Dockerfile .
echo "$run_msg"
docker run --rm -it \
    --platform linux/arm64 \
    -p 17710:7710 \
    -v "${repo_root}":/src/rp1 \
    -v rp1-dev-evals-node_modules:/src/rp1/evals/node_modules \
    "${worktree_git_mounts[@]}" \
    -e ANTHROPIC_API_KEY \
    -e OPENAI_API_KEY \
    -e GITHUB_TOKEN \
    "$image_tag"
