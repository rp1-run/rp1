#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DRY_RUN=false
VERBOSE=false
BACKUP_DIR="${PROJECT_ROOT}/.rp1/work/features/argument-passing-overhaul/backups"

log_info() {
    echo "[INFO] $*"
}

log_success() {
    echo "[SUCCESS] $*"
}

log_error() {
    echo "[ERROR] $*" >&2
}

log_debug() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[DEBUG] $*"
    fi
}

usage() {
    cat <<EOF
Usage: $0 [OPTIONS] FILE...

Migrate command and agent files to use explicit argument syntax.

OPTIONS:
    -d, --dry-run       Show what would be changed without modifying files
    -v, --verbose       Enable verbose output
    -h, --help          Show this help message

EXAMPLES:
    $0 plugins/dev/commands/feature-requirements.md
    $0 --dry-run plugins/base/agents/*.md
    $0 -v plugins/dev/commands/*.md plugins/dev/agents/*.md

EOF
}

create_backup() {
    local file="$1"
    local backup_file="${BACKUP_DIR}/$(basename "$file").$(date +%Y%m%d_%H%M%S).bak"

    mkdir -p "$BACKUP_DIR"
    cp "$file" "$backup_file"
    log_debug "Created backup: $backup_file"
}

detect_placeholders() {
    local file="$1"
    grep -oP '\{\{[A-Z_]+\}\}' "$file" 2>/dev/null | sort -u || true
}

extract_frontmatter() {
    local file="$1"
    awk '/^---$/{if(++c==2) exit; next} c==1' "$file"
}

extract_body() {
    local file="$1"
    awk '/^---$/{if(++c==2){p=1; next}} p' "$file"
}

add_argument_hint_to_frontmatter() {
    local file="$1"
    local argument_hint="$2"

    log_debug "Adding argument-hint: $argument_hint"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would add argument-hint to $file"
        return
    fi

    local temp_file="${file}.tmp"
    awk -v hint="$argument_hint" '
        /^---$/ {
            if (++count == 1) {
                print
                next
            }
            if (count == 2 && !added) {
                print "argument-hint: \"" hint "\""
                added = 1
            }
        }
        /^description:/ {
            print
            if (!added) {
                print "argument-hint: \"" hint "\""
                added = 1
            }
            next
        }
        { print }
    ' "$file" > "$temp_file"

    mv "$temp_file" "$file"
}

replace_placeholder_with_positional() {
    local file="$1"
    local placeholder="$2"
    local position="$3"

    log_debug "Replacing $placeholder with $position"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would replace $placeholder with $position in $file"
        return
    fi

    sed -i.bak "s/${placeholder}/\${position}/g" "$file"
    rm "${file}.bak"
}

add_position_column_to_table() {
    local file="$1"

    log_debug "Adding Position column to parameter table"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY-RUN] Would add Position column to parameter table in $file"
        return
    fi

    local temp_file="${file}.tmp"
    awk '
        /## 0\. Parameters/ {
            in_params = 1
            print
            next
        }
        in_params && /^\| Name \|/ {
            gsub(/\| Name \|/, "| Name | Position |")
            print
            next
        }
        in_params && /^\|[-:| ]+\|$/ {
            gsub(/\|[-:]+\|/, "|------|----------|")
            print
            next
        }
        in_params && /^\|/ && !/^\|[-:| ]+\|$/ {
            sub(/\|/, "| Position | ")
            sub(/\|/, "| $1 |", 2)
            print
            next
        }
        { print }
        /^##/ && in_params && !/## 0\. Parameters/ {
            in_params = 0
        }
    ' "$file" > "$temp_file"

    mv "$temp_file" "$file"
}

migrate_file() {
    local file="$1"

    log_info "Processing: $file"

    if [[ ! -f "$file" ]]; then
        log_error "File not found: $file"
        return 1
    fi

    create_backup "$file"

    local placeholders
    placeholders=$(detect_placeholders "$file")

    if [[ -z "$placeholders" ]]; then
        log_info "No placeholders found in $file (may already be migrated or use no parameters)"
        return 0
    fi

    log_debug "Found placeholders: $(echo "$placeholders" | tr '\n' ' ')"

    local position=1
    while IFS= read -r placeholder; do
        if [[ "$placeholder" == "{{RP1_ROOT}}" ]] || [[ "$placeholder" == "{{CODEBASE_ROOT}}" ]]; then
            log_debug "Skipping environment variable: $placeholder"
            continue
        fi

        replace_placeholder_with_positional "$file" "$placeholder" "\$$position"
        ((position++))
    done <<< "$placeholders"

    if [[ "$file" == *"/commands/"* ]]; then
        local arg_names
        arg_names=$(echo "$placeholders" | sed 's/{{//g; s/}}//g' | tr '[:upper:]_' '[:lower:]-' | tr '\n' ' ' | sed 's/ $//')
        if [[ -n "$arg_names" ]]; then
            add_argument_hint_to_frontmatter "$file" "[$arg_names]"
        fi
    fi

    if [[ "$file" == *"/agents/"* ]]; then
        add_position_column_to_table "$file"
    fi

    log_success "Migrated: $file"
}

main() {
    local files=()

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -d|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                files+=("$1")
                shift
                ;;
        esac
    done

    if [[ ${#files[@]} -eq 0 ]]; then
        log_error "No files specified"
        usage
        exit 1
    fi

    log_info "Starting migration..."
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "DRY-RUN MODE: No files will be modified"
    fi

    local success_count=0
    local error_count=0

    for file in "${files[@]}"; do
        if migrate_file "$file"; then
            ((success_count++))
        else
            ((error_count++))
        fi
    done

    echo
    log_info "Migration complete:"
    log_info "  Success: $success_count"
    log_info "  Errors: $error_count"

    if [[ $error_count -gt 0 ]]; then
        exit 1
    fi
}

main "$@"
