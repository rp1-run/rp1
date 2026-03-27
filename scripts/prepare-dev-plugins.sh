#!/bin/bash
set -e

# Prepares dev versions of plugins in a temp marketplace directory
# Uses built CC artifacts from cli/dist/claude-code/ when available,
# falls back to raw source plugins if not built yet.
#
# Note: utils is an internal-only plugin excluded from the default build.
# This script builds it explicitly for local dev installs.

DEV_MARKETPLACE=".dev-marketplace"
CC_DIST="cli/dist/claude-code"
PLUGINS=("base" "dev" "utils")

# Build utils explicitly for all platforms since it's excluded from the default build
for build_script in build-claude-code.ts build-opencode.ts build-codex.ts; do
    platform_dist="cli/dist/$(echo "$build_script" | sed 's/build-//' | sed 's/\.ts//')"
    if [ ! -d "$platform_dist/utils" ] || [ -z "$(ls -A "$platform_dist/utils" 2>/dev/null)" ]; then
        echo "Building utils plugin for $(echo "$build_script" | sed 's/build-//' | sed 's/\.ts//')..."
        cd cli && bun run "scripts/$build_script" --plugin utils > /dev/null 2>&1 && cd ..
    fi
done

# Clean and create dev marketplace directory
rm -rf "$DEV_MARKETPLACE"
mkdir -p "$DEV_MARKETPLACE/.claude-plugin"

# Copy marketplace config
cp local-marketplace/.claude-plugin/marketplace.json "$DEV_MARKETPLACE/.claude-plugin/marketplace.json"

# Update marketplace to point to dev plugin copies (paths relative to marketplace root)
jq '.plugins = [.plugins[] | .source = "./" + (.name | sub("^rp1-"; "")) + "/"]' \
  "$DEV_MARKETPLACE/.claude-plugin/marketplace.json" > "$DEV_MARKETPLACE/.claude-plugin/marketplace.json.tmp" \
  && mv "$DEV_MARKETPLACE/.claude-plugin/marketplace.json.tmp" "$DEV_MARKETPLACE/.claude-plugin/marketplace.json"

# Copy each plugin and add -dev suffix to version
for plugin in "${PLUGINS[@]}"; do
  dest="$DEV_MARKETPLACE/$plugin"

  if [ -d "$CC_DIST/$plugin" ]; then
    # Use built CC artifacts (includes .claude-plugin/, hooks/, agents/, skills/)
    src="$CC_DIST/$plugin"
    cp -r "$src" "$dest"
    echo "✓ $plugin: using built artifacts from $CC_DIST/$plugin"
  elif [ -d "plugins/$plugin" ]; then
    # Fall back to raw source
    src="plugins/$plugin"
    cp -r "$src" "$dest"
    echo "⚠ $plugin: using raw source (run 'just build-claude-code' first for built artifacts)"
  else
    echo "Warning: $plugin not found, skipping"
    continue
  fi

  # Update version in plugin.json
  plugin_json="$dest/.claude-plugin/plugin.json"
  if [ -f "$plugin_json" ]; then
    current_version=$(jq -r '.version' "$plugin_json")
    if [[ "$current_version" != *"-dev"* ]]; then
      jq --arg v "${current_version}-dev" '.version = $v' "$plugin_json" > "$plugin_json.tmp" \
        && mv "$plugin_json.tmp" "$plugin_json"
      echo "  version: $current_version → ${current_version}-dev"
    fi
  fi
done

echo ""
echo "Dev marketplace ready at $DEV_MARKETPLACE/"
