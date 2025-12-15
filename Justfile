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

# Install OpenCode plugin for local testing (copies to ~/.config/opencode/plugin/)
install-opencode-plugin:
    @echo "Installing rp1-base-hooks plugin to ~/.config/opencode/plugin/"
    @mkdir -p ~/.config/opencode/plugin/rp1-base-hooks
    @cp -r cli/dist/opencode/base/.opencode/plugin/* ~/.config/opencode/plugin/rp1-base-hooks/
    @echo "Done. Restart OpenCode to load the plugin."

# Full local install: build + install opencode + install plugin
install-local: build
    ./rp1-local install:opencode
    just install-opencode-plugin

local *args: build
    ./rp1-local {{args}}

test-cli:
  cd cli && bun run test
