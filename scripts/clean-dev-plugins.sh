#!/bin/bash
set -e

# Clean development plugin installations for rp1
# This script removes rp1 development plugin entries from Claude Code configuration

# Plugin IDs to clean (add more as needed)
PLUGIN_IDS=(
  "rp1-base@rp1-local"
  "rp1-dev@rp1-local"
)

SETTINGS_FILE="$HOME/.claude/settings.json"
INSTALLED_PLUGINS_FILE="$HOME/.claude/plugins/installed_plugins.json"

echo "Cleaning rp1 development plugin entries..."
echo ""

# Clean enabledPlugins from settings.json
if [ -f "$SETTINGS_FILE" ]; then
  echo "Setting enabledPlugins to empty object in settings.json..."
  jq 'if .enabledPlugins then .enabledPlugins = {} else . end' \
    "$SETTINGS_FILE" >"$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  echo "✓ Updated $SETTINGS_FILE"
else
  echo "⚠ Warning: $SETTINGS_FILE not found"
fi

echo ""

# Remove each plugin from installed_plugins.json
if [ -f "$INSTALLED_PLUGINS_FILE" ]; then
  for PLUGIN_ID in "${PLUGIN_IDS[@]}"; do
    echo "Removing '$PLUGIN_ID' plugin entry from installed_plugins.json..."
    jq --arg plugin_id "$PLUGIN_ID" 'if .plugins then .plugins |= del(.[$plugin_id]) else . end' \
      "$INSTALLED_PLUGINS_FILE" >"$INSTALLED_PLUGINS_FILE.tmp" && mv "$INSTALLED_PLUGINS_FILE.tmp" "$INSTALLED_PLUGINS_FILE"
    echo "✓ Removed $PLUGIN_ID"
  done
else
  echo "⚠ Warning: $INSTALLED_PLUGINS_FILE not found"
fi

echo ""
echo "✓ Cleanup complete!"
echo ""
echo "You can now reinstall the plugins with:"
echo "  /plugin marketplace add ~/Development/rp1"
for PLUGIN_ID in "${PLUGIN_IDS[@]}"; do
  echo "  /plugin install ${PLUGIN_ID}"
done
echo ""
