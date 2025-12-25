# rp1 development recipes

# Default recipe - show available commands
default:
    @just --list

# Build the OpenCode plugins
build-opencode:
    cd cli && bun run build:opencode

# Build the local binary (generates asset imports first)
build-local:
    cd cli && bun run generate:assets && bun build ./src/main.ts --compile --outfile ../bin/rp1

# Build everything for local testing
build: build-opencode build-local

# Full local install: build + install opencode (includes plugin installation)
install-local: build
    ./bin/rp1 install:opencode

local *args: build
    ./bin/rp1 {{args}}

test-cli: check-cli
  cd cli && bun run test

# Lint and type check TypeScript files
check-cli:
  cd cli && bun run lint && bun run typecheck && bun run format
