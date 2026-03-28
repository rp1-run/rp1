#!/usr/bin/env bash
# check-catalog.sh — Verify catalog/skills.yaml and catalog/agents.yaml are up-to-date.
# Compares checksums of plugin source files against the catalogue.
# Exit 0 if current, exit 1 if stale.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGINS_DIR="$REPO_ROOT/plugins"
CATALOG_DIR="$REPO_ROOT/catalog"

errors=0

if [ ! -f "$CATALOG_DIR/skills.yaml" ] || [ ! -f "$CATALOG_DIR/agents.yaml" ]; then
    echo "ERROR: Catalogue files missing. Run 'just catalog-generate' to create them."
    exit 1
fi

# Extract the last_checksum for a given entry name from a YAML file.
# Uses awk to find the exact "- name: ID" line and then the next last_checksum.
get_checksum() {
    local name="$1" file="$2"
    awk -v id="$name" '
        /^  - name: / { found = ($NF == id) }
        found && /last_checksum:/ { print $2; exit }
    ' "$file"
}

# Only check distributable plugins (utils is internal-only, matching generate-catalog.sh)
DIST_PLUGINS=("base" "dev")

for plugin in "${DIST_PLUGINS[@]}"; do
    plugin_dir="$PLUGINS_DIR/$plugin"
    [ -d "$plugin_dir" ] || continue
    prefix="rp1-${plugin}"

    # Skills
    if [ -d "$plugin_dir/skills" ]; then
        for skill_dir in "$plugin_dir"/skills/*/; do
            [ -d "$skill_dir" ] || continue
            skill_file="$skill_dir/SKILL.md"
            [ -f "$skill_file" ] || continue
            skill_name=$(basename "$skill_dir")
            skill_id="${prefix}:${skill_name}"

            current_checksum=$(shasum -a 256 "$skill_file" | cut -d' ' -f1)
            catalog_checksum=$(get_checksum "$skill_id" "$CATALOG_DIR/skills.yaml")

            if [ -z "$catalog_checksum" ]; then
                echo "MISSING: Skill $skill_id not in catalogue"
                errors=$((errors + 1))
            elif [ "$current_checksum" != "$catalog_checksum" ]; then
                echo "STALE:   Skill $skill_id checksum mismatch"
                errors=$((errors + 1))
            fi
        done
    fi

    # Agents
    if [ -d "$plugin_dir/agents" ]; then
        for agent_file in "$plugin_dir"/agents/*.md; do
            [ -f "$agent_file" ] || continue
            agent_name=$(basename "$agent_file" .md)
            agent_id="${prefix}:${agent_name}"

            current_checksum=$(shasum -a 256 "$agent_file" | cut -d' ' -f1)
            catalog_checksum=$(get_checksum "$agent_id" "$CATALOG_DIR/agents.yaml")

            if [ -z "$catalog_checksum" ]; then
                echo "MISSING: Agent $agent_id not in catalogue"
                errors=$((errors + 1))
            elif [ "$current_checksum" != "$catalog_checksum" ]; then
                echo "STALE:   Agent $agent_id checksum mismatch"
                errors=$((errors + 1))
            fi
        done
    fi
done

if [ "$errors" -gt 0 ]; then
    echo ""
    echo "ERROR: Catalogue is out of date ($errors issues). Run 'just catalog-generate' and commit the changes."
    exit 1
fi

echo "Catalogue is up to date."
