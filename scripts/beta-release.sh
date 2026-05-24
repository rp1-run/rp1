#!/usr/bin/env bash
# Build and publish a beta release via GoReleaser.
# Usage: scripts/beta-release.sh v0.7.0-beta.1
set -euo pipefail

version="${1:-}"
if [ -z "$version" ]; then
    echo "ERROR: version argument required (e.g., v0.7.0-beta.1)"
    exit 1
fi

repo_root=$(git rev-parse --show-toplevel)
beta_branch="beta-release"
original_branch=$(git branch --show-current)
original_ref=$(git rev-parse HEAD)
original_short_ref=$(git rev-parse --short HEAD)
tag_created=false
tag_pushed=false
beta_branch_prepared=false

require_command() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "ERROR: Required command not found: $cmd"
        exit 1
    fi
}

cleanup() {
    local exit_code="$1"
    set +e

    rm -rf \
        "$repo_root/cli/dist" \
        "$repo_root/cli/web-ui/dist" \
        "$repo_root/cli/src/assets/embedded.ts"

    if [[ "$(git branch --show-current)" == "$beta_branch" ]]; then
        echo ""
        echo "  Switching back to $original_branch"
        if ! git switch "$original_branch" >/dev/null 2>&1; then
            echo "WARNING: Failed to switch back to $original_branch"
        fi
    fi

    if [[ "$tag_created" == true && "$tag_pushed" == false ]]; then
        echo "  Removing local tag $version"
        git tag -d "$version" >/dev/null 2>&1 || true
    fi

    if [[ "$beta_branch_prepared" == true ]] && git show-ref --verify --quiet "refs/heads/$beta_branch"; then
        echo "  Deleting temporary branch $beta_branch"
        git branch -D "$beta_branch" >/dev/null 2>&1 || {
            echo "WARNING: Failed to delete temporary branch $beta_branch"
        }
    fi

    trap - EXIT
    exit "$exit_code"
}
trap 'cleanup "$?"' EXIT

require_command git
require_command node
require_command bun

if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-beta\.[0-9]+$ ]]; then
    echo "ERROR: Version must match v*.*.*-beta.N (e.g., v0.7.0-beta.1)"
    echo "  Got: $version"
    exit 1
fi

if [[ -z "$original_branch" ]]; then
    echo "ERROR: Beta releases must start from a named branch, not detached HEAD"
    exit 1
fi

if [[ "$original_branch" == "$beta_branch" ]]; then
    echo "ERROR: Beta releases cannot start from $beta_branch"
    echo "  Switch to your source branch first, then re-run this recipe"
    exit 1
fi

if [[ -n "$(git status --short)" ]]; then
    echo "ERROR: Working tree must be clean before starting a beta release"
    echo ""
    git status --short
    exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
    echo "ERROR: Git remote 'origin' is not configured"
    exit 1
fi

# Tokens are no longer required locally — CI handles the release via
# the GoReleaser workflow once the tag is pushed.

pkg_version="${version#v}"

echo "━━━ Beta Release: $version ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo "  Checking origin connectivity..."
if ! git ls-remote --exit-code origin HEAD >/dev/null 2>&1; then
    echo "ERROR: Failed to query origin"
    exit 1
fi

if git rev-parse -q --verify "refs/tags/$version" >/dev/null 2>&1; then
    echo "ERROR: Tag already exists locally: $version"
    exit 1
fi

remote_tag=$(git ls-remote --tags origin "refs/tags/$version" 2>/dev/null || true)
if [[ -n "$remote_tag" ]]; then
    echo "ERROR: Tag already exists on origin: $version"
    exit 1
fi

echo "  Preparing temporary branch $beta_branch at $original_short_ref"
git switch -C "$beta_branch" "$original_ref" >/dev/null
beta_branch_prepared=true

original_version=$(cd cli && node -p "require('./package.json').version")
if [[ "$original_version" == "$pkg_version" ]]; then
    echo "ERROR: cli/package.json is already set to $pkg_version"
    echo "  Choose a new beta version before running this recipe"
    exit 1
fi
echo "  Bumping cli/package.json: $original_version -> $pkg_version"
cd cli && node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$pkg_version';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, '\t') + '\n');
" && cd ..

echo ""
echo "  Building release assets..."
cd cli && bun install && bun run build:release && cd ..

echo ""
git add cli/package.json
git commit -m "chore: bump version to $pkg_version for beta release"

beta_commit=$(git rev-parse --short HEAD)

echo ""
echo "  WARNING: This will publish a beta from a temporary branch"
echo "  ─────────────────────────────────────────────────────────"
echo "  Source branch:      $original_branch"
echo "  Source commit:      $original_short_ref"
echo "  Temporary branch:   $beta_branch (will be deleted afterward)"
echo "  Beta commit:        $beta_commit"
echo "  Beta tag:           $version"
echo ""
echo "  Remote actions after confirmation:"
echo "    - Push tag $version to origin"
echo "    - CI will build and publish the beta release via GoReleaser"
echo ""
read -r -p "  Continue? [y/N] " confirm
if [[ ! "$confirm" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo "  Cancelled before pushing beta release"
    exit 1
fi

echo ""
echo "  Creating git tag: $version"
git tag -a "$version" -m "Beta release $version"
tag_created=true
echo "  Pushing tag to origin..."
git push origin "refs/tags/$version"
tag_pushed=true

echo ""
echo "━━━ Beta Tag Pushed ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  CI will now build and publish the release."
echo "  Monitor: https://github.com/rp1-run/rp1/actions"
echo ""
echo "  Post-Release Checklist:"
echo "  ────────────────────────"
echo "  [ ] Verify install:  brew install rp1-run/tap/rp1-beta"
echo "  [ ] Verify version:  rp1 --version  (expect $pkg_version)"
echo "  [ ] Notify testers via GitHub issue or discussion"
echo ""
echo "  After promoting to stable:"
echo "  [ ] Archive or remove the GitHub pre-release for $version"
echo "  [ ] Reset or remove Casks/rp1-beta.rb in homebrew-tap"
echo "  [ ] Notify testers that the beta has been promoted to stable"
echo ""
