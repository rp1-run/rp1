#!/usr/bin/env bash
# Delete all rows from the local rp1 database (for testing) and remove the
# project registry file.
set -e

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/db/_paths.sh
source "${script_dir}/_paths.sh"

if [ ! -f "$db_path" ]; then
    echo "No database found at $db_path"
    exit 0
fi

for table in runs events artifacts annotations tasks; do
    count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "0")
    sqlite3 "$db_path" "DELETE FROM $table;" 2>/dev/null || true
    echo "Deleted $count rows from $table"
done

if [ -f "$registry_path" ]; then
    rm "$registry_path"
    echo "Deleted project registry at $registry_path"
else
    echo "No project registry found at $registry_path"
fi
