import Database from "bun:sqlite";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { normalizeProjectKey } from "../../shared/directory-resolution.js";
import { hasLegacyWorkArtifacts } from "./legacy-work.js";

export interface PendingMigration {
	readonly needsMigration: boolean;
	readonly reasons: readonly string[];
}

export interface PendingDetectionOptions {
	readonly homeDir?: string;
	readonly dbPath?: string;
}

export const buildMigrationHint = (
	reasons: readonly string[],
): string | undefined =>
	reasons.length > 0
		? `Legacy rp1 artifacts detected (${reasons.join(", ")}). Run /rp1-base:rp1-migrate to migrate safely.`
		: undefined;

const hasUnlinkedRows = (projectRoot: string, dbPath: string): boolean => {
	if (!existsSync(dbPath)) return false;
	let db: Database | undefined;
	try {
		db = new Database(dbPath, { readonly: true, create: false });
		db.exec("PRAGMA busy_timeout = 0");
		const root = resolve(projectRoot);
		let realRoot = root;
		try {
			realRoot = realpathSync(root);
		} catch {}
		const paths = [root, realRoot];
		const columns = (table: string): Set<string> =>
			new Set(
				(
					db?.query(`PRAGMA table_info(${table})`).all() as Array<{
						name: string;
					}>
				).map((row) => row.name),
			);
		const runs = columns("runs");
		const runPaths = ["project_path", "rp1_project_root"].filter((column) =>
			runs.has(column),
		);
		if (runPaths.length > 0) {
			const projectCondition = runs.has("project_id")
				? "project_id IS NULL AND "
				: "";
			const condition = runPaths
				.map((column) => `${column} IN (?,?)`)
				.join(" OR ");
			if (
				db
					.query(
						`SELECT 1 FROM runs WHERE ${projectCondition}(${condition}) LIMIT 1`,
					)
					.get(...runPaths.flatMap(() => paths))
			)
				return true;
		}
		const artifacts = columns("artifacts");
		if (artifacts.has("project_path")) {
			const projectCondition = artifacts.has("project_id")
				? "project_id IS NULL AND "
				: "";
			if (
				db
					.query(
						`SELECT 1 FROM artifacts WHERE ${projectCondition}project_path IN (?,?) LIMIT 1`,
					)
					.get(...paths)
			)
				return true;
		}
	} catch {
		return false;
	} finally {
		db?.close();
	}
	return false;
};

export const detectPendingMigration = (
	projectRoot: string,
	options: PendingDetectionOptions = {},
): PendingMigration => {
	const root = resolve(projectRoot);
	const home = options.homeDir ?? homedir();
	const reasons: string[] = [];
	const legacyPath = join(home, ".rp1", "work", normalizeProjectKey(root));
	if (existsSync(legacyPath) && hasLegacyWorkArtifacts(legacyPath))
		reasons.push("legacy work directory");
	if (
		existsSync(join(root, ".rp1")) &&
		!existsSync(join(root, ".rp1", "project_id"))
	)
		reasons.push("missing project_id");
	const dbPath =
		options.dbPath ?? process.env.RP1_DB ?? join(home, ".rp1", "rp1.db");
	if (hasUnlinkedRows(root, dbPath)) reasons.push("unlinked database rows");
	return { needsMigration: reasons.length > 0, reasons };
};
