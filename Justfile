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
# Stops the production daemon first if running, since it serves assets from this cache
clean-web-ui-cache:
    #!/usr/bin/env bash
    set -e
    pid_file="${HOME}/Library/Application Support/rp1/daemon.pid"
    if [ -f "$pid_file" ]; then
        daemon_pid=$(sed -n '2p' "$pid_file")
        if [ -n "$daemon_pid" ] && kill -0 "$daemon_pid" 2>/dev/null; then
            echo "Stopping production daemon (PID $daemon_pid) before clearing web-ui cache..."
            curl -sf -X POST http://127.0.0.1:7710/api/v2/shutdown >/dev/null 2>&1 || true
            kill "$daemon_pid" 2>/dev/null || true
            for i in $(seq 1 30); do
                kill -0 "$daemon_pid" 2>/dev/null || break
                sleep 0.1
            done
            rm -f "$pid_file"
        fi
    fi
    rm -rf ~/.rp1/web-ui/

# Build the local binary with -dev version suffix
# RP1_BUILD_INTERNAL=1 includes utils (internal-only plugin) in the dev build
build-local-dev: build-web-ui clean-web-ui-cache
    cd cli && RP1_BUILD_INTERNAL=1 bun run scripts/build-opencode.ts && RP1_BUILD_INTERNAL=1 bun run scripts/build-codex.ts && RP1_BUILD_INTERNAL=1 bun run scripts/build-claude-code.ts && bun run generate:assets && bun build ./src/main.ts --compile --outfile ../bin/rp1 --define __RP1_DEV_BUILD__=true

# ─────────────────────────────────────────────────────────────────────────────
# Dev Launch (per-platform with auto-build)
# ─────────────────────────────────────────────────────────────────────────────

# Launch Claude Code with local dev plugins (auto-builds if stale)
claude:
    #!/usr/bin/env bash
    set -e
    if [ ! -d "dist/claude-code/base" ] || \
       [ "$(find plugins/ -newer dist/claude-code/base -name '*.md' 2>/dev/null | head -1)" ]; then
        echo "Building Claude Code artifacts..."
        cd cli && bun run scripts/build-claude-code.ts && cd ..
    fi
    claude --plugin-dir dist/claude-code/base \
           --plugin-dir dist/claude-code/dev \
           ${PLUGIN_UTILS:+--plugin-dir dist/claude-code/utils}

# Launch OpenCode with local dev plugins (auto-builds if stale)
opencode:
    #!/usr/bin/env bash
    set -e
    if [ ! -d "dist/opencode/base" ] || \
       [ "$(find plugins/ -newer dist/opencode/base -name '*.md' 2>/dev/null | head -1)" ]; then
        echo "Building OpenCode artifacts..."
        cd cli && bun run scripts/build-opencode.ts && cd ..
    fi
    ./bin/rp1 install opencode --yes --artifacts-dir dist/opencode
    opencode

# Launch Codex with local dev plugins (auto-builds if stale)
codex:
    #!/usr/bin/env bash
    set -e
    if [ ! -d "dist/codex/base" ] || \
       [ "$(find plugins/ -newer dist/codex/base -name '*.md' 2>/dev/null | head -1)" ]; then
        echo "Building Codex artifacts..."
        cd cli && bun run scripts/build-codex.ts && cd ..
    fi
    ./bin/rp1 install codex --yes --artifacts-dir dist/codex
    codex

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
install: rm-stable build
    @echo ""
    @echo "━━━ Installing to all platforms ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    @echo ""
    @./bin/rp1 install -y

# Run local binary with args
run *args: build
    ./bin/rp1 {{args}}

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

# Remove stable rp1 from all platforms (only rp1-namespaced, preserves user files)
rm-stable:
    rm -rf ~/.config/opencode/plugin/rp1*
    rm -rf ~/.config/opencode/agents/rp1*
    rm -rf ~/.config/opencode/skills/rp1-*/
    -claude plugin marketplace rm rp1-run 2>/dev/null
    -claude plugin marketplace rm rp1-local 2>/dev/null
    rm -rf ~/.rp1/claude/plugins/
    rm -rf ~/.agents/skills/rp1-*/
    rm -rf ~/.codex/skills/rp1-*/
    rm -rf ~/.codex/agents/rp1/
    rm -f bin/rp1
    rm -f ~/.rp1/platform-versions.json

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
    #!/usr/bin/env bash
    set -e
    db_path="${RP1_DB:-$HOME/.rp1/rp1.db}"
    if [ ! -f "$db_path" ]; then
        echo "No database found at $db_path"
        exit 0
    fi
    for table in runs events artifacts annotations tasks; do
        count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "0")
        sqlite3 "$db_path" "DELETE FROM $table;" 2>/dev/null || true
        echo "Deleted $count rows from $table"
    done
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

# Delete the entire local rp1 database file (for testing)
db-reset:
    #!/usr/bin/env bash
    set -e
    db_path="${RP1_DB:-$HOME/.rp1/rp1.db}"
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
eval-setup:
    cd evals && bun install --frozen-lockfile

# Directory structure: evals/suites/{plugin}/{suite}/evals.yaml
# Default harness: claude code. Override with --harness=opencode.
#
# Examples:
#   just eval-run                          # run all suites (claude harness)
#   just eval-run rp1-dev/build-fast       # run specific suite
#   just eval-run --harness=opencode       # run all with opencode
#   just eval-run --attest --commit        # run all, attest passing, commit
#   just eval-run --platform=opencode      # attest for opencode platform

# Run eval suites. Optional: suite path, --harness=opencode, --platform=<platform>, --attest, --commit, --verbose
eval-run *args:
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
eval-attest output-file:
    bun run evals/src/attestation/cli.ts attest-from-output evals/output/{{output-file}}

# Verify all attestations are current
eval-verify:
    bun run evals/src/attestation/cli.ts verify

# Show commands needing re-attestation
eval-status:
    bun run evals/src/attestation/cli.ts status

# View eval results in browser
eval-view:
    cd evals && bunx promptfoo view -n

# ─────────────────────────────────────────────────────────────────────────────
# Catalogue
# ─────────────────────────────────────────────────────────────────────────────

# Generate catalog/skills.yaml and catalog/agents.yaml from plugin sources
catalog-generate:
    ./scripts/generate-catalog.sh

# Verify catalogue is up-to-date with plugin sources
catalog-check:
    ./scripts/check-catalog.sh

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
