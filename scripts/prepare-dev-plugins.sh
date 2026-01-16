#!/bin/bash
set -e

# Prepares dev versions of plugins in a temp marketplace directory
# Creates .dev-marketplace/ with plugin copies that have -dev version suffix

DEV_MARKETPLACE=".dev-marketplace"
PLUGINS=("base" "dev" "utils")

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
  src="plugins/$plugin"
  dest="$DEV_MARKETPLACE/$plugin"

  if [ ! -d "$src" ]; then
    echo "Warning: $src not found, skipping"
    continue
  fi

  # Copy plugin directory
  cp -r "$src" "$dest"

  # Update version in plugin.json
  plugin_json="$dest/.claude-plugin/plugin.json"
  if [ -f "$plugin_json" ]; then
    current_version=$(jq -r '.version' "$plugin_json")
    if [[ "$current_version" != *"-dev"* ]]; then
      jq --arg v "${current_version}-dev" '.version = $v' "$plugin_json" > "$plugin_json.tmp" \
        && mv "$plugin_json.tmp" "$plugin_json"
      echo "✓ $plugin: $current_version → ${current_version}-dev"
    fi
  fi
done

echo ""
echo "Dev marketplace ready at $DEV_MARKETPLACE/"
