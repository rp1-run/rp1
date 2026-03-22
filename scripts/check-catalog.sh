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
    echo "ERROR: Catalogue files missing. Run 'just generate-catalog' to create them."
    exit 1
fi

# Check every skill SKILL.md checksum against what's in the catalogue
for plugin_dir in "$PLUGINS_DIR"/*/; do
    plugin=$(basename "$plugin_dir")
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
            catalog_checksum=$(grep -A 10 "name: ${skill_id}$" "$CATALOG_DIR/skills.yaml" | grep "last_checksum:" | head -1 | awk '{print $2}' || echo "")

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
            catalog_checksum=$(grep -A 10 "name: ${agent_id}$" "$CATALOG_DIR/agents.yaml" | grep "last_checksum:" | head -1 | awk '{print $2}' || echo "")

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
    echo "ERROR: Catalogue is out of date ($errors issues). Run 'just generate-catalog' and commit the changes."
    exit 1
fi

echo "Catalogue is up to date."
