#!/usr/bin/env bash

set -euo pipefail

config_dir="${1:?promptfoo config directory is required}"
db_path="${config_dir}/promptfoo.db"

mkdir -p "$config_dir"

if [ ! -f "$db_path" ]; then
	exit 0
fi

if ! command -v bun >/dev/null 2>&1; then
	echo "Skipping promptfoo database integrity check because bun is unavailable: ${db_path}" >&2
	exit 0
fi

check_output="$(
	PROMPTFOO_DB_PATH="$db_path" bun --eval '
import { Database } from "bun:sqlite";

const dbPath = process.env.PROMPTFOO_DB_PATH;
if (!dbPath) {
	throw new Error("PROMPTFOO_DB_PATH is required");
}

try {
	const db = new Database(dbPath, { readonly: true });
	try {
		const rows = db.query("PRAGMA quick_check").all();
		const messages = rows
			.map((row) => String(Object.values(row)[0] ?? ""))
			.filter((message) => message.length > 0);
		if (messages.length === 1 && messages[0] === "ok") {
			process.exit(0);
		}
		console.error(messages.join("\n") || "quick_check did not return ok");
		process.exit(1);
	} finally {
		db.close();
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
}
' 2>&1
)" && exit 0

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${config_dir}/corrupt-promptfoo-db-${timestamp}"
backup_suffix=0
while [ -e "$backup_dir" ]; do
	backup_suffix=$((backup_suffix + 1))
	backup_dir="${config_dir}/corrupt-promptfoo-db-${timestamp}-${backup_suffix}"
done

mkdir -p "$backup_dir"
for path in "$db_path" "${db_path}-wal" "${db_path}-shm" "${config_dir}/evalLastWritten"; do
	if [ -e "$path" ]; then
		mv "$path" "${backup_dir}/$(basename "$path")"
	fi
done

echo "Promptfoo database integrity check failed for ${db_path}; moved corrupt state to ${backup_dir}" >&2
echo "$check_output" >&2
