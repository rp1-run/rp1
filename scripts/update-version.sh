#!/bin/bash
set -e

# Script to update plugin.json with new version
# Usage: ./update-version.sh <plugin.json> <version>
#    or: ./update-version.sh <version>  (defaults to plugins/base/.claude-plugin/plugin.json)
#
# NOTE: README badge updates are handled separately by update-readme-badge.sh
#       to maintain single responsibility and avoid duplicate operations.

if [ -z "$1" ]; then
  echo "Error: At least version argument required"
  echo "Usage: $0 <plugin.json> <version>"
  echo "   or: $0 <version>  (defaults to plugins/base/.claude-plugin/plugin.json)"
  exit 1
fi

# Determine if we have 1 or 2 arguments
if [ -z "$2" ]; then
  # Single argument: version only, use default plugin.json
  NEW_VERSION="$1"
  PLUGIN_JSON="plugins/base/.claude-plugin/plugin.json"
else
  # Two arguments: plugin.json path and version
  PLUGIN_JSON="$1"
  NEW_VERSION="$2"
fi

if [ ! -f "$PLUGIN_JSON" ]; then
  echo "Error: $PLUGIN_JSON not found"
  exit 1
fi

echo "Updating $PLUGIN_JSON to version $NEW_VERSION"

jq --arg version "$NEW_VERSION" '.version = $version' "$PLUGIN_JSON" > plugin.json.tmp
mv plugin.json.tmp "$PLUGIN_JSON"

echo "✓ Successfully updated plugin.json to $NEW_VERSION"

cat "$PLUGIN_JSON"
