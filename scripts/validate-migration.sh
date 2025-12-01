#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

COMMANDS_BASE="${PROJECT_ROOT}/plugins/base/commands"
COMMANDS_DEV="${PROJECT_ROOT}/plugins/dev/commands"
AGENTS_BASE="${PROJECT_ROOT}/plugins/base/agents"
AGENTS_DEV="${PROJECT_ROOT}/plugins/dev/agents"
SKILLS_BASE="${PROJECT_ROOT}/plugins/base/skills"

VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0

log_info() {
    echo "[INFO] $*"
}

log_success() {
    echo "[✓] $*"
}

log_error() {
    echo "[✗] $*" >&2
    ((VALIDATION_ERRORS++))
}

log_warning() {
    echo "[!] $*"
    ((VALIDATION_WARNINGS++))
}

check_no_placeholders_in_commands() {
    log_info "Checking for remaining {{PLACEHOLDER}} patterns in commands (excluding {{RP1_ROOT}})..."

    local found_placeholders=false

    for file in "$COMMANDS_BASE"/*.md "$COMMANDS_DEV"/*.md; do
        if [[ ! -f "$file" ]]; then
            continue
        fi

        local placeholders
        placeholders=$(grep -n '{{[A-Z_]\+}}' "$file" 2>/dev/null | grep -v '{{RP1_ROOT}}' | grep -v '{{INTERACTIVE_MODE}}' | grep -v '{{FEATURE_DOCS_DIR}}' | grep -v '{{PROJECT_PATH}}' | grep -v '{{FOCUS_MODE}}' | grep -v '{{MEMORY_BUDGET}}' | grep -v '{{PRIMARY_DOCS}}' | grep -v '{{CODEBASE_ROOT}}' | grep -v '{{MODE}}' | grep -v '{{FILE_DIFFS}}' || true)

        if [[ -n "$placeholders" ]]; then
            log_error "Found unexpected placeholders in $file:"
            echo "$placeholders" | while IFS=: read -r line_num content; do
                echo "  Line $line_num: $content"
            done
            found_placeholders=true
        fi
    done

    if [[ "$found_placeholders" == "false" ]]; then
        log_success "No unexpected {{PLACEHOLDER}} patterns found in commands"
    fi
}

check_no_placeholders_in_agents() {
    log_info "Checking for remaining {{PLACEHOLDER}} patterns in agents (excluding {{RP1_ROOT}})..."

    local found_placeholders=false

    for file in "$AGENTS_BASE"/*.md "$AGENTS_DEV"/*.md; do
        if [[ ! -f "$file" ]]; then
            continue
        fi

        local placeholders
        placeholders=$(grep -n '{{[A-Z_]\+}}' "$file" 2>/dev/null | grep -v '{{RP1_ROOT}}' || true)

        if [[ -n "$placeholders" ]]; then
            log_error "Found placeholders in $file:"
            echo "$placeholders" | while IFS=: read -r line_num content; do
                echo "  Line $line_num: $content"
            done
            found_placeholders=true
        fi
    done

    if [[ "$found_placeholders" == "false" ]]; then
        log_success "No unexpected {{PLACEHOLDER}} patterns found in agents"
    fi
}

check_argument_hints_in_commands() {
    log_info "Checking for argument-hint in commands that use positional parameters..."

    local commands_with_params=0
    local commands_with_hints=0

    for file in "$COMMANDS_BASE"/*.md "$COMMANDS_DEV"/*.md; do
        if [[ ! -f "$file" ]]; then
            continue
        fi

        if grep -q 'subagent_type:' "$file" && (grep -q '\$[0-9]' "$file" || grep -q '\$ARGUMENTS' "$file"); then
            ((commands_with_params++))

            if grep -q '^argument-hint:' "$file"; then
                ((commands_with_hints++))
                log_success "$(basename "$file") has argument-hint"
            else
                log_warning "$(basename "$file") uses positional parameters but has no argument-hint"
            fi
        fi
    done

    log_info "Commands with parameters: $commands_with_params"
    log_info "Commands with argument-hint: $commands_with_hints"

    if [[ $commands_with_params -eq $commands_with_hints ]]; then
        log_success "All commands with parameters have argument-hint"
    fi
}

check_parameter_tables_have_position_column() {
    log_info "Checking for Position column in agent parameter tables..."

    local agents_with_params=0
    local agents_with_position=0

    for file in "$AGENTS_BASE"/*.md "$AGENTS_DEV"/*.md; do
        if [[ ! -f "$file" ]]; then
            continue
        fi

        if grep -q '## 0. Parameters' "$file"; then
            ((agents_with_params++))

            if grep -A 1 '## 0. Parameters' "$file" | grep -q '| Position |'; then
                ((agents_with_position++))
                log_success "$(basename "$file") has Position column"
            else
                log_warning "$(basename "$file") has parameter table but no Position column"
            fi
        fi
    done

    log_info "Agents with parameter tables: $agents_with_params"
    log_info "Agents with Position column: $agents_with_position"

    if [[ $agents_with_params -eq $agents_with_position ]]; then
        log_success "All agent parameter tables have Position column"
    fi
}

check_yaml_frontmatter_syntax() {
    log_info "Checking YAML frontmatter syntax..."

    local yaml_errors=false

    if ! command -v python3 &> /dev/null; then
        log_warning "python3 not found, skipping YAML validation"
        return
    fi

    for file in "$COMMANDS_BASE"/*.md "$COMMANDS_DEV"/*.md "$AGENTS_BASE"/*.md "$AGENTS_DEV"/*.md; do
        if [[ ! -f "$file" ]]; then
            continue
        fi

        local yaml_content
        yaml_content=$(awk '/^---$/{if(++c==2) {exit}; next} c==1' "$file")

        if [[ -n "$yaml_content" ]]; then
            if ! echo "$yaml_content" | python3 -c "import sys, yaml; yaml.safe_load(sys.stdin)" 2>/dev/null; then
                log_error "Invalid YAML frontmatter in $(basename "$file")"
                yaml_errors=true
            fi
        fi
    done

    if [[ "$yaml_errors" == "false" ]]; then
        log_success "All YAML frontmatter is valid"
    fi
}

check_migration_coverage() {
    log_info "Checking migration coverage..."

    local total_commands=0
    local total_agents=0

    for file in "$COMMANDS_BASE"/*.md "$COMMANDS_DEV"/*.md; do
        if [[ -f "$file" ]]; then
            ((total_commands++))
        fi
    done

    for file in "$AGENTS_BASE"/*.md "$AGENTS_DEV"/*.md; do
        if [[ -f "$file" ]]; then
            ((total_agents++))
        fi
    done

    log_info "Total commands: $total_commands"
    log_info "Total agents: $total_agents"
    log_success "Migration scope confirmed"
}

generate_report() {
    echo
    echo "============================================"
    echo "  VALIDATION SUMMARY"
    echo "============================================"
    echo "Errors:   $VALIDATION_ERRORS"
    echo "Warnings: $VALIDATION_WARNINGS"
    echo

    if [[ $VALIDATION_ERRORS -eq 0 ]]; then
        log_success "All validation checks passed!"
        return 0
    else
        log_error "Validation failed with $VALIDATION_ERRORS error(s)"
        return 1
    fi
}

main() {
    log_info "Starting migration validation..."
    echo

    check_no_placeholders_in_commands
    echo

    check_no_placeholders_in_agents
    echo

    check_argument_hints_in_commands
    echo

    check_parameter_tables_have_position_column
    echo

    check_yaml_frontmatter_syntax
    echo

    check_migration_coverage
    echo

    generate_report
}

main "$@"
