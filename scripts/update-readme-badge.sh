#!/bin/bash

# Update README.md badge for a specific plugin
# Usage: ./update-readme-badge.sh <plugin-name> <version>
# Example: ./update-readme-badge.sh base 2.1.0

set -e

PLUGIN=$1
VERSION=$2

if [ -z "$PLUGIN" ] || [ -z "$VERSION" ]; then
  echo "Usage: $0 <plugin-name> <version>"
  echo "Example: $0 base 2.1.0"
  exit 1
fi

README_FILE="README.md"

if [ ! -f "$README_FILE" ]; then
  echo "Error: $README_FILE not found"
  exit 1
fi

# Update the badge for the specific plugin
# Pattern matches: [![rp1-base](https://img.shields.io/badge/rp1--base-vX.X.X-blue.svg)]
# or: [![rp1-dev](https://img.shields.io/badge/rp1--dev-vX.X.X-blue.svg)]

# Use perl for cross-platform compatibility with regex
perl -i -pe "s|\Q[![rp1-${PLUGIN}](https://img.shields.io/badge/rp1--${PLUGIN}-v\E[0-9]+\.[0-9]+\.[0-9]+\Q-blue.svg)]\E|[![rp1-${PLUGIN}](https://img.shields.io/badge/rp1--${PLUGIN}-v${VERSION}-blue.svg)]|g" "$README_FILE"

echo "✅ Updated $README_FILE badge for rp1-${PLUGIN} to v${VERSION}"
