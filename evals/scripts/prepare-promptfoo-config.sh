#!/usr/bin/env bash

set -euo pipefail

config_dir="${1:?promptfoo config directory is required}"
db_path="${config_dir}/promptfoo.db"

mkdir -p "$config_dir"

write_check_path="$(mktemp "${config_dir}/.promptfoo-write-check.XXXXXX")" || {
	echo "Promptfoo config directory is not writable: ${config_dir}" >&2
	exit 1
}
rm -f "$write_check_path"

quarantine_promptfoo_state() {
	local reason="$1"
	local timestamp
	local backup_dir
	local backup_suffix

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

	echo "Promptfoo database ${reason}; quarantined state at ${backup_dir}" >&2
	if [ "${RP1_PROMPTFOO_INTEGRITY_DEBUG:-}" = "1" ] && [ -n "${check_output:-}" ]; then
		echo "$check_output" >&2
	fi
}

if [ ! -f "$db_path" ]; then
	if [ -e "${db_path}-wal" ] || [ -e "${db_path}-shm" ] || [ -e "${config_dir}/evalLastWritten" ]; then
		quarantine_promptfoo_state "was missing its main file"
	fi
	exit 0
fi

if ! command -v bun >/dev/null 2>&1; then
	echo "Skipping promptfoo database integrity check because bun is unavailable: ${db_path}" >&2
	exit 0
fi

check_output="$(
	PROMPTFOO_DB_PATH="$db_path" \
	RP1_PROMPTFOO_DISABLE_WAL="${PROMPTFOO_DISABLE_WAL_MODE:-}" \
	bun --eval '
import { Database } from "bun:sqlite";

const dbPath = process.env.PROMPTFOO_DB_PATH;
if (!dbPath) {
	throw new Error("PROMPTFOO_DB_PATH is required");
}

const disableWal = /^(1|true|yes)$/i.test(
	process.env.RP1_PROMPTFOO_DISABLE_WAL ?? "",
);

let db;
let exitCode = 0;
try {
	db = new Database(dbPath, { readonly: !disableWal });
	const rows = db.query("PRAGMA quick_check").all();
	const messages = rows
		.map((row) => String(Object.values(row)[0] ?? ""))
		.filter((message) => message.length > 0);
	if (!(messages.length === 1 && messages[0] === "ok")) {
		throw new Error(messages.join("\n") || "quick_check did not return ok");
	}

	if (disableWal) {
		try {
			db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		} catch {
			// The database may not currently be in WAL mode.
		}
		const mode = db.query("PRAGMA journal_mode=DELETE").get();
		const journalMode = String(mode?.journal_mode ?? "").toLowerCase();
		if (journalMode !== "delete") {
			throw new Error(
				`expected journal_mode=delete, got ${journalMode || "unknown"}`,
			);
		}
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	exitCode = 1;
} finally {
	db?.close();
}

process.exit(exitCode);
' 2>&1
)" && exit 0

quarantine_promptfoo_state "failed integrity check"
