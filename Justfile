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

# Run all tests (CLI + evals)
test: test-cli test-evals

# Run CLI unit tests (fast)
test-unit:
    cd cli && bun run test:unit

# Run CLI integration tests
test-integration:
    cd cli && bun run test:integration

# Run all CLI tests
test-cli:
    cd cli && bun run test

# Run evals unit tests
test-evals:
    cd evals && bun run test

# ─────────────────────────────────────────────────────────────────────────────
# Code Quality
# ─────────────────────────────────────────────────────────────────────────────

# Lint and type check everything
check: check-cli check-web-ui check-evals

# Lint and type check CLI
check-cli:
    cd cli && bun run lint && bun run typecheck && bun run format

# Type check web-ui
check-web-ui:
    cd cli/web-ui && npx tsc --noEmit

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
    @echo ""
    @echo "━━━ Claude Code ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    @echo ""
    @claude plugin marketplace rm rp1-local >/dev/null 2>&1 || true
    @claude plugin marketplace add ./.dev-marketplace/ >/dev/null 2>&1 && printf '\033[32m✔\033[0m Marketplace configured\n' || printf '\033[31m✗\033[0m Marketplace configuration failed\n'
    @claude plugin install rp1-base@rp1-local >/dev/null 2>&1 && printf '\033[32m✔\033[0m Installed rp1-base\n' || printf '\033[31m✗\033[0m Failed to install rp1-base\n'
    @claude plugin install rp1-dev@rp1-local >/dev/null 2>&1 && printf '\033[32m✔\033[0m Installed rp1-dev\n' || printf '\033[31m✗\033[0m Failed to install rp1-dev\n'
    @claude plugin install rp1-utils@rp1-local >/dev/null 2>&1 && printf '\033[32m✔\033[0m Installed rp1-utils\n' || printf '\033[31m✗\033[0m Failed to install rp1-utils\n'
    @echo ""
    @echo "Installed plugins:"
    @echo "  - rp1-base"
    @echo "  - rp1-dev"
    @echo "  - rp1-utils"
    @echo ""
    @echo "Restart Claude Code to load updated plugins."

# Install to OpenCode
install-opencode:
    @echo ""
    @echo "━━━ OpenCode ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    @echo ""
    @./bin/rp1 install opencode

# Remove stable rp1 from both platforms (only rp1-namespaced, preserves user files)
rm-stable:
    rm -rf ~/.config/opencode/plugin/rp1*
    rm -rf ~/.config/opencode/agents/rp1*
    rm -rf ~/.config/opencode/skills/rp1-*/
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
# Database
# ─────────────────────────────────────────────────────────────────────────────

# Delete all rows from the local status database (for testing)
db-clean:
    #!/usr/bin/env bash
    set -e
    db_path="$HOME/.rp1/status.db"
    if [ ! -f "$db_path" ]; then
        echo "No database found at $db_path"
        exit 0
    fi
    count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM status_updates;")
    sqlite3 "$db_path" "DELETE FROM status_updates;"
    echo "Deleted $count rows from status_updates"

# Delete the entire local status database file (for testing)
db-reset:
    #!/usr/bin/env bash
    set -e
    db_path="$HOME/.rp1/status.db"
    if [ ! -f "$db_path" ]; then
        echo "No database found at $db_path"
        exit 0
    fi
    rm -f "$db_path" "${db_path}-wal" "${db_path}-shm"
    echo "Removed $db_path (and WAL/SHM files)"

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
# Output file is overwritten on each run (no timestamp accumulation)
run-evals suite verbose="false":
    #!/usr/bin/env bash
    set -e
    # Add local rp1 bin to PATH so agents can use the dev version
    export PATH="$(pwd)/bin:$PATH"
    suite_filename=$(echo "{{suite}}" | tr '/' '-')
    output_file="output/${suite_filename}.json"
    verbose_flag=""
    if [ "{{verbose}}" = "true" ]; then verbose_flag="--verbose"; fi
    cd evals && bunx promptfoo eval -c "suites/{{suite}}/evals.yaml" --output "${output_file}" $verbose_flag
    echo "Output written to: evals/${output_file}"

# Generate attestation from eval output file
# For new-style fixed filenames: just attest-evals rp1-dev-build-fast.json
# For legacy timestamped files: just attest-evals rp1-dev-build-fast-2026-01-24T05-00-44.json
attest-evals output-file:
    bun run evals/src/attestation/cli.ts attest-from-output evals/output/{{output-file}}

# Verify all attestations are current
verify-evals:
    bun run evals/src/attestation/cli.ts verify

# Show commands needing re-attestation
show-evals-status:
    bun run evals/src/attestation/cli.ts status

# View eval results in browser
view-evals:
    cd evals && bunx promptfoo view -n
