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

# Full local install: build + install opencode (includes plugin installation)
install-local: build
    ./bin/rp1 install:opencode

local *args: build
    ./bin/rp1 {{args}}

# Run tests for CLI
test-cli: check-cli
    cd cli && bun run test

# Run all tests
test: test-cli

# Lint and type check CLI TypeScript files
check-cli:
    cd cli && bun run lint && bun run typecheck && bun run format

# Type check web-ui
check-web-ui:
    cd cli/web-ui && npx tsc --noEmit

# Lint and type check everything
check: check-cli check-web-ui
