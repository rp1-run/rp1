# rp1 development recipes

# Default recipe - show available commands
default:
    @just --list

# ─────────────────────────────────────────────────────────────────────────────
# Build
# ─────────────────────────────────────────────────────────────────────────────

# Build everything for local testing
build: build-local-dev

# Build the OpenCode plugins
build-opencode:
    cd cli && bun run build:opencode

# Build the web-ui
build-web-ui:
    cd cli/web-ui && bun run build

# Clear web-ui cache (needed when testing local builds)
clean-web-ui-cache:
    rm -rf ~/.rp1/web-ui/

# Build the local binary with -dev version suffix
build-local-dev: build-opencode build-web-ui clean-web-ui-cache
    cd cli && bun run generate:assets && bun build ./src/main.ts --compile --outfile ../bin/rp1 --define __RP1_DEV_BUILD__=true

# ─────────────────────────────────────────────────────────────────────────────
# Test
# ─────────────────────────────────────────────────────────────────────────────

# Run all tests
test: test-all

# Run unit tests (fast)
test-unit:
    cd cli && bun run test:unit

# Run integration tests
test-integration:
    cd cli && bun run test:integration

# Run all tests for CLI
test-all:
    cd cli && bun run test

# ─────────────────────────────────────────────────────────────────────────────
# Code Quality
# ─────────────────────────────────────────────────────────────────────────────

# Lint and type check everything
check: check-cli check-web-ui

# Lint and type check CLI
check-cli:
    cd cli && bun run lint && bun run typecheck && bun run format

# Type check web-ui
check-web-ui:
    cd cli/web-ui && npx tsc --noEmit

# Auto-fix lint and format issues
fix:
    cd cli && bun run lint:fix && bun run format:fix

# ─────────────────────────────────────────────────────────────────────────────
# Local Installation
# ─────────────────────────────────────────────────────────────────────────────

# Full local install: build + remove stable + install to both platforms
install: build rm-stable install-claude install-opencode

# Run local binary with args
run *args: build
    ./bin/rp1 {{args}}

# Prepare dev marketplace with -dev version plugins
prepare-dev-plugins:
    ./scripts/prepare-dev-plugins.sh

# Install dev plugins to Claude Code
install-claude: prepare-dev-plugins
    -claude plugin marketplace rm rp1-local 2>/dev/null
    claude plugin marketplace add ./.dev-marketplace/
    claude plugin install rp1-base@rp1-local
    claude plugin install rp1-dev@rp1-local
    claude plugin install rp1-utils@rp1-local

# Install to OpenCode
install-opencode:
    ./bin/rp1 install opencode

# Remove stable rp1 from both platforms
rm-stable:
    rm -rf ~/.config/opencode/plugin/rp1*
    rm -rf ~/.config/opencode/command/rp1*
    rm -rf ~/.config/opencode/skills/
    -claude plugin marketplace rm rp1-run 2>/dev/null

# ─────────────────────────────────────────────────────────────────────────────
# Web-UI Development
# ─────────────────────────────────────────────────────────────────────────────

# Run web-ui in dev mode with hot reload
serve-web-ui:
    -pkill -f "rp1 _daemon-server" 2>/dev/null || true
    -lsof -ti:7710 | xargs kill -9 2>/dev/null || true
    rm -f ~/.rp1/daemon.pid
    cd cli/web-ui && rm -rf dist && bunx concurrently -k -n server,client -c blue,green "NODE_ENV=development bun run src/cli.ts ../.. --port 7710" "bun run dev:client"

# ─────────────────────────────────────────────────────────────────────────────
# Documentation
# ─────────────────────────────────────────────────────────────────────────────

# Serve documentation with live reload
serve-docs:
    uvx --index https://pypi.org --with mkdocs-material mkdocs serve --strict --livereload

# ─────────────────────────────────────────────────────────────────────────────
# Evaluations
# ─────────────────────────────────────────────────────────────────────────────

# One-time setup for evals (run after clone)
setup-evals:
    cd evals && bun install --frozen-lockfile

# Run evaluation suite (e.g., just run-evals rp1-dev/build)
run-evals suite verbose="false":
    #!/usr/bin/env bash
    set -e
    timestamp=$(date -u +%Y-%m-%dT%H-%M-%S)
    suite_filename=$(echo "{{suite}}" | tr '/' '-')
    output_file="output/${suite_filename}-${timestamp}.json"
    verbose_flag=""
    if [ "{{verbose}}" = "true" ]; then verbose_flag="--verbose"; fi
    cd evals && bunx promptfoo eval -c "suites/{{suite}}/evals.yaml" --output "${output_file}" $verbose_flag
    echo "Output written to: evals/${output_file}"

# Generate attestation from eval output file
attest-evals output-file:
    bun run evals/src/attestation/cli.ts attest-from-output evals/{{output-file}}

# Verify all attestations are current
verify-evals:
    bun run evals/src/attestation/cli.ts verify

# Show commands needing re-attestation
show-evals-status:
    bun run evals/src/attestation/cli.ts status

# View eval results in browser
view-evals:
    cd evals && bunx promptfoo view
