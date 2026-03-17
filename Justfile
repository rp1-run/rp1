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
    cd cli && bun run scripts/build-opencode.ts

# Build the Claude Code plugins
build-claude-code:
    cd cli && bun run scripts/build-claude-code.ts

# Build the Codex plugins
build-codex:
    cd cli && bun run scripts/build-codex.ts

# Build the web-ui
build-web-ui:
    cd cli/web-ui && bun run build

# Clear web-ui cache (needed when testing local builds)
clean-web-ui-cache:
    rm -rf ~/.rp1/web-ui/

# Build the local binary with -dev version suffix
build-local-dev: build-opencode build-codex build-web-ui clean-web-ui-cache
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
    cd cli/web-ui && bunx tsc --noEmit

# Lint and type check evals
check-evals:
    cd evals && bun run lint && bun run typecheck && bun run format

# Verify cli/dist/claude-code/ is up to date with plugins/ source
check-plugin-dist:
    #!/usr/bin/env bash
    set -euo pipefail
    just build-claude-code > /dev/null 2>&1
    if [ -n "$(git diff --name-only cli/dist/claude-code/)" ]; then
        echo "ERROR: cli/dist/claude-code/ is stale. Run 'just build-claude-code' and commit the changes."
        git diff --stat cli/dist/claude-code/
        exit 1
    fi
    echo "cli/dist/claude-code/ is up to date."

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

# Full local install: build + remove stable + install to all platforms
install: build rm-stable install-claude install-opencode

# Run local binary with args
run *args: build
    ./bin/rp1 {{args}}

# Prepare dev marketplace with -dev version plugins (builds CC artifacts first)
prepare-dev-plugins: build-claude-code
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

# Install to Codex (disabled — Codex support is paused)
# install-codex:
#     @echo ""
#     @echo "━━━ Codex ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
#     @echo ""
#     @./bin/rp1 install codex --yes

# Remove stable rp1 from all platforms (only rp1-namespaced, preserves user files)
rm-stable:
    rm -rf ~/.config/opencode/plugin/rp1*
    rm -rf ~/.config/opencode/agents/rp1*
    rm -rf ~/.config/opencode/skills/rp1-*/
    -claude plugin marketplace rm rp1-run 2>/dev/null
    rm -rf ~/.agents/skills/rp1-*/

# ─────────────────────────────────────────────────────────────────────────────
# Web-UI Development
# ─────────────────────────────────────────────────────────────────────────────

# Run web-ui in dev mode with hot reload (port 7711 to avoid conflicting with production daemon on 7710)
serve-web-ui:
    -pkill -f "rp1-dev" 2>/dev/null || true
    -lsof -ti:7711 | xargs kill -9 2>/dev/null || true
    rm -f ~/Library/Application\ Support/rp1/daemon.pid
    cd cli/web-ui && rm -rf dist && bunx concurrently -k -n server,client -c blue,green "NODE_ENV=development bun run src/cli.ts ../.. --port 7711" "bun run dev:client"

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
    # Clean project registry
    if [ "$(uname)" = "Darwin" ]; then
        registry_path="$HOME/Library/Application Support/rp1/projects.json"
    else
        registry_path="${XDG_CONFIG_HOME:-$HOME/.config}/rp1/projects.json"
    fi
    if [ -f "$registry_path" ]; then
        rm "$registry_path"
        echo "Deleted project registry at $registry_path"
    else
        echo "No project registry found at $registry_path"
    fi

# Delete all fake-prefixed rows from rp1.db (created by `rp1 fake`)
clean-fake-runs:
    #!/usr/bin/env bash
    set -e
    db_path="${RP1_DB:-$HOME/.rp1/rp1.db}"
    if [ ! -f "$db_path" ]; then
        echo "No database found at $db_path"
        exit 0
    fi

    echo "Cleaning fake runs from $db_path ..."
    echo ""

    # Delete in FK-safe order: annotations -> artifacts -> events -> runs

    # Annotations referencing artifacts from fake runs
    ann_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM annotations WHERE doc_id IN (SELECT doc_id FROM artifacts WHERE run_id LIKE 'fake-%');")
    sqlite3 "$db_path" "DELETE FROM annotations WHERE doc_id IN (SELECT doc_id FROM artifacts WHERE run_id LIKE 'fake-%');"
    echo "  annotations: $ann_count rows deleted"

    # Artifacts from fake runs
    art_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM artifacts WHERE run_id LIKE 'fake-%';")
    sqlite3 "$db_path" "DELETE FROM artifacts WHERE run_id LIKE 'fake-%';"
    echo "  artifacts:   $art_count rows deleted"

    # Events from fake runs
    evt_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM events WHERE run_id LIKE 'fake-%';")
    sqlite3 "$db_path" "DELETE FROM events WHERE run_id LIKE 'fake-%';"
    echo "  events:      $evt_count rows deleted"

    # Fake run records
    run_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM runs WHERE id LIKE 'fake-%';")
    sqlite3 "$db_path" "DELETE FROM runs WHERE id LIKE 'fake-%';"
    echo "  runs:        $run_count rows deleted"

    echo ""
    total=$((ann_count + art_count + evt_count + run_count))
    if [ "$total" -eq 0 ]; then
        echo "No fake runs found in database."
    else
        echo "Done. Removed $total total rows."
    fi

    # Clean fake artifact files from disk
    echo ""
    rp1_root="${RP1_ROOT:-.rp1}"
    fake_dir="$rp1_root/work/features"
    file_count=0
    if [ -d "$fake_dir" ]; then
        for d in "$fake_dir"/fake-*/; do
            [ -d "$d" ] || continue
            rm -rf "$d"
            file_count=$((file_count + 1))
        done
    fi
    if [ "$file_count" -eq 0 ]; then
        echo "No fake artifact directories found."
    else
        echo "Removed $file_count fake feature directories from $fake_dir."
    fi

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

# Directory structure: evals/suites/{plugin}/{suite}/evals.yaml
# Default harness: claude code. Override with --harness=opencode.
#
# Examples:
#   just run-evals                          # run all suites (claude harness)
#   just run-evals rp1-dev/build-fast       # run specific suite
#   just run-evals --harness=opencode       # run all with opencode
#   just run-evals --attest --commit        # run all, attest passing, commit
#   just run-evals --platform=opencode      # attest for opencode platform

# Run eval suites. Optional: suite path, --harness=opencode, --platform=<platform>, --attest, --commit, --verbose
run-evals *args:
    #!/usr/bin/env bash
    set -e
    repo_root="$(pwd)"
    export PATH="${repo_root}/bin:$PATH"
    evals_dir="${repo_root}/evals"

    # Parse flags
    suite=""
    harness="claude"
    platform="claude-code"
    attest=false
    do_commit=false
    verbose_flag=""
    for arg in {{args}}; do
        case "$arg" in
            --harness=*) harness="${arg#--harness=}" ;;
            --platform=*) platform="${arg#--platform=}" ;;
            --attest) attest=true ;;
            --commit) do_commit=true ;;
            --verbose) verbose_flag="--verbose" ;;
            *) suite="$arg" ;;
        esac
    done

    # Collect suite configs to run
    if [ -n "$suite" ]; then
        config_file="${evals_dir}/suites/${suite}/evals.yaml"
        if [ ! -f "$config_file" ]; then
            echo "Error: Suite not found: $config_file"
            exit 1
        fi
        configs_list="$config_file"
    else
        configs_list=$(find "${evals_dir}/suites" -path "*/evals.yaml" -not -path "*/shared/*" -not -path "*/node_modules/*" | sort)
    fi

    failed=0
    passed_suites=""

    for config in $configs_list; do
        suite_path="${config#${evals_dir}/suites/}"
        suite_path="${suite_path%/evals.yaml}"
        suite_filename=$(echo "${suite_path}" | tr '/' '-')
        output_file="output/${suite_filename}.json"
        provider_flag=""
        if [ "$harness" = "opencode" ]; then
            provider_flag="--providers file://${evals_dir}/providers/opencode-with-tools.ts"
        fi
        echo "=== ${suite_path} (harness: ${harness}) ==="
        if cd "${evals_dir}" && bunx promptfoo eval -c "suites/${suite_path}/evals.yaml" --output "${output_file}" $verbose_flag $provider_flag; then
            passed_suites="${passed_suites} ${output_file}"
            cd "${repo_root}"
        else
            echo "FAILED: ${suite_path}"
            failed=1
            cd "${repo_root}"
        fi
    done

    # Attest passing suites
    if [ "$attest" = "true" ] && [ -n "$passed_suites" ]; then
        echo ""
        echo "=== Attesting passing suites ==="
        for output in $passed_suites; do
            echo "Attesting: $output"
            bun run evals/src/attestation/cli.ts attest-from-output "evals/${output}" --platform="${platform}" || echo "Attestation failed for ${output}"
        done
    fi

    # Commit attestation changes
    if [ "$do_commit" = "true" ] && [ "$attest" = "true" ]; then
        if git diff --quiet evals/attestation.json 2>/dev/null; then
            echo "No attestation changes to commit"
        else
            git add evals/attestation.json
            git commit -m "$(printf 'chore: attest evals\n\nGenerated with AI\n\nCo-Authored-By: rp1 <bot@rp1.run>')"
            echo "Attestation committed"
        fi
    fi

    if [ "$failed" = "1" ]; then echo "Some evals FAILED"; exit 1; fi
    echo "All evals PASSED"

# Generate attestation from eval output file
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
