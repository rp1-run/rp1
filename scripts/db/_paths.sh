#!/usr/bin/env bash
# Sourced helper: resolve rp1 database and project-registry paths.
#
# Sets:
#   db_path        — path to rp1.db (honors $RP1_DB, falls back to ~/.rp1/rp1.db)
#   registry_path  — path to projects.json (Darwin: ~/Library/Application Support/rp1; Linux: $XDG_CONFIG_HOME/rp1)

db_path="${RP1_DB:-$HOME/.rp1/rp1.db}"

if [ "$(uname)" = "Darwin" ]; then
    registry_path="$HOME/Library/Application Support/rp1/projects.json"
else
    registry_path="${XDG_CONFIG_HOME:-$HOME/.config}/rp1/projects.json"
fi
