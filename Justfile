# rp1 development recipes

# Default recipe - show available commands
default:
    @just --list

# Build the OpenCode plugins
build-opencode:
    cd cli && bun run build:opencode

# Build the local binary
build-local:
    cd cli && bun build ./src/main.ts --compile --outfile ../rp1-local

# Build everything for local testing
build: build-opencode build-local

# Full local install: build + install opencode (includes plugin installation)
install-local: build
    ./rp1-local install:opencode

local *args: build
    ./rp1-local {{args}}

test-cli: check-cli
  cd cli && bun run test

# Lint and type check TypeScript files
check-cli:
  cd cli && bun run lint && bun run typecheck && bun run format
