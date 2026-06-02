#!/usr/bin/env bash
# Bundle the readiness assessment React component into a browser-ready JS file.
# React and ReactDOM are provided at runtime via CDN script tags on the page;
# the shim maps those globals into the bundle's module scope.
# Usage: ./scripts/build-readiness.sh
#        just build-readiness
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

npx esbuild "$REPO_ROOT/docs/src/readiness-assessment-entry.jsx" \
  --bundle \
  --format=iife \
  --target=es2020 \
  --jsx=transform \
  --alias:react="$REPO_ROOT/docs/src/react-shim.js" \
  --alias:react-dom="$REPO_ROOT/docs/src/react-shim.js" \
  --charset=utf8 \
  --outfile="$REPO_ROOT/docs/javascripts/readiness-assessment.js"
