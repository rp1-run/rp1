#!/usr/bin/env bash
# Delete all fake-prefixed rows from rp1.db (created by `rp1 fake`)
# and remove the matching feature directories from .rp1/work/features/.
set -e

db_path="${RP1_DB:-$HOME/.rp1/rp1.db}"
if [ ! -f "$db_path" ]; then
    echo "No database found at $db_path"
    exit 0
fi

echo "Cleaning fake runs from $db_path ..."
echo ""

# Delete in FK-safe order: annotations -> artifacts -> events -> runs

ann_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM annotations WHERE doc_id IN (SELECT doc_id FROM artifacts WHERE run_id LIKE 'fake-%');")
sqlite3 "$db_path" "DELETE FROM annotations WHERE doc_id IN (SELECT doc_id FROM artifacts WHERE run_id LIKE 'fake-%');"
echo "  annotations: $ann_count rows deleted"

art_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM artifacts WHERE run_id LIKE 'fake-%';")
sqlite3 "$db_path" "DELETE FROM artifacts WHERE run_id LIKE 'fake-%';"
echo "  artifacts:   $art_count rows deleted"

evt_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM events WHERE run_id LIKE 'fake-%';")
sqlite3 "$db_path" "DELETE FROM events WHERE run_id LIKE 'fake-%';"
echo "  events:      $evt_count rows deleted"

run_count=$(sqlite3 "$db_path" "SELECT COUNT(*) FROM runs WHERE id LIKE 'fake-%';")
sqlite3 "$db_path" "DELETE FROM runs WHERE id LIKE 'fake-%';"
echo "  runs:        $run_count rows deleted"

echo ""
total=$((ann_count + art_count + evt_count + run_count))
if [ "$total" -eq 0 ]; then
    echo "No fake runs found in database."
else
    echo "Done. Removed $total total rows."
fi

echo ""
fake_dir=".rp1/work/features"
file_count=0
if [ -d "$fake_dir" ]; then
    for d in "$fake_dir"/fake-*/; do
        [ -d "$d" ] || continue
        rm -rf "$d"
        file_count=$((file_count + 1))
    done
fi
if [ "$file_count" -eq 0 ]; then
    echo "No fake artifact directories found."
else
    echo "Removed $file_count fake feature directories from $fake_dir."
fi
