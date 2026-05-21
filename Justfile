# rp1 development recipes

PROJECT := ""
RP1_EXECUTABLE := "bin/rp1"
PYPI_INDEX := "https://pypi.org/simple"

# Keep uv-based project recipes on public PyPI even if a user-level uv config
# points at a private package index.
export UV_DEFAULT_INDEX := "https://pypi.org/simple"

# Default recipe - show available commands
default:
    @just --list

# ─────────────────────────────────────────────────────────────────────────────
# Local Setup
# ─────────────────────────────────────────────────────────────────────────────

# Align local git config with this repo's .gitattributes policy (LF line
# endings). Recommended after first clone, especially on Windows where the
# git installer defaults to core.autocrlf=true. Idempotent.
setup-git:
    @echo "Aligning local git config with .gitattributes (LF line endings)..."
    git config --local core.autocrlf false
    git config --local core.eol lf
    @echo ""
    @echo "Local git config set. Optionally also install lefthook hooks:"
    @echo "  brew install lefthook   # or: scoop install lefthook"
    @echo "  lefthook install"

# ─────────────────────────────────────────────────────────────────────────────
# Docker Environment
# ─────────────────────────────────────────────────────────────────────────────
# Start the Stable Tester container (clean room with harness CLIs, no rp1 installed)

# Use test-install.sh inside the container to simulate installation
start-docker-stable:
    #!/usr/bin/env bash
    set -e
    repo_root="$(pwd)"
    worktree_git_mounts=()
    abs_path() {
        local target="$1"
        if [ -d "$target" ]; then
            (
                cd "$target"
                pwd -P
            )
            return
        fi

        local dir
        dir="$(dirname "$target")"
        (
            cd "$dir"
            printf '%s/%s\n' "$(pwd -P)" "$(basename "$target")"
        )
    }
    if git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        git_dir="$(git -C "$repo_root" rev-parse --git-dir)"
        git_common_dir="$(git -C "$repo_root" rev-parse --git-common-dir)"
        git_dir_abs="$(cd "$repo_root" && abs_path "$git_dir")"
        git_common_dir_abs="$(cd "$repo_root" && abs_path "$git_common_dir")"
        if [ "$git_dir_abs" != "$git_common_dir_abs" ]; then
            worktree_git_mounts+=(
                -v "${repo_root}:${repo_root}"
                -v "${git_common_dir_abs}:${git_common_dir_abs}"
            )
        fi
    fi
    echo "Building stable image (cached layers reused)..."
    docker build --platform linux/arm64 --target stable -t rp1-stable -f docker/Dockerfile .
    echo "Starting stable container (clean room — run test-install.sh to install rp1)..."
    docker run --rm -it \
        --platform linux/arm64 \
        -p 17710:7710 \
        -v "${repo_root}":/src/rp1 \
        -v rp1-dev-evals-node_modules:/src/rp1/evals/node_modules \
        "${worktree_git_mounts[@]}" \
        -e ANTHROPIC_API_KEY \
        -e OPENAI_API_KEY \
        -e GITHUB_TOKEN \
        rp1-stable

# Start the Active Developer container (local rp1 source mounted)
start-docker-dev:
    #!/usr/bin/env bash
    set -e
    repo_root="$(pwd)"
    worktree_git_mounts=()
    abs_path() {
        local target="$1"
        if [ -d "$target" ]; then
            (
                cd "$target"
                pwd -P
            )
            return
        fi

        local dir
        dir="$(dirname "$target")"
        (
            cd "$dir"
            printf '%s/%s\n' "$(pwd -P)" "$(basename "$target")"
        )
    }
    if git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        git_dir="$(git -C "$repo_root" rev-parse --git-dir)"
        git_common_dir="$(git -C "$repo_root" rev-parse --git-common-dir)"
        git_dir_abs="$(cd "$repo_root" && abs_path "$git_dir")"
        git_common_dir_abs="$(cd "$repo_root" && abs_path "$git_common_dir")"
        if [ "$git_dir_abs" != "$git_common_dir_abs" ]; then
            worktree_git_mounts+=(
                -v "${repo_root}:${repo_root}"
                -v "${git_common_dir_abs}:${git_common_dir_abs}"
            )
        fi
    fi
    echo "Building dev image (cached layers reused)..."
    docker build --platform linux/arm64 --target dev -t rp1-dev -f docker/Dockerfile .
    echo "Starting dev container with local source mounted..."
    docker run --rm -it \
        --platform linux/arm64 \
        -p 17710:7710 \
        -v "${repo_root}":/src/rp1 \
        -v rp1-dev-evals-node_modules:/src/rp1/evals/node_modules \
        "${worktree_git_mounts[@]}" \
        -e ANTHROPIC_API_KEY \
        -e OPENAI_API_KEY \
        -e GITHUB_TOKEN \
        rp1-dev

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

# Build the Copilot CLI plugins
build-copilot:
    cd cli && bun run scripts/build-copilot.ts

# Build the Antigravity CLI plugin packages
build-antigravity:
    cd cli && bun run scripts/build-antigravity.ts

# Validate plugin builds on every platform (CI-oriented; no compile, no web-ui).
# Catches platform-specific semantic-lint errors (L-rules) that single-platform
# builds miss — e.g. OpenCode-only naming, Codex-only tool surfaces.
build-plugins-check:
    cd cli && bun run scripts/build-opencode.ts && bun run scripts/build-codex.ts && bun run scripts/build-claude-code.ts && bun run scripts/build-copilot.ts && bun run scripts/build-antigravity.ts

# Build the web-ui
build-web-ui:
    cd cli && bun run build:web-ui

# Clear web-ui cache (needed when testing local builds)

# Stops the production daemon first if running, since it serves assets from this cache.
# Delegates daemon handling to the shared lifecycle manager via a Bun helper script.
clean-web-ui-cache:
    #!/usr/bin/env bash
    set -e
    cd cli && bun run scripts/prepare-local-install-daemon.ts
    rm -rf ~/.rp1/web-ui/

# Build the local binary with -dev version suffix

# RP1_BUILD_INTERNAL=1 includes utils (internal-only plugin) in the dev build
build-local-dev: build-web-ui clean-web-ui-cache
    cd cli && bun install --frozen-lockfile && RP1_BUILD_INTERNAL=1 bun run scripts/build-opencode.ts && RP1_BUILD_INTERNAL=1 bun run scripts/build-codex.ts && RP1_BUILD_INTERNAL=1 bun run scripts/build-claude-code.ts && RP1_BUILD_INTERNAL=1 bun run scripts/build-copilot.ts && RP1_BUILD_INTERNAL=1 bun run scripts/build-antigravity.ts && bun run generate:assets && bun build ./src/main.ts --compile --outfile ../bin/rp1 --define __RP1_DEV_BUILD__=true

# Build the macOS native Arcade shell target without opening it
build-native-app: install
    #!/usr/bin/env bash
    set -euo pipefail
    cd native-app
    bun install --frozen-lockfile
    rm -rf \
        "build/dev-macos-arm64/RP1 Arcade-dev.app" \
        "build/stable-macos-arm64/rp1 Arcade.app" \
        "artifacts/stable-macos-arm64-rp1Arcade.app.tar.zst" \
        "artifacts/stable-macos-arm64-rp1Arcade.dmg" \
        "artifacts/stable-macos-arm64-update.json"
    bun run build:macos
    app_path="$(find build/stable-macos-arm64 -maxdepth 1 -name 'rp1 Arcade.app' -print -quit)"
    if [ -z "$app_path" ]; then
        echo "Native app build finished, but no rp1 Arcade.app was found under native-app/build/stable-macos-arm64."
        exit 1
    fi
    bundle_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "${app_path}/Contents/Info.plist")"
    bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${app_path}/Contents/Info.plist")"
    if [ "$bundle_name" != "rp1 Arcade" ] || [ "$bundle_id" != "run.rp1.arcade" ]; then
        echo "Native app bundle identity mismatch: CFBundleName=${bundle_name}, CFBundleIdentifier=${bundle_id}"
        exit 1
    fi
    if [ -d "assets/icon.iconset" ]; then
        bundle_icon_file="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIconFile' "${app_path}/Contents/Info.plist")"
        icon_path="${app_path}/Contents/Resources/AppIcon.icns"
        if [ "$bundle_icon_file" != "AppIcon" ]; then
            echo "Native app bundle icon mismatch: CFBundleIconFile=${bundle_icon_file}"
            exit 1
        fi
        if [ ! -s "$icon_path" ]; then
            echo "Native app bundle icon missing or empty: ${icon_path}"
            exit 1
        fi
    fi
    cp ../bin/rp1 "${app_path}/Contents/MacOS/rp1"
    chmod +x "${app_path}/Contents/MacOS/rp1"
    touch "$app_path"
    lsregister="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
    if [ -x "$lsregister" ]; then
        if command -v mdfind >/dev/null 2>&1; then
            while IFS= read -r stale_app; do
                if [ -z "$stale_app" ] || [ ! -f "${stale_app}/Contents/Info.plist" ]; then
                    continue
                fi
                stale_bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "${stale_app}/Contents/Info.plist" 2>/dev/null || true)"
                if [ "$stale_bundle_id" = "run.rp1.arcade" ]; then
                    "$lsregister" -u "$stale_app" >/dev/null 2>&1 || true
                    echo "Unregistered stale native dev app: $stale_app"
                fi
            done < <(mdfind 'kMDItemFSName == "RP1 Arcade-dev.app"')
        fi
        "$lsregister" -f "$app_path" >/dev/null 2>&1 || true
    fi
    echo "Built native app: native-app/${app_path}"
    echo "Bundled local rp1 executable: native-app/${app_path}/Contents/MacOS/rp1"
    echo "Run later with:"
    echo "  open -n \"native-app/${app_path}\""
    echo "Direct project launch:"
    echo "  RP1_NATIVE_PROJECT_PATH=\"/path/to/rp1-project\" \"native-app/${app_path}/Contents/MacOS/launcher\""

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

# Launch Copilot CLI with local --plugin-dir plugin roots for maintainer iteration.
# This is the fast loop and intentionally does not mutate rp1-local native install state.
copilot:
    #!/usr/bin/env bash
    set -e
    if [ ! -d "dist/copilot/base" ] || \
       [ ! -d "dist/copilot/dev" ] || \
       [ ! -f "dist/copilot/base/plugin.json" ] || \
       [ ! -f "dist/copilot/dev/plugin.json" ] || \
       { [ -n "${PLUGIN_UTILS:-}" ] && [ ! -d "dist/copilot/utils" ]; } || \
       { [ -n "${PLUGIN_UTILS:-}" ] && [ ! -f "dist/copilot/utils/plugin.json" ]; } || \
       [ "$(find plugins/ cli/src/build cli/scripts -newer dist/copilot/base/plugin.json \\( -name '*.md' -o -name '*.liquid' -o -name '*.ts' -o -name '*.json' \\) 2>/dev/null | head -1)" ]; then
        echo "Building Copilot CLI artifacts for the --plugin-dir dev loop..."
        cd cli
        if [ -n "${PLUGIN_UTILS:-}" ]; then
            RP1_BUILD_INTERNAL=1 bun run scripts/build-copilot.ts
        else
            bun run scripts/build-copilot.ts
        fi
        cd ..
    fi
    plugin_dirs=(--plugin-dir dist/copilot/base --plugin-dir dist/copilot/dev)
    if [ -n "${PLUGIN_UTILS:-}" ]; then
        plugin_dirs+=(--plugin-dir dist/copilot/utils)
    fi
    gh copilot -- "${plugin_dirs[@]}"

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

# Launch Antigravity CLI with local Antigravity package assets (auto-builds if stale)
antigravity:
    #!/usr/bin/env bash
    set -e
    if [ ! -d "dist/antigravity/base" ] || \
       [ ! -f "dist/antigravity/base/plugin.json" ] || \
       [ "$(find plugins/ cli/src/build cli/scripts -newer dist/antigravity/base/plugin.json \( -name '*.md' -o -name '*.liquid' -o -name '*.ts' -o -name '*.json' \) 2>/dev/null | head -1)" ]; then
        echo "Building Antigravity artifacts..."
        cd cli && RP1_BUILD_INTERNAL=1 bun run scripts/build-antigravity.ts && cd ..
    fi
    RP1_ANTIGRAVITY_BUNDLE_DIR=dist/antigravity ./bin/rp1 install antigravity
    agy

# Launch the macOS native Arcade shell in Electrobun dev mode.
# Omit PROJECT for registered projects, or pass PROJECT=/path for direct launch.
native-app-dev project_arg="" rp1_arg="": build-local-dev
    #!/usr/bin/env bash
    set -euo pipefail
    repo_root="$(pwd)"
    default_rp1_executable={{ quote(RP1_EXECUTABLE) }}
    rp1_executable="$default_rp1_executable"
    project_path={{ quote(PROJECT) }}
    project_arg={{ quote(project_arg) }}
    rp1_arg={{ quote(rp1_arg) }}

    apply_native_app_arg() {
        local launch_arg="$1"
        if [ -z "$launch_arg" ]; then
            return
        fi
        case "$launch_arg" in
            PROJECT=*)
                project_path="${launch_arg#PROJECT=}"
                ;;
            RP1_EXECUTABLE=*)
                rp1_executable="${launch_arg#RP1_EXECUTABLE=}"
                ;;
            *)
                echo "Unknown native-app-dev argument: ${launch_arg}"
                echo "Use PROJECT=/path/to/project or RP1_EXECUTABLE=/path/to/rp1."
                exit 2
                ;;
        esac
    }

    apply_native_app_arg "$project_arg"
    apply_native_app_arg "$rp1_arg"

    if [[ "$rp1_executable" != /* ]]; then
        rp1_executable="${repo_root}/${rp1_executable}"
    fi

    app_args=(--rp1-executable "$rp1_executable")
    if [ -n "$project_path" ]; then
        if [[ "$project_path" != /* ]]; then
            project_path="${repo_root}/${project_path}"
        fi
        app_args+=(--project "$project_path")
    fi

    cd native-app
    RP1_NATIVE_RP1_EXECUTABLE="$rp1_executable" \
        RP1_NATIVE_PROJECT_PATH="$project_path" \
        bun run dev -- "${app_args[@]}"

# ─────────────────────────────────────────────────────────────────────────────
# Test
# ─────────────────────────────────────────────────────────────────────────────

# Run all tests (CLI + native app + evals)
test: test-cli test-native-app test-evals

# Run CLI unit tests (fast)
test-unit:
    cd cli && bun run test:unit

# Run CLI integration tests
test-integration:
    cd cli && bun run test:integration

# Run all CLI tests
test-cli:
    cd cli && bun run test

# Run native app tests
test-native-app:
    cd native-app && bun run test

# Run Chromium smoke coverage for Arcade runtime reliability
test-web-ui-smoke:
    cd cli && bun run test:smoke:web-ui

# Run evals unit tests
test-evals:
    cd evals && bun run test

# ─────────────────────────────────────────────────────────────────────────────
# Antigravity Validation
# ─────────────────────────────────────────────────────────────────────────────

# Run the full Antigravity maintainer validation recipe set
antigravity-validate: antigravity-validate-build antigravity-validate-package antigravity-validate-lifecycle antigravity-validate-docs antigravity-validate-support-matrix antigravity-smoke-normal antigravity-smoke-worktree antigravity-smoke-checkout-evidence antigravity-smoke-dynamic-delegation antigravity-smoke-dynamic-fanout antigravity-smoke-dynamic-failure antigravity-smoke-boundaries antigravity-regression-existing-harnesses antigravity-regression-existing-harness-run-state
    @echo "Antigravity validation recipes completed."

# Build Antigravity package assets and verify the bundle manifest exists
antigravity-validate-build: build-antigravity
    test -f dist/antigravity/bundle-manifest.json

# Validate generated Antigravity packages with agy when available
antigravity-validate-package: build-antigravity
    #!/usr/bin/env bash
    set -euo pipefail
    if ! command -v agy >/dev/null 2>&1; then
        echo "PRODUCT-OWNED ANTIGRAVITY EXCEPTION: package validation requires a local agy binary."
        echo "Install Antigravity CLI, then rerun this recipe; set RP1_ANTIGRAVITY_REQUIRE_LIVE=1 to make the missing binary fail."
        if [ "${RP1_ANTIGRAVITY_REQUIRE_LIVE:-0}" = "1" ]; then exit 1; fi
        exit 0
    fi
    found=false
    for plugin_manifest in dist/antigravity/*/plugin.json; do
        [ -f "$plugin_manifest" ] || continue
        found=true
        plugin_dir="$(dirname "$plugin_manifest")"
        echo "Validating ${plugin_dir}"
        agy plugin validate "$plugin_dir"
    done
    if [ "$found" != "true" ]; then
        echo "No Antigravity plugin manifests found under dist/antigravity."
        exit 1
    fi

# Check isolated-home install, verify, update/staleness, uninstall, and repeat-uninstall behavior
antigravity-validate-lifecycle:
    cd cli && bun test src/__tests__/install/antigravity/lifecycle.test.ts src/__tests__/commands/install-antigravity.test.ts src/__tests__/commands/uninstall-antigravity.test.ts src/__tests__/commands/update-plugins-command.test.ts

# Audit active docs for stale Gemini wording outside the historical allowlist
antigravity-validate-docs:
    cd cli && bun run scripts/audit-antigravity-docs.ts ..

# Check catalog-backed Antigravity support matrix generation
antigravity-validate-support-matrix:
    cd cli && bun test src/__tests__/catalog/antigravity-support.test.ts src/__tests__/build/antigravity-support-matrix.test.ts

# Check normal-checkout Antigravity bootstrap and run-state contracts
antigravity-smoke-normal:
    cd cli && bun test src/__tests__/agent-tools/workflow-bootstrap/workflow-bootstrap.test.ts

# Check linked-worktree Antigravity root, workRoot, and codeRoot contracts
antigravity-smoke-worktree:
    cd cli && bun test src/__tests__/agent-tools/workflow-bootstrap/workflow-bootstrap.test.ts

# Record normal-checkout, worktree-checkout, and forced artifact-registration evidence artifacts
antigravity-smoke-checkout-evidence:
    cd cli && bun run scripts/record-antigravity-checkout-evidence.ts --feature-id antigravity --run-id "${RUN_ID:-manual}" --scenario all

# Check define_subagent-once, session registry, and cached invoke_subagent reuse
antigravity-smoke-dynamic-delegation:
    cd cli && bun test src/__tests__/build/antigravity-package.test.ts

# Check dynamic fanout recipe coverage and distinguishable delegated outputs
antigravity-smoke-dynamic-fanout:
    cd cli && bun test src/__tests__/build/antigravity-package.test.ts

# Check dynamic delegated failure visibility and successful-unit attribution
antigravity-smoke-dynamic-failure:
    cd cli && bun test src/__tests__/build/antigravity-package.test.ts

# Record reproducible boundary evidence for live Antigravity modes that need interactive confirmation
antigravity-smoke-boundaries: build-antigravity
    cd cli && bun run scripts/record-antigravity-boundary-evidence.ts --feature-id antigravity --run-id "${RUN_ID:-manual}" --scenario all

# Record Antigravity permissions, trust, approval, sandbox, and headless evidence guidance
antigravity-smoke-permissions-trust: build-antigravity
    cd cli && bun run scripts/record-antigravity-boundary-evidence.ts --feature-id antigravity --run-id "${RUN_ID:-manual}" --scenario permissions_trust

# Record Antigravity MCP unavailable or misconfigured evidence guidance
antigravity-smoke-mcp-failure: build-antigravity
    cd cli && bun run scripts/record-antigravity-boundary-evidence.ts --feature-id antigravity --run-id "${RUN_ID:-manual}" --scenario mcp_failure

# Guard existing Claude Code, OpenCode, Codex, and Copilot build/install surfaces
antigravity-regression-existing-harnesses:
    cd cli && bun test src/__tests__/build/command.test.ts src/__tests__/build/templates/template-rendering.test.ts src/__tests__/shared/install-core.test.ts src/__tests__/install/copilot/installer.test.ts

# Prove an existing-harness workflow can still register artifacts and run state without Antigravity setup
antigravity-regression-existing-harness-run-state:
    #!/usr/bin/env bash
    set -euo pipefail
    tmp_dir="$(mktemp -d)"
    cleanup() {
        rm -rf "$tmp_dir"
    }
    trap cleanup EXIT

    project_root="$tmp_dir/project"
    artifact_path="quick-builds/existing-harness-codex-artifact.md"
    mkdir -p "$project_root/.rp1/work/quick-builds"
    printf 'existing-harness-run-state-smoke\n' > "$project_root/.rp1/project_id"
    printf '# Existing harness Codex artifact smoke\n\nHarness: codex\nWorkflow: build-fast\n' > "$project_root/.rp1/work/$artifact_path"

    export RP1_DB="$tmp_dir/rp1.db"
    run_id="$(bun -e 'console.log(crypto.randomUUID())')"
    cd cli
    agent_tools=(bun run src/main.ts agent-tools)

    "${agent_tools[@]}" emit --harness codex --workflow build-fast --type status_change --run-id "$run_id" --step plan --name "Existing harness artifact smoke" --project "$project_root" --data '{"status":"running","feature":"quick-build"}' >/dev/null
    "${agent_tools[@]}" emit --harness codex --workflow build-fast --type status_change --run-id "$run_id" --step build --project "$project_root" --data '{"status":"running","feature":"quick-build"}' >/dev/null
    "${agent_tools[@]}" emit --harness codex --workflow build-fast --type artifact_registered --run-id "$run_id" --step build --project "$project_root" --data "{\"path\":\"$artifact_path\",\"feature\":\"quick-build\",\"storageRoot\":\"work_dir\"}" >/dev/null
    "${agent_tools[@]}" emit --harness codex --workflow build-fast --type status_change --run-id "$run_id" --step review --project "$project_root" --data '{"status":"running","feature":"quick-build"}' >/dev/null
    "${agent_tools[@]}" emit --harness codex --workflow build-fast --type status_change --run-id "$run_id" --step review --project "$project_root" --data '{"status":"completed","feature":"quick-build"}' --close-run >/dev/null

    state_json="$tmp_dir/workflow-state.json"
    "${agent_tools[@]}" workflow-state --run-id "$run_id" --workflow build-fast --feature quick-build --parent-phases plan,build,review --recent-events 10 > "$state_json"
    STATE_JSON="$state_json" ARTIFACT_PATH="$artifact_path" bun -e '
        const envelope = JSON.parse(await Bun.file(process.env.STATE_JSON).text());
        const artifactPath = process.env.ARTIFACT_PATH;
        const fail = (message) => {
            console.error(message);
            process.exit(1);
        };
        if (!envelope.success) fail("workflow-state did not return success");
        const data = envelope.data;
        if (data.run.harness !== "codex") fail(`expected codex harness, got ${data.run.harness}`);
        if (data.run.status !== "completed") fail(`expected completed run, got ${data.run.status}`);
        if (data.run.rp1WorkRoot !== `${data.run.rp1ProjectRoot}/.rp1/work`) fail("run roots do not point at the project work root");
        if (data.artifacts.length !== 1) fail(`expected one artifact, got ${data.artifacts.length}`);
        const artifact = data.artifacts[0];
        if (artifact.path !== artifactPath) fail(`expected artifact path ${artifactPath}, got ${artifact.path}`);
        if (artifact.storageRoot !== "work_dir") fail(`expected work_dir storage root, got ${artifact.storageRoot}`);
        if (artifact.step !== "build") fail(`expected build artifact step, got ${artifact.step}`);
        if (!data.recent_events.some((event) => event.type === "artifact_registered")) fail("artifact_registered event missing from recent workflow state");
        console.log(`Existing-harness artifact/run-state smoke passed: harness=${data.run.harness} workflow=${data.run.flow} status=${data.run.status} artifact=${artifact.path}`);
    '

# ─────────────────────────────────────────────────────────────────────────────
# Code Quality
# ─────────────────────────────────────────────────────────────────────────────

# Lint and type check everything
check: check-cli check-native-app check-web-ui check-evals

# Lint and type check CLI
check-cli:
    cd cli && bun run lint && bun run typecheck && bun run format

# Type check native app
check-native-app:
    cd native-app && bun run typecheck

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
    @#!/usr/bin/env bash
    @set -e
    @if [ "$(uname)" = "Darwin" ]; then \
        config_dir="${HOME}/Library/Application Support/rp1"; \
    else \
        config_dir="${XDG_CONFIG_HOME:-$HOME/.config}/rp1"; \
    fi; \
    restart_marker="${config_dir}/restart-arcade-after-install"; \
    echo ""; \
    echo "━━━ Installing to all platforms ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"; \
    echo ""; \
    ./bin/rp1 install -y; \
    dev_bin="$(pwd -P)/bin/rp1"; \
    shim_dir="${HOME}/.local/bin"; \
    shim_path="${shim_dir}/rp1"; \
    mkdir -p "$shim_dir"; \
    install -m 0755 "$dev_bin" "$shim_path"; \
    if [ ! -x "$shim_path" ]; then \
        echo "Failed to install executable at ${shim_path}"; \
        exit 1; \
    fi; \
    resolved="$(command -v rp1 || true)"; \
    if [ "$resolved" != "$shim_path" ] && [ "$resolved" != "$dev_bin" ]; then \
        echo "WARNING: rp1 currently resolves to ${resolved:-<not found>}, not ${shim_path}."; \
        echo "Put ${shim_dir} before other rp1 locations in PATH for project workflows to use the installed dev binary."; \
    fi; \
    echo ""; \
    echo "Installed local rp1 executable: ${shim_path}"; \
    if [ -f "$restart_marker" ]; then \
        port=$(cat "$restart_marker" 2>/dev/null | tr -d '[:space:]'); \
        if [ -z "$port" ]; then port=7710; fi; \
        echo ""; \
        echo "Restarting Arcade daemon on port ${port}..."; \
        ./bin/rp1 arcade --daemon-only --port "$port" --no-open 2>&1 || echo "Warning: daemon restart failed (port ${port} may be in use)"; \
        rm -f "$restart_marker"; \
    fi

# Run local binary with args
run *args: build
    ./bin/rp1 {{ args }}

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
    rm -rf ~/.config/github-copilot/skills/rp1-*/
    rm -rf ~/.config/github-copilot/agents/rp1*
    rm -rf ~/.gemini/extensions/rp1-*
    rm -rf ~/.gemini/antigravity-cli/rp1-*
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
    fake_dir=".rp1/work/features"
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
    env -u UV_INDEX -u UV_EXTRA_INDEX_URL -u UV_INDEX_URL -u UV_NO_INDEX \
        uvx --no-config --default-index {{PYPI_INDEX}} --with mkdocs-material mkdocs serve --strict --livereload

# ─────────────────────────────────────────────────────────────────────────────
# Evaluations
# ─────────────────────────────────────────────────────────────────────────────

# One-time setup for evals (run after clone)
eval-setup:
    cd evals && bun install --frozen-lockfile

# Directory structure: evals/suites/{plugin}/{suite}/evals.yaml
# Public entrypoint runs inside Docker via rp1-dev. Use eval-run-local only
# from inside the container.
#
# Examples:
#   just eval-run                          # run all suites in Docker (claude harness)
#   just eval-run rp1-dev/build-fast       # run a specific suite in Docker
#   just eval-run --harness=opencode       # run all with opencode in Docker
#   just eval-run --attest --commit        # run all in Docker, then commit on host
#   just eval-run --platform=opencode      # attest for opencode platform
#   just eval-run-local rp1-dev/build-fast # run inside the current environment

# Run eval suites in Docker. Optional: suite path, --harness=opencode, --platform=<platform>, --attest, --commit, --verbose
# Stops the host-side promptfoo view daemon before Docker writes to SQLite, then reloads it after final results are available.
eval-run *args:
    #!/usr/bin/env bash
    just eval-dashboard-stop
    ./docker/eval-run.sh {{ args }}
    eval_exit=$?
    just eval-dashboard-reload
    exit $eval_exit

# Run eval suites in the current environment. Container-only entrypoint for Dockerized evals.
eval-run-local *args:
    #!/usr/bin/env bash
    set -e
    repo_root="$(pwd)"
    export PATH="${repo_root}/bin:$PATH"
    evals_dir="${repo_root}/evals"
    promptfoo_config_dir="${PROMPTFOO_CONFIG_DIR:-${repo_root}/.rp1/tmp/promptfoo}"
    export PROMPTFOO_DISABLE_WAL_MODE="${PROMPTFOO_DISABLE_WAL_MODE:-true}"

    mkdir -p "$promptfoo_config_dir"
    bash "${evals_dir}/scripts/prepare-promptfoo-config.sh" "$promptfoo_config_dir"
    export PROMPTFOO_CONFIG_DIR="$promptfoo_config_dir"

    # Parse flags
    suite=""
    harness="claude"
    platform="claude-code"
    attest=false
    do_commit=false
    passed_suites_file="${RP1_EVAL_PASSED_SUITES_FILE:-}"
    verbose_flag=""
    for arg in {{ args }}; do
        case "$arg" in
            --harness=*) harness="${arg#--harness=}" ;;
            --platform=*) platform="${arg#--platform=}" ;;
            --attest) attest=true ;;
            --commit) do_commit=true ;;
            --verbose) verbose_flag="--verbose" ;;
            *) suite="$arg" ;;
        esac
    done

    if [ -n "$passed_suites_file" ]; then
        : > "$passed_suites_file"
    fi

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
            if [ -n "$passed_suites_file" ]; then
                printf '%s\n' "${output_file}" >> "$passed_suites_file"
            fi
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

    if [ "$do_commit" = "true" ]; then
        echo "--commit is handled by the host eval-run wrapper; skipping in-container commit"
    fi

    if [ "$failed" = "1" ]; then echo "Some evals FAILED"; exit 1; fi
    echo "All evals PASSED"

# Generate attestation from eval output file
eval-attest output-file:
    bun run evals/src/attestation/cli.ts attest-from-output evals/output/{{ output-file }}

# Verify all attestations are current
eval-verify:
    bun run evals/src/attestation/cli.ts verify

# Show commands needing re-attestation
eval-status:
    bun run evals/src/attestation/cli.ts status

# View eval results in browser
eval-view:
    #!/usr/bin/env bash
    set -e
    repo_root="$(pwd)"
    promptfoo_config_dir="${PROMPTFOO_CONFIG_DIR:-${repo_root}/.rp1/tmp/promptfoo}"
    export PROMPTFOO_DISABLE_WAL_MODE="${PROMPTFOO_DISABLE_WAL_MODE:-true}"

    mkdir -p "$promptfoo_config_dir"
    bash "${repo_root}/evals/scripts/prepare-promptfoo-config.sh" "$promptfoo_config_dir"
    export PROMPTFOO_CONFIG_DIR="$promptfoo_config_dir"
    cd evals && bunx promptfoo view -n

# Kill any running promptfoo view server. Used before Dockerized evals so the
# host dashboard does not hold the SQLite DB while the Linux container writes it.
eval-dashboard-stop:
    #!/usr/bin/env bash
    set -e
    pkill -f "promptfoo view" 2>/dev/null || true
    sleep 1

# Kill any running promptfoo view server and start a fresh one so the
# dashboard picks up evals written since the last start. `promptfoo view`
# caches its in-memory result index at startup and does not invalidate on
# new DB writes, so recent evals appear missing until the view is bounced.
eval-dashboard-reload:
    #!/usr/bin/env bash
    set -e
    repo_root="$(pwd)"
    promptfoo_config_dir="${PROMPTFOO_CONFIG_DIR:-${repo_root}/.rp1/tmp/promptfoo}"
    export PROMPTFOO_DISABLE_WAL_MODE="${PROMPTFOO_DISABLE_WAL_MODE:-true}"

    # Kill any existing `promptfoo view` processes (there can be more than one
    # stacked on different ports). pkill returns 1 when nothing matches, which
    # is fine for a reload from a cold state.
    pkill -f "promptfoo view" 2>/dev/null || true
    # Give the port a moment to release.
    sleep 1

    mkdir -p "$promptfoo_config_dir"
    bash "${repo_root}/evals/scripts/prepare-promptfoo-config.sh" "$promptfoo_config_dir"
    export PROMPTFOO_CONFIG_DIR="$promptfoo_config_dir"

    # Start the view server as a detached child process. Plain shell
    # backgrounding leaves promptfoo tied to the launching shell on macOS, so it
    # can disappear as soon as just exits.
    log_file="${promptfoo_config_dir}/logs/dashboard.log"
    mkdir -p "$(dirname "$log_file")"
    PROMPTFOO_DASHBOARD_LOG="$log_file" bun --eval '
    import { spawn } from "node:child_process";
    import { closeSync, openSync } from "node:fs";

    const logFile = process.env.PROMPTFOO_DASHBOARD_LOG;
    if (!logFile) {
        throw new Error("PROMPTFOO_DASHBOARD_LOG is required");
    }

    const logFd = openSync(logFile, "w");
    const child = spawn("bunx", ["promptfoo", "view", "-n"], {
        cwd: "evals",
        detached: true,
        env: process.env,
        stdio: ["ignore", logFd, logFd],
    });
    child.unref();
    closeSync(logFd);
    '

    dashboard_ready=false
    for _ in {1..10}; do
        if lsof -nP -iTCP:15500 -sTCP:LISTEN >/dev/null 2>&1; then
            dashboard_ready=true
            break
        fi
        sleep 1
    done
    if [ "$dashboard_ready" != "true" ]; then
        echo "Dashboard failed to stay running; log: $log_file"
        tail -n 40 "$log_file" 2>/dev/null || true
        exit 0
    fi
    echo "Dashboard restarting; log: $log_file"
    echo "Default URL: http://localhost:15500/"

# ─────────────────────────────────────────────────────────────────────────────
# Catalogue
# ─────────────────────────────────────────────────────────────────────────────

# Generate registry-backed discovery views and the transitional agent catalog
catalog-generate:
    ./scripts/generate-catalog.sh

# Verify approved discovery views and the transitional agent catalog
catalog-check:
    ./scripts/check-catalog.sh

# ─────────────────────────────────────────────────────────────────────────────
# Beta Release
# ─────────────────────────────────────────────────────────────────────────────
# Build and publish a beta release via GoReleaser.

# Usage: just beta-release v0.7.0-beta.1
beta-release version:
    #!/usr/bin/env bash
    set -euo pipefail

    version="{{ version }}"
    repo_root=$(git rev-parse --show-toplevel)
    beta_branch="beta-release"
    original_branch=$(git branch --show-current)
    original_ref=$(git rev-parse HEAD)
    original_short_ref=$(git rev-parse --short HEAD)
    tag_created=false
    tag_pushed=false
    beta_branch_prepared=false

    require_command() {
        local cmd="$1"
        if ! command -v "$cmd" >/dev/null 2>&1; then
            echo "ERROR: Required command not found: $cmd"
            exit 1
        fi
    }

    cleanup() {
        local exit_code="$1"
        set +e

        rm -rf \
            "$repo_root/cli/dist" \
            "$repo_root/cli/web-ui/dist" \
            "$repo_root/cli/src/assets/embedded.ts"

        if [[ "$(git branch --show-current)" == "$beta_branch" ]]; then
            echo ""
            echo "  Switching back to $original_branch"
            if ! git switch "$original_branch" >/dev/null 2>&1; then
                echo "WARNING: Failed to switch back to $original_branch"
            fi
        fi

        if [[ "$tag_created" == true && "$tag_pushed" == false ]]; then
            echo "  Removing local tag $version"
            git tag -d "$version" >/dev/null 2>&1 || true
        fi

        if [[ "$beta_branch_prepared" == true ]] && git show-ref --verify --quiet "refs/heads/$beta_branch"; then
            echo "  Deleting temporary branch $beta_branch"
            git branch -D "$beta_branch" >/dev/null 2>&1 || {
                echo "WARNING: Failed to delete temporary branch $beta_branch"
            }
        fi

        trap - EXIT
        exit "$exit_code"
    }
    trap 'cleanup "$?"' EXIT

    require_command git
    require_command node
    require_command bun

    # 1. Validate version format
    if [[ ! "$version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-beta\.[0-9]+$ ]]; then
        echo "ERROR: Version must match v*.*.*-beta.N (e.g., v0.7.0-beta.1)"
        echo "  Got: $version"
        exit 1
    fi

    if [[ -z "$original_branch" ]]; then
        echo "ERROR: Beta releases must start from a named branch, not detached HEAD"
        exit 1
    fi

    if [[ "$original_branch" == "$beta_branch" ]]; then
        echo "ERROR: Beta releases cannot start from $beta_branch"
        echo "  Switch to your source branch first, then re-run this recipe"
        exit 1
    fi

    if [[ -n "$(git status --short)" ]]; then
        echo "ERROR: Working tree must be clean before starting a beta release"
        echo ""
        git status --short
        exit 1
    fi

    if ! git remote get-url origin >/dev/null 2>&1; then
        echo "ERROR: Git remote 'origin' is not configured"
        exit 1
    fi

    # Tokens are no longer required locally — CI handles the release via
    # the GoReleaser workflow once the tag is pushed.

    # Strip leading 'v' for package.json
    pkg_version="${version#v}"

    echo "━━━ Beta Release: $version ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    echo "  Checking origin connectivity..."
    if ! git ls-remote --exit-code origin HEAD >/dev/null 2>&1; then
        echo "ERROR: Failed to query origin"
        exit 1
    fi

    if git rev-parse -q --verify "refs/tags/$version" >/dev/null 2>&1; then
        echo "ERROR: Tag already exists locally: $version"
        exit 1
    fi

    remote_tag=$(git ls-remote --tags origin "refs/tags/$version" 2>/dev/null || true)
    if [[ -n "$remote_tag" ]]; then
        echo "ERROR: Tag already exists on origin: $version"
        exit 1
    fi

    # 2. Reset and switch to the temporary beta branch
    echo "  Preparing temporary branch $beta_branch at $original_short_ref"
    git switch -C "$beta_branch" "$original_ref" >/dev/null
    beta_branch_prepared=true

    # 3. Save original package.json version and bump
    original_version=$(cd cli && node -p "require('./package.json').version")
    if [[ "$original_version" == "$pkg_version" ]]; then
        echo "ERROR: cli/package.json is already set to $pkg_version"
        echo "  Choose a new beta version before running this recipe"
        exit 1
    fi
    echo "  Bumping cli/package.json: $original_version -> $pkg_version"
    cd cli && node -e "
        const fs = require('fs');
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        pkg.version = '$pkg_version';
        fs.writeFileSync('package.json', JSON.stringify(pkg, null, '\t') + '\n');
    " && cd ..

    # 4. Build release assets (install deps first for clean environments)
    echo ""
    echo "  Building release assets..."
    cd cli && bun install && bun run build:release && cd ..

    # 5. Commit the temporary beta version bump
    echo ""
    git add cli/package.json
    git commit -m "chore: bump version to $pkg_version for beta release"

    beta_commit=$(git rev-parse --short HEAD)

    echo ""
    echo "  WARNING: This will publish a beta from a temporary branch"
    echo "  ─────────────────────────────────────────────────────────"
    echo "  Source branch:      $original_branch"
    echo "  Source commit:      $original_short_ref"
    echo "  Temporary branch:   $beta_branch (will be deleted afterward)"
    echo "  Beta commit:        $beta_commit"
    echo "  Beta tag:           $version"
    echo ""
    echo "  Remote actions after confirmation:"
    echo "    - Push tag $version to origin"
    echo "    - CI will build and publish the beta release via GoReleaser"
    echo ""
    read -r -p "  Continue? [y/N] " confirm
    if [[ ! "$confirm" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo "  Cancelled before pushing beta release"
        exit 1
    fi

    # 6. Create and push git tag
    echo ""
    echo "  Creating git tag: $version"
    git tag -a "$version" -m "Beta release $version"
    tag_created=true
    echo "  Pushing tag to origin..."
    git push origin "refs/tags/$version"
    tag_pushed=true

    echo ""
    echo "━━━ Beta Tag Pushed ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  CI will now build and publish the release."
    echo "  Monitor: https://github.com/rp1-run/rp1/actions"
    echo ""
    echo "  Post-Release Checklist:"
    echo "  ────────────────────────"
    echo "  [ ] Verify install:  brew install rp1-run/tap/rp1-beta"
    echo "  [ ] Verify version:  rp1 --version  (expect $pkg_version)"
    echo "  [ ] Notify testers via GitHub issue or discussion"
    echo ""
    echo "  After promoting to stable:"
    echo "  [ ] Archive or remove the GitHub pre-release for $version"
    echo "  [ ] Reset or remove Casks/rp1-beta.rb in homebrew-tap"
    echo "  [ ] Notify testers that the beta has been promoted to stable"
    echo ""

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
