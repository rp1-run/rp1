#!/usr/bin/env bash
# Delete the entire local rp1 database file (for testing), including WAL/SHM sidecars.
set -e

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/db/_paths.sh
source "${script_dir}/_paths.sh"

if [ ! -f "$db_path" ]; then
    echo "No database found at $db_path"
    exit 0
fi
rm -f "$db_path" "${db_path}-wal" "${db_path}-shm"
echo "Removed $db_path (and WAL/SHM files)"
