# rp1 development recipes
#
# Complex shell bodies live in ./scripts/. Recipes here are thin delegators
# so the justfile reads as an index of what's runnable, not how each thing
# works. Edit scripts directly; just rerun the recipe.
#
# Note on variadic args (`*args`): just interpolates `{{ args }}` as raw text
# into the shell command, so shell metacharacters in arguments are evaluated by
# the invoking shell. This is a just language limitation, not a recipe bug.
# Do not pass untrusted input to `just <recipe>`.

PROJECT := ""
RP1_EXECUTABLE := "bin/rp1"
PYPI_INDEX := "https://pypi.org/simple"

# Keep uv-based project recipes on public PyPI even if a user-level uv config
# points at a private package index.
export UV_DEFAULT_INDEX := "https://pypi.org/simple"

# Default recipe - show available commands
default:
    @just --list

# ─────────────────────────────────────────────────────────────────────────────
# Local Setup
# ─────────────────────────────────────────────────────────────────────────────

# Align local git config with .gitattributes (LF line endings). Idempotent.
# Recommended after first clone, especially on Windows where the git installer
# defaults to core.autocrlf=true.
[doc("Align local git config with .gitattributes (LF line endings)")]
setup-git:
    @echo "Aligning local git config with .gitattributes (LF line endings)..."
    git config --local core.autocrlf false
    git config --local core.eol lf
    @echo ""
    @echo "Local git config set. Optionally also install lefthook hooks:"
    @echo "  brew install lefthook   # or: scoop install lefthook"
    @echo "  lefthook install"

# ─────────────────────────────────────────────────────────────────────────────
# Docker Environment
# ─────────────────────────────────────────────────────────────────────────────

# Start the Stable Tester container (clean room with harness CLIs, no rp1 installed).
# Use test-install.sh inside the container to simulate installation.
start-docker-stable:
    @./scripts/docker/start.sh stable

# Start the Active Developer container (local rp1 source mounted)
start-docker-dev:
    @./scripts/docker/start.sh dev

# ─────────────────────────────────────────────────────────────────────────────
# Build
# ─────────────────────────────────────────────────────────────────────────────

# Build everything for local testing
build: build-local-dev

# Build the OpenCode plugins
build-opencode:
    cd cli && bun run scripts/build-opencode.ts

# Build the Claude Code plugins
build-claude-code:
    cd cli && bun run scripts/build-claude-code.ts

# Build the Codex plugins
build-codex:
    cd cli && bun run scripts/build-codex.ts

# Build the Copilot CLI plugins
build-copilot:
    cd cli && bun run scripts/build-copilot.ts

# Build the Antigravity CLI plugin packages
build-antigravity:
    cd cli && bun run scripts/build-antigravity.ts

build-goose:
    cd cli && bun run scripts/build-goose.ts

# Validate plugin builds on every platform (CI-oriented; no compile, no web-ui).
# Catches platform-specific semantic-lint errors (L-rules) that single-platform
# builds miss — e.g. OpenCode-only naming, Codex-only tool surfaces.
[doc("Validate plugin builds on every platform (CI-oriented)")]
build-plugins-check:
    cd cli && bun run scripts/build-opencode.ts && bun run scripts/build-codex.ts && bun run scripts/build-claude-code.ts && bun run scripts/build-copilot.ts && bun run scripts/build-antigravity.ts && bun run scripts/build-goose.ts

# Build the web-ui
build-web-ui:
    cd cli && bun run build:web-ui

# Clear web-ui cache (needed when testing local builds). Stops the production
# daemon first if running, since it serves assets from this cache. Daemon
# handling is delegated to the shared lifecycle manager via a Bun helper script.
[doc("Clear web-ui cache (stops production daemon first)")]
clean-web-ui-cache:
    cd cli && bun run scripts/prepare-local-install-daemon.ts
    rm -rf ~/.rp1/web-ui/

# Build the local binary with -dev version suffix.
# RP1_BUILD_INTERNAL=1 includes utils (internal-only plugin) in the dev build
[doc("Build the local rp1 binary with -dev version suffix")]
build-local-dev: build-web-ui clean-web-ui-cache
    cd cli && bun install --frozen-lockfile && RP1_BUILD_INTERNAL=1 bun run scripts/build-opencode.ts && RP1_BUILD_INTERNAL=1 bun run scripts/build-codex.ts && RP1_BUILD_INTERNAL=1 bun run scripts/build-claude-code.ts && RP1_BUILD_INTERNAL=1 bun run scripts/build-copilot.ts && RP1_BUILD_INTERNAL=1 bun run scripts/build-antigravity.ts && RP1_BUILD_INTERNAL=1 bun run scripts/build-goose.ts && bun run build:teach-me-widgets && bun run generate:assets && bun build ./src/main.ts --compile --outfile ../bin/rp1 --define __RP1_DEV_BUILD__=true --define __RP1_DEV_SHA__='"'$(git rev-parse --short=5 HEAD)'"'

# Build the macOS native Arcade shell target without opening it
build-native-app: install
    @./scripts/native-app/build.sh

# ─────────────────────────────────────────────────────────────────────────────
# Dev Launch (per-platform with auto-build)
# ─────────────────────────────────────────────────────────────────────────────

# Launch Claude Code with local dev plugins (auto-builds if stale)
claude:
    @./scripts/dev-launch/claude.sh

# Launch OpenCode with local dev plugins (auto-builds if stale)
opencode:
    @./scripts/dev-launch/opencode.sh

# Launch Copilot CLI with local --plugin-dir plugin roots for maintainer iteration.
copilot:
    @./scripts/dev-launch/copilot.sh

# Launch Codex with local dev plugins (auto-builds if stale)
codex:
    @./scripts/dev-launch/codex.sh

# Launch Antigravity CLI with local Antigravity package assets (auto-builds if stale)
antigravity:
    @./scripts/dev-launch/antigravity.sh

# Launch the macOS native Arcade shell in Electrobun dev mode.
# Omit PROJECT for registered projects, or pass PROJECT=/path for direct launch.
native-app-dev project_arg="" rp1_arg="": build-local-dev
    @./scripts/native-app/dev.sh {{ quote(RP1_EXECUTABLE) }} {{ quote(PROJECT) }} {{ quote(project_arg) }} {{ quote(rp1_arg) }}

# ─────────────────────────────────────────────────────────────────────────────
# Test
# ─────────────────────────────────────────────────────────────────────────────

# Run all tests (CLI + native app + evals)
test: test-cli test-native-app test-evals

# Run CLI unit tests (fast)
test-unit:
    cd cli && bun run test:unit

# Run CLI integration tests
test-integration:
    cd cli && bun run test:integration

# Run all CLI tests
test-cli:
    cd cli && bun run test

# Run native app tests
test-native-app:
    cd native-app && bun run test

# Run Chromium smoke coverage for Arcade runtime reliability
test-web-ui-smoke:
    cd cli && bun run test:smoke:web-ui

# Run evals unit tests
test-evals:
    cd evals && bun run test

# ─────────────────────────────────────────────────────────────────────────────
# Antigravity Validation
# ─────────────────────────────────────────────────────────────────────────────

# Run the full Antigravity maintainer validation recipe set
antigravity-validate: antigravity-validate-build antigravity-validate-package antigravity-validate-lifecycle antigravity-validate-docs antigravity-validate-support-matrix antigravity-smoke-normal antigravity-smoke-worktree antigravity-smoke-checkout-evidence antigravity-smoke-dynamic-delegation antigravity-smoke-dynamic-fanout antigravity-smoke-dynamic-failure antigravity-smoke-boundaries antigravity-regression-existing-harnesses antigravity-regression-existing-harness-run-state
    @echo "Antigravity validation recipes completed."

# Build Antigravity package assets and verify the bundle manifest exists
antigravity-validate-build: build-antigravity
    test -f dist/antigravity/bundle-manifest.json

# Validate generated Antigravity packages with agy when available
antigravity-validate-package: build-antigravity
    #!/usr/bin/env bash
    set -euo pipefail
    if ! command -v agy >/dev/null 2>&1; then
        echo "PRODUCT-OWNED ANTIGRAVITY EXCEPTION: package validation requires a local agy binary."
        echo "Install Antigravity CLI, then rerun this recipe; set RP1_ANTIGRAVITY_REQUIRE_LIVE=1 to make the missing binary fail."
        if [ "${RP1_ANTIGRAVITY_REQUIRE_LIVE:-0}" = "1" ]; then exit 1; fi
        exit 0
    fi
    found=false
    for plugin_manifest in dist/antigravity/*/plugin.json; do
        [ -f "$plugin_manifest" ] || continue
        found=true
        plugin_dir="$(dirname "$plugin_manifest")"
        echo "Validating ${plugin_dir}"
        agy plugin validate "$plugin_dir"
    done
    if [ "$found" != "true" ]; then
        echo "No Antigravity plugin manifests found under dist/antigravity."
        exit 1
    fi

# Check isolated-home install, verify, update/staleness, uninstall, and repeat-uninstall behavior
antigravity-validate-lifecycle:
    cd cli && bun run scripts/test-with-isolated-home.ts src/__tests__/install/antigravity/lifecycle.test.ts src/__tests__/commands/install-antigravity.test.ts src/__tests__/commands/uninstall-antigravity.test.ts src/__tests__/commands/update-plugins-command.test.ts

# Audit active docs for stale Gemini wording outside the historical allowlist
antigravity-validate-docs:
    cd cli && bun run scripts/audit-antigravity-docs.ts ..

# Check catalog-backed Antigravity support matrix generation
antigravity-validate-support-matrix:
    cd cli && bun run scripts/test-with-isolated-home.ts src/__tests__/catalog/antigravity-support.test.ts src/__tests__/build/antigravity-support-matrix.test.ts

# Check normal-checkout Antigravity bootstrap and run-state contracts
antigravity-smoke-normal:
    cd cli && bun run scripts/test-with-isolated-home.ts src/__tests__/agent-tools/workflow-bootstrap/workflow-bootstrap.test.ts

# Check linked-worktree Antigravity root, workRoot, and codeRoot contracts
antigravity-smoke-worktree:
    cd cli && bun run scripts/test-with-isolated-home.ts src/__tests__/agent-tools/workflow-bootstrap/workflow-bootstrap.test.ts

# Record normal-checkout, worktree-checkout, and forced artifact-registration evidence artifacts
antigravity-smoke-checkout-evidence:
    cd cli && bun run scripts/record-antigravity-checkout-evidence.ts --feature-id antigravity --run-id "${RUN_ID:-manual}" --scenario all

# Check define_subagent-once, session registry, and cached invoke_subagent reuse
antigravity-smoke-dynamic-delegation:
    cd cli && bun run scripts/test-with-isolated-home.ts src/__tests__/build/antigravity-package.test.ts

# Check dynamic fanout recipe coverage and distinguishable delegated outputs
antigravity-smoke-dynamic-fanout:
    cd cli && bun run scripts/test-with-isolated-home.ts src/__tests__/build/antigravity-package.test.ts

# Check dynamic delegated failure visibility and successful-unit attribution
antigravity-smoke-dynamic-failure:
    cd cli && bun run scripts/test-with-isolated-home.ts src/__tests__/build/antigravity-package.test.ts

# Record reproducible boundary evidence for live Antigravity modes that need interactive confirmation
antigravity-smoke-boundaries: build-antigravity
    cd cli && bun run scripts/record-antigravity-boundary-evidence.ts --feature-id antigravity --run-id "${RUN_ID:-manual}" --scenario all

# Record Antigravity permissions, trust, approval, sandbox, and headless evidence guidance
antigravity-smoke-permissions-trust: build-antigravity
    cd cli && bun run scripts/record-antigravity-boundary-evidence.ts --feature-id antigravity --run-id "${RUN_ID:-manual}" --scenario permissions_trust

# Record Antigravity MCP unavailable or misconfigured evidence guidance
antigravity-smoke-mcp-failure: build-antigravity
    cd cli && bun run scripts/record-antigravity-boundary-evidence.ts --feature-id antigravity --run-id "${RUN_ID:-manual}" --scenario mcp_failure

# Guard existing Claude Code, OpenCode, Codex, and Copilot build/install surfaces
antigravity-regression-existing-harnesses:
    cd cli && bun run scripts/test-with-isolated-home.ts src/__tests__/build/command.test.ts src/__tests__/build/templates/template-rendering.test.ts src/__tests__/shared/install-core.test.ts src/__tests__/install/copilot/installer.test.ts

# Prove an existing-harness workflow can still register artifacts and run state without Antigravity setup
antigravity-regression-existing-harness-run-state:
    @./scripts/antigravity/regression-existing-harness-run-state.sh

# ─────────────────────────────────────────────────────────────────────────────
# Code Quality
# ─────────────────────────────────────────────────────────────────────────────

# Lint and type check everything
check: check-cli check-native-app check-web-ui check-evals

# Lint and type check CLI
check-cli:
    cd cli && bun run lint && bun run typecheck && bun run format

# Type check native app
check-native-app:
    cd native-app && bun run typecheck

# Type check web-ui
check-web-ui:
    cd cli/web-ui && bun install --frozen-lockfile && bun run typecheck

# Lint and type check evals
check-evals:
    cd evals && bun run lint && bun run typecheck && bun run format

# Auto-fix lint and format issues
fix: fix-cli fix-evals

# Auto-fix CLI lint and format issues
fix-cli:
    cd cli && bun run lint:fix && bun run format:fix

# Auto-fix evals lint and format issues
fix-evals:
    cd evals && bun run lint:fix && bun run format:fix

# ─────────────────────────────────────────────────────────────────────────────
# Local Installation
# ─────────────────────────────────────────────────────────────────────────────

# Full local install: remove stable + build + install to all platforms
install: _rm-stable-impl build
    @./scripts/install/install.sh

# Run local binary with args
run *args: build
    ./bin/rp1 {{ args }}

# Install to OpenCode
install-opencode:
    @echo ""
    @echo "━━━ OpenCode ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    @echo ""
    @./bin/rp1 install opencode

# Install to Codex
install-codex:
    @echo ""
    @echo "━━━ Codex ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    @echo ""
    @./bin/rp1 install codex --yes

# Internal: remove production rp1 platform installs and build artifacts (no prompt)
[private]
_rm-stable-impl:
    @./scripts/install/rm-stable-impl.sh

# Remove production rp1 from all platforms incl. installed native app (prompts unless FORCE=1)
rm-stable:
    @./scripts/install/rm-stable.sh

# Remove the user-local rp1 shim from ~/.local/bin
rm-local:
    rm -f ~/.local/bin/rp1
    @echo "Removed ~/.local/bin/rp1"

# Build native app and install as 'rp1 Arcade dev.app' to ~/Applications
install-native-app: build-native-app
    @./scripts/install/install-native-app.sh

# ─────────────────────────────────────────────────────────────────────────────
# Web-UI Development
# ─────────────────────────────────────────────────────────────────────────────

# Run web-ui in dev mode with hot reload (backend 6710, vite 6810)
serve-web-ui:
    -pkill -f "rp1-dev" 2>/dev/null || true
    -lsof -ti:6710 | xargs kill -9 2>/dev/null || true
    cd cli/web-ui && rm -rf dist && bunx concurrently -k -n server,client -c blue,green "NODE_ENV=development bun run src/cli.ts ../.. --port 6710" "bun run dev:client"

# ─────────────────────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────────────────────

# Delete all rows from the local rp1 database (for testing)
db-clean:
    @./scripts/db/clean.sh

# Delete all fake-prefixed rows from rp1.db (created by `rp1 fake`)
clean-fake-runs:
    @./scripts/db/clean-fake-runs.sh

# Delete the entire local rp1 database file (for testing)
db-reset:
    @./scripts/db/reset.sh

# ─────────────────────────────────────────────────────────────────────────────
# Documentation
# ─────────────────────────────────────────────────────────────────────────────

# Serve documentation with live reload
serve-docs:
    env -u UV_INDEX -u UV_EXTRA_INDEX_URL -u UV_INDEX_URL -u UV_NO_INDEX \
        uvx --no-config --default-index {{PYPI_INDEX}} --with mkdocs-material mkdocs serve --strict --livereload

# Build docs in strict mode -- fails on broken internal links and anchors.
# CI runs the same `mkdocs build --strict` (Docs Link Check job).
check-docs:
    env -u UV_INDEX -u UV_EXTRA_INDEX_URL -u UV_INDEX_URL -u UV_NO_INDEX \
        uvx --no-config --default-index {{PYPI_INDEX}} --with mkdocs-material mkdocs build --strict

# Bundle the readiness assessment React component (docs/javascripts/readiness-assessment.js)
build-readiness:
    @./scripts/build-readiness.sh

# ─────────────────────────────────────────────────────────────────────────────
# Evaluations
# ─────────────────────────────────────────────────────────────────────────────

# One-time setup for evals (run after clone)
eval-setup:
    cd evals && bun install --frozen-lockfile

# Directory structure: evals/suites/{plugin}/{suite}/evals.yaml
# Public entrypoint runs inside Docker via rp1-dev. Use eval-run-local only
# from inside the container.
#
# Examples:
#   just eval-run                          # run all suites in Docker (claude harness)
#   just eval-run rp1-dev/build-fast       # run a specific suite in Docker
#   just eval-run rp1-dev/build rp1-dev/build-fast  # multiple suites, one container
#   just eval-run --rebuild-image          # force dev image rebuild (after Dockerfile changes)
#   just eval-run --harness=opencode       # run all with opencode in Docker
#   just eval-run --attest --commit        # run all in Docker, then commit on host
#   just eval-run --platform=opencode      # attest for opencode platform
#   just eval-run-local rp1-dev/build-fast # run inside the current environment

# Run eval suites in Docker. Optional: suite path, --harness=opencode, --platform=<platform>, --attest, --commit, --verbose
# Stops the host-side promptfoo view daemon before Docker writes to SQLite, then reloads it after final results are available.
eval-run *args:
    #!/usr/bin/env bash
    just eval-dashboard-stop
    ./docker/eval-run.sh {{ args }}
    eval_exit=$?
    just eval-dashboard-reload
    exit $eval_exit

# Run eval suites in the current environment. Container-only entrypoint for Dockerized evals.
eval-run-local *args:
    @./scripts/evals/run-local.sh {{ args }}

# Generate attestation from eval output file
eval-attest output-file:
    bun run evals/src/attestation/cli.ts attest-from-output evals/output/{{ output-file }}

# Verify all attestations are current
eval-verify:
    bun run evals/src/attestation/cli.ts verify

# Show commands needing re-attestation
eval-status:
    bun run evals/src/attestation/cli.ts status

# Report REAL per-model token usage + cost from eval output (promptfoo's tokenUsage
# is unreliable for the claude-agent-sdk provider). No args = all evals/output/*.json;
# pass specific files to average across runs: just eval-usage out/a.json out/b.json
eval-usage *args:
    bun run evals/src/model-usage.ts {{args}}

# View eval results in browser
eval-view:
    #!/usr/bin/env bash
    set -e
    repo_root="$(pwd)"
    promptfoo_config_dir="${PROMPTFOO_CONFIG_DIR:-${repo_root}/.rp1/tmp/promptfoo}"
    export PROMPTFOO_DISABLE_WAL_MODE="${PROMPTFOO_DISABLE_WAL_MODE:-true}"

    mkdir -p "$promptfoo_config_dir"
    bash "${repo_root}/evals/scripts/prepare-promptfoo-config.sh" "$promptfoo_config_dir"
    export PROMPTFOO_CONFIG_DIR="$promptfoo_config_dir"
    cd evals && bunx promptfoo view -n

# Kill any running promptfoo view server. Used before Dockerized evals so the
# host dashboard does not hold the SQLite DB while the Linux container writes it.
eval-dashboard-stop:
    #!/usr/bin/env bash
    set -e
    pkill -f "promptfoo view" 2>/dev/null || true
    sleep 1

# Kill any running promptfoo view server and start a fresh one so the
# dashboard picks up evals written since the last start.
eval-dashboard-reload:
    @./scripts/evals/dashboard-reload.sh

# ─────────────────────────────────────────────────────────────────────────────
# Catalogue
# ─────────────────────────────────────────────────────────────────────────────

# Generate registry-backed discovery views and the transitional agent catalog
catalog-generate:
    ./scripts/generate-catalog.sh

# Verify approved discovery views and the transitional agent catalog
catalog-check:
    ./scripts/check-catalog.sh

# ─────────────────────────────────────────────────────────────────────────────
# Beta Release
# ─────────────────────────────────────────────────────────────────────────────

# Build and publish a beta release via GoReleaser.
# Usage: just beta-release v0.7.0-beta.1
beta-release version:
    @./scripts/beta-release.sh {{ quote(version) }}

# ─────────────────────────────────────────────────────────────────────────────
# Guards
# ─────────────────────────────────────────────────────────────────────────────

# Check that no tracked files contain internal Artifactory references
check-no-artifactory:
    #!/usr/bin/env bash
    set -euo pipefail
    pattern='block-artifacts\.com|\.sqprod\.co/artifactory'
    matches=$(git grep -n -E "$pattern" -- '*.lock' '*lock.json' '*lock.yaml' 2>/dev/null || true)
    if [ -n "$matches" ]; then
        echo "ERROR: Internal Artifactory references found in tracked files:"
        echo "$matches"
        echo ""
        echo "Fix: Ensure bunfig.toml points to https://registry.npmjs.org/ and re-run bun install"
        exit 1
    fi
    echo "No Artifactory references found."
