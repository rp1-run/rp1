#!/usr/bin/env bash
# Run eval suites in the current environment. Container-only entrypoint for
# Dockerized evals (called from the rp1-dev container, not the host).
#
# Usage: scripts/evals/run-local.sh [suite ...] [--harness=...] [--platform=...] [--attest] [--commit] [--verbose]
set -e

repo_root="$(pwd)"
export PATH="${repo_root}/bin:$PATH"
evals_dir="${repo_root}/evals"
promptfoo_config_dir="${PROMPTFOO_CONFIG_DIR:-${repo_root}/.rp1/tmp/promptfoo}"
export PROMPTFOO_DISABLE_WAL_MODE="${PROMPTFOO_DISABLE_WAL_MODE:-true}"

mkdir -p "$promptfoo_config_dir"
bash "${evals_dir}/scripts/prepare-promptfoo-config.sh" "$promptfoo_config_dir"
export PROMPTFOO_CONFIG_DIR="$promptfoo_config_dir"

suites=()
harness="claude"
platform="claude-code"
attest=false
do_commit=false
passed_suites_file="${RP1_EVAL_PASSED_SUITES_FILE:-}"
verbose_flag=""
for arg in "$@"; do
    case "$arg" in
        --harness=*) harness="${arg#--harness=}" ;;
        --platform=*) platform="${arg#--platform=}" ;;
        --attest) attest=true ;;
        --commit) do_commit=true ;;
        --verbose) verbose_flag="--verbose" ;;
        *) suites+=("$arg") ;;
    esac
done

if [ -n "$passed_suites_file" ]; then
    : > "$passed_suites_file"
fi

if [ "${#suites[@]}" -gt 0 ]; then
    configs_list=""
    for suite in "${suites[@]}"; do
        config_file="${evals_dir}/suites/${suite}/evals.yaml"
        if [ ! -f "$config_file" ]; then
            echo "Error: Suite not found: $config_file"
            exit 1
        fi
        configs_list="${configs_list}${config_file}"$'\n'
    done
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
