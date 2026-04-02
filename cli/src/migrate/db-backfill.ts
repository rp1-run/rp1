import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface DbBackfillResult {
	readonly runsUpdated: number;
	readonly artifactsUpdated: number;
	readonly tasksUpdated: number;
}

export const backfillProjectId = (
	projectRoot: string,
	projectId: string,
): DbBackfillResult => {
	const dbPath = process.env.RP1_DB ?? join(homedir(), ".rp1", "rp1.db");

	if (!existsSync(dbPath)) {
		return { runsUpdated: 0, artifactsUpdated: 0, tasksUpdated: 0 };
	}

	// Use dynamic import-style require for bun:sqlite to avoid issues
	// in non-database contexts. Open a separate connection for migration.
	const { Database } = require("bun:sqlite");
	const db = new Database(dbPath);
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA busy_timeout = 5000");

	const resolvedRoot = resolve(projectRoot);

	try {
		// Ensure project_id column exists in each table before updating.
		// Older database versions (schema < 9) may not have this column yet.
		const ensureProjectIdColumn = (table: string) => {
			const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
				name: string;
			}[];
			if (!cols.some((c) => c.name === "project_id")) {
				db.exec(`ALTER TABLE ${table} ADD COLUMN project_id TEXT DEFAULT NULL`);
			}
		};

		ensureProjectIdColumn("runs");
		ensureProjectIdColumn("artifacts");
		ensureProjectIdColumn("tasks");

		// rp1_project_root may not exist in very old DBs (added in schema v7).
		// Fall back to project_path if rp1_project_root is missing.
		const runCols = db.prepare("PRAGMA table_info(runs)").all() as {
			name: string;
		}[];
		const hasRp1ProjectRoot = runCols.some(
			(c) => c.name === "rp1_project_root",
		);
		const runsWhereCol = hasRp1ProjectRoot
			? "rp1_project_root"
			: "project_path";

		const runsResult = db
			.prepare(
				`UPDATE runs SET project_id = $projectId
			 WHERE project_id IS NULL
			   AND ${runsWhereCol} = $projectRoot`,
			)
			.run({
				$projectId: projectId,
				$projectRoot: resolvedRoot,
			});

		const artifactsResult = db
			.prepare(
				`UPDATE artifacts SET project_id = $projectId
			 WHERE project_id IS NULL
			   AND project_path = $projectPath`,
			)
			.run({
				$projectId: projectId,
				$projectPath: resolvedRoot,
			});

		const tasksResult = db
			.prepare(
				`UPDATE tasks SET project_id = $projectId
			 WHERE project_id IS NULL
			   AND project_path = $projectPath`,
			)
			.run({
				$projectId: projectId,
				$projectPath: resolvedRoot,
			});

		return {
			runsUpdated: runsResult.changes,
			artifactsUpdated: artifactsResult.changes,
			tasksUpdated: tasksResult.changes,
		};
	} finally {
		db.close();
	}
};
