# rp1 development recipes

# Default recipe - show available commands
default:
    @just --list

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

# Build the local binary (release version, no -dev suffix)
build-local-release: build-opencode build-web-ui clean-web-ui-cache
    cd cli && bun run generate:assets && bun build ./src/main.ts --compile --outfile ../bin/rp1

# Build everything for local testing (uses dev versions)
build: build-local-dev

# Prepare dev marketplace with -dev version plugins
prepare-dev-plugins:
    ./scripts/prepare-dev-plugins.sh

# Install dev plugins to Claude Code (with -dev versions)
update-local-claude: prepare-dev-plugins
    -claude plugin marketplace rm rp1-local 2>/dev/null
    claude plugin marketplace add ./.dev-marketplace/
    claude plugin install rp1-base@rp1-local
    claude plugin install rp1-dev@rp1-local
    claude plugin install rp1-utils@rp1-local

# Full local install: rm stable rp1, build + install opencode (all with -dev versions)
install-local: build rm-stable-rp1 update-local-claude
    ./bin/rp1 install opencode

# Run local binary with args
local *args: build
    ./bin/rp1 {{args}}

# Run unit tests for CLI (fast, no integration tests)
test-unit: check-cli
    cd cli && bun run test:unit

# Run integration tests for CLI
test-integration:
    cd cli && bun run test:integration

# Run all tests for CLI (unit + integration)
test-cli: check-cli
    cd cli && bun run test

# Run all tests (alias)
test: test-cli

# Lint and type check CLI TypeScript files
check-cli:
    cd cli && bun run lint && bun run typecheck && bun run format

# Auto-fix lint and format issues in CLI
fix-cli:
    cd cli && bun run lint:fix && bun run format:fix

# Type check web-ui
check-web-ui:
    cd cli/web-ui && npx tsc --noEmit

# Lint and type check everything
check: check-cli check-web-ui

# Docs
docs:
    uvx --index https://pypi.org --with mkdocs-material mkdocs serve --strict --livereload

# Dev stuff
# Removes Stable version of Claude and OpenCode rp1 plugins
# This is useful when testing local builds to avoid conflicts
rm-stable-rp1:
    rm -rf ~/.config/opencode/plugin/rp1*
    rm -rf ~/.config/opencode/command/rp1*
    rm -rf ~/.config/opencode/skills/
    -claude plugin marketplace rm rp1-run 2>/dev/null

# Clean up dev marketplace
clean-dev:
    rm -rf .dev-marketplace/

install-cli-deps:
    cd cli && bun install --frozen-lockfile

# Install eval dependencies
install-evals-deps:
    cd evals && bun install --frozen-lockfile

# Run evaluation suite with timestamped output (e.g., just evals-run rp1-dev/build verbose=true)
# Concurrency controlled via evaluateOptions.maxConcurrency in suite evals.yaml (default: 4)
evals-run suite verbose="false": install-evals-deps
    #!/usr/bin/env bash
    set -e
    timestamp=$(date -u +%Y-%m-%dT%H-%M-%S)
    suite_filename=$(echo "{{suite}}" | tr '/' '-')
    output_file="output/${suite_filename}-${timestamp}.json"
    verbose_flag=""
    if [ "{{verbose}}" = "true" ]; then verbose_flag="--verbose"; fi
    cd evals && bunx promptfoo eval -c "suites/{{suite}}/evals.yaml" --output "${output_file}" $verbose_flag
    echo "Output written to: evals/${output_file}"

# Generate attestation from eval output file (no Claude processes spawned)
evals-attest output-file: install-evals-deps
    cd evals && bun run src/attestation/cli.ts attest-from-output {{output-file}}

# Verify all attestations are current
evals-verify: install-evals-deps
    bun run evals/src/attestation/cli.ts verify

# Show commands needing re-attestation
evals-status: install-evals-deps
    bun run evals/src/attestation/cli.ts status

# View eval results in browser
evals-view: install-evals-deps
    cd evals && bunx promptfoo view
