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

# Build the local binary (generates asset imports first, requires opencode + web-ui built)
build-local: build-opencode build-web-ui clean-web-ui-cache
    cd cli && bun run generate:assets && bun build ./src/main.ts --compile --outfile ../bin/rp1

# Build everything for local testing
build: build-local

update-local-claude:
  claude plugin marketplace rm rp1-local
  claude plugin marketplace add ./local-marketplace/
  claude plugin install rp1-base@rp1-local
  claude plugin install rp1-dev@rp1-local
  claude plugin install rp1-utils@rp1-local

# Full local install: rm stable rp1, build + install opencode (includes plugin installation)
install-local: build rm-stable-rp1 update-local-claude
    ./bin/rp1 install:opencode

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
    uv run --index https://pypi.org --with mkdocs-material mkdocs serve --strict

# Dev stuff
# Removes Stable version of Claude and OpenCode rp1 plugins
# This is useful when testing local builds to avoid conflicts
rm-stable-rp1:
  rm -rf ~/.config/opencode/plugin/rp1*
  rm -rf ~/.config/opencode/command/rp1*
  rm -rf ~/.config/opencode/skills/
  -claude plugin marketplace rm rp1-run 2>/dev/null

install-cli-deps:
  cd cli && bun install --frozen-lockfile
